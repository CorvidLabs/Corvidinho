/**
 * AGENT-12 — an idle timeout and a turn cap that I set stop stalled or
 * endless runs, and it says so (REQ-agent-244, REQ-agent-312, REQ-cli-125,
 * REQ-discord-125, REQ-watch-125, REQ-plugins-125).
 *
 * The model is the fake LLM (tests/fixtures/fake-llm.ts): an injected fetch
 * in-process, a localhost server for the spawned CLI. Fake `fledge` and
 * `corvidinho` bins are sh scripts in temp dirs; nothing touches this
 * checkout or the network.
 */
import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
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
import { resultFrame, serializeFrame } from "../src/agent/events-ndjson.ts";
import { createTaskExecute } from "../src/agent/execute.ts";
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_MAX_TURNS,
  effectiveIdleTimeoutMs,
  formatIdleDuration,
  IDLE_STOP_GRACE_MS,
  idleTimeoutFromEnv,
  idleTimeoutLine,
  MAX_IDLE_TIMEOUT_MS,
  maxTurnsFromEnv,
  noteIdleActivity,
  startIdleWatchdog,
  stopReasonFromUnknown,
  TURN_CAP_NOTE,
  withIdleWatchdog,
} from "../src/agent/limits.ts";
import { runTask } from "../src/agent/loop.ts";
import { chatBodyFromTaskResult, formatTaskPlumbing } from "../src/agent/task-summary.ts";
import type { AgentEvent, ExecuteContext, ExecuteResult, TaskResult } from "../src/agent/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import { ApprovalStore } from "../src/approvals/store.ts";
import { buildDelegateSpawn, runDelegateChild } from "../src/autonomous/delegate.ts";
import {
  createSpawnAgentClient as createDiscordClient,
  type AgentClient,
} from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry, register } from "../src/plugins/registry.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { createSpawnAgentClient as createWatchClient } from "../src/watch/agent-client.ts";
import { buildSummaryBody } from "../src/watch/summary.ts";
import { spawnCapped } from "../plugins/fledge/spawn.ts";
import { LANE_PASS_OUTPUT, NON_GIT_CWD } from "./fixtures/lane-output.ts";
import { makeCarriedTalk } from "./fixtures/talk-worktree.ts";
import { fakeLlmFetch, startFakeLlm, useConfiguredModel } from "./fixtures/fake-llm.ts";

const root = join(import.meta.dir, "..");

// The bridge footer names the configured model (AGENT-13: no default).
useConfiguredModel();

