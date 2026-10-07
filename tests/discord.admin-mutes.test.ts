/**
 * ADMIN-3.c (part 2) — "As owner I can change deny lists, mutes and the
 * GitHub repo allow lists with /admin; every change is audited." This file
 * covers mutes (part 1, tests/discord.admin-lists.test.ts, covers the deny
 * lists and the GitHub repo allow lists):
 *
 * - `/admin mutes add|remove user:@x` mutes / unmutes in the live in-memory
 *   mute set the chat, slash and ask gates read; `/mute` and `/unmute`
 *   (REQ-discord-009) are aliases served by the same helper, with the same
 *   SAFE-5 rows `admin-mutes-add|remove` (started → ok; refusals denied).
 * - It refuses to mute the owner or the caller, and fails closed (nothing
 *   changes) when the audit trail is missing or throws.
 * - Mutes stay in memory until a restart; the reply says so and points to
 *   `/admin deny add user:` for a lasting block.
 *
 * Fixture tests only: in-memory SQLite, fake gateway, echo agent, no Discord
 * token or network.
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyConfig } from "../src/allowlist/types.ts";
import { appendAudit, argsDigest } from "../src/audit/index.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import {
  formatConfigShow,
  handleAdminCommand,
} from "../src/discord/command-handlers/admin.ts";
import {
  handleMuteCommand,
  handleUnmuteCommand,
  MUTE_SELF_OR_OWNER_REFUSED,
} from "../src/discord/command-handlers/mute.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import {
  buildSlashCommandBodies,
  OPT_SUB_COMMAND,
  OPT_USER,
} from "../src/discord/slash-commands.ts";
import { handleSlashInteraction } from "../src/discord/slash-dispatch.ts";
import type { SlashContext, SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import { MUTED, NOT_AUTHORIZED, type InboundMessage } from "../src/discord/types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const OWNER_ID = "100000000000000001";
const MEMBER = "200000000000000002";
const PEER = "300000000000000003";
const CHAN = "400000000000000004";
const OTHER = "500000000000000005";

const tmpDirs: string[] = [];
function tmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Fixture = { ctx: SlashContext; db: Database; muted: Set<string> };

function fixture(opts: {
  recordAudit?: SlashContext["recordAudit"] | null;
  muted?: string[];
  owner?: SlashContext["owner"];
  env?: NodeJS.ProcessEnv;
} = {}): Fixture {
  const db = openCorvidinhoDb({ memory: true });
  const allowlist = emptyConfig();
  allowlist.discord.channels = [CHAN];
  const muted = new Set<string>(opts.muted ?? []);
  const ctx: SlashContext = {
    store: new SessionStore(),
    workStore: new WorkStore(),
    allowlist,
    agent: createEchoAgentClient({ delayMs: 0 }),
    version: "0.0.9",
    protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
    startedAt: Date.now(),
    channelIds: allowlist.discord.channels,
    owner: opts.owner === undefined ? { discordId: OWNER_ID, display: "Leif" } : opts.owner,
    mutedUsers: muted,
    // A missing allowlist file: never the operator's (ALLOW-4).
    env: { CORVIDINHO_ALLOWLIST_FILE: join(tmp("corvidinho-admin-mutes-"), "none.toml"), ...(opts.env ?? {}) },
    ...(opts.recordAudit === null
      ? {}
      : { recordAudit: opts.recordAudit ?? ((entry) => appendAudit(db, entry)) }),
  };
  return { ctx, db, muted };
}

let seq = 0;
function slash(
  commandName: string,
  userId: string,
  options: SlashInteraction["options"] = {},
  route: { group?: string; sub?: string } = {},
): SlashInteraction & { replies: SlashReplyPayload[] } {
  const replies: SlashReplyPayload[] = [];
  seq += 1;
  return {
    id: `ix_mutes_${seq}`,
    commandName,
    subcommandGroup: route.group,
    subcommand: route.sub,
    channelId: CHAN,
    userId,
    options,
    replies,
    reply: async (p) => {
      replies.push(p);
    },
  };
}

/** `/admin mutes <sub> user:<target>` from `userId`. */
function adminMutes(sub: "add" | "remove", userId: string, target: string) {
  return slash("admin", userId, { user: target }, { group: "mutes", sub });
}

