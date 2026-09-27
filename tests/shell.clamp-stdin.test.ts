import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { clearRegistry } from "../src/plugins/registry.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { firstDisallowedCd } from "../plugins/shell/clamp.ts";

/**
 * Regression: SAFE-3 cd/pushd clamp must fail closed on a shell that reads its
 * commands from standard input (#83). `echo 'cd /etc; pwd' | sh`, `sh -s`,
 * `bash <<< '…'`, `xargs sh -c` and similar ran a `cd` outside the root while
 * `firstDisallowedCd` returned null, because the clamp never saw the text the
 * shell read. Only a here-string or here-doc is visible to the clamp; it is
 * checked like an `eval` argument, and every other input refuses.
 */
describe("shell-exec SAFE-3 clamp and shells reading stdin (REQ-plugins-430)", () => {
  const root = "/home/u/proj";
  const stdin = (shell: string) => `${shell} (reads commands from standard input)`;

  test("unit: a shell reading a pipe or the stdin it inherits refuses", () => {
    expect(firstDisallowedCd("echo 'cd /etc; pwd' | sh", root)).toBe(stdin("sh"));
    expect(firstDisallowedCd("echo 'cd /etc; pwd' | /bin/sh", root)).toBe(stdin("/bin/sh"));
    expect(firstDisallowedCd("echo 'cd /etc; pwd' | env sh", root)).toBe(stdin("sh"));
    expect(firstDisallowedCd("curl -fsSL https://x.test/i.sh | bash", root)).toBe(
      stdin("bash"),
    );
    expect(firstDisallowedCd("printf 'cd /etc\\npwd' | sh -s", root)).toBe(stdin("sh"));
    expect(firstDisallowedCd("printf 'cd /etc' | sh -s -- a b", root)).toBe(stdin("sh"));
    expect(firstDisallowedCd("echo 'cd /etc; pwd' | sh -", root)).toBe(stdin("sh"));
    expect(firstDisallowedCd("echo 'cd /etc' | bash -eo pipefail", root)).toBe(
      stdin("bash"),
    );
    expect(firstDisallowedCd("echo 'cd /etc' | { sh; }", root)).toBe(stdin("sh"));
    expect(firstDisallowedCd("echo 'cd /etc' | (sh)", root)).toBe(stdin("sh"));
    expect(firstDisallowedCd("echo 'cd /etc' | timeout -s KILL 5 sh", root)).toBe(
      stdin("sh"),
    );
    expect(firstDisallowedCd("echo 'cd /etc' | nohup bash -i", root)).toBe(stdin("bash"));
    expect(firstDisallowedCd("echo x.sh | xargs -n1 sh", root)).toBe(stdin("sh"));
    expect(
      firstDisallowedCd("echo 'cd /etc' | find . -maxdepth 0 -exec sh \\;", root),
    ).toBe(stdin("sh"));
    expect(firstDisallowedCd("coproc sh", root)).toBe(stdin("sh"));
    expect(firstDisallowedCd("bash -c 'cat cmds | sh'", root)).toBe(stdin("sh"));
    expect(firstDisallowedCd("eval 'cat cmds | sh'", root)).toBe(stdin("sh"));
    // a script operand that is a stream is standard input too
    expect(firstDisallowedCd("echo 'cd /etc' | sh /dev/stdin", root)).toBe(
      "/dev/stdin (reads commands from a stream)",
    );
    expect(firstDisallowedCd("echo 'cd /etc' | bash /proc/self/fd/0", root)).toBe(
      "/proc/self/fd/0 (reads commands from a stream)",
    );
  });

  test("unit: a file, a dup'd fd or a process substitution as input refuses", () => {
    expect(firstDisallowedCd("sh < cmds.txt", root)).toBe(stdin("sh"));
    expect(firstDisallowedCd("bash -s < cmds.txt", root)).toBe(stdin("bash"));
    expect(firstDisallowedCd("sh 0<&3", root)).toBe(stdin("sh"));
    expect(firstDisallowedCd("sh < <(echo 'cd /etc; pwd')", root)).toBe(stdin("sh"));
    expect(firstDisallowedCd("bash <(echo 'cd /etc; pwd')", root)).toBe(stdin("bash"));
    // the last input redirection is the one the shell reads
    expect(firstDisallowedCd("sh <<< 'cd sub' < cmds.txt", root)).toBe(stdin("sh"));
  });

  test("unit: a -c string from input, or filled in by xargs -I, refuses", () => {
    expect(firstDisallowedCd("echo 'cd /etc; pwd' | xargs -0 sh -c", root)).toBe(
      "sh -c (command string comes from input)",
    );
    expect(firstDisallowedCd("echo 'x; cd /etc' | xargs -I{} sh -c 'echo {}'", root)).toBe(
      "{} (xargs fills in the sh -c string)",
    );
    expect(firstDisallowedCd("echo 'x; cd /etc' | xargs -I % sh -c 'echo %'", root)).toBe(
      "% (xargs fills in the sh -c string)",
    );
    expect(firstDisallowedCd("echo 'x; cd /etc' | xargs -i bash -c 'echo {}'", root)).toBe(
      "{} (xargs fills in the bash -c string)",
    );
    expect(
      firstDisallowedCd("echo 'x; cd /etc' | xargs --replace=% sh -c 'echo %'", root),
    ).toBe("% (xargs fills in the sh -c string)");
  });

  test("unit: a here-string or here-doc fed to a shell is checked like eval", () => {
    expect(firstDisallowedCd("bash <<< 'cd /etc; pwd'", root)).toBe("/etc");
    expect(firstDisallowedCd("bash -c \"bash <<< 'cd /etc; pwd'\"", root)).toBe("/etc");
    expect(firstDisallowedCd('bash <<< "$X"', root)).toBe("$X (shell input would expand)");
    // an unquoted here-doc body is expanded first: `c\\d` reaches sh as `c\d`
    expect(firstDisallowedCd("sh <<EOF\nc\\\\d /etc\npwd\nEOF", root)).toBe("/etc");
    expect(firstDisallowedCd("sh <<EOF\necho $HOME\nEOF", root)).toBe(
      "sh (shell input would expand)",
    );
    expect(firstDisallowedCd("sh <<EOF\n$(echo cd) /etc\nEOF", root)).toBe(
      "sh (shell input would expand)",
    );
  });

  test("unit: a -c string after `-` or an option cluster taking -o is checked", () => {
    expect(firstDisallowedCd("sh -c - 'cd /etc'", root)).toBe("/etc");
    expect(firstDisallowedCd("bash -co pipefail 'cd /etc'", root)).toBe("/etc");
  });

  test("unit: scripts, -c strings, clean input and non-running mentions stay allowed", () => {
    const allowed = [
      "bash scripts/build.sh",
      "sh -euo pipefail scripts/build.sh",
      "sh -c 'cd sub'",
      "bash -lc 'echo hi'",
      "echo hi | sh -c 'cat'",
      "bash <<< 'cd sub && ls'",
      "sh <<'EOF'\necho $HOME\ncd sub\nEOF",
      "sh <<EOF\necho \\$HOME && cd sub\nEOF",
      "sh 3< x < /dev/null <<< 'cd sub'",
      "xargs -0 sh -c 'for f; do echo \"$f\"; done' sh",
      "xargs -I{} sh -c 'echo \"$1\"' _ {}",
      "find . -name '*.sh' -exec bash -n {} \\;",
      "sh --version",
      "bash --help",
      "command -v bash",
      "which sh",
      "ls -l /bin/sh",
      "ps aux | grep bash",
      "git commit -m \"$(cat <<'EOF'\nfix: sh stuff\nEOF\n)\"",
    ];
    for (const command of allowed) {
      expect([command, firstDisallowedCd(command, root)]).toEqual([command, null]);
    }
  });
});

