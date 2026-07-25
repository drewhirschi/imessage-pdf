/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep hot-reload artifacts separate from production/Electron builds.
  // Without this, `next build` can delete manifests while `next dev` is
  // serving them, producing intermittent ENOENT errors on refresh.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // The database layer now uses Node's built-in `node:sqlite`, which is
  // externalized automatically for server code. There is no native module
  // to mark external here anymore (previously: better-sqlite3).

  // Emit a self-contained server bundle (`.next/standalone/server.js`) so the
  // Electron shell can boot it as a child process. Harmless for `pnpm dev` /
  // `pnpm start` — it only adds build output.
  output: 'standalone',
  // Pin file-tracing to this project so standalone tracing doesn't walk up to a
  // parent workspace (this repo is often checked out under a worktree path).
  outputFileTracingRoot: __dirname,
  // `sharp` is a native addon; keep it external so it is required at runtime
  // from node_modules rather than bundled into the trace.
  serverExternalPackages: ['sharp'],
};

module.exports = nextConfig;
