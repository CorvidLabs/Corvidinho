/**
 * REQ-discord-042 — owner resolves to ADMIN at handler time (IDENTITY-1 /
 * ADMIN-4); empty owner leaves admin behavior unchanged (IDENTITY-3 owner
 * path). Fixture-only: no live Discord token, no network, temp project roots.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyConfig } from "../src/allowlist/types.ts";
import type { AgentClient, AgentRunChatOpts } from "../src/discord/agent-client.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import { startBridge } from "../src/discord/bridge.ts";
import { loadBridgeConfig } from "../src/discord/config.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import {
  PermissionLevel,
  resolvePermissionLevel,
} from "../src/discord/permissions.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import { handleSlashInteraction } from "../src/discord/slash-dispatch.ts";
import type {
  SlashContext,
  SlashInteraction,
  SlashReplyPayload,
} from "../src/discord/slash-types.ts";
import { NOT_AUTHORIZED } from "../src/discord/types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import type { OwnerRecord } from "../src/identity/index.ts";

const OWNER_ID = "200000000000000001";
const OTHER_ID = "200000000000000002";
const ADMIN_ID = "200000000000000003";

const OWNER: OwnerRecord = {
  discordId: OWNER_ID,
  githubLogin: "0xleif",
  display: "Leif",
};

const root = mkdtempSync(join(tmpdir(), "corvidinho-discord-owner-"));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function allowCfg(over: { users?: string[]; denyUsers?: string[] } = {}) {
  const cfg = emptyConfig();
  cfg.discord.channels = ["chan-allowed"];
  cfg.discord.users = over.users ?? [];
  cfg.discord.denyUsers = over.denyUsers ?? [];
  return cfg;
}

function memoryInteraction(
  over: Partial<SlashInteraction> & { commandName: string },
): SlashInteraction & { replies: SlashReplyPayload[] } {
  const replies: SlashReplyPayload[] = [];
  return {
    id: over.id ?? "ix_owner",
    commandName: over.commandName,
    subcommand: over.subcommand,
    channelId: over.channelId ?? "chan-allowed",
    userId: over.userId ?? OTHER_ID,
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
    store: over.store ?? new SessionStore({ defaultProjectRoot: root }),
    workStore: over.workStore ?? new WorkStore(),
    allowlist: over.allowlist ?? allowCfg(),
    agent: over.agent ?? createEchoAgentClient({ delayMs: 0 }),
    version: "0.0.0-test",
    protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
    startedAt: Date.now() - 60_000,
    channelIds: ["chan-allowed"],
    mutedUsers: over.mutedUsers ?? new Set(),
    adminUserIds: over.adminUserIds,
    adminRoleIds: over.adminRoleIds,
    owner: over.owner,
    env: {},
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
  };
}

describe("resolvePermissionLevel + owner (IDENTITY-1 / ADMIN-4)", () => {
  test("owner is ADMIN with empty admin lists", () => {
    expect(
      resolvePermissionLevel({ userId: OWNER_ID, allowlist: allowCfg(), owner: OWNER }),
    ).toBe(PermissionLevel.ADMIN);
  });

  test("owner is ADMIN even when the user allowlist does not name them", () => {
    expect(
      resolvePermissionLevel({
        userId: OWNER_ID,
        allowlist: allowCfg({ users: [OTHER_ID] }),
        owner: OWNER,
      }),
    ).toBe(PermissionLevel.ADMIN);
  });

  test("non-owner is not elevated by the owner record", () => {
    expect(
      resolvePermissionLevel({ userId: OTHER_ID, allowlist: allowCfg(), owner: OWNER }),
    ).toBe(PermissionLevel.STANDARD);
    expect(
      resolvePermissionLevel({
        userId: OTHER_ID,
        allowlist: allowCfg({ users: [ADMIN_ID] }),
        owner: OWNER,
      }),
    ).toBe(PermissionLevel.BLOCKED);
  });

  test("display name or GitHub login as a user id never matches", () => {
    for (const userId of ["Leif", "0xleif", "0xLeif"]) {
      expect(
        resolvePermissionLevel({ userId, allowlist: allowCfg(), owner: OWNER }),
      ).not.toBe(PermissionLevel.ADMIN);
    }
  });

  test("deny-listed owner is BLOCKED, not ADMIN", () => {
    expect(
      resolvePermissionLevel({
        userId: OWNER_ID,
        allowlist: allowCfg({ denyUsers: [OWNER_ID] }),
        owner: OWNER,
      }),
    ).toBe(PermissionLevel.BLOCKED);
  });

  test("muted owner is BLOCKED, not ADMIN", () => {
    expect(
      resolvePermissionLevel({
        userId: OWNER_ID,
        allowlist: allowCfg(),
        mutedUsers: new Set([OWNER_ID]),
        owner: OWNER,
      }),
    ).toBe(PermissionLevel.BLOCKED);
  });

  test("admin env lists keep working alongside an owner", () => {
    expect(
      resolvePermissionLevel({
        userId: ADMIN_ID,
        allowlist: allowCfg(),
        adminUserIds: [ADMIN_ID],
        owner: OWNER,
      }),
    ).toBe(PermissionLevel.ADMIN);
    expect(
      resolvePermissionLevel({
        userId: OTHER_ID,
        roleIds: ["ops"],
        allowlist: allowCfg(),
        adminRoleIds: ["ops"],
        owner: OWNER,
      }),
    ).toBe(PermissionLevel.ADMIN);
  });

  test("empty owner changes nothing (IDENTITY-3 owner path)", () => {
    for (const owner of [null, undefined]) {
      // Admin lists behave exactly as before.
      expect(
        resolvePermissionLevel({
          userId: ADMIN_ID,
          allowlist: allowCfg(),
          adminUserIds: [ADMIN_ID],
          owner,
        }),
      ).toBe(PermissionLevel.ADMIN);
      // Empty owner + empty admin lists ⇒ nobody ADMIN (default-deny).
      expect(
        resolvePermissionLevel({ userId: OWNER_ID, allowlist: allowCfg(), owner }),
      ).toBe(PermissionLevel.STANDARD);
      expect(
        resolvePermissionLevel({
          userId: OWNER_ID,
          allowlist: allowCfg({ users: [ADMIN_ID] }),
          owner,
        }),
      ).toBe(PermissionLevel.BLOCKED);
    }
  });
});

describe("slash dispatch re-checks the owner at handler time", () => {
  test("owner may /mute; non-owner refused", async () => {
    const muted = new Set<string>();
    const ctx = makeCtx({ owner: OWNER, mutedUsers: muted });

    const denied = memoryInteraction({
      commandName: "mute",
      userId: OTHER_ID,
      options: { user: "victim" },
    });
    const deniedResult = await handleSlashInteraction(ctx, denied);
    expect(deniedResult.ok).toBe(false);
    expect(denied.replies[0]?.content).toBe(NOT_AUTHORIZED);
    expect(muted.has("victim")).toBe(false);

    const allowed = memoryInteraction({
      commandName: "mute",
      userId: OWNER_ID,
      options: { user: "victim" },
    });
    const allowedResult = await handleSlashInteraction(ctx, allowed);
    expect(allowedResult.ok).toBe(true);
    expect(muted.has("victim")).toBe(true);
  });

  test("no owner: former owner id cannot /mute (no admin lists)", async () => {
    const ctx = makeCtx({ owner: null });
    const ix = memoryInteraction({
      commandName: "mute",
      userId: OWNER_ID,
      options: { user: "victim" },
    });
    const r = await handleSlashInteraction(ctx, ix);
    expect(r.ok).toBe(false);
    expect(ix.replies[0]?.content).toBe(NOT_AUTHORIZED);
  });

  test("/status is ephemeral and shows owner yes + display only", async () => {
    const ix = memoryInteraction({ commandName: "status", userId: OTHER_ID });
    await handleSlashInteraction(makeCtx({ owner: OWNER }), ix);
    const reply = ix.replies[0]!;
    expect(reply.ephemeral).toBe(true);
    expect(reply.content).toContain("Owner configured: yes (Leif)");
    expect(reply.content).not.toContain(OWNER_ID);
    expect(reply.content).not.toContain("0xleif");
  });

  test("/status shows owner no when unset", async () => {
    const ix = memoryInteraction({ commandName: "status" });
    await handleSlashInteraction(makeCtx({ owner: null }), ix);
    expect(ix.replies[0]?.content).toContain("Owner configured: no");
  });
});

describe("bridge config carries the owner (ALLOW-4)", () => {
  function allowFile(name: string, ownerBlock: string): string {
    const p = join(root, name);
    writeFileSync(p, `[discord]\nchannels = ["chan-1"]\n\n${ownerBlock}\n`);
    return p;
  }

  test("owner from allowlist file; env wins per field; admin lists unchanged", async () => {
    const path = allowFile(
      "bridge-owner.toml",
      `[owner]\ndiscord_id = "${OWNER_ID}"\ndisplay = "File Leif"\n`,
    );
    const r = await loadBridgeConfig({
      env: {
        DISCORD_TOKEN: "fake-token-for-test",
        CORVIDINHO_OWNER_DISPLAY: "Env Leif",
        CORVIDINHO_DISCORD_ADMIN_USERS: ADMIN_ID,
      },
      filePath: path,
      projectRoot: root,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.owner).toEqual({ discordId: OWNER_ID, display: "Env Leif" });
    expect(r.config.adminUserIds).toEqual([ADMIN_ID]);
  });

  test("no owner configured ⇒ config.owner null", async () => {
    const r = await loadBridgeConfig({
      env: { DISCORD_TOKEN: "fake-token-for-test", DISCORD_CHANNEL_IDS: "111" },
      filePath: null,
      projectRoot: root,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.owner).toBeNull();
  });

  test("bridge chat spawn marks the owner as admin (MEMORY-ACL actingIsAdmin)", async () => {
    const project = join(root, "bridge-project");
    mkdirSync(project, { recursive: true });
    const calls: AgentRunChatOpts[] = [];
    const agent: AgentClient = {
      async runChat(opts) {
        calls.push(opts);
        return { ok: true, sessionId: opts.sessionId, summary: "ok", exitCode: 0 };
      },
    };
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: "chan-1",
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: join(root, "bridge-missing.toml"),
        CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
      },
      projectRoot: project,
      skipProtocolCheck: true,
      disableScheduler: true,
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent,
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        handlers.reply = async () => ({ messageId: "bot_1" });
        return createNullGateway();
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !box.handlers) return;
    try {
      expect(result.config.owner?.discordId).toBe(OWNER_ID);
      await box.handlers.onMessage({
        id: "m-owner",
        channelId: "chan-1",
        authorId: OWNER_ID,
        authorBot: false,
        content: "@bot hi",
        mentionedBot: true,
      });
      await box.handlers.onMessage({
        id: "m-other",
        channelId: "chan-1",
        authorId: OTHER_ID,
        authorBot: false,
        content: "@bot hi",
        mentionedBot: true,
      });
      expect(calls.map((c) => [c.actingUserId, c.actingIsAdmin])).toEqual([
        [OWNER_ID, true],
        [OTHER_ID, false],
      ]);
    } finally {
      await result.stop();
    }
  });
});
