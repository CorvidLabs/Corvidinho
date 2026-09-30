/**
 * SAFE-18..20 (#96, REQ-discord-096 / REQ-discord-101) — one Approve/Deny
 * card engine for everything that needs the owner's OK.
 *
 * - SAFE-18: the owner is DMed a card with the exact action, target and
 *   amount one line each; a diff or text goes out first, verbatim, quoted
 *   as data, split fence-safe under the DM cap and secret-scrubbed; the
 *   buttons come last; nothing is cut (a card that would not fit is not
 *   sent).
 * - SAFE-19: destructive and money cards (and a kind with no class) need a
 *   one-time code DMed apart from the card and typed back in a form: valid
 *   once, only for that card and action, and only briefly — late, reused
 *   and other-card codes do nothing; a failed action needs a new code.
 * - SAFE-20: no answer, an answer after the card expired, or a card nobody
 *   waits for any more is a no.
 * - The bridge re-checks the owner on every press and submit, takes typed
 *   text only from the form's submit, runs the engine's own poll with the
 *   scheduler off (cards recorded while it was down go out after a
 *   restart), and a forget card whose counts changed is replaced, never
 *   acted on.
 * - Schema v14 adds approval_requests / approval_codes (forward-only).
 *
 * In-memory or temp-dir SQLite, the bridge with a fake gateway; no token,
 * no network.
 */
import { Database as SqliteDatabase } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalStore, approvalActionHash, storedApprovalAction } from "../src/approvals/store.ts";
import {
  createApprovalCards,
  storedApprovalKind,
  type AnyApprovalKind,
  type ApprovalCards,
} from "../src/discord/approval-cards.ts";
import { approveCardCustomId, parseApproveCardCustomId } from "../src/discord/approve-card.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { buildPeopleDirectory, parsePeopleToml } from "../src/identity/people.ts";
import { ForgetRequestStore, MemoryStore, memorySubjectFor } from "../src/memory/index.ts";
import { scheduleRunnerId } from "../src/scheduler/store.ts";
import { migrateCorvidinhoDb, openCorvidinhoDb, SCHEMA_VERSION } from "../src/store/db.ts";
import { rescrubDatabase, SCRUB_TARGETS } from "../src/store/scrub.ts";
import { approveWithCode, cardInteraction, codeDms, lastCode, type CardReply } from "./fixtures/approval-code.ts";

const OWNER_ID = "181969874455756800";
const KYN = "300000000000000003";
const CHAN = "600000000000000006";
const OWNER = { discordId: OWNER_ID, display: "Leif" };
const T0 = 1_800_000_000_000;
const MIN = 60_000;

const fakeToken = () => "gh" + "p_" + "a1B2c3D4e5".repeat(4).slice(0, 36);

type Dm = { userId: string; content: string; components?: unknown[] };
type Edit = { channelId: string; messageId: string; content?: string | null; components?: unknown[] | null };

/** The engine over an in-memory DB with a fixed clock and recording DMs. */
function engine(
  kinds: (db: SqliteDatabase, now: () => number) => AnyApprovalKind[],
  opts: { dmFails?: boolean } = {},
) {
  const db = openCorvidinhoDb({ memory: true });
  const clock = { t: T0 };
  const now = () => clock.t;
  const dms: Dm[] = [];
  const edits: Edit[] = [];
  const cards: ApprovalCards = createApprovalCards({
    db,
    env: {},
    owner: () => OWNER,
    now,
    sendDm: async (o) => {
      if (opts.dmFails) return null;
      dms.push(o);
      return { channelId: `dm-${o.userId}`, messageId: `m${dms.length}` };
    },
    editMessage: async (o) => {
      edits.push(o);
      return true;
    },
    kinds: kinds(db, now),
  });
  const handlers = {
    onComponent: async (ix: Parameters<NonNullable<GatewayHandlers["onComponent"]>>[0]) => {
      await cards.press(ix, parseApproveCardCustomId(ix.customId)!, ix.userId === OWNER_ID);
    },
  };
  const store = new ApprovalStore({ db, now });
  return { db, clock, dms, edits, cards, handlers, store };
}

function cardDm(dms: Dm[], requestId: string): Dm {
  const card = dms.find((d) => d.components && d.content.includes(`Request: ${requestId}`));
  if (!card) throw new Error(`no card for ${requestId}`);
  return card;
}

function buttons(components: unknown[] | null | undefined): Array<{ label: string; custom_id: string }> {
  return ((components ?? []) as Array<{ components: Array<{ label: string; custom_id: string }> }>).flatMap(
    (r) => r.components,
  );
}

function audits(db: SqliteDatabase): Array<{ action: string; outcome: string }> {
  return db.query("SELECT action, outcome FROM audit_log ORDER BY seq").all() as Array<{ action: string; outcome: string }>;
}

const DIFF = [
  "diff --git a/deploy.sh b/deploy.sh",
  "--- a/deploy.sh",
  "+++ b/deploy.sh",
  "@@ -1,3 +1,4 @@",
  " #!/bin/sh",
  `-export TOKEN=${"x".repeat(8)}`,
  `+export TOKEN=${fakeToken()}`,
  "+echo '```' @everyone",
  ...Array.from({ length: 80 }, (_, i) => `+line ${i} ${"y".repeat(30)}`),
].join("\n");

