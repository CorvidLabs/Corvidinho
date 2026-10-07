/**
 * AGENT-11 (issue #80): "If a model fails or is retired, it falls back to my
 * next configured model and tells me." The configured list of a tier is a
 * chain (`callChain`, src/agent/providers.ts): an HTTP error (404 / 410 for a
 * retired model included), a network error, a timeout or a malformed reply
 * hands the run to the next entry at once — no retry, no backoff — and the
 * process keeps it; a new process tries the head again. A spend-cap stop, a
 * Deny, a lapsed card or the run's own stop is not a model failure and never
 * fails over. It tells: a `[operator] <a> failed (<reason>); falling back to
 * <b>` Text event, a closing note in the summary that clips keep, the model
 * and usage per model on the NDJSON usage / result frames plus
 * `modelFallback[]`, delegate / council workers' failovers carried to the
 * lead, the Discord footer naming the model that answered and pricing each
 * model (tokens and cost owner-only), and an `llm.fallback` warn line in the
 * bridge, daemon and WATCH logs.
 *
 * Only `src/agent/providers.ts` gains exports this file imports; every other
 * import exists on the base, so the behaviour tests run (and fail on their
 * assertions) against the base sources. Mock providers only: an injected
 * fetch, a localhost fake server, fake `corvidinho` bins; no network, no key.
 */
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskExecute, type CreateTaskExecuteOpts } from "../src/agent/execute.ts";
import {
  parseNdjsonLine,
  resultFrame,
  serializeFrame,
  usageFrame,
  type NdjsonFrame,
} from "../src/agent/events-ndjson.ts";
import { runTask } from "../src/agent/loop.ts";
import {
  answeredModelLabel,
  callChain,
  formatModelFallbackLog,
  mergeModelFallbacks,
  modelChain,
  modelFallbackEventText,
  modelFallbackFromUnknown,
  modelFallbackNote,
  modelUsageFromUnknown,
  withModelFallbackNote,
  type ChainCall,
} from "../src/agent/providers.ts";
import { costMicroUsd, formatUsd, priceForModel } from "../src/agent/spend.ts";
import { SPEND_CAP_SUMMARY } from "../src/agent/spend-notice.ts";
import { chatBodyFromTaskResult } from "../src/agent/task-summary.ts";
import type {
  AgentEvent,
  AgentTokenUsage,
  ExecuteResult,
  ModelFallback,
  ModelUsage,
  TaskResult,
} from "../src/agent/types.ts";
import { runCouncil } from "../src/autonomous/council.ts";
import { runDelegateChild, type DelegateChildOutcome } from "../src/autonomous/delegate.ts";
import { createCouncilCommand } from "../plugins/autonomous/index.ts";
import { createDaemonLogger, startDaemon } from "../src/daemon/index.ts";
import {
  createSpawnAgentClient as createDiscordClient,
  type AgentClient,
} from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { answerSpendFor, splitDiscordMessage } from "../src/discord/rich-reply.ts";
import type { DiscordEmbedPayload } from "../src/discord/thinking-status.ts";
import { get, register, unregister } from "../src/plugins/registry.ts";
import type { PluginCommand } from "../src/plugins/types.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { createSpawnAgentClient as createWatchClient } from "../src/watch/agent-client.ts";
import { answerMustAsk } from "./fixtures/must-ask.ts";

const ROOT = join(import.meta.dir, "..");
const CLI = join(ROOT, "src", "cli.ts");

const dirs: string[] = [];
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0).reverse()) c();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(prefix = "corvidinho-fallback-"): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

// ─── a scripted provider, answering per model ──────────────────────────────

type ToolCallSpec = { name: string; args?: string };
type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number };

function reply(content: string | ToolCallSpec[], usage?: Usage): Response {
  const message =
    typeof content === "string"
      ? { role: "assistant", content }
      : {
          role: "assistant",
          content: null,
          tool_calls: content.map((c, i) => ({
            id: `call_${i}`,
            type: "function",
            function: { name: c.name, arguments: c.args ?? "{}" },
          })),
        };
  return new Response(JSON.stringify({ choices: [{ message }], ...(usage ? { usage } : {}) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

type Behavior = (signal: AbortSignal | undefined) => Response | Promise<Response>;

/**
 * An injected fetch that answers each request by its `body.model`: the n-th
 * request to a model plays that model's n-th behavior (the last repeats).
 */
function perModel(behaviors: Record<string, Behavior[]>) {
  const models: string[] = [];
  const counts = new Map<string, number>();
  const fetchImpl = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string };
    models.push(body.model);
    const list = behaviors[body.model];
    if (!list) return new Response(`no such model ${body.model}`, { status: 404 });
    const n = counts.get(body.model) ?? 0;
    counts.set(body.model, n + 1);
    return list[Math.min(n, list.length - 1)]!(init?.signal ?? undefined);
  };
  return { fetchImpl, models };
}

const ok = (text: string, usage?: Usage): Behavior => () => reply(text, usage);
const tools = (calls: ToolCallSpec[], usage?: Usage): Behavior => () => reply(calls, usage);
const http = (status: number, body = "model gone"): Behavior => () => new Response(body, { status });

const FAILURES: Array<[string, Behavior, string, { llmTimeoutMs?: number }?]> = [
  ["HTTP 404 (a retired model)", http(404, "The model `model-a` does not exist"), "HTTP 404"],
  ["HTTP 410 (a model that is gone)", http(410), "HTTP 410"],
  ["HTTP 500", http(500, "upstream error"), "HTTP 500"],
  [
    "a network error",
    () => {
      throw new TypeError("fetch failed: connect ECONNREFUSED");
    },
    "network error",
  ],
  [
    "a timeout",
    (signal) =>
      new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
          once: true,
        });
      }),
    "timed out",
    { llmTimeoutMs: 40 },
  ],
  ["a reply that is not JSON", () => new Response("<html>bad gateway</html>", { status: 200 }), "malformed reply"],
  [
    "a reply with no assistant message",
    () => new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    "malformed reply",
  ],
];

