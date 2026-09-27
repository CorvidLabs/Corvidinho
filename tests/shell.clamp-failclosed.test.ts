import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearRegistry } from "../src/plugins/registry.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { firstDisallowedCd } from "../plugins/shell/clamp.ts";

/**
 * Regression: SAFE-3 cd/pushd clamp must fail closed on the forms found in the
 * PR #187 review (bug fix-shell-cd-clamp-failclosed). Each of these printed a
 * path outside the root on the merged clamp; every one must now refuse before
 * spawn, while in-root forms still run.
 */
describe("shell-exec SAFE-3 fail-closed clamp (REQ-plugins-087)", () => {
  const root = "/home/u/proj";

  test("finding 1: redirections do not hide the cd target", () => {
    expect(firstDisallowedCd(">/dev/null cd /etc", root)).toBe("/etc");
    expect(firstDisallowedCd("2>/dev/null cd /etc", root)).toBe("/etc");
    expect(firstDisallowedCd("cd >/dev/null /etc", root)).toBe("/etc");
    expect(firstDisallowedCd("cd>/dev/null /etc", root)).toBe("/etc");
    expect(firstDisallowedCd("cd</dev/null /etc", root)).toBe("/etc");
    expect(firstDisallowedCd("cd -P >/dev/null /etc", root)).toBe("/etc");
    // `&` inside `2>&1` is a redirection, not a command separator.
    expect(firstDisallowedCd("cd 2>&1 /etc", root)).toBe("/etc");
    // a redirection around an in-root cd is still allowed
    expect(firstDisallowedCd("cd 2>&1 sub", root)).toBeNull();
    expect(firstDisallowedCd("cd sub >/dev/null", root)).toBeNull();
  });

  test("finding 2: quote-aware tokenizing (quoted seps + quoted targets)", () => {
    expect(firstDisallowedCd('X="a b" cd /etc', root)).toBe("/etc");
    expect(firstDisallowedCd("X=';' cd /etc", root)).toBe("/etc");
    expect(firstDisallowedCd('cd "x /../.."', root)).toBe("x /../..");
    expect(firstDisallowedCd("cd 'sub dir/../..'", root)).toBe("sub dir/../..");
    expect(firstDisallowedCd('cd "sub dir/../../.."', root)).toBe(
      "sub dir/../../..",
    );
    // quoted separators do not falsely split; in-root stays allowed
    expect(firstDisallowedCd('cd "sub dir"', root)).toBeNull();
    expect(firstDisallowedCd("X=';' cd sub", root)).toBeNull();
  });

  test("finding 3: backslash-newline continuation is joined first", () => {
    expect(firstDisallowedCd("c\\\nd /etc", root)).toBe("/etc");
    expect(firstDisallowedCd("cd sub/\\\n../..", root)).toBe("sub/../..");
    expect(firstDisallowedCd("cd sub/\\\ndeep", root)).toBeNull();
  });

  test("finding 4: expanded command words and substitutions refuse", () => {
    expect(firstDisallowedCd("$(echo cd) /etc", root)).toBe("$(echo cd)");
    expect(firstDisallowedCd("`echo cd` /etc", root)).toBe("`echo cd`");
    expect(firstDisallowedCd("x=cd; $x /etc", root)).toBe("$x");
    expect(firstDisallowedCd("cd${IFS}/etc", root)).toBe("cd${IFS}/etc");
    expect(firstDisallowedCd("eval $(printf 'cd /etc')", root)).toBe(
      "$(printf 'cd /etc')",
    );
    expect(firstDisallowedCd("v='cd /etc'; eval $v", root)).toBe("$v");
    // command substitution whose body escapes the root refuses (subshell can
    // still run `cat` from /etc)
    expect(firstDisallowedCd("echo `cd /etc`", root)).toBe("/etc");
    expect(firstDisallowedCd("echo $(cd /etc && cat x)", root)).toBe("/etc");
    // eval re-parses its argument, so a quoted escaping cd is still caught
    expect(firstDisallowedCd("eval eval cd /etc", root)).toBe("/etc");
    expect(firstDisallowedCd('eval "c"\x27d /etc\x27', root)).toBe("/etc");
    // in-root substitutions / expanded non-command args stay allowed
    expect(firstDisallowedCd("echo $(cd sub && ls)", root)).toBeNull();
    expect(firstDisallowedCd("echo `cd sub`", root)).toBeNull();
    expect(firstDisallowedCd("grep -r 'cd /etc' .", root)).toBeNull();
    expect(firstDisallowedCd('echo "total $count"', root)).toBeNull();
    expect(firstDisallowedCd("eval 'cd sub'", root)).toBeNull();
  });

  test("minor: bash `X+=` assignment prefix and DIRSTACK writes", () => {
    expect(firstDisallowedCd("X+=1 cd /etc", root)).toBe("/etc");
    expect(firstDisallowedCd("pushd sub; DIRSTACK[1]=/etc; popd", root)).toBe(
      "$DIRSTACK",
    );
  });
});

