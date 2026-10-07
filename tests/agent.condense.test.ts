/**
 * SESSION-5 / SESSION-5.a (#72; REQ-agent-473, REQ-cli-473): "Each model I
 * configure has its own context window; at about 80% of it, a model writes
 * the summary of older turns, and the current task and my latest
 * instructions stay word for word."
 *
 * The run that calls the model condenses the conversation a bridge replayed
 * into its task: it measures the whole prompt (system prompt, tools, persona,
 * memory and the conversation) against 80% of the window of the model its
 * call goes to (`kind:model=TOKENS`, else `CORVIDINHO_LLM_CONTEXT_TOKENS`),
 * folds the oldest turns and has that model write their summary through the
 * run's spend guard; the task and the latest instruction stay word for word,
 * and a failed summary call falls back to the extractive summary and says
 * so. `task run --task-stdin` carries the task and conversation on stdin, so
 * no argument-size ceiling caps the prompt below the window.
 *
 * Every import below exists on the base, so these behaviour tests run (and
 * fail on their assertions) against the base sources. An injected fake
 * fetch, a localhost fake provider and fake `corvidinho` bins only; no
 * network, no keys.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskExecute } from "../src/agent/execute.ts";
import { resultFrame, serializeFrame } from "../src/agent/events-ndjson.ts";
import { fenceUntrustedData } from "../src/agent/untrusted.ts";
import type { AgentEvent, TaskResult } from "../src/agent/types.ts";
import { createSpawnAgentClient as createDiscordClient } from "../src/discord/agent-client.ts";
import { SESSION_THREAD_FOOTER, SESSION_THREAD_HEADER } from "../src/discord/session-thread.ts";
import { condenseBudgetChars, formatConversationBlock, SUMMARY_LABEL } from "../src/store/conversation.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { createSpawnAgentClient as createWatchClient } from "../src/watch/agent-client.ts";
import { FAKE_LLM_ENV, fakeLlmFetch, startFakeLlm, type FakeReply } from "./fixtures/fake-llm.ts";

const ROOT = join(import.meta.dir, "..");
const CLI = join(ROOT, "src", "cli.ts");
/** Plain persona folder: a clean load, so no `Persona: …` note joins a run's events. */
const PERSONA_FIXTURE = join(import.meta.dir, "fixtures", "persona");
const SPAWN_TIMEOUT_MS = 60_000;

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function tmp(prefix = "corvidinho-condense-run-"): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

// ─── a long conversation ──────────────────────────────────────────────────

/** ~`width` chars of distinct words tagged `tag`. */
function words(tag: string, width: number): string {
  let out = `${tag}:`;
  let i = 0;
  while (out.length < width) out += ` ${tag.toLowerCase()}w${i++}`;
  return out.slice(0, width);
}

const OPENING = `TASK ${words("OPENING", 400)}`;
const LATEST = `LATEST ${words("NEWEST", 300)}`;
const NEW_MESSAGE = "go on with the cron parser";

type Turn = { role: "human" | "agent"; content: string };

function longTurns(middle = 12): Turn[] {
  const turns: Turn[] = [
    { role: "human", content: OPENING },
    { role: "agent", content: words("ANS0", 350) },
  ];
  for (let n = 1; n <= middle; n += 1) {
    turns.push({ role: "human", content: words(`STEP${n}`, 350) });
    turns.push({ role: "agent", content: words(`ANS${n}`, 350) });
  }
  turns.push({ role: "human", content: LATEST });
  turns.push({ role: "agent", content: "ok, the cron parser only" });
  return turns;
}

type Replay = { header: string; footer: string; summary: string; turns: Turn[] };

function replayOf(turns: Turn[], summary = ""): Replay {
  return { header: SESSION_THREAD_HEADER, footer: SESSION_THREAD_FOOTER, summary, turns };
}

/** The task a bridge sends: the replay block ahead of the new message (as `withSessionThread`). */
function taskWith(replay: Replay, message = NEW_MESSAGE): string {
  return `${formatConversationBlock(replay, { header: replay.header, footer: replay.footer })}\n\n${message}`;
}

// ─── a scripted provider ──────────────────────────────────────────────────

type Body = {
  model?: string;
  messages?: Array<{ role: string; content: unknown }>;
  tools?: unknown[];
};

