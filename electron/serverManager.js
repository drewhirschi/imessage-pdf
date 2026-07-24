// Starts the Next.js standalone server as a CHILD PROCESS (not in the Electron
// main process) and waits until it answers on its port.
//
// Why a child process (see docs/plans/electron-app.md open question 1):
//   The server uses native modules — `sharp` (HEIC->JPEG) and Node's built-in
//   `node:sqlite`. Native addons are compiled against a specific Node ABI
//   (NODE_MODULE_VERSION). `pnpm install` builds them against the *system* Node
//   ABI. Electron's main process embeds a *different* Node ABI, so requiring
//   server.js in-process would force `electron-rebuild` for every native dep on
//   every Electron bump. Running the server as its own process under a real
//   Node runtime sidesteps the ABI mismatch entirely — no electron-rebuild.
//
// The Node binary is resolved in this order:
//   1. IMESSAGE_PDF_NODE env override (used by electron:dev and tests)
//   2. a bundled Node binary shipped in resources/ (packaged app)
//   3. the `node` on PATH (developer machines)
// If none is a real Node binary we fall back to running the Electron binary
// with ELECTRON_RUN_AS_NODE=1 — this WILL require sharp to match Electron's ABI,
// so it is a last resort and logged loudly.

const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { resolveServerPort } = require('./lib/port');

function fileExists(p) {
  try {
    return !!p && fs.existsSync(p);
  } catch {
    return false;
  }
}

/**
 * Locate a real Node executable to run the standalone server with.
 * @param {object} [opts]
 * @param {string} [opts.resourcesPath] Electron process.resourcesPath (packaged)
 * @returns {{ command: string, useElectronNode: boolean }}
 */
function resolveNodeBinary(opts = {}) {
  const override = process.env.IMESSAGE_PDF_NODE;
  if (fileExists(override)) return { command: override, useElectronNode: false };

  // Packaged: a Node binary bundled via electron-builder extraResources.
  if (opts.resourcesPath) {
    const bundled = path.join(
      opts.resourcesPath,
      'node' + (process.platform === 'win32' ? '.exe' : ''),
    );
    if (fileExists(bundled)) return { command: bundled, useElectronNode: false };
  }

  // Developer machine: whatever `node` resolves to. `execPath` is only Node
  // when we are NOT inside Electron (i.e. electron:dev spawned via node).
  if (!process.versions.electron && fileExists(process.execPath)) {
    return { command: process.execPath, useElectronNode: false };
  }

  // System `node` on PATH. Real Node runtime → ABI-safe for sharp/node:sqlite.
  const onPath = process.platform === 'win32' ? 'node.exe' : 'node';
  if (hasNodeOnPath(onPath)) {
    return { command: onPath, useElectronNode: false };
  }

  // Absolute last resort: re-exec the Electron binary as Node. Boots the
  // server even with no Node installed, but native modules (sharp) must match
  // Electron's ABI. Only reached inside a packaged app that shipped no Node.
  return { command: process.execPath, useElectronNode: true };
}

// Cheap PATH probe so we can prefer a real Node before falling back to
// ELECTRON_RUN_AS_NODE. Avoids spawning; just walks PATH entries.
function hasNodeOnPath(binName) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    if (fileExists(path.join(dir, binName))) return true;
  }
  return false;
}

/**
 * @typedef {object} ServerHandle
 * @property {import('node:child_process').ChildProcess} child
 * @property {number} port
 * @property {string} url
 * @property {() => void} stop
 */

/**
 * Boot the standalone server.
 *
 * @param {object} opts
 * @param {string} opts.serverEntry Absolute path to .next/standalone/server.js
 * @param {string} [opts.cwd] Working dir for the child (standalone root).
 * @param {string} [opts.resourcesPath]
 * @param {(line: string) => void} [opts.onLog]
 * @param {number} [opts.readyTimeoutMs=30000]
 * @returns {Promise<ServerHandle>}
 */
async function startServer(opts) {
  const {
    serverEntry,
    cwd = path.dirname(opts.serverEntry),
    resourcesPath,
    onLog = () => {},
    readyTimeoutMs = 30000,
  } = opts;

  if (!fileExists(serverEntry)) {
    throw new Error(
      `Standalone server entry not found at ${serverEntry}. ` +
        'Run `pnpm build` (output: "standalone") before launching Electron.',
    );
  }

  const port = await resolveServerPort();
  const host = '127.0.0.1';
  const { command, useElectronNode } = resolveNodeBinary({ resourcesPath });

  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: host,
    // Node 22 needs the flag for node:sqlite; harmless no-op on Node 24+.
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--experimental-sqlite']
      .filter(Boolean)
      .join(' '),
  };
  if (useElectronNode) {
    env.ELECTRON_RUN_AS_NODE = '1';
    onLog(
      '[server] WARNING: no standalone Node binary found; running the server ' +
        'under Electron (ELECTRON_RUN_AS_NODE). Native modules (sharp) must ' +
        'match Electron\'s ABI or attachment conversion will fail.',
    );
  }

  onLog(`[server] spawning ${command} ${serverEntry} on ${host}:${port}`);
  const child = spawn(command, [serverEntry], { cwd, env, stdio: 'pipe' });

  child.stdout.on('data', (d) => onLog(`[server] ${String(d).trimEnd()}`));
  child.stderr.on('data', (d) => onLog(`[server:err] ${String(d).trimEnd()}`));

  const url = `http://${host}:${port}`;

  const stop = () => {
    if (!child.killed) child.kill();
  };

  child.on('exit', (code, signal) => {
    onLog(`[server] exited code=${code} signal=${signal}`);
  });

  await waitForServer(url, readyTimeoutMs, () => child.exitCode == null);

  return { child, port, url, stop };
}

/**
 * Poll the server root until it responds or times out.
 * @param {string} url
 * @param {number} timeoutMs
 * @param {() => boolean} isAlive
 */
function waitForServer(url, timeoutMs, isAlive) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (!isAlive()) {
        reject(new Error('Server process exited before becoming ready'));
        return;
      }
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error(`Server did not become ready within ${timeoutMs}ms`));
        } else {
          setTimeout(attempt, 200);
        }
      });
    };
    attempt();
  });
}

module.exports = { startServer, resolveNodeBinary, waitForServer };
