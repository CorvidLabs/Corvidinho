/**
 * SAFE-8 / SAFE-8.a / SAFE-18 / SAFE-19 / SAFE-20 (#98, REQ-discord-198) —
 * the owner's spend card on the bridge's Approve card engine: the `spend`
 * kind (class money). A run paused at a spend cap records it; the engine DMs
 * the owner the run's task (quoted data) and then the card with the action,
 * target and amount; Approve alone lets nothing through — only Approve plus
 * the one-time code typed back does, and then exactly the paused call, once;
 * Deny, a non-owner's press, a late code or a run that is gone is a no and
 * nothing is spent. The bridge registers the kind.
 *
 * In-memory or temp-dir SQLite, the fake LLM as an injected fetch, the real
 * card engine with recording DMs, the bridge with a fake gateway; no token,
 * no network.
 */
import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractUsage } from "../src/agent/execute.ts";
import {
  createSpendGuard,
  setSpendCardTestHooks,
  SPEND_CAP_ENV,
  SpendCapRefusal,
  SpendLedger,
  type SpendFetch,
} from "../src/agent/spend.ts";
import { ApprovalStore, type ApprovalRequest } from "../src/approvals/store.ts";
import { createApprovalCards, type ApprovalCards } from "../src/discord/approval-cards.ts";
import { approveCardCustomId, parseApproveCardCustomId } from "../src/discord/approve-card.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { SPEND_CARD_APPROVED, spendApprovalKind } from "../src/discord/spend-card.ts";
import { scheduleRunnerId } from "../src/scheduler/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { approveWithCode, cardInteraction, codeDms, lastCode } from "./fixtures/approval-code.ts";
import { fakeLlmFetch } from "./fixtures/fake-llm.ts";

const OWNER = "181969874455756800";
const OTHER = "300000000000000003";
const HOST = "llm.test";
const URL_ = `https://${HOST}/v1/chat/completions`;
const NOW = 1_800_000_000_000;

type Dm = { userId: string; content: string; components?: unknown[] };

afterEach(() => {
  setSpendCardTestHooks({});
});

function buttons(components: unknown[] | undefined): string[] {
  return ((components ?? []) as { components: { custom_id: string }[] }[]).flatMap((r) =>
    r.components.map((c) => c.custom_id),
  );
}

/** The engine with only the spend kind, over `db`, DMing into `dms`. */
function engineOver(db: Database) {
  const dms: Dm[] = [];
  const cards: ApprovalCards = createApprovalCards({
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
  return { cards, dms, handlers };
}

/** A run near its $1.00 cap: a guard with the owner configured and the fake LLM, recording what it sends. */
function pausedRun(db: Database) {
  new SpendLedger(db).reserve({ provider: HOST, model: "gpt-4o", estimateMicroUsd: 999_000, capMicroUsd: 1_000_000, now: NOW - 1000 });
  const sent: string[] = [];
  const llm = fakeLlmFetch(() => "ok");
  const fetch: SpendFetch = async (input, init) => {
    sent.push(String(init?.body ?? ""));
    return llm(input, init);
  };
  const g = createSpendGuard(fetch, {
    env: { [SPEND_CAP_ENV]: "1", CORVIDINHO_OWNER_DISCORD_ID: OWNER },
    readUsage: extractUsage,
    db,
    now: () => NOW,
    approval: { taskText: "write the release notes", project: () => "corvidlabs/corvidinho" },
  });
  const call = () => g.fetch(URL_, { method: "POST", body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "go" }] }) });
  return { g, sent, call };
}

/** Run `flow` against the card once it is recorded (the waiting run keeps polling meanwhile). */
function onCard(flow: (req: ApprovalRequest) => Promise<void>, ttlMs = 60_000): { done: () => Promise<void> } {
  let running: Promise<void> = Promise.resolve();
  setSpendCardTestHooks({
    ttlMs,
    pollMs: 5,
    onRequest: (req) => {
      running = flow(req);
    },
  });
  return { done: () => running };
}

