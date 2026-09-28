/**
 * Fledge plugins as Corvidinho tools (issue #112 / REQ-plugins-112..114,
 * FLEDGE-4/5, PLUGIN-2/3/6, SAFE-1). A fake `fledge` shell script on a temp
 * PATH stands in for the real CLI — no network, no real plugins, no tokens.
 */

import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskExecute, type AgentEvent } from "../src/agent/index.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry, get, list } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import {
  approxTokens,
  formatPluginsListText,
  toolSurfaceReport,
  withToolCost,
} from "../src/plugins/toolCost.ts";
import {
  cleanText,
  discoverFledgePlugins,
  parsePluginList,
} from "../plugins/fledge/discover.ts";
import {
  fledgeDescription,
  fledgeMinTier,
  runFledgeCommand,
} from "../plugins/fledge/commands.ts";
import {
  fledgeStatusLines,
  loadFledgePlugins,
  resetFledgeDiscovery,
} from "../plugins/fledge/index.ts";
import { fledgeChildEnv } from "../plugins/fledge/spawn.ts";

const FAKE_FLEDGE = `#!/bin/sh
dir="$(dirname "$0")"
[ "$1" = "--non-interactive" ] && shift
if [ "$1 $2" = "plugins list" ]; then
  [ -f "$dir/list.sleep" ] && exec sleep "$(cat "$dir/list.sleep")"
  [ -f "$dir/list.exit" ] && { echo "list broke" >&2; exit "$(cat "$dir/list.exit")"; }
  cat "$dir/list.json"; exit 0
fi
if [ "$1 $2" = "plugins audit" ]; then
  [ -f "$dir/audit.json" ] || exit 1
  cat "$dir/audit.json"; exit 0
fi
if [ "$1 $2" = "plugins run" ]; then
  shift 2
  echo "cmd=$1"; shift
  # fledge consumes one "--" before the plugin argv.
  [ "$1" = "--" ] && shift
  for a in "$@"; do printf 'arg=[%s]\\n' "$a"; done
  echo "pwd=$(pwd)"
  echo "discord=\${DISCORD_TOKEN:-unset}"
  echo "llm=\${CORVIDINHO_LLM_API_KEY:-unset}"
  echo "audit=\${CORVIDINHO_AUDIT_HMAC_KEY:-unset}"
  echo "gh=\${GITHUB_TOKEN:-unset}"
  echo "fni=\${FLEDGE_NON_INTERACTIVE:-unset}"
  echo "root=\${CORVIDINHO_PROJECT_ROOT:-unset}"
  [ -f "$dir/run.sleep" ] && exec sleep "$(cat "$dir/run.sleep")"
  [ -f "$dir/run.extra" ] && cat "$dir/run.extra"
  [ -f "$dir/run.exit" ] && exit "$(cat "$dir/run.exit")"
  exit 0
fi
echo "unexpected: $*" >&2
exit 2
`;

const LIST = {
  schema_version: 1,
  plugins: [
    {
      name: "fledge-plugin-hello",
      version: "0.2.0",
      source: "/home/someone/src/fledge-plugin-hello",
      installed: "2026-09-26",
      commands: ["hello", "bye"],
      pinned_ref: null,
      trust_tier: "unverified",
      runtime: "native",
    },
    {
      name: "tz",
      version: "1.0.0",
      source: "CorvidLabs/fledge-plugin-tz",
      installed: "2026-09-26",
      commands: ["tz"],
      trust_tier: "official",
      runtime: "wasm",
    },
    {
      name: "runner",
      version: "0.1.0",
      source: "someone/runner",
      installed: "2026-09-26",
      commands: ["runner", "bad name; rm -rf /", "x".repeat(80)],
      trust_tier: "unverified",
      runtime: "wasm",
    },
  ],
};

const AUDIT = {
  schema_version: 1,
  audit: [
    {
      name: "fledge-plugin-hello",
      capabilities: { exec: false, store: false, metadata: true, filesystem: "none", network: false },
    },
    {
      name: "tz",
      capabilities: { exec: false, store: false, metadata: false, filesystem: "none", network: false },
    },
    {
      name: "runner",
      capabilities: { exec: true, store: false, metadata: false, filesystem: "project", network: false },
    },
  ],
};

