# Release Checklist

This tracks what has actually been verified for each distributable. The initial
release target is an unsigned Apple Silicon (`arm64`) macOS DMG. Intel, signing,
notarization, and automatic updates are intentionally deferred.

## Automated Before Every Release

- [ ] Install dependencies with Node 24 and the locked pnpm version.
- [ ] Run the complete unit test suite.
- [ ] Download Node 24.18.1 for macOS arm64 and verify it against Node's published SHA-256.
- [ ] Build the Next.js standalone server and arm64 Electron DMG.
- [ ] Confirm the app bundle contains Node 24.18.1 and the standalone server.
- [ ] Launch the packaged app and confirm the renderer contains application content.
- [ ] Generate and publish a SHA-256 checksum for the DMG.

These checks run in `.github/workflows/release-macos.yml`. A manual workflow run
creates an Actions artifact. Pushing a `v*` tag also creates a draft GitHub Release.

## Publishing Procedure

1. Update `version` in `package.json` and install once so the lockfile stays synchronized.
2. Commit the release and push `main`.
3. Create a matching tag, for example `git tag v0.1.0`, then push that tag.
4. Wait for the **Release macOS** workflow to finish.
5. Download its DMG artifact and complete the manual test record below.
6. Open the draft GitHub Release, add any important known issues, and publish it.

The tag and package version must match so the DMG filename and GitHub Release agree.

## Manual Test Record

Copy this section for each release and record the macOS and hardware versions.

**Version:**
**Date:**
**Tester:**
**Mac:**
**macOS:**

- [ ] Download the DMG from GitHub rather than using the local build.
- [ ] Verify the published checksum with `shasum -a 256 <file>.dmg`.
- [ ] Mount the DMG and drag the app to Applications.
- [ ] First normal launch is blocked by Gatekeeper as expected for an unsigned app.
- [ ] Right-click the app, choose Open, then confirm Open.
- [ ] If macOS still quarantines the app, the documented `xattr` fallback works.
- [ ] The app opens without a separately installed Node runtime.
- [ ] Missing Full Disk Access shows the dedicated permission screen.
- [ ] Open System Settings opens Privacy & Security > Full Disk Access.
- [ ] Granting access and relaunching loads the default Messages database.
- [ ] Conversation search, pinning, contacts, history, and date filtering work.
- [ ] A conversation containing images, HEIC media, videos, and rich links renders.
- [ ] PDF export opens a native save dialog and produces an A5 PDF.
- [ ] Printed QR codes point at the correct links.
- [ ] App data persists after quitting and reopening.
- [ ] The live `chat.db` remains read-only; no database or WAL modification times change.

## Known Distribution Limits

- Apple Silicon only.
- Unsigned and not notarized. Users must explicitly approve the app at first launch.
- No automatic updater. Install a new release by replacing the app in Applications.
- Full Disk Access is required to read the live Messages database and attachments.

## Local Validation: 0.1.0 Development Build

**Date:** 2026-08-01
**Platform:** Apple Silicon (`arm64`), macOS 26.3.1

- [x] Complete test suite: 125 tests passed.
- [x] Next.js standalone production build completed.
- [x] Official Node 24.18.1 arm64 archive downloaded and checksum verified.
- [x] Unsigned arm64 app and DMG built successfully.
- [x] App executable and bundled Node runtime are both arm64.
- [x] Packaged runtime reports Node v24.18.1.
- [x] Packaged app launched its own server and rendered application content.
- [x] DMG mounted and contained the app plus Applications shortcut.
- [x] GitHub-hosted DMG downloaded and matched its published SHA-256.
- [x] GitHub-hosted app installed into Applications and launched successfully.
- [x] Installed app read the default live Messages database and attachments.
- [ ] Gatekeeper behavior from an actual GitHub download.
- [ ] Full Disk Access grant/relaunch on a Mac where access was not already effective.
- [ ] Native PDF export using private Messages data.
