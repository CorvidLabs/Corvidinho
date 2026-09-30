/**
 * SAFE-16 / SAFE-16.a (#98, REQ-agent-199) — a call whose price is unknown
 * stops and asks on a card that shows the amount as unknown when a cap covers
 * it; with no cap covering it, it just runs; there is no price override.
 *
 * - Under a cap (the total, its provider's, or both) an unpriced model's call
 *   waits for the owner's `spend` card (class money): the amount reads
 *   "unknown", never $0, and the target names every covering cap. Approve
 *   plus the one-time code lets exactly that call through, recorded
 *   `unknown` in the ledger (the window counts `unknownCalls`, the priced
 *   spend is unchanged); the next such call asks again. Deny, a lapse or a
 *   stop sends and records nothing and the run stops with the unpriced ask,
 *   naming the card, without the reply note.
 * - No cap covering it: it runs, unrecorded, with no card. No owner or no
 *   card path: the operator ask at once, as before.
 * - Owner lines read "$X + unknown" (doctor, /status, the 80% warning and
 *   its DM, the stop ask and the card); anyone else still sees only "Work is
 *   paused for budget.".
 *
 * Mocked fetch (the fake LLM), in-memory or temp-dir SQLite, the card decided
 * in the store as the engine would, and the real engine with recording DMs
 * for the Discord side. No network.
 */
import type { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskExecute, extractUsage } from "../src/agent/execute.ts";
import { runTask } from "../src/agent/loop.ts";
import {
  createSpendGuard,
  isUnknownSpendAmount,
  MODEL_PRICES_USD_PER_MTOK,
  PROVIDER_SPEND_CAPS_ENV,
  readSpendSnapshot,
  setSpendCardTestHooks,
  SPEND_CAP_ENV,
  SpendCapRefusal,
  spendCardFields,
  spendDoctorChecks,
  SpendLedger,
  withSpendCap,
  type SpendFetch,
} from "../src/agent/spend.ts";
import {
  formatSpend,
  formatSpendPublicStatusLine,
  formatSpendStatusLine,
  formatSpendWarningLine,
  SPEND_CAP_SUMMARY,
  spendCapReachedAsk,
  spendWarningFromUnknown,
} from "../src/agent/spend-notice.ts";
import { createSpendAlertOutbox } from "../src/agent/spend-outbox.ts";
import type { AgentEvent, SpendWarning } from "../src/agent/types.ts";
import { ApprovalStore, type ApprovalRequest } from "../src/approvals/store.ts";
import { createApprovalCards } from "../src/discord/approval-cards.ts";
import { parseApproveCardCustomId } from "../src/discord/approve-card.ts";
import { SPEND_CARD_UNKNOWN_APPROVED, spendApprovalKind } from "../src/discord/spend-card.ts";
import { formatSpendWarningDm } from "../src/discord/spend-dm.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { approveWithCode } from "./fixtures/approval-code.ts";

const NOW = 1_800_000_000_000;
const OWNER = "181969874455756800";
const HOST = "llm.test";
const URL_ = `https://${HOST}/v1/chat/completions`;
const UNPRICED = "local-llama-70b";
const NO_REPLY = "Replying can't lift the cap";

afterEach(() => {
  setSpendCardTestHooks({});
});

function mockFetch(reply: { status?: number } = {}): { fetch: SpendFetch; bodies: string[] } {
  const bodies: string[] = [];
  const fetch: SpendFetch = async (_input, init) => {
    bodies.push(String(init?.body ?? ""));
    if (reply.status && reply.status >= 400) return new Response("nope", { status: reply.status });
    return Response.json({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
    });
  };
  return { fetch, bodies };
}

function chatInit(model = UNPRICED, signal?: AbortSignal): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify({ model, messages: [{ role: "user", content: "hello" }] }),
    ...(signal ? { signal } : {}),
  };
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

