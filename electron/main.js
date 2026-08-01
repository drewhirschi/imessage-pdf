// Electron main process.
//
// Responsibilities:
//   1. Boot the Next.js standalone server as a child process (serverManager).
//   2. Open a BrowserWindow pointed at it.
//   3. Handle the small IPC surface the renderer needs: open-external,
//      relaunch, export-pdf (hidden window + printToPDF + native save dialog).
//
// This shell is ADDITIVE — the web app still runs under `pnpm dev` unchanged.

const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const { startServer } = require('./serverManager');
const {
  mapPrintOptions,
  buildPrintUrl,
  suggestedPdfFilename,
} = require('./lib/printOptions');

// Resolve where the standalone build lives.
//   - dev (electron:dev):   <repo>/.next/standalone/server.js
//   - packaged:             <resources>/app/.next/standalone/server.js
function resolveServerEntry() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app', '.next', 'standalone', 'server.js');
  }
  return path.join(__dirname, '..', '.next', 'standalone', 'server.js');
}

let serverHandle = null;
let mainWindow = null;

function log(line) {
  // Surfaced in the terminal for dev; harmless in packaged builds.
  console.log(line);
}

async function ensureServer() {
  if (serverHandle) return serverHandle;
  serverHandle = await startServer({
    serverEntry: resolveServerEntry(),
    resourcesPath: app.isPackaged ? process.resourcesPath : undefined,
    onLog: log,
  });
  return serverHandle;
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 720,
    minHeight: 600,
    title: 'iMessage PDF Exporter',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Containment: message links must open in the system browser, never as a
  // new window (or navigation) inside the app hosting remote content.
  attachNavigationGuards(mainWindow, url);

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL(url);

  // Optional non-interactive smoke check (ELECTRON_SMOKE=1): once the page has
  // loaded, read its <title> to confirm the renderer reached the app, log it,
  // then quit. Used to verify the shell on headless CI where a GPU window can't
  // be shown. No effect on normal launches.
  if (process.env.ELECTRON_SMOKE === '1') {
    mainWindow.webContents.on('did-finish-load', async () => {
      try {
        const title = await mainWindow.webContents.executeJavaScript(
          'document.title',
          true,
        );
        const hasRoot = await mainWindow.webContents.executeJavaScript(
          '!!document.querySelector("body") && document.body.innerText.length > 0',
          true,
        );
        log(`[smoke] loaded ${url} title=${JSON.stringify(title)} hasContent=${hasRoot}`);
      } catch (err) {
        log(`[smoke] executeJavaScript failed: ${err}`);
      } finally {
        app.quit();
      }
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  return mainWindow;
}

// Schemes the renderer may hand to the OS: web links plus the macOS
// System Settings deep link the Full Disk Access screen uses.
const EXTERNAL_URL_ALLOWED = /^(https?:|x-apple\.systempreferences:)/i;

function attachNavigationGuards(win, appOrigin) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL_URL_ALLOWED.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(appOrigin)) {
      event.preventDefault();
      if (EXTERNAL_URL_ALLOWED.test(url)) shell.openExternal(url);
    }
  });
}

// --- IPC: minimal surface -------------------------------------------------