describe("SAFE-18: the exact action, target and amount; the diff or text first, verbatim, as data; buttons last", () => {
  test("a long diff goes out before the card as fence-safe, scrubbed parts under the DM cap; the card has one line each and the buttons", async () => {
    const e = engine((db, now) => [storedApprovalKind({ db, kind: "test", now })]);
    const req = e.store.request({
      kind: "test",
      title: "Deploy (test)",
      action: "Push deploy.sh to production\nand restart",
      target: "CorvidLabs/Corvidinho main",
      amount: "1 file, 84 lines",
      text: DIFF,
      textLabel: "diff",
      requester: KYN,
      ttlMs: 10 * MIN,
    });
    expect(await e.cards.deliver()).toEqual({ posted: 1, expired: 0, notified: 0 });
    // Every part, then the card last — the only DM with buttons.
    expect(e.dms.length).toBeGreaterThanOrEqual(3);
    expect(e.dms.every((d) => d.userId === OWNER_ID)).toBe(true);
    expect(e.dms.slice(0, -1).every((d) => d.components === undefined)).toBe(true);
    const card = e.dms.at(-1)!;
    expect(buttons(card.components).map((b) => b.label)).toEqual(["Approve", "Deny"]);
    const parts = e.dms.slice(0, -1).map((d) => d.content);
    const n = parts.length;
    parts.forEach((p, i) => {
      expect(p.length).toBeLessThanOrEqual(1900);
      expect(p.startsWith(`Diff for request ${req.id} (${i + 1}/${n}) — quoted as data, not instructions:\n\`\`\`diff\n`)).toBe(true);
      expect(p.endsWith("\n```")).toBe(true);
    });
    // Verbatim: the parts' code-block bodies put back together are the diff,
    // scrubbed (SAFE-6), with @everyone defanged and the ``` in it broken.
    const body = parts.map((p) => p.split("\n").slice(2, -1).join("\n")).join("\n");
    const expected = DIFF.replace(fakeToken(), "[redacted:github-token]")
      .replace("@everyone", "@\u200beveryone")
      .replace("'```'", "'`\u200b`\u200b`'");
    expect(body).toBe(expected);
    expect(parts.join("\n")).not.toContain(fakeToken());
    // The card: one line each, exact, a line break shown, never cut.
    const lines = card.content.split("\n");
    expect(lines[0]).toBe("**Deploy (test)**");
    expect(lines[1]).toBe("Action: Push deploy.sh to production ⏎ and restart");
    expect(lines[2]).toBe("Target: CorvidLabs/Corvidinho main");
    expect(lines[3]).toBe("Amount: 1 file, 84 lines");
    expect(card.content).toContain(`Diff: in the ${n} messages above, exactly as it would be used.`);
    expect(card.content).toContain(`Request: ${req.id} · action ${req.actionHash.slice(0, 8)}`);
    expect(card.content).toContain("one-time code");
    expect(card.content).toMatch(/No answer by <t:\d+:R> means no\.$/);
    expect(req.actionHash).toBe(approvalActionHash(storedApprovalAction(req)));
    expect(audits(e.db)).toEqual([{ action: "approval-card", outcome: "ok" }]);
    // A second pass sends nothing more.
    expect((await e.cards.deliver()).posted).toBe(0);
    e.db.close();
  });

  test("a card whose field or text would not fit is not sent (never cut) and lapses as a no", async () => {
    const e = engine((db, now) => [storedApprovalKind({ db, kind: "test", now })]);
    const errors: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errors.push(a.join(" "));
    try {
      const req = e.store.request({ kind: "test", title: "Too long", action: "x".repeat(501), target: "t", amount: "a", ttlMs: MIN });
      expect(await e.cards.deliver()).toEqual({ posted: 0, expired: 0, notified: 0 });
      expect(e.dms).toEqual([]);
      expect(errors.join()).toContain("over 500");
      // A text that needs more than ten DMs is not sent either.
      const long = e.store.request({ kind: "test", title: "Long", action: "a", target: "t", amount: "1", text: "z ".repeat(12_000), ttlMs: MIN });
      expect(await e.cards.deliver()).toEqual({ posted: 0, expired: 0, notified: 0 });
      expect(errors.join()).toContain("(over 10); not sent");
      expect(e.dms).toEqual([]);
      e.clock.t += MIN;
      expect(await e.cards.deliver()).toEqual({ posted: 0, expired: 2, notified: 0 });
      expect(e.store.get(req.id)!.status).toBe("expired");
      expect(e.store.get(long.id)!.status).toBe("expired");
    } finally {
      console.error = orig;
      e.db.close();
    }
  });
});

