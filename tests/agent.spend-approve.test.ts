/**
 * SAFE-8 / SAFE-8.a / SAFE-15 / SAFE-19 / SAFE-20 / AUTONOMY-8 (#98,
 * REQ-agent-198) — at a spend cap the run asks the owner on a `spend`
 * Approve card instead of refusing: the paused call waits for the card, and
 * Approve plus the one-time code (recorded by the bridge's card engine as
 * `approved`) lets exactly that call through at the amount the card showed;
 * the next call past the cap raises a new card. Deny, no answer, a stop or no
 * owner is a no: nothing is sent and nothing is spent. One card at a time per
 * run; another run's open card never refuses this one.
 *
 * Mocked fetch (the fake LLM), in-memory or temp-dir SQLite, a fixed owner
 * in the run's env; the card is decided in the store as the engine would
 * (tests/discord.spend-card.test.ts drives the real engine). No network.
 */
import type { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalStore, type ApprovalRequest } from "../src/approvals/store.ts";
import { COUNCIL_VOICE_TIMEOUT_MS } from "../src/autonomous/council.ts";
import {
  CORVIDINHO_PROTOCOL_VERSION,
  MUST_ASK_WAIT_STATUS,
  progressFromFrame,
} from "../src/agent/events-ndjson.ts";
import { createTaskExecute, extractUsage, LLM_REQUEST_TIMEOUT_MS } from "../src/agent/execute.ts";
import { runTask } from "../src/agent/loop.ts";
import {
  createSpendGuard,
  estimateCallMicroUsd,
  formatUsd,
  priceForModel,
  PROVIDER_SPEND_CAPS_ENV,
  setSpendCardTestHooks,
  SPEND_CAP_ENV,
  SPEND_CARD_TTL_MS,
  SpendCapRefusal,
  SpendLedger,
  withSpendCap,
  type SpendFetch,
} from "../src/agent/spend.ts";
import { SPEND_CAP_SUMMARY } from "../src/agent/spend-notice.ts";
import type { AgentEvent } from "../src/agent/types.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const NOW = 1_800_000_000_000;
const OWNER = "181969874455756800";
const HOST = "llm.test";
const URL_ = `https://${HOST}/v1/chat/completions`;
const NO_REPLY = "Replying can't lift the cap";

afterEach(() => {
  setSpendCardTestHooks({});
});

function mockFetch(): { fetch: SpendFetch; bodies: string[] } {
  const bodies: string[] = [];
  const fetch: SpendFetch = async (_input, init) => {
    bodies.push(String(init?.body ?? ""));
    return Response.json({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
    });
  };
  return { fetch, bodies };
}

function chatInit(model = "gpt-4o", content = "hello", signal?: AbortSignal): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify({ model, messages: [{ role: "user", content }] }),
    ...(signal ? { signal } : {}),
  };
}

function estimateOf(init: RequestInit, model = "gpt-4o"): number {
  return estimateCallMicroUsd(priceForModel(model)!, Buffer.byteLength(String(init.body), "utf8"));
}

/** A $1.00 total cap with $0.9990 already spent: any gpt-4o call passes it. */
function nearCap(db: Database): void {
  const r = new SpendLedger(db).reserve({
    provider: HOST,
    model: "gpt-4o",
    estimateMicroUsd: 999_000,
    capMicroUsd: 1_000_000,
    now: NOW - 1000,
  });
  expect(r.ok).toBe(true);
}

type Answer = "approved" | "denied" | "none";

/** Decide each spend card as it is recorded (as the engine would after Approve + code, or Deny). */
function answer(a: Answer | ((req: ApprovalRequest) => Answer), opts: { ttlMs?: number } = {}): ApprovalRequest[] {
  const requests: ApprovalRequest[] = [];
  setSpendCardTestHooks({
    ttlMs: opts.ttlMs ?? 2_000,
    pollMs: 5,
    onRequest: (req, db) => {
      requests.push(req);
      const d = typeof a === "function" ? a(req) : a;
      if (d !== "none") new ApprovalStore({ db }).decide(req.id, d, { by: OWNER });
    },
  });
  return requests;
}

