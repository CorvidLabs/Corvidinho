/**
 * MEMORY-ACL-6 (#101) — anyone can ask to be forgotten; it forgets once the
 * owner approves on a DM Approve/Deny card.
 *
 * - `memory-forget-me` records the ask (the acting person, in a conversation
 *   with them; audited SAFE-5); nothing is deleted there.
 * - The bridge DMs the owner an Approve/Deny card (counts, no content), on a
 *   delivery pass (scheduler tick / after a chat message).
 * - Only the owner's press counts; Approve deletes all of that person's
 *   memories (profile scope, Discord-id scopes, soft-deleted history, private
 *   notes) and their session turns, audited `started` first (fail closed),
 *   and tells both; Deny, no answer or a late press is a no.
 * - Schema v12 adds `forget_requests` (forward-only migration).
 *
 * Temp allowlist file and data dir, the bridge with a fake gateway; no
 * token, no network.
 */
import { Database as SqliteDatabase } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAudit } from "../src/audit/log.ts";
import {
  APPROVE_CARD_PREFIX,
  approveCardCustomId,
  buildApproveDenyComponents,
  formatApproveCard,
  formatDecidedCard,
  isApproveCardExpired,
  parseApproveCardCustomId,
} from "../src/discord/approve-card.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createForgetCards, FORGET_CARD_KIND, FORGET_NOT_OWNER } from "../src/discord/forget-card.ts";
import { createNullGateway, type ComponentInteraction, type GatewayHandlers } from "../src/discord/gateway.ts";
import { ensureSessionTurns } from "../src/discord/session-thread.ts";
import { buildPeopleDirectory, parsePeopleToml } from "../src/identity/people.ts";
import { FORGET_REQUEST_TTL_MS, ForgetRequestStore, MemoryStore, memorySubjectFor } from "../src/memory/index.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { migrateCorvidinhoDb, openCorvidinhoDb, SCHEMA_VERSION } from "../src/store/db.ts";

const OWNER_ID = "181969874455756800";
const TOFU = "200000000000000002"; // declared team
const TOFU_ALT = "200000000000000022";
const KYN = "300000000000000003"; // declared community
const STRANGER = "500000000000000005"; // undeclared
const CHAN = "600000000000000006";
const OWNER = { discordId: OWNER_ID, display: "Leif" };

const PEOPLE = `[people.tofu]
display = "Tofu"
role = "team"
discord_ids = ["${TOFU}", "${TOFU_ALT}"]

[people.kyn]
display = "Kyn"
role = "community"
discord_ids = ["${KYN}"]
`;

function fileText(withOwner = true): string {
  return `[discord]
channels = ["${CHAN}"]
users = []
roles = []
deny_users = []
${withOwner ? `\n[owner]\ndiscord_id = "${OWNER_ID}"\ndisplay = "Leif"\n` : ""}
${PEOPLE}`;
}

const KEYS = [
  "CORVIDINHO_DATA_DIR",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_ROLE",
  "CORVIDINHO_DISCORD_REPLY_CHANNEL_ID",
  "CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID",
  "CORVIDINHO_DISCORD_SESSION_ID",
  "CORVIDINHO_MEMORY_INMEM",
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_AUDIT_HMAC_KEY",
  "DISCORD_MUTED_USER_IDS",
] as const;

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
  dir = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-forget-")));
  path = join(dir, "allowlist.toml");
  dataDir = join(dir, "data");
  writeFileSync(path, fileText());
  process.env.CORVIDINHO_ALLOWLIST_FILE = path;
  process.env.CORVIDINHO_DATA_DIR = dataDir;
  clearRegistry();
  loadBuiltins();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  clearRegistry();
  rmSync(dir, { recursive: true, force: true });
});

/** A Discord conversation as the bridge stamps it. */
function chat(actor: string, opts: { owner?: boolean; role?: string; conversation?: boolean } = {}): void {
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = actor;
  process.env.CORVIDINHO_ACTING_IS_ADMIN = opts.owner ? "1" : "0";
  process.env.CORVIDINHO_ACTING_ROLE = opts.role ?? (opts.owner ? "owner" : "community");
  process.env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID = opts.conversation === false ? "" : CHAN;
  process.env.CORVIDINHO_DISCORD_SESSION_ID = `s-${actor}`;
}

async function plugin(name: string, args: string[] = []) {
  return runPlugin({ name, args, nonInteractive: true, allowlist: [], cwd: dir, json: false });
}