type Fake = { bin: string; project: string; env: NodeJS.ProcessEnv };

const temps: string[] = [];

function makeFake(opts: { list?: unknown; audit?: unknown | null; files?: Record<string, string> } = {}): Fake {
  const root = mkdtempSync(join(tmpdir(), "corvidinho-fledge-"));
  temps.push(root);
  const bin = join(root, "bin");
  const project = join(root, "project");
  mkdirSync(bin);
  mkdirSync(project);
  writeFileSync(join(bin, "fledge"), FAKE_FLEDGE);
  chmodSync(join(bin, "fledge"), 0o755);
  writeFileSync(join(bin, "list.json"), JSON.stringify(opts.list ?? LIST));
  if (opts.audit !== null) {
    writeFileSync(join(bin, "audit.json"), JSON.stringify(opts.audit ?? AUDIT));
  }
  for (const [k, v] of Object.entries(opts.files ?? {})) {
    writeFileSync(join(bin, k), v);
  }
  return {
    bin,
    project,
    env: {
      PATH: `${bin}:/usr/bin:/bin`,
      DISCORD_TOKEN: "discord-secret-value",
      CORVIDINHO_LLM_API_KEY: "llm-secret-value",
      CORVIDINHO_AUDIT_HMAC_KEY: "audit-secret-value",
      GITHUB_TOKEN: "gh-visible",
    },
  };
}

afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

describe("fledge discovery (FLEDGE-4 / PLUGIN-3)", () => {
  test("parses list + audit through the fledge CLI with cwd = project", async () => {
    const fake = makeFake();
    const d = await discoverFledgePlugins({ cwd: fake.project, env: fake.env });
    expect(d.ok).toBe(true);
    expect(d.fledgeBin).toBe(join(fake.bin, "fledge"));
    expect(d.plugins.map((p) => p.name)).toEqual(["fledge-plugin-hello", "tz", "runner"]);
    const hello = d.plugins[0]!;
    expect(hello.commands).toEqual(["hello", "bye"]);
    expect(hello.capabilities?.metadata).toBe(true);
    // Invalid / overlong command names are skipped with a warning, not run.
    expect(d.plugins[2]!.commands).toEqual(["runner"]);
    expect(d.warnings.join("\n")).toContain("bad name");
  });

  test("fledge missing from PATH degrades cleanly", async () => {
    const d = await discoverFledgePlugins({ env: { PATH: "/nonexistent-dir" } });
    expect(d.ok).toBe(false);
    expect(d.plugins).toEqual([]);
    expect(d.error).toContain("not on PATH");
  });

  test("non-zero exit, bad JSON and timeout degrade with a reason", async () => {
    const broke = makeFake({ files: { "list.exit": "3" } });
    const d1 = await discoverFledgePlugins({ cwd: broke.project, env: broke.env });
    expect(d1.ok).toBe(false);
    expect(d1.error).toContain("exited 3");
    expect(d1.error).toContain("list broke");

    const junk = makeFake();
    writeFileSync(join(junk.bin, "list.json"), "not json {");
    const d2 = await discoverFledgePlugins({ cwd: junk.project, env: junk.env });
    expect(d2.ok).toBe(false);
    expect(d2.error).toContain("unexpected output");

    const slow = makeFake({ files: { "list.sleep": "5" } });
    const started = Date.now();
    const d3 = await discoverFledgePlugins({ cwd: slow.project, env: slow.env, timeoutMs: 200 });
    expect(d3.ok).toBe(false);
    expect(d3.error).toContain("timed out");
    expect(Date.now() - started).toBeLessThan(3000);
  });

  test("audit unavailable → capabilities unknown, treated as unsandboxed", async () => {
    const fake = makeFake({ audit: null });
    const d = await discoverFledgePlugins({ cwd: fake.project, env: fake.env });
    expect(d.ok).toBe(true);
    expect(d.plugins.every((p) => p.capabilities === null)).toBe(true);
    expect(d.warnings.join("\n")).toContain("audit unavailable");
    const tz = d.plugins.find((p) => p.name === "tz")!;
    expect(fledgeMinTier(tz)).toBe(2);
  });

  test("untrusted text is cleaned and capped", () => {
    expect(cleanText("a\u0000b\nc\td", 50)).toBe("a b c d");
    expect(cleanText("y".repeat(100), 10)).toHaveLength(10);
    const warnings: string[] = [];
    const rows = parsePluginList(
      { schema_version: 2, plugins: [{ name: "p\u001b[31m", commands: ["ok"] }, { commands: ["x"] }] },
      warnings,
    );
    expect(rows).toHaveLength(1);
    expect(rows![0]!.name).toBe("p [31m");
    expect(warnings.join("\n")).toContain("schema_version 2");
    expect(parsePluginList({ nope: true }, [])).toBeNull();
  });
});

