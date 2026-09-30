/**
 * REQ-agent-117 — AUTONOMOUS-1 gate and SAFE-9 catalog hiding (issue #117).
 * Temp project roots only; mocked fetch; no network, no worktrees.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildOpenAiTools,
  createTaskExecute,
  type AgentEvent,
} from "../src/agent/index.ts";
import {
  autonomousSessionAllowed,
  isAutonomousEnabled,
  loadAutonomousConfig,
  parseAutonomousConfig,
} from "../src/autonomous/enabled.ts";
import { createDelegateCommand } from "../plugins/autonomous/index.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry, get, list, register } from "../src/plugins/registry.ts";
import { ROLE_REFUSED_MESSAGE } from "../src/plugins/roles.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { resultFrame, serializeFrame } from "../src/agent/events-ndjson.ts";

const root = import.meta.dir + "/..";

function project(toml?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-autonomous-"));
  if (toml !== undefined) writeFileSync(join(dir, "fledge.toml"), toml);
  return dir;
}

const ENABLED = "[corvidinho]\nmax_retries = 3\n\n[corvidinho.autonomous]\nenabled = true\n";

describe("AUTONOMOUS-1: off until the project config enables it", () => {
  test("only [corvidinho.autonomous] enabled = true turns it on", () => {
    expect(parseAutonomousConfig("").enabled).toBe(false);
    expect(parseAutonomousConfig("[corvidinho]\nverify_before_complete = true\n").enabled).toBe(false);
    expect(parseAutonomousConfig(ENABLED).enabled).toBe(true);
    expect(parseAutonomousConfig("[corvidinho.autonomous]\nenabled = true # on\n").enabled).toBe(true);
    expect(parseAutonomousConfig("[ corvidinho.autonomous ]\n  enabled=true\n").enabled).toBe(true);
    // Same TOML key as a dotted key under [corvidinho].
    expect(parseAutonomousConfig("[corvidinho]\nautonomous.enabled = true\n").enabled).toBe(true);
  });

  test("anything else stays off (fail closed)", () => {
    const off = [
      "[corvidinho.autonomous]\nenabled = false\n",
      '[corvidinho.autonomous]\nenabled = "true"\n',
      "[corvidinho.autonomous]\nenabled = 1\n",
      "[corvidinho.autonomous]\n# enabled = true\n",
      "[corvidinho]\nautonomous = true\n",
      "[corvidinho]\nautonomous = { enabled = true }\n",
      "[merlin.autonomous]\nenabled = true\n",
      "[other]\nenabled = true\n",
      "enabled = true\n",
      // A later table (incl. array-of-tables) ends the autonomous scope.
      "[corvidinho.autonomous]\n[[tasks.x]]\nenabled = true\n",
      "[corvidinho.autonomous]\n[tasks.y]\nenabled = true\n",
      // Last write wins: explicitly turned back off.
      "[corvidinho.autonomous]\nenabled = true\nenabled = false\n",
    ];
    for (const toml of off) {
      expect(parseAutonomousConfig(toml).enabled).toBe(false);
    }
  });

  test("reads <cwd>/fledge.toml; missing file is off", () => {
    expect(loadAutonomousConfig(project()).enabled).toBe(false);
    expect(isAutonomousEnabled(project(ENABLED))).toBe(true);
    expect(isAutonomousEnabled(project("[corvidinho]\nmax_retries = 1\n"))).toBe(false);
  });

  test("this repo ships with autonomous mode off", () => {
    expect(isAutonomousEnabled(root)).toBe(false);
  });

  test("session gate: enabled project and depth below the cap", () => {
    const on = project(ENABLED);
    expect(autonomousSessionAllowed({ cwd: on, env: {} })).toBe(true);
    expect(autonomousSessionAllowed({ cwd: on, env: { CORVIDINHO_DELEGATE_DEPTH: "1" } })).toBe(true);
    expect(autonomousSessionAllowed({ cwd: on, env: { CORVIDINHO_DELEGATE_DEPTH: "2" } })).toBe(false);
    expect(autonomousSessionAllowed({ cwd: on, env: { CORVIDINHO_DELEGATE_DEPTH: "x" } })).toBe(false);
    expect(autonomousSessionAllowed({ cwd: project(), env: {} })).toBe(false);
  });
});

describe("SAFE-9: delegate hidden from the catalog unless the session is allowed", () => {
  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
  });
  afterEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  test("delegate is registered and declared (PLUGIN-2/5/6)", () => {
    const cmd = get("delegate");
    expect(cmd).toBeDefined();
    expect(cmd!.dangerous).toBe(false);
    expect(cmd!.minTier).toBe(2);
    expect(cmd!.autonomous).toBe(true);
    // ROLES-CHAT-5: a worker runs tools, so delegate counts as mutating.
    expect(cmd!.mutating).toBe(true);
    expect(list().find((e) => e.name === "delegate")?.mutating).toBe(true);
  });

  test("ROLES-CHAT-2: non-ADMIN catalog omits delegate even when autonomous is allowed", () => {
    const nonAdmin = buildOpenAiTools({ tier: "code", autonomous: true, actingIsAdmin: false });
    const names = nonAdmin.map((t) => t.function.name);
    expect(names).not.toContain("delegate");
    expect(names).toContain("files-read");
    const admin = buildOpenAiTools({ tier: "code", autonomous: true, actingIsAdmin: true });
    expect(admin.map((t) => t.function.name)).toContain("delegate");
  });

  test("default catalog omits delegate at every tier", () => {
    for (const tier of ["read", "tool", "code"] as const) {
      const names = buildOpenAiTools({ tier }).map((t) => t.function.name);
      expect(names).not.toContain("delegate");
    }
    // Non-autonomous plugins are unaffected.
    const code = buildOpenAiTools({ tier: "code" }).map((t) => t.function.name);
    expect(code).toContain("files-write");
  });

  test("allowed session: offered at code tier only (small models never see it)", () => {
    const code = buildOpenAiTools({ tier: "code", autonomous: true }).map((t) => t.function.name);
    expect(code).toContain("delegate");
    const tool = buildOpenAiTools({ tier: "tool", autonomous: true }).map((t) => t.function.name);
    expect(tool).not.toContain("delegate");
    expect(buildOpenAiTools({ tier: "read", autonomous: true })).toEqual([]);
  });
});

type Body = { tools?: { function: { name: string } }[]; messages: { role: string; content: string | null }[] };

function finalReply(text: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: text } }] }));
}

function toolCallReply(name: string, argv: string[]): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "call_1", type: "function", function: { name, arguments: JSON.stringify({ argv }) } },
            ],
          },
        },
      ],
    }),
  );
}

describe("tool loop offers delegate per project config (REQ-agent-117)", () => {
  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
  });
  afterEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  async function catalogFor(cwd: string, env: NodeJS.ProcessEnv): Promise<string[]> {
    const bodies: Body[] = [];
    const exec = createTaskExecute({
      taskText: "x",
      cwd,
      env: { CORVIDINHO_LLM_API_KEY: "k", CORVIDINHO_LLM_MODEL: "test-model", ...env },
      fetchImpl: async (_u, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return finalReply("done");
      },
    });
    await exec({ attempt: 1, signal: new AbortController().signal });
    return (bodies[0]?.tools ?? []).map((t) => t.function.name);
  }

  test("enabled project + code tier → offered; off / tool tier / depth cap → hidden", async () => {
    const on = project(ENABLED);
    expect(await catalogFor(on, { CORVIDINHO_LLM_TIER: "code" })).toContain("delegate");
    expect(await catalogFor(project(), { CORVIDINHO_LLM_TIER: "code" })).not.toContain("delegate");
    expect(await catalogFor(on, { CORVIDINHO_LLM_TIER: "tool" })).not.toContain("delegate");
    expect(
      await catalogFor(on, { CORVIDINHO_LLM_TIER: "code", CORVIDINHO_DELEGATE_DEPTH: "2" }),
    ).not.toContain("delegate");
  });

  test("ROLES-CHAT-2/4: a non-ADMIN role session never sees delegate; the ADMIN owner does", async () => {
    const on = project(ENABLED);
    const owner = "181969874455756800";
    const allowFile = join(mkdtempSync(join(tmpdir(), "corvidinho-autonomous-roles-")), "allowlist.toml");
    writeFileSync(
      allowFile,
      `[discord]\nchannels = ["1"]\nroles = []\nusers = []\ndeny_users = []\n\n[owner]\ndiscord_id = "${owner}"\n`,
    );
    const role = { CORVIDINHO_LLM_TIER: "code", CORVIDINHO_ALLOWLIST_FILE: allowFile };
    expect(
      await catalogFor(on, {
        ...role,
        CORVIDINHO_ACTING_IS_ADMIN: "0",
        CORVIDINHO_ACTING_DISCORD_USER_ID: "999999999999999999",
      }),
    ).not.toContain("delegate");
    expect(
      await catalogFor(on, {
        ...role,
        CORVIDINHO_ACTING_IS_ADMIN: "1",
        CORVIDINHO_ACTING_DISCORD_USER_ID: owner,
      }),
    ).toContain("delegate");
  });

  test("ROLES-CHAT-3: runPlugin refuses delegate for a non-ADMIN role session; nothing spawned", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-delegate-role-"));
    const bin = join(dir, "corvidinho");
    writeFileSync(bin, `#!/bin/sh\ntouch "${dir}/spawned"\n`, { mode: 0o755 });
    clearRegistry();
    register(createDelegateCommand({ bin, env: { PATH: process.env.PATH ?? "" } }));
    const keys = ["CORVIDINHO_ACTING_IS_ADMIN", "CORVIDINHO_ACTING_DISCORD_USER_ID"] as const;
    const prev = keys.map((k) => process.env[k]);
    process.env.CORVIDINHO_ACTING_IS_ADMIN = "0";
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = "999999999999999999";
    try {
      const r = await runPlugin({
        name: "delegate",
        args: ["--task", "sub"],
        cwd: project(ENABLED),
        nonInteractive: true,
        tier: "code",
      });
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(2);
      expect(r.error).toContain(ROLE_REFUSED_MESSAGE);
      expect(existsSync(join(dir, "spawned"))).toBe(false);
    } finally {
      keys.forEach((k, i) => {
        if (prev[i] === undefined) delete process.env[k];
        else process.env[k] = prev[i];
      });
    }
  });

  test("a model naming delegate when it is hidden is refused, not run (REQ-agent-128)", async () => {
    let call = 0;
    const events: AgentEvent[] = [];
    const exec = createTaskExecute({
      taskText: "x",
      cwd: project(),
      env: { CORVIDINHO_LLM_API_KEY: "k", CORVIDINHO_LLM_MODEL: "test-model", CORVIDINHO_LLM_TIER: "code" },
      onEvent: (e) => events.push(e),
      fetchImpl: async () => {
        call += 1;
        return call === 1 ? toolCallReply("delegate", ["--task", "sub"]) : finalReply("ok");
      },
    });
    await exec({ attempt: 1, signal: new AbortController().signal });
    const result = events.find((e) => e.type === "ToolResult");
    expect(result).toMatchObject({ type: "ToolResult", success: false });
    expect((result as { detail?: string }).detail).toContain("not offered");
  });

  test("lead delegates, worker result flows back for synthesis", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-delegate-loop-"));
    const bin = join(dir, "corvidinho");
    const frame = serializeFrame(
      resultFrame({
        summary: "worker found 3 specs",
        filesChanged: ["notes.md"],
        verified: false,
        verifySkipped: true,
        cancelled: false,
        state: "done",
        attempts: 1,
      }),
    );
    writeFileSync(
      bin,
      `#!/bin/sh\nprintf '%s\\0' "$@" > "${dir}/argv.bin"\ncat <<'EOF'\n${frame}\nEOF\n`,
      { mode: 0o755 },
    );
    clearRegistry();
    register(createDelegateCommand({ bin, env: { PATH: process.env.PATH ?? "" } }));

    const bodies: Body[] = [];
    let call = 0;
    const exec = createTaskExecute({
      taskText: "survey specs",
      cwd: project(ENABLED),
      env: { CORVIDINHO_LLM_API_KEY: "k", CORVIDINHO_LLM_MODEL: "test-model", CORVIDINHO_LLM_TIER: "code" },
      loadPlugins: false,
      allowlist: [],
      fetchImpl: async (_u, init) => {
        call += 1;
        bodies.push(JSON.parse(String(init?.body)));
        return call === 1
          ? toolCallReply("delegate", ["--skill", "specsync", "--task", "count specs"])
          : finalReply("Synthesized: worker found 3 specs.");
      },
    });
    const r = await exec({ attempt: 1, signal: new AbortController().signal });
    expect(r.summary).toBe("Synthesized: worker found 3 specs.");
    expect(r.filesChanged).toEqual(["notes.md"]);
    const toolMsg = bodies[1]!.messages.find((m) => m.role === "tool");
    const payload = JSON.parse(String(toolMsg!.content));
    expect(payload.ok).toBe(true);
    expect(payload.data).toMatchObject({
      skill: "specsync",
      tier: "code",
      depth: 1,
      state: "done",
      filesChanged: ["notes.md"],
    });
    expect(payload.data.summary).toContain("worker found 3 specs");
  });
});
