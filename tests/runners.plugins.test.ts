/**
 * Language runner plugins (PLUGIN-4 / PLUGIN-2 / SAFE-1, REQ-plugins-313 / 314).
 *
 * `node-exec`, `python-exec` and `cargo-exec` register only when their
 * toolchain is on PATH, run the model's argv verbatim (no shell) in the
 * project root, are dangerous + code tier, and degrade cleanly when the
 * toolchain is missing. Stub toolchains are /bin/sh scripts that print their
 * cwd and argv; the real-toolchain smoke tests run only where one is installed.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { buildOpenAiTools } from "../src/agent/tools.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry, get, list } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import {
  RUNNERS,
  loadRunnerPlugins,
  resolveRunnerBin,
  runRunner,
  runnerCommand,
  runnerStatusLines,
} from "../plugins/runners/index.ts";

const RUNNER_NAMES = ["node-exec", "python-exec", "cargo-exec"];

const STUB = `#!/bin/sh
dir="$(dirname "$0")"
echo "tool=$(basename "$0")"
echo "cwd=$(pwd -P)"
for a in "$@"; do printf 'arg=[%s]\\n' "$a"; done
echo "gh=\${GITHUB_TOKEN:+set} dc=\${DISCORD_TOKEN:+set} ai=\${OPENAI_API_KEY:+set} audit=\${CORVIDINHO_AUDIT_HMAC_KEY:+set} acting=\${CORVIDINHO_ACTING_DISCORD_USER_ID:+set} cdpath=\${CDPATH:+set} oldpwd=\${OLDPWD:+set} root=\${CORVIDINHO_PROJECT_ROOT}"
echo ran >> "$dir/runs.log"
if [ -f "$dir/exit3" ]; then exit 3; fi
if [ -f "$dir/tree" ]; then
  sleep 30 & echo $! > "$dir/bg.pid"
  exec sleep 30
fi
exit 0
`;

type Fake = { bin: string; project: string; empty: string };
const temps: string[] = [];

function makeFake(tools: string[] = ["node", "python3", "cargo"], files: Record<string, string> = {}): Fake {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-runners-")));
  temps.push(root);
  const bin = join(root, "bin");
  const project = join(root, "project");
  const empty = join(root, "empty");
  mkdirSync(bin);
  mkdirSync(project);
  mkdirSync(empty);
  for (const t of tools) {
    writeFileSync(join(bin, t), STUB);
    chmodSync(join(bin, t), 0o755);
  }
  for (const [k, v] of Object.entries(files)) writeFileSync(join(bin, k), v);
  return { bin, project, empty };
}

afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

function running(pid: number): boolean {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const state = stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
    return state !== "Z" && state !== "X";
  } catch {
    return false;
  }
}

async function until(cond: () => boolean, ms = 3000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await Bun.sleep(20);
  }
  return cond();
}

const runs = (fake: Fake) =>
  existsSync(join(fake.bin, "runs.log")) ? readFileSync(join(fake.bin, "runs.log"), "utf8") : "";

const spec = (name: string) => RUNNERS.find((r) => r.name === name)!;

beforeEach(() => {
  clearRegistry();
});

describe("runners register when the toolchain is on PATH (REQ-plugins-313)", () => {
  test("node-exec / python-exec / cargo-exec are registered, dangerous and code tier", () => {
    const fake = makeFake();
    const report = loadRunnerPlugins({ PATH: fake.bin });
    expect(report.loaded.map((l) => l.name).sort()).toEqual([...RUNNER_NAMES].sort());
    expect(report.missing).toEqual([]);
    const byName = Object.fromEntries(list().map((e) => [e.name, e]));
    for (const n of RUNNER_NAMES) {
      expect(byName[n]).toMatchObject({ dangerous: true, mutating: true, minTier: 2 });
    }
    expect(report.loaded.find((l) => l.name === "node-exec")!.bin).toBe(join(fake.bin, "node"));
    const status = runnerStatusLines(report).join("\n");
    expect(status).toContain(`node-exec (${join(fake.bin, "node")})`);
    expect(status).not.toContain("not loaded");
    // Idempotent: a second load keeps the same commands.
    const cmd = get("node-exec");
    expect(loadRunnerPlugins({ PATH: fake.bin }).loaded).toHaveLength(3);
    expect(get("node-exec")).toBe(cmd!);
  });

  test("python-exec prefers python3 and falls back to python", () => {
    const both = makeFake(["python3", "python"]);
    expect(resolveRunnerBin(spec("python-exec"), { PATH: both.bin })).toBe(join(both.bin, "python3"));
    const only = makeFake(["python"]);
    expect(resolveRunnerBin(spec("python-exec"), { PATH: only.bin })).toBe(join(only.bin, "python"));
  });

  test("relative PATH entries are ignored, so the project cannot pick the binary", () => {
    const fake = makeFake();
    const rel = relative(process.cwd(), fake.bin);
    expect(rel.startsWith("/")).toBe(false);
    expect(resolveRunnerBin(spec("node-exec"), { PATH: `${rel}:.` })).toBeNull();
    expect(resolveRunnerBin(spec("node-exec"), { PATH: `${rel}:${fake.bin}` })).toBe(join(fake.bin, "node"));
  });

  test("Bun's own node shim is not node: a real node later on PATH wins, else node-exec is not loaded", () => {
    const shim = makeFake([]);
    symlinkSync(process.execPath, join(shim.bin, "node"));
    expect(resolveRunnerBin(spec("node-exec"), { PATH: shim.bin })).toBeNull();
    const real = makeFake(["node"]);
    expect(resolveRunnerBin(spec("node-exec"), { PATH: `${shim.bin}:${real.bin}` })).toBe(join(real.bin, "node"));
    const report = loadRunnerPlugins({ PATH: shim.bin });
    expect(report.loaded).toEqual([]);
    expect(get("node-exec")).toBeUndefined();
    expect(runnerStatusLines(report).join("\n")).toContain("node-exec not loaded: node not found on PATH");
  });

  test("argv reaches the toolchain verbatim with no shell, cwd pinned to the project root", async () => {
    const fake = makeFake();
    loadRunnerPlugins({ PATH: fake.bin });
    const r = await runPlugin({
      name: "python-exec",
      args: ["-c", "x", "$(id)", "--json", "a b", "*", "--", "`id`"],
      cwd: fake.project,
    });
    expect(r.ok).toBe(true);
    expect(r.exitCode).toBe(0);
    const out = String(r.message);
    expect(out).toContain("tool=python3");
    expect(out).toContain(`cwd=${fake.project}`);
    const args = [...out.matchAll(/^arg=\[(.*)\]$/gm)].map((m) => m[1]);
    expect(args).toEqual(["-c", "x", "$(id)", "--json", "a b", "*", "--", "`id`"]);
    expect(r.data).toMatchObject({ runner: "python-exec", cwd: fake.project, exitCode: 0 });
  });

  test("a non-zero exit comes back as ok:false with that exit code", async () => {
    const fake = makeFake(undefined, { exit3: "" });
    loadRunnerPlugins({ PATH: fake.bin });
    const r = await runPlugin({ name: "cargo-exec", args: ["build"], cwd: fake.project });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(3);
    expect(r.error).toContain("cargo-exec exited 3");
    expect(String(r.message)).toContain("arg=[build]");
  });

  test("no argv is a usage error and starts nothing", async () => {
    const fake = makeFake();
    loadRunnerPlugins({ PATH: fake.bin });
    const r = await runPlugin({ name: "node-exec", args: [], cwd: fake.project });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.error).toContain("usage: node-exec");
    expect(runs(fake)).toBe("");
  });

  test("the child env drops Discord, GitHub, audit, acting and LLM secrets and CDPATH / OLDPWD", async () => {
    const fake = makeFake();
    const r = await runRunner({
      spec: spec("node-exec"),
      bin: join(fake.bin, "node"),
      args: ["x.js"],
      cwd: fake.project,
      env: {
        PATH: "/usr/bin:/bin",
        GITHUB_TOKEN: "ghp_000000000000000000000000000000000000",
        DISCORD_TOKEN: "discord-bot-token-value",
        OPENAI_API_KEY: "sk-test-value-000000000000",
        CORVIDINHO_AUDIT_HMAC_KEY: "audit-key-value",
        CORVIDINHO_ACTING_DISCORD_USER_ID: "123",
        CDPATH: "/etc",
        OLDPWD: "/etc",
      },
    });
    expect(r.ok).toBe(true);
    const out = String(r.message);
    expect(out).toContain(
      `gh= dc= ai= audit= acting= cdpath= oldpwd= root=${fake.project}`,
    );
  });
});

describe("SAFE-21.a: the runners start without GitHub / git credentials (REQ-plugins-495)", () => {
  test("tokens, askpass, the ssh agent and inherited git / gh config pointers are dropped; git and gh read none", async () => {
    const fake = makeFake(["node"], { "node": "#!/bin/sh\nenv\n" });
    chmodSync(join(fake.bin, "node"), 0o755);
    const r = await runRunner({
      spec: spec("node-exec"),
      bin: join(fake.bin, "node"),
      args: ["x.js"],
      cwd: fake.project,
      env: {
        PATH: "/usr/bin:/bin",
        HOME: "/home/owner",
        GH_TOKEN: "ghp_000000000000000000000000000000000000",
        GH_ENTERPRISE_TOKEN: "enterprise-token-value",
        GIT_ASKPASS: "/usr/bin/askpass",
        SSH_AUTH_SOCK: "/tmp/ssh-agent.sock",
        GIT_SSH_COMMAND: "ssh -i /home/owner/.ssh/id_ed25519",
        GIT_CONFIG_GLOBAL: "/home/owner/.gitconfig",
        GIT_CONFIG_COUNT: "2",
        GIT_CONFIG_KEY_1: "credential.helper",
        GIT_CONFIG_VALUE_1: "store",
        GIT_CONFIG_PARAMETERS: "'credential.helper'='store'",
        GH_CONFIG_DIR: "/home/owner/.config/gh",
      },
    });
    expect(r.ok).toBe(true);
    const out = String(r.message);
    for (const k of [
      "GH_TOKEN", "GH_ENTERPRISE_TOKEN", "GIT_ASKPASS", "SSH_AUTH_SOCK", "GIT_CONFIG_KEY_1",
      "GIT_CONFIG_VALUE_1", "GIT_CONFIG_PARAMETERS",
    ]) {
      expect(out).not.toMatch(new RegExp(`^${k}=`, "m"));
    }
    expect(out).toMatch(/^GIT_CONFIG_GLOBAL=\/dev\/null$/m);
    expect(out).toMatch(/^GIT_CONFIG_NOSYSTEM=1$/m);
    expect(out).toMatch(/^GIT_CONFIG_COUNT=1$/m);
    expect(out).toMatch(/^GIT_CONFIG_KEY_0=credential\.helper$/m);
    expect(out).toMatch(/^GIT_CONFIG_VALUE_0=$/m);
    expect(out).toMatch(/^GIT_TERMINAL_PROMPT=0$/m);
    expect(out).toMatch(/^GIT_SSH_COMMAND=ssh -F \/dev\/null .*IdentityAgent=none/m);
    expect(out).toMatch(/^CARGO_NET_GIT_FETCH_WITH_CLI=true$/m);
    const gh = out.match(/^GH_CONFIG_DIR=(.+)$/m)?.[1] ?? "";
    expect(gh).not.toBe("/home/owner/.config/gh");
    expect(existsSync(join(gh, "hosts.yml"))).toBe(false);
  });
});

describe("SAFE-1 / tier gates apply to the runners (REQ-plugins-313)", () => {
  test("non-interactive without an allowlist entry is denied (exit 2) and never spawns", async () => {
    const fake = makeFake();
    loadRunnerPlugins({ PATH: fake.bin });
    for (const name of RUNNER_NAMES) {
      const r = await runPlugin({
        name,
        args: ["--version"],
        cwd: fake.project,
        nonInteractive: true,
        allowlist: [],
      });
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(2);
      expect(r.error).toContain("SAFE-1");
    }
    expect(runs(fake)).toBe("");
    const ok = await runPlugin({
      name: "node-exec",
      args: ["--version"],
      cwd: fake.project,
      nonInteractive: true,
      allowlist: ["node-exec"],
    });
    expect(ok.ok).toBe(true);
    expect(runs(fake)).toBe("ran\n");
  });

  test("the tool catalog offers the runners only at code tier, with dangerous tools, to ADMIN", () => {
    const fake = makeFake();
    loadRunnerPlugins({ PATH: fake.bin });
    const names = (o: Parameters<typeof buildOpenAiTools>[0]) =>
      buildOpenAiTools(o).map((t) => t.function.name).filter((n) => RUNNER_NAMES.includes(n));
    expect(names({ tier: "code", includeDangerous: true }).sort()).toEqual([...RUNNER_NAMES].sort());
    expect(names({ tier: "tool", includeDangerous: true })).toEqual([]);
    expect(names({ tier: "code", includeDangerous: false })).toEqual([]);
    expect(names({ tier: "code", includeDangerous: true, actingIsAdmin: false })).toEqual([]);
  });

  test("the calling run's abort stops the runner's process tree (exit 130)", async () => {
    const fake = makeFake(undefined, { tree: "" });
    loadRunnerPlugins({ PATH: fake.bin });
    const ac = new AbortController();
    const pidFile = join(fake.bin, "bg.pid");
    void until(() => existsSync(pidFile) && readFileSync(pidFile, "utf8").trim() !== "", 10_000).then(() =>
      ac.abort(),
    );
    const started = Date.now();
    const r = await runPlugin({ name: "node-exec", args: ["server.js"], cwd: fake.project, signal: ac.signal });
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(130);
    expect(r.data).toMatchObject({ aborted: true, timedOut: false });
    const bg = Number(readFileSync(pidFile, "utf8").trim());
    expect(await until(() => !running(bg))).toBe(true);
  });

  test("a run past the timeout is killed (exit 124)", async () => {
    const fake = makeFake(undefined, { tree: "" });
    const r = await runRunner({
      spec: spec("cargo-exec"),
      bin: join(fake.bin, "cargo"),
      args: ["build"],
      cwd: fake.project,
      timeoutMs: 1000,
    });
    expect(r.exitCode).toBe(124);
    expect(r.error).toContain("timed out");
    const bg = Number(readFileSync(join(fake.bin, "bg.pid"), "utf8").trim());
    expect(await until(() => !running(bg))).toBe(true);
  });
});

describe("a missing toolchain degrades cleanly (REQ-plugins-314)", () => {
  test("nothing on PATH: no runner is registered or offered, and the status names each missing tool", () => {
    const fake = makeFake([]);
    const report = loadRunnerPlugins({ PATH: fake.empty });
    expect(report.loaded).toEqual([]);
    expect(report.missing.map((m) => m.name).sort()).toEqual([...RUNNER_NAMES].sort());
    for (const n of RUNNER_NAMES) expect(get(n)).toBeUndefined();
    const status = runnerStatusLines(report).join("\n");
    expect(status).toContain("Language runners (PLUGIN-4): none loaded");
    expect(status).toContain("node-exec not loaded: node not found on PATH");
    expect(status).toContain("python-exec not loaded: python3 / python not found on PATH");
    expect(status).toContain("cargo-exec not loaded: cargo not found on PATH");
    const tools = buildOpenAiTools({ tier: "code", includeDangerous: true }).map((t) => t.function.name);
    for (const n of RUNNER_NAMES) expect(tools).not.toContain(n);
    // No PATH at all is the same, not an error.
    expect(loadRunnerPlugins({}).loaded).toEqual([]);
  });

  test("only some toolchains present: those load, the others are reported missing", () => {
    const fake = makeFake(["python3"]);
    const report = loadRunnerPlugins({ PATH: fake.bin });
    expect(report.loaded.map((l) => l.name)).toEqual(["python-exec"]);
    expect(get("python-exec")).toBeDefined();
    expect(get("node-exec")).toBeUndefined();
    expect(get("cargo-exec")).toBeUndefined();
    const status = runnerStatusLines(report).join("\n");
    expect(status).toContain(`python-exec (${join(fake.bin, "python3")})`);
    expect(status).toContain("node-exec not loaded");
    expect(status).toContain("cargo-exec not loaded");
  });

  test("builtins load with the runners for the toolchains on PATH; shell-exec and files-* are unaffected", () => {
    const fake = makeFake(["node"]);
    const saved = process.env.PATH;
    try {
      process.env.PATH = fake.empty;
      clearRegistry();
      loadBuiltins();
      for (const n of RUNNER_NAMES) expect(get(n)).toBeUndefined();
      for (const n of ["shell-exec", "files-read", "files-write", "files-list"]) expect(get(n)).toBeDefined();
      process.env.PATH = fake.bin;
      clearRegistry();
      loadBuiltins();
      expect(get("node-exec")).toBeDefined();
      expect(get("python-exec")).toBeUndefined();
      expect(get("shell-exec")).toBeDefined();
    } finally {
      process.env.PATH = saved;
      clearRegistry();
    }
  });

  test("a registered binary that disappears returns exit 127 instead of throwing", async () => {
    const fake = makeFake();
    loadRunnerPlugins({ PATH: fake.bin });
    rmSync(join(fake.bin, "node"));
    const r = await runPlugin({ name: "node-exec", args: ["-e", "1"], cwd: fake.project });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(127);
    expect(r.error).toContain("node-exec: node could not start");
    // Same through the command object directly.
    const cmd = runnerCommand(spec("cargo-exec"), join(fake.empty, "cargo"));
    const r2 = await cmd.handler({
      args: ["--version"],
      cwd: fake.project,
      json: false,
      nonInteractive: false,
      allowlist: new Set(),
    });
    expect(r2.exitCode).toBe(127);
  });

  test("`plugins list` exits 0 with no toolchain on PATH and names each missing runner", async () => {
    const fake = makeFake([]);
    const cli = join(import.meta.dir, "..", "src", "cli.ts");
    const proc = Bun.spawn([process.execPath, cli, "plugins", "list"], {
      cwd: fake.project,
      env: { ...process.env, PATH: fake.empty },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
    expect(code).toBe(0);
    expect(out).toContain("shell-exec");
    expect(out).toContain("Language runners (PLUGIN-4): none loaded");
    expect(out).toContain("node-exec not loaded: node not found on PATH");
    expect(out).toContain("cargo-exec not loaded: cargo not found on PATH");
    expect(out).not.toMatch(/^\s+node-exec\s+\[/m);
  });

  test("`bun run corvidinho plugins list` without node: the node shim bun run adds does not load node-exec", async () => {
    const fake = makeFake([]);
    symlinkSync(process.execPath, join(fake.bin, "bun"));
    const proc = Bun.spawn([process.execPath, "run", "--silent", "corvidinho", "plugins", "list"], {
      cwd: join(import.meta.dir, ".."),
      env: { ...process.env, PATH: fake.bin },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
    expect(code).toBe(0);
    expect(out).toContain("shell-exec");
    expect(out).toContain("node-exec not loaded: node not found on PATH");
    expect(out).not.toMatch(/^\s+node-exec\s+\[/m);
  });

  test("`plugins list` shows a runner whose toolchain is on PATH", async () => {
    const fake = makeFake(["cargo"]);
    const cli = join(import.meta.dir, "..", "src", "cli.ts");
    const proc = Bun.spawn([process.execPath, cli, "plugins", "list"], {
      cwd: fake.project,
      env: { ...process.env, PATH: fake.bin },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
    expect(code).toBe(0);
    expect(out).toMatch(/^\s+cargo-exec\s+\[dangerous, tier>=2\]/m);
    expect(out).toContain(`cargo-exec (${join(fake.bin, "cargo")})`);
    expect(out).toContain("node-exec not loaded");
  });
});

describe("real toolchains (skipped where not installed)", () => {
  const project = () => {
    const d = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-runners-real-")));
    temps.push(d);
    return d;
  };

  test.skipIf(!Bun.which("node"))("node-exec prints the project root", async () => {
    loadRunnerPlugins();
    const root = project();
    const r = await runPlugin({ name: "node-exec", args: ["-e", "console.log(process.cwd())"], cwd: root });
    expect(r.ok).toBe(true);
    expect(String(r.message).trim()).toBe(root);
  });

  test.skipIf(!Bun.which("python3") && !Bun.which("python"))("python-exec prints the project root", async () => {
    loadRunnerPlugins();
    const root = project();
    const r = await runPlugin({ name: "python-exec", args: ["-c", "import os; print(os.getcwd())"], cwd: root });
    expect(r.ok).toBe(true);
    expect(String(r.message).trim()).toBe(root);
  });

  test.skipIf(!Bun.which("cargo"))("cargo-exec --version runs", async () => {
    loadRunnerPlugins();
    const r = await runPlugin({ name: "cargo-exec", args: ["--version"], cwd: project() });
    expect(r.ok).toBe(true);
    expect(String(r.message)).toMatch(/^cargo \d/);
  });
});
