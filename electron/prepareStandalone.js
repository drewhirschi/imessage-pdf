#!/usr/bin/env node
// After `next build` with output:'standalone', Next emits a minimal server at
// .next/standalone/server.js but does NOT copy the static assets or /public
// into it (by design — you choose where they go). The standalone server serves
// them from paths relative to its own cwd, so we copy them in:
//   .next/static  -> .next/standalone/.next/static
//   public        -> .next/standalone/public
// Cross-platform (fs.cpSync), idempotent. Run after every build, before launch
// or packaging.

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const standalone = path.join(repoRoot, '.next', 'standalone');

function copyDir(from, to) {
  if (!fs.existsSync(from)) {
    console.warn(`[prepare-standalone] skip (missing): ${from}`);
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
  console.log(`[prepare-standalone] copied ${from} -> ${to}`);
}

function copySharpRuntime() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') return;

  const sharpEntry = require.resolve('sharp');
  const sharpRoot = path.dirname(path.dirname(sharpEntry));
  const optionalRoot = path.join(sharpRoot, '..', '@img');
  const packages = [
    'sharp-darwin-arm64',
    'sharp-libvips-darwin-arm64',
  ];

  for (const packageName of packages) {
    const linkedPath = path.join(optionalRoot, packageName);
    if (!fs.existsSync(linkedPath)) {
      throw new Error(`[prepare-standalone] missing Sharp runtime package: @img/${packageName}`);
    }
    copyDir(
      fs.realpathSync(linkedPath),
      path.join(standalone, 'node_modules', '@img', packageName),
    );
  }
}

function main() {
  if (!fs.existsSync(path.join(standalone, 'server.js'))) {
    console.error(
      '[prepare-standalone] .next/standalone/server.js not found. Run `next build` first.',
    );
    process.exit(1);
  }
  copyDir(path.join(repoRoot, '.next', 'static'), path.join(standalone, '.next', 'static'));
  copyDir(path.join(repoRoot, 'public'), path.join(standalone, 'public'));
  copySharpRuntime();
}

main();
