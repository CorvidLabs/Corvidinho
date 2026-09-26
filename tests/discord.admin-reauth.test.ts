/**
 * DISCORD-7 — admin re-auth at slash run time (fixture; no live token).
 */
import { describe, expect, test } from "bun:test";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import {
  PermissionLevel,
  resolvePermissionLevel,
} from "../src/discord/permissions.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import {
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

function allowCfg(over: {
  channels?: string[];
  users?: string[];
  roles?: string[];
  denyUsers?: string[];
} = {}) {
  const cfg = emptyConfig();
  cfg.discord.channels = (over.channels ?? ["chan-allowed"]).map((c) =>
    c.toLowerCase(),
  );
  cfg.discord.users = (over.users ?? []).map((u) => u.toLowerCase());
  cfg.discord.roles = (over.roles ?? []).map((r) => r.toLowerCase());
  cfg.discord.denyUsers = (over.denyUsers ?? []).map((u) => u.toLowerCase());
  return cfg;
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
    roleIds: over.roleIds,
    options: over.options ?? {},
    replies,
    reply: async (opts) => {
      replies.push(opts);
    },
  };
}

function makeCtx(over: Partial<SlashContext> = {}): SlashContext {
  return {
    store: over.store ?? new SessionStore(),
    workStore: over.workStore ?? new WorkStore(),
    allowlist: over.allowlist ?? allowCfg(),
    agent: over.agent ?? createEchoAgentClient({ delayMs: 0 }),
    version: over.version ?? "0.0.1",
    protocolVersion: over.protocolVersion ?? CORVIDINHO_PROTOCOL_VERSION,
    startedAt: over.startedAt ?? Date.now() - 90_000,
    channelIds: over.channelIds ?? ["chan-allowed"],
    mutedUsers: over.mutedUsers ?? new Set(),
    adminUserIds: over.adminUserIds,
    adminRoleIds: over.adminRoleIds,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
  };
}

describe("resolvePermissionLevel (DISCORD-7)", () => {
  test("empty admin lists ⇒ never ADMIN", () => {
    const cfg = allowCfg();
    expect(
      resolvePermissionLevel({ userId: "anyone", allowlist: cfg }),
    ).toBe(PermissionLevel.STANDARD);
    expect(
      resolvePermissionLevel({ userId: "anyone", allowlist: cfg }),
    ).not.toBe(PermissionLevel.ADMIN);
  });

  test("admin user → ADMIN; admin role → ADMIN", () => {
    const cfg = allowCfg();
    expect(
      resolvePermissionLevel({
        userId: "boss",
        allowlist: cfg,
        adminUserIds: ["boss"],
      }),
    ).toBe(PermissionLevel.ADMIN);
    expect(
      resolvePermissionLevel({
        userId: "peon",
        roleIds: ["role-admin"],
        allowlist: cfg,
        adminRoleIds: ["role-admin"],
      }),
    ).toBe(PermissionLevel.ADMIN);
  });

  test("muted or deny user → BLOCKED", () => {
    const cfg = allowCfg({ denyUsers: ["bad"] });
    expect(
      resolvePermissionLevel({
        userId: "boss",
        mutedUsers: new Set(["boss"]),
        allowlist: cfg,
        adminUserIds: ["boss"],
      }),
    ).toBe(PermissionLevel.BLOCKED);
    expect(
      resolvePermissionLevel({ userId: "bad", allowlist: cfg }),
    ).toBe(PermissionLevel.BLOCKED);
  });

  test("listed user (non-admin) → STANDARD", () => {
    const cfg = allowCfg({ users: ["alice"] });
    expect(
      resolvePermissionLevel({
        userId: "alice",
        allowlist: cfg,
        adminUserIds: ["boss"],
      }),
    ).toBe(PermissionLevel.STANDARD);
  });
});

describe("slash bodies include mute/unmute", () => {
  test("command names include mute unmute", () => {
    const names = buildSlashCommandBodies().map((b) => b.name).sort();
    expect(names).toEqual([...SLASH_COMMAND_NAMES].sort());
    expect(names).toContain("mute");
    expect(names).toContain("unmute");
  });
});

describe("admin re-auth at run time (DISCORD-7)", () => {
  test("non-admin /mute refused; mute set unchanged", async () => {
    const muted = new Set<string>();
    const ctx = makeCtx({
      allowlist: allowCfg(),
      mutedUsers: muted,
      adminUserIds: ["boss"],
    });
    const ix = memoryInteraction({
      commandName: "mute",
      userId: "peon",
      options: { user: "victim" },
    });
    const result = await handleSlashInteraction(ctx, ix);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("insufficient_permission");
    expect(ix.replies[0]?.content).toBe(NOT_AUTHORIZED);
    expect(muted.has("victim")).toBe(false);
  });

  test("admin /mute mutates set; /unmute clears", async () => {
    const muted = new Set<string>();
    const ctx = makeCtx({
      allowlist: allowCfg(),
      mutedUsers: muted,
      adminUserIds: ["boss"],
    });
    const muteIx = memoryInteraction({
      commandName: "mute",
      userId: "boss",
      options: { user: "victim" },
    });
    const muteResult = await handleSlashInteraction(ctx, muteIx);
    expect(muteResult.ok).toBe(true);
    expect(muted.has("victim")).toBe(true);

    const unmuteIx = memoryInteraction({
      commandName: "unmute",
      userId: "boss",
      options: { user: "victim" },
    });
    const unmuteResult = await handleSlashInteraction(ctx, unmuteIx);
    expect(unmuteResult.ok).toBe(true);
    expect(muted.has("victim")).toBe(false);
  });

  test("admin role grants mute", async () => {
    const muted = new Set<string>();
    const ctx = makeCtx({
      allowlist: allowCfg(),
      mutedUsers: muted,
      adminRoleIds: ["ops"],
    });
    const ix = memoryInteraction({
      commandName: "mute",
      userId: "role-holder",
      roleIds: ["ops"],
      options: { user: "victim" },
    });
    const result = await handleSlashInteraction(ctx, ix);
    expect(result.ok).toBe(true);
    expect(muted.has("victim")).toBe(true);
  });

  test("channel deny still wins before permission re-check", async () => {
    const muted = new Set<string>();
    const ctx = makeCtx({
      allowlist: allowCfg(),
      mutedUsers: muted,
      adminUserIds: ["boss"],
    });
    const ix = memoryInteraction({
      commandName: "mute",
      userId: "boss",
      channelId: "chan-other",
      options: { user: "victim" },
    });
    const result = await handleSlashInteraction(ctx, ix);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("channel_not_allowlisted");
    expect(muted.size).toBe(0);
  });

  test("empty admin lists ⇒ /mute refused for everyone", async () => {
    const muted = new Set<string>();
    const ctx = makeCtx({
      allowlist: allowCfg(), // no adminUsers
      mutedUsers: muted,
    });
    const ix = memoryInteraction({
      commandName: "mute",
      userId: "anyone",
      options: { user: "victim" },
    });
    const result = await handleSlashInteraction(ctx, ix);
    expect(result.ok).toBe(false);
    expect(muted.size).toBe(0);
  });

  test("non-admin still can /status (no minPermission)", async () => {
    const ctx = makeCtx({
      allowlist: allowCfg(),
      adminUserIds: ["boss"],
    });
    const ix = memoryInteraction({
      commandName: "status",
      userId: "peon",
    });
    const result = await handleSlashInteraction(ctx, ix);
    expect(result.ok).toBe(true);
  });
});