ipcMain.handle('open-external', async (_event, url) => {
  if (typeof url !== 'string' || !EXTERNAL_URL_ALLOWED.test(url)) {
    return { ok: false };
  }
  await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle('show-app-in-finder', async () => {
  const appPath = app.isPackaged
    ? path.resolve(process.execPath, '..', '..', '..')
    : process.execPath;
  shell.showItemInFolder(appPath);
  return { ok: true };
});

ipcMain.handle('relaunch', async () => {
  // app.exit() skips before-quit, so stop the server child explicitly or
  // every FDA grant-and-relaunch leaks a running Next server.
  if (serverHandle) {
    serverHandle.stop();
    serverHandle = null;
  }
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('export-pdf', async (event, body) => {
  const sendProgress = (progress) => {
    if (!event.sender.isDestroyed()) event.sender.send('pdf-progress', progress);
  };
  sendProgress({ percent: 2, stage: 'Starting export', detail: 'Opening the print renderer…' });
  if (!serverHandle) {
    sendProgress({ percent: 0, stage: 'Export failed', detail: 'The local server is not ready.', error: true });
    return { error: 'Server not ready' };
  }
  const chatId = Number(body?.chatId);
  if (!Number.isFinite(chatId)) {
    return { error: 'chatId required' };
  }

  const printUrl = buildPrintUrl(serverHandle.url, { ...body, chatId });

  // Hidden window that loads the same print route puppeteer used.
  const printWin = new BrowserWindow({
    show: false,
    width: Math.max((body.columnWidthPx ?? 430) + 40, 800),
    height: 1200,
    webPreferences: {
      // The print route is same-origin app content; keep it locked down.
      offscreen: false,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: true,
    },
  });
  attachNavigationGuards(printWin, serverHandle.url);

  try {
    sendProgress({ percent: 8, stage: 'Loading conversation', detail: 'Reading messages from the local database…' });
    await printWin.loadURL(printUrl);

    // Wait until the print page signals it has mounted all messages, then wait
    // for every <img> to finish (attachments are lazy-loaded). Mirrors the
    // puppeteer readiness checks in app/api/generate-pdf/route.ts.
    await waitForPrintReady(printWin.webContents, sendProgress);

    const scrollHeight = await printWin.webContents.executeJavaScript(
      'document.documentElement.scrollHeight',
      true,
    );
    const pageEstimate = estimatePageCount(scrollHeight, body);
    sendProgress({
      percent: 84,
      stage: 'Paginating book',
      detail: `The finished PDF will be approximately ${pageEstimate.toLocaleString()} pages.`,
      pageEstimate,
    });

    const options = mapPrintOptions(body);
    sendProgress({ percent: 88, stage: 'Rendering PDF', detail: 'Chromium is laying out and drawing every page…', pageEstimate });
    const pdfData = await printWin.webContents.printToPDF(options);

    sendProgress({ percent: 96, stage: 'Ready to save', detail: 'Choose where to save the completed PDF.', pageEstimate });
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save conversation PDF',
      defaultPath: suggestedPdfFilename(body.chatId),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });

    if (canceled || !filePath) {
      sendProgress({ percent: 0, stage: 'Export canceled', detail: 'No PDF was saved.' });
      return { canceled: true };
    }

    await fs.promises.writeFile(filePath, pdfData);
    sendProgress({ percent: 100, stage: 'Export complete', detail: `Saved the PDF (approximately ${pageEstimate.toLocaleString()} pages).`, pageEstimate });
    return { filePath };
  } catch (err) {
    log(`[export-pdf] error: ${err && err.stack ? err.stack : String(err)}`);
    sendProgress({ percent: 0, stage: 'Export failed', detail: String((err && err.message) || err), error: true });
    return { error: String((err && err.message) || err) };
  } finally {
    if (!printWin.isDestroyed()) printWin.destroy();
  }
});

// Drive the same readiness protocol as the puppeteer route: wait for
// data-print-ready, scroll to trigger lazy image observers, then wait for all
// <img>s to settle.
async function waitForPrintReady(webContents, onProgress = () => {}, timeoutMs = 900000) {
  const deadline = Date.now() + timeoutMs;

  let printReady = false;
  while (Date.now() < deadline) {
    const state = await webContents.executeJavaScript(
      `({
        ready: document.documentElement.getAttribute('data-print-ready') === '1',
        loaded: Number(document.documentElement.getAttribute('data-export-loaded') || 0),
        total: Number(document.documentElement.getAttribute('data-export-total') || 0),
        error: document.documentElement.getAttribute('data-export-error')
      })`,
      true,
    );
    if (state.error) throw new Error(state.error);
    const ratio = state.total > 0 ? Math.min(1, state.loaded / state.total) : 0;
    onProgress({
      percent: Math.round(10 + ratio * 20),
      stage: 'Loading messages',
      detail: state.total > 0
        ? `${state.loaded.toLocaleString()} of ${state.total.toLocaleString()} messages loaded`
        : 'Reading conversation pages…',
    });
    if (state.ready) {
      printReady = true;
      break;
    }
    await delay(250);
  }
  if (!printReady) throw new Error('Timed out loading messages for print');

  // Scroll through so IntersectionObserver-based lazy media mounts.
  const dimensions = await webContents.executeJavaScript(
    `({ height: document.documentElement.scrollHeight, viewport: window.innerHeight })`,
    true,
  );
  const step = Math.max(400, Math.floor(dimensions.viewport * 0.8));
  for (let y = 0; y < dimensions.height; y += step) {
    await webContents.executeJavaScript(`window.scrollTo(0, ${y})`, true);
    await delay(100);
    const ratio = Math.min(1, y / Math.max(1, dimensions.height));
    onProgress({
      percent: Math.round(30 + ratio * 35),
      stage: 'Preparing media',
      detail: 'Loading and converting images throughout the conversation…',
    });
  }
  await webContents.executeJavaScript('window.scrollTo(0, document.documentElement.scrollHeight)', true);
  await delay(250);

  let mediaReady = false;
  while (Date.now() < deadline) {
    const media = await webContents.executeJavaScript(
      `(() => {
         const imgs = Array.from(document.querySelectorAll('img'));
         const complete = imgs.filter((img) => img.complete).length;
         return { total: imgs.length, complete };
       })()`,
      true,
    );
    const ratio = media.total > 0 ? media.complete / media.total : 1;
    onProgress({
      percent: Math.round(65 + ratio * 17),
      stage: 'Finishing media',
      detail: media.total > 0
        ? `${media.complete.toLocaleString()} of ${media.total.toLocaleString()} images prepared`
        : 'No images need preparation.',
    });
    if (media.complete >= media.total) {
      mediaReady = true;
      break;
    }
    await delay(250);
  }
  if (!mediaReady) throw new Error('Timed out preparing images for print');
  await webContents.executeJavaScript('window.scrollTo(0, 0)', true);
}

function estimatePageCount(scrollHeight, body) {
  const heights = { A5: 8.27, Letter: 11, Legal: 14, A4: 11.69, Tabloid: 17 };
  const pageHeightIn = body.pageSize === 'Custom'
    ? Number(body.customHeightIn) || 8.27
    : heights[body.pageSize] || 8.27;
  const margin = Number(body.marginIn ?? 0.5);
  const printablePixels = Math.max(96, (pageHeightIn - margin * 2) * 96);
  return Math.max(1, Math.ceil(Number(scrollHeight) / printablePixels));
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- App lifecycle --------------------------------------------------------

async function bootstrap() {
  try {
    const handle = await ensureServer();
    log(`[main] server ready at ${handle.url}`);
    createWindow(handle.url);
  } catch (err) {
    log(`[main] failed to start server: ${err && err.stack ? err.stack : err}`);
    dialog.showErrorBox(
      'Failed to start',
      `The local server did not start.\n\n${String((err && err.message) || err)}`,
    );
    app.quit();
  }
}

// Single-instance: focus the existing window instead of a second server.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(buildMenu());
    bootstrap();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && serverHandle) {
        createWindow(serverHandle.url);
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverHandle) serverHandle.stop();
});

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [{ role: 'appMenu' }]
      : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  return Menu.buildFromTemplate(template);
}