describe("SAFE-19: destructive and money cards need a one-time code typed back", () => {
  test("a kind with no class counts as destructive: Approve sends a code apart from the card; only the form's code acts, once", async () => {
    const acted: string[] = [];
    const e = engine((db, now) => [storedApprovalKind({ db, kind: "test", now, onApprove: (r) => void acted.push(r.id) })]);
    const req = e.store.request({ kind: "test", title: "T", action: "Delete branch x", target: "repo", amount: "1 branch", ttlMs: 10 * MIN });
    await e.cards.deliver();
    const card = cardDm(e.dms, req.id);
    const [approve] = buttons(card.components);
    const pressed = await cardInteraction(e.handlers, OWNER_ID, approve!.custom_id);
    expect(pressed.replies).toHaveLength(1);
    expect(pressed.replies[0]!.update).toBe(true);
    expect(buttons(pressed.replies[0]!.components).map((b) => b.label)).toEqual(["Enter code", "Deny"]);
    const codes = codeDms(e.dms);
    expect(codes).toHaveLength(1);
    expect(codes[0]!.components).toBeUndefined();
    const code = lastCode(e.dms, OWNER_ID, req.id);
    // Never in the card's message, never stored or audited in the clear.
    expect(pressed.replies[0]!.content).not.toContain(code);
    expect(JSON.stringify(e.db.query("SELECT * FROM approval_codes").all())).not.toContain(code);
    expect(JSON.stringify(e.db.query("SELECT * FROM audit_log").all())).not.toContain(code);
    expect(acted).toEqual([]);
    expect(e.store.get(req.id)!.status).toBe("pending");
    // Enter code opens the form; only its submit carries the code.
    const open = await cardInteraction(e.handlers, OWNER_ID, approveCardCustomId("test", "code", req.id));
    expect(open.modals).toHaveLength(1);
    expect(open.modals[0]!.custom_id).toBe(approveCardCustomId("test", "submit", req.id));
    const done = await cardInteraction(e.handlers, OWNER_ID, open.modals[0]!.custom_id, { code });
    expect(done.replies).toEqual([{ content: "Approved by you.", ephemeral: true }]);
    expect(acted).toEqual([req.id]);
    expect(e.store.get(req.id)!.status).toBe("approved");
    expect(e.edits.at(-1)!.content).toContain("**Approved by you.**");
    expect(e.edits.at(-1)!.components).toEqual([]);
    // The same code again: the card is closed and nothing runs twice.
    const again = await cardInteraction(e.handlers, OWNER_ID, open.modals[0]!.custom_id, { code });
    expect(again.replies[0]!.content).toContain("Already closed (approved)");
    expect(acted).toEqual([req.id]);
    // The waiting process uses the approval once.
    expect(e.store.consume(req.id)).toBe(true);
    expect(e.store.consume(req.id)).toBe(false);
    expect(audits(e.db).map((a) => `${a.action}:${a.outcome}`)).toEqual([
      "approval-card:ok",
      "approval-code-issue:ok",
      "approval-approve:started",
      "approval-approve:ok",
    ]);
    e.db.close();
  });

  test("money cards need the code too; a plain card acts on one press", async () => {
    const acted: string[] = [];
    const e = engine((db, now) => [
      storedApprovalKind({ db, kind: "money-test", class: "money", now, onApprove: (r) => void acted.push(r.id) }),
      storedApprovalKind({ db, kind: "note", class: "plain", now, onApprove: (r) => void acted.push(r.id) }),
    ]);
    const money = e.store.request({ kind: "money-test", title: "Spend", action: "One more model call", target: "chat", amount: "$0.40", ttlMs: MIN });
    const plain = e.store.request({ kind: "note", title: "Note", action: "Post a note", target: "#general", amount: "1 post", ttlMs: MIN });
    await e.cards.deliver();
    expect(cardDm(e.dms, plain.id).content).not.toContain("one-time code");
    const m = await cardInteraction(e.handlers, OWNER_ID, approveCardCustomId("money-test", "approve", money.id));
    expect(buttons(m.replies[0]!.components).map((b) => b.label)).toEqual(["Enter code", "Deny"]);
    expect(acted).toEqual([]);
    const p = await cardInteraction(e.handlers, OWNER_ID, approveCardCustomId("note", "approve", plain.id));
    expect(p.replies[0]!.update).toBe(true);
    expect(p.replies[0]!.content).toContain("**Approved by you.**");
    expect(acted).toEqual([plain.id]);
    expect(codeDms(e.dms)).toHaveLength(1);
    // A plain card has no code step.
    const noCode = await cardInteraction(e.handlers, OWNER_ID, approveCardCustomId("note", "submit", plain.id), { code: "X" });
    expect(noCode.replies[0]!.content).toContain("Already closed");
    e.db.close();
  });

  test("a late code, a wrong code and another card's code do nothing and void the open code; a new Approve gets a new code", async () => {
    const acted: string[] = [];
    const e = engine((db, now) => [storedApprovalKind({ db, kind: "test", now, onApprove: (r) => void acted.push(r.id) })]);
    const a = e.store.request({ kind: "test", title: "A", action: "Delete a", target: "t", amount: "1", ttlMs: 30 * MIN });
    const b = e.store.request({ kind: "test", title: "B", action: "Delete b", target: "t", amount: "1", ttlMs: 30 * MIN });
    await e.cards.deliver();
    const submit = (id: string, code: string) => cardInteraction(e.handlers, OWNER_ID, approveCardCustomId("test", "submit", id), { code });
    const approve = (id: string) => cardInteraction(e.handlers, OWNER_ID, approveCardCustomId("test", "approve", id));

    // Late: the code expires after 2 minutes while the card is still open.
    await approve(a.id);
    const lateCode = lastCode(e.dms, OWNER_ID, a.id);
    e.clock.t += 2 * MIN;
    const late = await submit(a.id, lateCode);
    expect(late.replies[0]!.ephemeral).toBe(true);
    expect(late.replies[0]!.content).toContain("That code expired — nothing was done.");
    // The card goes back to Approve / Deny.
    expect(buttons(e.edits.at(-1)!.components).map((x) => x.label)).toEqual(["Approve", "Deny"]);

    // Another card's code: B's form with A's fresh code.
    await approve(a.id);
    const codeA = lastCode(e.dms, OWNER_ID, a.id);
    await approve(b.id);
    const codeB = lastCode(e.dms, OWNER_ID, b.id);
    const cross = await submit(b.id, codeA);
    expect(cross.replies[0]!.content).toContain("That code is not right — nothing was done.");
    // That try voided B's open code as well.
    expect((await submit(b.id, codeB)).replies[0]!.content).toContain("There is no open code for this card");

    // A wrong code voids A's open code too.
    expect((await submit(a.id, "WRONG234")).replies[0]!.content).toContain("That code is not right");
    expect((await submit(a.id, codeA)).replies[0]!.content).toContain("There is no open code for this card");
    expect(acted).toEqual([]);

    // A new Approve issues a new code, and that one works.
    await approve(a.id);
    const fresh = lastCode(e.dms, OWNER_ID, a.id);
    expect(fresh).not.toBe(codeA);
    expect((await submit(a.id, fresh)).replies[0]!.content).toBe("Approved by you.");
    expect(acted).toEqual([a.id]);
    expect(audits(e.db).filter((x) => x.action === "approval-code-fail").map((x) => x.outcome)).toEqual([
      "denied",
      "denied",
      "denied",
      "denied",
      "denied",
    ]);
    e.db.close();
  });

  test("SAFE-5 order: the code is used up and `started` recorded first; a failed action leaves the card open and needs a new code", async () => {
    let fail = true;
    const acted: string[] = [];
    const e = engine((db, now) => [
      storedApprovalKind({
        db,
        kind: "test",
        now,
        failed: "Delete failed",
        onApprove: (r) => {
          if (fail) throw new Error("disk full");
          acted.push(r.id);
        },
      }),
    ]);
    const req = e.store.request({ kind: "test", title: "T", action: "Delete x", target: "t", amount: "1", ttlMs: 30 * MIN });
    await e.cards.deliver();
    const first = await approveWithCode(e.handlers, e.dms, OWNER_ID, approveCardCustomId("test", "approve", req.id));
    expect(first.submit[0]!.content).toContain("Delete failed — nothing was done; the request stays open. Press Approve for a new code. disk full");
    expect(e.store.get(req.id)!.status).toBe("pending");
    // The code was spent: the same code again does nothing.
    fail = false;
    const reuse = await cardInteraction(e.handlers, OWNER_ID, approveCardCustomId("test", "submit", req.id), { code: first.code });
    expect(reuse.replies[0]!.content).toContain("There is no open code for this card");
    expect(acted).toEqual([]);
    const second = await approveWithCode(e.handlers, e.dms, OWNER_ID, approveCardCustomId("test", "approve", req.id));
    expect(second.code).not.toBe(first.code);
    expect(second.submit[0]!.content).toBe("Approved by you.");
    expect(acted).toEqual([req.id]);
    expect(audits(e.db).map((a) => `${a.action}:${a.outcome}`)).toEqual([
      "approval-card:ok",
      "approval-code-issue:ok",
      "approval-approve:started",
      "approval-approve:error",
      "approval-code-fail:denied",
      "approval-code-issue:ok",
      "approval-approve:started",
      "approval-approve:ok",
    ]);
    e.db.close();
  });

  test("a code that could not be DMed is voided and the card goes back to Approve / Deny", async () => {
    const e = engine((db, now) => [storedApprovalKind({ db, kind: "test", now })]);
    const req = e.store.request({ kind: "test", title: "T", action: "Delete x", target: "t", amount: "1", ttlMs: 30 * MIN });
    await e.cards.deliver();
    const store = new ApprovalStore({ db: e.db });
    // DMs start failing after the card went out.
    const failing = createApprovalCards({
      db: e.db,
      env: {},
      owner: () => OWNER,
      now: () => e.clock.t,
      sendDm: async () => null,
      editMessage: async (o) => {
        e.edits.push(o);
        return true;
      },
      kinds: [storedApprovalKind({ db: e.db, kind: "test", now: () => e.clock.t })],
    });
    await cardInteraction(
      { onComponent: (ix) => failing.press(ix, parseApproveCardCustomId(ix.customId)!, true) },
      OWNER_ID,
      approveCardCustomId("test", "approve", req.id),
    );
    expect(e.edits.at(-1)!.content).toContain("I couldn't send you the one-time code");
    expect(buttons(e.edits.at(-1)!.components).map((b) => b.label)).toEqual(["Approve", "Deny"]);
    expect(e.db.query("SELECT COUNT(*) AS n FROM approval_codes WHERE used_at IS NULL AND voided_at IS NULL").get()).toEqual({ n: 0 });
    expect(store.get(req.id)!.status).toBe("pending");
    e.db.close();
  });
});

