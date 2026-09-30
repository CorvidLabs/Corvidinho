/**
 * SAFE-14.a (#98) — src/discord/spend-dm.ts: the owner's spend DMs. The 80%
 * warning (claimed from the spend alert outbox, rebuilt from its integer
 * amounts) and a cap stop's details (the run's spend-cap question, once per
 * cap episode) go to the configured owner by DM only; a DM that does not go
 * out keeps its claim and is retried on the next pass (each scheduler tick);
 * a failure is logged once per streak, with no amounts. Fixtures only:
 * in-memory DB, a fake DM function.
 */
import { describe, expect, test } from "bun:test";
import { SPEND_CAP_ENV, SpendLedger } from "../src/agent/spend.ts";
import {
  formatSpendPublicStatusLine,
  formatSpendStatusLine,
  SPEND_CAP_SUMMARY,
  SPEND_PAUSED_TEXT,
  spendCapReachedAsk,
  spendPaused,
  type SpendSnapshot,
} from "../src/agent/spend-notice.ts";
import { createSpendAlertOutbox } from "../src/agent/spend-outbox.ts";
import type { HumanAsk, SpendWarning } from "../src/agent/types.ts";
import {
  createSpendDm,
  formatSpendStopDm,
  SPEND_DM_FAILED_LOG,
  SPEND_DM_NO_PATH_LOG,
  SPEND_STOP_DM_HEAD,
  spendStopFor,
} from "../src/discord/spend-dm.ts";
import type { SendPrivateDm } from "../src/discord/private-reply.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const OWNER = { discordId: "111122223333444455", display: "Leif" };
const CAP_ASK: HumanAsk = spendCapReachedAsk({
  spentMicroUsd: 4_999_000,
  estimateMicroUsd: 2_600,
  capMicroUsd: 5_000_000,
});
const WARNING: SpendWarning = { spentMicroUsd: 4_100_000, capMicroUsd: 5_000_000, percent: 82 };

/** A DM function that records sends and fails while `fail()` is true. */
function fakeDm(fail: () => boolean | "throw" = () => false) {
  const sent: Array<{ userId: string; content: string }> = [];
  const fn: SendPrivateDm = async ({ userId, content }) => {
    const f = fail();
    if (f === "throw") throw new Error("Cannot send messages to this user");
    if (f) return null;
    sent.push({ userId, content });
    return { channelId: "dm", messageId: `dm_${sent.length}` };
  };
  return { fn, sent };
}

/** A shared DB with one pending 80% warning ($0.85 of a $1.00 cap). */
function pendingWarningDb() {
  const db = openCorvidinhoDb({ memory: true });
  const ledger = new SpendLedger(db);
  ledger.reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: 850_000, capMicroUsd: 1e12, now: Date.now() - 1000 });
  expect(ledger.noteWarning({ capMicroUsd: 1_000_000, now: Date.now() })).not.toBeNull();
  return db;
}

describe("the public spend text (src/agent/spend-notice.ts, SAFE-14.a)", () => {
  const window = (spent: number) => ({ spentMicroUsd: spent, calls: 3, estimatedCalls: 0 });
  const cap = (spent: number, priced = true): SpendSnapshot => ({
    kind: "cap",
    capMicroUsd: 5_000_000,
    window: window(spent),
    model: "gpt-4o-mini",
    priced,
  });

  test("a stopped run's summary is the generic pause, with no amounts or setting names", () => {
    expect(SPEND_PAUSED_TEXT).toBe("Work is paused for budget.");
    expect(SPEND_CAP_SUMMARY).toBe(SPEND_PAUSED_TEXT);
  });

  test("anyone but the owner gets a /status line only while runs stop at the spend check, and it names nothing", () => {
    const paused = `Spend: ${SPEND_PAUSED_TEXT}`;
    expect(formatSpendPublicStatusLine({ kind: "off" })).toBeUndefined();
    expect(formatSpendPublicStatusLine(cap(4_100_000))).toBeUndefined();
    expect(formatSpendPublicStatusLine(cap(5_000_000))).toBe(paused);
    expect(formatSpendPublicStatusLine(cap(1, false))).toBe(paused);
    expect(formatSpendPublicStatusLine({ kind: "invalid" })).toBe(paused);
    expect(formatSpendPublicStatusLine({ kind: "unreadable", error: "disk I/O error at /secret/path" })).toBe(paused);
    expect([spendPaused({ kind: "off" }), spendPaused(cap(4_999_999)), spendPaused(cap(5_000_001))]).toEqual([false, false, true]);
    // The owner's line keeps the amounts and the setting.
    expect(formatSpendStatusLine(cap(4_100_000))).toBe("Spend (24h): $4.10 of $5.00 daily cap (82%) — ⚠️ past 80%");
  });
});

