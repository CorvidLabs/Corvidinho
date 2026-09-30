/**
 * `task run` offers allowlisted dangerous tools to the model (REQ-agent-501,
 * CLI-3 / SAFE-1, GITHUB-1/3, ROLES-CHAT-4, PLUGIN-3): a dangerous plugin is
 * in the catalog only when the run's allowlist names it, never the
 * SAFE-3-pending shell, runners and Fledge core runs, and never for a
 * non-ADMIN role session.
 * A non-git run whose Fledge command may have changed files verifies anyway
 * (REQ-agent-502, AGENT-4). Fake provider, fake `fledge`, GitHub dry-run: no
 * network, no tokens.
 */

import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskExecute, type AgentEvent } from "../src/agent/index.ts";
import { resultFrame, serializeFrame } from "../src/agent/events-ndjson.ts";
import { runTask } from "../src/agent/loop.ts";
import type { TaskResult } from "../src/agent/types.ts";
import { DELEGATE_DEPTH_ENV } from "../src/autonomous/delegate.ts";
import * as tools from "../src/agent/tools.ts";
import { buildOpenAiTools } from "../src/agent/tools.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry, get, list } from "../src/plugins/registry.ts";
import { resetFledgeDiscovery } from "../plugins/fledge/index.ts";

const GITHUB_WRITES = [
  "github-issue-create",
  "github-issue-comment",
  "github-pr-create",
  "github-pr-review",
];
const MEMORY_DESTRUCTIVE = ["memory-forget", "memory-override"];
/** Fledge core runs (PLUGIN-1): a lane or task runs the project's own commands. */
const FLEDGE_CORE_RUNS = ["fledge-lanes-run", "fledge-run"];
/** Shell + language runners + Fledge core runs: not offered from the allowlist until SAFE-3 is decided. */
const SAFE3_PENDING = ["shell-exec", "node-exec", "python-exec", "cargo-exec", ...FLEDGE_CORE_RUNS];

const OWNER = "181969874455756800";

/** Env keys a test sets; saved and restored around each test. */
const KEYS = [
  "CORVIDINHO_ALLOWLIST",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_GITHUB_DRY_RUN",
  "CORVIDINHO_GITHUB_ALLOW_REPOS",
  "CORVIDINHO_GITHUB_ALLOW_ORGS",
  "CORVIDINHO_GITHUB_ALLOW_USERS",
  "CORVIDINHO_GITHUB_DENY_REPOS",
  "CORVIDINHO_GITHUB_DENY_ORGS",
  "CORVIDINHO_GITHUB_DENY_USERS",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "CORVIDINHO_BIN",
  DELEGATE_DEPTH_ENV,
] as const;

let saved: Record<string, string | undefined> = {};
const temps: string[] = [];

function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    if (k !== "CORVIDINHO_ALLOWLIST_FILE") delete process.env[k];
  }
  clearRegistry();
  resetFledgeDiscovery();
  loadBuiltins();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  clearRegistry();
  resetFledgeDiscovery();
  loadBuiltins();
});

afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

const LLM_ENV = {
  CORVIDINHO_LLM_API_KEY: "k",
  CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
  CORVIDINHO_LLM_MODEL: "m",
};

type ToolCallSpec = { name: string; argv: string[] };

/**
 * Fake provider: the first reply calls `calls`, later replies are plain text.
 * `offered` holds the tool names of the first request.
 */
function fakeProvider(calls: ToolCallSpec[]) {
  const seen = { requests: 0, offered: [] as string[] };
  const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
    seen.requests += 1;
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      tools?: { function: { name: string } }[];
    };
    if (seen.requests === 1) seen.offered = (body.tools ?? []).map((t) => t.function.name);
    const message =
      seen.requests === 1 && calls.length > 0
        ? {
            role: "assistant",
            content: null,
            tool_calls: calls.map((c, i) => ({
              id: `c${i}`,
              type: "function",
              function: { name: c.name, arguments: JSON.stringify({ argv: c.argv }) },
            })),
          }
        : { role: "assistant", content: "done" };
    return Response.json({ choices: [{ message }] });
  };
  return { fetchImpl, seen };
}

function toolResults(events: AgentEvent[]) {
  return events.filter(
    (e): e is Extract<AgentEvent, { type: "ToolResult" }> => e.type === "ToolResult",
  );
}

