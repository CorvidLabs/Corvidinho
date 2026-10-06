/**
 * AUTONOMY-8.a (#98, REQ-agent-298) — before each call the spend guard counts
 * a worst-case reply toward the cap, so it asks before a long reply could take
 * spend past it; replies are never cut short.
 *
 * The pre-call estimate is request bytes / 3 prompt tokens plus the model's
 * listed maximum output (`ModelPrice.maxOutputTokens`), or the documented
 * default for a priced model with no listed maximum — never the old fixed
 * 4096-token reserve. No `max_tokens` is sent. After the call the reservation
 * is still replaced by the provider-reported usage. Unpriced models keep their
 * SAFE-16.a card (amount unknown).
 *
 * Mocked fetch (the fake LLM), in-memory or temp-dir SQLite, a fixed owner in
 * the run's env; the card is decided in the store as the bridge's engine would.
 * No network.
 */
import type { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalStore, type ApprovalRequest } from "../src/approvals/store.ts";
import { createTaskExecute, extractUsage } from "../src/agent/execute.ts";
import * as spend from "../src/agent/spend.ts";
import {
  createSpendGuard,
  estimateCallMicroUsd,
  formatUsd,
  MODEL_PRICES_USD_PER_MTOK,
  priceForModel,
  PROVIDER_SPEND_CAPS_ENV,
  setSpendCardTestHooks,
  SPEND_CAP_ENV,
  SpendCapRefusal,
  isUnknownSpendAmount,
  SpendLedger,
  type SpendFetch,
} from "../src/agent/spend.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const NOW = 1_800_000_000_000;
const OWNER = "181969874455756800";
const HOST = "llm.test";
const URL_ = `https://${HOST}/v1/chat/completions`;
/** The fixed reply reserve the guard used before AUTONOMY-8.a. */
const OLD_REPLY_RESERVE = 4096;
/** gpt-4o's listed maximum output (its worst-case reply). */
const GPT_4O_MAX_OUTPUT = 16_384;

afterEach(() => {
  setSpendCardTestHooks({});
});

type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number };

/** The fake LLM: answers with `usage`, recording each sent body (and the ledger as the call went out). */
function mockFetch(
  usage: Usage = { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
  onSend?: () => void,
): { fetch: SpendFetch; bodies: string[] } {
  const bodies: string[] = [];
  const fetch: SpendFetch = async (_input, init) => {
    bodies.push(String(init?.body ?? ""));
    onSend?.();
    return Response.json({ choices: [{ message: { content: "ok" } }], usage });
  };
  return { fetch, bodies };
}

/** A reply as long as gpt-4o can make it. */
const LONG_REPLY: Usage = {
  prompt_tokens: 10,
  completion_tokens: GPT_4O_MAX_OUTPUT,
  total_tokens: 10 + GPT_4O_MAX_OUTPUT,
};

function chatInit(model = "gpt-4o", content = "hello"): RequestInit {
  return { method: "POST", body: JSON.stringify({ model, messages: [{ role: "user", content }] }) };
}

function promptMicroUsd(init: RequestInit, inputPerMTok: number): number {
  return Math.ceil(Math.ceil(Buffer.byteLength(String(init.body), "utf8") / 3) * inputPerMTok);
}

function ledger(db: Database) {
  // No table yet: the guard never opened the ledger (nothing recorded).
  if (!db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'spend_ledger'").get()) return [];
  return db
    .query("SELECT status, estimate_micro_usd AS estimate, cost_micro_usd AS cost FROM spend_ledger ORDER BY ts, rowid")
    .all() as { status: string; estimate: number; cost: number }[];
}

function requests(db: Database): ApprovalRequest[] {
  const store = new ApprovalStore({ db });
  return (db.query("SELECT id FROM approval_requests ORDER BY created_at, rowid").all() as { id: string }[]).map(
    (r) => store.get(r.id)!,
  );
}

/** Decide each spend card as it is recorded (as the engine would after Approve + code). */
function answer(a: "approved" | "denied"): ApprovalRequest[] {
  const seen: ApprovalRequest[] = [];
  setSpendCardTestHooks({
    ttlMs: 2_000,
    pollMs: 5,
    onRequest: (req, db) => {
      seen.push(req);
      new ApprovalStore({ db }).decide(req.id, a, { by: OWNER });
    },
  });
  return seen;
}

async function refusal(p: Promise<unknown>): Promise<SpendCapRefusal> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(SpendCapRefusal);
    return e as SpendCapRefusal;
  }
  throw new Error("the call was sent without asking");
}

