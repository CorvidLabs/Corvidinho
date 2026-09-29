import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { clearRegistry } from "../src/plugins/registry.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { firstDisallowedCd } from "../plugins/shell/clamp.ts";

/**
 * Regression: SAFE-3 cd/pushd clamp must read quoting the way the shell does
 * (bug shell-cd-clamp-quoting). Quoted or escaped whitespace used to split one
 * shell word into pieces, and an escaped backslash before a newline, a quote
 * inside a `#` comment or here-doc body, or a `)` inside a comment in `$( )`
 * put the clamp's quote state out of step with dash, so a real `cd` ran
 * outside the root while `firstDisallowedCd` returned null.
 */
describe("shell-exec SAFE-3 clamp reads quoting like the shell (REQ-plugins-087)", () => {
  const root = "/home/u/proj";

  test("unit: each reported quoted or escaped target is checked as one word", () => {
    expect(firstDisallowedCd('mkdir -p "a b" && cd "a b/../.." && pwd', root)).toBe(
      "a b/../..",
    );
    expect(firstDisallowedCd('cd "zz q/../.." && pwd', root)).toBe("zz q/../..");
    expect(firstDisallowedCd("cd a\\ b/../.. && pwd", root)).toBe("a b/../..");
    expect(firstDisallowedCd("cd 'a b'/../.. && pwd", root)).toBe("a b/../..");
    expect(firstDisallowedCd('X="a b" cd /etc && pwd', root)).toBe("/etc");
    expect(firstDisallowedCd("cd sub/..\\\n/.. && pwd", root)).toBe("sub/../..");
    // the separator split still exposes a cd inside an eval string
    expect(firstDisallowedCd('eval "cd /; ls"', root)).toBe("/");
    expect(firstDisallowedCd("eval 'cd \"a b/../..\"'", root)).toBe("a b/../..");
  });

  test("unit: an escaped backslash before a newline does not join the lines", () => {
    expect(firstDisallowedCd("echo a\\\\\ncd /etc && pwd", root)).toBe("/etc");
    expect(firstDisallowedCd('echo "a\\\\"\ncd /etc', root)).toBe("/etc");
    // backslash-newline inside single quotes is literal, not a continuation
    expect(firstDisallowedCd("cd '/home/u/pr\\\noj'", root)).toBe(
      "/home/u/pr\\\noj",
    );
  });

  test("unit: a # comment runs to the newline, so a quote in it hides nothing", () => {
    expect(firstDisallowedCd('echo #"\ncd /etc && pwd #"', root)).toBe("/etc");
    expect(firstDisallowedCd("echo x #'\nX=\"a;b\" cd /etc #'", root)).toBe("/etc");
    // `#` inside a word is not a comment
    expect(firstDisallowedCd("cd sub#/../..", root)).toBe("sub#/../..");
    expect(firstDisallowedCd("cd sub # don't go up", root)).toBeNull();
    expect(firstDisallowedCd("echo $# a#b && cd sub", root)).toBeNull();
  });

  test("unit: a quote in a here-doc body does not hide the commands after it", () => {
    expect(firstDisallowedCd('cat <<EOF >/dev/null\n"\nEOF\ncd /etc && pwd #"', root)).toBe(
      "/etc",
    );
    expect(firstDisallowedCd("cat <<'EOF' >/dev/null\n'\nEOF\ncd /etc && pwd #'", root)).toBe(
      "/etc",
    );
    expect(firstDisallowedCd('cat <<-EOF >/dev/null\n\t"\n\tEOF\ncd /etc && pwd #"', root)).toBe(
      "/etc",
    );
    // two here-docs on one line are read in order
    expect(firstDisallowedCd("cat <<A <<B\n\"\nA\n'\nB\ncd /etc", root)).toBe("/etc");
    // an unquoted here-doc still runs its $( ) and backticks
    expect(firstDisallowedCd("cat <<EOF\n$(cd /etc && cat x)\nEOF", root)).toBe("/etc");
    expect(firstDisallowedCd("cat <<EOF\n`cd /etc`\nEOF", root)).toBe("/etc");
    // a backtick in the delimiter is literal, so the body after it still expands
    expect(firstDisallowedCd("cat <<`x\n#' $(cd ..)", root)).toBe("..");
    expect(firstDisallowedCd("<<` EOF\n #' \\ $(cd ..)", root)).toBe("..");
    // bash reads `(( x << 2 ))` as arithmetic, so the next line is a command
    expect(firstDisallowedCd("(( x = 1 << 2 ))\ncd /etc", root)).toBe("/etc");
    // ... also when quote removal inside an eval argument forms the `<<`
    expect(firstDisallowedCd("eval '(( x = 1 <''< 2 ))\ncd /etc'", root)).toBe("/etc");
    // body lines are also read as commands, as before (fail closed)
    expect(firstDisallowedCd("cat <<EOF\ncd /etc\nEOF\ncd sub", root)).toBe("/etc");
    // a stray quote or apostrophe in a body leaves an in-root cd allowed
    expect(firstDisallowedCd("cat <<EOF\ndon't\nEOF\ncd sub", root)).toBeNull();
    expect(firstDisallowedCd("cat <<'EOF' >notes\n\"quoted\n\tEOF\nEOF\ncd sub", root)).toBeNull();
  });

  test("unit: the end of a $( ) is found by the same tokenizer", () => {
    expect(firstDisallowedCd('x=$(echo hi # )"\n); cd /etc #"', root)).toBe("/etc");
    expect(firstDisallowedCd('x=$(cat <<EOF\n)"\nEOF\n); cd /etc #"', root)).toBe("/etc");
    expect(firstDisallowedCd("echo $(echo \\)); cd /etc", root)).toBe("/etc");
    expect(firstDisallowedCd("echo $(cd sub && echo ')'); cd sub", root)).toBeNull();
  });

  test("unit: a cd/pushd left open by a quote or a trailing backslash is refused", () => {
    expect(firstDisallowedCd('cd "sub', root)).toBe('"sub');
    expect(firstDisallowedCd("cd 'sub", root)).toBe("'sub");
    expect(firstDisallowedCd("cd sub\\", root)).toBe("sub\\");
    expect(firstDisallowedCd('ls; pushd sub "x', root)).toBe('sub "x');
    expect(firstDisallowedCd("cd -P 'sub dir", root)).toBe("'sub dir");
    // an open quote in another command is left to the shell, which will not run it
    expect(firstDisallowedCd('cd sub && echo "x', root)).toBeNull();
  });

  test("unit: nesting too deep to check refuses instead of recursing without bound", () => {
    const nest = (depth: number, inner: string) =>
      `echo ${"$(echo ".repeat(depth)}${inner}${")".repeat(depth)}`;
    expect(firstDisallowedCd(nest(20, "cd sub"), root)).toBeNull();
    expect(firstDisallowedCd(`${"eval ".repeat(20)}cd sub`, root)).toBeNull();
    expect(firstDisallowedCd(nest(100, "cd sub"), root)).toBe(
      "(nested too deeply to check)",
    );
    expect(firstDisallowedCd(`${"eval ".repeat(100)}cd sub`, root)).toBe(
      "(nested too deeply to check)",
    );
    expect(firstDisallowedCd(nest(100_000, "cd /etc"), root)).toBe(
      "(nested too deeply to check)",
    );
  });

  test("unit: bash's $'…' quoting is read as bash reads it too", () => {
    // bash ends `$'\''` after the escaped quote; dash reads `$` then `'\'`
    expect(firstDisallowedCd("echo $'\\''; cd /etc #'", root)).toBe("/etc");
    expect(firstDisallowedCd("echo $'a\\'b'; X=\"a;b\" cd /etc #'", root)).toBe("/etc");
    // escapes decode to text the clamp does not model, so they count as expansions
    expect(firstDisallowedCd("cd $'\\x2e\\x2e'", root)).not.toBeNull();
    expect(firstDisallowedCd("$'\\x63d' /etc", root)).not.toBeNull();
    expect(firstDisallowedCd("echo $'a\\tb' && cd sub", root)).toBeNull();
  });

  test("unit: a shell's -c string is checked like an eval argument", () => {
    expect(firstDisallowedCd("sh -c 'cd /etc && pwd'", root)).toBe("/etc");
    expect(firstDisallowedCd("bash -c 'cd /etc'", root)).toBe("/etc");
    expect(firstDisallowedCd("/bin/sh -ec 'cd /etc; pwd'", root)).toBe("/etc");
    expect(firstDisallowedCd("bash --norc -o pipefail -c 'cd ..'", root)).toBe("..");
    expect(firstDisallowedCd("sh -c -- 'cd /etc'", root)).toBe("/etc");
    // `-` ends the options too, and `o` in a cluster takes the next word
    expect(firstDisallowedCd("sh -c - 'cd /etc'", root)).toBe("/etc");
    expect(firstDisallowedCd("bash -co pipefail 'cd /etc'", root)).toBe("/etc");
    expect(firstDisallowedCd("bash -eo pipefail -c 'cd ..'", root)).toBe("..");
    // behind wrappers: any word naming a shell counts
    expect(firstDisallowedCd("env X=1 sh -c 'cd /etc; pwd'", root)).toBe("/etc");
    expect(firstDisallowedCd("timeout 5 sh -c 'cd /etc'", root)).toBe("/etc");
    expect(firstDisallowedCd("echo x | xargs sh -c 'cd /etc'", root)).toBe("/etc");
    expect(firstDisallowedCd("find . -exec sh -c 'cd /etc; pwd' \\;", root)).toBe("/etc");
    // nested quoting inside the -c string, and a string that would expand
    expect(firstDisallowedCd("sh -c 'cd \"a b/../..\"'", root)).toBe("a b/../..");
    expect(firstDisallowedCd('sh -c "cd $X"', root)).toBe("cd $X");
    // in-root -c strings stay allowed (a shell's script file: clamp-scripts)
    expect(firstDisallowedCd("sh -c 'cd sub && ls'", root)).toBeNull();
    expect(firstDisallowedCd("bash -lc 'echo hi'", root)).toBeNull();
    expect(firstDisallowedCd('grep -r "sh -c" .', root)).toBeNull();
  });

  test("unit: in-root forms with quoting, comments, here-docs and continuations stay allowed", () => {
    expect(firstDisallowedCd('cd "sub dir"', root)).toBeNull();
    expect(firstDisallowedCd("cd sub\\ dir && ls", root)).toBeNull();
    expect(firstDisallowedCd("cd 'sub dir'/x", root)).toBeNull();
    expect(firstDisallowedCd("cd sub \\\n&& ls", root)).toBeNull();
    expect(firstDisallowedCd("eval 'cd \"sub dir\"'", root)).toBeNull();
    expect(firstDisallowedCd("find . -name x -exec rm {} \\; && cd sub", root)).toBeNull();
  });
});

