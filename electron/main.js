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

// --- IPC: minimal surface -------------------------------------------------

ipcMain.handle('open-external', async (_event, url) => {
  if (typeof url !== 'string') return { ok: false };
  await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle('relaunch', async () => {
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('export-pdf', async (_event, body) => {
  if (!serverHandle) {
    return { error: 'Server not ready' };
  }
  if (!body || body.chatId == null) {
    return { error: 'chatId required' };
  }

  const printUrl = buildPrintUrl(serverHandle.url, body);

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

  try {
    await printWin.loadURL(printUrl);

    // Wait until the print page signals it has mounted all messages, then wait
    // for every <img> to finish (attachments are lazy-loaded). Mirrors the
    // puppeteer readiness checks in app/api/generate-pdf/route.ts.
    await waitForPrintReady(printWin.webContents);

    const options = mapPrintOptions(body);
    const pdfData = await printWin.webContents.printToPDF(options);

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save conversation PDF',
      defaultPath: suggestedPdfFilename(body.chatId),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });

    if (canceled || !filePath) {
      return { canceled: true };
    }

    await fs.promises.writeFile(filePath, pdfData);
    return { filePath };
  } catch (err) {
    log(`[export-pdf] error: ${err && err.stack ? err.stack : String(err)}`);
    return { error: String((err && err.message) || err) };
  } finally {
    if (!printWin.isDestroyed()) printWin.destroy();
  }
});

// Drive the same readiness protocol as the puppeteer route: wait for
// data-print-ready, scroll to trigger lazy image observers, then wait for all
// <img>s to settle.
async function waitForPrintReady(webContents, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;

  const poll = async (expr) => {
    while (Date.now() < deadline) {
      const ok = await webContents.executeJavaScript(expr, true);
      if (ok) return;
      await delay(250);
    }
    throw new Error('Timed out waiting for print page readiness');
  };

  await poll(`document.documentElement.getAttribute('data-print-ready') === '1'`);

  // Scroll through so IntersectionObserver-based lazy media mounts.
  await webContents.executeJavaScript(
    `(async () => {
       const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
       let y = 0;
       while (y < document.documentElement.scrollHeight) {
         window.scrollTo(0, y);
         await new Promise((r) => setTimeout(r, 120));
         y += step;
       }
       window.scrollTo(0, document.documentElement.scrollHeight);
       await new Promise((r) => setTimeout(r, 250));
       window.scrollTo(0, 0);
       return true;
     })()`,
    true,
  );

  await poll(
    `(() => {
       const imgs = Array.from(document.querySelectorAll('img'));
       if (imgs.length === 0) return true;
       return imgs.every((img) => img.complete && (img.naturalWidth > 0 || img.dataset.allowBroken === '1'));
     })()`,
  );
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