function db(): SqliteDatabase {
  return openCorvidinhoDb({ env: process.env });
}

function auditActions(): Array<{ action: string; actor: string; outcome: string }> {
  const d = db();
  try {
    return d.query("SELECT action, actor, outcome FROM audit_log ORDER BY seq").all() as Array<{ action: string; actor: string; outcome: string }>;
  } finally {
    d.close();
  }
}

function allContents(): string[] {
  const d = db();
  try {
    return (d.query("SELECT content FROM memories").all() as Array<{ content: string }>).map((r) => r.content);
  } finally {
    d.close();
  }
}

/** Tofu's memories on every scope, Kyn's, and a project row. */
function seedMemories(): void {
  const d = db();
  try {
    const m = new MemoryStore({ db: d });
    m.store({ ownerUserId: "person:tofu", category: "preference", key: "tz", content: "TOFU-TZ" });
    m.store({ ownerUserId: "person:tofu", category: "private", key: "n", content: "TOFU-PRIVATE" });
    m.store({ ownerUserId: "person:tofu", category: "decision", key: "d", content: "TOFU-DECISION-OLD" });
    // Re-stored: the old content is kept soft-deleted — forget-me removes it too.
    m.store({ ownerUserId: "person:tofu", category: "decision", key: "d", content: "TOFU-DECISION-NEW" });
    m.store({ ownerUserId: TOFU, category: "person", key: "legacy", content: "TOFU-LEGACY" });
    m.store({ ownerUserId: TOFU_ALT, category: "person", key: "alt", content: "TOFU-ALT" });
    m.store({ ownerUserId: "person:kyn", category: "preference", key: "tz", content: "KYN-TZ" });
    m.store({ ownerUserId: STRANGER, category: "person", key: "x", content: "STRANGER-NOTE" });
    m.store({ ownerUserId: "project:corvidlabs/demo", category: "entity", key: "cmd", content: "PROJECT-FACT" });
    // A live session of Tofu's, with its turns (their conversation).
    ensureSessionTurns(d);
    const t = Date.now();
    d.run(`INSERT INTO discord_sessions (id, channel_id, user_id, created_at, last_activity_at) VALUES ('sess-tofu', ?, ?, ?, ?)`, [CHAN, TOFU, t, t]);
    d.run(`INSERT INTO discord_sessions (id, channel_id, user_id, created_at, last_activity_at) VALUES ('sess-kyn', ?, ?, ?, ?)`, [CHAN, KYN, t, t]);
    d.run(`INSERT INTO discord_session_turns (session_id, role, content, created_at) VALUES ('sess-tofu', 'human', 'TOFU-TURN', ?)`, [t]);
    d.run(`INSERT INTO discord_session_turns (session_id, role, content, created_at) VALUES ('sess-kyn', 'human', 'KYN-TURN', ?)`, [t]);
  } finally {
    d.close();
  }
}

function turnContents(): string[] {
  const d = db();
  try {
    return (d.query("SELECT content FROM discord_session_turns").all() as Array<{ content: string }>).map((r) => r.content);
  } finally {
    d.close();
  }
}

type Sent = { userId: string; content: string; components?: unknown[] };

/** The bridge with a fake gateway that records DMs, posts and card edits. */
async function bridge(opts: { dmFails?: Set<string> } = {}) {
  const dms: Sent[] = [];
  const posts: Array<{ channelId: string; content: string; mentionUserIds?: string[] }> = [];
  const edits: Array<{ channelId: string; messageId: string; content?: string | null; components?: unknown[] | null }> = [];
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const result = await startBridge({
    env: { DISCORD_BOT_TOKEN: "fake", CORVIDINHO_DISCORD_DRY_RUN: "1", CORVIDINHO_ALLOWLIST_FILE: path, CORVIDINHO_DATA_DIR: dataDir, HOME: dir },
    projectRoot: dir,
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound: memoryThinkingOutbound(),
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent: { async runChat(o) { return { ok: true, sessionId: o.sessionId, summary: "done", exitCode: 0 }; } },
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      let n = 0;
      handlers.reply = async (o) => {
        posts.push(o);
        n += 1;
        return { messageId: `post-${n}` };
      };
      handlers.sendDm = async (o) => {
        if (opts.dmFails?.has(o.userId)) return null;
        dms.push(o);
        n += 1;
        return { channelId: `dm-${o.userId}`, messageId: `dm-msg-${n}` };
      };
      handlers.editMessage = async (o) => {
        edits.push(o);
        return true;
      };
      return createNullGateway();
    },
  });
  if (result.ok !== true || !box.handlers) throw new Error("bridge did not start");
  const press = async (userId: string, customId: string) => {
    const replies: Array<{ content?: string; ephemeral?: boolean; components?: unknown[]; update?: boolean }> = [];
    const ix: ComponentInteraction = {
      id: `ix-${Math.random()}`,
      customId,
      channelId: `dm-${OWNER_ID}`,
      userId,
      reply: async (o) => {
        replies.push(o);
      },
    };
    await box.handlers!.onComponent!(ix);
    return replies;
  };
  return { result, dms, posts, edits, press, handlers: box.handlers };
}

