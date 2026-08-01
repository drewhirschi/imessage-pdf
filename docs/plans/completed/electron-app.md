# Plan: Package as an Electron App

**Status:** shipped. The unsigned Apple Silicon DMG, bundled Node 24 runtime,
packaged-app smoke test, icon, and GitHub release workflow were verified on
macOS on 2026-08-01. Full Disk Access and a real PDF export remain in the manual
release checklist because they require user interaction and private Messages data.

## Resolutions (post-implementation)

- **Open question 1 (in-process vs child process): CHILD PROCESS.** The Next
  standalone server is spawned by `electron/serverManager.js` under a *real*
  Node runtime (system `node`, or a Node binary bundled in resources), never in
  the Electron main process. Native modules (`sharp`, `node:sqlite`) are built
  against the system Node ABI by `pnpm install`; running the server out of
  process means Electron upgrades never require `electron-rebuild`. Verified on
  macOS arm64: the packaged binary spawns `resources/app/.next/standalone/server.js`
  using the bundled Node 24.18.1 runtime and the renderer loads the home page.
- **Open question 2 (browser dev flow):** kept first-class. `pnpm dev` is
  unchanged; Electron is purely additive. The PDF client falls back to the
  puppeteer HTTP route whenever `window.electron.exportPDF` is absent.
- **PDF export:** in Electron, a hidden `BrowserWindow` loads the existing
  `/conversation/[id]/print` route and calls `webContents.printToPDF()` with a
  native save dialog (`electron/main.js`). The puppeteer path in
  `app/api/generate-pdf/route.ts` is retained as the non-Electron fallback.
- **Preload surface (`electron/preload.js`):** contextIsolation on,
  nodeIntegration off. Exposes exactly `openExternal`, `relaunch`, `exportPDF`,
  and an `isElectron` marker — matching what `FullDiskAccessScreen` probes.

## Original plan

**Status:** draft — needs review

## Summary

Turn the local Next.js app into a double-clickable macOS app (the target users run macOS — that's where `chat.db` lives). Electron hosts the existing Next server in-process and opens a window pointed at it. No rewrite of routes or components; the web app stays runnable with `pnpm dev` for development.

Depends on [node-upgrade.md](node-upgrade.md) (dropping `better-sqlite3` for `node:sqlite` removes the worst Electron-rebuild pain) and pairs with [onboarding.md](onboarding.md) (permissions + path auto-detection are what make the packaged app usable by non-developers).

## Motivation

Today "use this program" means: install Node + pnpm, clone, `pnpm install`, `pnpm dev`, open localhost. The people we're helping (see the missing-text call notes in [missing-text-and-sync-stats.md](missing-text-and-sync-stats.md)) can't do that. One `.dmg` they can download and open is the goal.

## Approach

### Architecture

- **Main process**: starts the Next server (`next start` programmatically against the standalone build output) on a random localhost port, then opens a `BrowserWindow` at it. All existing API routes keep working unchanged.
- **Build**: `next build` with `output: 'standalone'`, then `electron-builder` bundles the standalone server + `.next/static` + Electron shell into a `.dmg` (arm64 + x64, or universal).
- **Renderer**: plain Chromium window, `nodeIntegration: false`. The app already talks to itself over HTTP; no preload/IPC surface needed for v1 except the couple of native niceties below.

### Native-module inventory

| Dep | Status in Electron |
| --- | --- |
| `better-sqlite3` | dropped (node-upgrade plan) → `node:sqlite` runs in the main/server process, no rebuild |
| `sharp` | runs in the server process (Node ABI, not Electron ABI, since the Next server runs under the bundled Node runtime — verify; if the server runs in Electron's main process instead, use `electron-rebuild` for sharp only) |
| `puppeteer-core` + system Chromium | **replaced** — see PDF below |

### PDF generation

The current export launches system Chromium via `puppeteer-core`. Inside Electron we already ship Chromium: render the existing `/conversation/[id]/print` route in a hidden `BrowserWindow` and call `webContents.printToPDF()` with the same page-size/margin options. Deletes the `puppeteer-core` dependency and the "user must have Chrome installed" requirement in the packaged app. Keep the puppeteer path only for `pnpm dev` (or drop it and require the Electron shell for exports — open question).

### Electron-specific UX

- Native "Save PDF as…" dialog instead of a browser download.
- Native folder picker (`dialog.showOpenDialog`) replacing the hand-rolled `FileExplorer` modal when running in Electron.
- App menu with basic items; auto-open window on launch.

### Signing / distribution

- v1: unsigned or ad-hoc signed `.dmg`, users right-click → Open. Document the Gatekeeper bypass in the README.
- Later: Developer ID signing + notarization (needs an Apple Developer account, $99/yr — user decision).
- No auto-update in v1.

## Open questions

1. Does the standalone Next server run under Electron's bundled Node (ABI mismatch risk for sharp) or as a child process with a real Node runtime? Child process is safer but means shipping a Node binary; running in-process is smaller. Decide during a spike.
2. Keep the browser-based dev flow as a first-class citizen forever, or let the Electron shell become the only supported way to run it?
3. Windows/Linux builds? `chat.db` only exists on macOS, but people might copy a backup to another machine. Suggest macOS-only for v1.

## Out of scope

- Auto-update, crash reporting, analytics.
- Mac App Store distribution (sandboxing would fight Full Disk Access).
