/**
 * SAFE-14 / SAFE-15 (#98) — rolling 24 h spend caps per provider plus the
 * total cap. CORVIDINHO_DAILY_SPEND_CAP_USD stays the total cap;
 * CORVIDINHO_PROVIDER_SPEND_CAPS_USD is a comma list of `provider=USD` keyed
 * on the configured provider id (the endpoint host, AGENT-13 `providerId`).
 * Each cap warns once per crossing at 80% and stops and asks at 100%; a bad
 * setting stops every call without echoing its value; a cap stop is a
 * SpendCapRefusal (never a model failure, so AGENT-11 fallback never routes
 * around it); only the owner sees amounts and scopes (SAFE-14.a).
 * Mocked fetch, in-memory or temp SQLite, a spawned CLI doctor — no network.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { askFromUnknown } from "../src/agent/ask.ts";
import { createTaskExecute, extractUsage } from "../src/agent/execute.ts";
import {
  configuredProviderIds,
  createSpendGuard,
  parseProviderCapList,
  parseSpendCaps,
  PROVIDER_SPEND_CAPS_ENV,
  readSpendSnapshot,
  SPEND_CAP_ENV,
  spendDoctorChecks,
  SpendCapRefusal,
  SpendLedger,
  type SpendFetch,
} from "../src/agent/spend.ts";
import { claimSpendWarnings, ensureSpendAlerts } from "../src/agent/spend-alerts.ts";
import {
  formatSpendPublicStatusLine,
  formatSpendStatusLine,
  formatSpendWarningLine,
  SPEND_CAP_SUMMARY,
  SPEND_PAUSED_TEXT,
  spendCapInvalidAsk,
  spendCapReachedAsk,
  spendCapUnpricedAsk,
  spendPaused,
  spendScopesOf,
  spendWarningFromUnknown,
} from "../src/agent/spend-notice.ts";
import { createSpendAlertOutbox } from "../src/agent/spend-outbox.ts";
import type { HumanAsk, SpendWarning } from "../src/agent/types.ts";
import { askPingKey, formatAskReply } from "../src/discord/ask-ping.ts";
import { createSpendDm, formatSpendWarningDm } from "../src/discord/spend-dm.ts";
import { askPingOwner } from "../src/discord/spend-post.ts";
import type { SendPrivateDm } from "../src/discord/private-reply.ts";
import type { Database } from "bun:sqlite";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { rescrubDatabase, SCRUB_TARGETS } from "../src/store/scrub.ts";

const NOW = 1_800_000_000_000;
const OPENAI = "api.openai.com";
const ANTHROPIC = "api.anthropic.com";
const OPENAI_URL = `https://${OPENAI}/v1/chat/completions`;
const ANTHROPIC_URL = `https://${ANTHROPIC}/v1/chat/completions`;
const OWNER = { discordId: "111122223333444455", display: "Leif" };

/** Two configured providers: OpenAI (head) and Anthropic (second chain entry). */
function modelEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    CORVIDINHO_LLM_MODEL: "openai:gpt-4o-mini,anthropic:claude-haiku-4-5",
    CORVIDINHO_LLM_API_KEY: "test-key",
    ANTHROPIC_API_KEY: "test-key",
    ...extra,
  };
}

function mockFetch(): { fetch: SpendFetch; hosts: string[] } {
  const hosts: string[] = [];
  const fetch: SpendFetch = async (input) => {
    hosts.push(new URL(String(input)).host);
    return Response.json({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
    });
  };
  return { fetch, hosts };
}

function chatInit(model: string): RequestInit {
  return { method: "POST", body: JSON.stringify({ model, messages: [{ role: "user", content: "hello" }] }) };
}

function seed(ledger: SpendLedger, provider: string, microUsd: number, now = NOW - 1000) {
  const r = ledger.reserve({ provider, model: "gpt-4o-mini", estimateMicroUsd: microUsd, now });
  expect(r.ok).toBe(true);
}

async function refusal(p: Promise<unknown>): Promise<SpendCapRefusal> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(SpendCapRefusal);
    return err as SpendCapRefusal;
  }
  throw new Error("expected a spend-cap stop");
}