describe("formatSpendStopDm / spendStopFor", () => {
  test("the stop DM heads with the generic pause, names the channel and quotes the scrubbed, defanged question", () => {
    const text = formatSpendStopDm({ ask: CAP_ASK, channelId: "123" });
    const lines = text.split("\n");
    expect(lines[0]).toBe(SPEND_STOP_DM_HEAD);
    expect(lines[0]).toBe("💸 Work is paused for budget. Only you see these details (SAFE-14.a).");
    expect(lines[1]).toBe("In <#123>:");
    expect(lines[2]).toStartWith("> Daily spend cap reached (SAFE-8): $4.9990 spent in the last 24h");
    expect(text).toContain(SPEND_CAP_ENV);
    const risky = formatSpendStopDm({
      ask: { reason: "spend-cap", question: "cap @everyone sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH" },
    });
    expect(risky).not.toContain("@everyone");
    expect(risky).not.toContain("sk-ant-api03-abcdefghijklmnopqrstuvwxyz");
    expect(risky).not.toContain("In <#");
  });

  test("a stop is handed to the DM only for a spend-cap ask whose post claimed the owner's ping", () => {
    const claimed = { owner: OWNER, deduped: false, release: () => {} };
    const deduped = { owner: null, deduped: true, release: () => {} };
    expect(spendStopFor(CAP_ASK, claimed, "c")).toEqual({ ask: CAP_ASK, channelId: "c" });
    expect(spendStopFor(CAP_ASK, deduped, "c")).toBeUndefined();
    expect(spendStopFor(CAP_ASK, null)).toBeUndefined();
    expect(spendStopFor({ reason: "stuck", question: "help" }, claimed)).toBeUndefined();
    expect(spendStopFor(undefined, claimed)).toBeUndefined();
  });
});