describe("SAFE-18/19: an Approve counts only for the action the card showed", () => {
  test("a request changed after its card went out (e.g. re-scrubbed) is never acted on: a fresh card follows, and that one works", async () => {
    const acted: string[] = [];
    const e = engine((db, now) => [storedApprovalKind({ db, kind: "test", now, onApprove: (r) => void acted.push(r.id) })]);
    const req = e.store.request({ kind: "test", title: "T", action: "Delete branch x", target: "repo", amount: "1 branch", ttlMs: 30 * MIN });
    await e.cards.deliver();
    // The row changes after the card went out (as a SAFE-6 re-scrub of it would).
    e.db.run("UPDATE approval_requests SET amount = ? WHERE id = ?", ["2 branches", req.id]);
    const pressed = await cardInteraction(e.handlers, OWNER_ID, approveCardCustomId("test", "approve", req.id));
    expect(pressed.replies[0]!.content).toContain("Changed since this card was sent — nothing was done");
    expect(pressed.replies[0]!.components).toEqual([]);
    expect(codeDms(e.dms)).toEqual([]);
    expect(acted).toEqual([]);
    // The fresh card shows the row as it is now and records what it showed.
    expect((await e.cards.deliver()).posted).toBe(1);
    const fresh = e.dms.filter((d) => d.components).at(-1)!;
    expect(fresh.content).toContain("Amount: 2 branches");
    expect(e.store.get(req.id)!.actionHash).toBe(approvalActionHash(storedApprovalAction(e.store.get(req.id)!)));
    const flow = await approveWithCode(e.handlers, e.dms, OWNER_ID, buttons(fresh.components)[0]!.custom_id);
    expect(flow.submit[0]!.content).toBe("Approved by you.");
    expect(acted).toEqual([req.id]);
    e.db.close();
  });
});