const ENV: Record<string, string> = {
  CORVIDINHO_LLM_MODEL: "model-a, model-b",
  CORVIDINHO_LLM_API_KEY: "fake-key-not-real",
  CORVIDINHO_LLM_BASE_URL: "http://fake-llm.invalid/v1",
};

type Harness = {
  exec: ReturnType<typeof createTaskExecute>;
  events: AgentEvent[];
  hops: ModelFallback[];
  answered: string[];
  usage: Array<{ totals: AgentTokenUsage; detail: unknown }>;
};

function harness(
  fetchImpl: CreateTaskExecuteOpts["fetchImpl"],
  over: Partial<CreateTaskExecuteOpts> & { env?: Record<string, string> } = {},
): Harness {
  const events: AgentEvent[] = [];
  const hops: ModelFallback[] = [];
  const answered: string[] = [];
  const usage: Harness["usage"] = [];
  const { env, ...rest } = over;
  const exec = createTaskExecute({
    taskText: "say hi",
    fetchImpl,
    tier: "tool",
    loadPlugins: false,
    cwd: tmp(),
    projectInstructions: false,
    maxToolRounds: 4,
    onEvent: (e) => events.push(e),
    onModelFallback: (h) => hops.push(h),
    onModel: (m) => answered.push(m),
    onUsage: (totals, detail) => usage.push({ totals, detail }),
    ...rest,
    env: { ...ENV, ...env },
  });
  return { exec, events, hops, answered, usage };
}

const texts = (events: AgentEvent[]): string[] =>
  events.flatMap((e) => (e.type === "Text" ? [e.text] : []));

const attempt = (exec: Harness["exec"], n = 1, signal = new AbortController().signal): Promise<ExecuteResult> =>
  exec({ attempt: n, signal });

/** A read-only test tool that always succeeds (for multi-round loops). */
function registerTool(name = "fallback-probe", data?: unknown): void {
  const cmd: PluginCommand = {
    name,
    description: "AGENT-11 test tool",
    minTier: 0,
    async handler() {
      return { ok: true, message: "probed", exitCode: 0, ...(data !== undefined ? { data } : {}) };
    },
  };
  const real = get(name);
  if (real) unregister(name, real);
  register(cmd);
  cleanups.push(() => {
    unregister(name, cmd);
    if (real) register(real);
  });
}

// ─── the chain itself ──────────────────────────────────────────────────────