describe("CORVIDINHO_PROVIDER_SPEND_CAPS_USD (SAFE-14)", () => {
  test("keys are the configured provider ids: every chain entry of every tier key", () => {
    const env = modelEnv({
      CORVIDINHO_LLM_MODEL_READ: "ollama:qwen3:8b",
      OLLAMA_HOST: "127.0.0.1:11434",
    });
    expect([...configuredProviderIds(env)].sort()).toEqual([ANTHROPIC, OPENAI, "127.0.0.1:11434"].sort());
    expect([...configuredProviderIds({ CORVIDINHO_LLM_MODEL: "gpt-4o", CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1" })]).toEqual([
      "llm.test",
    ]);
    expect(configuredProviderIds({}).size).toBe(0);
  });

  test("every cap is optional: off, total only, providers only, both", () => {
    expect(parseSpendCaps(modelEnv())).toEqual({ kind: "off" });
    expect(parseSpendCaps(modelEnv({ [PROVIDER_SPEND_CAPS_ENV]: "  " }))).toEqual({ kind: "off" });
    expect(parseSpendCaps(modelEnv({ [SPEND_CAP_ENV]: "5" }))).toEqual({
      kind: "caps",
      totalMicroUsd: 5_000_000,
      providers: new Map(),
    });
    expect(parseSpendCaps(modelEnv({ [PROVIDER_SPEND_CAPS_ENV]: `${OPENAI}=3, API.Anthropic.com = 2.50` }))).toEqual({
      kind: "caps",
      totalMicroUsd: null,
      providers: new Map([
        [OPENAI, 3_000_000],
        [ANTHROPIC, 2_500_000],
      ]),
    });
    expect(parseSpendCaps(modelEnv({ [SPEND_CAP_ENV]: "5", [PROVIDER_SPEND_CAPS_ENV]: `${OPENAI}=0` }))).toEqual({
      kind: "caps",
      totalMicroUsd: 5_000_000,
      providers: new Map([[OPENAI, 0]]),
    });
  });

  test("a malformed entry or a key that names no configured provider makes the whole setting invalid", () => {
    for (const bad of [
      OPENAI,
      `${OPENAI}=`,
      "=5",
      `${OPENAI}=five`,
      `${OPENAI}=-1`,
      `${OPENAI}=1e3`,
      `${OPENAI}=1,,${ANTHROPIC}=2`,
      `${OPENAI}=1,`,
      `${OPENAI}=1,${OPENAI}=2`,
      "api openai.com=1",
      `${OPENAI}=2000000000`,
    ]) {
      expect(parseProviderCapList(bad)).toBeNull();
      expect(parseSpendCaps(modelEnv({ [PROVIDER_SPEND_CAPS_ENV]: bad }))).toEqual({
        kind: "invalid",
        keys: [PROVIDER_SPEND_CAPS_ENV],
      });
    }
    // Well formed, but no configured model uses that provider: invalid too.
    expect(parseProviderCapList(`${OPENAI}=1,api.mistral.ai=2`)).not.toBeNull();
    expect(parseSpendCaps(modelEnv({ [PROVIDER_SPEND_CAPS_ENV]: `${OPENAI}=1,api.mistral.ai=2` }))).toEqual({
      kind: "invalid",
      keys: [PROVIDER_SPEND_CAPS_ENV],
    });
    expect(parseSpendCaps({ [PROVIDER_SPEND_CAPS_ENV]: `${OPENAI}=1` })).toMatchObject({ kind: "invalid" });
    expect(parseSpendCaps(modelEnv({ [SPEND_CAP_ENV]: "x", [PROVIDER_SPEND_CAPS_ENV]: "nope" }))).toEqual({
      kind: "invalid",
      keys: [SPEND_CAP_ENV, PROVIDER_SPEND_CAPS_ENV],
    });
  });
});

describe("the ledger tracks spend against each cap (SAFE-14)", () => {
  test("window(now, provider) counts only that provider; an index covers (provider, ts)", () => {
    const db = openCorvidinhoDb({ memory: true });
    const ledger = new SpendLedger(db);
    seed(ledger, OPENAI, 400_000);
    seed(ledger, ANTHROPIC, 250_000);
    seed(ledger, OPENAI, 100_000, NOW - 25 * 3_600_000);
    expect(ledger.window(NOW).spentMicroUsd).toBe(650_000);
    expect(ledger.window(NOW, OPENAI)).toEqual({ spentMicroUsd: 400_000, calls: 1, estimatedCalls: 1, unknownCalls: 0 });
    expect(ledger.window(NOW, ANTHROPIC).spentMicroUsd).toBe(250_000);
    expect(ledger.window(NOW, "other.host").spentMicroUsd).toBe(0);
    const idx = db.query("PRAGMA index_list(spend_ledger)").all() as Array<{ name: string }>;
    expect(idx.map((i) => i.name)).toContain("idx_spend_ledger_provider_ts");
    const cols = db.query("PRAGMA index_info(idx_spend_ledger_provider_ts)").all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toEqual(["provider", "ts"]);
  });

  test("reserve checks the total and the call's provider cap in one go and names every tripped scope", () => {
    const ledger = new SpendLedger(openCorvidinhoDb({ memory: true }));
    seed(ledger, OPENAI, 900_000);
    seed(ledger, ANTHROPIC, 50_000);
    const base = { model: "gpt-4o-mini", estimateMicroUsd: 200_000, now: NOW };
    // Anthropic's own cap has room; the total ($0.95 + $0.20 > $1) does not.
    expect(ledger.reserve({ ...base, provider: ANTHROPIC, capMicroUsd: 1_000_000, providerCapMicroUsd: 1_000_000 })).toEqual({
      ok: false,
      spentMicroUsd: 950_000,
      trips: [{ scope: "total", spentMicroUsd: 950_000, capMicroUsd: 1_000_000 }],
    });
    // OpenAI's cap trips on OpenAI's spend alone.
    expect(ledger.reserve({ ...base, provider: OPENAI, providerCapMicroUsd: 1_000_000 })).toEqual({
      ok: false,
      spentMicroUsd: 900_000,
      trips: [{ scope: `provider:${OPENAI}`, spentMicroUsd: 900_000, capMicroUsd: 1_000_000 }],
    });
    // Both at once: total first, then the provider.
    const both = ledger.reserve({ ...base, provider: OPENAI, capMicroUsd: 1_000_000, providerCapMicroUsd: 1_000_000 });
    expect(both.ok).toBe(false);
    expect(!both.ok && both.trips.map((t) => t.scope)).toEqual(["total", `provider:${OPENAI}`]);
    // Anthropic under its own cap with no total: reserved and recorded.
    expect(ledger.reserve({ ...base, provider: ANTHROPIC, providerCapMicroUsd: 1_000_000 }).ok).toBe(true);
    expect(ledger.window(NOW, ANTHROPIC).spentMicroUsd).toBe(250_000);
  });
});

describe("the capped fetch stops and asks at 100% of each cap (SAFE-15)", () => {
  test("a provider cap stops only that provider's calls; other providers are still recorded", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const ledger = new SpendLedger(db);
    seed(ledger, OPENAI, 999_000);
    const { fetch, hosts } = mockFetch();
    const guard = createSpendGuard(fetch, {
      env: modelEnv({ [PROVIDER_SPEND_CAPS_ENV]: `${OPENAI}=1` }),
      readUsage: extractUsage,
      db,
      now: () => NOW,
    });
    const stop = await refusal(guard.fetch(OPENAI_URL, chatInit("gpt-4o-mini")));
    expect(hosts).toEqual([]);
    expect(stop.ask.reason).toBe("spend-cap");
    expect(stop.ask.spendScopes).toEqual([`provider:${OPENAI}`]);
    expect(stop.ask.question).toStartWith("Daily spend cap reached (SAFE-15): $0.9990 spent on api.openai.com in the last 24h (99% of its $1.00 cap)");
    expect(stop.ask.question).toContain(`Stopped at cap: provider:${OPENAI}.`);
    expect(stop.ask.question).toContain(`raises the ${OPENAI} entry of ${PROVIDER_SPEND_CAPS_ENV} (or removes it)`);
    expect(stop.ask.question).not.toContain(SPEND_CAP_ENV);
    // SAFE-14.a: the run's summary names nothing.
    const done = guard.finish({ summary: "partial", filesChanged: ["a.ts"] });
    expect(done).toEqual({ summary: SPEND_CAP_SUMMARY, filesChanged: ["a.ts"], ask: stop.ask });

    // Anthropic has no cap of its own and there is no total: sent and recorded.
    await guard.fetch(ANTHROPIC_URL, chatInit("claude-haiku-4-5"));
    expect(hosts).toEqual([ANTHROPIC]);
    expect(ledger.window(NOW, ANTHROPIC).calls).toBe(1);
    expect(ledger.window(NOW, ANTHROPIC).spentMicroUsd).toBeGreaterThan(0);
  });

  test("the total cap still applies over every provider, and a call past both names both", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const ledger = new SpendLedger(db);
    seed(ledger, OPENAI, 600_000);
    seed(ledger, ANTHROPIC, 399_000);
    const { fetch, hosts } = mockFetch();
    const guard = createSpendGuard(fetch, {
      env: modelEnv({ [SPEND_CAP_ENV]: "1", [PROVIDER_SPEND_CAPS_ENV]: `${OPENAI}=0.6,${ANTHROPIC}=5` }),
      readUsage: extractUsage,
      db,
      now: () => NOW,
    });
    const total = await refusal(guard.fetch(ANTHROPIC_URL, chatInit("claude-haiku-4-5")));
    expect(total.ask.spendScopes).toEqual(["total"]);
    expect(total.ask.question).toStartWith("Daily spend cap reached (SAFE-8): $0.9990 spent in the last 24h (99% of the $1.00 cap)");
    expect(total.ask.question).toContain("Stopped at cap: total.");
    const both = await refusal(guard.fetch(OPENAI_URL, chatInit("gpt-4o-mini")));
    expect(both.ask.spendScopes).toEqual(["total", `provider:${OPENAI}`]);
    expect(both.ask.question).toContain("would pass 2 caps");
    expect(both.ask.question).toContain(`Stopped at caps: total, provider:${OPENAI}.`);
    expect(both.ask.question).toContain(`raises ${SPEND_CAP_ENV} (or unsets it) and the ${OPENAI} entry of ${PROVIDER_SPEND_CAPS_ENV}`);
    expect(hosts).toEqual([]);
  });

  test("a bad provider setting stops every call, before the ledger opens, and never echoes the value", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-caps-bad-"));
    try {
      const secretish = "sk-proj-" + "a1B2c3D4e5".repeat(4);
      const { fetch, hosts } = mockFetch();
      const guard = createSpendGuard(fetch, {
        env: modelEnv({ CORVIDINHO_DATA_DIR: dir, [PROVIDER_SPEND_CAPS_ENV]: `${OPENAI}=1,${secretish}=2` }),
        readUsage: extractUsage,
        now: () => NOW,
      });
      for (const url of [OPENAI_URL, ANTHROPIC_URL]) {
        const stop = await refusal(guard.fetch(url, chatInit("gpt-4o-mini")));
        expect(stop.ask.question).toContain(`${PROVIDER_SPEND_CAPS_ENV} is set but is not a comma list of provider=USD entries for configured providers`);
        expect(stop.ask.question).not.toContain(secretish);
        expect(stop.ask.question).not.toContain(`${OPENAI}=1`);
      }
      expect(hosts).toEqual([]);
      expect(readdirSync(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an unpriced model stops under a cap that covers its call; with no cap covering it, it runs unrecorded", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const { fetch, hosts } = mockFetch();
    const guard = createSpendGuard(fetch, {
      env: modelEnv({ [PROVIDER_SPEND_CAPS_ENV]: `${OPENAI}=1` }),
      readUsage: extractUsage,
      modelKey: "CORVIDINHO_LLM_MODEL",
      db,
      now: () => NOW,
    });
    const stop = await refusal(guard.fetch(OPENAI_URL, chatInit("gpt-9-unpriced")));
    expect(stop.ask.spendScopes).toEqual([`provider:${OPENAI}`]);
    expect(stop.ask.question).toContain("has no known price");
    expect(stop.ask.question).toContain(`the $1.00 daily cap for ${OPENAI}`);
    expect(stop.ask.question).toContain(`removes the ${OPENAI} entry of ${PROVIDER_SPEND_CAPS_ENV}`);
    // SAFE-16 / interview round 13: no cap covers Anthropic here, so it runs;
    // its unknown cost is never recorded as $0.
    await guard.fetch(ANTHROPIC_URL, chatInit("claude-unpriced"));
    expect(hosts).toEqual([ANTHROPIC]);
    expect(new SpendLedger(db).window(NOW).calls).toBe(0);
  });

  test("80% warns once per crossing of each cap, with the provider's scope", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const ledger = new SpendLedger(db);
    seed(ledger, OPENAI, 799_000);
    const warnings: SpendWarning[] = [];
    const { fetch } = mockFetch();
    const guard = createSpendGuard(fetch, {
      env: modelEnv({ [SPEND_CAP_ENV]: "2", [PROVIDER_SPEND_CAPS_ENV]: `${OPENAI}=1,${ANTHROPIC}=5` }),
      readUsage: extractUsage,
      onWarning: (w) => warnings.push(w),
      db,
      now: () => NOW,
    });
    await guard.fetch(OPENAI_URL, chatInit("gpt-4o-mini")); // +$0.00045: OpenAI crosses 80%
    expect(warnings).toEqual([]);
    seed(ledger, OPENAI, 1_000);
    await guard.fetch(OPENAI_URL, chatInit("gpt-4o-mini"));
    expect(warnings).toEqual([
      { spentMicroUsd: 800_900, capMicroUsd: 1_000_000, percent: 80, scope: `provider:${OPENAI}` },
    ]);
    await guard.fetch(OPENAI_URL, chatInit("gpt-4o-mini")); // still past 80%: quiet
    expect(warnings).toHaveLength(1);
    // The total crosses 80% of $2 on Anthropic spend: its own warning, no scope.
    seed(ledger, ANTHROPIC, 800_000);
    await guard.fetch(ANTHROPIC_URL, chatInit("claude-haiku-4-5"));
    expect(warnings).toHaveLength(2);
    expect(warnings[1]).toMatchObject({ capMicroUsd: 2_000_000, percent: 80 });
    expect(warnings[1]!.scope).toBeUndefined();
    expect(formatSpendWarningLine(warnings[0]!)).toBe(
      `⚠️ Spend warning (SAFE-15, provider:${OPENAI}): $0.8009 of the $1.00 daily cap for ${OPENAI} used in the last 24h (80%). At that cap I stop and ask before spending more on it.`,
    );
    const rows = db.query("SELECT kind, scope, cap_micro_usd AS cap FROM spend_alerts WHERE kind = 'warn' ORDER BY rowid").all();
    expect(rows).toEqual([
      { kind: "warn", scope: `provider:${OPENAI}`, cap: 1_000_000 },
      { kind: "warn", scope: "total", cap: 2_000_000 },
    ]);
  });

  test("a provider cap stop ends the run blocked with no provider call — the next configured model is never tried", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-caps-run-"));
    try {
      const env = modelEnv({
        CORVIDINHO_DATA_DIR: dir,
        CORVIDINHO_LLM_TIER: "read",
        [PROVIDER_SPEND_CAPS_ENV]: `${OPENAI}=0`,
      });
      const { fetch, hosts } = mockFetch();
      const r = await createTaskExecute({
        taskText: "do a thing",
        env,
        fetchImpl: fetch,
        loadPlugins: false,
        projectInstructions: false,
      })({ attempt: 1, signal: new AbortController().signal });
      expect(hosts).toEqual([]);
      expect(r.summary).toBe(SPEND_CAP_SUMMARY);
      expect(r.error).toBeUndefined();
      expect(r.ask?.reason).toBe("spend-cap");
      expect(r.ask?.spendScopes).toEqual([`provider:${OPENAI}`]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("delivery keeps each cap apart (SAFE-15 per cap, SAFE-14.a owner only)", () => {
  function twoWarningsDb() {
    const db = openCorvidinhoDb({ memory: true });
    const ledger = new SpendLedger(db);
    const t = Date.now();
    seed(ledger, OPENAI, 850_000, t - 1000);
    expect(ledger.noteWarning({ capMicroUsd: 1_000_000, now: t, provider: OPENAI })).toMatchObject({
      scope: `provider:${OPENAI}`,
    });
    seed(ledger, ANTHROPIC, 1_000_000, t - 900);
    expect(ledger.noteWarning({ capMicroUsd: 2_000_000, now: t })).toMatchObject({ percent: 92 });
    return db;
  }

  test("the outbox hands over one warning per cap, with each cap's current spend", () => {
    const db = twoWarningsDb();
    const box = createSpendAlertOutbox({ db, env: {} });
    const taken = box.takeWarning();
    expect(taken?.warnings).toEqual([
      { spentMicroUsd: 850_000, capMicroUsd: 1_000_000, percent: 85, scope: `provider:${OPENAI}` },
      { spentMicroUsd: 1_850_000, capMicroUsd: 2_000_000, percent: 92 },
    ]);
    expect(taken?.warning).toEqual(taken!.warnings![1]!);
    expect(box.takeWarning()).toBeNull();
    taken!.release();
    expect(box.takeWarning()?.warnings).toHaveLength(2);
  });

  test("a cap whose own spend fell back under 80% keeps its warning pending; the other is delivered", () => {
    const db = twoWarningsDb();
    const t = Date.now();
    // Only OpenAI's spend is below 80% of its cap now.
    const claimed = claimSpendWarnings(db, t, (scope) => (scope === "total" ? 1_850_000 : 700_000));
    expect(claimed?.warnings).toEqual([{ scope: "total", spentMicroUsd: 1_850_000, capMicroUsd: 2_000_000 }]);
    const pending = db
      .query("SELECT scope FROM spend_alerts WHERE kind = 'warn' AND delivered_at IS NULL")
      .all();
    expect(pending).toEqual([{ scope: `provider:${OPENAI}` }]);
  });

  test("the owner's DM carries one line per cap", async () => {
    const db = twoWarningsDb();
    const sent: string[] = [];
    const dm: SendPrivateDm = async ({ content }) => {
      sent.push(content);
      return { channelId: "dm", messageId: "m" };
    };
    const spend = createSpendDm({
      outbox: createSpendAlertOutbox({ db, env: {} }),
      owner: () => OWNER,
      sendDm: () => dm,
      log: () => {},
    });
    expect(await spend.deliver()).toEqual({ stop: "none", warning: "sent" });
    expect(sent).toHaveLength(1);
    const lines = sent[0]!.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toStartWith(`⚠️ Spend warning (SAFE-15, provider:${OPENAI}): $0.85 of the $1.00 daily cap for ${OPENAI}`);
    expect(lines[1]).toStartWith("⚠️ Spend warning (SAFE-8): $1.85 of the $2.00 daily cap");
    expect(formatSpendWarningDm([])).toBe("");
  });

  test("a stop pings the owner once per episode of each cap it tripped", () => {
    const db = openCorvidinhoDb({ memory: true });
    const env = modelEnv({ [SPEND_CAP_ENV]: "5", [PROVIDER_SPEND_CAPS_ENV]: `${OPENAI}=1,${ANTHROPIC}=1` });
    const box = createSpendAlertOutbox({ db, env });
    const openaiStop: HumanAsk = { reason: "spend-cap", question: "q", spendScopes: [`provider:${OPENAI}`] };
    const anthropicStop: HumanAsk = { reason: "spend-cap", question: "q", spendScopes: [`provider:${ANTHROPIC}`] };
    const totalStop: HumanAsk = { reason: "spend-cap", question: "q" };
    expect(askPingOwner(openaiStop, OWNER, box).owner).toEqual(OWNER);
    expect(askPingOwner(openaiStop, OWNER, box)).toMatchObject({ owner: null, deduped: true });
    // Another cap's stop is a new episode: it pings, and so does the total's.
    const a = askPingOwner(anthropicStop, OWNER, box);
    expect(a.owner).toEqual(OWNER);
    expect(askPingOwner(totalStop, OWNER, box).owner).toEqual(OWNER);
    expect(askPingOwner(totalStop, OWNER, box).owner).toBeNull();
    // A handed-back ping (its post failed) pings again.
    a.release();
    expect(askPingOwner(anthropicStop, OWNER, box).owner).toEqual(OWNER);
    const scopes = db.query("SELECT scope FROM spend_alerts WHERE kind = 'cap' ORDER BY rowid").all();
    expect(scopes).toEqual([{ scope: `provider:${OPENAI}` }, { scope: "total" }, { scope: `provider:${ANTHROPIC}` }]);
  });

  test("a stop stored as question text only (a schedule run's recorded ask, the daemon's) still names its caps", () => {
    const stop = spendCapReachedAsk({
      estimateMicroUsd: 2_600,
      trips: [
        { scope: "total", spentMicroUsd: 999_000, capMicroUsd: 1_000_000 },
        { scope: `provider:${OPENAI}`, spentMicroUsd: 999_000, capMicroUsd: 1_000_000 },
      ],
    });
    const stored: HumanAsk = { reason: "spend-cap", question: stop.question };
    expect(spendScopesOf(stored)).toEqual(["total", `provider:${OPENAI}`]);
    expect(askPingKey(stored)).toBe(askPingKey(stop));
    const unpriced = spendCapUnpricedAsk("m", 1_000_000, "CORVIDINHO_LLM_MODEL", `provider:${ANTHROPIC}`);
    expect(spendScopesOf({ reason: "spend-cap", question: unpriced.question })).toEqual([`provider:${ANTHROPIC}`]);
    expect(spendScopesOf({ reason: "spend-cap", question: spendCapInvalidAsk([PROVIDER_SPEND_CAPS_ENV]).question })).toBeUndefined();
    expect(spendScopesOf({ reason: "clarify", question: stop.question })).toBeUndefined();
    // The bridge claims the stored stop's own caps' episodes.
    const db = openCorvidinhoDb({ memory: true });
    const env = modelEnv({ [SPEND_CAP_ENV]: "1", [PROVIDER_SPEND_CAPS_ENV]: `${OPENAI}=1` });
    const box = createSpendAlertOutbox({ db, env });
    expect(askPingOwner({ reason: "spend-cap", question: "older stop, total cap" }, OWNER, box).owner).toEqual(OWNER);
    expect(askPingOwner(stored, OWNER, box).owner).toEqual(OWNER);
    expect(askPingOwner(stored, OWNER, box).owner).toBeNull();
  });

  test("the ask frame keeps well-formed scopes only; a schedule's ping key follows the tripped provider caps", () => {
    expect(askFromUnknown({ reason: "spend-cap", question: "q", spendScopes: ["total", `provider:${OPENAI}`] })).toEqual({
      reason: "spend-cap",
      question: "q",
      spendScopes: ["total", `provider:${OPENAI}`],
    });
    for (const bad of [["total", "provider:a b"], ["everything"], "total", [], Array(9).fill("total")]) {
      expect(askFromUnknown({ reason: "spend-cap", question: "q", spendScopes: bad })?.spendScopes).toBeUndefined();
    }
    expect(askFromUnknown({ reason: "clarify", question: "q", spendScopes: ["total"] })?.spendScopes).toBeUndefined();
    const plain = askPingKey({ reason: "spend-cap", question: "a" });
    expect(askPingKey({ reason: "spend-cap", question: "b", spendScopes: ["total"] })).toBe(plain);
    const openai = askPingKey({ reason: "spend-cap", question: "a", spendScopes: [`provider:${OPENAI}`] });
    expect(openai).not.toBe(plain);
    expect(askPingKey({ reason: "spend-cap", question: "c", spendScopes: [`provider:${ANTHROPIC}`] })).not.toBe(openai);
  });

  test("a provider warning survives the result frame; the public post names no scope or amount (SAFE-14.a)", () => {
    expect(spendWarningFromUnknown({ spentMicroUsd: 1, capMicroUsd: 2, scope: `provider:${OPENAI}` })).toEqual({
      spentMicroUsd: 1,
      capMicroUsd: 2,
      percent: 50,
      scope: `provider:${OPENAI}`,
    });
    expect(spendWarningFromUnknown({ spentMicroUsd: 1, capMicroUsd: 2, scope: "provider:x y" })?.scope).toBeUndefined();
    expect(spendWarningFromUnknown({ spentMicroUsd: 1, capMicroUsd: 2, scope: "total" })?.scope).toBeUndefined();
    const ask = spendCapReachedAsk({
      estimateMicroUsd: 2_600,
      trips: [{ scope: `provider:${OPENAI}`, spentMicroUsd: 999_000, capMicroUsd: 1_000_000 }],
    });
    const post = formatAskReply({ ask, owner: OWNER });
    expect(post.content).toContain(SPEND_PAUSED_TEXT);
    for (const leak of ["provider:", OPENAI, "$", "%", "CORVIDINHO_", "Stopped at"]) {
      expect(post.content).not.toContain(leak);
    }
  });
});

describe("spend_alerts gains its scope column in place (SAFE-14, no schema version bump)", () => {
  test("an older table gets `scope` via ALTER; its rows are the total cap's; re-scrub copes before the ALTER", () => {
    const db = openCorvidinhoDb({ memory: true });
    db.exec(`CREATE TABLE spend_alerts (id TEXT PRIMARY KEY NOT NULL, ts INTEGER NOT NULL, kind TEXT NOT NULL,
      cap_micro_usd INTEGER NOT NULL, spent_micro_usd INTEGER NOT NULL, delivered_at INTEGER)`);
    db.run("INSERT INTO spend_alerts VALUES ('old', ?, 'warn', 1000000, 900000, NULL)", [NOW]);
    expect(() => rescrubDatabase(db)).not.toThrow();
    ensureSpendAlerts(db);
    ensureSpendAlerts(db);
    expect(db.query("SELECT scope FROM spend_alerts").all()).toEqual([{ scope: "total" }]);
  });

  test("two processes adding `scope` at once: the one that loses the race carries on, a real ALTER failure still throws", async () => {
    // A DB whose first look at the table is stale: another process (a
    // parallel council voice right after an update) added the column between
    // that look and this process's ALTER.
    const stale = (db: Database, failAlter?: Error): Database => {
      let looked = false;
      return new Proxy(db, {
        get(target, prop) {
          if (prop === "query") {
            return (sql: string) => {
              if (!looked && sql.startsWith("PRAGMA table_info(spend_alerts)")) {
                looked = true;
                return { all: () => [{ name: "id" }, { name: "delivered_at" }] };
              }
              return target.query(sql);
            };
          }
          if (prop === "exec") {
            return (sql: string) => {
              if (failAlter && sql.startsWith("ALTER TABLE spend_alerts")) throw failAlter;
              return target.exec(sql);
            };
          }
          const v = Reflect.get(target, prop);
          return typeof v === "function" ? v.bind(target) : v;
        },
      });
    };
    const db = openCorvidinhoDb({ memory: true });
    ensureSpendAlerts(db);
    expect(() => ensureSpendAlerts(stale(db))).not.toThrow();
    // The guard's first call in that process is sent, not stopped over the ledger.
    const { fetch, hosts } = mockFetch();
    const guard = createSpendGuard(fetch, {
      env: modelEnv({ [SPEND_CAP_ENV]: "5" }),
      readUsage: extractUsage,
      db: stale(db),
      now: () => NOW,
    });
    await guard.fetch(OPENAI_URL, chatInit("gpt-4o-mini"));
    expect(hosts).toEqual([OPENAI]);
    // The column really missing and the ALTER failing: fail closed.
    const old = openCorvidinhoDb({ memory: true });
    old.exec(`CREATE TABLE spend_alerts (id TEXT PRIMARY KEY NOT NULL, ts INTEGER NOT NULL, kind TEXT NOT NULL,
      cap_micro_usd INTEGER NOT NULL, spent_micro_usd INTEGER NOT NULL, delivered_at INTEGER)`);
    expect(() => ensureSpendAlerts(stale(old, new Error("disk I/O error")))).toThrow("disk I/O error");
  });

  test("the scope is written scrubbed and listed in SCRUB_TARGETS", () => {
    expect(SCRUB_TARGETS).toContainEqual({ table: "spend_alerts", columns: ["scope"] });
    const db = openCorvidinhoDb({ memory: true });
    const fakeKey = "s" + "k-proj-" + "a1B2c3D4e5".repeat(4);
    const ledger = new SpendLedger(db);
    seed(ledger, `host-${fakeKey}`, 900_000);
    expect(ledger.noteWarning({ capMicroUsd: 1_000_000, now: NOW, provider: `host-${fakeKey}` })).not.toBeNull();
    const dump = JSON.stringify(db.query("SELECT * FROM spend_alerts").all());
    expect(dump).not.toContain(fakeKey);
    expect(dump).toContain("provider:host-[redacted:openai-key]");
    db.run("UPDATE spend_alerts SET scope = ?", [`provider:${fakeKey}`]);
    rescrubDatabase(db);
    expect(JSON.stringify(db.query("SELECT scope FROM spend_alerts").all())).not.toContain(fakeKey);
  });
});

describe("doctor and the owner's /status show each cap (AUTONOMOUS-8, SAFE-14.a)", () => {
  test("the snapshot, doctor lines and owner lines list the total and each provider cap", () => {
    const db = openCorvidinhoDb({ memory: true });
    const ledger = new SpendLedger(db);
    seed(ledger, OPENAI, 850_000);
    seed(ledger, ANTHROPIC, 100_000);
    const env = modelEnv({ [SPEND_CAP_ENV]: "5", [PROVIDER_SPEND_CAPS_ENV]: `${OPENAI}=1,${ANTHROPIC}=0.1` });
    const snap = readSpendSnapshot({ env, db, model: "gpt-4o-mini", now: NOW });
    expect(snap).toMatchObject({
      kind: "cap",
      capMicroUsd: 5_000_000,
      window: { spentMicroUsd: 950_000 },
      providers: [
        { provider: ANTHROPIC, capMicroUsd: 100_000, window: { spentMicroUsd: 100_000 } },
        { provider: OPENAI, capMicroUsd: 1_000_000, window: { spentMicroUsd: 850_000 } },
      ],
      priced: true,
    });
    const doctor = spendDoctorChecks({ env, db, model: "gpt-4o-mini", now: NOW });
    expect(doctor.map((l) => [l.name, l.mark])).toEqual([
      ["spend", "ok"],
      [`spend provider:${ANTHROPIC}`, "warn"],
      [`spend provider:${OPENAI}`, "warn"],
    ]);
    expect(doctor[1]!.detail).toBe(
      `$0.10 of $0.10 daily cap for ${ANTHROPIC} used in the last 24h (100%; 1 provider call(s), 1 counted at its estimate; ${PROVIDER_SPEND_CAPS_ENV}, SAFE-14); cap reached — calls to ${ANTHROPIC} stop and ask before they are sent`,
    );
    expect(doctor[2]!.detail).toContain("past the 80% warning");
    expect(doctor.every((l) => l.ok)).toBe(true);
    expect(formatSpendStatusLine(snap).split("\n")).toEqual([
      "Spend (24h): $0.95 of $5.00 daily cap (19%)",
      `Spend (24h) on ${ANTHROPIC}: $0.10 of $0.10 daily cap (100%) — 🛑 cap reached, calls to ${ANTHROPIC} stop and ask`,
      `Spend (24h) on ${OPENAI}: $0.85 of $1.00 daily cap (85%) — ⚠️ past 80%`,
    ]);
    // Anyone else: only that work is paused, while any cap is reached.
    expect(spendPaused(snap)).toBe(true);
    expect(formatSpendPublicStatusLine(snap)).toBe(`Spend: ${SPEND_PAUSED_TEXT}`);
  });

  test("provider caps alone: no total line amounts; an unpriced model only warns when a cap covers it", () => {
    const db = openCorvidinhoDb({ memory: true });
    const covered = readSpendSnapshot({
      env: { CORVIDINHO_LLM_MODEL: "ollama:qwen3:8b", [PROVIDER_SPEND_CAPS_ENV]: "127.0.0.1:11434=1" },
      db,
      model: "qwen3:8b",
      now: NOW,
    });
    expect(covered).toMatchObject({ kind: "cap", priced: false });
    expect(covered.kind === "cap" && covered.capMicroUsd).toBeUndefined();
    const uncovered = readSpendSnapshot({
      env: modelEnv({ CORVIDINHO_LLM_MODEL: "ollama:qwen3:8b,openai:gpt-4o-mini", [PROVIDER_SPEND_CAPS_ENV]: `${OPENAI}=1` }),
      db,
      model: "qwen3:8b",
      now: NOW,
    });
    expect(uncovered).toMatchObject({ kind: "cap", priced: true });
    expect(spendPaused(uncovered)).toBe(false);
    expect(formatSpendPublicStatusLine(uncovered)).toBeUndefined();
    expect(formatSpendStatusLine(uncovered).split("\n")).toEqual([
      `Spend cap (total): off (${SPEND_CAP_ENV}); per-provider caps below`,
      `Spend (24h) on ${OPENAI}: $0.00 of $1.00 daily cap (0%)`,
    ]);
    const [main] = spendDoctorChecks({
      env: modelEnv({ [PROVIDER_SPEND_CAPS_ENV]: `${OPENAI}=1` }),
      db,
      model: "gpt-4o-mini",
      now: NOW,
    });
    expect(main).toMatchObject({ name: "spend", mark: "info" });
    expect(main!.detail).toContain(`no total daily cap set (${SPEND_CAP_ENV})`);
    expect(main!.detail).not.toContain("$");
  });

  test("an invalid provider setting is named (never its value) on doctor and /status, and pauses work", () => {
    const env = modelEnv({ [PROVIDER_SPEND_CAPS_ENV]: `${OPENAI}=lots` });
    const snap = readSpendSnapshot({ env, model: "gpt-4o-mini" });
    expect(snap).toEqual({ kind: "invalid", keys: [PROVIDER_SPEND_CAPS_ENV] });
    const [line] = spendDoctorChecks({ env, model: "gpt-4o-mini" });
    expect(line).toMatchObject({ name: "spend", ok: true, mark: "warn" });
    expect(line!.detail).toContain(PROVIDER_SPEND_CAPS_ENV);
    expect(line!.detail).not.toContain("lots");
    expect(formatSpendStatusLine(snap)).toContain(`${PROVIDER_SPEND_CAPS_ENV} is not a comma list of provider=USD`);
    expect(formatSpendPublicStatusLine(snap)).toBe(`Spend: ${SPEND_PAUSED_TEXT}`);
  });

  test("`corvidinho doctor` prints a line per provider cap", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-caps-doctor-"));
    try {
      const proc = Bun.spawn(["bun", "--no-env-file", join(import.meta.dir, "..", "src/cli.ts"), "doctor"], {
        cwd: dir,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          CORVIDINHO_DATA_DIR: dir,
          CORVIDINHO_LLM_MODEL: "anthropic:claude-haiku-4-5",
          ANTHROPIC_API_KEY: "test-key-not-real",
          [PROVIDER_SPEND_CAPS_ENV]: `${ANTHROPIC}=2`,
        },
      });
      const out = await new Response(proc.stdout).text();
      await proc.exited;
      expect(out).toContain(`[info] spend: no total daily cap set (${SPEND_CAP_ENV})`);
      expect(out).toContain(
        `[ok] spend provider:${ANTHROPIC}: $0.00 of $2.00 daily cap for ${ANTHROPIC} used in the last 24h (0%; 0 provider call(s); ${PROVIDER_SPEND_CAPS_ENV}, SAFE-14)`,
      );
      expect(out).not.toContain("test-key-not-real");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