describe("SAFE-20: no answer, a late answer, or nobody waiting is a no", () => {
  test("an unanswered card expires on the pass (card marked, codes void); a press or a code after expiry does nothing", async () => {
    const acted: string[] = [];
    const e = engine((db, now) => [storedApprovalKind({ db, kind: "test", now, onApprove: (r) => void acted.push(r.id) })]);
    const quiet = e.store.request({ kind: "test", title: "Q", action: "Delete q", target: "t", amount: "1", ttlMs: 5 * MIN });
    const late = e.store.request({ kind: "test", title: "L", action: "Delete l", target: "t", amount: "1", ttlMs: 5 * MIN });
    await e.cards.deliver();
    // Approve on L just before it lapses: the code is capped at the card's expiry.
    e.clock.t += 4 * MIN;
    await cardInteraction(e.handlers, OWNER_ID, approveCardCustomId("test", "approve", late.id));
    const code = lastCode(e.dms, OWNER_ID, late.id);
    expect(codeDms(e.dms).at(-1)!.content).toContain(`<t:${Math.floor(late.expiresAt / 1000)}:R>`);
    e.clock.t += MIN;
    const tooLate = await cardInteraction(e.handlers, OWNER_ID, approveCardCustomId("test", "submit", late.id), { code });
    expect(tooLate.replies[0]!.content).toBe("Expired — no answer in time, so nothing was done.");
    expect(e.store.get(late.id)!.status).toBe("expired");
    expect(await e.cards.deliver()).toEqual({ posted: 0, expired: 1, notified: 0 });
    expect(e.store.get(quiet.id)!.status).toBe("expired");
    const quietEdit = e.edits.find((x) => x.content?.includes(`Request: ${quiet.id}`) && x.content.includes("Expired"));
    expect(quietEdit!.content).toContain("**Expired — no answer, so nothing was done.**");
    expect(quietEdit!.components).toEqual([]);
    const press = await cardInteraction(e.handlers, OWNER_ID, approveCardCustomId("test", "approve", quiet.id));
    expect(press.replies[0]!.content).toContain("Already closed (expired)");
    expect(acted).toEqual([]);
    expect(e.db.query("SELECT COUNT(*) AS n FROM approval_codes WHERE used_at IS NULL AND voided_at IS NULL").get()).toEqual({ n: 0 });
    e.db.close();
  });

  test("a card whose waiting process is gone is closed as a no, before or after it went out", async () => {
    const acted: string[] = [];
    const e = engine((db, now) => [storedApprovalKind({ db, kind: "test", now, onApprove: (r) => void acted.push(r.id) })]);
    const gone = e.store.request({ kind: "test", title: "G", action: "Spend", target: "t", amount: "1", waiter: "999999999:1", ttlMs: 5 * MIN });
    const alive = e.store.request({ kind: "test", title: "A", action: "Spend", target: "t", amount: "1", waiter: scheduleRunnerId(), ttlMs: 5 * MIN });
    expect(await e.cards.deliver()).toEqual({ posted: 1, expired: 1, notified: 0 });
    expect(e.store.get(gone.id)!.status).toBe("expired");
    expect(e.dms.some((d) => d.content.includes(gone.id))).toBe(false);
    expect(e.store.get(alive.id)!.status).toBe("pending");
    // Its waiter dies after the card went out: Approve is a no.
    e.db.run("UPDATE approval_requests SET waiter = '999999999:1' WHERE id = ?", [alive.id]);
    const press = await cardInteraction(e.handlers, OWNER_ID, approveCardCustomId("test", "approve", alive.id));
    expect(press.replies[0]!.content).toContain("Closed — nobody is waiting for this any more, so nothing was done.");
    expect(e.store.get(alive.id)!.status).toBe("expired");
    expect(acted).toEqual([]);
    e.db.close();
  });

  test("the waiting process reads the decision; no answer by the expiry, or an abort, is a no", async () => {
    const d = openCorvidinhoDb({ memory: true });
    try {
      let t = T0;
      const store = new ApprovalStore({ db: d, now: () => t });
      const sleep = async (ms: number) => {
        t += ms;
      };
      const r = store.request({ kind: "test", title: "T", action: "a", target: "t", amount: "1", ttlMs: 3000 });
      expect((await store.waitForDecision(r.id, { pollMs: 1000, sleep }))!.status).toBe("expired");
      const r2 = store.request({ kind: "test", title: "T", action: "a", target: "t", amount: "1", ttlMs: 60_000 });
      const abort = new AbortController();
      abort.abort();
      expect((await store.waitForDecision(r2.id, { signal: abort.signal, sleep }))!.status).toBe("expired");
      const r3 = store.request({ kind: "test", title: "T", action: "a", target: "t", amount: "1", ttlMs: 60_000 });
      // Another connection (the bridge's) decides it.
      const other = new ApprovalStore({ db: d, now: () => t });
      let polls = 0;
      const decided = await store.waitForDecision(r3.id, {
        sleep: async (ms) => {
          t += ms;
          if (++polls === 2) other.decide(r3.id, "approved", { by: OWNER_ID });
        },
      });
      expect(decided!.status).toBe("approved");
      expect(decided!.decidedBy).toBe(OWNER_ID);
    } finally {
      d.close();
    }
  });
});