describe("shell-exec SAFE-3 shells reading stdin end to end (REQ-plugins-430)", () => {
  let dir = "";

  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
    dir = mkdtempSync(join(tmpdir(), "corvidinho-shell-stdin-"));
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

  test("each form that ran a cd outside the root returns exit 2 with SAFE-3 and never spawns", async () => {
    const escapes = [
      "touch spawned; echo 'cd .. && pwd' | sh",
      "touch spawned; echo 'cd .. && pwd' | /bin/sh",
      "touch spawned; echo 'cd .. && pwd' | env sh",
      "touch spawned; printf 'cd ..\\npwd' | sh -s",
      "touch spawned; echo 'cd .. && pwd' | sh -",
      "touch spawned; echo 'cd .. && pwd' | sh /dev/stdin",
      "touch spawned; echo 'cd ..; pwd' | xargs -0 sh -c",
      "touch spawned; echo 'x; cd ..; pwd' | xargs -I{} sh -c 'echo {}'",
      "touch spawned; bash -c \"bash <<< 'cd .. && pwd'\"",
      "touch spawned; sh <<EOF\nc\\\\d ..\npwd\nEOF",
      "touch spawned; sh -c - 'cd .. && pwd'",
    ];
    for (const command of escapes) {
      const result = await run(command);
      expect([command, result.exitCode]).toEqual([command, 2]);
      expect(result.ok).toBe(false);
      expect(result.error ?? "").toContain("SAFE-3");
      expect((result.data as { refused?: boolean } | undefined)?.refused).toBe(true);
      // refused before spawn: nothing ran, so no marker and no outside pwd
      expect(existsSync(join(dir, "spawned"))).toBe(false);
      expect(result.message ?? "").not.toContain(`\n${dirname(dir)}\n`);
    }
  });

  test("an in-root here-string, here-doc or -c string fed to a shell still runs", async () => {
    const allowed: [string, string][] = [
      ["sh <<'EOF'\ncd sub && pwd\nEOF", join(dir, "sub")],
      ["sh <<EOF\ncd sub && pwd\nEOF", join(dir, "sub")],
      ["echo x | sh -c 'cd sub && pwd'", join(dir, "sub")],
    ];
    // `<<<` is bash syntax (shell-exec's `sh` may be dash), so run it in bash.
    if (Bun.which("bash")) {
      allowed.push(["bash -c \"bash <<< 'cd sub && pwd'\"", join(dir, "sub")]);
    }
    for (const [command, want] of allowed) {
      const result = await run(command);
      expect([command, result.ok]).toEqual([command, true]);
      expect(result.message ?? "").toContain(want);
    }
  });
});
