/**
 * DISCORD-ANNOUNCE slash + persist + postAnnouncement fixtures (no live token).
 */
import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import {
  formatAnnounceChannelLine,
  formatBridgeLiveAnnouncement,
  postAnnouncement,
} from "../src/discord/announce.ts";
import { AnnounceStore } from "../src/discord/announce-store.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import {
  OPT_BOOLEAN,
  OPT_CHANNEL,
  buildSlashCommandBodies,
  SLASH_COMMAND_NAMES,
} from "../src/discord/slash-commands.ts";
import { handleSlashInteraction } from "../src/discord/slash-dispatch.ts";
import type {
  SlashContext,
  SlashInteraction,
  SlashReplyPayload,
} from "../src/discord/slash-types.ts";
import { NOT_AUTHORIZED } from "../src/discord/types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { migrateCorvidinhoDb } from "../src/store/db.ts";

function allowCfg(channels: string[] = ["chan-allowed"]) {
  const cfg = emptyConfig();
  cfg.discord.channels = channels.map((c) => c.toLowerCase());
  return cfg;
}

function memoryDb(): Database {
  const db = new Database(":memory:");
  migrateCorvidinhoDb(db);
  return db;
}

function memoryInteraction(
  over: Partial<SlashInteraction> & { commandName: string },
): SlashInteraction & { replies: SlashReplyPayload[] } {
  const replies: SlashReplyPayload[] = [];
  return {
    id: over.id ?? "ix_1",
    commandName: over.commandName,
    subcommand: over.subcommand,
    channelId: over.channelId ?? "chan-allowed",
    guildId: over.guildId,
    userId: over.userId ?? "user-1",
    options: over.options ?? {},
    roleIds: over.roleIds,
    replies,
    reply: async (opts) => {
      replies.push(opts);
    },
  };
}

function makeCtx(over: Partial<SlashContext> = {}): SlashContext {
  const db = over.announceStore ? undefined : memoryDb();
  return {
    store: over.store ?? new SessionStore(),
    workStore: over.workStore ?? new WorkStore(),
    announceStore: over.announceStore ?? new AnnounceStore(db!),
    allowlist: over.allowlist ?? allowCfg(),
    agent: over.agent ?? createEchoAgentClient({ delayMs: 0 }),
    version: over.version ?? "0.0.8",
    protocolVersion: over.protocolVersion ?? CORVIDINHO_PROTOCOL_VERSION,
    startedAt: over.startedAt ?? Date.now() - 90_000,
    channelIds: over.channelIds ?? ["chan-allowed"],
    adminUserIds: over.adminUserIds,
    adminRoleIds: over.adminRoleIds,
    owner: over.owner,
    mutedUsers: over.mutedUsers,
  };
}

describe("/announce bodies", () => {
  test("includes announce with channel|show and CHANNEL picker", () => {
    expect(SLASH_COMMAND_NAMES).toContain("announce");
    expect(SLASH_COMMAND_NAMES.length).toBe(9);
    const announce = buildSlashCommandBodies().find((b) => b.name === "announce");
    expect(announce?.options?.map((o) => o.name).sort()).toEqual([
      "channel",
      "show",
    ]);
    const channel = announce?.options?.find((o) => o.name === "channel");
    const opts = channel?.options ?? [];
    expect(opts.map((o) => o.name).sort()).toEqual(["channel", "clear"]);
    const chOpt = opts.find((o) => o.name === "channel");
    expect(chOpt?.type).toBe(OPT_CHANNEL);
    expect(chOpt?.channel_types).toEqual([0]);
    expect(opts.find((o) => o.name === "clear")?.type).toBe(OPT_BOOLEAN);
  });
});

describe("AnnounceStore persist", () => {
  test("set / get / clear survives reopen on same db file semantics", () => {
    const db = memoryDb();
    const a = new AnnounceStore(db);
    expect(a.getChannelId()).toBeNull();
    a.setChannelId("999888777666555444");
    expect(a.getChannelId()).toBe("999888777666555444");
    const b = new AnnounceStore(db);
    expect(b.getChannelId()).toBe("999888777666555444");
    b.clearChannelId();
    expect(a.getChannelId()).toBeNull();
  });
});