function guard(db: Database, opts: { env?: Record<string, string>; notes?: string[]; fetch?: SpendFetch } = {}) {
  const m = mockFetch();
  const g = createSpendGuard(opts.fetch ?? m.fetch, {
    env: { [SPEND_CAP_ENV]: "1", CORVIDINHO_OWNER_DISCORD_ID: OWNER, ...opts.env },
    readUsage: extractUsage,
    db,
    now: () => NOW,
    approval: {
      taskText: "tidy the README",
      project: () => "corvidlabs/corvidinho",
      onNote: (line) => opts.notes?.push(line),
    },
  });
  return { g, bodies: m.bodies };
}

async function refusal(p: Promise<unknown>): Promise<SpendCapRefusal> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(SpendCapRefusal);
    return e as SpendCapRefusal;
  }
  throw new Error("the call was sent");
}

function requests(db: Database): ApprovalRequest[] {
  const store = new ApprovalStore({ db });
  return (db.query("SELECT id FROM approval_requests ORDER BY created_at, rowid").all() as { id: string }[]).map(
    (r) => store.get(r.id)!,
  );
}

function ledger(db: Database) {
  return db.query("SELECT status, estimate_micro_usd AS estimate FROM spend_ledger ORDER BY ts, rowid").all() as {
    status: string;
    estimate: number;
  }[];
}