type Row = { action: string; actor: string; surface: string; outcome: string; args_digest: string };
function rows(db: Database): Row[] {
  return db
    .query("SELECT action, actor, surface, outcome, args_digest FROM audit_log ORDER BY seq")
    .all() as Row[];
}
function brief(db: Database): Array<[string, string, string]> {
  return rows(db).map((r) => [r.action, r.actor, r.outcome]);
}

function throwingAudit(): NonNullable<SlashContext["recordAudit"]> {
  return () => {
    throw new Error("database is locked");
  };
}

describe("/admin mutes command body (ADMIN-3.c part 2)", () => {
  test("/admin mutes add|remove each take a required user; /mute and /unmute stay (REQ-discord-009)", () => {
    const bodies = buildSlashCommandBodies();
    const mutes = bodies.find((b) => b.name === "admin")?.options?.find((g) => g.name === "mutes");
    expect(mutes?.options?.map((o) => [o.type, o.name])).toEqual([
      [OPT_SUB_COMMAND, "add"],
      [OPT_SUB_COMMAND, "remove"],
    ]);
    for (const sub of mutes?.options ?? []) {
      expect(sub.options?.map((o) => [o.type, o.name, o.required])).toEqual([[OPT_USER, "user", true]]);
      expect(sub.description.length).toBeLessThanOrEqual(100);
    }
    expect(mutes!.description.length).toBeLessThanOrEqual(100);
    const names = bodies.map((b) => b.name);
    expect(names).toContain("mute");
    expect(names).toContain("unmute");
    for (const n of ["mute", "unmute"]) {
      expect(bodies.find((b) => b.name === n)!.description.length).toBeLessThanOrEqual(100);
    }
  });
});

