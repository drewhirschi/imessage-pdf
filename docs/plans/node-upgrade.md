# Node upgrade: drop better-sqlite3 for node:sqlite

**Status: DONE (2026-07-23).** Migrated the DB layer off the `better-sqlite3`
native module onto Node's built-in `node:sqlite` (`DatabaseSync`). Behavior is
preserved. Bumped `sharp`, Next (within 15.x), `@types/node`; added Vitest with a
self-contained fixture DB. Validated on Node 22.23.1 (with `--experimental-sqlite`)
and Node 24.10.0 (stable, no flag) on Linux. macOS run not yet exercised (see below).

## Summary

`better-sqlite3` is a native addon that has to be compiled per Node ABI, which is
what broke on newer Node and forces the `pnpm.onlyBuiltDependencies` dance.
`node:sqlite` ships with Node (stable in 24, `--experimental-sqlite` in 22.5+), so
there is nothing to compile. All SQL is isolated in `lib/db/connection.ts` and
`lib/db/queries.ts`, so the swap is contained behind a small compatibility adapter.

## Scope

- Replace the connection in `lib/db/connection.ts` with a `node:sqlite` adapter
  that keeps the `prepare().get()/.all()/.run()` surface. **No query changes.**
- Remove `better-sqlite3` + `@types/better-sqlite3`; update
  `pnpm.onlyBuiltDependencies` (keep `sharp`, `unrs-resolver`).
- Bump `sharp` to latest, Next within 15.x, `@types/node` to 24 (for `node:sqlite`
  typings). `heic-convert` was already at latest (2.1.0).
- `engines.node >=24` + `.nvmrc` = 24. Keep Node 22 working via `NODE_OPTIONS`.
- Add Vitest + fixture-backed unit tests.

## Open questions (answered)

- **Does `node:sqlite` read-only handle the WAL sidecars correctly?**
  Yes. Opening `chat.db` with `{ readOnly: true }` while `chat.db-wal` /
  `chat.db-shm` are present works and returns rows that include un-checkpointed
  WAL data — verified against the real 82GB backup. Writes are rejected with
  `ERR_SQLITE_ERROR: attempt to write a readonly database`.
- **Big integers?** This was the one real behavioral gotcha. `node:sqlite` throws
  `ERR_OUT_OF_RANGE` for integer columns beyond `Number.MAX_SAFE_INTEGER` — and
  iMessage nanosecond dates (~7.8e17) are all beyond it. better-sqlite3 silently
  returned lossy doubles. Fix: `setReadBigInts(true)` on every statement, then
  `Number(bigint)` at the adapter boundary → identical lossy-double behavior, so
  the downstream `/ 1e9` math and `JSON.stringify` are unchanged.
- **Does the `--experimental-sqlite` flag error on Node 24?** No — it is accepted
  as a no-op there, so a single `NODE_OPTIONS=--experimental-sqlite` in the npm
  scripts works on both Node 22 and 24. It is a temporary bridge for Node 22.
- **Duplicate column names** (`m.*` + `h.id AS handle_id` in the messages query):
  both drivers keep the last column, so `handle.id`/`handle_id` resolve to the
  string handle id under node:sqlite exactly as before. Not a regression.

## Approach (as implemented)

- `lib/db/connection.ts`: `wrap(DatabaseSync)` → `{ prepare, close }`; each
  prepared statement calls `setReadBigInts(true)` and normalizes BigInt→Number.
- Scripts gain `NODE_OPTIONS=--experimental-sqlite`; `next.config.js` no longer
  externalizes `better-sqlite3` (`node:` builtins are auto-external).
- Tests: `test/fixture.ts` builds a temp `chat.db` (chat, handle, message,
  attachment, the three joins) with realistic ns timestamps and reactions
  (`associated_message_type` 2000–2005). Suites: `lib/db/connection.test.ts`,
  `lib/db/queries.test.ts`, `lib/utils/timestamp.test.ts`.

## Left for a human on macOS

- Run `pnpm dev` / `pnpm build` / a real conversation + PDF export on macOS
  against a live `~/Library/Messages/chat.db`. The migration was validated on
  Linux only; nothing is platform-specific, but the app's real home is macOS.
