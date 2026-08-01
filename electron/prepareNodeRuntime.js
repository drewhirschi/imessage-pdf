#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const NODE_VERSION = '24.18.1';
const SUPPORTED_ARCHES = new Set(['arm64']);
const repoRoot = path.join(__dirname, '..');
const runtimeDir = path.join(repoRoot, '.electron-runtime');

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(new URL(response.headers.location, url), destination).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed (${response.statusCode}): ${url}`));
        return;
      }
      const file = fs.createWriteStream(destination);
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    });
    request.on('error', reject);
  });
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

async function main() {
  const arch = process.env.ELECTRON_ARCH || os.arch();
  if (process.platform !== 'darwin' || !SUPPORTED_ARCHES.has(arch)) {
    throw new Error(`The distributable currently supports macOS arm64 only (got ${process.platform}-${arch}).`);
  }

  const runtimePath = path.join(runtimeDir, 'node');
  const versionPath = path.join(runtimeDir, 'VERSION');
  if (
    fs.existsSync(runtimePath) &&
    fs.existsSync(versionPath) &&
    fs.readFileSync(versionPath, 'utf8').trim() === NODE_VERSION
  ) {
    console.log(`[node-runtime] using cached Node ${NODE_VERSION} (${arch})`);
    return;
  }

  fs.rmSync(runtimeDir, { recursive: true, force: true });
  fs.mkdirSync(runtimeDir, { recursive: true });

  const archiveName = `node-v${NODE_VERSION}-darwin-${arch}.tar.gz`;
  const baseUrl = `https://nodejs.org/download/release/v${NODE_VERSION}`;
  const archivePath = path.join(runtimeDir, archiveName);
  const sumsPath = path.join(runtimeDir, 'SHASUMS256.txt');
  console.log(`[node-runtime] downloading Node ${NODE_VERSION} (${arch})`);
  await Promise.all([
    download(`${baseUrl}/${archiveName}`, archivePath),
    download(`${baseUrl}/SHASUMS256.txt`, sumsPath),
  ]);

  const checksumLine = fs.readFileSync(sumsPath, 'utf8')
    .split('\n')
    .find((line) => line.endsWith(`  ${archiveName}`));
  if (!checksumLine) throw new Error(`No checksum found for ${archiveName}`);
  const expected = checksumLine.split(/\s+/)[0];
  const actual = sha256(archivePath);
  if (actual !== expected) throw new Error(`Checksum mismatch for ${archiveName}`);

  const extracted = spawnSync('tar', [
    '-xzf', archivePath,
    '--strip-components=2',
    '-C', runtimeDir,
    `node-v${NODE_VERSION}-darwin-${arch}/bin/node`,
  ], { stdio: 'inherit' });
  if (extracted.status !== 0) throw new Error('Failed to extract the Node runtime');

  fs.chmodSync(runtimePath, 0o755);
  fs.writeFileSync(versionPath, `${NODE_VERSION}\n`);
  fs.rmSync(archivePath);
  fs.rmSync(sumsPath);
  console.log(`[node-runtime] ready: ${runtimePath}`);
}

main().catch((error) => {
  console.error(`[node-runtime] ${error.message}`);
  process.exit(1);
});