describe("fledge commands registered as dangerous plugins (PLUGIN-2 / SAFE-1)", () => {
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

  test("each Fledge command registers as fledge-<command>, dangerous, minTier by sandbox", async () => {
    const fake = makeFake();
    const report = await loadFledgePlugins({ cwd: fake.project, env: fake.env });
    expect(report.ok).toBe(true);
    expect(report.registered.sort()).toEqual(["fledge-bye", "fledge-hello", "fledge-runner", "fledge-tz"]);
    const byName = Object.fromEntries(list().map((e) => [e.name, e]));
    for (const n of report.registered) {
      expect(byName[n]!.dangerous).toBe(true);
      expect(byName[n]!.minTier).toBeGreaterThanOrEqual(1);
    }
    expect(byName["fledge-hello"]!.minTier).toBe(2); // native
    expect(byName["fledge-tz"]!.minTier).toBe(1); // wasm, no exec
    expect(byName["fledge-runner"]!.minTier).toBe(2); // wasm + exec
    expect(get("fledge-hello")!.origin).toBe("fledge:fledge-plugin-hello@0.2.0");
    // Builtins untouched.
    expect(byName["shell-exec"]).toBeTruthy();
    // Status line for plugins list.
    expect(fledgeStatusLines(report)[0]).toContain("3 plugin(s), 4 command(s)");
  });

  test("description stays small and never carries the source path", async () => {
    const fake = makeFake();
    const d = await discoverFledgePlugins({ cwd: fake.project, env: fake.env });
    const desc = fledgeDescription(d.plugins[0]!, "hello");
    expect(desc).toContain("fledge plugins run hello");
    expect(desc).toContain("native, unsandboxed");
    expect(desc).not.toContain("/home/someone");
    expect(approxTokens(desc)).toBeLessThan(60);
  });

  test("name collisions are skipped, repeat loads reuse the same commands", async () => {
    const fake = makeFake({
      list: {
        schema_version: 1,
        plugins: [
          { name: "a", version: "1", commands: ["dup"], trust_tier: "unverified", runtime: "native" },
          { name: "b", version: "1", commands: ["dup"], trust_tier: "unverified", runtime: "native" },
        ],
      },
    });
    const r1 = await loadFledgePlugins({ cwd: fake.project, env: fake.env });
    expect(r1.registered).toEqual(["fledge-dup"]);
    expect(r1.skipped).toEqual([{ name: "fledge-dup", reason: "name already registered by fledge:a@1" }]);
    const r2 = await loadFledgePlugins({ cwd: fake.project, env: fake.env, force: true });
    expect(r2.registered).toEqual(["fledge-dup"]);
  });

  test("discovery failure leaves builtins working", async () => {
    const before = list().length;
    const r = await loadFledgePlugins({ env: { PATH: "/nonexistent-dir" } });
    expect(r.ok).toBe(false);
    expect(r.registered).toEqual([]);
    expect(list().length).toBe(before);
    expect(fledgeStatusLines(r)[0]).toContain("none loaded (fledge not on PATH)");
  });

  test("SAFE-1: non-interactive run is denied unless allowlisted", async () => {
    const fake = makeFake();
    await loadFledgePlugins({ cwd: fake.project, env: fake.env });
    const denied = await runPlugin({
      name: "fledge-hello",
      args: ["x"],
      cwd: fake.project,
      nonInteractive: true,
      allowlist: [],
    });
    expect(denied.ok).toBe(false);
    expect(denied.exitCode).toBe(2);
    expect(denied.error).toContain("SAFE-1");
  });

  test("allowlisted run: argv array (no shell), project cwd, scrubbed env", async () => {
    const fake = makeFake();
    await loadFledgePlugins({ cwd: fake.project, env: fake.env });
    const result = await runPlugin({
      name: "fledge-hello",
      args: ["two words", "$(echo pwned)", "--flag", "; rm -rf /"],
      cwd: fake.project,
      nonInteractive: true,
      allowlist: ["fledge-hello"],
    });
    expect(result.ok).toBe(true);
    const out = String(result.message);
    expect(out).toContain("cmd=hello");
    expect(out).toContain("arg=[two words]");
    expect(out).toContain("arg=[$(echo pwned)]");
    expect(out).toContain("arg=[--flag]");
    expect(out).toContain("arg=[; rm -rf /]");
    expect(out).toContain(`pwd=${fake.project}`);
    expect(out).toContain(`root=${fake.project}`);
    expect(out).toContain("discord=unset");
    expect(out).toContain("llm=unset");
    expect(out).toContain("audit=unset");
    expect(out).toContain("gh=gh-visible");
    expect(out).toContain("fni=1");
    expect((result.data as { command: string }).command).toBe("hello");
  });
});

