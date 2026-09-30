import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
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

/**
 * Regression (SAFE-3, REQ-plugins-495): `env -C` / `--chdir` ran the wrapped
 * command in any directory, and a `cd` / `pushd` through an in-root symlink
 * (committed, or made by `ln -s` in the same command) landed outside the root
 * while the lexical check saw an in-root path.
 */
describe("shell-exec SAFE-3: env -C and symlinked cd can't leave the root (REQ-plugins-495)", () => {
  let root = "";
  let outside = "";

  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
    root = mkdtempSync(join(tmpdir(), "corvidinho-shell-links-"));
    outside = mkdtempSync(join(tmpdir(), "corvidinho-shell-links-out-"));
    mkdirSync(join(root, "sub"));
    mkdirSync(join(root, "sub", "deep"));
    symlinkSync("/", join(root, "up"));
    symlinkSync(outside, join(root, "sub", "out"));
    symlinkSync(join(root, "sub"), join(root, "insub"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  test("unit: env -C / --chdir (also clustered or abbreviated) and sudo -D are checked like cd", () => {
    expect(firstDisallowedCd("env -C / ls", root)).toBe("/ (env -C)");
    expect(firstDisallowedCd("env --chdir=/ ls", root)).toBe("/ (env --chdir)");
    expect(firstDisallowedCd("env --chdir /etc sh -c pwd", root)).toBe("/etc (env --chdir)");
    expect(firstDisallowedCd("env -iC/ ls", root)).toBe("/ (env -C)");
    expect(firstDisallowedCd("env --ch=.. ls", root)).toBe(".. (env --chdir)");
    expect(firstDisallowedCd("env -C up ls", root)).toBe("up (env -C)");
    expect(firstDisallowedCd("env -C $D ls", root)).toBe("$D (env -C)");
    expect(firstDisallowedCd("sudo -D / ls", root)).toBe("/ (sudo -D)");
    expect(firstDisallowedCd("find . -exec env -C / ls \\;", root)).toBe("/ (env -C)");
    // A wrapper string the clamp cannot split fails closed.
    expect(firstDisallowedCd("env -S 'sh -c \"cd /\"'", root)).toContain("cannot read");
    expect(firstDisallowedCd("env -C sub ls", root)).toBeNull();
    expect(firstDisallowedCd("env -C sub ./x.sh", root)).toBeNull();
  });

  test("unit: cd / pushd through an in-root symlink that points out refuses", () => {
    expect(firstDisallowedCd("cd up && ls", root)).toBe("up");
    expect(firstDisallowedCd("pushd up", root)).toBe("up");
    expect(firstDisallowedCd("cd up/etc", root)).toBe("up/etc");
    expect(firstDisallowedCd("cd sub && cd out", root)).toBe("out");
    expect(firstDisallowedCd("cd nothere/../up", root)).toBe("nothere/../up");
    expect(firstDisallowedCd("cd insub && cd deep", root)).toBeNull();
    expect(firstDisallowedCd("cd sub/deep/../..", root)).toBeNull();
  });

  test("unit: ln with a target that leads out refuses (the link could be cd'd through)", () => {
    expect(firstDisallowedCd("ln -s / x && cd x", root)).toBe("/ (ln target)");
    expect(firstDisallowedCd("ln -sfn /etc cfg", root)).toBe("/etc (ln target)");
    expect(firstDisallowedCd("ln -s ../../x sub/l", root)).toBe("../../x (ln target)");
    expect(firstDisallowedCd("ln /etc/hosts h", root)).toBe("/etc/hosts (ln target)");
    expect(firstDisallowedCd("ln -s $T x", root)).toBe("$T (ln target)");
    expect(firstDisallowedCd("ln -s ../sub sub/again", root)).toBeNull();
    expect(firstDisallowedCd("ln -s sub l", root)).toBeNull();
  });

  const run = (command: string) =>
    runPlugin({
      name: "shell-exec",
      args: ["--command", command],
      cwd: root,
      nonInteractive: true,
      allowlist: ["shell-exec"],
    });

  test("end to end: env -C / and cd through a symlink are refused before spawn; in-root links still work", async () => {
    for (const command of [
      "touch spawned; env -C / pwd",
      "touch spawned; env --chdir=/ pwd",
      "touch spawned; cd up && pwd",
      "touch spawned; cd sub/out && pwd",
      "touch spawned; ln -s / x && cd x && pwd",
    ]) {
      const result = await run(command);
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.error ?? "").toContain("SAFE-3");
      expect(existsSync(join(root, "spawned"))).toBe(false);
      expect(existsSync(join(root, "x"))).toBe(false);
    }
    const ok = await run("env -C sub pwd && cd insub && pwd");
    expect(ok.ok).toBe(true);
    expect(ok.message ?? "").toContain(join(root, "sub"));
  });
});
