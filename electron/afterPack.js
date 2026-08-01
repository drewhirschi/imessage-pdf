const path = require('node:path');
const { spawnSync } = require('node:child_process');

/**
 * Apply a coherent ad-hoc signature after electron-builder has modified the
 * app bundle. This gives macOS TCC a stable identity for Full Disk Access
 * without requiring a paid Developer ID certificate.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const result = spawnSync(
    'codesign',
    [
      '--force',
      '--deep',
      '--sign',
      '-',
      '--identifier',
      'com.imessagepdf.exporter',
      appPath,
    ],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    throw new Error(`Ad-hoc signing failed: ${result.stderr || result.stdout}`);
  }
  console.log(`[after-pack] ad-hoc signed ${appPath}`);
};