describe("at 100% the owner's spend card holds the call (SAFE-8, AUTONOMY-8)", () => {
  test("Approve + code: exactly the paused call goes out, recorded at the amount the card showed; the card shows action, target and amount (money: code)", async () => {
    const db = openCorvidinhoDb({ memory: true });
    nearCap(db);
    const notes: string[] = [];
    const { g, bodies } = guard(db, { notes });
    const asked = answer("approved");
    const init = chatInit();
    const resp = await g.fetch(URL_, init);
    expect(resp.ok).toBe(true);
    expect(bodies).toHaveLength(1);
    expect(asked).toHaveLength(1);
    const req = requests(db)[0]!;
    expect(req.kind).toBe("spend");
    expect(req.class).toBe("money");
    expect(req.status).toBe("used");
    expect(req.action).toBe(`send one model call to gpt-4o via ${HOST}`);
    expect(req.target).toBe("total");
    const estimate = estimateOf(init);
    expect(req.amount).toBe(`~${formatUsd(estimate)} (this one call's estimate)`);
    expect(req.title).toBe("Spend past a cap — asks first (SAFE-8) · from cli");
    expect(req.requester).toBe("local");
    expect(req.waiter).toStartWith(`${process.pid}:`);
    expect(req.text).toContain("Asked by local on cli, project corvidlabs/corvidinho.");
    expect(req.text).toContain("24h spend when it paused: total $0.9990 of $1.00.");
    expect(req.text).toContain("Task:\ntidy the README");
    expect(req.expiresAt - req.createdAt).toBe(2_000);
    // Recorded once, at the estimate the card showed, then settled to usage.
    const rows = ledger(db);
    expect(rows).toHaveLength(2);
    expect(rows[1]!.estimate).toBe(estimate);
    expect(rows[1]!.status).toBe("actual");
    // The wait line is the one the live status shows; then the outcome.
    const wait = notes.find((n) => n.includes("waiting for the owner's OK"))!;
    expect(wait).toStartWith("[operator] AUTONOMY-8: waiting for the owner's OK on an Approve card with the one-time code");
    expect(wait).toContain(`request ${req.id}`);
    expect(wait).toContain("with no bridge running it lapses");
    expect(wait).not.toMatch(/\$\d/);
    expect(progressFromFrame({ protocol: CORVIDINHO_PROTOCOL_VERSION, type: "Text", text: wait })).toEqual({
      message: MUST_ASK_WAIT_STATUS,
    });
    expect(notes.some((n) => n.includes(`the owner approved request ${req.id}; sending that one call`))).toBe(true);
    // Nothing left for the attempt: the call went out.
    expect(g.finish({ summary: "done", filesChanged: [] })).toEqual({ summary: "done", filesChanged: [] });
  });

  test("SAFE-8.a: one Approve lets one call through; the next call past the cap raises a new card and code", async () => {
    const db = openCorvidinhoDb({ memory: true });
    nearCap(db);
    const { g, bodies } = guard(db);
    const asked = answer("approved");
    await g.fetch(URL_, chatInit("gpt-4o", "first"));
    // The second paused call gets its own card: this one the owner denies.
    answer("denied");
    const r = await refusal(g.fetch(URL_, chatInit("gpt-4o", "second")));
    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0]!).messages[0].content).toBe("first");
    expect(asked).toHaveLength(1);
    const all = requests(db);
    expect(all.map((x) => x.status)).toEqual(["used", "denied"]);
    expect(all[0]!.id).not.toBe(all[1]!.id);
    // The denied call left no ledger row.
    expect(ledger(db)).toHaveLength(2);
    expect(r.ask.question).toContain(`The owner denied Approve card ${all[1]!.id}`);
  });

  test("Deny: nothing is sent or spent; the run is blocked on a spend-cap ask with the generic summary; the ask says so, with both ways on and no reply note", async () => {
    const db = openCorvidinhoDb({ memory: true });
    nearCap(db);
    const { g, bodies } = guard(db);
    answer("denied");
    const r = await refusal(g.fetch(URL_, chatInit()));
    expect(bodies).toEqual([]);
    expect(ledger(db)).toHaveLength(1);
    const req = requests(db)[0]!;
    expect(req.status).toBe("denied");
    const q = r.ask.question;
    expect(r.ask.reason).toBe("spend-cap");
    expect(r.ask.spendScopes).toEqual(["total"]);
    expect(q).toStartWith("Daily spend cap reached (SAFE-8): $0.9990 spent in the last 24h (99% of the $1.00 cap)");
    expect(q).toContain("so I held it and asked the owner on a spend Approve card to let that one call through (SAFE-8.a)");
    expect(q).toContain(`The owner denied Approve card ${req.id}, so the call was not sent and nothing was spent (SAFE-20).`);
    expect(q).toContain("Stopped at cap: total.");
    expect(q).toContain("ask again — the next call past the cap raises a new card and code");
    expect(q).toContain(`the operator raises ${SPEND_CAP_ENV}`);
    expect(q).not.toContain(NO_REPLY);
    expect(q).not.toContain("?");
    const finished = g.finish({ summary: "LLM request failed", filesChanged: ["a.ts"], error: true });
    expect(finished).toEqual({ summary: SPEND_CAP_SUMMARY, filesChanged: ["a.ts"], ask: r.ask });
  });

  test("no answer in time is a no (SAFE-20): the card closes expired and nothing is spent", async () => {
    const db = openCorvidinhoDb({ memory: true });
    nearCap(db);
    const { g, bodies } = guard(db);
    answer("none", { ttlMs: 40 });
    const r = await refusal(g.fetch(URL_, chatInit()));
    expect(bodies).toEqual([]);
    expect(requests(db)[0]!.status).toBe("expired");
    expect(ledger(db)).toHaveLength(1);
    expect(r.ask.question).toContain("No answer on Approve card");
    expect(r.ask.question).toContain("with no bridge running it lapses");
  });

  test("an approval that lands after the card expired does not count (a late answer is a no)", async () => {
    const db = openCorvidinhoDb({ memory: true });
    nearCap(db);
    const { g, bodies } = guard(db);
    const asked = answer("none", { ttlMs: 30 });
    const r = refusal(g.fetch(URL_, chatInit()));
    await Bun.sleep(80);
    // Too late: the waiting run already closed it.
    expect(new ApprovalStore({ db }).decide(asked[0]!.id, "approved", { by: OWNER })).toBe(false);
    await r;
    expect(bodies).toEqual([]);
  });

  test("the call's abort signal ends the wait: the card closes as a no and nothing is sent", async () => {
    const db = openCorvidinhoDb({ memory: true });
    nearCap(db);
    const { g, bodies } = guard(db);
    answer("none", { ttlMs: 60_000 });
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 30);
    const started = Date.now();
    const r = await refusal(g.fetch(URL_, chatInit("gpt-4o", "hello", abort.signal)));
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(bodies).toEqual([]);
    expect(requests(db)[0]!.status).toBe("expired");
    expect(r.ask.question).toContain("was cut short (the run was stopped or its request timed out)");
  });

  test("a stop that lands as the owner approves wins: nothing is sent and the approval is left unused", async () => {
    const db = openCorvidinhoDb({ memory: true });
    nearCap(db);
    const { g, bodies } = guard(db);
    const abort = new AbortController();
    answer(() => {
      abort.abort();
      return "approved";
    });
    await refusal(g.fetch(URL_, chatInit("gpt-4o", "hello", abort.signal)));
    expect(bodies).toEqual([]);
    expect(requests(db)[0]!.status).toBe("approved");
  });

  test("with no owner configured nobody can approve: the operator-action ask at once, no card", async () => {
    const db = openCorvidinhoDb({ memory: true });
    nearCap(db);
    const { g, bodies } = guard(db, { env: { CORVIDINHO_OWNER_DISCORD_ID: "" } });
    answer("approved", { ttlMs: 60_000 });
    const started = Date.now();
    const r = await refusal(g.fetch(URL_, chatInit()));
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(bodies).toEqual([]);
    expect(requests(db)).toEqual([]);
    expect(r.ask.question).toContain("so I stopped before sending it");
    expect(r.ask.question).toEndWith("Replying can't lift the cap — this needs the operator.");
  });

  test("a guard without the approval hook (withSpendCap) keeps the plain stop, owner or not", async () => {
    const db = openCorvidinhoDb({ memory: true });
    nearCap(db);
    const { fetch, bodies } = mockFetch();
    answer("approved");
    const capped = withSpendCap(fetch, {
      env: { [SPEND_CAP_ENV]: "1", CORVIDINHO_OWNER_DISCORD_ID: OWNER },
      readUsage: extractUsage,
      db,
      now: () => NOW,
    });
    await refusal(capped(URL_, chatInit()));
    expect(bodies).toEqual([]);
    expect(requests(db)).toEqual([]);
  });

  test("an unpriced model under a cap never raises a card (no price to approve)", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const { g, bodies } = guard(db);
    answer("approved");
    const r = await refusal(g.fetch(URL_, chatInit("some-unpriced-model")));
    expect(bodies).toEqual([]);
    expect(requests(db)).toEqual([]);
    expect(r.ask.question).toContain("has no known price");
  });

  test("SAFE-15: a provider cap's card targets provider:<id>; a call past both caps targets both", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const env = {
      CORVIDINHO_LLM_MODEL: "gpt-4o",
      CORVIDINHO_LLM_BASE_URL: `https://${HOST}/v1`,
      [PROVIDER_SPEND_CAPS_ENV]: `${HOST}=0`,
    };
    const one = guard(db, { env: { ...env, [SPEND_CAP_ENV]: "" } });
    const asked = answer("denied");
    const r = await refusal(one.g.fetch(URL_, chatInit()));
    expect(asked[0]!.target).toBe(`provider:${HOST}`);
    expect(r.ask.spendScopes).toEqual([`provider:${HOST}`]);
    expect(r.ask.question).toContain(`Stopped at cap: provider:${HOST}.`);
    const both = guard(db, { env: { ...env, [SPEND_CAP_ENV]: "0" } });
    await refusal(both.g.fetch(URL_, chatInit()));
    expect(asked[1]!.target).toBe(`total, provider:${HOST}`);
    expect(asked[1]!.text).toContain(`24h spend when it paused: total $0.00 of $0.00; provider:${HOST} $0.00 of $0.00.`);
  });
});