const SUMMARY_SYSTEM_START = "You write the summary";

function isSummaryCall(body: unknown): boolean {
  const first = (body as Body)?.messages?.[0];
  return first?.role === "system" && typeof first.content === "string" && first.content.startsWith(SUMMARY_SYSTEM_START);
}

function userText(body: unknown): string {
  const m = (body as Body)?.messages?.find((x) => x.role === "user");
  return typeof m?.content === "string" ? m.content : "";
}

/** Chars of the whole prompt a request carries: system and user text and the tool schemas. */
function promptChars(body: unknown): number {
  const b = body as Body;
  const sys = b.messages?.find((m) => m.role === "system")?.content;
  return (
    (typeof sys === "string" ? sys.length : 0) +
    userText(body).length +
    (b.tools && b.tools.length > 0 ? JSON.stringify(b.tools).length : 0)
  );
}

const MODEL_SUMMARY = "MODEL-SUMMARY the person and Corvidinho stepped through the scheduler store refactor";

function scripted(summary: (body: unknown) => FakeReply = () => MODEL_SUMMARY) {
  const bodies: Body[] = [];
  const fetch = fakeLlmFetch((body) => {
    bodies.push(body as Body);
    return isSummaryCall(body) ? summary(body) : "Answer about the cron parser.";
  });
  return { fetch, bodies };
}

type Report = {
  summary: string;
  folded: number[];
  by: "model" | "extractive";
  model: string;
  windowTokens: number;
  reason?: string;
};

async function runWith(opts: {
  env: Record<string, string>;
  replay: Replay;
  summary?: (body: unknown) => FakeReply;
  attempts?: number;
}) {
  const { fetch, bodies } = scripted(opts.summary);
  const events: AgentEvent[] = [];
  const reports: Report[] = [];
  const exec = createTaskExecute({
    taskText: taskWith(opts.replay),
    env: { ...FAKE_LLM_ENV, ...opts.env },
    fetchImpl: fetch,
    loadPlugins: false,
    projectInstructions: false,
    personaRoot: PERSONA_FIXTURE,
    onEvent: (e) => events.push(e),
    // SESSION-5.a: the conversation replayed into the task, and what condensing did.
    conversation: opts.replay,
    onCondensed: (r: Report) => reports.push(r),
  } as Parameters<typeof createTaskExecute>[0]);
  const results = [];
  for (let attempt = 1; attempt <= (opts.attempts ?? 1); attempt += 1) {
    results.push(await exec({ attempt, signal: new AbortController().signal }));
  }
  const summaries = bodies.filter(isSummaryCall);
  const mains = bodies.filter((b) => !isSummaryCall(b));
  return { results, bodies, summaries, mains, events, reports };
}

const texts = (events: AgentEvent[]) =>
  events.flatMap((e) => (e.type === "Text" ? [e.text] : []));

/** A window no test prompt comes near (80% of it is 32M characters). */
const HUGE = "10000000";

/**
 * The whole prompt of a run that condenses nothing, and the part of it outside
 * the conversation and new message (system prompt, tool schemas, …). Measured
 * in this process: the tool catalog holds whatever plugins are registered.
 */
async function calibrate(replay: Replay, env: Record<string, string> = {}) {
  const run = await runWith({ env: { CORVIDINHO_LLM_MODEL: `fake-model=${HUGE}`, ...env }, replay });
  expect(run.summaries).toHaveLength(0);
  const whole = promptChars(run.mains[0]);
  const conversation = taskWith(replay).length;
  return { whole, conversation, fixed: whole - conversation };
}

/** A window whose 80% lies `share` of the way into the conversation, past the rest of the prompt. */
function windowFor(cal: { fixed: number; conversation: number }, share = 0.6): number {
  return Math.ceil((cal.fixed + cal.conversation * share) / 4 / 0.8) + 1;
}

// ─── the window is per model, and the whole prompt counts ─────────────────