describe("task-run catalog offers allowlisted dangerous tools (REQ-agent-501, CLI-3 / SAFE-1)", () => {
  const names = (opts: Parameters<typeof buildOpenAiTools>[0]) =>
    new Set(buildOpenAiTools(opts).map((t) => t.function.name));

  test("GitHub writes and memory forget/override are offered at tool tier once allowlisted; unlisted dangerous tools stay out", () => {
    const allow = new Set([...GITHUB_WRITES, ...MEMORY_DESTRUCTIVE]);
    const offered = names({ tier: "tool", allowlist: allow });
    for (const n of [...GITHUB_WRITES, ...MEMORY_DESTRUCTIVE]) expect(offered.has(n)).toBe(true);
    // Registered, dangerous, not named: never offered.
    for (const n of ["danger-ping", "web-fetch", "discord-post-message"]) {
      expect(get(n)?.dangerous).toBe(true);
      expect(offered.has(n)).toBe(false);
    }
    // No allowlist: no dangerous tool at all (today's default catalog).
    const none = buildOpenAiTools({ tier: "code" });
    expect(none.some((t) => get(t.function.name)?.dangerous)).toBe(false);
  });

  test("every offered dangerous tool is one the allowlist names", () => {
    const allow = new Set(["github-pr-review", "files-delete"]);
    for (const tier of ["tool", "code"] as const) {
      for (const t of buildOpenAiTools({ tier, allowlist: allow })) {
        if (get(t.function.name)?.dangerous) expect(allow.has(t.function.name)).toBe(true);
      }
    }
  });

  test("tier still filters: files-delete (minTier code) is offered at code tier, not at tool tier", () => {
    const allow = new Set(["files-delete"]);
    expect(names({ tier: "code", allowlist: allow }).has("files-delete")).toBe(true);
    expect(names({ tier: "tool", allowlist: allow }).has("files-delete")).toBe(false);
  });

  test("shell-exec, the node/python/cargo runners and the Fledge core runs are never offered from the allowlist (SAFE-3 pending)", () => {
    expect([...(tools.SAFE3_PENDING_TOOLS ?? [])].sort()).toEqual([...SAFE3_PENDING].sort());
    const allow = new Set([...SAFE3_PENDING, "files-delete"]);
    const offered = names({ tier: "code", allowlist: allow });
    for (const n of SAFE3_PENDING) expect(offered.has(n)).toBe(false);
    expect(offered.has("files-delete")).toBe(true);
    // The Fledge core runs are always registered, dangerous and code tier: only the hold-out keeps them out.
    const seam = names({ tier: "code", includeDangerous: true });
    for (const n of FLEDGE_CORE_RUNS) {
      expect(get(n)?.dangerous).toBe(true);
      expect(seam.has(n)).toBe(true);
      expect(tools.editsFilesUnreported(n)).toBe(true);
    }
  });

  test("a non-ADMIN role session gets no dangerous or mutating tool, whatever the allowlist (ROLES-CHAT-2)", () => {
    const allow = new Set(list().filter((e) => e.dangerous).map((e) => e.name));
    const offered = buildOpenAiTools({ tier: "code", allowlist: allow, actingIsAdmin: false });
    expect(offered.length).toBeGreaterThan(0);
    for (const t of offered) {
      const cmd = get(t.function.name);
      expect(Boolean(cmd?.dangerous || cmd?.mutating)).toBe(false);
    }
  });
});

