import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearRegistry } from "../src/plugins/registry.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { firstDisallowedCd } from "../plugins/shell/clamp.ts";

/**
 * Regression: SAFE-3 cd/pushd clamp must check the scripts a command runs in
 * a shell (bug shell-cd-clamp-scripts). `. ./x.sh`, `sh x.sh`, `./x.sh`,
 * `sh < x.sh`, a here-doc fed to a shell, `trap` actions and aliases all ran a
 * `cd` the clamp never read, so a script could leave the project root while
 * `firstDisallowedCd` returned null. Scripts are now read and checked like the
 * command itself; what cannot be read refuses.
 */
let dir = "";

/** A project dir with safe and escaping scripts. */
function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), "corvidinho-shell-scripts-"));
  mkdirSync(join(root, "sub"));
  mkdirSync(join(root, "scripts"));
  const put = (name: string, text: string) => {
    writeFileSync(join(root, name), text);
    chmodSync(join(root, name), 0o755);
  };
  put("ok.sh", "#!/bin/sh\necho ok-ran\n");
  put("okcd.sh", "#!/bin/sh\ncd sub && pwd\n");
  put("scripts/build.sh", "#!/usr/bin/env bash\nset -e\ncd sub\necho built\n");
  put("bad.sh", "#!/bin/sh\ntouch spawned\ncd /etc && pwd\n");
  put("noshebang", "cd /etc\n");
  put("badbash", "#!/usr/bin/env -S bash -e\ncd ..\n");
  put("varcd.sh", '#!/bin/sh\ncd "$(dirname "$0")"\n');
  put("nested.sh", "#!/bin/sh\n. ./bad.sh\n");
  put("self.sh", "#!/bin/sh\n. ./self.sh\n");
  put("sub/inner.sh", "cd ../..\n");
  put("tool.py", "#!/usr/bin/env python3\nimport os\nos.chdir('/etc')\n");
  copyFileSync("/bin/true", join(root, "bin-true"));
  return root;
}