describe("runFledgeCommand failure modes", () => {
  test("non-zero exit is a failed tool result with the exit code", async () => {
    const fake = makeFake({ files: { "run.exit": "7" } });
    const r = await runFledgeCommand({
      fledgeBin: join(fake.bin, "fledge"),
      plugin: "p",
      command: "hello",
      args: [],
      cwd: fake.project,
      env: fake.env,
    });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(7);
    expect(r.error).toContain('fledge plugin command "hello" exited 7');
  });

  test("timeout kills the run and reports exit 124", async () => {
    const fake = makeFake({ files: { "run.sleep": "5" } });
    const started = Date.now();
    const r = await runFledgeCommand({
      fledgeBin: join(fake.bin, "fledge"),
      plugin: "p",
      command: "hello",
      args: [],
      cwd: fake.project,
      env: fake.env,
      timeoutMs: 200,
    });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(124);
    expect(r.error).toContain("timed out");
    expect(Date.now() - started).toBeLessThan(3000);
  });

  test("output is secret-scrubbed and capped (SAFE-6)", async () => {
    const token = `ghp_${"A".repeat(36)}`;
    const fake = makeFake({ files: { "run.extra": `leak ${token}\n${"z".repeat(5000)}\n` } });
    const r = await runFledgeCommand({
      fledgeBin: join(fake.bin, "fledge"),
      plugin: "p",
      command: "hello",
      args: [],
      cwd: fake.project,
      env: fake.env,
      maxOutputBytes: 1024,
    });
    expect(r.ok).toBe(true);
    const out = String(r.message);
    expect(out).not.toContain(token);
    expect(out).toContain("[redacted:github-token]");
    expect(out).toContain("[output truncated at 1024 bytes per stream]");
    expect((r.data as { truncated: boolean }).truncated).toBe(true);
  });

  test("missing binary reports exit 127 instead of throwing", async () => {
    const r = await runFledgeCommand({
      fledgeBin: "/nonexistent-dir/fledge",
      plugin: "p",
      command: "hello",
      args: [],
      cwd: tmpdir(),
    });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(127);
  });

  test("child env drops Corvidinho, Discord and LLM secrets", () => {
    const env = fledgeChildEnv(
      {
        PATH: "/bin",
        HOME: "/home/x",
        DISCORD_BOT_TOKEN: "a",
        CORVIDINHO_ACTING_DISCORD_USER_ID: "1",
        OPENAI_API_KEY: "b",
        ANTHROPIC_API_KEY: "c",
        GH_TOKEN: "keep",
      },
      "/proj",
    );
    expect(env).toEqual({
      PATH: "/bin",
      HOME: "/home/x",
      GH_TOKEN: "keep",
      FLEDGE_NON_INTERACTIVE: "1",
      CORVIDINHO_PROJECT_ROOT: "/proj",
    });
  });
});

