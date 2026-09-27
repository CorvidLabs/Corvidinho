import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearRegistry } from "../src/plugins/registry.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { firstDisallowedCd } from "../plugins/shell/clamp.ts";

/**
 * Regression: SAFE-3 cd/pushd clamp bypasses (bug plugins-exec-4).
 * Option tokens, `cd -`, `{ }` / keyword heads, builtin/command/eval,
 * assignment prefixes, quoting, expansions and CDPATH used to slip past.
 */
describe("shell-exec SAFE-3 clamp bypasses (REQ-plugins-087)", () => {
  const root = "/home/u/proj";

  test("unit: the reported bypass forms are refused", () => {
    expect(firstDisallowedCd("cd - && ls", root)).toBe("$OLDPWD");
    expect(firstDisallowedCd("cd -P / && ls", root)).toBe("/");
    expect(firstDisallowedCd("{ cd /; rm x; }", root)).toBe("/");
    expect(firstDisallowedCd("if true; then cd /; ls; fi", root)).toBe("/");
    // CDPATH is no longer refused lexically — runtime `readonly CDPATH` plus a
    // dropped `CDPATH` env cover it (see the end-to-end block below).
    expect(firstDisallowedCd("CDPATH=/ && cd tmp", root)).toBeNull();
  });

  test("unit: option, wrapper, keyword and quoting variants are refused", () => {
    expect(firstDisallowedCd("cd -L -- /etc", root)).toBe("/etc");
    expect(firstDisallowedCd("cd -LP /", root)).toBe("/");
    expect(firstDisallowedCd("cd -- -", root)).toBe("$OLDPWD");
    expect(firstDisallowedCd("cd -P", root)).toBe("$HOME");
    expect(firstDisallowedCd("pushd -n /tmp", root)).toBe("/tmp");
    expect(firstDisallowedCd("while true; do cd /; done", root)).toBe("/");
    expect(firstDisallowedCd("true; else cd /", root)).toBe("/");
    expect(firstDisallowedCd("! cd /", root)).toBe("/");
    expect(firstDisallowedCd("builtin cd /", root)).toBe("/");
    expect(firstDisallowedCd("command -p cd /", root)).toBe("/");
    expect(firstDisallowedCd('eval "cd /; ls"', root)).toBe("/");
    expect(firstDisallowedCd("X=1 cd /", root)).toBe("/");
    expect(firstDisallowedCd("'cd' /", root)).toBe("/");
    expect(firstDisallowedCd("\\cd /", root)).toBe("/");
    expect(firstDisallowedCd('cd ".."/..', root)).toBe("../..");
    expect(firstDisallowedCd("cd sub/$X", root)).toBe("sub/$X");
    expect(firstDisallowedCd("cd `pwd`/..", root)).toBe("`pwd`/..");
    expect(firstDisallowedCd("cd .[.]", root)).toBe(".[.]");
    expect(firstDisallowedCd("cd .?", root)).toBe(".?");
    // See above: CDPATH is handled at runtime, not by the lexer.
    expect(firstDisallowedCd("export CDPATH=/; cd tmp", root)).toBeNull();
  });

  test("unit: in-root cd forms stay allowed", () => {
    expect(firstDisallowedCd("cd -P sub && ls", root)).toBeNull();
    expect(firstDisallowedCd("cd -- sub", root)).toBeNull();
    expect(firstDisallowedCd("{ cd sub; ls; }", root)).toBeNull();
    expect(firstDisallowedCd("if true; then cd sub; fi", root)).toBeNull();
    expect(firstDisallowedCd('cd "sub dir"', root)).toBeNull();
    expect(firstDisallowedCd("CDPATH=/ && cd ./tmp", root)).toBeNull();
    expect(firstDisallowedCd("command -v git && git status", root)).toBeNull();
  });
});

describe("shell-exec SAFE-3 end to end (REQ-plugins-087)", () => {
  let dir = "";
  let outside = "";
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
    dir = mkdtempSync(join(tmpdir(), "corvidinho-shell-bypass-"));
    outside = mkdtempSync(join(tmpdir(), "corvidinho-shell-outside-"));
    mkdirSync(join(dir, "sub"));
    mkdirSync(join(outside, "sub"));
    saved.OLDPWD = process.env.OLDPWD;
    saved.CDPATH = process.env.CDPATH;
  });

  afterEach(() => {
    for (const k of ["OLDPWD", "CDPATH"] as const) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  const run = (command: string) =>
    runPlugin({
      name: "shell-exec",
      args: ["--command", command],
      cwd: dir,
      nonInteractive: true,
      allowlist: ["shell-exec"],
    });

  test("cd - to an inherited OLDPWD is refused before spawn", async () => {
    process.env.OLDPWD = outside;
    const result = await run("cd - >/dev/null && pwd");
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.error ?? "").toContain("SAFE-3");
    expect(result.message ?? "").not.toContain(`${outside}\n`);
  });

  test("cd -P / and { cd /; } are refused before spawn", async () => {
    for (const command of ["cd -P / && pwd", "{ cd /; pwd; }"]) {
      const result = await run(command);
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.error ?? "").toContain("SAFE-3");
    }
  });

  test("an inherited CDPATH does not redirect a relative cd outside the root", async () => {
    process.env.CDPATH = outside;
    const result = await run("cd sub && pwd");
    expect(result.ok).toBe(true);
    expect(result.message ?? "").toContain(join(dir, "sub"));
    expect(result.message ?? "").not.toContain(outside);
  });
});