describe("each configured model has its own window; 80% counts the whole prompt (SESSION-5.a)", () => {
  test("`kind:model=TOKENS` sets the model's window and wins over CORVIDINHO_LLM_CONTEXT_TOKENS", async () => {
    const replay = replayOf(longTurns());
    const w = windowFor(await calibrate(replay));
    // A roomy window on the entry: nothing is condensed, whatever the fallback says.
    const roomy = await runWith({
      env: { CORVIDINHO_LLM_MODEL: `fake-model=${HUGE}`, CORVIDINHO_LLM_CONTEXT_TOKENS: String(w) },
      replay,
    });
    expect(roomy.summaries).toHaveLength(0);
    expect(roomy.reports).toHaveLength(0);
    expect(roomy.mains).toHaveLength(1);
    expect(userText(roomy.mains[0])).toContain(words("STEP1", 350));
    expect(roomy.mains[0]!.model).toBe("fake-model");

    // A small window on the entry: condensed, whatever the fallback says.
    const small = await runWith({
      env: { CORVIDINHO_LLM_MODEL: `fake-model=${w}`, CORVIDINHO_LLM_CONTEXT_TOKENS: HUGE },
      replay,
    });
    expect(small.summaries).toHaveLength(1);
    expect(small.reports).toHaveLength(1);
    expect(small.reports[0]).toMatchObject({ by: "model", model: "fake-model", windowTokens: w });
    // The window suffix is never part of the model id the provider gets.
    expect(small.mains[0]!.model).toBe("fake-model");
    expect(small.summaries[0]!.model).toBe("fake-model");
    expect(promptChars(small.mains[0])).toBeLessThan(condenseBudgetChars(w));
  });

  test("an entry with no window uses CORVIDINHO_LLM_CONTEXT_TOKENS, else 8192", async () => {
    const replay = replayOf(longTurns());
    const w = windowFor(await calibrate(replay));
    const fallback = await runWith({
      env: { CORVIDINHO_LLM_MODEL: "fake-model", CORVIDINHO_LLM_CONTEXT_TOKENS: String(w) },
      replay,
    });
    expect(fallback.reports[0]).toMatchObject({ by: "model", windowTokens: w });
    // A conversation alone past 80% of 8192 tokens: condensed against 8192.
    const big = replayOf(longTurns(40));
    expect(taskWith(big).length).toBeGreaterThan(condenseBudgetChars(8192));
    const byDefault = await runWith({ env: { CORVIDINHO_LLM_MODEL: "fake-model" }, replay: big });
    expect(byDefault.reports[0]).toMatchObject({ by: "model", windowTokens: 8192 });
  });

  test("the trigger counts the whole prompt — system prompt and tools too — not only the conversation", async () => {
    const replay = replayOf(longTurns());
    const cal = await calibrate(replay);
    const w = windowFor(cal);
    const budget = condenseBudgetChars(w);
    // The conversation and the new message alone are under 80% of the
    // window; with the system prompt and tool schemas the prompt is over it.
    expect(cal.conversation).toBeLessThan(budget);
    expect(cal.whole).toBeGreaterThanOrEqual(budget);

    const run = await runWith({ env: { CORVIDINHO_LLM_MODEL: `fake-model=${w}` }, replay });
    expect(run.reports).toHaveLength(1);
    expect(run.reports[0]!.folded.length).toBeGreaterThan(0);
    expect(promptChars(run.mains[0])).toBeLessThan(budget);
    // Above the whole prompt nothing is folded.
    const above = Math.ceil(cal.whole / 4 / 0.8) + 2;
    const none = await runWith({ env: { CORVIDINHO_LLM_MODEL: `fake-model=${above}` }, replay });
    expect(none.summaries).toHaveLength(0);
    expect(none.reports).toHaveLength(0);
  });

  test("the read tier (no tools) condenses the same way", async () => {
    const replay = replayOf(longTurns());
    const env = { CORVIDINHO_LLM_TIER: "read" };
    const w = windowFor(await calibrate(replay, env));
    const run = await runWith({ env: { ...env, CORVIDINHO_LLM_MODEL: `fake-model=${w}` }, replay });
    expect(run.summaries).toHaveLength(1);
    expect(run.mains).toHaveLength(1);
    expect(promptChars(run.mains[0])).toBeLessThan(condenseBudgetChars(w));
    expect(userText(run.mains[0])).toContain(`- Summary: ${MODEL_SUMMARY}`);
  });

  test("a window set on any entry naming the model (here the order) is that model's window", async () => {
    const replay = replayOf(longTurns());
    const w = windowFor(await calibrate(replay));
    const run = await runWith({
      env: {
        CORVIDINHO_LLM_MODEL: "fake-model",
        CORVIDINHO_LLM_MODEL_ORDER: `fake-model=${w}`,
        CORVIDINHO_LLM_CONTEXT_TOKENS: HUGE,
      },
      replay,
    });
    expect(run.reports).toHaveLength(1);
    expect(run.reports[0]).toMatchObject({ by: "model", model: "fake-model", windowTokens: w });
    expect(promptChars(run.mains[0])).toBeLessThan(condenseBudgetChars(w));
  });
});

