// Port helpers for the embedded Next server. The pure `parsePort` logic is
// unit-tested; `getFreePort` performs the actual OS bind and is thin.
//
// Kept Electron-free so it runs under plain Node (vitest).

const net = require('node:net');

/**
 * Validate/normalize a port value coming from an env var or config.
 * Returns the parsed integer when it is a valid TCP port, otherwise `fallback`.
 *
 * @param {unknown} value
 * @param {number|null} [fallback=null]
 * @returns {number|null}
 */
function parsePort(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(n)) return fallback;
  // 0 means "let the OS pick" — a legitimate request, not an error.
  if (n < 0 || n > 65535) return fallback;
  return n;
}

/**
 * Ask the OS for a free TCP port on the loopback interface by binding to 0 and
 * reading back the assigned port. Resolves with the number.
 *
 * @param {string} [host='127.0.0.1']
 * @returns {Promise<number>}
 */
function getFreePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => {
        if (port == null) reject(new Error('Could not determine a free port'));
        else resolve(port);
      });
    });
  });
}

/**
 * Resolve the port to run the embedded server on: an explicit, valid
 * `IMESSAGE_PDF_PORT` env wins; otherwise pick a free one. A generic `PORT`
 * env is deliberately ignored — a stray exported PORT pointing at an
 * already-running dev server would make the window silently drive the wrong
 * server instance.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {Promise<number>}
 */
async function resolveServerPort(env = process.env) {
  const explicit = parsePort(env.IMESSAGE_PDF_PORT, null);
  if (explicit && explicit > 0) return explicit;
  return getFreePort();
}

module.exports = { parsePort, getFreePort, resolveServerPort };