describe("shell-exec SAFE-3 clamp checks the scripts a command runs (REQ-plugins-087)", () => {
  beforeEach(() => {
    dir = makeProject();
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const check = (cmd: string) => firstDisallowedCd(cmd, dir);

  test("unit: a sourced, shell-run or executed script that escapes refuses", () => {
    expect(check(". ./bad.sh")).toBe("/etc (in ./bad.sh)");
    expect(check("source bad.sh")).toBe("/etc (in bad.sh)");
    expect(check("sh bad.sh")).toBe("/etc (in bad.sh)");
    expect(check("bash -e ./bad.sh arg")).toBe("/etc (in ./bad.sh)");
    expect(check("./bad.sh")).toBe("/etc (in ./bad.sh)");
    expect(check("./noshebang")).toBe("/etc (in ./noshebang)");
    expect(check("./badbash")).toBe(".. (in ./badbash)");
    expect(check('./varcd.sh')).toBe('$(dirname "$0") (in ./varcd.sh)');
    // behind exec wrappers and find -exec
    expect(check("env X=1 ./bad.sh")).toBe("/etc (in ./bad.sh)");
    expect(check("timeout 5 ./bad.sh")).toBe("/etc (in ./bad.sh)");
    expect(check("exec ./bad.sh")).toBe("/etc (in ./bad.sh)");
    expect(check("find . -maxdepth 0 -exec ./bad.sh \\;")).toBe("/etc (in ./bad.sh)");
    // nested, relative to an earlier cd, and a sourced script sourcing itself
    expect(check(". ./nested.sh")).toBe("/etc (in ./bad.sh) (in ./nested.sh)");
    expect(check("cd sub && . ./inner.sh")).toBe("../.. (in ./inner.sh)");
    expect(check("(cd sub && sh ../bad.sh)")).toBe("/etc (in ../bad.sh)");
    expect(check(". ./self.sh")).toBeNull();
    // startup files: BASH_ENV and --rcfile
    expect(check("BASH_ENV=./bad.sh bash -c true")).toBe("/etc (in ./bad.sh)");
    expect(check("bash --rcfile bad.sh -i ok.sh")).toBe("/etc (in bad.sh)");
  });

  test("unit: a shell reading commands from its input checks that input", () => {
    expect(check("sh < bad.sh")).toBe("/etc (in bad.sh)");
    expect(check("sh -s arg < bad.sh")).toBe("/etc (in bad.sh)");
    expect(check("sh <<'EOF'\ncd /etc\nEOF")).toBe("/etc");
    expect(check("sh <<EOF\nc\\\\d /etc\nEOF")).toBe("/etc");
    expect(check("sh <<EOF\n'$C' /etc\nEOF")).toBe("sh (shell input would expand)");
    expect(check("bash <<< 'cd /etc'")).toBe("/etc");
    expect(check('bash <<< "$X"')).toBe("$X (shell input would expand)");
    // input the clamp cannot see: a pipe, inherited stdin, process substitution
    expect(check("cat bad.sh | sh")).toBe("sh (reads commands from standard input)");
    expect(check("{ sh; } < bad.sh")).toBe("sh (reads commands from standard input)");
    expect(check("bash < <(cat bad.sh)")).toBe("bash (reads commands from standard input)");
    expect(check(". <(cat bad.sh)")).toBe(". (script not named)");
    // in-root input stays allowed
    expect(check("sh <<'EOF'\ncd sub && pwd\nEOF")).toBeNull();
    expect(check("sh -s < okcd.sh")).toBeNull();
    expect(check("bash <<< 'echo hi'")).toBeNull();
  });

  test("unit: scripts the clamp cannot read or trust refuse", () => {
    expect(check("sh missing.sh")).toBe("missing.sh (script not found)");
    expect(check(". ./missing.sh")).toBe("./missing.sh (script not found)");
    expect(check('sh "$S"')).toBe("$S (script path would expand)");
    expect(check(". ~/x.sh")).toBe("~/x.sh (script path would expand)");
    expect(check("sh *.sh")).toBe("*.sh (script path would expand)");
    // written by the command itself, in any order
    expect(check("echo 'cd /etc' > gen.sh; sh gen.sh")).toBe(
      "gen.sh (script written by this command)",
    );
    expect(check("cp bad.sh ok.sh && ./ok.sh")).toBe(
      "./ok.sh (script written by this command)",
    );
    expect(check("cp /tmp/x new.sh && ./new.sh")).toBe(
      "./new.sh (script written by this command)",
    );
    expect(check("for i in 1 2; do sh ok.sh; cp bad.sh ok.sh; done")).toBe(
      "ok.sh (script written by this command)",
    );
    writeFileSync(join(dir, "big.sh"), "#!/bin/sh\n" + "# pad\n".repeat(200_000));
    expect(check("sh big.sh")).toBe("(script too large or unreadable to check) (in big.sh)");
  });

  test("unit: trap actions and alias definitions are checked", () => {
    expect(check("trap 'cd /etc' EXIT; true")).toBe("/etc");
    expect(check("trap -- 'cd ..' INT")).toBe("..");
    expect(check('trap "$X" EXIT')).toBe("$X");
    expect(check("alias c=cd\nc /etc")).toBe("c=cd (alias)");
    expect(check("trap 'rm -f tmp.txt' EXIT; trap - EXIT; trap -p")).toBeNull();
    expect(check("alias")).toBeNull();
  });

  test("unit: in-root scripts, programs and non-shell files stay allowed", () => {
    expect(check("sh ok.sh")).toBeNull();
    expect(check("./ok.sh && ./okcd.sh")).toBeNull();
    expect(check(". ./ok.sh")).toBeNull();
    expect(check("bash scripts/build.sh")).toBeNull();
    expect(check("cd sub && sh ../ok.sh")).toBeNull();
    expect(check("chmod +x ok.sh && ./ok.sh")).toBeNull();
    expect(check("git add ok.sh && git commit -m x ok.sh && ./ok.sh")).toBeNull();
    // a binary, another interpreter, or a program the command builds first
    expect(check("./bin-true")).toBeNull();
    expect(check("./tool.py")).toBeNull();
    expect(check("cc -o app main.c && ./build/app")).toBeNull();
    // shells without -c, a script or stdin redirect: nothing to read
    expect(check("sh -c 'echo hi' && bash -lc 'cd sub'")).toBeNull();
  });
});

describe("shell-exec SAFE-3 scripts end to end (REQ-plugins-087)", () => {
  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
    dir = makeProject();
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

  test("a script that would escape returns exit 2 with SAFE-3 and never spawns", async () => {
    const escapes = [
      "./bad.sh",
      "sh bad.sh",
      ". ./bad.sh",
      "sh < bad.sh",
      "touch spawned; sh <<'EOF'\ncd /etc && pwd\nEOF",
      "touch spawned; cat bad.sh | sh",
      "touch spawned; trap 'cd /etc && pwd' EXIT",
      "touch spawned; alias c=cd\nc /etc && pwd",
      // `tee`, not `>`: a `>` edit is refused first by SAFE-21 (shell.footguns.test.ts).
      "echo 'touch spawned; cd /etc' | tee gen.sh >/dev/null; sh gen.sh",
    ];
    for (const command of escapes) {
      const result = await run(command);
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.error ?? "").toContain("SAFE-3");
      expect((result.data as { refused?: boolean } | undefined)?.refused).toBe(true);
      // refused before spawn: bad.sh never touched its marker, /etc never printed
      expect(existsSync(join(dir, "spawned"))).toBe(false);
      expect(existsSync(join(dir, "gen.sh"))).toBe(false);
      expect(result.message ?? "").not.toContain("\n/etc\n");
    }
  });

  test("in-root scripts still run", async () => {
    const allowed: [string, string][] = [
      ["./ok.sh", "ok-ran"],
      ["sh okcd.sh", join(dir, "sub")],
      ["bash scripts/build.sh", "built"],
      ["sh <<'EOF'\ncd sub && pwd\nEOF", join(dir, "sub")],
    ];
    for (const [command, want] of allowed) {
      const result = await run(command);
      expect(result.ok).toBe(true);
      expect(result.message ?? "").toContain(want);
    }
  });
});
