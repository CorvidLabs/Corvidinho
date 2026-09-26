import { describe, expect, test, beforeEach } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearRegistry, list } from "../src/plugins/registry.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { isProtectedPath } from "../plugins/files/protectedPaths.ts";

describe("files plugins (REQ-plugins-081..083)", () => {
  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  test("plugins list includes files-* with markings", () => {
    const byName = Object.fromEntries(list().map((e) => [e.name, e]));
    for (const name of [
      "files-read",
      "files-write",
      "files-edit",
      "files-glob",
      "files-list",
      "files-delete",
    ]) {
      expect(byName[name]).toBeTruthy();
    }
    expect(byName["files-read"]!.minTier).toBe(0);
    expect(byName["files-write"]!.minTier).toBe(2);
    expect(byName["files-edit"]!.minTier).toBe(2);
    expect(byName["files-delete"]!.minTier).toBe(2);
    expect(byName["files-delete"]!.dangerous).toBe(true);
    expect(byName["files-write"]!.dangerous).toBe(false);
    expect(byName["files-write"]!.mutating).toBe(true);
    expect(byName["files-edit"]!.mutating).toBe(true);
  });

  test("isProtectedPath catches SAFE-2 infra", () => {
    expect(isProtectedPath(".env")).toBe(true);
    expect(isProtectedPath(".env.local")).toBe(true);
    expect(isProtectedPath("subdir/.env")).toBe(true);
    expect(isProtectedPath(".git/HEAD")).toBe(true);
    expect(isProtectedPath("fledge.toml")).toBe(true);
    expect(isProtectedPath("specs/plugins/plugins.spec.md")).toBe(true);
    expect(isProtectedPath("foo.spec.md")).toBe(true);
    expect(isProtectedPath("wallet-keystore.json")).toBe(true);
    expect(isProtectedPath("my.keystore")).toBe(true);
    expect(isProtectedPath("bunfig.toml")).toBe(true);
    expect(isProtectedPath("sub/pkg/bunfig.toml")).toBe(true);
    expect(isProtectedPath(".bunfig.toml")).toBe(true);
    expect(isProtectedPath("BunFig.TOML")).toBe(true);
    expect(isProtectedPath("docs/bunfig.md")).toBe(false);
    expect(isProtectedPath("src/cli.ts")).toBe(false);
    expect(isProtectedPath("README.md")).toBe(false);
  });

  test("happy path read/write/edit/glob/list", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-files-"));
    try {
      writeFileSync(join(dir, "hello.txt"), "hello world\n");
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "src", "a.ts"), "export const a = 1;\n");

      const wrote = await runPlugin({
        name: "files-write",
        args: ["note.md", "alpha"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(wrote.ok).toBe(true);
      expect(readFileSync(join(dir, "note.md"), "utf8")).toBe("alpha");

      const edited = await runPlugin({
        name: "files-edit",
        args: ["note.md", "--old", "alpha", "--new", "beta"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(edited.ok).toBe(true);
      expect(readFileSync(join(dir, "note.md"), "utf8")).toBe("beta");

      const read = await runPlugin({
        name: "files-read",
        args: ["note.md"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(read.ok).toBe(true);
      expect(read.message).toBe("beta");

      const globbed = await runPlugin({
        name: "files-glob",
        args: ["**/*.ts"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(globbed.ok).toBe(true);
      expect((globbed.data as { matches: string[] }).matches).toContain("src/a.ts");

      const listed = await runPlugin({
        name: "files-list",
        args: ["."],
        cwd: dir,
        nonInteractive: true,
      });
      expect(listed.ok).toBe(true);
      expect((listed.data as { count: number }).count).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("SAFE-2: files-write cannot plant a bunfig.toml preload (REQ-plugins-083)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-safe2-bunfig-"));
    try {
      for (const target of ["bunfig.toml", ".bunfig.toml", "sub/bunfig.toml"]) {
        const w = await runPlugin({
          name: "files-write",
          args: [target, 'preload = ["./p.ts"]\n'],
          cwd: dir,
          nonInteractive: true,
        });
        expect(w.ok).toBe(false);
        expect(w.exitCode).toBe(2);
        expect(w.error).toContain("SAFE-2");
        expect(existsSync(join(dir, target))).toBe(false);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("SAFE-2 deny write/edit/delete on protected paths", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-safe2-"));
    try {
      writeFileSync(join(dir, ".env"), "SECRET=1\n");
      writeFileSync(join(dir, "fledge.toml"), "[tasks]\n");
      mkdirSync(join(dir, "specs"));
      writeFileSync(join(dir, "specs", "x.spec.md"), "# spec\n");
      writeFileSync(join(dir, "wallet-keystore.json"), "{}\n");
      writeFileSync(join(dir, "ok.txt"), "ok\n");

      for (const target of [
        ".env",
        "fledge.toml",
        "specs/x.spec.md",
        "wallet-keystore.json",
      ]) {
        const w = await runPlugin({
          name: "files-write",
          args: [target, "HACKED"],
          cwd: dir,
          nonInteractive: true,
        });
        expect(w.ok).toBe(false);
        expect(w.exitCode).toBe(2);
        expect(w.error).toContain("SAFE-2");
        expect(readFileSync(join(dir, target), "utf8")).not.toBe("HACKED");
      }

      const editEnv = await runPlugin({
        name: "files-edit",
        args: [".env", "--old", "SECRET=1", "--new", "SECRET=2"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(editEnv.ok).toBe(false);
      expect(editEnv.error).toContain("SAFE-2");
      expect(readFileSync(join(dir, ".env"), "utf8")).toBe("SECRET=1\n");

      const del = await runPlugin({
        name: "files-delete",
        args: [".env"],
        cwd: dir,
        nonInteractive: true,
        allowlist: ["files-delete"],
      });
      expect(del.ok).toBe(false);
      expect(del.error).toContain("SAFE-2");
      expect(existsSync(join(dir, ".env"))).toBe(true);

      // ordinary file still writable
      const ok = await runPlugin({
        name: "files-write",
        args: ["ok.txt", "ok2"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(ok.ok).toBe(true);
      expect(readFileSync(join(dir, "ok.txt"), "utf8")).toBe("ok2");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("path escape and symlink escape refused", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-escape-"));
    const outside = mkdtempSync(join(tmpdir(), "corvidinho-outside-"));
    try {
      writeFileSync(join(outside, "secret.txt"), "nope\n");
      symlinkSync(outside, join(dir, "link-out"));

      const up = await runPlugin({
        name: "files-read",
        args: ["../secret.txt"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(up.ok).toBe(false);
      expect(up.error).toMatch(/traversal|escape|outside/i);

      const viaLink = await runPlugin({
        name: "files-read",
        args: ["link-out/secret.txt"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(viaLink.ok).toBe(false);
      expect(viaLink.error).toMatch(/escape|outside|traversal/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("files-delete SAFE-1 deny without allowlist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-deldeny-"));
    try {
      writeFileSync(join(dir, "x.txt"), "x\n");
      const denied = await runPlugin({
        name: "files-delete",
        args: ["x.txt"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(denied.ok).toBe(false);
      expect(denied.exitCode).toBe(2);
      expect(denied.error).toContain("SAFE-1");
      expect(existsSync(join(dir, "x.txt"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