function cardFor(dms: Sent[]): { text: string; approve: string; deny: string } {
  const card = dms.find((d) => d.userId === OWNER_ID && d.components);
  if (!card) throw new Error("no card");
  const row = (card.components as Array<{ components: Array<{ custom_id: string; label: string; style: number }> }>)[0]!;
  return { text: card.content, approve: row.components[0]!.custom_id, deny: row.components[1]!.custom_id };
}

describe("approve-card helper (the base the SAFE-18..20 cards extend)", () => {
  test("custom ids round-trip; junk parses to null; Approve danger + Deny grey; expiry and text", () => {
    const id = approveCardCustomId("forget", "approve", "fr_abc123");
    expect(id).toBe(`${APPROVE_CARD_PREFIX}:forget:approve:fr_abc123`);
    expect(parseApproveCardCustomId(id)).toEqual({ kind: "forget", decision: "approve", id: "fr_abc123" });
    expect(parseApproveCardCustomId("cvok:forget:deny:fr_1")).toEqual({ kind: "forget", decision: "deny", id: "fr_1" });
    for (const bad of ["cvask:open:x", "cvok:forget:maybe:x", "cvok:Forget:approve:x", "cvok:forget:approve:a:b", "cvok:forget:approve:"]) {
      expect(parseApproveCardCustomId(bad)).toBeNull();
    }
    expect(() => approveCardCustomId("forget", "approve", "has:colon")).toThrow();
    const rows = buildApproveDenyComponents("forget", "fr_1");
    expect(rows[0]!.components.map((b) => [b.label, b.style])).toEqual([["Approve", 4], ["Deny", 2]]);
    expect(isApproveCardExpired(1000, 999)).toBe(false);
    expect(isApproveCardExpired(1000, 1000)).toBe(true);
    const text = formatApproveCard({ title: "T", lines: ["a\nb"], expiresAt: 1_800_000_000_000 });
    expect(text).toBe("**T**\n- a b\nNo answer by <t:1800000000:R> means no.");
    expect(formatDecidedCard(text, "Denied")).toBe("**T**\n- a b\n**Denied**");
  });
});

describe("memory-forget-me: anyone can ask, nothing is deleted there", () => {
  test("a declared person, a community member and an undeclared user can ask; one open ask each; audited", async () => {
    seedMemories();
    chat(KYN);
    const r = await plugin("memory-forget-me");
    expect(r.ok).toBe(true);
    expect(r.message).toContain("Nothing is forgotten until they approve");
    const id = (r.data as { requestId: string }).requestId;
    const again = await plugin("memory-forget-me");
    expect(again.ok).toBe(true);
    expect((again.data as { requestId: string; created: boolean }).requestId).toBe(id);
    expect((again.data as { created: boolean }).created).toBe(false);
    chat(STRANGER);
    expect((await plugin("memory-forget-me")).ok).toBe(true);
    chat(TOFU_ALT, { role: "team" });
    expect((await plugin("memory-forget-me")).ok).toBe(true);
    // Nothing deleted yet.
    expect(allContents()).toEqual(expect.arrayContaining(["TOFU-TZ", "KYN-TZ", "STRANGER-NOTE"]));
    const d = db();
    try {
      const rows = d.query("SELECT subject_kind, subject_id, requester_user_id, status FROM forget_requests ORDER BY created_at").all();
      expect(rows).toEqual([
        { subject_kind: "person", subject_id: "kyn", requester_user_id: KYN, status: "pending" },
        { subject_kind: "user", subject_id: STRANGER, requester_user_id: STRANGER, status: "pending" },
        { subject_kind: "person", subject_id: "tofu", requester_user_id: TOFU_ALT, status: "pending" },
      ]);
    } finally {
      d.close();
    }
    const audit = auditActions().filter((a) => a.action === "memory-forget-request");
    expect(audit.map((a) => a.outcome)).toEqual(["started", "ok", "started", "ok", "started", "ok", "started", "ok"]);
  });

  test("refused: no actor, outside a conversation (schedule), with arguments, and with no owner configured", async () => {
    const noActor = await plugin("memory-forget-me");
    expect(noActor.ok).toBe(false);
    expect(noActor.error).toContain("no acting user");
    chat(KYN, { conversation: false });
    const sched = await plugin("memory-forget-me");
    expect(sched.ok).toBe(false);
    expect(sched.error).toContain("in a conversation");
    chat(KYN);
    for (const args of [["--person", "tofu"], ["tofu"], ["--user", TOFU]]) {
      expect((await plugin("memory-forget-me", args)).ok).toBe(false);
    }
    writeFileSync(path, fileText(false));
    const noOwner = await plugin("memory-forget-me");
    expect(noOwner.ok).toBe(false);
    expect(noOwner.error).toContain("no owner");
    const d = db();
    try {
      expect(d.query("SELECT COUNT(*) AS n FROM forget_requests").get()).toEqual({ n: 0 });
    } finally {
      d.close();
    }
  });
});

