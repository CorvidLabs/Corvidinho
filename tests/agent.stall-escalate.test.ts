/**
 * AGENT-17 / AGENT-17.a (#86, REQ-agent-088): after the one nudge, a run that
 * still only plans, or says "Done." with nothing changed, moves to the next
 * stronger model in the order I set (`CORVIDINHO_LLM_MODEL_ORDER`) and says
 * so; with no order it does not move, and the one nudge still happens.
 * Pure units of src/agent/providers.ts and src/agent/loop-guards.ts, the
 * task-run tool loop over an injected fake LLM (tests/fixtures/fake-llm.ts;
 * no network, no real key), the SAFE-8 spend guard on a scratch data dir,
 * the delegate worker env, and the real CLI against the localhost fake LLM.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskExecute } from "../src/agent/execute.ts";
import { parseNdjsonLine } from "../src/agent/events-ndjson.ts";
import { createStallNudgeGuard, stallMovedNote, stallStandsNote } from "../src/agent/loop-guards.ts";
import {
  modelChain,
  modelOrderFromEnv,
  moveToStronger,
  MODEL_ORDER_ENV,
  STRONGER_MODEL_NOTE_PREFIX,
  strongerModel,
  strongerModelNote,
  withModelFallbackNote,
  withStrongerModelNote,
} from "../src/agent/providers.ts";
import { clipKeepingRoleNote, closingNotesTail, ROLE_REFUSED_SUMMARY_NOTE } from "../src/agent/task-summary.ts";
import type { AgentEvent, ExecuteResult, ModelUsage } from "../src/agent/types.ts";
import type { CapabilityTier } from "../src/agent/tier.ts";
import { buildDelegateSpawn } from "../src/autonomous/delegate.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry, register } from "../src/plugins/registry.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { startFakeLlm, type FakeReply } from "./fixtures/fake-llm.ts";

// Spelled out (not imported) so the loop tests read the same on the base.
const ORDER = "CORVIDINHO_LLM_MODEL_ORDER";
const MARK = "[Corvidinho harness — AGENT-17]";
const OP = "[operator] AGENT-17:";

type Msg = { role: string; content: string | null };
type Body = { model?: string; messages: Msg[] };

const BASE_ENV = {
  CORVIDINHO_LLM_API_KEY: "fake-key-not-real",
  CORVIDINHO_LLM_BASE_URL: "http://fake-llm.invalid/v1",
};

/**
 * A fetch that answers each chat request by its `model`: `script[model]`
 * plays its replies in order (the last repeats). Every reply reports usage,
 * so per-model totals can be read back. Bodies recorded in order.
 */