// ── the bridge ───────────────────────────────────────────────────────────────

const PEOPLE = `[people.kyn]
display = "Kyn"
role = "community"
discord_ids = ["${KYN}"]
`;

const KEYS = ["CORVIDINHO_DATA_DIR", "CORVIDINHO_ALLOWLIST_FILE", "CORVIDINHO_AUDIT_HMAC_KEY", "DISCORD_MUTED_USER_IDS"] as const;
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
  dir = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-approvals-")));
  path = join(dir, "allowlist.toml");
  dataDir = join(dir, "data");
  writeFileSync(
    path,
    `[discord]\nchannels = ["${CHAN}"]\nusers = []\nroles = []\ndeny_users = []\n\n[owner]\ndiscord_id = "${OWNER_ID}"\ndisplay = "Leif"\n\n${PEOPLE}`,
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

function db(): SqliteDatabase {
  return openCorvidinhoDb({ env: process.env });
}

/** Kyn's memories and a pending forget ask of theirs (made with no bridge up). */
function seedForgetAsk(): string {
  const d = db();
  try {
    const m = new MemoryStore({ db: d });
    m.store({ ownerUserId: "person:kyn", category: "preference", key: "tz", content: "KYN-TZ" });
    m.store({ ownerUserId: "person:kyn", category: "private", key: "n", content: "KYN-PRIVATE" });
    const people = buildPeopleDirectory(parsePeopleToml(PEOPLE), OWNER);
    return new ForgetRequestStore({ db: d }).request({
      subject: memorySubjectFor(people, KYN)!,
      requesterUserId: KYN,
      originChannelId: CHAN,
    }).request.id;
  } finally {
    d.close();
  }
}

function contents(): string[] {
  const d = db();
  try {
    return (d.query("SELECT content FROM memories").all() as Array<{ content: string }>).map((r) => r.content);
  } finally {
    d.close();
  }
}

async function bridge(opts: { approvalPollMs?: number } = {}) {
  const dms: Dm[] = [];
  const edits: Edit[] = [];
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const result = await startBridge({
    env: { DISCORD_BOT_TOKEN: "fake", CORVIDINHO_DISCORD_DRY_RUN: "1", CORVIDINHO_ALLOWLIST_FILE: path, CORVIDINHO_DATA_DIR: dataDir, HOME: dir },
    projectRoot: dir,
    skipProtocolCheck: true,
    disableScheduler: true,
    approvalPollMs: opts.approvalPollMs ?? 0,
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
      handlers.editMessage = async (o) => {
        edits.push(o);
        return true;
      };
      return createNullGateway();
    },
  });
  if (result.ok !== true || !box.handlers) throw new Error("bridge did not start");
  return { result, dms, edits, handlers: box.handlers };
}

async function waitFor(cond: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 300; i++) {
    if (cond()) return;
    await Bun.sleep(10);
  }
  throw new Error(`timed out waiting for ${what}`);
}