describe("task run: the model calls an allowlisted GitHub write (GITHUB-1/3, CLI-3, ROLES-CHAT-4)", () => {
  function ghDryRun() {
    process.env.CORVIDINHO_GITHUB_DRY_RUN = "1";
    process.env.CORVIDINHO_GITHUB_ALLOW_REPOS = "CorvidLabs/Corvidinho";
  }
  const REVIEW: ToolCallSpec = {
    name: "github-pr-review",
    argv: ["7", "--repo", "CorvidLabs/Corvidinho", "--body", "Looks right", "--event", "COMMENT"],
  };
  const ISSUE: ToolCallSpec = {
    name: "github-issue-create",
    argv: ["--repo", "CorvidLabs/Corvidinho", "--title", "t", "--body", "b"],
  };

  async function run(envExtra: Record<string, string> = {}) {
    const { fetchImpl, seen } = fakeProvider([REVIEW, ISSUE]);
    const events: AgentEvent[] = [];
    // No `allowlist` option: the run reads CORVIDINHO_ALLOWLIST like `task run`.
    const exec = createTaskExecute({
      taskText: "review PR 7",
      env: { ...process.env, ...LLM_ENV, ...envExtra },
      fetchImpl,
      tier: "tool",
      nonInteractive: true,
      autonomous: false,
      projectInstructions: false,
      onEvent: (e) => events.push(e),
      maxToolRounds: 3,
    });
    const result = await exec({ attempt: 1, signal: new AbortController().signal });
    return { result, seen, results: toolResults(events) };
  }

  test("CORVIDINHO_ALLOWLIST=github-pr-review: the review is offered and submitted (dry run); the unlisted issue create is refused, not run", async () => {
    ghDryRun();
    process.env.CORVIDINHO_ALLOWLIST = "github-pr-review";
    const { result, seen, results } = await run();
    expect(seen.offered).toContain("github-pr-review");
    expect(seen.offered).not.toContain("github-issue-create");
    const review = results.find((r) => r.name === "github-pr-review");
    expect(review?.success).toBe(true);
    expect(review?.detail ?? "").toContain('"dryRun":true');
    expect(review?.detail ?? "").toContain('"pull_number":7');
    const issue = results.find((r) => r.name !== "github-pr-review");
    expect(issue?.success).toBe(false);
    expect(issue?.detail ?? "").toContain("not offered");
    expect(result.summary).toBe("done");
  });

  test("ADMIN role session (the owner) gets the allowlisted review; a non-ADMIN session with the same allowlist does not", async () => {
    ghDryRun();
    process.env.CORVIDINHO_ALLOWLIST = "github-pr-review";
    process.env.CORVIDINHO_OWNER_DISCORD_ID = OWNER;
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = OWNER;
    process.env.CORVIDINHO_ACTING_IS_ADMIN = "1";
    const admin = await run();
    expect(admin.seen.offered).toContain("github-pr-review");
    expect(admin.results.find((r) => r.name === "github-pr-review")?.success).toBe(true);

    process.env.CORVIDINHO_ACTING_IS_ADMIN = "0";
    const community = await run();
    expect(community.seen.offered).not.toContain("github-pr-review");
    expect(community.results.every((r) => !r.success)).toBe(true);
  });
});