describe("the owner approves on a DM card; only then is the person forgotten", () => {
  test("card to the owner (counts, no content); non-owner press refused; Approve forgets everything of that person and tells both", async () => {
    seedMemories();
    const originalPeople = readFileSync(path, "utf8");
    chat(TOFU, { role: "team" });
    const asked = await plugin("memory-forget-me");
    const reqId = (asked.data as { requestId: string }).requestId;
    const b = await bridge();
    try {
      const pass = await b.result.deliverForgetCards!();
      expect(pass.posted).toBe(1);
      const card = cardFor(b.dms);
      expect(card.text).toContain("Forget request");
      expect(card.text).toContain("Tofu (tofu), team");
      expect(card.text).toContain(`<@${TOFU}>`);
      // Five kept now (the superseded decision is history, deleted on approve too).
      expect(card.text).toContain("(5 stored)");
      expect(card.text).toContain(reqId);
      expect(card.text).toContain("means no");
      expect(card.text).not.toMatch(/TOFU-|KYN-|PROJECT-FACT/);
      expect(parseApproveCardCustomId(card.approve)).toEqual({ kind: FORGET_CARD_KIND, decision: "approve", id: reqId });
      // A second pass sends no second card.
      expect((await b.result.deliverForgetCards!()).posted).toBe(0);

      // Someone else pressing (even Tofu) counts for nothing.
      for (const who of [TOFU, KYN]) {
        const r = await b.press(who, card.approve);
        expect(r).toEqual([{ content: FORGET_NOT_OWNER, ephemeral: true }]);
      }
      expect(allContents()).toContain("TOFU-TZ");

      // The bridge holds Tofu's live thread in memory (a next run replays it).
      const tofuSession = b.result.store.get("sess-tofu")!;
      const kynSession = b.result.store.get("sess-kyn")!;
      expect(b.result.store.threadFor(tofuSession).map((t) => t.content)).toEqual(["TOFU-TURN"]);

      const r = await b.press(OWNER_ID, card.approve);
      expect(r).toHaveLength(1);
      // The press is answered first (Discord's ~3 s window), before any DM.
      expect(r[0]!.update).toBe(true);
      expect(r[0]!.components).toEqual([]);
      expect(r[0]!.content).toContain("Approved by you — forgot 6 memories and 1 conversation turns.");
      expect(r[0]!.content).not.toContain("told");
      // Then the card says whether the asker was told.
      const cardEdit = b.edits.at(-1)!;
      expect(cardEdit.channelId).toBe(`dm-${OWNER_ID}`);
      expect(cardEdit.content).toContain("Approved by you — forgot 6 memories and 1 conversation turns. They have been told.");
      expect(cardEdit.components).toEqual([]);
      // Forgotten from the running bridge too: no later run replays Tofu's turns.
      expect(b.result.store.threadFor(tofuSession)).toEqual([]);
      expect(b.result.store.threadFor(kynSession).map((t) => t.content)).toEqual(["KYN-TURN"]);

      const left = allContents();
      for (const gone of ["TOFU-TZ", "TOFU-PRIVATE", "TOFU-DECISION-OLD", "TOFU-DECISION-NEW", "TOFU-LEGACY", "TOFU-ALT"]) {
        expect(left).not.toContain(gone);
      }
      expect(left).toEqual(expect.arrayContaining(["KYN-TZ", "STRANGER-NOTE", "PROJECT-FACT"]));
      expect(turnContents()).toEqual(["KYN-TURN"]);
      // The people list is the owner's: untouched.
      expect(readFileSync(path, "utf8")).toBe(originalPeople);

      const told = b.dms.filter((d) => d.userId === TOFU);
      expect(told).toHaveLength(1);
      expect(told[0]!.content).toContain("was approved");
      const actions = auditActions().filter((a) => a.action.startsWith("memory-forget-"));
      expect(actions).toEqual(
        expect.arrayContaining([
          { action: "memory-forget-card", actor: TOFU, outcome: "ok" },
          { action: "memory-forget-approve", actor: TOFU, outcome: "denied" },
          { action: "memory-forget-approve", actor: KYN, outcome: "denied" },
          { action: "memory-forget-approve", actor: OWNER_ID, outcome: "started" },
          { action: "memory-forget-approve", actor: OWNER_ID, outcome: "ok" },
        ]),
      );
      // A second press finds it closed; nothing more happens.
      const again = await b.press(OWNER_ID, card.approve);
      expect(again[0]!.content).toContain("Already closed (approved)");
    } finally {
      await b.result.stop();
    }
  });

  test("Deny forgets nothing and tells the asker; a DM that fails falls back to their conversation", async () => {
    seedMemories();
    chat(KYN);
    await plugin("memory-forget-me");
    const b = await bridge({ dmFails: new Set([KYN]) });
    try {
      await b.result.deliverForgetCards!();
      const card = cardFor(b.dms);
      const r = await b.press(OWNER_ID, card.deny);
      expect(r[0]!.content).toContain("Denied by you — nothing was forgotten.");
      expect(b.edits.at(-1)!.content).toContain("Denied by you — nothing was forgotten. They have been told.");
      expect(allContents()).toContain("KYN-TZ");
      expect(b.posts).toHaveLength(1);
      expect(b.posts[0]!.channelId).toBe(CHAN);
      expect(b.posts[0]!.mentionUserIds).toEqual([KYN]);
      expect(b.posts[0]!.content).toContain("did not approve");
      expect(auditActions()).toEqual(expect.arrayContaining([{ action: "memory-forget-deny", actor: OWNER_ID, outcome: "ok" }]));
    } finally {
      await b.result.stop();
    }
  });

  test("the chat path delivers the card right after the message that asked", async () => {
    chat(STRANGER);
    await plugin("memory-forget-me");
    const b = await bridge();
    try {
      await b.handlers.onMessage({ id: "m1", channelId: CHAN, authorId: STRANGER, authorBot: false, content: "<@999> forget me", mentionedBot: true });
      for (let i = 0; i < 50 && b.dms.length === 0; i++) await Bun.sleep(10);
      expect(cardFor(b.dms).text).toContain(`<@${STRANGER}> (not on your people list)`);
    } finally {
      await b.result.stop();
    }
  });

  test("SAFE-5 fail closed: with no audit row possible, Approve deletes nothing and the ask stays open", async () => {
    seedMemories();
    chat(KYN);
    await plugin("memory-forget-me");
    const b = await bridge();
    try {
      await b.result.deliverForgetCards!();
      const card = cardFor(b.dms);
      // The chain is keyed from here on, and the bridge has no key.
      const d = db();
      try {
        appendAudit(d, { action: "x", actor: "t", surface: "cli", argsDigest: "0", outcome: "ok" }, { key: "k" });
      } finally {
        d.close();
      }
      const r = await b.press(OWNER_ID, card.approve);
      expect(r[0]!.ephemeral).toBe(true);
      expect(r[0]!.content).toContain("Audit log unavailable");
      expect(allContents()).toContain("KYN-TZ");
      const d2 = db();
      try {
        expect(d2.query("SELECT status FROM forget_requests").get()).toEqual({ status: "pending" });
      } finally {
        d2.close();
      }
    } finally {
      await b.result.stop();
    }
  });
});