describe("createSpendDm", () => {
  test("DMs the owner the pending warning once (claimed from the outbox, current amounts) and a stop's details", async () => {
    const db = pendingWarningDb();
    const dm = fakeDm();
    const spend = createSpendDm({
      outbox: createSpendAlertOutbox({ db, env: {} }),
      owner: () => OWNER,
      sendDm: () => dm.fn,
      log: () => {},
    });
    expect(await spend.deliver({ stop: { ask: CAP_ASK, channelId: "c1" } })).toEqual({ stop: "sent", warning: "sent" });
    expect(dm.sent.map((d) => d.userId)).toEqual([OWNER.discordId, OWNER.discordId]);
    expect(dm.sent[0]!.content).toStartWith(SPEND_STOP_DM_HEAD);
    expect(dm.sent[1]!.content).toBe(
      "⚠️ Spend warning (SAFE-8): $0.85 of the $1.00 daily cap used in the last 24h (85%). At the cap I stop and ask before spending more.",
    );
    // Delivered: the next pass has nothing to send.
    expect(await spend.deliver()).toEqual({ stop: "none", warning: "none" });
    expect(dm.sent).toHaveLength(2);
    expect(spend.waiting()).toBe(false);
  });

  test("without a DB the run's own warning is DMed", async () => {
    const dm = fakeDm();
    const spend = createSpendDm({ outbox: createSpendAlertOutbox({}), owner: () => OWNER, sendDm: () => dm.fn, log: () => {} });
    expect((await spend.deliver({ warning: WARNING })).warning).toBe("sent");
    expect(dm.sent[0]!.content).toContain("$4.10 of the $5.00 daily cap used in the last 24h (82%)");
  });

  test("a DM that does not go out keeps its claim and is retried on the next pass; the failure is logged once per streak, with no amounts", async () => {
    const db = pendingWarningDb();
    let failing: boolean | "throw" = true;
    const dm = fakeDm(() => failing);
    const logs: string[] = [];
    const spend = createSpendDm({
      outbox: createSpendAlertOutbox({ db, env: {} }),
      owner: () => OWNER,
      sendDm: () => dm.fn,
      log: (l) => logs.push(l),
    });
    expect(await spend.deliver({ stop: { ask: CAP_ASK } })).toEqual({ stop: "failed", warning: "failed" });
    expect(spend.waiting()).toBe(true);
    failing = "throw";
    expect(await spend.deliver()).toEqual({ stop: "failed", warning: "failed" });
    expect(logs).toEqual([SPEND_DM_FAILED_LOG]);
    for (const l of logs) expect(l).not.toMatch(/\$\d|CORVIDINHO_|\d+%/);
    // The owner opens their DMs: the next tick delivers both, once.
    failing = false;
    expect(await spend.deliver()).toEqual({ stop: "sent", warning: "sent" });
    expect(dm.sent).toHaveLength(2);
    expect(spend.waiting()).toBe(false);
    expect(await spend.deliver()).toEqual({ stop: "none", warning: "none" });
    // A new streak logs again.
    failing = true;
    await spend.deliver({ stop: { ask: CAP_ASK } });
    expect(logs).toEqual([SPEND_DM_FAILED_LOG, SPEND_DM_FAILED_LOG]);
  });

  test("a newer stop replaces a held one (the owner gets the latest details, once)", async () => {
    let failing = true;
    const dm = fakeDm(() => failing);
    const spend = createSpendDm({ owner: () => OWNER, sendDm: () => dm.fn, log: () => {} });
    await spend.deliver({ stop: { ask: { reason: "spend-cap", question: "first" } } });
    await spend.deliver({ stop: { ask: { reason: "spend-cap", question: "second" } } });
    failing = false;
    await spend.deliver();
    expect(dm.sent.map((d) => d.content.split("\n").at(-1))).toEqual(["> second"]);
  });

  test("no owner configured: nothing is claimed or sent (the warning stays pending); no DM path yet: nothing is claimed, one log line, delivered once the path exists", async () => {
    const db = pendingWarningDb();
    const outbox = createSpendAlertOutbox({ db, env: { [SPEND_CAP_ENV]: "1" } });
    const dm = fakeDm();
    const logs: string[] = [];
    const nobody = createSpendDm({ outbox, owner: () => null, sendDm: () => dm.fn, log: (l) => logs.push(l) });
    expect(await nobody.deliver({ stop: { ask: CAP_ASK } })).toEqual({ stop: "none", warning: "none" });
    expect(dm.sent).toHaveLength(0);
    let path: SendPrivateDm | undefined;
    const later = createSpendDm({ outbox, owner: () => OWNER, sendDm: () => path, log: (l) => logs.push(l) });
    await later.deliver({ stop: { ask: CAP_ASK } });
    await later.deliver();
    expect(logs).toEqual([SPEND_DM_NO_PATH_LOG]);
    path = dm.fn;
    expect(await later.deliver()).toEqual({ stop: "sent", warning: "sent" });
    expect(dm.sent).toHaveLength(2);
  });

  test("passes run one at a time: two concurrent passes send a held stop once", async () => {
    const dm = fakeDm();
    const slow: SendPrivateDm = async (o) => {
      await Bun.sleep(5);
      return dm.fn(o);
    };
    const spend = createSpendDm({ owner: () => OWNER, sendDm: () => slow, log: () => {} });
    await Promise.all([spend.deliver({ stop: { ask: CAP_ASK } }), spend.deliver(), spend.deliver()]);
    expect(dm.sent).toHaveLength(1);
  });
});