// ─── a model writes the summary; the task and latest instruction stay ─────

describe("a model writes the summary; the task and the latest instruction stay word for word (SESSION-5.a)", () => {
  test("the summary in the prompt is the model's, and the folded turns are gone from it", async () => {
    const replay = replayOf(longTurns());
    const w = windowFor(await calibrate(replay));
    const run = await runWith({ env: { CORVIDINHO_LLM_MODEL: `fake-model=${w}` }, replay });
    const prompt = userText(run.mains[0]);
    expect(prompt).toContain(SUMMARY_LABEL);
    expect(prompt).toContain(`- Summary: ${MODEL_SUMMARY}`);
    expect(prompt).not.toContain(words("STEP1", 350));
    expect(prompt).not.toContain("- Human: STEP1:");
    expect(run.reports[0]!.summary).toBe(`- Summary: ${MODEL_SUMMARY}`);
    expect(texts(run.events).some((t) => t.includes("fake-model wrote the summary"))).toBe(true);
  });

  test("the task and the latest instruction stay in the prompt word for word and never go into the summary call", async () => {
    const replay = replayOf(longTurns());
    const w = windowFor(await calibrate(replay));
    const run = await runWith({ env: { CORVIDINHO_LLM_MODEL: `fake-model=${w}` }, replay });
    const prompt = userText(run.mains[0]);
    expect(prompt).toContain(`Human: ${OPENING}\n`);
    expect(prompt).toContain(`Human: ${LATEST}\n`);
    expect(prompt.includes(`${SESSION_THREAD_FOOTER}\n\n${NEW_MESSAGE}`)).toBe(true);
    const asked = userText(run.summaries[0]);
    expect(asked).toContain("Human: STEP1:");
    expect(asked).not.toContain(OPENING.slice(0, 60));
    expect(asked).not.toContain(LATEST.slice(0, 60));
    expect(asked).not.toContain(NEW_MESSAGE);
    // The folded indexes never name the task (0) or the latest instruction.
    const latestAt = replay.turns.findIndex((t) => t.content === LATEST);
    expect(run.reports[0]!.folded).not.toContain(0);
    expect(run.reports[0]!.folded).not.toContain(latestAt);
    expect(run.reports[0]!.folded[0]).toBe(1);
  });

  test("the summary prompt is bounded by the model's window; an earlier summary is folded into it", async () => {
    const replay = replayOf(longTurns(30), "- Human: EARLIER-POINT from before");
    const run = await runWith({ env: { CORVIDINHO_LLM_MODEL: "fake-model=2048" }, replay });
    const asked = userText(run.summaries[0]);
    expect(asked.length).toBeLessThanOrEqual((2048 * 4) / 2);
    expect(asked).toContain("EARLIER-POINT from before");
    expect(asked).toContain("earlier turn");
  });

  test("one summary call per run: a later attempt reuses the condensed task", async () => {
    const replay = replayOf(longTurns());
    const w = windowFor(await calibrate(replay));
    const run = await runWith({ env: { CORVIDINHO_LLM_MODEL: `fake-model=${w}` }, replay, attempts: 2 });
    expect(run.summaries).toHaveLength(1);
    expect(run.mains).toHaveLength(2);
    expect(run.reports).toHaveLength(1);
    expect(userText(run.mains[1])).toContain(`- Summary: ${MODEL_SUMMARY}`);
  });

  test("SAFE-12: a summary of untrusted text keeps its words inside an untrusted-data fence", async () => {
    const turns = longTurns();
    turns[2] = {
      role: "human",
      content: fenceUntrustedData(words("ISSUEBODY", 300), { source: "github:issue", header: "[untrusted GitHub text]" }),
    };
    const w = windowFor(await calibrate(replayOf(turns)));
    const run = await runWith({ env: { CORVIDINHO_LLM_MODEL: `fake-model=${w}` }, replay: replayOf(turns) });
    expect(run.reports[0]!.summary).toMatch(
      /^- Summary: <<<UNTRUSTED_DATA id=[0-9a-f]+ source=model-summary>>> MODEL-SUMMARY .* <<<END_UNTRUSTED_DATA id=[0-9a-f]+>>>$/,
    );
  });

  test("SAFE-12: in a non-owner's run the model's summary of their words is fenced; in the owner's it is not", async () => {
    const replay = replayOf(longTurns());
    const team = { CORVIDINHO_ACTING_IS_ADMIN: "0", CORVIDINHO_ACTING_ROLE: "team" };
    const wTeam = windowFor(await calibrate(replay, team));
    const theirs = await runWith({ env: { ...team, CORVIDINHO_LLM_MODEL: `fake-model=${wTeam}` }, replay });
    expect(theirs.reports[0]!.summary).toMatch(
      /^- Summary: <<<UNTRUSTED_DATA id=[0-9a-f]+ source=model-summary>>> MODEL-SUMMARY .* <<<END_UNTRUSTED_DATA id=[0-9a-f]+>>>$/,
    );
    expect(promptChars(theirs.mains[0])).toBeLessThan(condenseBudgetChars(wTeam));

    const owner = { CORVIDINHO_ACTING_IS_ADMIN: "1", CORVIDINHO_ACTING_ROLE: "owner" };
    const wOwner = windowFor(await calibrate(replay, owner));
    const mine = await runWith({ env: { ...owner, CORVIDINHO_LLM_MODEL: `fake-model=${wOwner}` }, replay });
    expect(mine.reports[0]!.summary).toBe(`- Summary: ${MODEL_SUMMARY}`);
  });
});