describe("shell-exec SAFE-3 quoting end to end (REQ-plugins-087)", () => {
  let dir = "";

  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
    dir = mkdtempSync(join(tmpdir(), "corvidinho-shell-quoting-"));
    mkdirSync(join(dir, "sub"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const run = (command: string) =>
    runPlugin({
      name: "shell-exec",
      args: ["--command", command],
      cwd: dir,
      nonInteractive: true,
      allowlist: ["shell-exec"],
    });

  test("each escaping form returns exit 2 with SAFE-3 and never spawns", async () => {
    const escapes = [
      'mkdir -p "a b" && cd "a b/../.." && pwd',
      'touch spawned; cd "zz q/../.." && pwd',
      "touch spawned; cd a\\ b/../.. && pwd",
      "touch spawned; cd 'a b'/../.. && pwd",
      'touch spawned; X="a b" cd /etc && pwd',
      "touch spawned; cd sub/..\\\n/.. && pwd",
      "touch spawned; echo a\\\\\ncd /etc && pwd",
      'touch spawned; echo #"\ncd /etc && pwd #"',
      'touch spawned; cat <<EOF >/dev/null\n"\nEOF\ncd /etc && pwd #"',
      'touch spawned; x=$(echo hi # )"\n); cd /etc && pwd #"',
      'touch spawned; cd "sub',
      "touch spawned; cd sub\\",
      "touch spawned; sh -c 'cd /etc && pwd'",
      "touch spawned; echo x | xargs sh -c 'cd /etc && pwd'",
      "touch spawned; echo $'\\''; cd /etc && pwd #'",
    ];
    for (const command of escapes) {
      const result = await run(command);
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.error ?? "").toContain("SAFE-3");
      expect((result.data as { refused?: boolean } | undefined)?.refused).toBe(true);
      // refused before spawn: nothing ran, so no marker and no outside pwd
      expect(existsSync(join(dir, "spawned"))).toBe(false);
      expect(existsSync(join(dir, "a b"))).toBe(false);
      expect(result.message ?? "").not.toContain(`\n${dirname(dir)}\n`);
    }
  });

  test("in-root quoted, commented and here-doc forms still run", async () => {
    const allowed: [string, string][] = [
      ['mkdir -p "a b" && cd "a b" && pwd', join(dir, "a b")],
      ["cd sub # don't go up\npwd", join(dir, "sub")],
      ["cat <<EOF\ndon't\nEOF\ncd sub && pwd", join(dir, "sub")],
      ["cd sub \\\n&& pwd", join(dir, "sub")],
      ["sh -c 'cd sub && pwd'", join(dir, "sub")],
    ];
    for (const [command, want] of allowed) {
      const result = await run(command);
      expect(result.ok).toBe(true);
      expect(result.message ?? "").toContain(want);
    }
  });
});