function fakeModels(script: Record<string, (FakeReply | { httpStatus: number })[]>) {
  const bodies: Body[] = [];
  const seen = new Map<string, number>();
  const fetchImpl = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as Body;
    bodies.push(JSON.parse(JSON.stringify(body)) as Body);
    const model = body.model ?? "";
    const replies = script[model] ?? ["(unscripted model)"];
    const n = seen.get(model) ?? 0;
    seen.set(model, n + 1);
    const out = replies[Math.min(n, replies.length - 1)]!;
    if (typeof out !== "string" && "httpStatus" in out) {
      return new Response("{}", { status: out.httpStatus, headers: { "content-type": "application/json" } });
    }
    const message =
      typeof out === "string"
        ? { role: "assistant", content: out }
        : {
            role: "assistant",
            content: out.text ?? null,
            tool_calls: out.toolCalls.map((c, i) => ({
              id: `fake_${i}`,
              type: "function",
              function: { name: c.name, arguments: c.args ?? "{}" },
            })),
          };
    return new Response(
      JSON.stringify({
        choices: [{ message }],
        usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return { fetchImpl, bodies };
}

function makeExec(
  env: Record<string, string>,
  script: Record<string, (FakeReply | { httpStatus: number })[]>,
  opts: { tier?: CapabilityTier; task?: string; cwd?: string } = {},
) {
  const { fetchImpl, bodies } = fakeModels(script);
  const events: AgentEvent[] = [];
  const usage: ModelUsage[][] = [];
  const answered: string[] = [];
  const exec = createTaskExecute({
    taskText: opts.task ?? "fix the typo in README.md",
    env: { ...process.env, ...BASE_ENV, ...env },
    fetchImpl,
    tier: opts.tier ?? "code",
    allowlist: [],
    loadPlugins: false,
    cwd: opts.cwd ?? mkdtempSync(join(tmpdir(), "corvidinho-stall-escalate-")),
    projectInstructions: false,
    maxToolRounds: 8,
    onEvent: (e) => events.push(e),
    onUsage: (_totals, detail) => usage.push(detail.byModel),
    onModel: (m) => answered.push(m),
  });
  return { exec, bodies, events, usage, answered };
}

const run = (exec: ReturnType<typeof createTaskExecute>, attempt = 1): Promise<ExecuteResult> =>
  exec({ attempt, signal: new AbortController().signal });

const texts = (events: AgentEvent[]) =>
  events.filter((e): e is Extract<AgentEvent, { type: "Text" }> => e.type === "Text").map((e) => e.text);
const agent17 = (events: AgentEvent[]) => texts(events).filter((t) => t.startsWith(OP));
const nudges = (b: Body | undefined) =>
  (b?.messages ?? []).filter((m) => m.role === "user" && (m.content ?? "").startsWith(MARK)).length;

/** A test tool that reports a changed file (a real change). */
function registerWriter(name = "touch-file") {
  register({
    name,
    description: "test helper that reports filesChanged",
    minTier: 0,
    async handler() {
      return { ok: true, data: { filesChanged: ["README.md"] }, message: "touched", exitCode: 0 };
    },
  });
}

describe("strongerModel: the next one in the order I set (AGENT-17.a, REQ-agent-088)", () => {
  const env = (model: string, order?: string, extra: Record<string, string> = {}) => ({
    ...BASE_ENV,
    CORVIDINHO_LLM_MODEL: model,
    ...(order === undefined ? {} : { [ORDER]: order }),
    ...extra,
  });

  test("the key and its parse: the model list's own entries, weakest first; unset or blank = none", () => {
    expect(MODEL_ORDER_ENV).toBe(ORDER);
    expect(modelOrderFromEnv({})).toEqual([]);
    expect(modelOrderFromEnv({ [ORDER]: " , " })).toEqual([]);
    expect(modelOrderFromEnv({ [ORDER]: "ollama:qwen3:30b, gpt-5-mini ,anthropic:claude-opus-5" })).toEqual([
      { kind: "ollama", model: "qwen3:30b" },
      { kind: "openai", model: "gpt-5-mini" },
      { kind: "anthropic", model: "claude-opus-5" },
    ]);
  });

  test("no order set: it stays (no-order), even with stronger-looking models configured", () => {
    const e = env("weak,strong");
    expect(strongerModel(modelChain(e, "code"), modelOrderFromEnv(e))).toEqual({ ok: false, why: "no-order" });
  });

  test("the next one in the order that the tier's list has", () => {
    const e = env("weak,strong", "weak,strong");
    const chain = modelChain(e, "code");
    expect(strongerModel(chain, modelOrderFromEnv(e))).toEqual({ ok: true, index: 1, from: "weak", to: "strong" });
    // `openai:` and bare are the same entry.
    const e2 = env("openai:weak,strong", "weak,openai:strong");
    expect(strongerModel(modelChain(e2, "code"), modelOrderFromEnv(e2))).toMatchObject({ ok: true, to: "strong" });
  });

  test("the order decides, not the list's fallback order: a later list entry that is weaker is never picked", () => {
    // The list falls back weak → mid → strong; the order says strong < weak < mid.
    const e = env("weak,mid,strong", "strong,weak,mid");
    expect(strongerModel(modelChain(e, "code"), modelOrderFromEnv(e))).toMatchObject({ ok: true, to: "mid" });
  });

  test("already the strongest in the order: it stays (top)", () => {
    const e = env("strong,weak", "weak,strong");
    expect(strongerModel(modelChain(e, "code"), modelOrderFromEnv(e))).toEqual({ ok: false, why: "top" });
  });

  test("a current model that is not in the order: it stays (unordered), never a guess", () => {
    const e = env("other,strong", "weak,strong");
    expect(strongerModel(modelChain(e, "code"), modelOrderFromEnv(e))).toEqual({ ok: false, why: "unordered" });
  });

  test("a stronger model the tier's list does not have, or whose key is missing, is skipped", () => {
    // `mid` is only in the order; `anthropic:big` has no key; `strong` is next.
    const e = env("weak,anthropic:big,strong", "weak,mid,anthropic:big,strong");
    expect(strongerModel(modelChain(e, "code"), modelOrderFromEnv(e))).toMatchObject({ ok: true, index: 2, to: "strong" });
    // None available: it stays (unavailable).
    const none = env("weak,anthropic:big", "weak,mid,anthropic:big");
    expect(strongerModel(modelChain(none, "code"), modelOrderFromEnv(none))).toEqual({ ok: false, why: "unavailable" });
    // Another tier's model is not this run's: the code tier lists only `weak`.
    const tiered = env("weak,strong", "weak,strong", { CORVIDINHO_LLM_MODEL_CODE: "weak" });
    expect(strongerModel(modelChain(tiered, "code"), modelOrderFromEnv(tiered))).toEqual({ ok: false, why: "unavailable" });
    expect(strongerModel(modelChain(tiered, "tool"), modelOrderFromEnv(tiered))).toMatchObject({ ok: true, to: "strong" });
  });

  test("a model that already failed in this run is not moved back to", () => {
    const e = env("strong,weak", "weak,strong");
    const chain = modelChain(e, "code");
    chain.index = 1;
    chain.fallbacks.push({ from: "strong", to: "weak", reason: "HTTP 500" });
    expect(strongerModel(chain, modelOrderFromEnv(e))).toEqual({ ok: false, why: "unavailable" });
  });

  test("moveToStronger moves the chain only when there is a stronger model", () => {
    const e = env("weak,strong", "weak,strong");
    const chain = modelChain(e, "code");
    expect(moveToStronger(chain, modelOrderFromEnv(e))).toMatchObject({ ok: true, to: "strong" });
    expect(chain.index).toBe(1);
    expect(moveToStronger(chain, modelOrderFromEnv(e))).toEqual({ ok: false, why: "top" });
    expect(chain.index).toBe(1);
    const none = env("weak,strong");
    const still = modelChain(none, "code");
    expect(moveToStronger(still, [])).toEqual({ ok: false, why: "no-order" });
    expect(still.index).toBe(0);
  });
});

describe("the notice, the notes and the guard (REQ-agent-088)", () => {
  test("one plain closing line, added once, kept by clips after the fallback note and before the role note", () => {
    const move = { from: "gpt-5-mini", to: "anthropic:claude-opus-5", kind: "plan" as const };
    expect(strongerModelNote(move)).toBe(
      "(stronger model: gpt-5-mini only planned after the nudge, so anthropic:claude-opus-5 took over)",
    );
    expect(strongerModelNote({ ...move, kind: "done-claim" })).toBe(
      "(stronger model: gpt-5-mini said it was done with nothing changed after the nudge, so anthropic:claude-opus-5 took over)",
    );
    expect(STRONGER_MODEL_NOTE_PREFIX).toBe("(stronger model: ");
    const once = withStrongerModelNote("Fixed it.", move);
    expect(withStrongerModelNote(once, move)).toBe(once);
    expect(withStrongerModelNote("", move)).toBe(strongerModelNote(move));
    const full = `${withStrongerModelNote(
      withModelFallbackNote("x".repeat(500), [{ from: "a", to: "gpt-5-mini", reason: "HTTP 404" }]),
      move,
    )}\n\n${ROLE_REFUSED_SUMMARY_NOTE}`;
    const tail = closingNotesTail(full);
    expect(tail.startsWith("\n\n(model fallback: a failed (HTTP 404), fell back to gpt-5-mini)\n\n(stronger model: ")).toBe(true);
    expect(tail.endsWith(ROLE_REFUSED_SUMMARY_NOTE)).toBe(true);
    const clipped = clipKeepingRoleNote(full, 300, (h, m) => h.slice(0, m));
    expect(clipped).toContain(strongerModelNote(move));
    expect(clipped.length).toBeLessThanOrEqual(300);
  });

  test("operator lines: the move, and why a stall after the nudge stands", () => {
    expect(stallMovedNote("done-claim", "weak", "strong")).toBe(
      "[operator] AGENT-17: the reply was a 'Done.'-style or empty claim with nothing changed, after the nudge; moving from weak to the stronger model strong (next in the model order)",
    );
    const stand = (why: Parameters<typeof stallStandsNote>[1]) => stallStandsNote("plan", why);
    expect(stand("no-order")).toEndWith("the reply stands (no model order is set, so it does not move to another model)");
    expect(stand("top")).toEndWith("the reply stands (this model is already the strongest in the model order)");
    expect(stand("unordered")).toEndWith("the reply stands (this model is not in the model order, so it does not move)");
    expect(stand("unavailable")).toEndWith("the reply stands (no stronger model in the model order is available for this run)");
    expect(stand("moved")).toEndWith("the reply stands (it already moved to a stronger model once in this run)");
  });

  test("the guard: one nudge, then a move is tried until one happens, then stalls stand", () => {
    const g = createStallNudgeGuard();
    expect(g.next()).toBe("nudge");
    expect(g.next()).toBe("escalate");
    g.moved();
    expect(g.next()).toBe("stand");
  });
});

describe("tool loop: after the nudge it moves to the next stronger model in the order (REQ-agent-088)", () => {
  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
  });
  afterEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  test("order set: one nudge, then the same request goes to the stronger model once, with the notice", async () => {
    registerWriter();
    const { exec, bodies, events, usage, answered } = makeExec(
      { CORVIDINHO_LLM_MODEL: "fake-weak,fake-strong", [ORDER]: "fake-weak,fake-strong" },
      {
        "fake-weak": ["Done."],
        "fake-strong": [{ toolCalls: [{ name: "touch-file" }] }, "Fixed the typo in README.md."],
      },
    );
    const r = await run(exec);
    expect(bodies.map((b) => b.model)).toEqual(["fake-weak", "fake-weak", "fake-strong", "fake-strong"]);
    // The one nudge went to the weak model; the stronger model gets that same
    // request (the weak model's second stall dropped): still one nudge.
    expect(nudges(bodies[1])).toBe(1);
    expect(bodies[2]?.messages).toEqual(bodies[1]?.messages);
    expect(nudges(bodies[3])).toBe(1);
    expect(r.filesChanged).toEqual(["README.md"]);
    expect(r.error).toBeUndefined();
    expect(r.ask).toBeUndefined();
    expect(r.summary).toBe(
      "Fixed the typo in README.md.\n\n(stronger model: fake-weak said it was done with nothing changed after the nudge, so fake-strong took over)",
    );
    expect(agent17(events)).toEqual([
      "[operator] AGENT-17: the reply was a 'Done.'-style or empty claim with nothing changed; nudged once (same model)",
      "[operator] AGENT-17: the reply was a 'Done.'-style or empty claim with nothing changed, after the nudge; moving from fake-weak to the stronger model fake-strong (next in the model order)",
    ]);
    // Spend: the stronger model's calls are counted under it (each model at its own price).
    expect(usage.at(-1)).toEqual([
      { model: "fake-weak", promptTokens: 200, completionTokens: 20, totalTokens: 220 },
      { model: "fake-strong", promptTokens: 200, completionTokens: 20, totalTokens: 220 },
    ]);
    expect(answered.at(-1)).toBe("fake-strong");
  });

  test("a plan after the nudge moves too; the rest of the run (a verify retry) stays on the stronger model", async () => {
    const { exec, bodies } = makeExec(
      { CORVIDINHO_LLM_MODEL: "fake-weak,fake-strong", [ORDER]: "fake-weak,fake-strong" },
      {
        "fake-weak": ["I'll fix the typo in README.md, then run the tests."],
        "fake-strong": ["README.md already reads correctly; nothing needed changing."],
      },
    );
    const r = await run(exec);
    expect(bodies.map((b) => b.model)).toEqual(["fake-weak", "fake-weak", "fake-strong"]);
    expect(r.summary).toContain("(stronger model: fake-weak only planned after the nudge, so fake-strong took over)");
    const again = await run(exec, 2);
    expect(bodies.at(-1)?.model).toBe("fake-strong");
    expect(again.summary).toContain("(stronger model: fake-weak only planned after the nudge, so fake-strong took over)");
  });

  test("no order set: the one nudge still happens, then the reply stands on the same model", async () => {
    const { exec, bodies, events } = makeExec(
      { CORVIDINHO_LLM_MODEL: "fake-weak,fake-strong" },
      { "fake-weak": ["Done."], "fake-strong": ["never reached"] },
    );
    const r = await run(exec);
    expect(bodies.map((b) => b.model)).toEqual(["fake-weak", "fake-weak"]);
    expect(nudges(bodies[1])).toBe(1);
    expect(r.summary).toBe("Done.");
    expect(agent17(events)).toEqual([
      "[operator] AGENT-17: the reply was a 'Done.'-style or empty claim with nothing changed; nudged once (same model)",
      "[operator] AGENT-17: the reply was a 'Done.'-style or empty claim with nothing changed, after the nudge; the reply stands (no model order is set, so it does not move to another model)",
    ]);
  });

  test("already at the top of the order: no move, the reply stands", async () => {
    const { exec, bodies, events } = makeExec(
      { CORVIDINHO_LLM_MODEL: "fake-strong,fake-weak", [ORDER]: "fake-weak,fake-strong" },
      { "fake-strong": ["Done."], "fake-weak": ["never reached"] },
    );
    const r = await run(exec);
    expect(bodies.map((b) => b.model)).toEqual(["fake-strong", "fake-strong"]);
    expect(r.summary).toBe("Done.");
    expect(agent17(events)[1]).toEndWith("the reply stands (this model is already the strongest in the model order)");
  });

  test("never an unordered or another tier's model: the reply stands", async () => {
    const unordered = makeExec(
      { CORVIDINHO_LLM_MODEL: "fake-weak,fake-strong", [ORDER]: "fake-mid,fake-strong" },
      { "fake-weak": ["Done."], "fake-strong": ["never reached"] },
    );
    expect((await run(unordered.exec)).summary).toBe("Done.");
    expect(unordered.bodies.map((b) => b.model)).toEqual(["fake-weak", "fake-weak"]);
    expect(agent17(unordered.events)[1]).toContain("this model is not in the model order");

    const otherTier = makeExec(
      {
        CORVIDINHO_LLM_MODEL: "fake-weak,fake-strong",
        CORVIDINHO_LLM_MODEL_CODE: "fake-weak",
        [ORDER]: "fake-weak,fake-strong",
      },
      { "fake-weak": ["Done."], "fake-strong": ["never reached"] },
    );
    expect((await run(otherTier.exec)).summary).toBe("Done.");
    expect(otherTier.bodies.map((b) => b.model)).toEqual(["fake-weak", "fake-weak"]);
    expect(agent17(otherTier.events)[1]).toContain("no stronger model in the model order is available for this run");
  });

  test("a model that failed earlier in the run is not moved back to", async () => {
    const { exec, bodies, events } = makeExec(
      { CORVIDINHO_LLM_MODEL: "fake-strong,fake-weak", [ORDER]: "fake-weak,fake-strong" },
      { "fake-strong": [{ httpStatus: 500 }, "never reached"], "fake-weak": ["Done."] },
    );
    const r = await run(exec);
    expect(bodies.map((b) => b.model)).toEqual(["fake-strong", "fake-weak", "fake-weak"]);
    expect(r.summary).toBe("Done.\n\n(model fallback: fake-strong failed (HTTP 500), fell back to fake-weak)");
    expect(agent17(events)[1]).toContain("no stronger model in the model order is available for this run");
  });

  test("it moves once per run: the stronger model stalling too stands", async () => {
    const { exec, bodies, events } = makeExec(
      { CORVIDINHO_LLM_MODEL: "fake-weak,fake-mid,fake-strong", [ORDER]: "fake-weak,fake-mid,fake-strong" },
      { "fake-weak": ["Done."], "fake-mid": ["Done."], "fake-strong": ["never reached"] },
    );
    const r = await run(exec);
    expect(bodies.map((b) => b.model)).toEqual(["fake-weak", "fake-weak", "fake-mid"]);
    expect(r.summary).toBe(
      "Done.\n\n(stronger model: fake-weak said it was done with nothing changed after the nudge, so fake-mid took over)",
    );
    expect(agent17(events)).toHaveLength(3);
    expect(agent17(events)[2]).toEndWith("the reply stands (it already moved to a stronger model once in this run)");
  });

  test("an answer after the nudge is not a stall: no move", async () => {
    const { exec, bodies, events } = makeExec(
      { CORVIDINHO_LLM_MODEL: "fake-weak,fake-strong", [ORDER]: "fake-weak,fake-strong" },
      { "fake-weak": ["Done.", "README.md already had the fix, so nothing needed changing."] },
    );
    const r = await run(exec);
    expect(bodies.map((b) => b.model)).toEqual(["fake-weak", "fake-weak"]);
    expect(r.summary).toBe("README.md already had the fix, so nothing needed changing.");
    expect(agent17(events)).toHaveLength(1);
  });

  test("SAFE-8 / AUTONOMY-8: the stronger model's calls go through the spend guard and are counted under it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-stall-escalate-spend-"));
    try {
      const { exec, bodies } = makeExec(
        {
          CORVIDINHO_LLM_MODEL: "gpt-4o-mini,gpt-4.1",
          [ORDER]: "gpt-4o-mini,gpt-4.1",
          CORVIDINHO_DATA_DIR: dir,
          CORVIDINHO_DAILY_SPEND_CAP_USD: "5",
        },
        { "gpt-4o-mini": ["Done."], "gpt-4.1": ["Checked README.md: nothing to change."] },
      );
      const r = await run(exec);
      expect(bodies.map((b) => b.model)).toEqual(["gpt-4o-mini", "gpt-4o-mini", "gpt-4.1"]);
      expect(r.summary).toContain("so gpt-4.1 took over)");
      const db = openCorvidinhoDb({ path: join(dir, "corvidinho.db") });
      try {
        const rows = db.query("SELECT model, status FROM spend_ledger ORDER BY ts").all() as { model: string }[];
        expect(rows.map((row) => row.model)).toEqual(["gpt-4o-mini", "gpt-4o-mini", "gpt-4.1"]);
      } finally {
        db.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("SAFE-8 / AUTONOMY-8: a cap covers the stronger model too — an unpriced one stops and asks, never routed around", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-stall-escalate-spend-"));
    try {
      const { exec, bodies } = makeExec(
        {
          CORVIDINHO_LLM_MODEL: "gpt-4o-mini,local-unpriced",
          [ORDER]: "gpt-4o-mini,local-unpriced",
          CORVIDINHO_DATA_DIR: dir,
          CORVIDINHO_DAILY_SPEND_CAP_USD: "5",
        },
        { "gpt-4o-mini": ["Done."], "local-unpriced": ["never reached"] },
      );
      const r = await run(exec);
      // The stronger model's call was stopped before it was sent.
      expect(bodies.map((b) => b.model)).toEqual(["gpt-4o-mini", "gpt-4o-mini"]);
      expect(r.ask?.reason).toBe("spend-cap");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("delegate workers: the same rule within their own run (REQ-agent-088)", () => {
  test("a worker inherits the model order with the model list", () => {
    const { env } = buildDelegateSpawn({
      bin: "corvidinho",
      taskText: "sub task",
      tier: "code",
      childDepth: 1,
      allowlist: [],
      baseEnv: { CORVIDINHO_LLM_MODEL: "weak,strong", [ORDER]: "weak,strong" },
    });
    expect(env.CORVIDINHO_LLM_MODEL).toBe("weak,strong");
    expect(env[ORDER]).toBe("weak,strong");
  });
});

describe("task run CLI: after the nudge it moves to the stronger model (localhost fake LLM, REQ-agent-088)", () => {
  test("--output ndjson: weak, weak + nudge, then strong; the notice in the summary and the operator line", async () => {
    const root = join(import.meta.dir, "..");
    const fake = startFakeLlm({
      reply: (body) =>
        (body as Body).model === "fake-strong" ? "README.md already reads correctly; nothing to change." : "Done.",
    });
    try {
      const proc = Bun.spawn(
        ["bun", join(root, "src/cli.ts"), "task", "run", "--here", "--task", "fix the typo in README.md", "--output", "ndjson"],
        {
          // A scratch non-git project: never the repo's own snapshot or lane.
          cwd: mkdtempSync(join(tmpdir(), "corvidinho-stall-escalate-cli-")),
          stdout: "pipe",
          stderr: "pipe",
          env: {
            ...process.env,
            ...fake.env,
            CORVIDINHO_LLM_MODEL: "ollama:fake-weak,ollama:fake-strong",
            [ORDER]: "ollama:fake-weak,ollama:fake-strong",
            CORVIDINHO_LLM_TIER: "code",
            CORVIDINHO_DELEGATE_DEPTH: "",
          },
        },
      );
      const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
      expect(code).toBe(0);
      expect(fake.requests.map((b) => (b as Body).model)).toEqual(["fake-weak", "fake-weak", "fake-strong"]);
      const frames = out.split("\n").map((l) => parseNdjsonLine(l)).filter((f) => f !== null);
      const notes = frames.map((f) => (f?.type === "Text" ? f.text : "")).filter((t) => t.startsWith(OP));
      expect(notes).toHaveLength(2);
      expect(notes[1]).toContain("moving from ollama:fake-weak to the stronger model ollama:fake-strong");
      const result = frames.find((f) => f?.type === "result");
      expect(result?.type).toBe("result");
      if (result?.type === "result") {
        expect(result.result.state).toBe("done");
        expect(result.result.summary).toBe(
          "README.md already reads correctly; nothing to change.\n\n(stronger model: ollama:fake-weak said it was done with nothing changed after the nudge, so ollama:fake-strong took over)",
        );
        expect(result.result.model).toBe("ollama:fake-strong");
      }
    } finally {
      fake.stop();
    }
  }, 30_000);
});