describe("AUTONOMY-8.a: the reply reserve is the model's worst case", () => {
  test("every priced model lists its maximum output, above the old 4096-token reserve", () => {
    const entries = Object.entries(MODEL_PRICES_USD_PER_MTOK);
    expect(entries.length).toBeGreaterThan(0);
    for (const [model, price] of entries) {
      expect({ model, max: price.maxOutputTokens }).toEqual({ model, max: expect.any(Number) });
      expect(price.maxOutputTokens!).toBeGreaterThan(OLD_REPLY_RESERVE);
      expect(spend.replyReserveTokens(price)).toBe(price.maxOutputTokens!);
    }
    expect(priceForModel("gpt-4o")!.maxOutputTokens).toBe(GPT_4O_MAX_OUTPUT);
    expect(priceForModel("claude-opus-5-5")!.maxOutputTokens).toBe(128_000);
    expect(priceForModel("claude-haiku-4-5")!.maxOutputTokens).toBe(64_000);
  });

  test("the estimate counts the listed maximum output at the output price", () => {
    const p = priceForModel("gpt-4o")!;
    // 3000 bytes → 1000 prompt tokens × $2.50/M, + 16384 reply tokens × $10/M.
    expect(estimateCallMicroUsd(p, 3000)).toBe(1000 * 2.5 + GPT_4O_MAX_OUTPUT * 10);
    const opus = priceForModel("claude-opus-5-5")!;
    expect(estimateCallMicroUsd(opus, 0)).toBe(128_000 * 20);
  });

  test("a priced model with no listed maximum counts the documented default (128K tokens), not 4096", () => {
    expect(spend.REPLY_RESERVE_DEFAULT_TOKENS).toBe(128_000);
    const bare = { inputPerMTok: 0, outputPerMTok: 1 };
    // $1/M output → 1 micro-USD per reply token.
    expect(estimateCallMicroUsd(bare, 0)).toBe(128_000);
    for (const bad of [0, -5, 1.5, Number.NaN]) {
      expect(estimateCallMicroUsd({ ...bare, maxOutputTokens: bad }, 0)).toBe(128_000);
    }
  });
});