const scratch = mkdtempSync(join(tmpdir(), "corvidinho-limits-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function pidAlive(pid: number): boolean {
  if (!(pid > 0)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(check: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await Bun.sleep(20);
  }
  return check();
}

const pidIn = (file: string) =>
  existsSync(file) ? Number(readFileSync(file, "utf8").trim()) || 0 : 0;

/** An in-process run's env: the fake model (never a real endpoint). */
const LLM_ENV = {
  CORVIDINHO_LLM_MODEL: "fake-model",
  CORVIDINHO_LLM_API_KEY: "fake-key-not-real",
  CORVIDINHO_LLM_BASE_URL: "http://fake-llm.invalid/v1",
};

/** A fake model that always calls `noop-tool`, with some prose beside it. */
function loopingFetch(counter: { calls: number }) {
  return fakeLlmFetch(() => {
    counter.calls += 1;
    return { toolCalls: [{ name: "noop-tool", args: '{"argv":[]}' }], text: `still digging (${counter.calls})` };
  });
}

describe("the settings (AGENT-12)", () => {
  test("CORVIDINHO_MAX_TURNS: a positive whole number, else today's 8 (an ignored value is reported)", () => {
    expect(maxTurnsFromEnv({})).toEqual({ value: DEFAULT_MAX_TURNS, invalid: false });
    expect(DEFAULT_MAX_TURNS).toBe(8);
    expect(maxTurnsFromEnv({ CORVIDINHO_MAX_TURNS: " 3 " })).toEqual({ value: 3, invalid: false });
    expect(maxTurnsFromEnv({ CORVIDINHO_MAX_TURNS: "" })).toEqual({ value: 8, invalid: false });
    for (const bad of ["0", "-2", "2.5", "abc", "1e3", "99999999999999999999"]) {
      expect(maxTurnsFromEnv({ CORVIDINHO_MAX_TURNS: bad })).toEqual({ value: 8, invalid: true });
    }
  });

  test("CORVIDINHO_IDLE_TIMEOUT_MS: default 10 minutes; no value turns it off; a huge one is clamped, never wrapped", () => {
    expect(DEFAULT_IDLE_TIMEOUT_MS).toBe(600_000);
    expect(idleTimeoutFromEnv({})).toEqual({ value: 600_000, invalid: false });
    expect(idleTimeoutFromEnv({ CORVIDINHO_IDLE_TIMEOUT_MS: "90000" })).toEqual({ value: 90_000, invalid: false });
    for (const bad of ["0", "off", "-1", "10m"]) {
      expect(idleTimeoutFromEnv({ CORVIDINHO_IDLE_TIMEOUT_MS: bad })).toEqual({ value: 600_000, invalid: true });
    }
    expect(idleTimeoutFromEnv({ CORVIDINHO_IDLE_TIMEOUT_MS: "9999999999999" }).value).toBe(MAX_IDLE_TIMEOUT_MS);
  });

  test("the stop line names the timeout in plain words", () => {
    expect(formatIdleDuration(600_000)).toBe("10 minutes");
    expect(formatIdleDuration(60_000)).toBe("1 minute");
    expect(formatIdleDuration(3000)).toBe("3 seconds");
    expect(formatIdleDuration(150)).toBe("150 ms");
    expect(idleTimeoutLine(600_000)).toBe("Stopped: no output for 10 minutes (idle timeout).");
    expect(stopReasonFromUnknown("turn-cap")).toBe("turn-cap");
    expect(stopReasonFromUnknown("idle-timeout")).toBe("idle-timeout");
    expect(stopReasonFromUnknown("Stopped after 8 tool rounds")).toBeUndefined();
  });

  test("a watchdog fires only after the full wait with no output; pauses nest", async () => {
    const w = startIdleWatchdog(300);
    try {
      for (let i = 0; i < 10; i++) {
        await Bun.sleep(50);
        w.touch();
      }
      expect(w.fired).toBe(false);
      const a = w.pause();
      const b = w.pause();
      await Bun.sleep(400);
      a();
      a(); // idempotent
      await Bun.sleep(400);
      expect(w.fired).toBe(false);
      b();
      await Bun.sleep(600);
      expect(w.fired).toBe(true);
      expect(w.signal.aborted).toBe(true);
    } finally {
      w.stop();
    }
  });
});

describe("the turn cap I set (AGENT-12, REQ-agent-312)", () => {
  beforeEach(() => {
    clearRegistry();
    register({
      name: "noop-tool",
      description: "always succeeds",
      dangerous: false,
      minTier: 0,
      async handler() {
        return { ok: true, message: "ok", exitCode: 0 };
      },
    });
  });
  afterEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  function execWith(env: Record<string, string>, counter: { calls: number }, events: AgentEvent[] = []) {
    return createTaskExecute({
      taskText: "keep looking",
      env: { ...LLM_ENV, ...env },
      fetchImpl: loopingFetch(counter),
      tier: "tool",
      loadPlugins: false,
      projectInstructions: false,
      nonInteractive: false,
      cwd: NON_GIT_CWD,
      onEvent: (e) => events.push(e),
    });
  }

  test("CORVIDINHO_MAX_TURNS=2: the attempt stops after 2 model/tool rounds with its best prose, marked turn-cap", async () => {
    const counter = { calls: 0 };
    const events: AgentEvent[] = [];
    const r = await execWith({ CORVIDINHO_MAX_TURNS: "2" }, counter, events)({
      attempt: 1,
      signal: new AbortController().signal,
    });
    expect(counter.calls).toBe(2);
    expect(r.stopReason).toBe("turn-cap");
    // AGENT-9: the best prose so far, never the internal stop line.
    expect(r.summary).toBe("still digging (2)");
    expect(r.summary).not.toContain("Stopped after");
    expect(events.some((e) => e.type === "Text" && e.text === "[operator] Stopped after 2 tool rounds (tools: noop-tool)")).toBe(true);
  });

  test("unset: today's cap of 8 rounds per attempt", async () => {
    const counter = { calls: 0 };
    const r = await execWith({}, counter)({ attempt: 1, signal: new AbortController().signal });
    expect(counter.calls).toBe(8);
    expect(r.stopReason).toBe("turn-cap");
  });

  test("a run whose final attempt hit the cap ends with stopReason turn-cap; the note never reaches the chat body", async () => {
    const counter = { calls: 0 };
    const exec = execWith({ CORVIDINHO_MAX_TURNS: "1" }, counter);
    const r = await runTask({ cwd: NON_GIT_CWD, execute: exec, workspaceDiff: async () => null });
    expect(r.state).toBe("done");
    expect(r.stopReason).toBe("turn-cap");
    expect(chatBodyFromTaskResult(r)).toBe("still digging (1)");
    expect(formatTaskPlumbing(r)).toBe("state=done verified=false verifySkipped attempts=1 stopped=turn-cap");
  });
});

describe("stopReason is only the final attempt's (per-attempt cap keeps AGENT-4.a retries)", () => {
  /** Scripted attempts; each changes x.txt, so the lane runs after each. */
  function scripted(attempts: Partial<ExecuteResult>[]) {
    const seen: ExecuteContext[] = [];
    const execute = async (ctx: ExecuteContext): Promise<ExecuteResult> => {
      seen.push(ctx);
      return { summary: `attempt ${ctx.attempt}`, filesChanged: ["x.txt"], ...attempts[ctx.attempt - 1] };
    };
    return { execute, seen };
  }
  function lane(results: boolean[]) {
    let i = 0;
    return async () => {
      const ok = results[i++] ?? false;
      return ok ? { success: true, output: LANE_PASS_OUTPUT } : { success: false, output: "error: test failed" };
    };
  }

  test("the first attempt hit the cap, its retry did not: verified, no stopReason", async () => {
    const { execute, seen } = scripted([{ stopReason: "turn-cap" }, {}]);
    const r = await runTask({
      cwd: NON_GIT_CWD,
      execute,
      verifyRunner: lane([false, true]),
      workspaceDiff: async () => null,
      maxRetries: 2,
    });
    expect(seen).toHaveLength(2);
    expect(seen[1]!.verifyFeedback).toContain("error: test failed");
    expect(r).toMatchObject({ state: "done", verified: true });
    expect(r.stopReason).toBeUndefined();
  });

  test("the retry (the final attempt) hit the cap: stopReason turn-cap, still verified by the lane", async () => {
    const { execute } = scripted([{}, { stopReason: "turn-cap" }]);
    const r = await runTask({
      cwd: NON_GIT_CWD,
      execute,
      verifyRunner: lane([false, true]),
      workspaceDiff: async () => null,
      maxRetries: 2,
    });
    expect(r).toMatchObject({ state: "done", verified: true, stopReason: "turn-cap", attempts: 2 });
  });

  test("a run I cancelled says cancelled, not turn-cap", async () => {
    const ctrl = new AbortController();
    const r = await runTask({
      cwd: NON_GIT_CWD,
      execute: async () => {
        ctrl.abort();
        return { summary: "x", filesChanged: ["x.txt"], stopReason: "turn-cap" };
      },
      verifyRunner: lane([true]),
      workspaceDiff: async () => null,
      signal: ctrl.signal,
    });
    expect(r.cancelled).toBe(true);
    expect(r.stopReason).toBeUndefined();
  });
});

describe("the idle timeout I set (AGENT-12, REQ-agent-244)", () => {
  test("a stalled tool: the run is stopped and ends failed, saying so (not cancelled)", async () => {
    const events: AgentEvent[] = [];
    let aborted = false;
    const r = await runTask({
      cwd: NON_GIT_CWD,
      idleTimeoutMs: 150,
      workspaceDiff: async () => null,
      onEvent: (e) => events.push(e),
      // A hung tool: nothing happens until the run's signal stops it.
      execute: (ctx) =>
        new Promise<ExecuteResult>((resolve) => {
          ctx.signal.addEventListener("abort", () => {
            aborted = true;
            resolve({ summary: "tool loop aborted during tool dispatch", filesChanged: [] });
          });
        }),
    });
    expect(aborted).toBe(true);
    expect(r).toMatchObject({
      state: "failed",
      cancelled: false,
      verified: false,
      stopReason: "idle-timeout",
      error: "Stopped: no output for 150 ms (idle timeout).",
      summary: "Stopped: no output for 150 ms (idle timeout).",
    });
    const tail = events.slice(-2);
    expect(tail[0]).toEqual({ type: "Text", text: "Stopped: no output for 150 ms (idle timeout)." });
    expect(tail[1]).toEqual({ type: "StateChanged", state: "failed" });
    expect(formatTaskPlumbing(r)).toBe("state=failed verified=false attempts=1 stopped=idle-timeout");
  }, 10_000);

  test("its best prose is kept after the stop line, and unverified changes are named", async () => {
    const r = await runTask({
      cwd: NON_GIT_CWD,
      idleTimeoutMs: 120,
      workspaceDiff: async () => null,
      execute: (ctx) =>
        new Promise<ExecuteResult>((resolve) => {
          ctx.signal.addEventListener("abort", () =>
            resolve({ summary: "Half way: fixed the parser.", filesChanged: ["a.ts"] }),
          );
        }),
    });
    expect(r.stopReason).toBe("idle-timeout");
    expect(r.summary).toBe(
      "Stopped: no output for 120 ms (idle timeout). Its changes so far were not verified.\n\nHalf way: fixed the parser.",
    );
    expect(r.filesChanged).toEqual(["a.ts"]);
  }, 10_000);

  test("output resets it: a run that keeps printing is never stopped", async () => {
    const r = await runTask({
      cwd: NON_GIT_CWD,
      idleTimeoutMs: 400,
      workspaceDiff: async () => null,
      execute: async () => {
        for (let i = 0; i < 16; i++) {
          await Bun.sleep(50);
          noteIdleActivity();
        }
        return { summary: "done talking", filesChanged: [] };
      },
    });
    expect(r).toMatchObject({ state: "done", cancelled: false });
    expect(r.stopReason).toBeUndefined();
  }, 10_000);

  test("it is held while a model call is in flight (a slow model is not a stalled run)", async () => {
    const slow = fakeLlmFetch(() => "slow but fine");
    const exec = createTaskExecute({
      taskText: "answer slowly",
      env: LLM_ENV,
      fetchImpl: async (input, init) => {
        await Bun.sleep(1500);
        return slow(input, init);
      },
      tier: "read",
      loadPlugins: false,
      projectInstructions: false,
      cwd: NON_GIT_CWD,
    });
    const r = await runTask({ cwd: NON_GIT_CWD, idleTimeoutMs: 600, execute: exec, workspaceDiff: async () => null });
    expect(r).toMatchObject({ state: "done", summary: "slow but fine" });
    expect(r.stopReason).toBeUndefined();
  }, 10_000);

  test("my own stop still wins: a cancelled run is cancelled, never an idle timeout", async () => {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 30);
    const r = await runTask({
      cwd: NON_GIT_CWD,
      idleTimeoutMs: 100,
      signal: ctrl.signal,
      workspaceDiff: async () => null,
      execute: (ctx) =>
        new Promise<ExecuteResult>((resolve) => {
          ctx.signal.addEventListener("abort", () => resolve({ summary: "", filesChanged: [] }));
        }),
    });
    expect(r.cancelled).toBe(true);
    expect(r.stopReason).toBeUndefined();
    expect(r.error).toBeUndefined();
  }, 10_000);
});

describe("a stopped run always ends (AGENT-12, REQ-agent-244)", () => {
  beforeEach(() => {
    clearRegistry();
    register({
      name: "stuck-tool",
      description: "never returns and ignores the abort (an in-process call with no timeout)",
      dangerous: false,
      minTier: 0,
      handler: () => new Promise(() => {}),
    });
  });
  afterEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  test("a tool that ignores the abort cannot hold the run: it ends failed IDLE_STOP_GRACE_MS after the timeout, saying so", async () => {
    const events: AgentEvent[] = [];
    const exec = createTaskExecute({
      taskText: "call the stuck tool",
      env: LLM_ENV,
      fetchImpl: fakeLlmFetch(() => ({ toolCalls: [{ name: "stuck-tool", args: '{"argv":[]}' }], text: "calling it" })),
      tier: "tool",
      loadPlugins: false,
      projectInstructions: false,
      nonInteractive: false,
      cwd: NON_GIT_CWD,
      onEvent: (e) => events.push(e),
    });
    const started = Date.now();
    const r = await runTask({
      cwd: NON_GIT_CWD,
      idleTimeoutMs: 200,
      execute: exec,
      workspaceDiff: async () => null,
      onEvent: (e) => events.push(e),
    });
    const took = Date.now() - started;
    expect(took).toBeGreaterThanOrEqual(200 + IDLE_STOP_GRACE_MS - 50);
    expect(took).toBeLessThan(200 + IDLE_STOP_GRACE_MS + 4000);
    expect(r).toMatchObject({
      state: "failed",
      cancelled: false,
      verified: false,
      stopReason: "idle-timeout",
      error: "Stopped: no output for 200 ms (idle timeout).",
      attempts: 1,
    });
    // It cannot know what the stuck step changed, so it never claims nothing changed.
    expect(r.summary).toBe("Stopped: no output for 200 ms (idle timeout). Any changes so far were not verified.");
    expect(events.slice(-3)).toEqual([
      {
        type: "Text",
        text: "[operator] AGENT-12: the step the run was on did not stop within 5 seconds of the idle timeout, so the run stopped waiting for it.",
      },
      { type: "Text", text: "Stopped: no output for 200 ms (idle timeout)." },
      { type: "StateChanged", state: "failed" },
    ]);
  }, 20_000);

  test("an unusable idle timeout (0, negative, NaN, Infinity) is the default, never an instant stop", async () => {
    for (const bad of [0, -5, 0.5, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
      expect(effectiveIdleTimeoutMs(bad)).toBe(DEFAULT_IDLE_TIMEOUT_MS);
    }
    expect(effectiveIdleTimeoutMs(1.7)).toBe(1);
    expect(effectiveIdleTimeoutMs(1e15)).toBe(MAX_IDLE_TIMEOUT_MS);
    for (const bad of [0, -1, Number.NaN]) {
      const r = await runTask({
        cwd: NON_GIT_CWD,
        idleTimeoutMs: bad,
        workspaceDiff: async () => null,
        execute: async () => {
          await Bun.sleep(150);
          return { summary: "quiet but fine", filesChanged: [] };
        },
      });
      expect(r).toMatchObject({ state: "done", cancelled: false, summary: "quiet but fine" });
      expect(r.stopReason).toBeUndefined();
    }
  }, 10_000);
});

describe("what holds or feeds the watchdog deep in a run", () => {
  test("tool output (spawnCapped: shell, runners, Fledge) counts as activity; a silent tool does not", async () => {
    const chatty = startIdleWatchdog(500);
    try {
      const r = await withIdleWatchdog(chatty, () =>
        spawnCapped(["sh", "-c", "i=0; while [ $i -lt 15 ]; do echo $i; sleep 0.1; i=$((i+1)); done"], {
          cwd: scratch,
          env: { PATH: process.env.PATH ?? "" },
          timeoutMs: 10_000,
          maxBytes: 4096,
        }),
      );
      expect(r.code).toBe(0);
      expect(chatty.fired).toBe(false);
    } finally {
      chatty.stop();
    }
    const quiet = startIdleWatchdog(500);
    try {
      await withIdleWatchdog(quiet, () =>
        spawnCapped(["sh", "-c", "sleep 1.2"], {
          cwd: scratch,
          env: { PATH: process.env.PATH ?? "" },
          timeoutMs: 10_000,
          maxBytes: 4096,
        }),
      );
      expect(quiet.fired).toBe(true);
    } finally {
      quiet.stop();
    }
  }, 15_000);

  test("waiting on an Approve card holds it; the card's own expiry bounds the wait", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const store = new ApprovalStore({ db });
    const req = store.request({ kind: "test", title: "t", action: "a", target: "t", amount: "1", ttlMs: 60_000 });
    const w = startIdleWatchdog(250);
    try {
      setTimeout(() => store.decide(req.id, "approved", { by: "owner" }), 900);
      const decided = await withIdleWatchdog(w, () => store.waitForDecision(req.id, { pollMs: 20 }));
      expect(decided?.status).toBe("approved");
      expect(w.fired).toBe(false);
      // Once the card is answered the wait starts again.
      await Bun.sleep(600);
      expect(w.fired).toBe(true);
    } finally {
      w.stop();
      db.close();
    }
  }, 10_000);

  test("a delegate or council worker holds the lead's watchdog, and inherits both limits", async () => {
    const dir = mkdtempSync(join(scratch, "worker-"));
    const bin = join(dir, "corvidinho");
    const done: TaskResult = {
      summary: "worker done",
      filesChanged: [],
      verified: false,
      verifySkipped: true,
      cancelled: false,
      state: "done",
      attempts: 1,
    };
    writeFileSync(
      bin,
      `#!/bin/sh\nprintf '%s|%s\\n' "$CORVIDINHO_MAX_TURNS" "$CORVIDINHO_IDLE_TIMEOUT_MS" > '${dir}/limits.txt'\nsleep 1.2\ncat <<'EOF'\n${serializeFrame(resultFrame(done))}\nEOF\n`,
      { mode: 0o755 },
    );
    const baseEnv = { PATH: process.env.PATH ?? "", CORVIDINHO_MAX_TURNS: "3", CORVIDINHO_IDLE_TIMEOUT_MS: "45000" };
    const spawn = buildDelegateSpawn({ bin, taskText: "t", tier: "tool", childDepth: 1, allowlist: [], baseEnv });
    expect(spawn.env.CORVIDINHO_MAX_TURNS).toBe("3");
    expect(spawn.env.CORVIDINHO_IDLE_TIMEOUT_MS).toBe("45000");
    const w = startIdleWatchdog(400);
    try {
      const out = await withIdleWatchdog(w, () =>
        runDelegateChild({ bin, cwd: dir, taskText: "t", tier: "tool", childDepth: 1, allowlist: [], baseEnv }),
      );
      expect(out.state).toBe("done");
      expect(w.fired).toBe(false);
      expect(readFileSync(join(dir, "limits.txt"), "utf8").trim()).toBe("3|45000");
    } finally {
      w.stop();
    }
  }, 15_000);
});

describe("a delegate worker a limit stopped says so to its lead (AGENT-12)", () => {
  test("the worker's validated stopReason comes back in its outcome", async () => {
    const dir = mkdtempSync(join(scratch, "worker-capped-"));
    const run = async (stopReason: unknown) => {
      const bin = join(dir, `corvidinho-${String(stopReason).replace(/[^a-z-]/gi, "_")}`);
      const frame: Record<string, unknown> = {
        summary: "best so far",
        filesChanged: [],
        verified: false,
        verifySkipped: true,
        cancelled: false,
        state: "done",
        attempts: 1,
        stopReason,
      };
      writeFileSync(bin, `#!/bin/sh\ncat <<'EOF'\n${serializeFrame(resultFrame(frame as TaskResult))}\nEOF\n`, {
        mode: 0o755,
      });
      return runDelegateChild({
        bin,
        cwd: dir,
        taskText: "t",
        tier: "tool",
        childDepth: 1,
        allowlist: [],
        baseEnv: { PATH: process.env.PATH ?? "" },
      });
    };
    const capped = await run("turn-cap");
    expect(capped).toMatchObject({ state: "done", stopReason: "turn-cap" });
    expect((await run("Stopped after 8 tool rounds")).stopReason).toBeUndefined();
  }, 15_000);
});

describe("a schedule run that hit the turn cap (AGENT-12, REQ-agent-312)", () => {
  test("its post is only its best prose; the scheduler log says it stopped at the turn cap", async () => {
    const warns: string[] = [];
    const spy = spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
      warns.push(a.map(String).join(" "));
    });
    const db = openCorvidinhoDb({ memory: true });
    try {
      const OWNER_ID = "111122223333444455";
      const clock = { now: Date.parse("2026-10-01T10:30:00Z") };
      const store = new ScheduleStore({ db });
      const make = (name: string) =>
        store.create({
          name,
          cronExpression: "0 * * * *",
          project: "proj-a",
          prompt: "dig",
          createdByUserId: OWNER_ID,
          channelId: "chan-1",
          now: clock.now,
        });
      const capped = make("Capped");
      const plain = make("Plain");
      const cfg = emptyConfig();
      cfg.discord.channels = ["chan-1"];
      const posts: Array<{ channelId: string; content: string }> = [];
      const svc = new SchedulerService({
        store,
        agent: {
          async runChat({ sessionId }) {
            const isCapped = sessionId.endsWith(capped.id);
            return {
              ok: true,
              sessionId,
              summary: "Here is what I found so far.",
              exitCode: 0,
              task: {
                state: "done",
                verified: false,
                verifySkipped: true,
                attempts: 1,
                ...(isCapped ? { stopReason: "turn-cap" as const } : {}),
              },
            };
          },
        },
        allowlist: cfg,
        manual: true,
        useWorktrees: false,
        owner: { discordId: OWNER_ID, display: "Leif" },
        now: () => clock.now,
        outbound: { post: async (p) => void posts.push(p) },
      });
      clock.now += 3_600_000;
      expect((await svc.tick()).started.sort()).toEqual([capped.id, plain.id].sort());
      for (let i = 0; i < 200 && svc.runningIds().length > 0; i++) await Bun.sleep(5);
      expect(posts).toHaveLength(2);
      for (const p of posts) {
        expect(p.content).toEndWith(":\nHere is what I found so far.");
        expect(p.content).not.toContain("turn");
        expect(p.content).not.toContain("stopped=");
      }
      const limitLines = warns.filter((l) => l.includes("stopped=turn-cap"));
      expect(limitLines).toEqual([
        `[scheduler] schedule ${capped.id}: run stopped=turn-cap (CORVIDINHO_MAX_TURNS); its post is its best answer so far (AGENT-12)`,
      ]);
    } finally {
      spy.mockRestore();
      db.close();
    }
  }, 15_000);
});