describe("shell-exec SAFE-3 fail-closed end to end (REQ-plugins-087)", () => {
  let dir = "";
  let outside = "";
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
    dir = mkdtempSync(join(tmpdir(), "corvidinho-failclosed-"));
    outside = mkdtempSync(join(tmpdir(), "corvidinho-failclosed-out-"));
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

  test("every reviewed escape is refused before spawn (exit 2, SAFE-3)", async () => {
    const escapes = [
      ">/dev/null cd /etc && pwd",
      "cd >/dev/null /etc && pwd",
      "cd>/dev/null /etc; pwd",
      "cd</dev/null /etc; pwd",
      "cd 2>&1 /etc; pwd",
      'X="a b" cd /etc; pwd',
      "X=';' cd /etc; pwd",
      'cd "x /../.."; pwd',
      "c\\\nd /etc; pwd",
      "cd sub/\\\n../..; pwd",
      "$(echo cd) /etc; pwd",
      "echo `cd /etc && pwd`",
      "eval $(printf 'cd /etc'); pwd",
    ];
    for (const command of escapes) {
      const result = await run(command);
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.error ?? "").toContain("SAFE-3");
      // never leaked the outside path
      expect(result.message ?? "").not.toContain("\n/etc\n");
    }
  });

  test("dynamically set CDPATH cannot redirect a relative cd (runtime readonly)", async () => {
    // Lexically allowed now; the child shell's `readonly CDPATH` stops the
    // assignment from taking effect, so `cd sub` resolves against the cwd.
    for (const command of [
      "export CDPATH=$OTHER; cd sub && pwd",
      "v=CDPAT; export ${v}H=$OTHER; cd sub && pwd",
    ]) {
      const result = await run(command.replace("$OTHER", outside));
      expect(result.message ?? "").not.toContain(join(outside, "sub"));
    }
  });

  test("inherited CDPATH/OLDPWD are dropped; in-root cd still works", async () => {
    process.env.CDPATH = outside;
    process.env.OLDPWD = outside;
    const ok = await run("cd sub && pwd");
    expect(ok.ok).toBe(true);
    expect(ok.message ?? "").toContain(join(dir, "sub"));
    expect(ok.message ?? "").not.toContain(outside);
  });

  test("in-root forms with redirections, quoting and continuations still run", async () => {
    const allowed: [string, string][] = [
      ["cd sub >/dev/null && pwd", join(dir, "sub")],
      ["cd 2>&1 sub && pwd", join(dir, "sub")],
      ['cd "sub" && pwd', join(dir, "sub")],
      ["cd sub/\\\n../sub && pwd", join(dir, "sub")],
      ["echo $(cd sub && basename \"$(pwd)\")", "sub"],
    ];
    for (const [command, want] of allowed) {
      const result = await run(command);
      expect(result.ok).toBe(true);
      expect(result.message ?? "").toContain(want);
    }
  });
});