// ─── a failed summary call falls back, and says so ────────────────────────

describe("a failed summary call falls back to the extractive summary and says so (SESSION-5.a)", () => {
  test("HTTP 500 on the summary call: extractive points, an operator line, and no failover for the answer", async () => {
    const replay = replayOf(longTurns());
    const w = windowFor(await calibrate(replay));
    const run = await runWith({
      env: { CORVIDINHO_LLM_MODEL: `fake-model=${w},other-model` },
      replay,
      summary: () => ({ httpStatus: 500, body: "{\"error\":\"boom\"}" }),
    });
    expect(run.summaries).toHaveLength(1);
    expect(run.reports[0]).toMatchObject({ by: "extractive", reason: "HTTP 500", model: "fake-model" });
    const prompt = userText(run.mains[0]);
    expect(prompt).toContain(SUMMARY_LABEL);
    expect(prompt).toContain("- Human: STEP1:");
    expect(prompt).toContain(`Human: ${OPENING}\n`);
    expect(prompt).toContain(`Human: ${LATEST}\n`);
    expect(
      texts(run.events).some((t) => t.includes("fake-model did not write the summary (HTTP 500)") && t.includes("extractive")),
    ).toBe(true);
    // The summary call never fails over; the answer still comes from the head model.
    expect(run.mains[0]!.model).toBe("fake-model");
    expect(run.results[0]!.summary).toContain("Answer about the cron parser.");
  });

  test("an empty reply falls back the same way", async () => {
    const w = windowFor(await calibrate(replayOf(longTurns())));
    const run = await runWith({
      env: { CORVIDINHO_LLM_MODEL: `fake-model=${w}` },
      replay: replayOf(longTurns()),
      summary: () => "   ",
    });
    expect(run.reports[0]).toMatchObject({ by: "extractive", reason: "empty reply" });
    expect(userText(run.mains[0])).toContain("- Human: STEP1:");
  });
});

// ─── the summary call counts toward the spend caps ────────────────────────