describe("it says so on each surface", () => {
  const capped: TaskResult = {
    summary: "Here is what I found so far.",
    filesChanged: [],
    verified: false,
    verifySkipped: true,
    cancelled: false,
    state: "done",
    attempts: 1,
    stopReason: "turn-cap",
  };

  test("plumbing: `stopped=…` only for the two stop reasons", () => {
    expect(formatTaskPlumbing({ state: "done", attempts: 1, stopReason: "turn-cap" })).toBe(
      "state=done attempts=1 stopped=turn-cap",
    );
    expect(formatTaskPlumbing({ state: "done", attempts: 1, stopReason: "Stopped after 8 tool rounds" })).toBe(
      "state=done attempts=1",
    );
  });

  /** A fake `corvidinho` that prints one result frame and exits `code`. */
  function resultBin(result: Record<string, unknown>, code = 0): string {
    const dir = mkdtempSync(join(scratch, "bin-"));
    const bin = join(dir, "corvidinho");
    writeFileSync(
      bin,
      `#!/bin/sh\ncat <<'EOF'\n${serializeFrame(resultFrame(result as TaskResult))}\nEOF\nexit ${code}\n`,
      { mode: 0o755 },
    );
    return bin;
  }

  test("Discord spawn client: the result's stopReason reaches the footer facts (validated)", async () => {
    const ok = await createDiscordClient({ bin: resultBin({ ...capped }), cwd: scratch }).runChat({
      prompt: "hi",
      sessionId: "s1",
    });
    expect(ok.task?.stopReason).toBe("turn-cap");
    expect(ok.summary).toBe("Here is what I found so far.");
    const bogus = await createDiscordClient({
      bin: resultBin({ ...capped, stopReason: "Stopped after 8 tool rounds" }),
      cwd: scratch,
    }).runChat({ prompt: "hi", sessionId: "s2" });
    expect(bogus.task).toBeDefined();
    expect(bogus.task?.stopReason).toBeUndefined();
  }, 15_000);

  /** A bridge on a stub agent; `owner` is the configured owner's Discord id. */
  async function bridgeWith(agent: AgentClient, owner?: string) {
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    const outbound = memoryThinkingOutbound();
    const bridge = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: "chan-1",
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: join(scratch, "no-allowlist.toml"),
        ...(owner ? { CORVIDINHO_OWNER_DISCORD_ID: owner } : {}),
      },
      db: openCorvidinhoDb({ memory: true }),
      projectRoot: mkdtempSync(join(scratch, "proj-")),
      skipProtocolCheck: true,
      disableScheduler: true,
      thinkingOutbound: outbound,
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent,
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        handlers.reply = async () => ({ messageId: "bot_1" });
        handlers.sendDm = async () => null;
        return createNullGateway();
      },
    });
    if (bridge.ok !== true || !box.handlers) throw new Error("bridge failed");
    return { bridge, handlers: box.handlers, outbound };
  }

  const mention = (authorId: string) => ({
    id: "m1",
    channelId: "chan-1",
    authorId,
    authorBot: false,
    content: "@bot dig",
    mentionedBot: true,
  });

  const footerOf = (edit: { embed?: unknown } | undefined) =>
    String((edit?.embed as { footer?: { text?: string } } | undefined)?.footer?.text ?? "");

  test("Discord chat: `stopped=turn-cap` rides the footer plumbing; the channel body is only the best prose (AGENT-9)", async () => {
    const { bridge, handlers, outbound } = await bridgeWith({
      async runChat({ sessionId }) {
        return {
          ok: true,
          sessionId,
          summary: "Here is what I found so far.",
          exitCode: 0,
          task: { state: "done", verified: false, verifySkipped: true, attempts: 1, stopReason: "turn-cap" },
        };
      },
    });
    try {
      await handlers.onMessage(mention("u1"));
      const answer = outbound.contentEdits.find((e) => e.content === "Here is what I found so far.");
      expect(answer).toBeDefined();
      expect(footerOf(answer)).toContain("state=done verified=false verifySkipped attempts=1 stopped=turn-cap");
      expect(String(answer!.content)).not.toContain("turn");
      expect(String(answer!.content)).not.toContain("stopped=");
    } finally {
      await bridge.stop();
    }
  }, 15_000);

  test("Discord: an idle-timed-out run gives the owner its one plain line (DISCORD-3.b) and `stopped=idle-timeout` in the footer", async () => {
    const line = idleTimeoutLine(600_000);
    // The spawn client reads the frame's `error` and `stopReason`.
    const spawned = await createDiscordClient({
      bin: resultBin({
        summary: `${line}\n\nHalf way there.`,
        filesChanged: [],
        verified: false,
        verifySkipped: false,
        cancelled: false,
        state: "failed",
        attempts: 1,
        stopReason: "idle-timeout",
        error: line,
      }, 1),
      cwd: scratch,
    }).runChat({ prompt: "hi", sessionId: "s3" });
    expect(spawned.ok).toBe(false);
    expect(spawned.failureReason).toBe(line);
    expect(spawned.task?.stopReason).toBe("idle-timeout");

    const OWNER = "111122223333444455";
    const { bridge, handlers, outbound } = await bridgeWith(
      { runChat: async ({ sessionId }) => ({ ...spawned, sessionId }) },
      OWNER,
    );
    try {
      await handlers.onMessage(mention(OWNER));
      const edit = outbound.contentEdits.at(-1);
      expect(edit?.content).toBe(line);
      expect(footerOf(edit)).toContain("state=failed verified=false attempts=1 stopped=idle-timeout");
    } finally {
      await bridge.stop();
    }
  }, 15_000);

  test("WATCH: the comment says it stopped at the turn cap in a plain line; an idle timeout's summary already leads with its line", async () => {
    const watch = await createWatchClient({ bin: resultBin({ ...capped }), cwd: scratch }).runChat({
      prompt: "hi",
      sessionId: "w1",
    });
    expect(watch.stopReason).toBe("turn-cap");
    const body = buildSummaryBody(watch);
    expect(body).toContain(`Here is what I found so far.\n\n${TURN_CAP_NOTE}`);
    expect(body).not.toContain("stopped=");

    const idleLine = idleTimeoutLine(600_000);
    const idle = buildSummaryBody({
      ok: false,
      sessionId: "w2",
      exitCode: 1,
      summary: `${idleLine}\n\nPartial notes.`,
      stopReason: "idle-timeout",
    });
    expect(idle).toContain(`Failed (exit 1).\n\n${idleLine}\n\nPartial notes.`);
    expect(idle).not.toContain(TURN_CAP_NOTE);
    expect(buildSummaryBody({ ok: true, sessionId: "w3", exitCode: 0, summary: "plain" })).not.toContain(TURN_CAP_NOTE);
  }, 15_000);
});