describe("/admin mutes add|remove (ADMIN-3.c part 2)", () => {
  test("owner mutes then unmutes: live gate, SAFE-5 started → ok, reply says until restart and points to /admin deny add user:", async () => {
    const f = fixture();

    const add = adminMutes("add", OWNER_ID, MEMBER);
    expect((await handleSlashInteraction(f.ctx, add)).ok).toBe(true);
    expect(f.muted.has(MEMBER)).toBe(true);
    const reply = add.replies[0]!;
    expect(reply.ephemeral).toBe(true);
    expect(reply.content).toContain(`/admin mutes add: muted <@${MEMBER}>`);
    expect(reply.content).toContain("until the bridge restarts");
    expect(reply.content).toContain("/admin deny add user:");
    expect(reply.content).toMatch(/Audit: #1 started · #2 ok\./);
    expect(rows(f.db).map((r) => [r.action, r.actor, r.surface, r.outcome])).toEqual([
      ["admin-mutes-add", OWNER_ID, "discord:admin", "started"],
      ["admin-mutes-add", OWNER_ID, "discord:admin", "ok"],
    ]);

    // The live set is the one the gates read: the muted member is refused.
    const status = slash("status", MEMBER);
    await handleSlashInteraction(f.ctx, status);
    expect(status.replies[0]).toMatchObject({ content: MUTED, ephemeral: true });

    const remove = adminMutes("remove", OWNER_ID, MEMBER);
    expect((await handleSlashInteraction(f.ctx, remove)).ok).toBe(true);
    expect(f.muted.has(MEMBER)).toBe(false);
    expect(remove.replies[0]?.content).toContain(`/admin mutes remove: unmuted <@${MEMBER}>`);
    expect(remove.replies[0]?.ephemeral).toBe(true);
    expect(brief(f.db).slice(2)).toEqual([
      ["admin-mutes-remove", OWNER_ID, "started"],
      ["admin-mutes-remove", OWNER_ID, "ok"],
    ]);

    const again = slash("status", MEMBER);
    await handleSlashInteraction(f.ctx, again);
    expect(again.replies[0]?.content).not.toBe(MUTED);
  });

  test("/mute and /unmute are aliases: same helper, same SAFE-5 actions and args digest as /admin mutes", async () => {
    const viaAdmin = fixture();
    await handleSlashInteraction(viaAdmin.ctx, adminMutes("add", OWNER_ID, MEMBER));
    await handleSlashInteraction(viaAdmin.ctx, adminMutes("remove", OWNER_ID, MEMBER));

    const viaAlias = fixture();
    const mute = slash("mute", OWNER_ID, { user: MEMBER });
    expect((await handleSlashInteraction(viaAlias.ctx, mute)).ok).toBe(true);
    expect(viaAlias.muted.has(MEMBER)).toBe(true);
    expect(mute.replies[0]?.content).toContain(`/mute: muted <@${MEMBER}>`);
    expect(mute.replies[0]?.content).toContain("until the bridge restarts");
    expect(mute.replies[0]?.content).toContain("/admin deny add user:");
    const unmute = slash("unmute", OWNER_ID, { user: MEMBER });
    expect((await handleSlashInteraction(viaAlias.ctx, unmute)).ok).toBe(true);
    expect(viaAlias.muted.has(MEMBER)).toBe(false);
    expect(unmute.replies[0]?.content).toContain(`/unmute: unmuted <@${MEMBER}>`);

    const strip = (r: Row) => [r.action, r.actor, r.surface, r.outcome, r.args_digest];
    expect(rows(viaAlias.db).map(strip)).toEqual(rows(viaAdmin.db).map(strip));
    expect(rows(viaAlias.db).map((r) => r.action)).toEqual([
      "admin-mutes-add",
      "admin-mutes-add",
      "admin-mutes-remove",
      "admin-mutes-remove",
    ]);
    expect(rows(viaAlias.db)[0]!.args_digest).toBe(argsDigest(["mutes", "add", MEMBER]));
  });

  test("refuses to mute the owner or the caller: denied row, set unchanged (both spellings)", async () => {
    const f = fixture();
    const viaAdmin = adminMutes("add", OWNER_ID, OWNER_ID);
    await handleSlashInteraction(f.ctx, viaAdmin);
    expect(viaAdmin.replies[0]).toEqual({ content: MUTE_SELF_OR_OWNER_REFUSED, ephemeral: true });
    const viaAlias = slash("mute", OWNER_ID, { user: ` ${OWNER_ID} ` });
    await handleSlashInteraction(f.ctx, viaAlias);
    expect(viaAlias.replies[0]).toEqual({ content: MUTE_SELF_OR_OWNER_REFUSED, ephemeral: true });
    expect(f.muted.size).toBe(0);
    expect(brief(f.db)).toEqual([
      ["admin-mutes-add", OWNER_ID, "denied"],
      ["admin-mutes-add", OWNER_ID, "denied"],
    ]);

    // The caller, owner or not: the helper never mutes whoever asks.
    const noOwner = fixture({ owner: null });
    const self = slash("mute", PEER, { user: PEER });
    await handleMuteCommand(noOwner.ctx, self);
    expect(self.replies[0]).toEqual({ content: MUTE_SELF_OR_OWNER_REFUSED, ephemeral: true });
    expect(noOwner.muted.size).toBe(0);
    expect(brief(noOwner.db)).toEqual([["admin-mutes-add", PEER, "denied"]]);
  });

  test("fails closed when the audit trail throws: refused, nothing changes (add, remove and the aliases)", async () => {
    const f = fixture({ recordAudit: throwingAudit(), muted: [PEER] });
    for (const ix of [
      adminMutes("add", OWNER_ID, MEMBER),
      slash("mute", OWNER_ID, { user: MEMBER }),
      adminMutes("remove", OWNER_ID, PEER),
      slash("unmute", OWNER_ID, { user: PEER }),
    ]) {
      await handleSlashInteraction(f.ctx, ix);
      expect(ix.replies[0]?.ephemeral).toBe(true);
      expect(ix.replies[0]?.content).toContain("audit log unavailable (SAFE-5): database is locked. Nothing changed.");
    }
    expect([...f.muted]).toEqual([PEER]);
  });

  test("fails closed with no audit trail wired: refused, nothing changes", async () => {
    const f = fixture({ recordAudit: null, muted: [PEER] });
    for (const ix of [
      adminMutes("add", OWNER_ID, MEMBER),
      slash("mute", OWNER_ID, { user: MEMBER }),
      adminMutes("remove", OWNER_ID, PEER),
      slash("unmute", OWNER_ID, { user: PEER }),
    ]) {
      await handleSlashInteraction(f.ctx, ix);
      expect(ix.replies[0]?.content).toContain("audit log unavailable (SAFE-5): no audit database is wired to this bridge");
    }
    expect([...f.muted]).toEqual([PEER]);
  });

  test("non-owner refused at dispatch and at the /admin handler re-check (denied row); set unchanged", async () => {
    const f = fixture();
    const viaDispatch = adminMutes("add", MEMBER, PEER);
    const r = await handleSlashInteraction(f.ctx, viaDispatch);
    expect(r.ok).toBe(false);
    expect(viaDispatch.replies[0]).toEqual({ content: NOT_AUTHORIZED, ephemeral: true });
    const alias = slash("mute", MEMBER, { user: PEER });
    expect((await handleSlashInteraction(f.ctx, alias)).ok).toBe(false);

    const viaHandler = adminMutes("remove", MEMBER, PEER);
    await handleAdminCommand(f.ctx, viaHandler);
    expect(viaHandler.replies[0]).toEqual({ content: NOT_AUTHORIZED, ephemeral: true });
    expect(f.muted.size).toBe(0);
    expect(brief(f.db)).toEqual([["admin-mutes-remove", MEMBER, "denied"]]);
  });

  test("the /mute and /unmute aliases re-check ADMIN at handler time like /admin mutes: not authorized, denied row, no mute state told", async () => {
    // Past the dispatcher floor (a handler reached directly): the helper
    // itself refuses a caller who is not ADMIN, before the no-op check.
    const f = fixture({ muted: [PEER] });
    const mute = slash("mute", MEMBER, { user: OTHER });
    await handleMuteCommand(f.ctx, mute);
    expect(mute.replies[0]).toEqual({ content: NOT_AUTHORIZED, ephemeral: true });
    const dup = slash("mute", MEMBER, { user: PEER });
    await handleMuteCommand(f.ctx, dup);
    expect(dup.replies[0]).toEqual({ content: NOT_AUTHORIZED, ephemeral: true });
    const unmute = slash("unmute", MEMBER, { user: PEER });
    await handleUnmuteCommand(f.ctx, unmute);
    expect(unmute.replies[0]).toEqual({ content: NOT_AUTHORIZED, ephemeral: true });
    // No owner configured: nobody is ADMIN (IDENTITY-3), the helper included.
    const noOwner = fixture({ owner: null });
    const orphan = slash("mute", PEER, { user: MEMBER });
    await handleMuteCommand(noOwner.ctx, orphan);
    expect(orphan.replies[0]).toEqual({ content: NOT_AUTHORIZED, ephemeral: true });
    expect(noOwner.muted.size).toBe(0);

    expect([...f.muted]).toEqual([PEER]);
    expect(brief(f.db)).toEqual([
      ["admin-mutes-add", MEMBER, "denied"],
      ["admin-mutes-add", MEMBER, "denied"],
      ["admin-mutes-remove", MEMBER, "denied"],
    ]);
    // The same digest as the /admin handler re-check's denied row.
    const viaAdmin = fixture();
    await handleAdminCommand(viaAdmin.ctx, adminMutes("add", MEMBER, PEER));
    expect(rows(f.db)[0]!.args_digest).toBe(rows(viaAdmin.db)[0]!.args_digest);
    expect(rows(f.db)[0]!.args_digest).toBe(argsDigest(["mutes", "add"]));
    expect(brief(noOwner.db)).toEqual([["admin-mutes-add", PEER, "denied"]]);
  });

  test("no change writes no row: a mute already in place, an unmute of someone not muted, no user given", async () => {
    const f = fixture({ muted: [MEMBER] });
    const dup = adminMutes("add", OWNER_ID, MEMBER);
    await handleSlashInteraction(f.ctx, dup);
    expect(dup.replies[0]).toEqual({ content: `No change: <@${MEMBER}> is already muted.`, ephemeral: true });
    const none = slash("unmute", OWNER_ID, { user: PEER });
    await handleSlashInteraction(f.ctx, none);
    expect(none.replies[0]).toEqual({ content: `No change: <@${PEER}> is not muted.`, ephemeral: true });
    const usage = slash("admin", OWNER_ID, {}, { group: "mutes", sub: "add" });
    await handleSlashInteraction(f.ctx, usage);
    expect(usage.replies[0]).toEqual({ content: "usage: /admin mutes add user:@someone", ephemeral: true });
    expect([...f.muted]).toEqual([MEMBER]);
    expect(rows(f.db)).toEqual([]);
  });

  test("unmuting a DISCORD_MUTED_USER_IDS seed says a restart mutes them again", async () => {
    const f = fixture({ muted: [MEMBER], env: { DISCORD_MUTED_USER_IDS: `${PEER}, ${MEMBER}` } });
    const ix = adminMutes("remove", OWNER_ID, MEMBER);
    await handleSlashInteraction(f.ctx, ix);
    expect(f.muted.has(MEMBER)).toBe(false);
    expect(ix.replies[0]?.content).toContain("DISCORD_MUTED_USER_IDS, so the next restart mutes them again");
    // The tool layer reads that env, so their runs keep community tools until it changes.
    expect(ix.replies[0]?.content).toContain("the tool layer (which reads that env) still gives their runs community tools");
  });

  test("/admin config show counts mutes and names /admin mutes add|remove as updatable (in memory until restart)", async () => {
    const f = fixture({ muted: [MEMBER] });
    const show = formatConfigShow(f.ctx);
    expect(show).toContain("Muted users: 1 (in memory until restart; lasting block: /admin deny add user:)");
    expect(show).toContain("mutes (/admin mutes add|remove, alias /mute /unmute) — live, in memory until restart");
    expect(show.length).toBeLessThanOrEqual(2000);
  });
});

describe("bridge: /admin mutes is live and audited (ADMIN-3.c part 2)", () => {
  test("an owner's /admin mutes add refuses the member's next @mention; remove serves it again; rows in the bridge DB", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    const publicReplies: string[] = [];
    const outbound = memoryThinkingOutbound();
    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: CHAN,
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: join(tmp("corvidinho-admin-mutes-bridge-"), "none.toml"),
        CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
      },
      db,
      projectRoot: tmp("corvidinho-admin-mutes-proj-"),
      skipProtocolCheck: true,
      disableScheduler: true,
      thinkingOutbound: outbound,
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent: createEchoAgentClient(),
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        handlers.reply = async ({ content }) => {
          publicReplies.push(content);
          return { messageId: `bot_${publicReplies.length}` };
        };
        return createNullGateway();
      },
    });
    if (!result.ok) throw new Error(`bridge failed to start: ${result.message}`);
    const handlers = box.handlers!;
    const mention = (): InboundMessage => {
      seq += 1;
      return {
        id: `m_${seq}`,
        channelId: CHAN,
        authorId: MEMBER,
        authorBot: false,
        content: "<@bot> hello",
        mentionedBot: true,
      };
    };
    try {
      const add = adminMutes("add", OWNER_ID, MEMBER);
      await handlers.onSlash!(add);
      expect(add.replies[0]?.content).toContain("until the bridge restarts");
      expect(result.mutedUsers.has(MEMBER)).toBe(true);
      await handlers.onMessage(mention());
      expect(publicReplies).toEqual([MUTED]);
      expect(outbound.sends.length).toBe(0);

      const remove = adminMutes("remove", OWNER_ID, MEMBER);
      await handlers.onSlash!(remove);
      expect(result.mutedUsers.has(MEMBER)).toBe(false);
      await handlers.onMessage(mention());
      expect(outbound.sends.length).toBe(1);

      expect(brief(db).filter(([a]) => a.startsWith("admin-mutes-"))).toEqual([
        ["admin-mutes-add", OWNER_ID, "started"],
        ["admin-mutes-add", OWNER_ID, "ok"],
        ["admin-mutes-remove", OWNER_ID, "started"],
        ["admin-mutes-remove", OWNER_ID, "ok"],
      ]);
    } finally {
      await result.stop();
    }
  });
});
