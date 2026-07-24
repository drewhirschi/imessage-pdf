import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyFsError,
  expandHome,
  probeDatabase,
  probeDirectory,
} from "./probe";
import { resolvePaths, defaultPaths } from "./detect";
import { createFixtureDb, type Fixture } from "../../test/fixture";

// mode-000 tests only mean anything for a non-root process; root bypasses
// permission bits so the file would read fine and the case is untestable.
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

describe("classifyFsError", () => {
  it("maps ENOENT to not_found", () => {
    expect(classifyFsError({ code: "ENOENT" })).toBe("not_found");
  });

  it("maps EACCES and EPERM to permission_denied", () => {
    expect(classifyFsError({ code: "EACCES" })).toBe("permission_denied");
    expect(classifyFsError({ code: "EPERM" })).toBe("permission_denied");
  });

  it("maps SQLITE_CANTOPEN messages to permission_denied", () => {
    expect(
      classifyFsError(new Error("SQLITE_CANTOPEN: unable to open database file")),
    ).toBe("permission_denied");
  });

  it("defaults unknown open failures to permission_denied", () => {
    expect(classifyFsError(new Error("file is not a database"))).toBe(
      "permission_denied",
    );
  });
});

describe("expandHome", () => {
  it("leaves absolute paths untouched", () => {
    expect(expandHome("/abs/path")).toBe("/abs/path");
  });
  it("expands ~ and ~/…", () => {
    expect(expandHome("~")).not.toContain("~");
    expect(expandHome("~/Library")).toMatch(/Library$/);
    expect(expandHome("~/Library")).not.toContain("~");
  });
});

describe("probeDatabase", () => {
  let fixture: Fixture;
  let dir: string;

  beforeAll(() => {
    fixture = createFixtureDb();
    dir = mkdtempSync(join(tmpdir(), "probe-test-"));
  });

  afterAll(() => {
    fixture.cleanup();
    // Restore perms so cleanup can remove everything.
    try {
      chmodSync(join(dir, "locked.db"), 0o644);
    } catch {
      /* ignore */
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns ok for a readable sqlite database", () => {
    const res = probeDatabase(fixture.dbPath);
    expect(res.status).toBe("ok");
    expect(res.path).toBe(fixture.dbPath);
  });

  it("returns not_found for a missing path", () => {
    const res = probeDatabase(join(dir, "does-not-exist.db"));
    expect(res.status).toBe("not_found");
  });

  it("returns not_found when the path is a directory", () => {
    const res = probeDatabase(dir);
    expect(res.status).toBe("not_found");
  });

  it.skipIf(isRoot)(
    "returns permission_denied for an unreadable file",
    () => {
      const locked = join(dir, "locked.db");
      writeFileSync(locked, "not really a db");
      chmodSync(locked, 0o000);
      const res = probeDatabase(locked);
      expect(res.status).toBe("permission_denied");
    },
  );
});

describe("probeDirectory", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "probe-dir-test-"));
  });

  afterAll(() => {
    try {
      chmodSync(join(dir, "locked"), 0o755);
    } catch {
      /* ignore */
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns ok for a readable directory", () => {
    const res = probeDirectory(dir);
    expect(res.status).toBe("ok");
  });

  it("returns not_found for a missing directory", () => {
    const res = probeDirectory(join(dir, "nope"));
    expect(res.status).toBe("not_found");
  });

  it("returns not_found when the path is a file", () => {
    const f = join(dir, "afile");
    writeFileSync(f, "x");
    const res = probeDirectory(f);
    expect(res.status).toBe("not_found");
  });

  it.skipIf(isRoot)(
    "returns permission_denied for an unreadable directory",
    () => {
      const locked = join(dir, "locked");
      mkdirSync(locked);
      chmodSync(locked, 0o000);
      const res = probeDirectory(locked);
      expect(res.status).toBe("permission_denied");
    },
  );
});

describe("resolvePaths (backup-folder detection)", () => {
  let dir: string;

  beforeAll(() => {
    // Simulate a backup folder: chat.db + Attachments/ side by side.
    dir = mkdtempSync(join(tmpdir(), "backup-folder-"));
    const fixture = createFixtureDb();
    // Copy the fixture db into the backup folder as chat.db.
    copyFileSync(fixture.dbPath, join(dir, "chat.db"));
    fixture.cleanup();
    mkdirSync(join(dir, "Attachments"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves a folder containing chat.db to the file + sibling Attachments", () => {
    const resolved = resolvePaths(dir);
    expect(resolved.source).toBe("backup-folder");
    expect(resolved.dbPath).toBe(join(dir, "chat.db"));
    expect(resolved.attachmentsPath).toBe(join(dir, "Attachments"));
  });

  it("passes an explicit chat.db path through untouched", () => {
    const explicit = join(dir, "chat.db");
    const resolved = resolvePaths(explicit, join(dir, "Attachments"));
    expect(resolved.source).toBe("explicit");
    expect(resolved.dbPath).toBe(explicit);
  });

  it("defaultPaths points at ~/Library/Messages", () => {
    const d = defaultPaths();
    expect(d.dbPath).toMatch(/Library\/Messages\/chat\.db$/);
    expect(d.attachmentsPath).toMatch(/Library\/Messages\/Attachments$/);
    expect(d.source).toBe("default");
  });
});
