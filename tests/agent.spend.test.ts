/**
 * SAFE-8 daily spend cap (as amended on #98: warn at 80%, ask at 100%) +
 * AUTONOMOUS-8 spend view (REQ-agent-098 / REQ-cli-098 / REQ-discord-098).
 * Mocked fetch or a localhost mock LLM only — no network, no real keys.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskExecute, extractUsage } from "../src/agent/execute.ts";
import {
  costMicroUsd,
  estimateCallMicroUsd,
  formatUsd,
  parseSpendCap,
  priceForModel,
  SPEND_CAP_ENV,
  SPEND_WINDOW_MS,
  SpendCapRefusal,
  spendDoctorCheck,
  SpendLedger,
  withSpendCap,
  type SpendFetch,
} from "../src/agent/spend.ts";
import { SPEND_CAP_SUMMARY } from "../src/agent/spend-notice.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { rescrubDatabase, SCRUB_TARGETS } from "../src/store/scrub.ts";

const NOW = 1_800_000_000_000;

type Call = { url: string; body: string };

function mockFetch(
  reply: { status?: number; json?: unknown } = {},
): { fetch: SpendFetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: SpendFetch = async (input, init) => {
    calls.push({ url: String(input), body: String(init?.body ?? "") });
    return new Response(
      JSON.stringify(
        reply.json ?? {
          choices: [{ message: { content: "ok" } }],
          usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
        },
      ),
      { status: reply.status ?? 200, headers: { "content-type": "application/json" } },
    );
  };
  return { fetch, calls };
}

function chatInit(model: string, content = "hello"): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify({ model, messages: [{ role: "user", content }] }),
  };
}

const URL_ = "https://llm.test/v1/chat/completions";

function ledgerRows(db: ReturnType<typeof openCorvidinhoDb>) {
  return db
    .query("SELECT provider, model, status, estimate_micro_usd, cost_micro_usd, prompt_tokens, completion_tokens FROM spend_ledger ORDER BY ts")
    .all() as Array<{
    provider: string;
    model: string;
    status: string;
    estimate_micro_usd: number;
    cost_micro_usd: number;
    prompt_tokens: number | null;
    completion_tokens: number | null;
  }>;
}

describe("parseSpendCap", () => {
  test("unset or blank is off", () => {
    expect(parseSpendCap({})).toEqual({ kind: "off" });
    expect(parseSpendCap({ [SPEND_CAP_ENV]: "  " })).toEqual({ kind: "off" });
  });

  test("plain USD amounts become micro-USD", () => {
    expect(parseSpendCap({ [SPEND_CAP_ENV]: "5" })).toEqual({ kind: "cap", capUsd: 5, capMicroUsd: 5_000_000 });
    expect(parseSpendCap({ [SPEND_CAP_ENV]: " 2.50 " })).toEqual({ kind: "cap", capUsd: 2.5, capMicroUsd: 2_500_000 });
    expect(parseSpendCap({ [SPEND_CAP_ENV]: "0" })).toEqual({ kind: "cap", capUsd: 0, capMicroUsd: 0 });
    expect(parseSpendCap({ [SPEND_CAP_ENV]: ".5" })).toMatchObject({ kind: "cap", capMicroUsd: 500_000 });
  });

  test("anything else is invalid (fail closed)", () => {
    for (const raw of ["abc", "-1", "$5", "1e3", "Infinity", "5 USD", "1,5"]) {
      expect(parseSpendCap({ [SPEND_CAP_ENV]: raw })).toEqual({ kind: "invalid" });
    }
  });
});

describe("pricing", () => {
  test("exact model ids, case-insensitive; unknown and dated ids are unpriced", () => {
    expect(priceForModel("gpt-4o-mini")).toEqual({ inputPerMTok: 0.15, outputPerMTok: 0.6, maxOutputTokens: 16_384 });
    expect(priceForModel(" GPT-4o-Mini ")).not.toBeNull();
    expect(priceForModel("claude-sonnet-5")).toEqual({ inputPerMTok: 2, outputPerMTok: 10, maxOutputTokens: 128_000 });
    expect(priceForModel("gpt-4o-2024-05-13")).toBeNull();
    expect(priceForModel("local-llama")).toBeNull();
    expect(priceForModel("")).toBeNull();
    expect(priceForModel("constructor")).toBeNull();
  });

  test("cost is exact integer micro-USD, rounded up", () => {
    const p = priceForModel("gpt-4o-mini")!;
    expect(costMicroUsd(p, { promptTokens: 1_000_000, completionTokens: 0, totalTokens: 1_000_000 })).toBe(150_000);
    expect(costMicroUsd(p, { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 })).toBe(450);
    expect(costMicroUsd(p, { promptTokens: 1, completionTokens: 0, totalTokens: 1 })).toBe(1);
    // total without a split counts at the (higher) output rate
    expect(costMicroUsd(p, { promptTokens: 0, completionTokens: 0, totalTokens: 1000 })).toBe(600);
  });

  test("estimate = request bytes / 3 prompt tokens + the model's worst-case reply (AUTONOMY-8.a)", () => {
    const p = priceForModel("gpt-4o")!;
    // 3000 bytes → 1000 prompt tokens × 2.5 + gpt-4o's 16384-token maximum output × 10
    expect(estimateCallMicroUsd(p, 3000)).toBe(1000 * 2.5 + 16_384 * 10);
  });

  test("formatUsd", () => {
    expect(formatUsd(5_000_000)).toBe("$5.00");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(12_345)).toBe("$0.0124");
    expect(formatUsd(450)).toBe("$0.0005");
    expect(formatUsd(123_450_000)).toBe("$123.45");
  });
});

describe("withSpendCap (SAFE-8)", () => {
  test("no cap: the same fetch comes back and no DB is created", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-off-"));
    try {
      const { fetch, calls } = mockFetch();
      const wrapped = withSpendCap(fetch, { env: { CORVIDINHO_DATA_DIR: dir }, readUsage: extractUsage });
      expect(wrapped).toBe(fetch);
      await wrapped(URL_, chatInit("unpriced-model"));
      expect(calls).toHaveLength(1);
      expect(readdirSync(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("under the cap: call goes through and actual usage replaces the estimate", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const { fetch, calls } = mockFetch();
    const wrapped = withSpendCap(fetch, {
      env: { [SPEND_CAP_ENV]: "1" },
      readUsage: extractUsage,
      db,
      now: () => NOW,
    });
    const resp = await wrapped(URL_, chatInit("gpt-4o-mini"));
    expect(resp.ok).toBe(true);
    // original body still readable by the caller
    expect(((await resp.json()) as { choices: unknown[] }).choices).toHaveLength(1);
    expect(calls).toHaveLength(1);
    const rows = ledgerRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: "llm.test",
      model: "gpt-4o-mini",
      status: "actual",
      cost_micro_usd: 450,
      prompt_tokens: 1000,
      completion_tokens: 500,
    });
    expect(rows[0].estimate_micro_usd).toBeGreaterThan(450);
    expect(new SpendLedger(db).window(NOW)).toEqual({ spentMicroUsd: 450, calls: 1, estimatedCalls: 0, unknownCalls: 0 });
  });

  test("stops before sending when spend + estimate would break the cap, with a spend-cap ask", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const ledger = new SpendLedger(db);
    const pre = ledger.reserve({ provider: "p", model: "gpt-4o", estimateMicroUsd: 999_000, capMicroUsd: 1_000_000, now: NOW - 1000 });
    expect(pre.ok).toBe(true);
    const { fetch, calls } = mockFetch();
    const wrapped = withSpendCap(fetch, { env: { [SPEND_CAP_ENV]: "1" }, readUsage: extractUsage, db, now: () => NOW });
    let err: unknown;
    try {
      await wrapped(URL_, chatInit("gpt-4o"));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SpendCapRefusal);
    const refusal = err as SpendCapRefusal;
    expect(refusal.ask.reason).toBe("spend-cap");
    expect(refusal.message).toBe(refusal.ask.question);
    const msg = refusal.ask.question;
    expect(msg).toContain("Daily spend cap reached");
    expect(msg).toContain("$0.9990 spent in the last 24h (99% of the $1.00 cap)");
    expect(msg).toContain("stopped before sending it");
    expect(msg).toContain(`the operator raises ${SPEND_CAP_ENV}`);
    expect(msg).toContain("24h window");
    expect(calls).toHaveLength(0);
    expect(ledgerRows(db)).toHaveLength(1);
  });

  test("spend older than 24h no longer counts", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const ledger = new SpendLedger(db);
    ledger.reserve({ provider: "p", model: "gpt-4o", estimateMicroUsd: 999_000, capMicroUsd: 1_000_000, now: NOW - SPEND_WINDOW_MS - 1 });
    const { fetch, calls } = mockFetch();
    const wrapped = withSpendCap(fetch, { env: { [SPEND_CAP_ENV]: "1" }, readUsage: extractUsage, db, now: () => NOW });
    await wrapped(URL_, chatInit("gpt-4o"));
    expect(calls).toHaveLength(1);
    expect(ledger.window(NOW).calls).toBe(1);
  });

  test("zero cap stops every call", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const { fetch, calls } = mockFetch();
    const wrapped = withSpendCap(fetch, { env: { [SPEND_CAP_ENV]: "0" }, readUsage: extractUsage, db, now: () => NOW });
    await expect(wrapped(URL_, chatInit("gpt-4o-mini"))).rejects.toBeInstanceOf(SpendCapRefusal);
    expect(calls).toHaveLength(0);
  });

  test("unpriced model stops and asks while a cap is set (never counted as free)", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const { fetch, calls } = mockFetch();
    const wrapped = withSpendCap(fetch, { env: { [SPEND_CAP_ENV]: "100" }, readUsage: extractUsage, db, now: () => NOW });
    await expect(wrapped(URL_, chatInit("local-llama"))).rejects.toThrow(/no known price/);
    await expect(wrapped(URL_, chatInit("local-llama"))).rejects.toMatchObject({
      ask: { reason: "spend-cap" },
    });
    expect(calls).toHaveLength(0);
    // refused before the ledger is even touched
    expect(db.query("SELECT 1 FROM sqlite_master WHERE name = 'spend_ledger'").get()).toBeNull();
  });

  test("invalid cap stops every call (fail closed) without echoing the value", async () => {
    const { fetch, calls } = mockFetch();
    const wrapped = withSpendCap(fetch, { env: { [SPEND_CAP_ENV]: "five-dollars" }, readUsage: extractUsage });
    let msg = "";
    try {
      await wrapped(URL_, chatInit("gpt-4o-mini"));
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain("not a plain USD amount");
    expect(msg).not.toContain("five-dollars");
    expect(calls).toHaveLength(0);
  });

  test("HTTP error reply counts 0; missing usage keeps the estimate; network error keeps the estimate", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const env = { [SPEND_CAP_ENV]: "10" };
    const failing = withSpendCap(mockFetch({ status: 429, json: { error: "slow down" } }).fetch, { env, readUsage: extractUsage, db, now: () => NOW });
    expect((await failing(URL_, chatInit("gpt-4o-mini"))).status).toBe(429);
    const noUsage = withSpendCap(mockFetch({ json: { choices: [{ message: { content: "x" } }] } }).fetch, { env, readUsage: extractUsage, db, now: () => NOW + 1 });
    await noUsage(URL_, chatInit("gpt-4o-mini"));
    const broken: SpendFetch = async () => {
      throw new Error("socket hang up");
    };
    const net = withSpendCap(broken, { env, readUsage: extractUsage, db, now: () => NOW + 2 });
    await expect(net(URL_, chatInit("gpt-4o-mini"))).rejects.toThrow("socket hang up");

    const rows = ledgerRows(db);
    expect(rows.map((r) => r.status)).toEqual(["failed", "estimated", "estimated"]);
    expect(rows[0].cost_micro_usd).toBe(0);
    expect(rows[1].cost_micro_usd).toBe(rows[1].estimate_micro_usd);
    expect(rows[2].cost_micro_usd).toBe(rows[2].estimate_micro_usd);
    const w = new SpendLedger(db).window(NOW + 3);
    expect(w).toEqual({
      spentMicroUsd: rows[1].estimate_micro_usd + rows[2].estimate_micro_usd,
      calls: 2,
      estimatedCalls: 2,
      unknownCalls: 0,
    });
  });

  test("two processes share one ledger: the second sees the first reservation", () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-shared-"));
    try {
      const path = join(dir, "corvidinho.db");
      const a = new SpendLedger(openCorvidinhoDb({ path }));
      const b = new SpendLedger(openCorvidinhoDb({ path }));
      expect(a.reserve({ provider: "p", model: "m", estimateMicroUsd: 600, capMicroUsd: 1000, now: NOW }).ok).toBe(true);
      const second = b.reserve({ provider: "p", model: "m", estimateMicroUsd: 600, capMicroUsd: 1000, now: NOW });
      expect(second).toEqual({
        ok: false,
        spentMicroUsd: 600,
        trips: [{ scope: "total", spentMicroUsd: 600, capMicroUsd: 1000 }],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("spend ledger is SAFE-6 scrubbed", () => {
  const fakeKey = "s" + "k-proj-" + "a1B2c3D4e5".repeat(4);

  test("provider/model persist scrubbed and are listed in SCRUB_TARGETS", () => {
    expect(SCRUB_TARGETS).toContainEqual({ table: "spend_ledger", columns: ["provider", "model"] });
    const db = openCorvidinhoDb({ memory: true });
    const ledger = new SpendLedger(db);
    ledger.reserve({ provider: `host-${fakeKey}`, model: `m ${fakeKey}`, estimateMicroUsd: 1, capMicroUsd: 10, now: NOW });
    const dump = JSON.stringify(ledgerRows(db));
    expect(dump).not.toContain(fakeKey);
    expect(dump).toContain("[redacted:openai-key]");
  });

  test("re-scrub covers rows written raw", () => {
    const db = openCorvidinhoDb({ memory: true });
    new SpendLedger(db);
    db.run(
      "INSERT INTO spend_ledger (id, ts, provider, model, status, estimate_micro_usd, cost_micro_usd) VALUES ('r1', 1, 'p', ?, 'actual', 1, 1)",
      [`raw ${fakeKey}`],
    );
    const { byTable } = rescrubDatabase(db);
    expect(byTable.spend_ledger).toBe(1);
    expect(JSON.stringify(ledgerRows(db))).not.toContain(fakeKey);
  });
});

describe("createTaskExecute hook", () => {
  test("a capped run stops before the provider call and ends the attempt with a spend-cap ask", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-exec-"));
    try {
      const { fetch, calls } = mockFetch();
      const exec = createTaskExecute({
        taskText: "do a thing",
        env: {
          CORVIDINHO_LLM_API_KEY: "test-key",
          CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
          CORVIDINHO_LLM_MODEL: "gpt-4o-mini",
          CORVIDINHO_LLM_TIER: "read",
          CORVIDINHO_DATA_DIR: dir,
          [SPEND_CAP_ENV]: "0",
        },
        fetchImpl: fetch,
        loadPlugins: false,
      });
      const result = await exec({ attempt: 1, signal: new AbortController().signal });
      expect(calls).toHaveLength(0);
      expect(result.ask?.reason).toBe("spend-cap");
      // Generic summary (safe for a public reply); the details are in the ask.
      expect(result.summary).toBe(SPEND_CAP_SUMMARY);
      expect(result.ask?.question).toStartWith("Daily spend cap reached (SAFE-8)");
      expect(result.ask?.question).toContain("of the $0.00 cap");
      expect(result.filesChanged).toEqual([]);
      expect(existsSync(join(dir, "corvidinho.db"))).toBe(true);
      // The next attempt starts clean (the ask is taken once).
      const again = await exec({ attempt: 2, signal: new AbortController().signal });
      expect(again.ask?.reason).toBe("spend-cap");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a capped run under the cap records the call in the shared ledger", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-exec-"));
    try {
      const { fetch, calls } = mockFetch();
      const env = {
        CORVIDINHO_LLM_API_KEY: "test-key",
        CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
        CORVIDINHO_LLM_MODEL: "gpt-4o-mini",
        CORVIDINHO_LLM_TIER: "read",
        CORVIDINHO_DATA_DIR: dir,
        [SPEND_CAP_ENV]: "5",
      };
      const exec = createTaskExecute({ taskText: "do a thing", env, fetchImpl: fetch, loadPlugins: false });
      const result = await exec({ attempt: 1, signal: new AbortController().signal });
      expect(result.summary).toBe("ok");
      expect(calls).toHaveLength(1);
      const line = spendDoctorCheck({ env, model: "gpt-4o-mini" });
      expect(line).toEqual({
        ok: true,
        mark: "ok",
        detail: expect.stringContaining("$0.0005 of $5.00 daily cap used in the last 24h (0%; 1 provider call(s)"),
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("spendDoctorCheck (AUTONOMOUS-8)", () => {
  test("info line when no cap is set (no DB opened)", () => {
    expect(spendDoctorCheck({ env: {}, model: "gpt-4o-mini" })).toEqual({
      ok: true,
      mark: "info",
      detail: `no daily cap set (${SPEND_CAP_ENV}); provider spend is not tracked`,
    });
  });

  test("invalid cap warns; unpriced model warns; never fails doctor", () => {
    const invalid = spendDoctorCheck({ env: { [SPEND_CAP_ENV]: "nope" }, model: "gpt-4o-mini" });
    expect(invalid).toMatchObject({ ok: true, mark: "warn" });
    expect(invalid.detail).not.toContain("nope");
    const db = openCorvidinhoDb({ memory: true });
    const unpriced = spendDoctorCheck({ env: { [SPEND_CAP_ENV]: "5" }, model: "local-llama", db, now: NOW });
    expect(unpriced).toMatchObject({ ok: true, mark: "warn" });
    expect(unpriced.detail).toContain("no known price");
    expect(unpriced.detail).toContain("runs stop and ask");
  });

  test("shows estimated calls separately", () => {
    const db = openCorvidinhoDb({ memory: true });
    new SpendLedger(db).reserve({ provider: "p", model: "gpt-4o", estimateMicroUsd: 12_345, capMicroUsd: 5_000_000, now: NOW });
    const line = spendDoctorCheck({ env: { [SPEND_CAP_ENV]: "5" }, model: "gpt-4o", db, now: NOW });
    expect(line.detail).toContain("$0.0124 of $5.00");
    expect(line.detail).toContain("1 counted at its estimate");
  });
});

describe("doctor CLI", () => {
  test("prints an info spend line without a cap and spend vs cap with one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-doctor-"));
    try {
      const run = async (extra: Record<string, string>) => {
        const env: Record<string, string | undefined> = { ...process.env, CORVIDINHO_DATA_DIR: dir };
        delete env[SPEND_CAP_ENV];
        Object.assign(env, extra);
        const proc = Bun.spawn(["bun", "--no-env-file", "src/cli.ts", "doctor"], {
          cwd: join(import.meta.dir, ".."),
          env,
          stdout: "pipe",
          stderr: "pipe",
        });
        const out = await new Response(proc.stdout).text();
        await proc.exited;
        return out;
      };
      expect(await run({})).toContain(`[info] spend: no daily cap set (${SPEND_CAP_ENV})`);
      const capped = await run({ [SPEND_CAP_ENV]: "5", CORVIDINHO_LLM_MODEL: "gpt-4o-mini" });
      expect(capped).toContain("[ok] spend: $0.00 of $5.00 daily cap used in the last 24h (0%; 0 provider call(s)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