function guard(
  db: Database,
  opts: { env?: Record<string, string>; notes?: string[]; fetch?: SpendFetch; approval?: boolean } = {},
) {
  const m = mockFetch();
  const g = createSpendGuard(opts.fetch ?? m.fetch, {
    env: { [SPEND_CAP_ENV]: "5", CORVIDINHO_OWNER_DISCORD_ID: OWNER, ...opts.env },
    readUsage: extractUsage,
    db,
    now: () => NOW,
    ...(opts.approval === false
      ? {}
      : {
          approval: {
            taskText: "tidy the README",
            project: () => "corvidlabs/corvidinho",
            onNote: (line: string) => opts.notes?.push(line),
          },
        }),
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

type LedgerRow = {
  status: string;
  model: string;
  estimate_micro_usd: number;
  cost_micro_usd: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
};

function ledgerRows(db: Database): LedgerRow[] {
  return db
    .query(
      "SELECT status, model, estimate_micro_usd, cost_micro_usd, prompt_tokens, completion_tokens FROM spend_ledger ORDER BY ts, rowid",
    )
    .all() as LedgerRow[];
}

/** $1.00 of priced spend already in the window. */
function priced(db: Database, micro = 1_000_000): void {
  const r = new SpendLedger(db).reserve({ provider: HOST, model: "gpt-4o", estimateMicroUsd: micro, now: NOW - 1000 });
  expect(r.ok).toBe(true);
}

describe("SAFE-16.a: an unpriced call under a cap stops and asks on a card showing the amount as unknown", () => {
  test("the card: kind spend, class money, amount unknown (never $0), target the covering cap, the task as data; nothing is sent before it is decided", async () => {
    const db = openCorvidinhoDb({ memory: true });
    priced(db);
    const notes: string[] = [];
    const { g, bodies } = guard(db, { notes });
    let sentBeforeDecision = -1;
    const requests: ApprovalRequest[] = [];
    setSpendCardTestHooks({
      ttlMs: 2_000,
      pollMs: 5,
      onRequest: (req, cardDb) => {
        requests.push(req);
        sentBeforeDecision = bodies.length;
        new ApprovalStore({ db: cardDb }).decide(req.id, "denied", { by: OWNER });
      },
    });
    await refusal(g.fetch(URL_, chatInit()));
    expect(sentBeforeDecision).toBe(0);
    expect(requests).toHaveLength(1);
    const req = requests[0]!;
    expect(req.kind).toBe("spend");
    expect(req.class).toBe("money");
    expect(req.title).toBe("Spend at an unknown price — asks first (SAFE-16.a) · from cli");
    expect(req.action).toBe(`send one model call to ${UNPRICED} via ${HOST}`);
    expect(req.target).toBe("total");
    expect(req.amount).toBe("unknown (no known price for this model; never counted as free)");
    expect(isUnknownSpendAmount(req.amount)).toBe(true);
    expect(req.amount).not.toMatch(/\$\d/);
    expect(req.text).toContain("24h spend when it paused: total $1.00 of $5.00.");
    expect(req.text).toContain("never counted as $0");
    expect(req.text).toContain("the next call at an unknown price asks again (SAFE-16.a)");
    expect(req.text).toContain("Task:\ntidy the README");
    // The wait line is the must-ask wait line, no amounts.
    expect(notes[0]).toStartWith("[operator] AUTONOMY-8: waiting for the owner's OK on an Approve card with the one-time code");
    expect(notes[0]).toContain("at an unknown price");
    expect(notes[0]).not.toMatch(/\$\d/);
  });

  test("approved: exactly that call is sent once and recorded `unknown` (no amount); the priced spend is unchanged and the window counts it", async () => {
    const db = openCorvidinhoDb({ memory: true });
    priced(db);
    const notes: string[] = [];
    const { g, bodies } = guard(db, { notes });
    const asked = answer("approved");
    const resp = await g.fetch(URL_, chatInit());
    expect(resp.ok).toBe(true);
    expect(bodies).toHaveLength(1);
    expect(asked).toHaveLength(1);
    expect(new ApprovalStore({ db }).get(asked[0]!.id)!.status).toBe("used");
    const rows = ledgerRows(db);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({
      status: "unknown",
      model: UNPRICED,
      estimate_micro_usd: 0,
      cost_micro_usd: 0,
      prompt_tokens: 1000,
      completion_tokens: 500,
    });
    expect(new SpendLedger(db).window(NOW)).toEqual({
      spentMicroUsd: 1_000_000,
      calls: 2,
      estimatedCalls: 1,
      unknownCalls: 1,
    });
    expect(notes.some((n) => n.includes(`the owner approved request ${asked[0]!.id}`) && n.includes("unknown price"))).toBe(true);
  });

  test("one call per Approve: the next unpriced call raises a new card; denied, it sends nothing more", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const { g, bodies } = guard(db);
    let n = 0;
    const asked = answer(() => (++n === 1 ? "approved" : "denied"));
    await g.fetch(URL_, chatInit());
    const r = await refusal(g.fetch(URL_, chatInit()));
    expect(asked).toHaveLength(2);
    expect(bodies).toHaveLength(1);
    expect(r.ask.question).toContain(`The owner denied Approve card ${asked[1]!.id}`);
  });

  test("denied: nothing is sent or recorded; the unpriced ask names the card and both ways on, with no reply note and no question mark", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const { g, bodies } = guard(db);
    const asked = answer("denied");
    const r = await refusal(g.fetch(URL_, chatInit()));
    expect(bodies).toEqual([]);
    expect(ledgerRows(db)).toEqual([]);
    expect(r.ask.reason).toBe("spend-cap");
    expect(r.ask.spendScopes).toEqual(["total"]);
    const q = r.ask.question;
    expect(q).toStartWith(`Spend at an unknown price (SAFE-16.a): model "${UNPRICED}" has no known price`);
    expect(q).toContain("showing the amount as unknown (never counted as $0)");
    expect(q).toContain(`The owner denied Approve card ${asked[0]!.id}, so the call was not sent and nothing was spent (SAFE-20).`);
    expect(q).toContain("Stopped at cap: total.");
    expect(q).toContain("ask again — the next call at an unknown price raises a new card and code");
    expect(q).toContain("switches CORVIDINHO_LLM_MODEL to a priced model or unsets CORVIDINHO_DAILY_SPEND_CAP_USD");
    expect(q).not.toContain(NO_REPLY);
    expect(q).not.toContain("?");
    expect(g.finish({ summary: "x", filesChanged: ["a.ts"] })).toEqual({
      summary: SPEND_CAP_SUMMARY,
      filesChanged: ["a.ts"],
      ask: r.ask,
    });
  });

  test("no answer before the card lapses, or a stop while waiting: nothing is sent or recorded", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const { g, bodies } = guard(db);
    answer("none", { ttlMs: 30 });
    const lapsed = await refusal(g.fetch(URL_, chatInit()));
    expect(lapsed.ask.question).toContain("No answer on Approve card");
    const ctl = new AbortController();
    answer(() => {
      ctl.abort();
      return "none";
    });
    const stopped = await refusal(g.fetch(URL_, chatInit(UNPRICED, ctl.signal)));
    expect(stopped.ask.question).toContain("was cut short");
    expect(bodies).toEqual([]);
    expect(ledgerRows(db)).toEqual([]);
  });

  test("a provider cap's card targets provider:<id>; with both caps it targets both (SAFE-15), each with its spend", async () => {
    const env = {
      CORVIDINHO_LLM_MODEL: UNPRICED,
      CORVIDINHO_LLM_BASE_URL: `https://${HOST}/v1`,
      [PROVIDER_SPEND_CAPS_ENV]: `${HOST}=2`,
    };
    const one = openCorvidinhoDb({ memory: true });
    const onlyProvider = guard(one, { env: { ...env, [SPEND_CAP_ENV]: "" } });
    const a = answer("denied");
    const r = await refusal(onlyProvider.g.fetch(URL_, chatInit()));
    expect(a[0]!.target).toBe(`provider:${HOST}`);
    expect(a[0]!.text).toContain(`provider:${HOST} $0.00 of $2.00`);
    expect(r.ask.spendScopes).toEqual([`provider:${HOST}`]);
    expect(r.ask.question).toContain(`removes the ${HOST} entry of ${PROVIDER_SPEND_CAPS_ENV}`);

    const two = openCorvidinhoDb({ memory: true });
    const both = guard(two, { env });
    const b = answer("denied");
    await refusal(both.g.fetch(URL_, chatInit()));
    expect(b[0]!.target).toBe(`total, provider:${HOST}`);
    expect(b[0]!.text).toContain(`total $0.00 of $5.00; provider:${HOST} $0.00 of $2.00`);
  });

  test("with no cap covering it, it just runs: no card, not recorded", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const other = "api.other.test";
    const { g, bodies } = guard(db, {
      env: {
        [SPEND_CAP_ENV]: "",
        CORVIDINHO_LLM_MODEL: `gpt-4o,${UNPRICED}`,
        CORVIDINHO_LLM_BASE_URL: `https://${HOST}/v1`,
        [PROVIDER_SPEND_CAPS_ENV]: `${HOST}=2`,
      },
    });
    const asked = answer("denied");
    const resp = await g.fetch(`https://${other}/v1/chat/completions`, chatInit());
    expect(resp.ok).toBe(true);
    expect(bodies).toHaveLength(1);
    expect(asked).toEqual([]);
    expect(existsSyncTable(db)).toBe(false);
  });

  test("no owner configured, or no card path (withSpendCap): the operator ask at once, no card, no ledger opened", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-unknown-"));
    try {
      const asked = answer("approved", { ttlMs: 60_000 });
      const noOwner = createSpendGuard(mockFetch().fetch, {
        env: {
          [SPEND_CAP_ENV]: "5",
          CORVIDINHO_DATA_DIR: dir,
          CORVIDINHO_ALLOWLIST_FILE: join(dir, "none.toml"),
        },
        readUsage: extractUsage,
        approval: { taskText: "x" },
      });
      const r = await refusal(noOwner.fetch(URL_, chatInit()));
      expect(r.ask.question).toContain("Spend cap can't be enforced (SAFE-8)");
      expect(r.ask.question).toContain(NO_REPLY);
      const plain = withSpendCap(mockFetch().fetch, {
        env: { [SPEND_CAP_ENV]: "5", CORVIDINHO_OWNER_DISCORD_ID: OWNER, CORVIDINHO_DATA_DIR: dir },
        readUsage: extractUsage,
      });
      await refusal(plain(URL_, chatInit()));
      expect(asked).toEqual([]);
      expect(existsSync(join(dir, "corvidinho.db"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an HTTP error on the approved call counts as failed, not as an unknown call", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const m = mockFetch({ status: 500 });
    const { g } = guard(db, { fetch: m.fetch });
    answer("approved");
    const resp = await g.fetch(URL_, chatInit());
    expect(resp.status).toBe(500);
    expect(ledgerRows(db).map((r) => r.status)).toEqual(["failed"]);
    expect(new SpendLedger(db).window(NOW).unknownCalls).toBe(0);
  });

  test("there is no price override: the price table is fixed, and an env key naming a price changes nothing", async () => {
    expect(Object.isFrozen(MODEL_PRICES_USD_PER_MTOK)).toBe(true);
    const db = openCorvidinhoDb({ memory: true });
    const { g, bodies } = guard(db, {
      env: {
        CORVIDINHO_MODEL_PRICE_USD_PER_MTOK: `${UNPRICED}=0`,
        CORVIDINHO_MODEL_PRICES: `${UNPRICED}=0:0`,
      },
    });
    const asked = answer("denied");
    await refusal(g.fetch(URL_, chatInit()));
    expect(asked).toHaveLength(1);
    expect(isUnknownSpendAmount(asked[0]!.amount)).toBe(true);
    expect(bodies).toEqual([]);
  });
});

function existsSyncTable(db: Database): boolean {
  return Boolean(db.query("SELECT 1 FROM sqlite_master WHERE name = 'spend_ledger'").get());
}

describe("owner lines read \"$X + unknown\" (SAFE-16), never $0; anyone else sees only the pause", () => {
  function seededWithUnknown(db: Database) {
    priced(db, 4_500_000);
    new SpendLedger(db).recordUnknown({ provider: HOST, model: UNPRICED, now: NOW - 500 });
  }

  test("formatSpend: \"+ unknown\" only while the window holds a call at an unknown price", () => {
    expect(formatSpend(1_000_000)).toBe("$1.00");
    expect(formatSpend(1_000_000, 0)).toBe("$1.00");
    expect(formatSpend(1_000_000, 2)).toBe("$1.00 + unknown");
    expect(formatSpend(0, 1)).toBe("$0.00 + unknown");
  });

  test("doctor and the owner's /status: \"$4.50 + unknown of $5.00\"; the counts name the unknown call; the public line has no amount", () => {
    const db = openCorvidinhoDb({ memory: true });
    seededWithUnknown(db);
    const env = {
      [SPEND_CAP_ENV]: "5",
      CORVIDINHO_LLM_MODEL: "gpt-4o",
      CORVIDINHO_LLM_BASE_URL: `https://${HOST}/v1`,
      [PROVIDER_SPEND_CAPS_ENV]: `${HOST}=10`,
    };
    const lines = spendDoctorChecks({ env, model: "gpt-4o", db, now: NOW });
    expect(lines[0]!.detail).toStartWith("$4.50 + unknown of $5.00 daily cap used in the last 24h (90%; 2 provider call(s), 1 counted at its estimate, 1 at an unknown price;");
    expect(lines[1]!.detail).toStartWith(`$4.50 + unknown of $10.00 daily cap for ${HOST} used in the last 24h`);
    const snap = readSpendSnapshot({ env, model: "gpt-4o", db, now: NOW });
    const status = formatSpendStatusLine(snap);
    expect(status).toContain("Spend (24h): $4.50 + unknown of $5.00 daily cap (90%)");
    expect(status).toContain(`Spend (24h) on ${HOST}: $4.50 + unknown of $10.00 daily cap (45%)`);
    expect(formatSpendPublicStatusLine(snap)).toBeUndefined();
  });

  test("the 80% warning, its DM through the outbox and a child's result frame carry the unknown part", () => {
    const db = openCorvidinhoDb({ memory: true });
    new SpendLedger(db).recordUnknown({ provider: HOST, model: UNPRICED, now: NOW - 500 });
    priced(db, 4_500_000);
    const w = new SpendLedger(db).noteWarning({ capMicroUsd: 5_000_000, now: NOW });
    expect(w).toMatchObject({ spentMicroUsd: 4_500_000, capMicroUsd: 5_000_000, percent: 90, unknownCalls: 1 });
    expect(formatSpendWarningLine(w!)).toContain("$4.50 + unknown of the $5.00 daily cap used in the last 24h (90%)");
    const taken = createSpendAlertOutbox({ db, env: { [SPEND_CAP_ENV]: "5" }, now: () => NOW }).takeWarning();
    expect(taken!.warning.unknownCalls).toBe(1);
    expect(formatSpendWarningDm(taken!.warnings ?? taken!.warning)).toContain("$4.50 + unknown of the $5.00 daily cap");
    // A child's frame: a whole positive count is kept; anything else is dropped.
    const frame = { spentMicroUsd: 4_500_000, capMicroUsd: 5_000_000 };
    expect(spendWarningFromUnknown({ ...frame, unknownCalls: 3 })?.unknownCalls).toBe(3);
    for (const bad of [0, -1, 1.5, "2", 1e12]) {
      expect(spendWarningFromUnknown({ ...frame, unknownCalls: bad })?.unknownCalls).toBeUndefined();
    }
    const plain: SpendWarning = { spentMicroUsd: 4_500_000, capMicroUsd: 5_000_000, percent: 90 };
    expect(formatSpendWarningLine(plain)).toContain("$4.50 of the $5.00 daily cap");
  });

  test("a priced call past the cap: the stop ask and its card show \"$X + unknown\"", async () => {
    const db = openCorvidinhoDb({ memory: true });
    seededWithUnknown(db);
    priced(db, 499_000);
    const { g } = guard(db);
    const asked = answer("denied");
    const r = await refusal(g.fetch(URL_, chatInit("gpt-4o")));
    expect(asked[0]!.text).toContain("24h spend when it paused: total $4.9990 + unknown of $5.00.");
    expect(asked[0]!.amount).toMatch(/^~\$0\.\d{4} \(this one call's estimate\)$/);
    expect(r.ask.question).toContain("$4.9990 + unknown spent in the last 24h (99% of the $5.00 cap)");
    // Built from plain amounts the ask reads as before.
    expect(spendCapReachedAsk({ spentMicroUsd: 1, estimateMicroUsd: 1, capMicroUsd: 1 }).question).not.toContain("unknown");
  });

  test("spendCardFields: a priced card is unchanged; an unknown one never shows a dollar amount", () => {
    const base = { model: "m", provider: HOST, trips: [{ scope: "total", spentMicroUsd: 0, capMicroUsd: 1 }], surface: "cli", requester: "local" };
    expect(spendCardFields({ ...base, estimateMicroUsd: 1234 }).amount).toBe("~$0.0013 (this one call's estimate)");
    const u = spendCardFields({ ...base, estimateMicroUsd: null });
    expect(u.amount).toStartWith("unknown");
    expect(u.amount).not.toMatch(/\$\d/);
  });
});

describe("createTaskExecute with an unpriced model under a cap (SAFE-16.a)", () => {
  function capEnv(dir: string) {
    return {
      CORVIDINHO_LLM_API_KEY: "test-key",
      CORVIDINHO_LLM_BASE_URL: `https://${HOST}/v1`,
      CORVIDINHO_LLM_MODEL: UNPRICED,
      CORVIDINHO_LLM_TIER: "read",
      CORVIDINHO_DATA_DIR: dir,
      CORVIDINHO_OWNER_DISCORD_ID: OWNER,
      [SPEND_CAP_ENV]: "5",
    };
  }

  test("approved: the run's call goes out and the Text events carry the wait and the approval", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-unknown-"));
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
      expect(bodies).toHaveLength(1);
      expect(asked).toHaveLength(1);
      expect(isUnknownSpendAmount(asked[0]!.amount)).toBe(true);
      const texts = events.filter((e) => e.type === "Text").map((e) => (e as { text: string }).text);
      expect(texts.some((t) => t.startsWith("[operator] AUTONOMY-8: waiting for the owner's OK"))).toBe(true);
      expect(texts.some((t) => t.includes(`the owner approved request ${asked[0]!.id}`))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("denied: runTask ends blocked with the generic summary; verify does not run; no provider call", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-unknown-"));
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
      expect(result.ask?.question).toContain("Spend at an unknown price (SAFE-16.a)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the unknown-price card on the bridge's engine (REQ-discord-199)", () => {
  test("the owner's DM shows Amount: unknown; Approve + the one-time code sends exactly that call and the card says its cost stays unknown", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const dms: Array<{ userId: string; content: string; components?: unknown[] }> = [];
    const cards = createApprovalCards({
      db,
      env: {},
      owner: () => ({ discordId: OWNER }),
      sendDm: async (o) => {
        dms.push(o);
        return { channelId: `dm-${o.userId}`, messageId: `m${dms.length}` };
      },
      editMessage: async () => true,
      kinds: [spendApprovalKind({ db })],
    });
    const handlers = {
      onComponent: async (ix: Parameters<typeof cards.press>[0]) => {
        await cards.press(ix, parseApproveCardCustomId(ix.customId)!, ix.userId === OWNER);
      },
    };
    const { g, bodies } = guard(db);
    let running: Promise<void> = Promise.resolve();
    let submitted = "";
    setSpendCardTestHooks({
      ttlMs: 60_000,
      pollMs: 5,
      onRequest: () => {
        running = (async () => {
          await cards.deliver();
          const dm = dms.find((d) => d.components)!;
          const ids = ((dm.components ?? []) as { components: { custom_id: string }[] }[]).flatMap((r) =>
            r.components.map((c) => c.custom_id),
          );
          const approve = ids.find((id) => id.includes(":approve:"))!;
          const flow = await approveWithCode(handlers, dms, OWNER, approve);
          submitted = flow.submit[0]!.content ?? "";
        })();
      },
    });
    const resp = await g.fetch(URL_, chatInit());
    await running;
    expect(resp.ok).toBe(true);
    expect(bodies).toHaveLength(1);
    const cardDm = dms.find((d) => d.components)!;
    expect(cardDm.content).toContain("**Spend at an unknown price — asks first (SAFE-16.a) · from cli**");
    expect(cardDm.content).toContain("Amount: unknown (no known price for this model; never counted as free)");
    expect(cardDm.content).not.toContain("Amount: $0");
    expect(submitted).toContain(SPEND_CARD_UNKNOWN_APPROVED);
    expect(ledgerRows(db).map((r) => r.status)).toEqual(["unknown"]);
  });
});