describe("the summary call counts toward the spend caps (AUTONOMY-8 / SAFE-8)", () => {
  function capEnv(dir: string, cap: string, window: number): Record<string, string> {
    return {
      CORVIDINHO_LLM_API_KEY: "test-key",
      CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
      CORVIDINHO_LLM_MODEL: `gpt-4o-mini=${window}`,
      CORVIDINHO_DATA_DIR: dir,
      CORVIDINHO_DAILY_SPEND_CAP_USD: cap,
    };
  }

  test("under the cap: the summary call and the answer are both in the spend ledger", async () => {
    const dir = tmp("corvidinho-condense-spend-");
    const env = capEnv(dir, "5", windowFor(await calibrate(replayOf(longTurns()))));
    const run = await runWith({ env, replay: replayOf(longTurns()) });
    expect(run.summaries).toHaveLength(1);
    expect(run.mains).toHaveLength(1);
    const db = openCorvidinhoDb({ env });
    try {
      const rows = db.query("SELECT model FROM spend_ledger").all() as Array<{ model: string }>;
      expect(rows.map((r) => r.model)).toEqual(["gpt-4o-mini", "gpt-4o-mini"]);
    } finally {
      db.close();
    }
  });

  test("at the cap: the summary call is stopped before it is sent and the run ends with the spend-cap ask", async () => {
    const dir = tmp("corvidinho-condense-cap-");
    const w = windowFor(await calibrate(replayOf(longTurns())));
    const run = await runWith({ env: capEnv(dir, "0", w), replay: replayOf(longTurns()) });
    expect(run.bodies).toHaveLength(0);
    expect(run.reports).toHaveLength(0);
    expect(run.results[0]!.ask?.reason).toBe("spend-cap");
  });
});

// ─── the task and conversation go on stdin ────────────────────────────────

describe("task run --task-stdin: no argument-size ceiling below the window (SESSION-5.a, REQ-cli-473)", () => {
  const fake = startFakeLlm({
    reply: (body) => (isSummaryCall(body) ? MODEL_SUMMARY : "Answer about the cron parser."),
  });
  afterAll(() => fake.stop());

  async function runCli(payload: string, model: string): Promise<{ code: number; result: TaskResult | null; stderr: string }> {
    const cwd = tmp("corvidinho-condense-cli-");
    const proc = Bun.spawn(["bun", CLI, "task", "run", "--here", "--task-stdin", "--output", "ndjson"], {
      cwd,
      stdin: new Blob([payload]),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        ...fake.env,
        CORVIDINHO_LLM_MODEL: model,
        CORVIDINHO_NON_INTERACTIVE: "1",
        CORVIDINHO_DATA_DIR: cwd,
      },
    });
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    let result: TaskResult | null = null;
    for (const line of out.split("\n")) {
      try {
        const f = JSON.parse(line) as { type?: string; result?: TaskResult };
        if (f.type === "result" && f.result) result = f.result;
      } catch {
        /* not a frame */
      }
    }
    return { code, result, stderr: err };
  }

  test(
    "a conversation over the 128 KiB argument limit reaches the model whole when the window holds it",
    async () => {
      const turns: Turn[] = [{ role: "human", content: OPENING }];
      for (let n = 1; n <= 30; n += 1) {
        turns.push({ role: "human", content: words(`BIG${n}`, 7000) });
        turns.push({ role: "agent", content: words(`R${n}`, 1400) });
      }
      turns.push({ role: "human", content: "LAST-HUMAN-TURN keep going" });
      const replay = replayOf(turns);
      const task = taskWith(replay);
      expect(Buffer.byteLength(task)).toBeGreaterThan(128 * 1024);
      const before = fake.requests.length;
      const out = await runCli(JSON.stringify({ task, conversation: replay }), "ollama:fake-model=400000");
      expect(out.code).toBe(0);
      const sent = fake.requests.slice(before);
      expect(sent.filter(isSummaryCall)).toHaveLength(0);
      const prompt = userText(sent[0]);
      expect(prompt).toContain(words("BIG1", 7000));
      expect(prompt).toContain("LAST-HUMAN-TURN keep going");
      expect(out.result?.conversation).toBeUndefined();
    },
    SPAWN_TIMEOUT_MS,
  );

  test(
    "at 80% of the model's window the run condenses, the model writes the summary and the result reports it",
    async () => {
      const replay = replayOf(longTurns());
      const before = fake.requests.length;
      const out = await runCli(
        JSON.stringify({ task: taskWith(replay), conversation: replay }),
        "ollama:fake-model=5000",
      );
      expect(out.code).toBe(0);
      const sent = fake.requests.slice(before);
      expect(sent.filter(isSummaryCall)).toHaveLength(1);
      const report = out.result?.conversation as Report | undefined;
      expect(report).toMatchObject({ by: "model", model: "ollama:fake-model", windowTokens: 5000 });
      expect(report?.summary).toBe(`- Summary: ${MODEL_SUMMARY}`);
      const main = sent.find((b) => !isSummaryCall(b));
      expect(userText(main)).toContain(`Human: ${OPENING}\n`);
      expect(userText(main)).toContain(`Human: ${LATEST}\n`);
    },
    SPAWN_TIMEOUT_MS,
  );

  test(
    "--task and --task-stdin together, or a payload that is not one, are refused before anything runs",
    async () => {
      const before = fake.requests.length;
      const both = Bun.spawn(["bun", CLI, "task", "run", "--here", "--task", "x", "--task-stdin"], {
        cwd: tmp(),
        stdin: new Blob(["{}"]),
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, ...fake.env },
      });
      expect(await both.exited).not.toBe(0);
      const bad = await runCli("not json", "ollama:fake-model");
      expect(bad.code).not.toBe(0);
      expect(fake.requests.length).toBe(before);
    },
    SPAWN_TIMEOUT_MS,
  );
});