describe("the bridge: the owner on every press and submit, typed text only from the form, its own poll", () => {
  test("the owner check runs again at the code submit: muted after Approve ⇒ the code counts for nothing", async () => {
    const reqId = seedForgetAsk();
    const b = await bridge();
    try {
      await b.result.deliverApprovalCards!();
      const approve = approveCardCustomId("forget", "approve", reqId);
      await cardInteraction(b.handlers, OWNER_ID, approve);
      const code = lastCode(b.dms, OWNER_ID, reqId);
      b.result.muteUser(OWNER_ID);
      const refused = await cardInteraction(b.handlers, OWNER_ID, approveCardCustomId("forget", "submit", reqId), { code });
      expect(refused.replies).toEqual([{ content: "Only the owner can answer this card.", ephemeral: true }]);
      expect(contents()).toEqual(expect.arrayContaining(["KYN-TZ", "KYN-PRIVATE"]));
      // Someone else's submit, even with the right code, is refused the same way.
      const other = await cardInteraction(b.handlers, KYN, approveCardCustomId("forget", "submit", reqId), { code });
      expect(other.replies).toEqual([{ content: "Only the owner can answer this card.", ephemeral: true }]);
      b.result.unmuteUser(OWNER_ID);
      const ok = await cardInteraction(b.handlers, OWNER_ID, approveCardCustomId("forget", "submit", reqId), { code });
      expect(ok.replies[0]!.content).toContain("Approved by you — forgot 2 memories and 0 conversation turns.");
      expect(contents()).toEqual([]);
      const d = db();
      try {
        const rows = d
          .query("SELECT action, actor, outcome FROM audit_log WHERE action = 'memory-forget-approve' ORDER BY seq")
          .all();
        expect(rows).toEqual([
          { action: "memory-forget-approve", actor: OWNER_ID, outcome: "denied" },
          { action: "memory-forget-approve", actor: KYN, outcome: "denied" },
          { action: "memory-forget-approve", actor: OWNER_ID, outcome: "started" },
          { action: "memory-forget-approve", actor: OWNER_ID, outcome: "ok" },
        ]);
      } finally {
        d.close();
      }
    } finally {
      await b.result.stop();
    }
  });

  test("typed text is taken only from the form's submit: a press carrying text, or a submit without it, is ignored", async () => {
    const reqId = seedForgetAsk();
    const b = await bridge();
    try {
      await b.result.deliverApprovalCards!();
      await cardInteraction(b.handlers, OWNER_ID, approveCardCustomId("forget", "approve", reqId));
      const code = lastCode(b.dms, OWNER_ID, reqId);
      const replies: CardReply[] = [];
      // An Approve id with typed text (a forged submit).
      await b.handlers.onComponent!({
        id: "x1",
        customId: approveCardCustomId("forget", "approve", reqId),
        channelId: `dm-${OWNER_ID}`,
        userId: OWNER_ID,
        modalValues: { code },
        reply: async (o) => void replies.push(o),
      });
      // A submit id with no typed text (a forged press).
      await b.handlers.onComponent!({
        id: "x2",
        customId: approveCardCustomId("forget", "submit", reqId),
        channelId: `dm-${OWNER_ID}`,
        userId: OWNER_ID,
        reply: async (o) => void replies.push(o),
      });
      expect(replies).toEqual([]);
      expect(contents()).toEqual(expect.arrayContaining(["KYN-TZ"]));
      // The code is still open for the real form.
      const ok = await cardInteraction(b.handlers, OWNER_ID, approveCardCustomId("forget", "submit", reqId), { code });
      expect(ok.replies[0]!.content).toContain("Approved by you");
    } finally {
      await b.result.stop();
    }
  });

  test("restart: a card recorded while no bridge ran goes out on the engine's own poll (scheduler off, no chat); a card from before a restart still works", async () => {
    const reqId = seedForgetAsk();
    const first = await bridge({ approvalPollMs: 20 });
    try {
      await waitFor(() => first.dms.some((d) => d.components && d.content.includes(reqId)), "the card from the poll");
    } finally {
      await first.result.stop();
    }
    const card = first.dms.find((d) => d.components && d.content.includes(reqId))!;
    // A new bridge process; the owner answers the card the old one sent.
    const second = await bridge();
    try {
      const flow = await approveWithCode(second.handlers, second.dms, OWNER_ID, buttons(card.components)[0]!.custom_id);
      expect(flow.submit[0]!.content).toContain("Approved by you — forgot 2 memories");
      expect(contents()).toEqual([]);
      // The asker is told (DM).
      expect(second.dms.some((d) => d.userId === KYN && d.content.includes("was approved"))).toBe(true);
    } finally {
      await second.result.stop();
    }
  });

  test("a forget card whose counts changed is never acted on: nothing is deleted and a fresh card with the new count follows", async () => {
    const reqId = seedForgetAsk();
    const b = await bridge();
    try {
      await b.result.deliverApprovalCards!();
      const card = b.dms.find((d) => d.components)!;
      expect(card.content).toContain("Amount: 2 memories (2 stored), 0 session turns and 0 kept conversations");
      // Something new about Kyn is stored after the card went out.
      const d = db();
      try {
        new MemoryStore({ db: d }).store({ ownerUserId: "person:kyn", category: "preference", key: "lang", content: "KYN-LANG" });
      } finally {
        d.close();
      }
      const pressed = await cardInteraction(b.handlers, OWNER_ID, buttons(card.components)[0]!.custom_id);
      expect(pressed.replies[0]!.update).toBe(true);
      expect(pressed.replies[0]!.content).toContain(
        "Changed since this card was sent — nothing was forgotten; a new card with the current details follows.",
      );
      expect(pressed.replies[0]!.components).toEqual([]);
      expect(codeDms(b.dms)).toEqual([]);
      expect(contents()).toEqual(expect.arrayContaining(["KYN-TZ", "KYN-LANG"]));
      await waitFor(() => b.dms.filter((x) => x.components).length === 2, "the fresh card");
      const fresh = b.dms.filter((x) => x.components)[1]!;
      expect(fresh.content).toContain("Amount: 3 memories (3 stored), 0 session turns and 0 kept conversations");
      const flow = await approveWithCode(b.handlers, b.dms, OWNER_ID, buttons(fresh.components)[0]!.custom_id);
      expect(flow.submit[0]!.content).toContain("Approved by you — forgot 3 memories");
      expect(contents()).toEqual([]);
      expect(reqId).toMatch(/^fr_/);
    } finally {
      await b.result.stop();
    }
  });

  test("a forget card sent before the upgrade (no action hash recorded) is never acted on: a fresh card with the hash follows", async () => {
    const reqId = seedForgetAsk();
    // A v13 bridge already DMed the card: posted, but no action hash.
    const d = db();
    try {
      d.run(
        "UPDATE forget_requests SET card_channel_id = ?, card_message_id = ?, card_posted_at = ?, action_hash = NULL WHERE id = ?",
        [`dm-${OWNER_ID}`, "old-card", Date.now(), reqId],
      );
    } finally {
      d.close();
    }
    const b = await bridge();
    try {
      const old = await cardInteraction(b.handlers, OWNER_ID, approveCardCustomId("forget", "approve", reqId), {
        messageId: "old-card",
      });
      expect(old.replies[0]!.update).toBe(true);
      expect(old.replies[0]!.content).toContain(
        "Changed since this card was sent — nothing was forgotten; a new card with the current details follows.",
      );
      expect(old.replies[0]!.components).toEqual([]);
      expect(codeDms(b.dms)).toEqual([]);
      expect(contents()).toEqual(expect.arrayContaining(["KYN-TZ", "KYN-PRIVATE"]));
      await waitFor(() => b.dms.some((x) => x.components), "the fresh card");
      const fresh = b.dms.find((x) => x.components)!;
      expect(fresh.content).toContain("Amount: 2 memories (2 stored), 0 session turns and 0 kept conversations");
      const flow = await approveWithCode(b.handlers, b.dms, OWNER_ID, buttons(fresh.components)[0]!.custom_id);
      expect(flow.submit[0]!.content).toContain("Approved by you — forgot 2 memories");
      expect(contents()).toEqual([]);
    } finally {
      await b.result.stop();
    }
  });

  test("with no answer the forget ask lapses on the poll as a no and the asker is told", async () => {
    const reqId = seedForgetAsk();
    const d = db();
    try {
      d.run("UPDATE forget_requests SET expires_at = ? WHERE id = ?", [Date.now() - 1, reqId]);
    } finally {
      d.close();
    }
    const b = await bridge({ approvalPollMs: 20 });
    try {
      await waitFor(() => b.dms.some((x) => x.userId === KYN), "the asker's notice");
      expect(b.dms.find((x) => x.userId === KYN)!.content).toContain("got no answer in time");
      expect(b.dms.some((x) => x.components)).toBe(false);
      expect(contents()).toEqual(expect.arrayContaining(["KYN-TZ"]));
    } finally {
      await b.result.stop();
    }
  });
});

