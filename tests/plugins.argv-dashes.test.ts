import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearRegistry } from "../src/plugins/registry.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";

/**
 * REQ-plugins-243: plugin argv parsing never silently drops tokens that start
 * with "--" (files-write content, files-edit strings, shell-exec command flags,
 * search-grep patterns), and files-write refuses to empty a non-empty file
 * unless --allow-empty is passed.
 */
describe("plugin argv keeps '--' tokens (REQ-plugins-243)", () => {
  let dir: string;

  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
    dir = mkdtempSync(join(tmpdir(), "corvidinho-argv-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const run = (name: string, args: string[], allowlist?: string[]) =>
    runPlugin({ name, args, cwd: dir, nonInteractive: true, allowlist });

  const ORIGINAL = "---\ntitle: Old\n---\n\n" + "Body text line.\n".repeat(40);

  test("files-write --content keeps YAML front matter that starts with '--'", async () => {
    writeFileSync(join(dir, "doc.md"), ORIGINAL);
    const next = "---\ntitle: New\n---\n\nNew body.\n";
    const r = await run("files-write", ["doc.md", "--content", next]);
    expect(r.ok).toBe(true);
    expect(readFileSync(join(dir, "doc.md"), "utf8")).toBe(next);
  });

  test("files-write positional content that starts with '--' (SQL comment) is written verbatim", async () => {
    writeFileSync(join(dir, "001.sql"), "SELECT 1;\n");
    const sql = "-- migration\nCREATE TABLE t (id INTEGER);\n";
    const r = await run("files-write", ["001.sql", sql]);
    expect(r.ok).toBe(true);
    expect(readFileSync(join(dir, "001.sql"), "utf8")).toBe(sql);
  });

  test("files-write keeps unknown '--' words inside positional content", async () => {
    const r = await run("files-write", ["notes.txt", "run", "git", "push", "--dry-run", "first"]);
    expect(r.ok).toBe(true);
    expect(readFileSync(join(dir, "notes.txt"), "utf8")).toBe("run git push --dry-run first");
  });

  test("files-write --content=value and --path with positional content", async () => {
    const a = await run("files-write", ["a.txt", "--content=--flag-like"]);
    expect(a.ok).toBe(true);
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("--flag-like");

    const b = await run("files-write", ["--path", "b.txt", "hello", "world"]);
    expect(b.ok).toBe(true);
    expect(readFileSync(join(dir, "b.txt"), "utf8")).toBe("hello world");
  });

  test("files-write refuses to empty a non-empty file; --allow-empty opts in", async () => {
    writeFileSync(join(dir, "doc.md"), ORIGINAL);
    const size = statSync(join(dir, "doc.md")).size;

    const missing = await run("files-write", ["doc.md"]);
    expect(missing.ok).toBe(false);
    expect(missing.error).toContain("--allow-empty");
    expect(statSync(join(dir, "doc.md")).size).toBe(size);

    const empty = await run("files-write", ["doc.md", "--content", ""]);
    expect(empty.ok).toBe(false);
    expect(statSync(join(dir, "doc.md")).size).toBe(size);

    const dangling = await run("files-write", ["doc.md", "--content"]);
    expect(dangling.ok).toBe(false);
    expect(dangling.error).toContain("--content");
    expect(readFileSync(join(dir, "doc.md"), "utf8")).toBe(ORIGINAL);

    const optIn = await run("files-write", ["doc.md", "--content", "", "--allow-empty"]);
    expect(optIn.ok).toBe(true);
    expect(statSync(join(dir, "doc.md")).size).toBe(0);
  });

  test("files-edit --old / --new accept values that start with '--'", async () => {
    writeFileSync(join(dir, "m.sql"), "-- old header\nSELECT 1;\n");
    const r = await run("files-edit", ["m.sql", "--old", "-- old header", "--new", "-- new header"]);
    expect(r.ok).toBe(true);
    expect(readFileSync(join(dir, "m.sql"), "utf8")).toBe("-- new header\nSELECT 1;\n");
  });

  test("shell-exec keeps the command's own '--' flags (never drops --dry-run)", async () => {
    const r = await run(
      "shell-exec",
      ["echo", "git", "push", "--dry-run", "origin", "main"],
      ["shell-exec"],
    );
    expect(r.ok).toBe(true);
    expect((r.message ?? "").trim()).toBe("git push --dry-run origin main");

    const j = await run("shell-exec", ["echo", "pr", "list", "--json", "number"], ["shell-exec"]);
    expect(j.ok).toBe(true);
    expect((j.message ?? "").trim()).toBe("pr list --json number");
  });

  test("shell-exec leading options still work; extra words after --command are refused, not dropped", async () => {
    const lead = await run("shell-exec", ["--json", "--command", "echo lead"], ["shell-exec"]);
    expect(lead.ok).toBe(true);
    expect((lead.message ?? "").trim()).toBe("lead");

    const inline = await run("shell-exec", ["--command=echo --inline"], ["shell-exec"]);
    expect(inline.ok).toBe(true);
    expect((inline.message ?? "").trim()).toBe("--inline");

    const mixed = await run(
      "shell-exec",
      ["--command", "touch ran.txt", "--dry-run"],
      ["shell-exec"],
    );
    expect(mixed.ok).toBe(false);
    expect(existsSync(join(dir, "ran.txt"))).toBe(false);
  });

  test("search-grep treats a '--' pattern as the pattern, not a dropped flag", async () => {
    mkdirSync(join(dir, "src"));
    mkdirSync(join(dir, "other"));
    writeFileSync(join(dir, "src", "hook.sh"), "git commit --no-verify\nsrc only line\n");
    writeFileSync(join(dir, "other", "x.txt"), "src mention elsewhere\n");

    const r = await run("search-grep", ["--no-verify", "src"]);
    expect(r.ok).toBe(true);
    const data = r.data as { count: number; matches: { text: string }[] };
    expect(data.count).toBe(1);
    expect(data.matches[0]!.text).toContain("--no-verify");

    const flagged = await run("search-grep", ["--pattern", "--no-verify", "--path=src"]);
    expect(flagged.ok).toBe(true);
    expect((flagged.data as { count: number }).count).toBe(1);

    // With --pattern, the first positional is the path (not silently dropped).
    const flaggedPos = await run("search-grep", ["--pattern", "src", "other"]);
    expect(flaggedPos.ok).toBe(true);
    const fp = flaggedPos.data as { count: number; matches: { file: string }[] };
    expect(fp.count).toBe(1);
    expect(fp.matches[0]!.file).toContain("other");
  });
});
