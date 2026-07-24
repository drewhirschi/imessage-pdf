# Plan: Run on Current Node (24 LTS)

**Status:** draft — needs review

## Summary

The app currently only runs on Node 22 (dev machine is on v22.23.1); on the latest Node it breaks. Get it working on Node 24 LTS (and tolerant of newer), primarily by taming the native-module story. This is also a prerequisite for the Electron packaging plan ([electron-app.md](electron-app.md)) — every native module we drop is one less thing to rebuild against Electron's ABI.

## Diagnosis (to confirm as step 1)

The likely breakage points, in order of suspicion:

1. **`better-sqlite3`** — native addon compiled per Node ABI. New Node major → prebuilt binary missing or build script skipped (pnpm v10 `onlyBuiltDependencies` gotcha compounds this). This is the classic "Could not locate the bindings file" failure.
2. **`sharp`** — native, same ABI story, though sharp ships prebuilds quickly.
3. **Next 15.5 + Turbopack** on very new Node majors — occasionally lags a major release.

Step 1 of the work is to install the latest Node, run `pnpm install && pnpm dev`, and record the actual errors before fixing anything.

## Proposed approach

1. **Replace `better-sqlite3` with `node:sqlite`.** Node's built-in SQLite (stable since 24) has a nearly identical synchronous API (`DatabaseSync`, `prepare`, `all`/`get`). We open read-only and run plain SELECTs — no exotic features. This deletes our biggest native dependency, ends the ABI treadmill entirely, and makes Electron packaging dramatically simpler. All SQL is already isolated in `lib/db/connection.ts` + `queries.ts`, so the change is contained.
2. **Keep `sharp`** (prebuilds are reliable) but bump to latest; same for `heic-convert`.
3. **Bump Next to latest 15.x** (or 16 if that's what supports current Node — check the support matrix at upgrade time) via `vercel:next-upgrade` codemods if a major is needed.
4. **Pin an engines field**: `"engines": { "node": ">=24" }` in `package.json` plus a `.nvmrc`/`.node-version` so contributors and the Electron build agree on a version.
5. Update CLAUDE.md's Running section (the pnpm rebuild advice changes once better-sqlite3 is gone).

## Open questions

- Does `node:sqlite` handle the WAL sidecar files (`chat.db-wal`/`-shm`) in read-only mode the same way? better-sqlite3 opens with `readonly: true`; node:sqlite has `readOnly: true` — verify against the real backup, including a db where the WAL contains recent messages.
- `unrs-resolver` is in `onlyBuiltDependencies` — is it still pulled in after the Next bump?

## Out of scope

- Electron itself (separate plan).
- Any query/feature changes — this is a pure platform migration; behavior must be identical.