describe("postAnnouncement", () => {
  test("default-deny when not configured", async () => {
    const store = new AnnounceStore(memoryDb());
    const sends: Array<{ channelId: string; content: string }> = [];
    const r = await postAnnouncement(
      store,
      async (opts) => {
        sends.push(opts);
        return { messageId: "m1" };
      },
      formatBridgeLiveAnnouncement("0.0.8"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_configured");
    expect(sends).toHaveLength(0);
  });

  test("posts only to configured announce channel", async () => {
    const store = new AnnounceStore(memoryDb());
    store.setChannelId("announce-chan");
    const sends: Array<{ channelId: string; content: string }> = [];
    const r = await postAnnouncement(
      store,
      async (opts) => {
        sends.push(opts);
        return { messageId: "m2" };
      },
      formatBridgeLiveAnnouncement("0.0.8"),
    );
    expect(r.ok).toBe(true);
    expect(sends).toEqual([
      { channelId: "announce-chan", content: "bridge live **v0.0.8**" },
    ]);
  });
});

describe("/announce dispatch", () => {
  test("show when empty", async () => {
    const ctx = makeCtx();
    const ix = memoryInteraction({
      commandName: "announce",
      subcommand: "show",
    });
    const r = await handleSlashInteraction(ctx, ix);
    expect(r.ok).toBe(true);
    expect(ix.replies[0]?.content).toContain("not configured");
    expect(ix.replies[0]?.ephemeral).toBe(true);
  });

  test("channel requires admin; empty admin = deny-all", async () => {
    const ctx = makeCtx({ owner: null });
    const ix = memoryInteraction({
      commandName: "announce",
      subcommand: "channel",
      options: { channel: "111222333444555666" },
    });
    const r = await handleSlashInteraction(ctx, ix);
    expect(r.ok).toBe(true);
    expect(ix.replies[0]?.content).toBe(NOT_AUTHORIZED);
    expect(ctx.announceStore!.getChannelId()).toBeNull();
  });

  test("admin sets channel via picker snowflake value", async () => {
    const ctx = makeCtx({ owner: { discordId: "admin-1" } });
    const ix = memoryInteraction({
      commandName: "announce",
      subcommand: "channel",
      userId: "admin-1",
      options: { channel: "111222333444555666" },
    });
    const r = await handleSlashInteraction(ctx, ix);
    expect(r.ok).toBe(true);
    expect(ix.replies[0]?.content).toContain("<#111222333444555666>");
    expect(ctx.announceStore!.getChannelId()).toBe("111222333444555666");

    const show = memoryInteraction({
      commandName: "announce",
      subcommand: "show",
    });
    await handleSlashInteraction(ctx, show);
    expect(show.replies[0]?.content).toBe(
      formatAnnounceChannelLine("111222333444555666"),
    );
  });

  test("admin clear", async () => {
    const store = new AnnounceStore(memoryDb());
    store.setChannelId("111");
    const ctx = makeCtx({ owner: { discordId: "admin-1" }, announceStore: store });
    const ix = memoryInteraction({
      commandName: "announce",
      subcommand: "channel",
      userId: "admin-1",
      options: { clear: true },
    });
    await handleSlashInteraction(ctx, ix);
    expect(store.getChannelId()).toBeNull();
    expect(ix.replies[0]?.content).toContain("cleared");
  });

  test("/status surfaces announce line", async () => {
    const store = new AnnounceStore(memoryDb());
    store.setChannelId("announce-chan");
    const ctx = makeCtx({ announceStore: store });
    const ix = memoryInteraction({ commandName: "status" });
    await handleSlashInteraction(ctx, ix);
    expect(ix.replies[0]?.content).toContain("<#announce-chan>");
  });
});