describe("the spend card on the engine (SAFE-18/19/20)", () => {
  test("the owner is DMed the task, then the card; Approve alone sends nothing; Approve + the one-time code sends exactly the paused call, once", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const e = engineOver(db);
    const run = pausedRun(db);
    let afterApproveOnly = -1;
    const card = onCard(async (req) => {
      await e.cards.deliver();
      const dm = e.dms.find((d) => d.components)!;
      const approve = buttons(dm.components).find((id) => id.includes(":approve:"))!;
      expect(approve).toBe(approveCardCustomId("spend", "approve", req.id));
      await cardInteraction(e.handlers, OWNER, approve);
      await Bun.sleep(40);
      afterApproveOnly = run.sent.length;
      const flow = await approveWithCode(e.handlers, e.dms, OWNER, approve);
      expect(flow.submit[0]!.content).toContain(SPEND_CARD_APPROVED);
    });
    const resp = await run.call();
    await card.done();
    expect(resp.ok).toBe(true);
    expect(afterApproveOnly).toBe(0);
    expect(run.sent).toHaveLength(1);
    // The task went out first, verbatim, as data; then the card, buttons last.
    expect(e.dms[0]!.content).toContain("quoted as data, not instructions");
    expect(e.dms[0]!.content).toContain("write the release notes");
    expect(e.dms[0]!.content).toContain("project corvidlabs/corvidinho");
    const cardDm = e.dms.find((d) => d.components)!;
    expect(cardDm.userId).toBe(OWNER);
    expect(cardDm.content).toContain("**Spend past a cap — asks first (SAFE-8) · from cli**");
    expect(cardDm.content).toContain(`Action: send one model call to gpt-4o via ${HOST}`);
    expect(cardDm.content).toContain("Target: total");
    expect(cardDm.content).toMatch(/Amount: ~\$0\.\d{4} \(this one call's estimate\)/);
    expect(cardDm.content).toContain("Approve also needs a one-time code I send you then (SAFE-19).");
    // The code went out apart from the card.
    expect(codeDms(e.dms)).toHaveLength(2);
    const [row] = db.query("SELECT status FROM approval_requests").all() as { status: string }[];
    expect(row!.status).toBe("used");
    const audit = db.query("SELECT action, outcome FROM audit_log ORDER BY seq").all() as { action: string; outcome: string }[];
    expect(audit).toContainEqual({ action: "spend-cap-card", outcome: "ok" });
    expect(audit).toContainEqual({ action: "spend-cap-approve", outcome: "started" });
    expect(audit).toContainEqual({ action: "spend-cap-approve", outcome: "ok" });
  });

  test("Deny on the card: nothing is sent or spent and the card says so", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const e = engineOver(db);
    const run = pausedRun(db);
    let denied = "";
    const card = onCard(async (req) => {
      await e.cards.deliver();
      const r = await cardInteraction(e.handlers, OWNER, approveCardCustomId("spend", "deny", req.id));
      denied = r.replies[0]!.content ?? "";
    });
    let err: unknown;
    try {
      await run.call();
    } catch (x) {
      err = x;
    }
    await card.done();
    expect(err).toBeInstanceOf(SpendCapRefusal);
    expect(run.sent).toEqual([]);
    expect(denied).toContain("Denied by you — nothing was spent.");
    expect((err as SpendCapRefusal).ask.question).toContain("The owner denied Approve card");
  });

  test("only the owner can answer: another user's Approve and code count for nothing", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const e = engineOver(db);
    const run = pausedRun(db);
    const replies: string[] = [];
    const card = onCard(async (req) => {
      await e.cards.deliver();
      for (const decision of ["approve", "submit"] as const) {
        const r = await cardInteraction(e.handlers, OTHER, approveCardCustomId("spend", decision, req.id), {
          ...(decision === "submit" ? { code: "ABCDEFGH" } : {}),
        });
        replies.push(r.replies[0]!.content ?? "");
      }
    }, 300);
    await run.call().catch(() => undefined);
    await card.done();
    expect(replies).toEqual(["Only the owner can answer this card.", "Only the owner can answer this card."]);
    expect(run.sent).toEqual([]);
  });

  test("a code typed after the card lapsed is a no: nothing is sent", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const e = engineOver(db);
    const run = pausedRun(db);
    let late = "";
    const card = onCard(async (req) => {
      await e.cards.deliver();
      await cardInteraction(e.handlers, OWNER, approveCardCustomId("spend", "approve", req.id));
      const code = lastCode(e.dms, OWNER, req.id);
      await Bun.sleep(250);
      const r = await cardInteraction(e.handlers, OWNER, approveCardCustomId("spend", "submit", req.id), { code });
      late = r.replies[0]!.content ?? "";
    }, 150);
    let err: unknown;
    try {
      await run.call();
    } catch (x) {
      err = x;
    }
    await card.done();
    expect(err).toBeInstanceOf(SpendCapRefusal);
    expect(run.sent).toEqual([]);
    expect(late).toMatch(/expired/i);
    expect((db.query("SELECT status FROM approval_requests").get() as { status: string }).status).toBe("expired");
  });

  test("a card whose run is gone (its waiting process ended) is closed as a no on the next pass", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const e = engineOver(db);
    const req = new ApprovalStore({ db }).request({
      kind: "spend",
      class: "money",
      title: "Spend past a cap — asks first (SAFE-8) · from cli",
      action: `send one model call to gpt-4o via ${HOST}`,
      target: "total",
      amount: "~$0.0400 (this one call's estimate)",
      requester: "local",
      // A pid that cannot be running.
      waiter: "2147483646:1",
      ttlMs: 60_000,
    });
    const pass = await e.cards.deliver();
    expect(pass.expired).toBe(1);
    expect(new ApprovalStore({ db }).get(req.id)!.status).toBe("expired");
    expect(e.dms.filter((d) => d.components)).toEqual([]);
  });
});