describe("AUTONOMY-8.a: a call whose worst-case reply would cross a cap asks first", () => {
  test("no owner: the spend-cap ask comes before the call — a long reply can no longer take spend past the cap unasked", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const m = mockFetch(LONG_REPLY);
    // $0.10 cap, nothing spent: gpt-4o's worst case (~$0.164) would cross it,
    // the old 4096-token reserve (~$0.041) would not.
    const g = createSpendGuard(m.fetch, {
      env: { [SPEND_CAP_ENV]: "0.10" },
      readUsage: extractUsage,
      db,
      now: () => NOW,
    });
    const init = chatInit();
    const estimate = estimateCallMicroUsd(priceForModel("gpt-4o")!, Buffer.byteLength(String(init.body), "utf8"));
    expect(estimate).toBe(promptMicroUsd(init, 2.5) + GPT_4O_MAX_OUTPUT * 10);
    const r = await refusal(g.fetch(URL_, init));
    expect(r.ask.reason).toBe("spend-cap");
    expect(r.ask.question).toStartWith("Daily spend cap reached (SAFE-8)");
    expect(r.ask.question).toContain(`(~${formatUsd(estimate)}) would pass it`);
    expect(r.ask.question).toContain("$0.10 cap");
    // Nothing was sent and nothing was spent: spend never went past the cap.
    expect(m.bodies).toHaveLength(0);
    expect(ledger(db)).toEqual([]);
    expect(new SpendLedger(db).window(NOW).spentMicroUsd).toBe(0);
  });

  test("with an owner: the same call raises the spend card at the worst-case amount; Approve sends it and the actual usage is what counts", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const m = mockFetch(LONG_REPLY);
    const g = createSpendGuard(m.fetch, {
      env: { [SPEND_CAP_ENV]: "0.10", CORVIDINHO_OWNER_DISCORD_ID: OWNER },
      readUsage: extractUsage,
      db,
      now: () => NOW,
      approval: { taskText: "write the long report" },
    });
    const asked = answer("approved");
    const init = chatInit();
    const estimate = estimateCallMicroUsd(priceForModel("gpt-4o")!, Buffer.byteLength(String(init.body), "utf8"));
    const resp = await g.fetch(URL_, init);
    expect(resp.ok).toBe(true);
    // The card came first (the #316/#335 spend card), at the worst-case amount.
    expect(asked).toHaveLength(1);
    const req = requests(db)[0]!;
    expect(req.kind).toBe("spend");
    expect(req.class).toBe("money");
    expect(req.target).toBe("total");
    expect(req.amount).toBe(`~${formatUsd(estimate)} (this one call's estimate)`);
    expect(req.status).toBe("used");
    // Sent once, unchanged (no max_tokens: the reply is never cut short).
    expect(m.bodies).toEqual([String(init.body)]);
    // After the call: the provider-reported usage replaces the reservation.
    const rows = ledger(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "actual", estimate });
    expect(rows[0]!.cost).toBe(Math.ceil(10 * 2.5 + GPT_4O_MAX_OUTPUT * 10));
  });

  test("with an owner who denies: nothing is sent and nothing is spent", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const m = mockFetch(LONG_REPLY);
    const g = createSpendGuard(m.fetch, {
      env: { [SPEND_CAP_ENV]: "0.10", CORVIDINHO_OWNER_DISCORD_ID: OWNER },
      readUsage: extractUsage,
      db,
      now: () => NOW,
      approval: {},
    });
    const asked = answer("denied");
    const r = await refusal(g.fetch(URL_, chatInit()));
    expect(asked).toHaveLength(1);
    expect(r.ask.reason).toBe("spend-cap");
    expect(m.bodies).toHaveLength(0);
    expect(ledger(db)).toEqual([]);
  });

  test("a provider cap counts the worst case the same way (any cap)", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const m = mockFetch(LONG_REPLY);
    const g = createSpendGuard(m.fetch, {
      env: {
        CORVIDINHO_LLM_MODEL: "gpt-4o",
        CORVIDINHO_LLM_BASE_URL: `https://${HOST}/v1`,
        [PROVIDER_SPEND_CAPS_ENV]: `${HOST}=0.10`,
      },
      readUsage: extractUsage,
      db,
      now: () => NOW,
    });
    const r = await refusal(g.fetch(URL_, chatInit()));
    expect(r.ask.reason).toBe("spend-cap");
    expect(r.ask.question).toStartWith("Daily spend cap reached (SAFE-15)");
    expect(r.ask.question).toContain(`provider:${HOST}`);
    expect(m.bodies).toHaveLength(0);
  });
});

