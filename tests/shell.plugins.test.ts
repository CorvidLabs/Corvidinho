import { describe, expect, test, beforeEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearRegistry, list } from "../src/plugins/registry.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";
import {
  firstDisallowedCd,
  isCdEscape,
} from "../plugins/shell/clamp.ts";

describe("shell plugins (REQ-plugins-086..088 / SAFE-3)", () => {
  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  test("plugins list includes shell-exec with danger markings", () => {
    const byName = Object.fromEntries(list().map((e) => [e.name, e]));
    expect(byName["shell-exec"]).toBeTruthy();
    expect(byName["shell-exec"]!.dangerous).toBe(true);
    expect(byName["shell-exec"]!.minTier).toBe(2);
  });

  test("SAFE-1 denies shell-exec in non-interactive without allowlist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-shell-deny-"));
    try {
      const result = await runPlugin({
        name: "shell-exec",
        args: ["echo hi"],
        cwd: dir,
        nonInteractive: true,
        allowlist: [],
      });
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.error).toContain("SAFE-1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("clamp unit: allows relative within root and absolute inside", () => {
    const root = "/Users/x/proj";
    expect(firstDisallowedCd("cargo build", root)).toBeNull();
    expect(firstDisallowedCd("cd crates && ls", root)).toBeNull();
    expect(firstDisallowedCd("cd ./crates/merlin-core", root)).toBeNull();
    expect(firstDisallowedCd("cd /Users/x/proj/sub", root)).toBeNull();
  });

  test("clamp unit: refuses absolute outside, lookalike, .., ~, $VAR, bare cd, pushd", () => {
    const root = "/Users/x/proj";
    expect(firstDisallowedCd("cd /Users/x/other && rm -rf .", root)).toBe(
      "/Users/x/other",
    );
    expect(firstDisallowedCd("cd /Users/x/projx", root)).toBe("/Users/x/projx");
    expect(firstDisallowedCd("cd ../../etc", root)).toBe("../../etc");
    expect(firstDisallowedCd("cd ~/secrets", root)).toBe("~/secrets");
    expect(firstDisallowedCd("cd $HOME", root)).toBe("$HOME");
    expect(firstDisallowedCd("cd && pwd", root)).toBe("$HOME");
    expect(firstDisallowedCd("pushd /tmp", root)).toBe("/tmp");
    expect(firstDisallowedCd("ls; cd /etc", root)).toBe("/etc");
    expect(firstDisallowedCd("true && cd /etc && pwd", root)).toBe("/etc");
    expect(firstDisallowedCd("(cd /etc && cat passwd)", root)).toBe("/etc");
    expect(firstDisallowedCd('cd "/etc"', root)).toBe("/etc");
    expect(firstDisallowedCd("cd '/etc'", root)).toBe("/etc");
    expect(firstDisallowedCd("cd ..", root)).toBe("..");
    expect(isCdEscape("..", root)).toBe(true);
  });

  test("happy path: echo under project cwd when allowlisted", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-shell-ok-"));
    try {
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "src", "a.txt"), "x\n");
      const result = await runPlugin({
        name: "shell-exec",
        args: ["pwd && echo hello-shell"],
        cwd: dir,
        nonInteractive: true,
        allowlist: ["shell-exec"],
      });
      expect(result.ok).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.message ?? "").toContain("hello-shell");
      // pwd should be the project dir
      expect(result.message ?? "").toContain(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("SAFE-3: refuses cd outside before spawn", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-shell-escape-"));
    try {
      const result = await runPlugin({
        name: "shell-exec",
        args: ["cd /tmp && pwd"],
        cwd: dir,
        nonInteractive: true,
        allowlist: ["shell-exec"],
      });
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.error ?? "").toContain("SAFE-3");
      expect(result.error ?? "").toContain("/tmp");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("SAFE-3: refuses cd .. from project root", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-shell-dotdot-"));
    try {
      const result = await runPlugin({
        name: "shell-exec",
        args: ["--command", "cd .. && pwd"],
        cwd: dir,
        nonInteractive: true,
        allowlist: ["shell-exec"],
      });
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.error ?? "").toContain("SAFE-3");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("relative cd within project is allowed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-shell-rel-"));
    try {
      mkdirSync(join(dir, "sub"));
      writeFileSync(join(dir, "sub", "marker.txt"), "ok\n");
      const result = await runPlugin({
        name: "shell-exec",
        args: ["cd sub && cat marker.txt"],
        cwd: dir,
        nonInteractive: true,
        allowlist: ["shell-exec"],
      });
      expect(result.ok).toBe(true);
      expect(result.message ?? "").toContain("ok");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("shell clamp skips cd/pushd options (REQ-plugins-341 / SAFE-3)", () => {
  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  const root = "/Users/x/proj";

  test("options and -- before an outside target still refuse", () => {
    expect(firstDisallowedCd("cd -P /etc && pwd", root)).toBe("/etc");
    expect(firstDisallowedCd("cd -L /etc", root)).toBe("/etc");
    expect(firstDisallowedCd("cd -- /etc", root)).toBe("/etc");
    expect(firstDisallowedCd("cd -PL /etc", root)).toBe("/etc");
    expect(firstDisallowedCd("cd -e /etc", root)).toBe("/etc");
    expect(firstDisallowedCd("cd -@ /etc", root)).toBe("/etc");
    expect(firstDisallowedCd("cd -P -L -- /etc", root)).toBe("/etc");
    expect(firstDisallowedCd('cd "-P" /etc', root)).toBe("/etc");
    expect(firstDisallowedCd("cd -P ../../etc", root)).toBe("../../etc");
    expect(firstDisallowedCd("cd -P ~/secrets", root)).toBe("~/secrets");
    expect(firstDisallowedCd("ls && cd -P /Users/x/projx", root)).toBe(
      "/Users/x/projx",
    );
    expect(firstDisallowedCd("pushd -n /etc", root)).toBe("/etc");
    expect(firstDisallowedCd("pushd -- /tmp", root)).toBe("/tmp");
  });

  test("lone - (OLDPWD) refuses in every position", () => {
    expect(firstDisallowedCd("cd - && pwd", root)).toBe("$OLDPWD");
    expect(firstDisallowedCd("cd -P -", root)).toBe("$OLDPWD");
    expect(firstDisallowedCd("cd -- -", root)).toBe("$OLDPWD");
    expect(firstDisallowedCd("pushd -", root)).toBe("$OLDPWD");
  });

  test("options with no target are bare cd (home) and refuse", () => {
    expect(firstDisallowedCd("cd -P", root)).toBe("$HOME");
    expect(firstDisallowedCd("cd -- && pwd", root)).toBe("$HOME");
    expect(firstDisallowedCd("pushd -n", root)).toBe("$HOME");
  });

  test("unparseable words (quoting / expansion the lexer cannot resolve) refuse", () => {
    expect(firstDisallowedCd('cd ""/etc', root)).toBe('""/etc');
    expect(firstDisallowedCd("cd ''/etc", root)).toBe("''/etc");
    expect(firstDisallowedCd("cd \\/etc", root)).toBe("\\/etc");
    expect(firstDisallowedCd('cd "$(echo /etc)"', root)).toBe('"$');
    expect(firstDisallowedCd("cd `echo /etc`", root)).toBe("`echo");
    expect(firstDisallowedCd("cd {/etc,}", root)).toBe("{/etc,}");
    expect(firstDisallowedCd("cd $OPT /etc", root)).toBe("$OPT");
  });

  test("options before a target inside root stay allowed", () => {
    expect(firstDisallowedCd("cd sub/dir && ls", root)).toBeNull();
    expect(firstDisallowedCd("cd -P sub/dir", root)).toBeNull();
    expect(firstDisallowedCd("cd -L ./crates", root)).toBeNull();
    expect(firstDisallowedCd("cd -- sub", root)).toBeNull();
    expect(firstDisallowedCd("cd -- -P", root)).toBeNull();
    expect(firstDisallowedCd("cd -P /Users/x/proj/sub", root)).toBeNull();
    expect(firstDisallowedCd('cd "sub"', root)).toBeNull();
    expect(firstDisallowedCd("pushd -n sub", root)).toBeNull();
  });

  test("shell-exec refuses cd -P /etc and --command 'cd -- /etc' before spawn", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-shell-cdopt-"));
    try {
      for (const args of [
        ["cd -P /etc && pwd"],
        ["--command", "cd -- /etc && pwd"],
        ["cd -L /etc && pwd"],
      ]) {
        const result = await runPlugin({
          name: "shell-exec",
          args,
          cwd: dir,
          nonInteractive: true,
          allowlist: ["shell-exec"],
        });
        expect(result.ok).toBe(false);
        expect(result.exitCode).toBe(2);
        expect(result.error ?? "").toContain("SAFE-3");
        expect(result.error ?? "").toContain("/etc");
        expect((result.data as { refused?: boolean } | undefined)?.refused).toBe(
          true,
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("shell-exec still runs cd -P sub inside the project", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-shell-cdopt-ok-"));
    try {
      mkdirSync(join(dir, "sub"));
      writeFileSync(join(dir, "sub", "marker.txt"), "ok-opt\n");
      const result = await runPlugin({
        name: "shell-exec",
        args: ["cd -P sub && cat marker.txt"],
        cwd: dir,
        nonInteractive: true,
        allowlist: ["shell-exec"],
      });
      expect(result.ok).toBe(true);
      expect(result.message ?? "").toContain("ok-opt");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