describe("tool schema cost view (FLEDGE-5 / PLUGIN-6)", () => {
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

  test("per-command cost matches the tool definition; totals group by origin", async () => {
    const fake = makeFake();
    await loadFledgePlugins({ cwd: fake.project, env: fake.env });
    const entries = withToolCost(list());
    const hello = entries.find((e) => e.name === "fledge-hello")!;
    expect(hello.origin).toBe("fledge:fledge-plugin-hello@0.2.0");
    expect(hello.approxTokens).toBe(Math.ceil(hello.schemaChars / 4));
    expect(entries.find((e) => e.name === "shell-exec")!.origin).toBe("builtin");

    const report = toolSurfaceReport(entries);
    expect(report.commands).toBe(entries.length);
    expect(report.totalTokens).toBe(entries.reduce((n, e) => n + e.approxTokens, 0));
    expect(report.overBudget).toBe(false);
    const origins = report.byOrigin.map((g) => g.origin);
    expect(origins).toContain("builtin");
    expect(origins).toContain("fledge:fledge-plugin-hello@0.2.0");
  });

  test("over budget and oversized schemas are flagged", () => {
    const entries = withToolCost(list());
    const report = toolSurfaceReport(entries, { budgetTokens: 100, softCapTokens: 150 });
    expect(report.overBudget).toBe(true);
    expect(report.oversized).toContain("memory-store");
    const text = formatPluginsListText(entries, report, ["note line"]);
    expect(text).toContain("OVER BUDGET");
    expect(text).toContain("oversized (> ~150 tokens each)");
    expect(text).toContain("note line");
    expect(text).toMatch(/shell-exec {2}\[dangerous, tier>=2\] {2}~\d+ tok/);
  });
});

describe("tool loop can call a Fledge plugin when dangerous tools are offered", () => {
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

  test("includeDangerous + code tier: fledge-hello is offered and runs when allowlisted", async () => {
    const fake = makeFake();
    let call = 0;
    let offered: string[] = [];
    const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
      call += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        tools?: { function: { name: string } }[];
      };
      if (call === 1) {
        offered = (body.tools ?? []).map((t) => t.function.name);
        return Response.json({
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "c1",
                    type: "function",
                    function: { name: "fledge-hello", arguments: '{"argv":["world"]}' },
                  },
                ],
              },
            },
          ],
        });
      }
      return Response.json({ choices: [{ message: { role: "assistant", content: "done" } }] });
    };
    const events: AgentEvent[] = [];
    const exec = createTaskExecute({
      taskText: "say hello",
      cwd: fake.project,
      env: {
        ...fake.env,
        CORVIDINHO_LLM_API_KEY: "k",
        CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
        CORVIDINHO_LLM_MODEL: "m",
      },
      fetchImpl,
      tier: "code",
      includeDangerous: true,
      allowlist: ["fledge-hello"],
      onEvent: (e) => events.push(e),
      maxToolRounds: 3,
    });
    const result = await exec({ attempt: 1, signal: new AbortController().signal });
    expect(result.summary).toBe("done");
    expect(offered).toContain("fledge-hello");
    const toolResult = events.find((e) => e.type === "ToolResult") as
      | { name: string; success: boolean; detail?: string }
      | undefined;
    expect(toolResult?.name).toBe("fledge-hello");
    expect(toolResult?.success).toBe(true);
    expect(toolResult?.detail ?? "").toContain("arg=[world]");
  });

  test("default catalog (no includeDangerous) never discovers or offers Fledge commands", async () => {
    const fake = makeFake();
    let offered: string[] = [];
    const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        tools?: { function: { name: string } }[];
      };
      offered = (body.tools ?? []).map((t) => t.function.name);
      return Response.json({ choices: [{ message: { role: "assistant", content: "ok" } }] });
    };
    const exec = createTaskExecute({
      taskText: "x",
      cwd: fake.project,
      env: { ...fake.env, CORVIDINHO_LLM_API_KEY: "k", CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1" },
      fetchImpl,
      tier: "code",
      maxToolRounds: 2,
    });
    await exec({ attempt: 1, signal: new AbortController().signal });
    // No Fledge plugin command; only the read-only Fledge core builtins (PLUGIN-1, REQ-plugins-461).
    expect(offered.filter((n) => n.startsWith("fledge-")).sort()).toEqual([
      "fledge-lanes-list",
      "fledge-lanes-validate",
    ]);
    expect(get("fledge-hello")).toBeUndefined();
  });
});