describe("several paused calls: one card each, at most one open per run, none refused", () => {
  async function waitFor(cond: () => boolean): Promise<void> {
    for (let i = 0; i < 400 && !cond(); i++) await Bun.sleep(5);
    expect(cond()).toBe(true);
  }

  test("a run's second paused call waits for its first card, then gets its own", async () => {
    const db = openCorvidinhoDb({ memory: true });
    nearCap(db);
    const { g, bodies } = guard(db);
    const asked = answer("none", { ttlMs: 10_000 });
    const first = g.fetch(URL_, chatInit("gpt-4o", "first"));
    const second = g.fetch(URL_, chatInit("gpt-4o", "second")).catch((e) => e);
    await waitFor(() => asked.length === 1);
    await Bun.sleep(50);
    // Still one open card for this run.
    expect(requests(db).filter((r) => r.status === "pending")).toHaveLength(1);
    new ApprovalStore({ db }).decide(asked[0]!.id, "approved", { by: OWNER });
    await first;
    await waitFor(() => asked.length === 2);
    new ApprovalStore({ db }).decide(asked[1]!.id, "denied", { by: OWNER });
    expect(await second).toBeInstanceOf(SpendCapRefusal);
    expect(bodies.map((b) => JSON.parse(b).messages[0].content)).toEqual(["first"]);
    expect(requests(db).map((r) => r.status)).toEqual(["used", "denied"]);
  });

  test("another run's open card does not refuse this one: two runs paused at once each get a card", async () => {
    const db = openCorvidinhoDb({ memory: true });
    nearCap(db);
    const a = guard(db);
    const b = guard(db);
    const asked = answer("none", { ttlMs: 10_000 });
    const pa = a.g.fetch(URL_, chatInit("gpt-4o", "run a"));
    const pb = b.g.fetch(URL_, chatInit("gpt-4o", "run b"));
    await waitFor(() => asked.length === 2);
    expect(requests(db).map((r) => r.status)).toEqual(["pending", "pending"]);
    for (const req of asked) new ApprovalStore({ db }).decide(req.id, "approved", { by: OWNER });
    await Promise.all([pa, pb]);
    expect(a.bodies).toHaveLength(1);
    expect(b.bodies).toHaveLength(1);
    expect(requests(db).map((r) => r.status)).toEqual(["used", "used"]);
  });
});

