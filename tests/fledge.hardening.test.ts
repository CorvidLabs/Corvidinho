/**
 * Fledge plugin hardening (REQ-plugins-112 / 113 / 154, #112 follow-up):
 * model argv goes after `--`, a timeout or abort stops the plugin's whole
 * process tree, and commands are bound to the project root they were
 * discovered for. The fake `fledge` mimics fledge 1.8's `plugins run`: a
 * leading `--help` is fledge's own help, `--` is consumed once and everything
 * after it reaches the plugin verbatim. No network, no real plugins.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry, get } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { fledgeRunArgv, runFledgeCommand } from "../plugins/fledge/commands.ts";
import {
  fledgeBindings,
  loadFledgePlugins,
  resetFledgeDiscovery,
} from "../plugins/fledge/index.ts";

const FAKE_FLEDGE = `#!/bin/sh
dir="$(dirname "$0")"
[ "$1" = "--non-interactive" ] && shift
if [ "$1 $2" = "plugins list" ]; then cat "$dir/list.json"; exit 0; fi
if [ "$1 $2" = "plugins audit" ]; then [ -f "$dir/audit.json" ] || exit 1; cat "$dir/audit.json"; exit 0; fi
if [ "$1 $2" = "plugins run" ]; then
  shift 2
  cmd="$1"; shift
  if [ "$1" = "--" ]; then shift
  else
    case "$1" in -h|--help) echo "Usage: fledge plugins run [OPTIONS] <NAME> [ARGS]..."; exit 0 ;; esac
  fi
  echo "ran $cmd" >> "$dir/runs.log"
  echo "cmd=$cmd"
  for a in "$@"; do printf 'arg=[%s]\\n' "$a"; done
  if [ -f "$dir/run.tree" ]; then
    sleep 30 & echo $! > "$dir/bg.pid"
    setsid sleep 30 & echo $! > "$dir/sess.pid"
    exec sleep 30
  fi
  if [ -f "$dir/run.orphan" ]; then
    sleep 30 & echo $! > "$dir/bg.pid"
    exit 0
  fi
  exit 0
fi
exit 2
`;

function listJson(plugin: string, version: string, runtime: string, commands: string[]) {
  return {
    schema_version: 1,
    plugins: [{ name: plugin, version, commands, trust_tier: "unverified", runtime }],
  };
}

type Fake = { bin: string; project: string; env: NodeJS.ProcessEnv; fledge: string };
const temps: string[] = [];

function makeFake(list = listJson("hello-plugin", "1.0.0", "native", ["hello"]), files: Record<string, string> = {}): Fake {
  const root = mkdtempSync(join(tmpdir(), "corvidinho-fledge-hard-"));
  temps.push(root);
  const bin = join(root, "bin");
  const project = join(root, "project");
  mkdirSync(bin);
  mkdirSync(project);
  writeFileSync(join(bin, "fledge"), FAKE_FLEDGE);
  chmodSync(join(bin, "fledge"), 0o755);
  writeFileSync(join(bin, "list.json"), JSON.stringify(list));
  for (const [k, v] of Object.entries(files)) writeFileSync(join(bin, k), v);
  return { bin, project, env: { PATH: `${bin}:/usr/bin:/bin` }, fledge: join(bin, "fledge") };
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

const pidIn = (fake: Fake, name: string) => Number(readFileSync(join(fake.bin, name), "utf8").trim());
const runs = (fake: Fake) =>
  existsSync(join(fake.bin, "runs.log")) ? readFileSync(join(fake.bin, "runs.log"), "utf8") : "";

describe("model argv goes after -- (REQ-plugins-113)", () => {
  test("argv is `plugins run <command> -- <argv...>`", () => {
    expect(fledgeRunArgv("/x/fledge", "hello", ["--help", "a b"])).toEqual([
      "/x/fledge",
      "--non-interactive",
      "plugins",
      "run",
      "hello",
      "--",
      "--help",
      "a b",
    ]);
  });

  test("--help / --json / --ni / -- reach the plugin verbatim, not fledge", async () => {
    const fake = makeFake();
    const r = await runFledgeCommand({
      fledgeBin: fake.fledge,
      plugin: "hello-plugin",
      command: "hello",
      args: ["--help", "--json", "--ni", "--", "x"],
      cwd: fake.project,
      env: fake.env,
    });
    expect(r.ok).toBe(true);
    const out = String(r.message);
    expect(out).not.toContain("Usage: fledge");
    for (const a of ["--help", "--json", "--ni", "--", "x"]) expect(out).toContain(`arg=[${a}]`);
    expect(out.indexOf("arg=[--help]")).toBeLessThan(out.indexOf("arg=[x]"));
  });
});

describe("timeout / abort stop the plugin's whole tree (REQ-plugins-113 / 154)", () => {
  test("timeout kills the plugin, a same-group and a setsid grandchild", async () => {
    const fake = makeFake(undefined, { "run.tree": "" });
    const started = Date.now();
    const r = await runFledgeCommand({
      fledgeBin: fake.fledge,
      plugin: "hello-plugin",
      command: "hello",
      args: [],
      cwd: fake.project,
      env: fake.env,
      timeoutMs: 1500,
    });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(r.exitCode).toBe(124);
    const bg = pidIn(fake, "bg.pid");
    const sess = pidIn(fake, "sess.pid");
    expect(await until(() => !running(bg) && !running(sess))).toBe(true);
  });

  test("a grandchild left holding the pipe after the plugin exited is killed at the timeout", async () => {
    const fake = makeFake(undefined, { "run.orphan": "" });
    const r = await runFledgeCommand({
      fledgeBin: fake.fledge,
      plugin: "hello-plugin",
      command: "hello",
      args: [],
      cwd: fake.project,
      env: fake.env,
      timeoutMs: 1500,
    });
    expect(r.exitCode).toBe(124);
    const bg = pidIn(fake, "bg.pid");
    expect(await until(() => !running(bg))).toBe(true);
  });

  test("the calling run's abort stops the tree (exit 130, aborted)", async () => {
    const fake = makeFake(undefined, { "run.tree": "" });
    const ac = new AbortController();
    const sessFile = join(fake.bin, "sess.pid");
    void until(() => existsSync(sessFile) && readFileSync(sessFile, "utf8").trim() !== "", 10_000).then(() =>
      ac.abort(),
    );
    const r = await runFledgeCommand({
      fledgeBin: fake.fledge,
      plugin: "hello-plugin",
      command: "hello",
      args: [],
      cwd: fake.project,
      env: fake.env,
      signal: ac.signal,
    });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(130);
    expect(r.data).toMatchObject({ aborted: true, timedOut: false });
    const bg = pidIn(fake, "bg.pid");
    const sess = pidIn(fake, "sess.pid");
    expect(await until(() => !running(bg) && !running(sess))).toBe(true);
    // Already aborted: nothing starts.
    const idle = makeFake();
    const r2 = await runFledgeCommand({
      fledgeBin: idle.fledge,
      plugin: "hello-plugin",
      command: "hello",
      args: [],
      cwd: idle.project,
      env: idle.env,
      signal: ac.signal,
    });
    expect(r2.exitCode).toBe(130);
    expect(runs(idle)).toBe("");
  });
});

describe("Fledge commands are scoped to their project root (REQ-plugins-112)", () => {
  beforeEach(() => {
    clearRegistry();
    resetFledgeDiscovery();
    loadBuiltins();
  });
  afterEach(() => {
    clearRegistry();
    resetFledgeDiscovery();
    loadBuiltins();
  });

  const allow = { nonInteractive: true, allowlist: ["fledge-hello", "fledge-bye"] };

  test("loading another root rebinds same-named commands and drops the rest", async () => {
    // A: native plugin (tier 2) with hello + bye. B: sandboxed plugin (tier 1) with hello.
    const a = makeFake(listJson("plugin-a", "1.0.0", "native", ["hello", "bye"]));
    const b = makeFake({
      schema_version: 1,
      plugins: [{ name: "plugin-b", version: "2.0.0", commands: ["hello"], trust_tier: "official", runtime: "wasm" }],
    });
    writeFileSync(
      join(b.bin, "audit.json"),
      JSON.stringify({
        schema_version: 1,
        audit: [
          {
            name: "plugin-b",
            capabilities: { exec: false, store: false, metadata: false, filesystem: "none", network: false },
          },
        ],
      }),
    );

    await loadFledgePlugins({ cwd: a.project, env: a.env });
    expect(get("fledge-hello")!.origin).toBe("fledge:plugin-a@1.0.0");
    expect(get("fledge-hello")!.minTier).toBe(2);
    expect(get("fledge-bye")).toBeTruthy();
    expect((await runPlugin({ name: "fledge-hello", cwd: a.project, ...allow })).ok).toBe(true);
    expect(runs(a)).toContain("ran hello");

    await loadFledgePlugins({ cwd: b.project, env: b.env });
    // Tier / origin now come from B's plugin, not A's registration.
    expect(get("fledge-hello")!.origin).toBe("fledge:plugin-b@2.0.0");
    expect(get("fledge-hello")!.minTier).toBe(1);
    expect(get("fledge-bye")).toBeUndefined();
    expect(fledgeBindings()).toEqual([{ name: "fledge-hello", root: b.project }]);

    // A's cwd never runs B's plugin (nor A's under B's registration).
    const before = runs(b);
    const refused = await runPlugin({ name: "fledge-hello", cwd: a.project, ...allow });
    expect(refused.ok).toBe(false);
    expect(refused.exitCode).toBe(2);
    expect(refused.error).toContain("another project root");
    expect(runs(b)).toBe(before);

    // Loading A again (cached report is stale) rebinds to A.
    const again = await loadFledgePlugins({ cwd: a.project, env: a.env });
    expect(again.registered.sort()).toEqual(["fledge-bye", "fledge-hello"]);
    expect(get("fledge-hello")!.origin).toBe("fledge:plugin-a@1.0.0");
    expect((await runPlugin({ name: "fledge-hello", cwd: a.project, ...allow })).ok).toBe(true);
  });

  test("same plugin and version in two roots still binds to one root at a time", async () => {
    const a = makeFake();
    const b = makeFake();
    await loadFledgePlugins({ cwd: a.project, env: a.env });
    await loadFledgePlugins({ cwd: b.project, env: b.env });
    const fromA = await runPlugin({ name: "fledge-hello", cwd: a.project, ...allow });
    expect(fromA.exitCode).toBe(2);
    expect(runs(a)).toBe("");
    const fromB = await runPlugin({ name: "fledge-hello", cwd: b.project, ...allow });
    expect(fromB.ok).toBe(true);
    expect(runs(b)).toContain("ran hello");
  });

  test("a root whose discovery fails leaves no other root's commands registered", async () => {
    const a = makeFake();
    await loadFledgePlugins({ cwd: a.project, env: a.env });
    expect(get("fledge-hello")).toBeTruthy();
    const other = mkdtempSync(join(tmpdir(), "corvidinho-fledge-none-"));
    temps.push(other);
    const r = await loadFledgePlugins({ cwd: other, env: { PATH: "/nonexistent-dir" } });
    expect(r.ok).toBe(false);
    expect(get("fledge-hello")).toBeUndefined();
    expect(get("shell-exec")).toBeTruthy();
  });

  test("a forced reload after a plugin upgrade rebinds to the new version", async () => {
    const a = makeFake();
    await loadFledgePlugins({ cwd: a.project, env: a.env });
    const old = get("fledge-hello");
    expect(old!.origin).toBe("fledge:hello-plugin@1.0.0");
    writeFileSync(join(a.bin, "list.json"), JSON.stringify(listJson("hello-plugin", "1.1.0", "native", ["hello"])));
    const cached = await loadFledgePlugins({ cwd: a.project, env: a.env });
    expect(get("fledge-hello")).toBe(old!);
    expect(cached.registered).toEqual(["fledge-hello"]);
    await loadFledgePlugins({ cwd: a.project, env: a.env, force: true });
    expect(get("fledge-hello")!.origin).toBe("fledge:hello-plugin@1.1.0");
    expect((await runPlugin({ name: "fledge-hello", cwd: a.project, ...allow })).ok).toBe(true);
  });
});
