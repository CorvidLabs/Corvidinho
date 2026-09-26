/**
 * SAFE-8 as amended on #98 — warn at 80% of the daily spend cap, and at 100%
 * stop before the provider call and ask (AUTONOMY-1/2 ask path) instead of
 * refusing; AUTONOMOUS-8 doctor / status lines (REQ-agent-098 / REQ-cli-098).
 * Mocked fetch or a localhost mock LLM only — no network, no real keys.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskExecute, extractUsage } from "../src/agent/execute.ts";
import { runTask } from "../src/agent/loop.ts";
import {
  createSpendGuard,
  readSpendSnapshot,
  SPEND_CAP_ENV,
  SPEND_WINDOW_MS,
  SpendCapRefusal,
  SpendLedger,
  type SpendFetch,
} from "../src/agent/spend.ts";
import {
  formatSpendDoctorLine,
  formatSpendStatusLine,
  formatSpendWarningLine,
  SPEND_WARN_PERCENT,
  spendCapInvalidAsk,
  spendCapLedgerAsk,
  spendCapReachedAsk,
  spendCapUnpricedAsk,
  spendPercent,
  spendWarningFromUnknown,
  type SpendSnapshot,
} from "../src/agent/spend-notice.ts";
import type { AgentEvent, SpendWarning, TaskResult } from "../src/agent/types.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const NOW = 1_800_000_000_000;
const CAP = 1_000_000;
const URL_ = "https://llm.test/v1/chat/completions";

function mockFetch(): { fetch: SpendFetch; calls: number[] } {
  const calls: number[] = [];
  const fetch: SpendFetch = async () => {
    calls.push(1);
    return Response.json({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
    });
  };
  return { fetch, calls };
}

function chatInit(model: string): RequestInit {
  return { method: "POST", body: JSON.stringify({ model, messages: [{ role: "user", content: "hello" }] }) };
}

function seed(ledger: SpendLedger, microUsd: number, now: number) {
  ledger.reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: microUsd, capMicroUsd: Number.MAX_SAFE_INTEGER, now });
}

describe("80% warning is recorded once per crossing (SpendLedger.noteWarning)", () => {
  test("below 80% → nothing; at 80% → one warning; repeats stay quiet", () => {
    const db = openCorvidinhoDb({ memory: true });
    const ledger = new SpendLedger(db);
    seed(ledger, 799_999, NOW - 10);
    expect(ledger.noteWarning({ capMicroUsd: CAP, now: NOW })).toBeNull();
    seed(ledger, 1, NOW - 5);
    expect(ledger.noteWarning({ capMicroUsd: CAP, now: NOW })).toEqual({
      spentMicroUsd: 800_000,
      capMicroUsd: CAP,
      percent: 80,
    });
    expect(ledger.noteWarning({ capMicroUsd: CAP, now: NOW + 1 })).toBeNull();
    expect(db.query("SELECT kind, cap_micro_usd, spent_micro_usd FROM spend_alerts").all()).toEqual([
      { kind: "warn", cap_micro_usd: CAP, spent_micro_usd: 800_000 },
    ]);
  });

  test("a new cap value re-arms it; a zero cap never warns", () => {
    const ledger = new SpendLedger(openCorvidinhoDb({ memory: true }));
    seed(ledger, 900_000, NOW - 10);
    expect(ledger.noteWarning({ capMicroUsd: CAP, now: NOW })).not.toBeNull();
    expect(ledger.noteWarning({ capMicroUsd: 1_100_000, now: NOW })).toMatchObject({ percent: 81 });
    expect(ledger.noteWarning({ capMicroUsd: 0, now: NOW })).toBeNull();
  });

  test("24 h after the last warning a still-high spend warns again", () => {
    const ledger = new SpendLedger(openCorvidinhoDb({ memory: true }));
    seed(ledger, 900_000, NOW - 10);
    expect(ledger.noteWarning({ capMicroUsd: CAP, now: NOW })).not.toBeNull();
    const later = NOW + SPEND_WINDOW_MS;
    seed(ledger, 850_000, later - 10);
    expect(ledger.noteWarning({ capMicroUsd: CAP, now: later })).toMatchObject({ spentMicroUsd: 850_000 });
  });

  test("two processes on one DB file warn once between them", () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-warn-"));
    try {
      const path = join(dir, "corvidinho.db");
      const a = new SpendLedger(openCorvidinhoDb({ path }));
      const b = new SpendLedger(openCorvidinhoDb({ path }));
      seed(a, 850_000, NOW - 10);
      const hits = [a.noteWarning({ capMicroUsd: CAP, now: NOW }), b.noteWarning({ capMicroUsd: CAP, now: NOW })];
      expect(hits.filter(Boolean)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("createSpendGuard (warn at 80%, ask at 100%)", () => {
  test("the call that crosses 80% fires onWarning once; later calls do not", async () => {
    const db = openCorvidinhoDb({ memory: true });
    seed(new SpendLedger(db), 799_800, NOW - 10);
    const { fetch, calls } = mockFetch();
    const warnings: SpendWarning[] = [];
    const guard = createSpendGuard(fetch, {
      env: { [SPEND_CAP_ENV]: "1" },
      readUsage: extractUsage,
      db,
      now: () => NOW,
      onWarning: (w) => warnings.push(w),
    });
    await guard.fetch(URL_, chatInit("gpt-4o-mini"));
    await guard.fetch(URL_, chatInit("gpt-4o-mini"));
    expect(calls).toHaveLength(2);
    // 799_800 seeded + 450 settled usage = 800_250 ≥ 80%.
    expect(warnings).toEqual([{ spentMicroUsd: 800_250, capMicroUsd: CAP, percent: 80 }]);
  });

  test("without a listener no warning is recorded", async () => {
    const db = openCorvidinhoDb({ memory: true });
    seed(new SpendLedger(db), 900_000, NOW - 10);
    const guard = createSpendGuard(mockFetch().fetch, { env: { [SPEND_CAP_ENV]: "1" }, readUsage: extractUsage, db, now: () => NOW });
    await guard.fetch(URL_, chatInit("gpt-4o-mini"));
    expect(db.query("SELECT COUNT(*) AS n FROM spend_alerts").get()).toEqual({ n: 0 });
  });

  test("a stopped call carries the spend-cap ask; finish swaps the result once, keeping filesChanged", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const { fetch, calls } = mockFetch();
    const guard = createSpendGuard(fetch, { env: { [SPEND_CAP_ENV]: "0" }, readUsage: extractUsage, db, now: () => NOW });
    const plain = { summary: "LLM request failed: …", filesChanged: ["a.ts"] };
    expect(guard.finish(plain)).toBe(plain);
    let err: unknown;
    try {
      await guard.fetch(URL_, chatInit("gpt-4o-mini"));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SpendCapRefusal);
    expect((err as SpendCapRefusal).ask.reason).toBe("spend-cap");
    const swapped = guard.finish(plain);
    expect(swapped.ask?.reason).toBe("spend-cap");
    expect(swapped.summary).toBe(`Needs your input: ${swapped.ask!.question}`);
    expect(swapped.filesChanged).toEqual(["a.ts"]);
    expect(guard.finish(plain)).toBe(plain);
    expect(calls).toHaveLength(0);
  });

  test("no cap: finish is the identity and fetch is untouched", () => {
    const { fetch } = mockFetch();
    const guard = createSpendGuard(fetch, { env: {}, readUsage: extractUsage });
    expect(guard.fetch).toBe(fetch);
    const r = { summary: "x", filesChanged: [] };
    expect(guard.finish(r)).toBe(r);
  });
});

describe("createTaskExecute + runTask at the cap (AUTONOMY-1/2 ask path)", () => {
  function capEnv(dir: string, cap: string) {
    return {
      CORVIDINHO_LLM_API_KEY: "test-key",
      CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
      CORVIDINHO_LLM_MODEL: "gpt-4o-mini",
      CORVIDINHO_LLM_TIER: "read",
      CORVIDINHO_DATA_DIR: dir,
      [SPEND_CAP_ENV]: cap,
    };
  }

  test("run ends blocked with the spend-cap ask; verify skipped; no provider call", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-run-"));
    try {
      const { fetch, calls } = mockFetch();
      const events: AgentEvent[] = [];
      let verifyRan = false;
      const result = await runTask({
        cwd: dir,
        execute: createTaskExecute({
          taskText: "do a thing",
          env: capEnv(dir, "0"),
          fetchImpl: fetch,
          loadPlugins: false,
          projectInstructions: false,
        }),
        verifyBeforeComplete: true,
        onEvent: (e) => events.push(e),
        verifyRunner: async () => {
          verifyRan = true;
          return { success: true, output: "" };
        },
      });
      expect(calls).toHaveLength(0);
      expect(verifyRan).toBe(false);
      expect(result.state).toBe("blocked");
      expect(result.verifySkipped).toBe(true);
      expect(result.ask?.reason).toBe("spend-cap");
      expect(result.summary).toContain("Daily spend cap reached");
      expect(events).toContainEqual({ type: "StateChanged", state: "blocked" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the crossing call emits a Text warning and calls onSpendWarning; the next run is quiet", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-warn-exec-"));
    try {
      const env = capEnv(dir, "1");
      const db = openCorvidinhoDb({ env });
      seed(new SpendLedger(db), 799_800, Date.now() - 1000);
      db.close();
      const events: AgentEvent[] = [];
      const warnings: SpendWarning[] = [];
      const exec = createTaskExecute({
        taskText: "do a thing",
        env,
        fetchImpl: mockFetch().fetch,
        loadPlugins: false,
        projectInstructions: false,
        onEvent: (e) => events.push(e),
        onSpendWarning: (w) => warnings.push(w),
      });
      const r = await exec({ attempt: 1, signal: new AbortController().signal });
      expect(r.summary).toBe("ok");
      expect(r.ask).toBeUndefined();
      expect(warnings).toEqual([{ spentMicroUsd: 800_250, capMicroUsd: CAP, percent: 80 }]);
      expect(events).toEqual([{ type: "Text", text: formatSpendWarningLine(warnings[0]!) }]);
      const again: SpendWarning[] = [];
      await createTaskExecute({
        taskText: "x",
        env,
        fetchImpl: mockFetch().fetch,
        loadPlugins: false,
        projectInstructions: false,
        onSpendWarning: (w) => again.push(w),
      })({ attempt: 1, signal: new AbortController().signal });
      expect(again).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("spend notices (spend-notice.ts)", () => {
  test("percent and warning line", () => {
    expect(spendPercent(800_000, CAP)).toBe(80);
    expect(spendPercent(799_999, CAP)).toBe(79);
    expect(spendPercent(0, 0)).toBe(100);
    expect(SPEND_WARN_PERCENT).toBe(80);
    expect(formatSpendWarningLine({ spentMicroUsd: 4_100_000, capMicroUsd: 5_000_000, percent: 82 })).toBe(
      "⚠️ Spend warning (SAFE-8): $4.10 of the $5.00 daily cap used in the last 24h (82%). At the cap I stop and ask before spending more.",
    );
  });

  test("spendWarningFromUnknown keeps only valid integer amounts and recomputes percent", () => {
    expect(spendWarningFromUnknown({ spentMicroUsd: 4_100_000, capMicroUsd: 5_000_000, percent: 999 })).toEqual({
      spentMicroUsd: 4_100_000,
      capMicroUsd: 5_000_000,
      percent: 82,
    });
    for (const bad of [
      undefined,
      null,
      "80%",
      [],
      { spentMicroUsd: -1, capMicroUsd: 5 },
      { spentMicroUsd: 1.5, capMicroUsd: 5 },
      { spentMicroUsd: "1", capMicroUsd: 5 },
      { spentMicroUsd: 1, capMicroUsd: 1e16 },
      { spentMicroUsd: 1 },
    ]) {
      expect(spendWarningFromUnknown(bad)).toBeUndefined();
    }
  });

  test("ask questions state spend vs cap and how to continue; model and errors are scrubbed", () => {
    const reached = spendCapReachedAsk({ spentMicroUsd: 5_000_000, estimateMicroUsd: 2_600, capMicroUsd: 5_000_000 });
    expect(reached.reason).toBe("spend-cap");
    expect(reached.question).toContain(
      "$5.00 spent in the last 24h (100% of the $5.00 cap), and the next provider call (~$0.0026)",
    );
    expect(reached.question).toContain(`raise ${SPEND_CAP_ENV} (or unset it)`);
    expect(reached.question).toContain("wait until earlier spend leaves the 24h window");

    const fakeKey = "s" + "k-proj-" + "a1B2c3D4e5".repeat(4);
    const unpriced = spendCapUnpricedAsk(`m-${fakeKey}`, 5_000_000);
    expect(unpriced.question).not.toContain(fakeKey);
    expect(unpriced.question).toContain("$5.00 daily cap");
    expect(unpriced.question).toContain("CORVIDINHO_LLM_MODEL");
    const ledger = spendCapLedgerAsk(`disk full ${fakeKey} ${"x".repeat(500)}`);
    expect(ledger.question).not.toContain(fakeKey);
    expect(ledger.question.length).toBeLessThan(700);
    expect(spendCapInvalidAsk().question).toContain("not a plain USD amount");
  });

  test("doctor and /status lines: ok / 80% / cap / unpriced / off / invalid / unreadable", () => {
    const snap = (spent: number, priced = true): SpendSnapshot => ({
      kind: "cap",
      capMicroUsd: 5_000_000,
      window: { spentMicroUsd: spent, calls: 3, estimatedCalls: 0 },
      model: "gpt-4o-mini",
      priced,
    });
    expect(formatSpendDoctorLine(snap(1_000_000)).mark).toBe("ok");
    const warn = formatSpendDoctorLine(snap(4_000_000));
    expect(warn.mark).toBe("warn");
    expect(warn.detail).toContain("(80%; 3 provider call(s)");
    expect(warn.detail).toContain("past the 80% warning");
    expect(formatSpendDoctorLine(snap(5_000_000)).detail).toContain("cap reached — runs stop and ask");
    expect(formatSpendDoctorLine(snap(0, false)).detail).toContain("no known price");
    expect(formatSpendDoctorLine({ kind: "unreadable", error: "boom" })).toMatchObject({ ok: true, mark: "warn" });

    expect(formatSpendStatusLine(snap(1_000_000))).toBe("Spend (24h): $1.00 of $5.00 daily cap (20%)");
    expect(formatSpendStatusLine(snap(4_100_000))).toBe("Spend (24h): $4.10 of $5.00 daily cap (82%) — ⚠️ past 80%");
    expect(formatSpendStatusLine(snap(5_000_000))).toContain("🛑 cap reached, runs stop and ask");
    expect(formatSpendStatusLine(snap(0, false))).toContain("no known price");
    expect(formatSpendStatusLine({ kind: "off" })).toBe(`Spend cap: off (set ${SPEND_CAP_ENV} to track spend)`);
    expect(formatSpendStatusLine({ kind: "invalid" })).toContain("not a plain USD amount");
    expect(formatSpendStatusLine({ kind: "unreadable", error: "secret-ish detail" })).not.toContain("secret-ish");
  });

  test("readSpendSnapshot never throws and only opens the DB when a cap is set", () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-snap-"));
    try {
      expect(readSpendSnapshot({ env: { CORVIDINHO_DATA_DIR: dir }, model: "gpt-4o-mini" })).toEqual({ kind: "off" });
      expect(readdirSync(dir)).toEqual([]);
      expect(readSpendSnapshot({ env: { [SPEND_CAP_ENV]: "x" }, model: "gpt-4o-mini" })).toEqual({ kind: "invalid" });
      const s = readSpendSnapshot({ env: { CORVIDINHO_DATA_DIR: dir, [SPEND_CAP_ENV]: "2" }, model: "gpt-4o-mini" });
      expect(s).toMatchObject({ kind: "cap", capMicroUsd: 2_000_000, priced: true, window: { spentMicroUsd: 0 } });
      const blocked = join(dir, "not-a-dir");
      writeFileSync(blocked, "file");
      const bad = readSpendSnapshot({
        env: { CORVIDINHO_DATA_DIR: join(blocked, "sub"), [SPEND_CAP_ENV]: "2" },
        model: "gpt-4o-mini",
      });
      expect(bad.kind).toBe("unreadable");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("task run CLI at 80% and at the cap (localhost mock LLM)", () => {
  const root = join(import.meta.dir, "..");

  async function runCli(dir: string, seededMicroUsd: number) {
    const db = openCorvidinhoDb({ path: join(dir, "corvidinho.db") });
    if (seededMicroUsd > 0) seed(new SpendLedger(db), seededMicroUsd, Date.now() - 1000);
    db.close();
    let hits = 0;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => {
        hits += 1;
        return Response.json({
          choices: [{ message: { role: "assistant", content: "ok" } }],
          usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
        });
      },
    });
    try {
      const proc = Bun.spawn(
        ["bun", "--no-env-file", "src/cli.ts", "task", "run", "--no-verify", "--task", "hi", "--output", "json"],
        {
          cwd: root,
          stdout: "pipe",
          stderr: "pipe",
          env: {
            ...process.env,
            CORVIDINHO_LLM_API_KEY: "test-key-not-real",
            OPENAI_API_KEY: "",
            CORVIDINHO_LLM_BASE_URL: `http://127.0.0.1:${server.port}/v1`,
            CORVIDINHO_LLM_MODEL: "gpt-4o-mini",
            CORVIDINHO_LLM_TIER: "read",
            CORVIDINHO_DATA_DIR: dir,
            [SPEND_CAP_ENV]: "1",
          },
        },
      );
      const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
      return { code, parsed: JSON.parse(out) as { result: TaskResult; events: AgentEvent[] }, hits };
    } finally {
      server.stop(true);
    }
  }

  test("crossing 80% → result.spendWarning + one Text warning; the next run is quiet", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-cli-"));
    try {
      const first = await runCli(dir, 799_800);
      expect(first.code).toBe(0);
      expect(first.hits).toBe(1);
      expect(first.parsed.result.state).toBe("done");
      expect(first.parsed.result.spendWarning).toEqual({ spentMicroUsd: 800_250, capMicroUsd: CAP, percent: 80 });
      const warnings = first.parsed.events.filter(
        (e) => e.type === "Text" && e.text.startsWith("⚠️ Spend warning (SAFE-8)"),
      );
      expect(warnings).toHaveLength(1);
      const second = await runCli(dir, 0);
      expect(second.hits).toBe(1);
      expect(second.parsed.result.spendWarning).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test("at the cap → no provider call, state blocked, spend-cap ask, exit 0", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-cli-cap-"));
    try {
      const { code, parsed, hits } = await runCli(dir, 999_000);
      expect(hits).toBe(0);
      expect(code).toBe(0);
      expect(parsed.result.state).toBe("blocked");
      expect(parsed.result.ask?.reason).toBe("spend-cap");
      expect(parsed.result.ask?.question).toContain("Daily spend cap reached");
      expect(parsed.events).toContainEqual({ type: "StateChanged", state: "blocked" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