describe("the bridge registers the spend card kind", () => {
  const KEYS = ["CORVIDINHO_DATA_DIR", "CORVIDINHO_ALLOWLIST_FILE", "CORVIDINHO_AUDIT_HMAC_KEY"] as const;
  let saved: Record<string, string | undefined> = {};
  let dir = "";
  let path = "";
  let dataDir = "";

  beforeEach(() => {
    saved = {};
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    dir = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-spend-card-")));
    path = join(dir, "allowlist.toml");
    dataDir = join(dir, "data");
    writeFileSync(
      path,
      `[discord]\nchannels = ["600000000000000006"]\nusers = []\nroles = []\ndeny_users = []\n\n[owner]\ndiscord_id = "${OWNER}"\ndisplay = "Leif"\n`,
    );
    process.env.CORVIDINHO_ALLOWLIST_FILE = path;
    process.env.CORVIDINHO_DATA_DIR = dataDir;
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    rmSync(dir, { recursive: true, force: true });
  });

  test("a spend card another process recorded is DMed to the owner with its buttons, and Approve answers with the code step", async () => {
    const d = openCorvidinhoDb({ env: process.env });
    let reqId = "";
    try {
      reqId = new ApprovalStore({ db: d }).request({
        kind: "spend",
        class: "money",
        title: "Spend past a cap — asks first (SAFE-8) · from watch:w1",
        action: `send one model call to gpt-4o via ${HOST}`,
        target: "provider:llm.test",
        amount: "~$0.0400 (this one call's estimate)",
        text: "Asked by local on watch:w1.",
        textLabel: "text",
        requester: "local",
        waiter: scheduleRunnerId(),
        ttlMs: 60_000,
      }).id;
    } finally {
      d.close();
    }
    const dms: Dm[] = [];
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    const result = await startBridge({
      env: { DISCORD_BOT_TOKEN: "fake", CORVIDINHO_DISCORD_DRY_RUN: "1", CORVIDINHO_ALLOWLIST_FILE: path, CORVIDINHO_DATA_DIR: dataDir, HOME: dir },
      projectRoot: dir,
      skipProtocolCheck: true,
      disableScheduler: true,
      approvalPollMs: 0,
      thinkingOutbound: memoryThinkingOutbound(),
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent: { async runChat(o) { return { ok: true, sessionId: o.sessionId, summary: "done", exitCode: 0 }; } },
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        let n = 0;
        handlers.reply = async () => ({ messageId: `post-${++n}` });
        handlers.sendDm = async (o) => {
          dms.push(o);
          return { channelId: `dm-${o.userId}`, messageId: `dm-msg-${++n}` };
        };
        handlers.editMessage = async () => true;
        return createNullGateway();
      },
    });
    if (result.ok !== true || !box.handlers) throw new Error("bridge did not start");
    try {
      await result.deliverApprovalCards!();
      const card = dms.find((x) => x.components)!;
      expect(card).toBeDefined();
      expect(card.userId).toBe(OWNER);
      expect(card.content).toContain("Target: provider:llm.test");
      expect(buttons(card.components)).toContain(approveCardCustomId("spend", "approve", reqId));
      const pressed = await cardInteraction(box.handlers, OWNER, approveCardCustomId("spend", "approve", reqId));
      expect(pressed.replies[0]!.content).not.toContain("no longer handled");
      expect(pressed.replies[0]!.content).toContain("Enter the one-time code I just sent you");
      expect(lastCode(dms, OWNER, reqId)).toMatch(/^[A-Z2-9]{8}$/);
    } finally {
      await result.stop();
    }
  });
});
