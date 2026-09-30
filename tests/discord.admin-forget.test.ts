/**
 * MEMORY-ACL-6.a (#101) — the owner can start a forget for any declared
 * person with /admin; it forgets only after the owner approves on the card.
 *
 * - `/admin people forget person:<id>` (owner only, audited SAFE-5 like the
 *   other /admin people ops) records the same `forget_requests` ask a
 *   person's own request does and DMs the owner the same Approve/Deny card;
 *   nothing is deleted before Approve; one open ask per person.
 * - Approve deletes that person's memory, never the owner's (the owner who
 *   started it is not a target); nobody else is DMed (the card shows it).
 * - Undeclared ids, a non-owner and a missing audit trail are refused.
 * - What an approved ask deletes covers the GitHub login and numeric id a
 *   GitHub ask came from, and never treats a GitHub or /admin asker as a
 *   Discord id.
 *
 * Only APIs that exist on the base are used, so each test fails there on its
 * assertions. Temp allowlist file and data dir, the bridge with a null
 * gateway; no token, no network.
 */
import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAllowlist } from "../src/allowlist/load.ts";
import type { AuditEntryInput } from "../src/audit/index.ts";
import { appendAudit } from "../src/audit/log.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type ComponentInteraction, type GatewayHandlers } from "../src/discord/gateway.ts";
import { handleAdminCommand } from "../src/discord/command-handlers/admin.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import { ensureSessionTurns } from "../src/discord/session-thread.ts";
import { buildSlashCommandBodies, OPT_STRING } from "../src/discord/slash-commands.ts";
import type { SlashContext, SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import { NOT_AUTHORIZED } from "../src/discord/types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { buildPeopleDirectory, parsePeopleToml } from "../src/identity/people.ts";
import { forgetTargets, MemoryStore } from "../src/memory/index.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const OWNER_ID = "181969874455756800";
const TOFU = "200000000000000002";
const KYN = "300000000000000003";
const CHAN = "600000000000000006";

const PEOPLE = `[people.tofu]
display = "Tofu"
role = "team"
discord_ids = ["${TOFU}"]
github_logins = ["tofu-dev"]
github_ids = ["4242"]

[people.kyn]
display = "Kyn"
role = "community"
discord_ids = ["${KYN}"]
`;

const FILE = `[discord]
channels = ["${CHAN}"]
users = []
roles = []
deny_users = []

[owner]
discord_id = "${OWNER_ID}"
display = "Leif"

${PEOPLE}`;

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
  dir = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-admin-forget-")));
  path = join(dir, "allowlist.toml");
  dataDir = join(dir, "data");
  writeFileSync(path, FILE);
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

function db(): Database {
  return openCorvidinhoDb({ env: process.env });
}

function query<T>(sql: string): T[] {
  const d = db();
  try {
    return d.query(sql).all() as T[];
  } finally {
    d.close();
  }
}

/** Tofu's and Kyn's memory, the owner's own (Discord-id scope), and session turns. */
function seed(): void {
  const d = db();
  try {
    const m = new MemoryStore({ db: d });
    m.store({ ownerUserId: "person:tofu", category: "preference", key: "tz", content: "TOFU-TZ" });
    m.store({ ownerUserId: "person:tofu", category: "private", key: "n", content: "TOFU-PRIVATE" });
    m.store({ ownerUserId: TOFU, category: "person", key: "legacy", content: "TOFU-LEGACY" });
    m.store({ ownerUserId: "person:kyn", category: "preference", key: "tz", content: "KYN-TZ" });
    m.store({ ownerUserId: OWNER_ID, category: "person", key: "me", content: "OWNER-NOTE" });
    ensureSessionTurns(d);
    const t = Date.now();
    for (const [id, user, text] of [["sess-tofu", TOFU, "TOFU-TURN"], ["sess-owner", OWNER_ID, "OWNER-TURN"]] as const) {
      d.run(`INSERT INTO discord_sessions (id, channel_id, user_id, created_at, last_activity_at) VALUES (?, ?, ?, ?, ?)`, [id, CHAN, user, t, t]);
      d.run(`INSERT INTO discord_session_turns (session_id, role, content, created_at) VALUES (?, 'human', ?, ?)`, [id, text, t]);
    }
  } finally {
    d.close();
  }
}

async function bridge(env: Record<string, string> = {}) {
  const dms: Array<{ userId: string; content: string; components?: unknown[] }> = [];
  const edits: Array<{ content?: string | null }> = [];
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const result = await startBridge({
    env: { DISCORD_BOT_TOKEN: "fake", CORVIDINHO_DISCORD_DRY_RUN: "1", CORVIDINHO_ALLOWLIST_FILE: path, CORVIDINHO_DATA_DIR: dataDir, HOME: dir, ...env },
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
  const handlers = box.handlers;
  const admin = async (userId: string, options: SlashInteraction["options"]) => {
    const replies: SlashReplyPayload[] = [];
    await handlers.onSlash!({
      id: `ix-${Math.random()}`,
      commandName: "admin",
      subcommandGroup: "people",
      subcommand: "forget",
      channelId: CHAN,
      userId,
      options,
      reply: async (o) => {
        replies.push(o);
      },
    });
    return replies;
  };
  const press = async (userId: string, customId: string) => {
    const replies: Array<{ content?: string; components?: unknown[]; update?: boolean }> = [];
    const ix: ComponentInteraction = {
      id: `ix-${Math.random()}`,
      customId,
      channelId: `dm-${OWNER_ID}`,
      userId,
      reply: async (o) => {
        replies.push(o);
      },
    };
    await handlers.onComponent!(ix);
    return replies;
  };
  const card = () => {
    const c = dms.find((d) => d.userId === OWNER_ID && d.components);
    if (!c) throw new Error("no card");
    const row = (c.components as Array<{ components: Array<{ custom_id: string }> }>)[0]!;
    return { text: c.content, approve: row.components[0]!.custom_id, deny: row.components[1]!.custom_id };
  };
  return { result, dms, edits, admin, press, card };
}

describe("/admin people forget (MEMORY-ACL-6.a): the owner starts it for any declared person", () => {
  test("registered under /admin people with a required person id", () => {
    const admin = buildSlashCommandBodies().find((b) => b.name === "admin");
    const people = admin?.options?.find((g) => g.name === "people");
    const forget = people?.options?.find((o) => o.name === "forget");
    expect(forget?.description).toContain("owner only");
    expect(forget?.options?.map((o) => [o.type, o.name, o.required])).toEqual([[OPT_STRING, "person", true]]);
  });

  test("the same card as a person's own ask, audited; nothing goes before Approve; Approve forgets them, never the owner who started it", async () => {
    seed();
    const originalPeople = readFileSync(path, "utf8");
    const b = await bridge();
    try {
      const r = await b.admin(OWNER_ID, { person: "Tofu" });
      expect(r).toHaveLength(1);
      expect(r[0]!.ephemeral).toBe(true);
      expect(r[0]!.content).toContain("asked to forget Tofu (tofu)");
      expect(r[0]!.content).toContain("nothing is forgotten until you approve");
      expect(r[0]!.content).toMatch(/Audit: #\d+ started · #\d+ ok\./);
      const rows = query<{ id: string; subject_kind: string; subject_id: string; requester_user_id: string; status: string }>(
        "SELECT id, subject_kind, subject_id, requester_user_id, status FROM forget_requests",
      );
      expect(rows).toEqual([{ id: expect.any(String), subject_kind: "person", subject_id: "tofu", requester_user_id: `admin:${OWNER_ID}`, status: "pending" }]);
      const reqId = rows[0]!.id;
      expect(r[0]!.content).toContain(reqId);
      // The card went out right away, to the owner only.
      const card = b.card();
      expect(card.text).toContain("Forget request");
      expect(card.text).toContain("Tofu (tofu), team — started by you with /admin people forget");
      expect(card.text).toContain(reqId);
      expect(card.text).not.toMatch(/TOFU-|OWNER-/);
      // Nothing deleted yet.
      expect(query<{ content: string }>("SELECT content FROM memories").map((m) => m.content)).toContain("TOFU-TZ");

      // One open ask per person: a second /admin forget reuses it.
      const again = await b.admin(OWNER_ID, { person: "tofu" });
      expect(again[0]!.content).toContain(`already has an open forget request (${reqId})`);
      expect(query<{ n: number }>("SELECT COUNT(*) AS n FROM forget_requests")[0]!.n).toBe(1);

      const pressed = await b.press(OWNER_ID, card.approve);
      expect(pressed[0]!.content).toContain("Approved by you — forgot 3 memories and 1 conversation turns.");
      const left = query<{ content: string }>("SELECT content FROM memories").map((m) => m.content);
      for (const gone of ["TOFU-TZ", "TOFU-PRIVATE", "TOFU-LEGACY"]) expect(left).not.toContain(gone);
      // The owner who started it is not a target.
      expect(left).toEqual(expect.arrayContaining(["KYN-TZ", "OWNER-NOTE"]));
      expect(query<{ content: string }>("SELECT content FROM discord_session_turns").map((t) => t.content)).toEqual(["OWNER-TURN"]);
      // Nobody else is DMed and the card is not told about an asker.
      expect(b.dms.every((d) => d.userId === OWNER_ID)).toBe(true);
      expect(b.edits.map((e) => e.content ?? "").join()).not.toContain("told");
      expect(query<{ n: number }>("SELECT COUNT(*) AS n FROM forget_requests WHERE notified_at IS NOT NULL")[0]!.n).toBe(1);
      expect(readFileSync(path, "utf8")).toBe(originalPeople);

      const audit = query<{ action: string; actor: string; outcome: string }>(
        "SELECT action, actor, outcome FROM audit_log WHERE action IN ('admin-people-forget', 'memory-forget-card', 'memory-forget-approve') ORDER BY seq",
      );
      expect(audit).toEqual([
        { action: "admin-people-forget", actor: OWNER_ID, outcome: "started" },
        { action: "admin-people-forget", actor: OWNER_ID, outcome: "ok" },
        { action: "memory-forget-card", actor: OWNER_ID, outcome: "ok" },
        { action: "admin-people-forget", actor: OWNER_ID, outcome: "started" },
        { action: "admin-people-forget", actor: OWNER_ID, outcome: "ok" },
        { action: "memory-forget-approve", actor: OWNER_ID, outcome: "started" },
        { action: "memory-forget-approve", actor: OWNER_ID, outcome: "ok" },
      ]);
    } finally {
      await b.result.stop();
    }
  });

  test("refused: an undeclared id, a Discord id, no person, a non-owner, and no audit trail — nothing is asked", async () => {
    seed();
    const b = await bridge();
    try {
      const nobody = await b.admin(OWNER_ID, { person: "nobody" });
      expect(nobody[0]!.content).toContain('"nobody" is not a declared person');
      const byDiscordId = await b.admin(OWNER_ID, { person: TOFU });
      expect(byDiscordId[0]!.content).toContain("is not a declared person");
      const none = await b.admin(OWNER_ID, {});
      expect(none[0]!.content).toContain("usage: /admin people forget person:<id>");
      // A non-owner is refused at the dispatch floor (DISCORD-7), before the handler.
      const notOwner = await b.admin(TOFU, { person: "kyn" });
      expect(notOwner[0]!.content).toBe(NOT_AUTHORIZED);
      expect(query<{ n: number }>("SELECT COUNT(*) AS n FROM forget_requests")[0]!.n).toBe(0);
      expect(b.dms).toHaveLength(0);
      const audit = query<{ actor: string; outcome: string }>(
        "SELECT actor, outcome FROM audit_log WHERE action = 'admin-people-forget' ORDER BY seq",
      );
      expect(audit).toEqual([
        { actor: OWNER_ID, outcome: "denied" },
        { actor: OWNER_ID, outcome: "denied" },
      ]);
    } finally {
      await b.result.stop();
    }
    // The chain is keyed from here on and the bridge has no key: the trail
    // refuses the started row, so nothing is asked (SAFE-5, fail closed).
    const d = db();
    try {
      appendAudit(d, { action: "x", actor: "t", surface: "cli", argsDigest: "0", outcome: "ok" }, { key: "k" });
    } finally {
      d.close();
    }
    const noKey = await bridge();
    try {
      const r = await noKey.admin(OWNER_ID, { person: "tofu" });
      expect(r[0]!.content).toContain("audit log unavailable (SAFE-5)");
      expect(r[0]!.content).toContain("Nothing was asked.");
      expect(query<{ n: number }>("SELECT COUNT(*) AS n FROM forget_requests")[0]!.n).toBe(0);
      expect(noKey.dms).toHaveLength(0);
    } finally {
      await noKey.result.stop();
    }
  });
});

describe("/admin people forget handler re-checks (ADMIN-4 / DISCORD-7)", () => {
  test("called directly: a non-owner is refused with a denied row; with no database nothing is asked", async () => {
    const env = { CORVIDINHO_ALLOWLIST_FILE: path, HOME: dir };
    const allowlist = await loadAllowlist({ env, home: dir });
    const rows: AuditEntryInput[] = [];
    const ctx: SlashContext = {
      store: new SessionStore(),
      workStore: new WorkStore(),
      allowlist,
      agent: createEchoAgentClient({ delayMs: 0 }),
      version: "test",
      protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
      startedAt: Date.now(),
      channelIds: [CHAN],
      owner: { discordId: OWNER_ID, display: "Leif" },
      mutedUsers: new Set(),
      env,
      recordAudit: (entry) => {
        rows.push(entry);
        return { seq: rows.length };
      },
    };
    const call = async (userId: string) => {
      const replies: SlashReplyPayload[] = [];
      await handleAdminCommand(ctx, {
        id: "ix",
        commandName: "admin",
        subcommandGroup: "people",
        subcommand: "forget",
        channelId: CHAN,
        userId,
        options: { person: "tofu" },
        reply: async (o) => {
          replies.push(o);
        },
      });
      return replies;
    };
    const notOwner = await call(TOFU);
    expect(notOwner[0]!.content).toBe(NOT_AUTHORIZED);
    expect(rows.map((r) => [r.action, r.actor, r.outcome])).toEqual([["admin-people-forget", TOFU, "denied"]]);
    // The owner, but no database wired: refused before any audit row or ask.
    const noDb = await call(OWNER_ID);
    expect(noDb[0]!.content).toContain("no database is wired");
    expect(noDb[0]!.content).toContain("Nothing was asked.");
    expect(rows).toHaveLength(1);
  });
});

describe("what an approved GitHub or /admin ask deletes (MEMORY-ACL-6.a)", () => {
  test("a GitHub ask covers the login and numeric id it came from; neither kind of asker is taken for a Discord id", () => {
    const dir = buildPeopleDirectory(parsePeopleToml(PEOPLE), { discordId: OWNER_ID });
    const gh = forgetTargets({ subjectKind: "person", subjectId: "tofu", requesterUserId: "github:4242:tofu-renamed" }, dir);
    expect([...gh.discordIds].sort()).toEqual([TOFU]);
    expect([...gh.scopes].sort()).toEqual(["person:tofu", TOFU].sort());
    expect([...gh.githubLogins].sort()).toEqual(["tofu-dev", "tofu-renamed"]);
    expect(gh.githubIds).toEqual(["4242"]);
    const admin = forgetTargets({ subjectKind: "person", subjectId: "kyn", requesterUserId: `admin:${OWNER_ID}` }, dir);
    expect(admin.discordIds).toEqual([KYN]);
    expect([...admin.scopes].sort()).toEqual(["person:kyn", KYN].sort());
    expect(admin.githubLogins).toEqual([]);
    // A Discord ask is unchanged: the asker's id is a target.
    const own = forgetTargets({ subjectKind: "person", subjectId: "kyn", requesterUserId: KYN }, dir);
    expect(own.discordIds).toEqual([KYN]);
  });
});