describe("no answer, or a late answer, is no", () => {
  test("an unanswered ask expires: card closed, asker told, nothing deleted; a late Approve deletes nothing", async () => {
    seedMemories();
    const d = db();
    let t = 1_000_000;
    const now = () => t;
    const dms: Sent[] = [];
    const edits: Array<{ content?: string | null; components?: unknown[] | null }> = [];
    const people = buildPeopleDirectory(parsePeopleToml(PEOPLE), OWNER);
    try {
      const reqs = new ForgetRequestStore({ db: d, now });
      const a = reqs.request({ subject: memorySubjectFor(people, KYN)!, requesterUserId: KYN });
      const b = reqs.request({ subject: memorySubjectFor(people, TOFU)!, requesterUserId: TOFU });
      expect(a.request.expiresAt).toBe(t + FORGET_REQUEST_TTL_MS);
      const cards = createForgetCards({
        db: d,
        env: {},
        owner: () => OWNER,
        people: () => people,
        now,
        sendDm: async (o) => {
          dms.push(o);
          return { channelId: `dm-${o.userId}`, messageId: `m${dms.length}` };
        },
        editMessage: async (o) => {
          edits.push(o);
          return true;
        },
      });
      expect(await cards.deliver()).toEqual({ posted: 2, expired: 0, notified: 0 });
      t += FORGET_REQUEST_TTL_MS;
      // Kyn's ask lapses on the pass; Tofu's card is pressed late.
      const replies: Array<{ content?: string; update?: boolean }> = [];
      const late: ComponentInteraction = {
        id: "late",
        customId: approveCardCustomId(FORGET_CARD_KIND, "approve", b.request.id),
        channelId: `dm-${OWNER_ID}`,
        userId: OWNER_ID,
        reply: async (o) => {
          replies.push(o);
        },
      };
      await cards.press(late, parseApproveCardCustomId(late.customId)!, true);
      expect(replies[0]!.content).toContain("Expired — no answer in time, so nothing was forgotten.");
      expect(await cards.deliver()).toEqual({ posted: 0, expired: 1, notified: 1 });
      expect(edits.at(-1)!.content).toContain("Expired — no answer, so nothing was forgotten.");
      expect(edits.at(-1)!.components).toEqual([]);
      expect(dms.filter((m) => m.userId === KYN)[0]!.content).toContain("got no answer in time");
      expect(dms.filter((m) => m.userId === TOFU)[0]!.content).toContain("got no answer in time");
      expect(reqs.get(a.request.id)!.status).toBe("expired");
      expect(reqs.get(b.request.id)!.status).toBe("expired");
      expect(allContents()).toEqual(expect.arrayContaining(["KYN-TZ", "TOFU-TZ"]));
      // A new ask after expiry is a new request.
      const again = reqs.request({ subject: memorySubjectFor(people, KYN)!, requesterUserId: KYN });
      expect(again.created).toBe(true);
    } finally {
      d.close();
    }
  });
});

