/**
 * REQ-plugins-082 — a dangling symlink cannot redirect a file-tool write out of
 * the project root or onto SAFE-2 protected infra (path clamp in
 * plugins/files/resolvePath.ts).
 */
import { describe, expect, test, beforeEach } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { clearRegistry } from "../src/plugins/registry.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { PathEscapeError, resolveProjectPath } from "../plugins/files/resolvePath.ts";

function write(dir: string, path: string, content: string) {
  return runPlugin({
    name: "files-write",
    args: [path, content],
    cwd: dir,
    nonInteractive: true,
  });
}

describe("files path clamp: dangling symlinks (REQ-plugins-082)", () => {
  let dir = "";
  let outside = "";

  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  function setup() {
    dir = mkdtempSync(join(tmpdir(), "corvidinho-dangle-"));
    outside = mkdtempSync(join(tmpdir(), "corvidinho-dangle-out-"));
  }

  function cleanup() {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }

  test("files-write through a dangling link to a missing file outside the root is refused", async () => {
    setup();
    try {
      const target = join(outside, "pwned.txt");
      symlinkSync(target, join(dir, "notes.txt"));
      const relTarget = join(outside, "pwned-rel.txt");
      symlinkSync(relative(dir, relTarget), join(dir, "notes-rel.txt"));

      for (const [link, t] of [
        ["notes.txt", target],
        ["notes-rel.txt", relTarget],
      ] as const) {
        const r = await write(dir, link, "escaped!");
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/escape|outside/i);
        expect(existsSync(t)).toBe(false);
      }
      expect(() => resolveProjectPath(dir, "notes.txt")).toThrow(PathEscapeError);
    } finally {
      cleanup();
    }
  });

  test("files-write through a dangling link to a missing SAFE-2 file is refused", async () => {
    setup();
    try {
      symlinkSync(".env", join(dir, "README.local"));
      mkdirSync(join(dir, "specs"));
      symlinkSync("specs/x.spec.md", join(dir, "notes.md"));

      for (const [link, t] of [
        ["README.local", ".env"],
        ["notes.md", "specs/x.spec.md"],
      ] as const) {
        const r = await write(dir, link, "CORVIDINHO_LLM_BASE_URL=https://attacker.example/v1");
        expect(r.ok).toBe(false);
        expect(r.exitCode).toBe(2);
        expect(r.error).toContain("SAFE-2");
        expect(existsSync(join(dir, t))).toBe(false);
      }
    } finally {
      cleanup();
    }
  });

  test("a dangling directory link cannot carry a nested write outside the root", async () => {
    setup();
    try {
      symlinkSync(join(outside, "missing-dir"), join(dir, "d"));
      const r = await write(dir, "d/x.txt", "escaped!");
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/escape|outside/i);
      expect(existsSync(join(outside, "missing-dir"))).toBe(false);
    } finally {
      cleanup();
    }
  });

  test("a symlink loop is refused instead of hanging", async () => {
    setup();
    try {
      symlinkSync("b", join(dir, "a"));
      symlinkSync("a", join(dir, "b"));
      const r = await write(dir, "a", "x");
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/symlink/i);
    } finally {
      cleanup();
    }
  });

  test("a dangling link to a missing file inside the root still writes that file", async () => {
    setup();
    try {
      mkdirSync(join(dir, "sub"));
      symlinkSync("sub/target.txt", join(dir, "link-in"));
      const r = await write(dir, "link-in", "inside");
      expect(r.ok).toBe(true);
      expect(readFileSync(join(dir, "sub", "target.txt"), "utf8")).toBe("inside");
    } finally {
      cleanup();
    }
  });
});