describe("SpendLedger.reserveApproved (SAFE-8.a)", () => {
  test("records exactly the approved amount past the cap, names the caps it still passes, and refuses a bigger estimate", () => {
    const db = openCorvidinhoDb({ memory: true });
    nearCap(db);
    const l = new SpendLedger(db);
    const base = { provider: HOST, model: "gpt-4o", capMicroUsd: 1_000_000, now: NOW };
    expect(l.reserve({ ...base, estimateMicroUsd: 5_000 }).ok).toBe(false);
    const passed = l.reserveApproved({ ...base, estimateMicroUsd: 5_000, approvedMicroUsd: 5_000 });
    expect(passed).toMatchObject({ ok: true, spentMicroUsd: 999_000, trips: [{ scope: "total", spentMicroUsd: 999_000, capMicroUsd: 1_000_000 }] });
    expect(l.reserveApproved({ ...base, estimateMicroUsd: 5_001, approvedMicroUsd: 5_000 })).toEqual({ ok: false });
    expect(ledger(db).map((r) => r.estimate)).toEqual([999_000, 5_000]);
    // A call that fits again is recorded the same way, with nothing tripped.
    const fits = l.reserveApproved({ ...base, capMicroUsd: 10_000_000, estimateMicroUsd: 1, approvedMicroUsd: 1 });
    expect(fits).toMatchObject({ ok: true, trips: [] });
  });

  test("the card lapses before anything that wraps a waiting call gives up", () => {
    expect(SPEND_CARD_TTL_MS).toBeLessThan(COUNCIL_VOICE_TIMEOUT_MS);
    expect(SPEND_CARD_TTL_MS).toBeLessThan(LLM_REQUEST_TIMEOUT_MS);
  });
});