describe("AUTONOMY-8.a: a call whose worst case fits does not ask", () => {
  test("the call goes out with no card, holding the worst case while in flight, then counts the actual usage", async () => {
    const db = openCorvidinhoDb({ memory: true });
    let inFlight: { status: string; estimate: number; cost: number }[] = [];
    const m = mockFetch(undefined, () => {
      inFlight = ledger(db);
    });
    const g = createSpendGuard(m.fetch, {
      env: { [SPEND_CAP_ENV]: "1", CORVIDINHO_OWNER_DISCORD_ID: OWNER },
      readUsage: extractUsage,
      db,
      now: () => NOW,
      approval: {},
    });
    const asked = answer("denied");
    const init = chatInit();
    const resp = await g.fetch(URL_, init);
    expect(resp.ok).toBe(true);
    expect(asked).toHaveLength(0);
    expect(requests(db)).toHaveLength(0);
    // While the reply was on its way, the worst case was what counted.
    const worst = promptMicroUsd(init, 2.5) + GPT_4O_MAX_OUTPUT * 10;
    expect(inFlight).toEqual([{ status: "reserved", estimate: worst, cost: worst }]);
    // The body went out as built: no max_tokens, so the reply is never cut short.
    expect(m.bodies).toEqual([String(init.body)]);
    const sent = JSON.parse(m.bodies[0]!) as Record<string, unknown>;
    expect(sent).not.toHaveProperty("max_tokens");
    expect(sent).not.toHaveProperty("max_completion_tokens");
    // After the call: actual usage (1000 × $2.50/M + 500 × $10/M), as before.
    expect(ledger(db)).toEqual([{ status: "actual", estimate: worst, cost: 7500 }]);
    expect(new SpendLedger(db).window(NOW).spentMicroUsd).toBe(7500);
  });

  test("a capped run's model request carries no max_tokens", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-reserve-"));
    try {
      const m = mockFetch(LONG_REPLY);
      const exec = createTaskExecute({
        taskText: "write the long report",
        env: {
          CORVIDINHO_LLM_API_KEY: "test-key",
          CORVIDINHO_LLM_BASE_URL: `https://${HOST}/v1`,
          CORVIDINHO_LLM_MODEL: "gpt-4o",
          CORVIDINHO_LLM_TIER: "read",
          CORVIDINHO_DATA_DIR: dir,
          [SPEND_CAP_ENV]: "5",
        },
        fetchImpl: m.fetch,
        loadPlugins: false,
      });
      const result = await exec({ attempt: 1, signal: new AbortController().signal });
      expect(result.ask).toBeUndefined();
      expect(m.bodies).toHaveLength(1);
      const sent = JSON.parse(m.bodies[0]!) as Record<string, unknown>;
      expect(sent.model).toBe("gpt-4o");
      expect(sent).not.toHaveProperty("max_tokens");
      expect(sent).not.toHaveProperty("max_completion_tokens");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("AUTONOMY-8.a leaves unpriced models as they were (SAFE-16 / SAFE-16.a)", () => {
  test("under a cap an unpriced model still asks on a card showing the amount as unknown; approved, it is recorded unknown", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const m = mockFetch();
    const g = createSpendGuard(m.fetch, {
      env: { [SPEND_CAP_ENV]: "1", CORVIDINHO_OWNER_DISCORD_ID: OWNER },
      readUsage: extractUsage,
      db,
      now: () => NOW,
      approval: {},
    });
    const asked = answer("approved");
    const resp = await g.fetch(URL_, chatInit("local-llama"));
    expect(resp.ok).toBe(true);
    expect(asked).toHaveLength(1);
    expect(isUnknownSpendAmount(asked[0]!.amount)).toBe(true);
    expect(m.bodies).toHaveLength(1);
    expect(ledger(db)).toEqual([{ status: "unknown", estimate: 0, cost: 0 }]);
    expect(new SpendLedger(db).window(NOW).unknownCalls).toBe(1);
  });

  test("under a cap with no owner it stops with the unpriced ask; with no cap covering it, it just runs", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const capped = mockFetch();
    const g = createSpendGuard(capped.fetch, {
      env: { [SPEND_CAP_ENV]: "1" },
      readUsage: extractUsage,
      db,
      now: () => NOW,
    });
    const r = await refusal(g.fetch(URL_, chatInit("local-llama")));
    expect(r.ask.reason).toBe("spend-cap");
    expect(r.ask.question).toContain("no known price");
    expect(capped.bodies).toHaveLength(0);

    const free = mockFetch();
    const off = createSpendGuard(free.fetch, { env: {}, readUsage: extractUsage, db, now: () => NOW });
    expect(off.fetch).toBe(free.fetch);
    await off.fetch(URL_, chatInit("local-llama"));
    expect(free.bodies).toHaveLength(1);
    expect(ledger(db)).toEqual([]);
  });
});