describe("schema v14: approval_requests and approval_codes (forward-only migration)", () => {
  test("a v13 DB migrates to v14 keeping its forget asks; the new tables and forget action_hash exist; a re-run changes nothing", () => {
    // v15 (blocking schedule asks, REQ-discord-606) follows v14.
    expect(SCHEMA_VERSION).toBe(15);
    const d = new SqliteDatabase(":memory:");
    try {
      migrateCorvidinhoDb(d);
      // Back to v13 (main before this change) with a pending forget ask.
      d.exec("DROP TABLE approval_requests");
      d.exec("DROP TABLE approval_codes");
      d.exec("ALTER TABLE forget_requests DROP COLUMN action_hash");
      d.run("UPDATE schema_meta SET value = '13' WHERE key = 'version'");
      d.run(
        `INSERT INTO forget_requests (id, subject_kind, subject_id, requester_user_id, status, created_at, expires_at)
         VALUES ('fr_old', 'user', 'u1', 'u1', 'pending', 1, 2)`,
      );
      migrateCorvidinhoDb(d);
      const version = () => (d.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as { value: string }).value;
      expect(version()).toBe(String(SCHEMA_VERSION));
      const cols = (t: string) => (d.query(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map((c) => c.name);
      expect(cols("forget_requests")).toContain("action_hash");
      expect(cols("approval_requests")).toEqual(
        expect.arrayContaining(["kind", "class", "action", "target", "amount", "text", "action_hash", "waiter", "status", "expires_at"]),
      );
      expect(cols("approval_codes")).toEqual(
        expect.arrayContaining(["kind", "request_id", "action_hash", "salt", "code_hash", "expires_at", "used_at", "voided_at"]),
      );
      // Only a hash of a code: no plain `code` column.
      expect(cols("approval_codes")).not.toContain("code");
      expect(d.query("SELECT id, status, action_hash FROM forget_requests").all()).toEqual([
        { id: "fr_old", status: "pending", action_hash: null },
      ]);
      migrateCorvidinhoDb(d);
      expect(version()).toBe(String(SCHEMA_VERSION));
      expect(d.query("SELECT COUNT(*) AS n FROM forget_requests").get()).toEqual({ n: 1 });
    } finally {
      d.close();
    }
  });

  test("what a card shows is scrubbed when stored and re-scrubbed with the rest (SAFE-6)", () => {
    expect(SCRUB_TARGETS).toContainEqual({ table: "approval_requests", columns: ["title", "action", "target", "amount", "text"] });
    const d = openCorvidinhoDb({ memory: true });
    try {
      const r = new ApprovalStore({ db: d }).request({
        kind: "test",
        title: "T",
        action: `use ${fakeToken()}`,
        target: "t",
        amount: "1",
        text: `token ${fakeToken()}`,
        ttlMs: MIN,
      });
      expect(r.action).toBe("use [redacted:github-token]");
      expect(r.text).toBe("token [redacted:github-token]");
      d.run("UPDATE approval_requests SET amount = ? WHERE id = ?", [`old ${fakeToken()}`, r.id]);
      expect(rescrubDatabase(d).byTable.approval_requests).toBe(1);
      expect(new ApprovalStore({ db: d }).get(r.id)!.amount).toBe("old [redacted:github-token]");
    } finally {
      d.close();
    }
  });
});