describe("createTaskExecute: a run asks on the card and says it is waiting", () => {
  function capEnv(dir: string, extra: Record<string, string> = {}) {
    return {
      CORVIDINHO_LLM_API_KEY: "test-key",
      CORVIDINHO_LLM_BASE_URL: `https://${HOST}/v1`,
      CORVIDINHO_LLM_MODEL: "gpt-4o-mini",
      CORVIDINHO_LLM_TIER: "read",
      CORVIDINHO_DATA_DIR: dir,
      CORVIDINHO_OWNER_DISCORD_ID: OWNER,
      [SPEND_CAP_ENV]: "0",
      ...extra,
    };
  }

  test("approved: the run's one call goes out past a $0 cap; the wait and the outcome are Text events; the card shows the task", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-approve-"));
    try {
      const { fetch, bodies } = mockFetch();
      const events: AgentEvent[] = [];
      const asked = answer("approved");
      const r = await createTaskExecute({
        taskText: "summarise the changelog",
        cwd: dir,
        env: capEnv(dir),
        fetchImpl: fetch,
        loadPlugins: false,
        projectInstructions: false,
        onEvent: (e) => events.push(e),
      })({ attempt: 1, signal: new AbortController().signal });
      expect(r.summary).toBe("ok");
      expect(r.ask).toBeUndefined();
      expect(bodies).toHaveLength(1);
      expect(asked).toHaveLength(1);
      expect(asked[0]!.text).toContain("Task:\nsummarise the changelog");
      // The project is a label, never a host path.
      expect(asked[0]!.text).not.toContain(dir);
      const texts = events.filter((e) => e.type === "Text").map((e) => (e as { text: string }).text);
      expect(texts.some((t) => t.startsWith("[operator] AUTONOMY-8: waiting for the owner's OK on an Approve card"))).toBe(true);
      expect(texts.some((t) => t.includes(`the owner approved request ${asked[0]!.id}`))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("denied: the run ends blocked with the spend-cap ask; verify does not run; no provider call", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-approve-"));
    try {
      const { fetch, bodies } = mockFetch();
      answer("denied");
      let verifyRan = false;
      const result = await runTask({
        cwd: dir,
        execute: createTaskExecute({
          taskText: "do a thing",
          cwd: dir,
          env: capEnv(dir),
          fetchImpl: fetch,
          loadPlugins: false,
          projectInstructions: false,
        }),
        verifyRunner: async () => {
          verifyRan = true;
          return { success: true, output: "" };
        },
      });
      expect(bodies).toEqual([]);
      expect(verifyRan).toBe(false);
      expect(result.state).toBe("blocked");
      expect(result.summary).toBe(SPEND_CAP_SUMMARY);
      expect(result.ask?.reason).toBe("spend-cap");
      expect(result.ask?.question).toContain("The owner denied Approve card");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a card wait cut short by the request timeout is a cap stop, never a model failure: the next configured model is not tried", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-approve-"));
    try {
      const hosts: string[] = [];
      const fetch: SpendFetch = async (input) => {
        hosts.push(new URL(String(input)).host);
        return Response.json({ choices: [{ message: { content: "ok" } }] });
      };
      const events: AgentEvent[] = [];
      answer("none", { ttlMs: 10_000 });
      const r = await createTaskExecute({
        taskText: "do a thing",
        cwd: dir,
        env: {
          ...capEnv(dir),
          CORVIDINHO_LLM_BASE_URL: "",
          CORVIDINHO_LLM_MODEL: "openai:gpt-4o-mini,anthropic:claude-haiku-4-5",
          ANTHROPIC_API_KEY: "test-key",
        },
        fetchImpl: fetch,
        loadPlugins: false,
        projectInstructions: false,
        llmTimeoutMs: 50,
        onEvent: (e) => events.push(e),
      })({ attempt: 1, signal: new AbortController().signal });
      expect(hosts).toEqual([]);
      expect(r.ask?.reason).toBe("spend-cap");
      expect(r.ask?.question).toContain("was cut short");
      const texts = events.filter((e) => e.type === "Text").map((e) => (e as { text: string }).text);
      expect(texts.some((t) => t.includes("falling back to"))).toBe(false);
      expect(r.summary).not.toContain("(model fallback: ");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