describe("schema v12: forget_requests (forward-only migration)", () => {
  test("a v11 DB migrates to v12 keeping its memories; one pending ask per subject", () => {
    // v13 (retained conversations, REQ-discord-472) follows v12.
    expect(SCHEMA_VERSION).toBe(13);
    const d = new SqliteDatabase(":memory:");
    try {
      migrateCorvidinhoDb(d);
      new MemoryStore({ db: d }).store({ ownerUserId: KYN, category: "person", key: "k", content: "KEPT" });
      d.exec("DROP TABLE forget_requests");
      d.run("UPDATE schema_meta SET value = '11' WHERE key = 'version'");
      migrateCorvidinhoDb(d);
      expect(d.query("SELECT value FROM schema_meta WHERE key = 'version'").get()).toEqual({ value: String(SCHEMA_VERSION) });
      expect(d.query("SELECT content FROM memories").all()).toEqual([{ content: "KEPT" }]);
      const cols = (d.query("PRAGMA table_info(forget_requests)").all() as Array<{ name: string }>).map((c) => c.name);
      expect(cols).toEqual(expect.arrayContaining(["subject_kind", "subject_id", "requester_user_id", "status", "expires_at", "card_message_id"]));
      // No free-text column (SAFE-6: nothing to scrub).
      expect(cols).not.toContain("content");
      const ins = (id: string) =>
        d.run(
          `INSERT INTO forget_requests (id, subject_kind, subject_id, requester_user_id, status, created_at, expires_at)
           VALUES (?, 'person', 'kyn', ?, 'pending', 1, 2)`,
          [id, KYN],
        );
      ins("a");
      expect(() => ins("b")).toThrow();
      // Re-running is a no-op (forward-only, idempotent).
      migrateCorvidinhoDb(d);
      expect(d.query("SELECT value FROM schema_meta WHERE key = 'version'").get()).toEqual({ value: String(SCHEMA_VERSION) });
    } finally {
      d.close();
    }
  });
});