describe("callChain: a failed model hands the run to the next one at once (REQ-agent-080)", () => {
  test("the head fails once, the next answers; the chain keeps it; no retry of the head", async () => {
    const chain = modelChain({ ...ENV, CORVIDINHO_LLM_MODEL: "model-a, anthropic:model-b, ollama:model-c" , ANTHROPIC_API_KEY: "k" }, "tool");
    const calls: string[] = [];
    const hops: ModelFallback[] = [];
    const call = async (p: { entry: { model: string } }): Promise<ChainCall<string>> => {
      calls.push(p.entry.model);
      return p.entry.model === "model-a"
        ? { ok: false, error: "LLM HTTP 404: gone", failure: { kind: "http", status: 404 } }
        : { ok: true, value: `from ${p.entry.model}` };
    };
    const first = await callChain(chain, call, (h) => hops.push(h));
    expect(first).toMatchObject({ ok: true, value: "from model-b" });
    expect(first.provider?.entry).toEqual({ kind: "anthropic", model: "model-b" });
    const second = await callChain(chain, call, (h) => hops.push(h));
    expect(second).toMatchObject({ ok: true, value: "from model-b" });
    expect(calls).toEqual(["model-a", "model-b", "model-b"]);
    expect(hops).toEqual([{ from: "model-a", to: "anthropic:model-b", reason: "HTTP 404" }]);
    expect(chain.fallbacks).toEqual(hops);
  });

  test("a failure that is not a model's never fails over; the last entry's failure comes back as it is", async () => {
    const chain = modelChain(ENV, "tool");
    const stop = await callChain<string>(chain, async () => ({ ok: false, error: "paused for budget", failure: null }));
    expect(stop).toMatchObject({ ok: false, error: "paused for budget", failure: null });
    expect(chain.index).toBe(0);
    expect(chain.fallbacks).toEqual([]);
    const all = await callChain<string>(chain, async (p) => ({
      ok: false,
      error: `down ${p.entry.model}`,
      failure: { kind: "network" },
    }));
    expect(all).toMatchObject({ ok: false, error: "down model-b", failure: { kind: "network" } });
    expect(chain.fallbacks).toEqual([{ from: "model-a", to: "model-b", reason: "network error" }]);
  });

  test("a next entry whose key is not set is skipped, never called, and says which key", async () => {
    const chain = modelChain({ ...ENV, CORVIDINHO_LLM_MODEL: "model-a, anthropic:claude-x, ollama:local" }, "tool");
    const calls: string[] = [];
    const r = await callChain<string>(chain, async (p) => {
      calls.push(p.entry.model);
      return p.entry.model === "model-a"
        ? { ok: false, error: "x", failure: { kind: "http", status: 410 } }
        : { ok: true, value: p.entry.model };
    });
    expect(r).toMatchObject({ ok: true, value: "local" });
    expect(calls).toEqual(["model-a", "local"]);
    expect(chain.fallbacks).toEqual([
      { from: "model-a", to: "anthropic:claude-x", reason: "HTTP 410" },
      { from: "anthropic:claude-x", to: "ollama:local", reason: "ANTHROPIC_API_KEY is not set" },
    ]);
  });

  test("the operator line, the closing note, the log line and the footer label", () => {
    const hops: ModelFallback[] = [
      { from: "gpt-5", to: "anthropic:claude-sonnet-5", reason: "HTTP 404" },
      { from: "w-a", to: "w-b", reason: "timed out", via: "delegate" },
    ];
    expect(modelFallbackEventText(hops[0]!)).toBe(
      "[operator] gpt-5 failed (HTTP 404); falling back to anthropic:claude-sonnet-5",
    );
    expect(modelFallbackEventText(hops[1]!)).toBe(
      "[operator] delegate worker: w-a failed (timed out); falling back to w-b",
    );
    const note = modelFallbackNote(hops);
    expect(note).toBe(
      "(model fallback: gpt-5 failed (HTTP 404), fell back to anthropic:claude-sonnet-5; delegate worker: w-a failed (timed out), fell back to w-b)",
    );
    expect(withModelFallbackNote("Done.", hops)).toBe(`Done.\n\n${note}`);
    expect(withModelFallbackNote(`Done.\n\n${note}`, hops)).toBe(`Done.\n\n${note}`);
    expect(withModelFallbackNote("", hops)).toBe(note);
    expect(withModelFallbackNote("Done.", [])).toBe("Done.");
    expect(formatModelFallbackLog(hops)).toBe(
      "llm.fallback: gpt-5 failed (HTTP 404), fell back to anthropic:claude-sonnet-5; delegate worker: w-a failed (timed out), fell back to w-b",
    );
    // The footer names the model that answered and what it fell back from
    // (its own chain only; a worker's failover is not the answering model's).
    expect(answeredModelLabel("anthropic:claude-sonnet-5", hops)).toBe(
      "anthropic:claude-sonnet-5 (fell back from gpt-5)",
    );
    expect(
      answeredModelLabel("c", [
        { from: "a", to: "b", reason: "HTTP 404" },
        { from: "b", to: "c", reason: "HTTP 500" },
      ]),
    ).toBe("c (fell back from a, b)");
    expect(answeredModelLabel("a", undefined)).toBe("a");
  });

  test("failovers and usage read back from a child are validated, scrubbed and bounded", () => {
    const token = `ghp_${"a".repeat(36)}`;
    const hops = modelFallbackFromUnknown([
      { from: "a", to: "b", reason: "HTTP 404" },
      { from: `leak ${token}`, to: "c\nd", reason: "x", via: "council" },
      { from: "x", to: 3, reason: "y" },
      "junk",
      { from: "p", to: "q", reason: "r", via: "root" },
    ]);
    expect(hops).toEqual([
      { from: "a", to: "b", reason: "HTTP 404" },
      { from: "leak [redacted:github-token]", to: "c d", reason: "x", via: "council" },
      { from: "p", to: "q", reason: "r" },
    ]);
    expect(modelFallbackFromUnknown("nope")).toBeUndefined();
    expect(modelFallbackFromUnknown([])).toBeUndefined();
    expect(modelFallbackFromUnknown(Array.from({ length: 40 }, (_, i) => ({ from: `m${i}`, to: "n", reason: "r" })))).toHaveLength(16);
    expect(
      modelUsageFromUnknown([
        { model: "a", promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        { model: "b", promptTokens: -1, completionTokens: 2, totalTokens: 3 },
      ]),
    ).toEqual([{ model: "a", promptTokens: 1, completionTokens: 2, totalTokens: 3 }]);
    const once = { from: "a", to: "b", reason: "HTTP 404" };
    expect(mergeModelFallbacks([once], [{ ...once }, { ...once, via: "delegate" }])).toEqual([
      once,
      { ...once, via: "delegate" },
    ]);
  });
});

// ─── the run fails over and tells ──────────────────────────────────────────

describe("a run fails over to the next configured model and tells (REQ-agent-080)", () => {
  for (const [name, fail, reason, over] of FAILURES) {
    test(`${name}: the next model answers, with the operator line and the closing note`, async () => {
      const f = perModel({ "model-a": [fail], "model-b": [ok("hello from b")] });
      const h = harness(f.fetchImpl, over);
      const r = await attempt(h.exec);
      expect(f.models).toEqual(["model-a", "model-b"]);
      expect(r.error).toBeUndefined();
      expect(r.summary).toBe(`hello from b\n\n(model fallback: model-a failed (${reason}), fell back to model-b)`);
      expect(texts(h.events)).toContain(`[operator] model-a failed (${reason}); falling back to model-b`);
      expect(h.hops).toEqual([{ from: "model-a", to: "model-b", reason }]);
      expect(h.answered).toEqual(["model-b"]);
    });
  }

  test("the process keeps the fallback for later rounds and attempts; a new process tries the head again", async () => {
    registerTool();
    const f = perModel({
      "model-a": [http(404)],
      "model-b": [tools([{ name: "fallback-probe" }]), ok("round two from b"), ok("attempt two from b")],
    });
    const h = harness(f.fetchImpl);
    const one = await attempt(h.exec, 1);
    expect(one.summary.startsWith("round two from b\n\n(model fallback: model-a failed (HTTP 404)")).toBe(true);
    const two = await attempt(h.exec, 2);
    expect(two.summary).toBe("attempt two from b\n\n(model fallback: model-a failed (HTTP 404), fell back to model-b)");
    // The head was tried once; no retry, no backoff.
    expect(f.models).toEqual(["model-a", "model-b", "model-b", "model-b"]);
    expect(h.hops).toHaveLength(1);
    expect(texts(h.events).filter((t) => t.includes("falling back to"))).toHaveLength(1);

    // Nothing is remembered across processes: a fresh run tries the head once more.
    const again = perModel({ "model-a": [http(404)], "model-b": [ok("fresh b")] });
    const fresh = harness(again.fetchImpl);
    await attempt(fresh.exec);
    expect(again.models).toEqual(["model-a", "model-b"]);
  });

  test("the read tier's single chat fails over too", async () => {
    const f = perModel({ "model-a": [http(410)], "model-b": [ok("read answer")] });
    const h = harness(f.fetchImpl, { tier: "read" });
    const r = await attempt(h.exec);
    expect(f.models).toEqual(["model-a", "model-b"]);
    expect(r.summary).toBe("read answer\n\n(model fallback: model-a failed (HTTP 410), fell back to model-b)");
  });

  test("every configured model failed: the last model's error, a failed run, the note lists each failover", async () => {
    const f = perModel({ "model-a": [http(404)], "model-b": [http(503, "overloaded")], "model-c": [http(410)] });
    const h = harness(f.fetchImpl, { env: { CORVIDINHO_LLM_MODEL: "model-a, model-b, model-c" } });
    const r = await runTask({ cwd: tmp(), task: "say hi", execute: h.exec, verifyRunner: async () => ({ success: true, output: "" }) });
    expect(r.state).toBe("failed");
    expect(r.summary).toBe(
      "LLM HTTP 410: model gone\n\n(model fallback: model-a failed (HTTP 404), fell back to model-b; model-b failed (HTTP 503), fell back to model-c)",
    );
    expect(f.models).toEqual(["model-a", "model-b", "model-c"]);
  });

  test("a next entry with no key is skipped without a call and the note says which key", async () => {
    const f = perModel({ "model-a": [http(404)], local: [ok("from ollama")] });
    const h = harness(f.fetchImpl, { env: { CORVIDINHO_LLM_MODEL: "model-a, anthropic:claude-x, ollama:local" } });
    const r = await attempt(h.exec);
    expect(f.models).toEqual(["model-a", "local"]);
    expect(r.summary).toBe(
      "from ollama\n\n(model fallback: model-a failed (HTTP 404), fell back to anthropic:claude-x; anthropic:claude-x failed (ANTHROPIC_API_KEY is not set), fell back to ollama:local)",
    );
    expect(h.answered).toEqual(["ollama:local"]);
  });

  test("usage is kept per model, so each is priced at its own price", async () => {
    registerTool();
    const f = perModel({
      "model-a": [tools([{ name: "fallback-probe" }], { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }), http(500)],
      "model-b": [ok("done by b", { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 })],
    });
    const h = harness(f.fetchImpl);
    const r = await attempt(h.exec);
    expect(r.summary.startsWith("done by b\n\n(model fallback: model-a failed (HTTP 500)")).toBe(true);
    const last = h.usage.at(-1)!;
    expect(last.totals).toEqual({ promptTokens: 30, completionTokens: 15, totalTokens: 45 });
    expect(last.detail).toEqual({
      model: "model-b",
      byModel: [
        { model: "model-a", promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        { model: "model-b", promptTokens: 20, completionTokens: 10, totalTokens: 30 },
      ],
    });
    expect(h.answered).toEqual(["model-a", "model-b"]);
  });
});

describe("what is not a model failure never fails over (REQ-agent-080)", () => {
  test("a spend-cap stop (unpriced head): nothing is sent, the run asks, no other model is tried", async () => {
    const f = perModel({ "model-b": [ok("never")], "gpt-4o-mini": [ok("never")] });
    const h = harness(f.fetchImpl, {
      env: {
        CORVIDINHO_LLM_MODEL: "unpriced-model, gpt-4o-mini",
        CORVIDINHO_DAILY_SPEND_CAP_USD: "5",
        CORVIDINHO_DATA_DIR: tmp(),
      },
    });
    const r = await attempt(h.exec);
    expect(f.models).toEqual([]);
    expect(r.ask?.reason).toBe("spend-cap");
    expect(r.summary).toBe(SPEND_CAP_SUMMARY);
    expect(h.hops).toEqual([]);
    expect(texts(h.events).some((t) => t.includes("falling back"))).toBe(false);
  });

  test("a cap stop on the model it fell back to does not route around the cap to the next one", async () => {
    const f = perModel({ "gpt-4o-mini": [http(404)], "gpt-4.1": [ok("never")] });
    const h = harness(f.fetchImpl, {
      env: {
        CORVIDINHO_LLM_MODEL: "gpt-4o-mini, unpriced-model, gpt-4.1",
        CORVIDINHO_DAILY_SPEND_CAP_USD: "5",
        CORVIDINHO_DATA_DIR: tmp(),
      },
    });
    const r = await attempt(h.exec);
    // unpriced-model was stopped at the cap before any request; gpt-4.1 never ran.
    expect(f.models).toEqual(["gpt-4o-mini"]);
    expect(r.ask?.reason).toBe("spend-cap");
    expect(h.hops).toEqual([{ from: "gpt-4o-mini", to: "unpriced-model", reason: "HTTP 404" }]);
    expect(r.summary).toBe(`${SPEND_CAP_SUMMARY}\n\n(model fallback: gpt-4o-mini failed (HTTP 404), fell back to unpriced-model)`);
  });

  test("the run's own stop: no failover, the next model is never called", async () => {
    // The stop lands while the head's request is out: it throws, or its HTTP
    // error reply still arrives — either way the stop is not a model failure.
    const heads: Array<[string, (ctrl: AbortController) => Behavior]> = [
      [
        "thrown abort",
        (ctrl) => () => {
          ctrl.abort();
          throw new DOMException("The operation was aborted.", "AbortError");
        },
      ],
      [
        "HTTP error reply",
        (ctrl) => () => {
          ctrl.abort();
          return new Response("upstream", { status: 503 });
        },
      ],
    ];
    for (const [label, head] of heads) {
      const ctrl = new AbortController();
      const f = perModel({ "model-a": [head(ctrl)], "model-b": [ok("never")] });
      const h = harness(f.fetchImpl);
      const r = await attempt(h.exec, 1, ctrl.signal);
      expect({ label, models: f.models }).toEqual({ label, models: ["model-a"] });
      expect(r.error).toBe(true);
      expect(h.hops).toEqual([]);
      expect(texts(h.events).some((t) => t.includes("falling back"))).toBe(false);
      expect(r.summary).not.toContain("model fallback");
    }
  });

  for (const answer of ["denied", "none"] as const) {
    test(`a ${answer === "denied" ? "Deny" : "lapsed card"} on a must-ask call is the tool's answer, not a model failure`, async () => {
      const ran: string[] = [];
      const cmd: PluginCommand = {
        name: "fallback-prod-probe",
        description: "AGENT-11 must-ask test command",
        minTier: 0,
        mustAsk: "prod",
        async handler() {
          ran.push("ran");
          return { ok: true, message: "deployed", exitCode: 0 };
        },
      };
      register(cmd);
      cleanups.push(() => unregister(cmd.name, cmd));
      const prevData = process.env.CORVIDINHO_DATA_DIR;
      process.env.CORVIDINHO_DATA_DIR = tmp();
      cleanups.push(() => {
        if (prevData === undefined) delete process.env.CORVIDINHO_DATA_DIR;
        else process.env.CORVIDINHO_DATA_DIR = prevData;
      });
      const asked = answerMustAsk(answer, { ttlMs: 60 });
      cleanups.push(asked.restore);
      const f = perModel({
        "model-a": [tools([{ name: cmd.name, args: '{"argv":["deploy"]}' }]), ok("I did not deploy it.")],
        "model-b": [ok("never")],
      });
      const h = harness(f.fetchImpl);
      const r = await attempt(h.exec);
      expect(ran).toEqual([]);
      expect(asked.requests).toHaveLength(1);
      expect(f.models).toEqual(["model-a", "model-a"]);
      expect(r.summary).toBe("I did not deploy it.");
      expect(h.hops).toEqual([]);
    });
  }
});

describe("a delegate or council worker's failover reaches the lead (REQ-agent-080, REQ-plugins-080)", () => {
  const WORKER_HOP = { from: "w-a", to: "w-b", reason: "HTTP 410" };

  test("the lead tells it as its own (via the tool), once", async () => {
    registerTool("delegate", { state: "done", filesChanged: [], verified: true, modelFallback: [WORKER_HOP] });
    const f = perModel({
      "model-a": [tools([{ name: "delegate", args: '{"argv":["--task","sub"]}' }]), tools([{ name: "delegate" }]), ok("lead done")],
    });
    const h = harness(f.fetchImpl);
    const r = await attempt(h.exec);
    expect(h.hops).toEqual([{ ...WORKER_HOP, via: "delegate" }]);
    expect(texts(h.events)).toContain("[operator] delegate worker: w-a failed (HTTP 410); falling back to w-b");
    expect(r.summary).toBe("lead done\n\n(model fallback: delegate worker: w-a failed (HTTP 410), fell back to w-b)");
  });

  test("a worker that skipped a headless agent CLI entry: the lead says skipped, not failed (AGENT-13.a)", async () => {
    const SKIP = {
      from: "cli:fakecli --print",
      to: "w-b",
      reason: "only in the owner's own runs, in that talk's worktree",
      skipped: true as const,
    };
    registerTool("council", { state: "done", modelFallback: [SKIP] });
    const f = perModel({
      "model-a": [tools([{ name: "council", args: '{"argv":["--task","sub"]}' }]), ok("lead done")],
    });
    const h = harness(f.fetchImpl);
    const r = await attempt(h.exec);
    expect(h.hops).toEqual([{ ...SKIP, via: "council" }]);
    expect(texts(h.events)).toContain(
      "[operator] council worker: cli:fakecli --print skipped (only in the owner's own runs, in that talk's worktree); falling back to w-b",
    );
    expect(r.summary).toBe(
      "lead done\n\n(model fallback: council worker: cli:fakecli --print skipped (only in the owner's own runs, in that talk's worktree), fell back to w-b)",
    );
  });

  function doneWorkerBin(hops: unknown[]): string {
    const dir = tmp("corvidinho-fallback-bin-");
    const bin = join(dir, "corvidinho");
    const result: TaskResult = {
      summary: "worker answer",
      filesChanged: [],
      verified: false,
      verifySkipped: true,
      cancelled: false,
      state: "done",
      attempts: 1,
      model: "w-b",
      modelFallback: hops as ModelFallback[],
    };
    writeFileSync(bin, `#!/bin/sh\ncat <<'NDJSON_EOF'\n${serializeFrame(resultFrame(result))}\nNDJSON_EOF\n`, { mode: 0o755 });
    chmodSync(bin, 0o755);
    return bin;
  }

  test("the delegate core reads the worker's failovers from its result frame (validated)", async () => {
    const bin = doneWorkerBin([WORKER_HOP, { from: "bad" }]);
    const out = await runDelegateChild({
      bin,
      cwd: tmp(),
      taskText: "sub",
      tier: "read",
      childDepth: 1,
      allowlist: [],
      baseEnv: { PATH: process.env.PATH ?? "" },
    });
    expect(out.state).toBe("done");
    expect(out.modelFallback).toEqual([WORKER_HOP]);
  }, 30_000);

  test("a council carries its voices' failovers once each, in its outcome and tool data", async () => {
    const hop2 = { from: "w-b", to: "w-c", reason: "timed out" };
    let n = 0;
    const out = await runCouncil({
      question: "q?",
      voices: 3,
      childDepth: 1,
      run: async (): Promise<DelegateChildOutcome> => {
        n += 1;
        return {
          exitCode: 0,
          state: "done",
          summary: `voice text ${n}`,
          resultText: `voice text ${n}`,
          filesChanged: [],
          timedOut: false,
          aborted: false,
          modelFallback: n === 2 ? [WORKER_HOP, hop2] : [WORKER_HOP],
        };
      },
    });
    expect(out.ok).toBe(true);
    expect(out.modelFallback).toEqual([WORKER_HOP, hop2]);

    const project = tmp("corvidinho-fallback-proj-");
    writeFileSync(join(project, "fledge.toml"), "[corvidinho.autonomous]\nenabled = true\n");
    const cmd = createCouncilCommand({ bin: doneWorkerBin([WORKER_HOP]), env: { PATH: process.env.PATH ?? "" } });
    const r = await cmd.handler({
      args: ["--voices", "2", "--question", "q?"],
      cwd: project,
      json: true,
      nonInteractive: true,
      allowlist: new Set<string>(),
      tier: "code",
    });
    expect(r.ok).toBe(true);
    expect((r.data as { modelFallback?: unknown }).modelFallback).toEqual([WORKER_HOP]);
  }, 60_000);
});

// ─── the summary note survives clips ───────────────────────────────────────

describe("the closing note survives every clip (REQ-agent-080)", () => {
  const note = "(model fallback: model-a failed (HTTP 404), fell back to model-b)";
  const long = `${"word ".repeat(2000).trim()}\n\n${note}`;

  test("result frame, chat body and Discord split keep it whole; with the role note after it", () => {
    const base: TaskResult = {
      summary: long,
      filesChanged: [],
      verified: false,
      verifySkipped: true,
      cancelled: false,
      state: "done",
      attempts: 1,
    };
    const frame = resultFrame(base);
    expect(frame.truncated).toBe(true);
    expect(frame.result.summary.endsWith(`…\n\n${note}`)).toBe(true);
    expect(frame.result.summary.length).toBeLessThanOrEqual(4001);
    const body = chatBodyFromTaskResult(base);
    expect(body.length).toBeLessThanOrEqual(1800);
    expect(body.endsWith(`\n\n${note}`)).toBe(true);
    const withRole = chatBodyFromTaskResult({ ...base, summary: `${long}\n\n(not allowed for your role)` });
    expect(withRole.endsWith(`\n\n${note}\n\n(not allowed for your role)`)).toBe(true);
    const parts = splitDiscordMessage(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.at(-1)!.endsWith(note)).toBe(true);
    for (const p of parts.slice(0, -1)) expect(p).not.toContain("model fallback");
  });
});

// ─── NDJSON frames and the real CLI ────────────────────────────────────────

describe("NDJSON: usage frames name the model and usage per model; the result frame the failovers (REQ-agent-080, REQ-cli-080)", () => {
  test("usageFrame with the model detail round-trips through the parser", () => {
    const byModel: ModelUsage[] = [
      { model: "model-a", promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      { model: "model-b", promptTokens: 4, completionTokens: 5, totalTokens: 9 },
    ];
    const line = serializeFrame(
      usageFrame({ promptTokens: 5, completionTokens: 7, totalTokens: 12 }, { model: "model-b", byModel }),
    );
    const frame = parseNdjsonLine(line) as Extract<NdjsonFrame, { type: "usage" }> & {
      model?: string;
      byModel?: ModelUsage[];
    };
    expect(frame).toMatchObject({ type: "usage", totalTokens: 12, model: "model-b", byModel });
    // Without the detail the frame is as before.
    expect(JSON.parse(serializeFrame(usageFrame({ promptTokens: 1, completionTokens: 1, totalTokens: 2 })))).toEqual({
      protocol: 2,
      type: "usage",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
    });
  });

  /** A localhost provider: `gone-*` models answer 404/410, others reply with usage. */
  function startServer(): { env: Record<string, string>; models: string[]; stop(): void } {
    const models: string[] = [];
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(req) {
        const body = (await req.json().catch(() => ({}))) as { model?: string };
        const model = String(body.model);
        models.push(model);
        if (model === "gone-model") return new Response("model not found", { status: 404 });
        if (model === "retired-model") return new Response("model retired", { status: 410 });
        return reply(`answer from ${model}`, { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 });
      },
    });
    return {
      env: { OLLAMA_HOST: `127.0.0.1:${server.port}` },
      models,
      stop: () => server.stop(true),
    };
  }

  test("task run --output ndjson: a Text frame, usage frames with the model, a result with model, usageByModel and modelFallback", async () => {
    const llm = startServer();
    try {
      const proc = Bun.spawn([process.execPath, CLI, "task", "run", "--here", "--task", "hi", "--output", "ndjson"], {
        cwd: tmp(),
        env: {
          ...process.env,
          ...llm.env,
          CORVIDINHO_LLM_MODEL: "ollama:gone-model, ollama:fake-model",
          CORVIDINHO_DATA_DIR: tmp(),
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
      expect(code).toBe(0);
      const frames = out
        .split("\n")
        .map((l) => parseNdjsonLine(l))
        .filter((f): f is NdjsonFrame => f !== null);
      expect(llm.models).toEqual(["gone-model", "fake-model"]);
      expect(frames).toContainEqual({
        protocol: 2,
        type: "Text",
        text: "[operator] ollama:gone-model failed (HTTP 404); falling back to ollama:fake-model",
      });
      const usage = frames.find((f) => f.type === "usage") as Record<string, unknown> | undefined;
      expect(usage).toMatchObject({
        totalTokens: 120,
        model: "ollama:fake-model",
        byModel: [{ model: "ollama:fake-model", promptTokens: 100, completionTokens: 20, totalTokens: 120 }],
      });
      const result = (frames.find((f) => f.type === "result") as Extract<NdjsonFrame, { type: "result" }>).result;
      expect(result.state).toBe("done");
      expect(result.summary).toBe(
        "answer from fake-model\n\n(model fallback: ollama:gone-model failed (HTTP 404), fell back to ollama:fake-model)",
      );
      expect(result.model).toBe("ollama:fake-model");
      expect(result.modelFallback).toEqual([{ from: "ollama:gone-model", to: "ollama:fake-model", reason: "HTTP 404" }]);
      expect(result.usageByModel).toEqual([
        { model: "ollama:fake-model", promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      ]);
    } finally {
      llm.stop();
    }
  }, 60_000);

  test("task run (text): a retired head (410) says so on stderr and the answer carries the note", async () => {
    const llm = startServer();
    try {
      const proc = Bun.spawn([process.execPath, CLI, "task", "run", "--here", "--task", "hi"], {
        cwd: tmp(),
        env: {
          ...process.env,
          ...llm.env,
          CORVIDINHO_LLM_MODEL: "ollama:retired-model, ollama:next-model",
          CORVIDINHO_DATA_DIR: tmp(),
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [code, out, err] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      expect(code).toBe(0);
      expect(err).toContain("[operator] ollama:retired-model failed (HTTP 410); falling back to ollama:next-model");
      expect(out).toContain(
        "answer from next-model\n\n(model fallback: ollama:retired-model failed (HTTP 410), fell back to ollama:next-model)",
      );
    } finally {
      llm.stop();
    }
  }, 60_000);
});

// ─── Discord: spawn client, footer, log line ───────────────────────────────

const FELL: TaskResult = {
  summary: "Short answer.\n\n(model fallback: gpt-5 failed (HTTP 404), fell back to gpt-4.1)",
  filesChanged: [],
  verified: false,
  verifySkipped: true,
  cancelled: false,
  state: "done",
  attempts: 1,
  model: "gpt-4.1",
  modelFallback: [{ from: "gpt-5", to: "gpt-4.1", reason: "HTTP 404" }],
  usageByModel: [
    { model: "gpt-5", promptTokens: 1000, completionTokens: 0, totalTokens: 1000 },
    { model: "gpt-4.1", promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
  ],
};
const FELL_USAGE: AgentTokenUsage = { promptTokens: 2000, completionTokens: 500, totalTokens: 2500 };

function frameBin(result: TaskResult): { bin: string; dir: string } {
  const dir = tmp("corvidinho-fallback-bin-");
  const bin = join(dir, "corvidinho");
  const lines = [serializeFrame(usageFrame(FELL_USAGE)), serializeFrame(resultFrame(result))];
  const body = lines.map((l) => `cat <<'NDJSON_EOF'\n${l}\nNDJSON_EOF`).join("\n");
  writeFileSync(bin, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  chmodSync(bin, 0o755);
  return { bin, dir };
}

describe("Discord: the footer names the model that answered and prices each model (REQ-discord-080)", () => {
  test("answerSpendFor prices each model's tokens at its own price; one unpriced model makes the cost unknown", () => {
    const five = priceForModel("gpt-5")!;
    const four = priceForModel("gpt-4.1")!;
    const expected = costMicroUsd(five, FELL.usageByModel![0]!) + costMicroUsd(four, FELL.usageByModel![1]!);
    expect(answerSpendFor(FELL_USAGE, "gpt-4.1", FELL.usageByModel)).toEqual({
      totalTokens: 2500,
      costMicroUsd: expected,
    });
    // One model with tokens and no known price: unknown, never a partial sum or $0.
    expect(
      answerSpendFor(FELL_USAGE, "gpt-4.1", [
        { model: "ollama:local", promptTokens: 10, completionTokens: 0, totalTokens: 10 },
        FELL.usageByModel![1]!,
      ]),
    ).toEqual({ totalTokens: 2500 });
    // A kind prefix is not part of the priced id.
    expect(
      answerSpendFor(FELL_USAGE, "x", [{ model: "anthropic:claude-sonnet-5", promptTokens: 2000, completionTokens: 500, totalTokens: 2500 }]),
    ).toEqual({ totalTokens: 2500, costMicroUsd: costMicroUsd(priceForModel("claude-sonnet-5")!, FELL_USAGE) });
  });

  test("the Discord spawn client returns the model, the failovers and usage per model, and logs llm.fallback", async () => {
    const { bin, dir } = frameBin(FELL);
    const logged: Array<{ hops: ModelFallback[]; sessionId: string }> = [];
    const out = await createDiscordClient({
      bin,
      cwd: dir,
      onModelFallback: (hops, sessionId) => logged.push({ hops, sessionId }),
    }).runChat({ prompt: "x", sessionId: "s1" });
    const r = out as typeof out & { model?: string; modelFallback?: ModelFallback[]; usageByModel?: ModelUsage[] };
    expect(r.summary).toBe(FELL.summary);
    expect(r.model).toBe("gpt-4.1");
    expect(r.modelFallback).toEqual(FELL.modelFallback);
    expect(r.usageByModel).toEqual(FELL.usageByModel);
    expect(logged).toEqual([{ hops: FELL.modelFallback!, sessionId: "s1" }]);

    // Default: one [discord] llm.fallback warn line for the bridge log.
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      await createDiscordClient({ bin, cwd: dir }).runChat({ prompt: "x", sessionId: "s2" });
      expect(warn.mock.calls.map((c) => String(c[0]))).toContain(
        "[discord] llm.fallback: gpt-5 failed (HTTP 404), fell back to gpt-4.1 (session s2)",
      );
    } finally {
      warn.mockRestore();
    }
  }, 30_000);

  test("the WATCH spawn client logs one [watch] llm.fallback warn line; the comment body keeps the note (REQ-watch-080)", async () => {
    const { bin, dir } = frameBin(FELL);
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const out = await createWatchClient({ bin, cwd: dir }).runChat({ prompt: "x", sessionId: "w1" });
      expect(out.summary.endsWith("(model fallback: gpt-5 failed (HTTP 404), fell back to gpt-4.1)")).toBe(true);
      expect(warn.mock.calls.map((c) => String(c[0]))).toContain(
        "[watch] llm.fallback: gpt-5 failed (HTTP 404), fell back to gpt-4.1 (session w1)",
      );
    } finally {
      warn.mockRestore();
    }
  }, 30_000);

  const OWNER_ID = "111122223333444455";
  const OTHER_ID = "222233334444555566";

  async function bridgeWith(agent: AgentClient) {
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    const outbound = memoryThinkingOutbound();
    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: "chan-1",
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: join(tmp(), "no-allowlist.toml"),
        CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
      },
      projectRoot: tmp("corvidinho-fallback-proj-"),
      skipProtocolCheck: true,
      disableScheduler: true,
      thinkingOutbound: outbound,
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent,
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        handlers.reply = async () => ({ messageId: "bot_1" });
        handlers.sendDm = async () => ({ channelId: "dm", messageId: "dm_1" });
        return createNullGateway();
      },
    });
    if (result.ok !== true || !box.handlers) throw new Error("bridge failed");
    cleanups.push(() => void result.stop());
    return { handlers: box.handlers, outbound };
  }

  const fellAgent: AgentClient = {
    async runChat({ sessionId }) {
      return {
        ok: true,
        sessionId,
        summary: FELL.summary,
        exitCode: 0,
        usage: FELL_USAGE,
        model: FELL.model,
        modelFallback: FELL.modelFallback,
        usageByModel: FELL.usageByModel,
      } as Awaited<ReturnType<AgentClient["runChat"]>>;
    },
  };

  function mention(authorId: string) {
    return { id: "m1", channelId: "chan-1", authorId, authorBot: false, content: "@bot hi", mentionedBot: true };
  }

  test("the owner's footer: 'gpt-4.1 (fell back from gpt-5)', tokens and each model priced; the answer keeps the note", async () => {
    const { handlers, outbound } = await bridgeWith(fellAgent);
    await handlers.onMessage(mention(OWNER_ID));
    const edit = outbound.contentEdits.at(-1)!;
    expect(edit.content).toBe(FELL.summary);
    const cost = formatUsd(answerSpendFor(FELL_USAGE, "gpt-4.1", FELL.usageByModel).costMicroUsd!);
    expect((edit.embed as DiscordEmbedPayload).footer!.text).toMatch(
      new RegExp(`^gpt-4\\.1 \\(fell back from gpt-5\\) \\| 3k tokens \\| ${cost.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\| \\d+s`),
    );
  });

  test("anyone else's footer names the model and what it fell back from, never tokens or cost", async () => {
    const { handlers, outbound } = await bridgeWith(fellAgent);
    await handlers.onMessage(mention(OTHER_ID));
    const edit = outbound.contentEdits.at(-1)!;
    expect(edit.content).toBe(FELL.summary);
    const text = (edit.embed as DiscordEmbedPayload).footer!.text;
    expect(text).toMatch(/^gpt-4\.1 \(fell back from gpt-5\) \| \d+s/);
    expect(text).not.toContain("token");
    expect(text).not.toContain("$");
  });
});

// ─── daemon ────────────────────────────────────────────────────────────────

describe("daemon: a scheduled run that failed over is an llm.fallback warn line (REQ-cli-080)", () => {
  test("the daemon's own spawn client logs it with the session and the failovers", async () => {
    const dataDir = tmp();
    const projectRoot = tmp("corvidinho-fallback-daemon-proj-");
    const { bin } = frameBin(FELL);
    const env = {
      ...process.env,
      CORVIDINHO_DATA_DIR: dataDir,
      CORVIDINHO_BIN: bin,
      CORVIDINHO_DISCORD_ALLOW_USERS: "",
      CORVIDINHO_DISCORD_ALLOW_ROLES: "",
      CORVIDINHO_DISCORD_DENY_USERS: "",
      CORVIDINHO_DISCORD_DENY_ROLES: "",
      CORVIDINHO_OWNER_DISCORD_ID: "",
    };
    const seed: Database = openCorvidinhoDb({ env });
    cleanups.push(() => seed.close());
    const s = new ScheduleStore({ db: seed }).create({
      name: "nightly",
      cronExpression: "0 * * * *",
      project: ".",
      prompt: "summarize",
      createdByUserId: "owner",
    });
    seed.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [Date.now() - 1000, s.id]);
    const lines: Array<Record<string, unknown>> = [];
    const d = await startDaemon({
      env,
      projectRoot,
      logger: createDaemonLogger({ write: (l) => lines.push(JSON.parse(l)) }),
      skipProtocolCheck: true,
      useWorktrees: false,
    });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    try {
      await d.tick();
      const end = Date.now() + 20_000;
      while (Date.now() < end && !lines.some((l) => l.event === "run.finished")) await Bun.sleep(25);
      expect(lines.find((l) => l.event === "llm.fallback")).toMatchObject({
        level: "warn",
        sessionId: expect.stringContaining(s.id),
        fallbacks: FELL.modelFallback,
        message: "llm.fallback: gpt-5 failed (HTTP 404), fell back to gpt-4.1",
      });
    } finally {
      await d.stop("SIGTERM");
    }
  }, 60_000);
});