// ─── the bridges send it on stdin and read the report back ────────────────

describe("the Discord and WATCH spawn clients send a replayed conversation on stdin (SESSION-5.a)", () => {
  /** A fake bin that records its argv and stdin and prints one result frame. */
  function fakeBin(result: TaskResult): { bin: string; dir: string } {
    const dir = tmp("corvidinho-condense-bin-");
    const bin = join(dir, "corvidinho");
    writeFileSync(
      bin,
      `#!/bin/sh\nprintf '%s\\n' "$@" > "${dir}/argv.txt"\ncat > "${dir}/stdin.txt"\n` +
        `cat <<'NDJSON_EOF'\n${serializeFrame(resultFrame(result))}\nNDJSON_EOF\n`,
      { mode: 0o755 },
    );
    chmodSync(bin, 0o755);
    return { bin, dir };
  }

  const replay = replayOf(longTurns(2));
  const latestAt = replay.turns.findIndex((t) => t.content === LATEST);
  const RESULT: TaskResult = {
    summary: "Answered.",
    filesChanged: [],
    verified: false,
    verifySkipped: true,
    cancelled: false,
    state: "done",
    attempts: 1,
    conversation: {
      summary: "- Summary: folded with ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA inside",
      // 0 (the task) and the latest instruction are pinned; 99 is outside the replay.
      folded: [3, 1, 0, latestAt, 99, 1],
      by: "model",
      model: "fake-model",
      windowTokens: 5000,
    },
  } as TaskResult;

  for (const [name, make] of [
    ["Discord", (bin: string, dir: string) => createDiscordClient({ bin, cwd: dir })],
    ["WATCH", (bin: string, dir: string) => createWatchClient({ bin, cwd: dir })],
  ] as const) {
    test(`${name}: --task-stdin, the task and conversation as JSON on stdin, the report checked against the replay`, async () => {
      const { bin, dir } = fakeBin(RESULT);
      const client = make(bin, dir);
      const prompt = taskWith(replay);
      const res = await client.runChat({
        prompt,
        sessionId: "sess-condense",
        conversation: replay,
      } as Parameters<typeof client.runChat>[0]);
      const argv = readFileSync(join(dir, "argv.txt"), "utf8").trim().split("\n");
      expect(argv).toContain("--task-stdin");
      expect(argv).not.toContain("--task");
      expect(argv.join("\n")).not.toContain(OPENING);
      const sent = JSON.parse(readFileSync(join(dir, "stdin.txt"), "utf8"));
      expect(sent.task).toBe(prompt);
      expect(sent.conversation).toEqual(replay);
      const report = (res as { conversation?: Report }).conversation;
      expect(report?.folded).toEqual([1, 3]);
      expect(report?.summary).not.toContain("ghp_");
      expect(report?.summary).toContain("[redacted:github-token]");
    });

    test(`${name}: with no conversation the task still goes as --task and no report is read`, async () => {
      const { bin, dir } = fakeBin(RESULT);
      const client = make(bin, dir);
      const res = await client.runChat({ prompt: "hello", sessionId: "sess-plain" });
      const argv = readFileSync(join(dir, "argv.txt"), "utf8").trim().split("\n");
      expect(argv).toContain("--task");
      expect(argv).toContain("hello");
      expect(argv).not.toContain("--task-stdin");
      expect((res as { conversation?: Report }).conversation).toBeUndefined();
    });
  }
});