describe("corvidinho task run (CLI, AGENT-12)", () => {
  /** A fake model that always calls files-list beside some prose. */
  const looping = startFakeLlm({
    reply: () => ({ toolCalls: [{ name: "files-list", args: '{"argv":["."]}' }], text: "still listing" }),
  });
  const plain = startFakeLlm();
  afterAll(() => {
    looping.stop();
    plain.stop();
  });

  function cliEnv(extra: Record<string, string>, llm = looping) {
    return {
      ...process.env,
      CORVIDINHO_LLM_API_KEY: "",
      OPENAI_API_KEY: "",
      CORVIDINHO_DELEGATE_DEPTH: "",
      CORVIDINHO_MAX_TURNS: "",
      CORVIDINHO_IDLE_TIMEOUT_MS: "",
      ...llm.env,
      ...extra,
    };
  }

  async function cli(cwd: string, args: string[], env: Record<string, string | undefined>) {
    const proc = Bun.spawn(["bun", join(root, "src/cli.ts"), ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
    const [code, out, err] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    return { code, out, err };
  }

  function lastResult(out: string): Record<string, unknown> | undefined {
    const frames = out
      .split("\n")
      .filter((l) => l.trim().startsWith("{"))
      .map((l) => JSON.parse(l) as { type: string; result?: Record<string, unknown> });
    const last = frames.at(-1);
    return last?.type === "result" ? last.result : undefined;
  }

  test("CORVIDINHO_MAX_TURNS=2: two model calls, the best prose and a plain turn-cap line; the result frame says turn-cap", async () => {
    const work = mkdtempSync(join(scratch, "cli-turns-"));
    const before = looping.requests.length;
    const text = await cli(work, ["task", "run", "--here", "--task", "list things"], cliEnv({ CORVIDINHO_MAX_TURNS: "2" }));
    expect(looping.requests.length - before).toBe(2);
    expect(text.code).toBe(0);
    expect(text.out).toContain(`still listing\n${TURN_CAP_NOTE}\n`);
    expect(text.err).toContain("[operator] Stopped after 2 tool rounds");

    const nd = await cli(
      work,
      ["task", "run", "--here", "--task", "list things", "--output", "ndjson"],
      cliEnv({ CORVIDINHO_MAX_TURNS: "2" }),
    );
    expect(lastResult(nd.out)).toMatchObject({ state: "done", stopReason: "turn-cap", summary: "still listing" });
  }, 60_000);

  test("a value that is not a positive whole number is ignored, and said", async () => {
    const work = mkdtempSync(join(scratch, "cli-bad-"));
    const r = await cli(
      work,
      ["task", "run", "--here", "--task", "hello"],
      cliEnv({ CORVIDINHO_MAX_TURNS: "lots", CORVIDINHO_IDLE_TIMEOUT_MS: "off" }, plain),
    );
    expect(r.code).toBe(0);
    expect(r.err).toContain(
      "[operator] AGENT-12: CORVIDINHO_MAX_TURNS is not a positive whole number, so the default 8 is used.",
    );
    expect(r.err).toContain(
      "[operator] AGENT-12: CORVIDINHO_IDLE_TIMEOUT_MS is not a positive whole number, so the default 600000 is used.",
    );
    expect(r.err).not.toContain("lots");
  }, 60_000);

  test("CORVIDINHO_IDLE_TIMEOUT_MS: a verify lane that hangs silently is killed and the run fails saying so (exit 1)", async () => {
    const dir = mkdtempSync(join(scratch, "cli-idle-"));
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const { work } = await makeCarriedTalk(dir);
    writeFileSync(
      join(bin, "fledge"),
      `#!/bin/sh\nsleep 30 &\necho $! > '${dir}/task.pid'\necho $$ > '${dir}/fledge.pid'\nwait\n`,
    );
    chmodSync(join(bin, "fledge"), 0o755);
    let fledgePid = 0;
    let taskPid = 0;
    try {
      const r = await cli(
        work,
        ["task", "run", "--here", "--task", "demo", "--output", "ndjson"],
        cliEnv({ PATH: `${bin}:${process.env.PATH ?? ""}`, CORVIDINHO_IDLE_TIMEOUT_MS: "4000" }, plain),
      );
      fledgePid = pidIn(join(dir, "fledge.pid"));
      taskPid = pidIn(join(dir, "task.pid"));
      expect(fledgePid).toBeGreaterThan(0);
      expect(r.code).toBe(1);
      const result = lastResult(r.out);
      expect(result).toMatchObject({
        state: "failed",
        cancelled: false,
        verified: false,
        stopReason: "idle-timeout",
        error: "Stopped: no output for 4 seconds (idle timeout).",
      });
      expect(String(result?.summary)).toStartWith("Stopped: no output for 4 seconds (idle timeout).");
      expect(await waitFor(() => !pidAlive(fledgePid), 2000)).toBe(true);
      expect(await waitFor(() => !pidAlive(taskPid), 2000)).toBe(true);
    } finally {
      for (const pid of [fledgePid, taskPid]) if (pidAlive(pid)) process.kill(pid, "SIGKILL");
    }
  }, 60_000);

  test("a verify lane that keeps printing runs past the timeout and is verified", async () => {
    const dir = mkdtempSync(join(scratch, "cli-chatty-"));
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const { work } = await makeCarriedTalk(dir);
    const pass = LANE_PASS_OUTPUT.replace(/'/g, "");
    writeFileSync(
      join(bin, "fledge"),
      `#!/bin/sh\ni=0\nwhile [ $i -lt 12 ]; do echo "step $i"; sleep 0.5; i=$((i+1)); done\nprintf '%s' '${pass}'\nexit 0\n`,
    );
    chmodSync(join(bin, "fledge"), 0o755);
    const r = await cli(
      work,
      ["task", "run", "--here", "--task", "demo", "--output", "ndjson"],
      cliEnv({ PATH: `${bin}:${process.env.PATH ?? ""}`, CORVIDINHO_IDLE_TIMEOUT_MS: "3000" }, plain),
    );
    expect(r.code).toBe(0);
    const result = lastResult(r.out);
    expect(result).toMatchObject({ state: "done", verified: true });
    expect(result?.stopReason).toBeUndefined();
  }, 60_000);

  test("--help and .env.example document both settings", async () => {
    const help = await cli(root, ["--help"], { ...process.env });
    expect(help.out).toContain("CORVIDINHO_MAX_TURNS");
    expect(help.out).toContain("CORVIDINHO_IDLE_TIMEOUT_MS");
    const example = readFileSync(join(root, ".env.example"), "utf8");
    expect(example).toContain("# CORVIDINHO_MAX_TURNS=8");
    expect(example).toContain("# CORVIDINHO_IDLE_TIMEOUT_MS=600000");
  }, 30_000);
});