const FAKE_FLEDGE = `#!/bin/sh
dir="$(dirname "$0")"
echo "$*" >> "$dir/calls.log"
[ "$1" = "--non-interactive" ] && shift
if [ "$1 $2" = "plugins list" ]; then cat "$dir/list.json"; exit 0; fi
if [ "$1 $2" = "plugins audit" ]; then cat "$dir/audit.json"; exit 0; fi
if [ "$1 $2" = "plugins run" ]; then
  echo "ran $3"
  [ -f "$dir/run.write" ] && printf broken > "$(pwd)/app.ts"
  echo "spawned" >> "$dir/runs.log"
  exit 0
fi
echo "spawned" >> "$dir/other.log"
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
      commands: ["hello"],
      trust_tier: "unverified",
      runtime: "native",
    },
  ],
};
const AUDIT = {
  schema_version: 1,
  audit: [
    {
      name: "fledge-plugin-hello",
      capabilities: { exec: true, store: false, metadata: false, filesystem: "project", network: false },
    },
  ],
};

/** A fake `fledge` on PATH and a non-git project dir. */
function makeFledge(opts: { write?: boolean } = {}) {
  const root = tempDir("corvidinho-allow-fledge-");
  const bin = join(root, "bin");
  const project = join(root, "project");
  mkdirSync(bin);
  mkdirSync(project);
  writeFileSync(join(bin, "fledge"), FAKE_FLEDGE);
  chmodSync(join(bin, "fledge"), 0o755);
  writeFileSync(join(bin, "list.json"), JSON.stringify(LIST));
  writeFileSync(join(bin, "audit.json"), JSON.stringify(AUDIT));
  if (opts.write) writeFileSync(join(bin, "run.write"), "");
  return { bin, project, env: { PATH: `${bin}:/usr/bin:/bin`, ...LLM_ENV } };
}

describe("Fledge commands through the allowlist (PLUGIN-3 / FLEDGE-4, REQ-agent-112)", () => {
  /** Read-only Fledge core builtins every catalog offers; they spawn fledge only when called. */
  const FLEDGE_CORE_READS = ["fledge-lanes-list", "fledge-lanes-validate"];

  test("allowlisting fledge-hello (no includeDangerous) discovers, offers and runs it at code tier", async () => {
    const fake = makeFledge();
    const { fetchImpl, seen } = fakeProvider([{ name: "fledge-hello", argv: ["world"] }]);
    const events: AgentEvent[] = [];
    const exec = createTaskExecute({
      taskText: "say hello",
      cwd: fake.project,
      env: fake.env,
      fetchImpl,
      tier: "code",
      nonInteractive: true,
      allowlist: ["fledge-hello"],
      autonomous: false,
      projectInstructions: false,
      onEvent: (e) => events.push(e),
      maxToolRounds: 3,
    });
    const result = await exec({ attempt: 1, signal: new AbortController().signal });
    expect(seen.offered).toContain("fledge-hello");
    const r = toolResults(events).find((e) => e.name === "fledge-hello");
    expect(r?.success).toBe(true);
    expect(r?.detail ?? "").toContain("ran hello");
    expect(result.unreportedEditTools).toEqual(["fledge-hello"]);
  });

  test("an allowlist with no fledge-* entry never spawns fledge", async () => {
    const fake = makeFledge();
    const { fetchImpl, seen } = fakeProvider([]);
    const exec = createTaskExecute({
      taskText: "x",
      cwd: fake.project,
      env: fake.env,
      fetchImpl,
      tier: "code",
      allowlist: ["github-pr-review"],
      autonomous: false,
      projectInstructions: false,
      maxToolRounds: 2,
    });
    await exec({ attempt: 1, signal: new AbortController().signal });
    // No Fledge plugin command; only the read-only Fledge core builtins (PLUGIN-1, REQ-plugins-461).
    expect(seen.offered.filter((n) => n.startsWith("fledge-")).sort()).toEqual(FLEDGE_CORE_READS);
    expect(get("fledge-hello")).toBeUndefined();
    expect(existsSync(join(fake.bin, "calls.log"))).toBe(false);
    expect(existsSync(join(fake.bin, "other.log"))).toBe(false);
    expect(existsSync(join(fake.bin, "runs.log"))).toBe(false);
  });

  test("allowlisted Fledge core builtins: the runs stay out until SAFE-3 and no core name starts discovery (REQ-agent-501)", async () => {
    const fake = makeFledge();
    const { fetchImpl, seen } = fakeProvider([{ name: "fledge-run", argv: ["test"] }]);
    const events: AgentEvent[] = [];
    const exec = createTaskExecute({
      taskText: "x",
      cwd: fake.project,
      env: fake.env,
      fetchImpl,
      tier: "code",
      nonInteractive: true,
      allowlist: [...FLEDGE_CORE_READS, ...FLEDGE_CORE_RUNS],
      autonomous: false,
      projectInstructions: false,
      onEvent: (e) => events.push(e),
      maxToolRounds: 2,
    });
    const result = await exec({ attempt: 1, signal: new AbortController().signal });
    expect(seen.offered.filter((n) => n.startsWith("fledge-")).sort()).toEqual(FLEDGE_CORE_READS);
    const r = toolResults(events).find((e) => (e.detail ?? "").includes('"fledge-run"'));
    expect(r?.success).toBe(false);
    expect(r?.detail ?? "").toContain("not offered");
    expect(result.unreportedEditTools).toBeUndefined();
    expect(get("fledge-hello")).toBeUndefined();
    expect(existsSync(join(fake.bin, "calls.log"))).toBe(false);
  });

  async function roleSessionRun(isAdmin: "0" | "1") {
    const fake = makeFledge();
    const { fetchImpl, seen } = fakeProvider([]);
    const exec = createTaskExecute({
      taskText: "x",
      cwd: fake.project,
      env: {
        ...fake.env,
        CORVIDINHO_ALLOWLIST_FILE: process.env.CORVIDINHO_ALLOWLIST_FILE,
        CORVIDINHO_OWNER_DISCORD_ID: OWNER,
        CORVIDINHO_ACTING_DISCORD_USER_ID: OWNER,
        CORVIDINHO_ACTING_IS_ADMIN: isAdmin,
      },
      fetchImpl,
      tier: "code",
      allowlist: ["fledge-hello"],
      autonomous: false,
      projectInstructions: false,
      maxToolRounds: 2,
    });
    await exec({ attempt: 1, signal: new AbortController().signal });
    return { fake, seen };
  }

  test("a non-ADMIN role session with fledge-hello allowlisted never spawns fledge (ROLES-CHAT-2)", async () => {
    const { fake, seen } = await roleSessionRun("0");
    expect(seen.offered.filter((n) => n.startsWith("fledge-")).sort()).toEqual(FLEDGE_CORE_READS);
    expect(get("fledge-hello")).toBeUndefined();
    expect(existsSync(join(fake.bin, "calls.log"))).toBe(false);
  });

  test("the owner's ADMIN role session with fledge-hello allowlisted discovers and offers it", async () => {
    const { seen } = await roleSessionRun("1");
    expect(seen.offered).toContain("fledge-hello");
  });
});

describe("non-git verify gate fails closed after a Fledge command (REQ-agent-502, AGENT-4)", () => {
  async function runFledgeTask(opts: {
    includeDangerous?: boolean;
    calls?: ToolCallSpec[];
    envExtra?: Record<string, string>;
    /** Written to the project's fledge.toml before the run. */
    fledgeToml?: string;
  }) {
    const fake = makeFledge({ write: true });
    if (opts.fledgeToml !== undefined) writeFileSync(join(fake.project, "fledge.toml"), opts.fledgeToml);
    const { fetchImpl } = fakeProvider(opts.calls ?? [{ name: "fledge-hello", argv: [] }]);
    const events: AgentEvent[] = [];
    const execute = createTaskExecute({
      taskText: "run the hello plugin",
      cwd: fake.project,
      env: { ...fake.env, ...(opts.envExtra ?? {}) },
      fetchImpl,
      tier: "code",
      nonInteractive: true,
      allowlist: ["fledge-hello", "github-pr-review"],
      includeDangerous: opts.includeDangerous,
      autonomous: false,
      projectInstructions: false,
      onEvent: (e) => events.push(e),
      maxToolRounds: 3,
    });
    const verifyCwds: string[] = [];
    const result = await runTask({
      cwd: fake.project,
      maxRetries: 0,
      onEvent: (e) => events.push(e),
      verifyRunner: async (cwd) => {
        verifyCwds.push(cwd);
        return { success: false, output: "app.ts: syntax error" };
      },
      execute,
    });
    return { fake, result, events, verifyCwds };
  }

  test("allowlisted fledge-hello edits app.ts in a non-git project without reporting it: verify runs and the run fails, never done", async () => {
    const { fake, result, events, verifyCwds } = await runFledgeTask({});
    expect(readFileSync(join(fake.project, "app.ts"), "utf8")).toBe("broken");
    expect(result.filesChanged).toEqual([]);
    expect(verifyCwds).toEqual([fake.project]);
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
    const note = events.find(
      (e) => e.type === "Text" && e.text.startsWith("Verify gate: no git working tree to diff"),
    );
    expect(note && "text" in note ? note.text : "").toContain("fledge-hello");
  });

  test("the same holds when every dangerous tool is included (includeDangerous seam)", async () => {
    const { result, verifyCwds } = await runFledgeTask({ includeDangerous: true });
    expect(verifyCwds.length).toBe(1);
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
  });

  test("a non-git run whose only tool was an allowlisted GitHub write still skips verify", async () => {
    process.env.CORVIDINHO_GITHUB_DRY_RUN = "1";
    process.env.CORVIDINHO_GITHUB_ALLOW_REPOS = "CorvidLabs/Corvidinho";
    const { result, verifyCwds, events } = await runFledgeTask({
      calls: [
        {
          name: "github-pr-review",
          argv: ["7", "--repo", "CorvidLabs/Corvidinho", "--body", "ok"],
        },
      ],
    });
    expect(toolResults(events).find((r) => r.name === "github-pr-review")?.success).toBe(true);
    expect(verifyCwds).toEqual([]);
    expect(result.state).toBe("done");
    expect(result.verifySkipped).toBe(true);
  });

  test("a project fledge.toml with verify_before_complete = false cannot turn the gate off (AGENT-14)", async () => {
    const { result, verifyCwds } = await runFledgeTask({
      fledgeToml: "[corvidinho]\nverify_before_complete = false\nmax_retries = 0\n",
    });
    expect(verifyCwds.length).toBe(1);
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
    expect(result.verifySkipped).toBe(false);
  });
});

describe("non-git verify gate after a delegate worker that may have run a Fledge command (REQ-agent-502, AGENT-4)", () => {
  /** A worker that ran and failed its own verify, reporting no files. */
  const WORKER_FAILED: TaskResult = {
    summary: "Verification failed: app.ts: syntax error",
    filesChanged: [],
    verified: false,
    verifySkipped: false,
    cancelled: false,
    state: "failed",
    attempts: 1,
  };

  /** Worker script body after it logs its spawn: the failed result frame, exit 1. */
  const WORKER_FRAME = `cat <<'EOF'\n${serializeFrame(resultFrame(WORKER_FAILED))}\nEOF\nexit 1\n`;

  async function runDelegateTask(allowlist: string[], workerBody: string = WORKER_FRAME) {
    const fake = makeFledge();
    writeFileSync(join(fake.project, "fledge.toml"), "[corvidinho.autonomous]\nenabled = true\n");
    const worker = join(fake.bin, "corvidinho");
    writeFileSync(worker, `#!/bin/sh\necho spawned >> "$(dirname "$0")/worker.log"\n${workerBody}`);
    chmodSync(worker, 0o755);
    process.env.CORVIDINHO_BIN = worker;
    const { fetchImpl } = fakeProvider([{ name: "delegate", argv: ["--task", "run the hello plugin"] }]);
    const events: AgentEvent[] = [];
    const execute = createTaskExecute({
      taskText: "run the hello plugin through a worker",
      cwd: fake.project,
      env: fake.env,
      fetchImpl,
      tier: "code",
      nonInteractive: true,
      allowlist,
      autonomous: true,
      projectInstructions: false,
      onEvent: (e) => events.push(e),
      maxToolRounds: 3,
    });
    const verifyCwds: string[] = [];
    const result = await runTask({
      cwd: fake.project,
      maxRetries: 0,
      onEvent: (e) => events.push(e),
      verifyRunner: async (cwd) => {
        verifyCwds.push(cwd);
        return { success: false, output: "app.ts: syntax error" };
      },
      execute,
    });
    expect(existsSync(join(fake.bin, "worker.log"))).toBe(true);
    return { fake, result, events, verifyCwds };
  }

  test("allowlist names fledge-hello: the lead verifies anyway after its worker, and never ends done on the failed lane", async () => {
    const { result, events, verifyCwds } = await runDelegateTask(["fledge-hello"]);
    expect(verifyCwds.length).toBe(1);
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
    const note = events.find(
      (e) => e.type === "Text" && e.text.startsWith("Verify gate: no git working tree to diff"),
    );
    expect(note && "text" in note ? note.text : "").toContain("delegate");
  });

  test("allowlist names no fledge-* command: the worker cannot run one, so a non-git lead still skips verify", async () => {
    const { result, verifyCwds } = await runDelegateTask(["github-pr-review"]);
    expect(verifyCwds).toEqual([]);
    expect(result.state).toBe("done");
    expect(result.verifySkipped).toBe(true);
  });

  test("a worker that edits app.ts and dies before its result frame: the non-git lead verifies anyway, whatever the allowlist", async () => {
    // No result frame reaches the lead (killed, timed out, crashed), so the
    // worker's edits are reported nowhere; the delegate data has no `verified`.
    const { fake, result, events, verifyCwds } = await runDelegateTask(
      [],
      `printf broken > "$PWD/app.ts"\nexit 137\n`,
    );
    const delegated = toolResults(events).find((r) => r.name === "delegate");
    expect(delegated?.success).toBe(false);
    expect(delegated?.detail ?? "").toContain("did not finish");
    expect(readFileSync(join(fake.project, "app.ts"), "utf8")).toBe("broken");
    expect(verifyCwds).toEqual([fake.project]);
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
    expect(result.verifySkipped).toBe(false);
    const note = events.find(
      (e) => e.type === "Text" && e.text.startsWith("Verify gate: no git working tree to diff"),
    );
    expect(note && "text" in note ? note.text : "").toContain("delegate");
  });
});
