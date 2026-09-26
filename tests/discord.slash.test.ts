import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
/**
 * DISCORD-4 slash commands — fixture tests (no live Discord token).
 */
import { describe, expect, test } from "bun:test";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import {
  formatStatusReport,
  formatUptime,
} from "../src/discord/command-handlers/status.ts";
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
import {
  ALLOWLIST_DENY_TIP,
  EPHEMERAL_SILENT_ACK,
  NOT_AUTHORIZED,
} from "../src/discord/types.ts";
import { WorkStore } from "../src/discord/work-store.ts";

function allowCfg(channels: string[] = ["chan-allowed"]) {
  const cfg = emptyConfig();
  cfg.discord.channels = channels.map((c) => c.toLowerCase());
  return cfg;
}

function memoryInteraction(
  over: Partial<SlashInteraction> & {
    commandName: string;
    channelId?: string;
  },
): SlashInteraction & { replies: SlashReplyPayload[]; edits: SlashReplyPayload[] } {
  const replies: SlashReplyPayload[] = [];
  const edits: SlashReplyPayload[] = [];
  let deferred = false;
  return {
    id: over.id ?? "ix_1",
    commandName: over.commandName,
    subcommand: over.subcommand,
    channelId: over.channelId ?? "chan-allowed",
    guildId: over.guildId,
    userId: over.userId ?? "user-1",
    options: over.options ?? {},
    replies,
    edits,
    reply: async (opts) => {
      replies.push(opts);
    },
    deferReply: async () => {
      deferred = true;
    },
    editReply: async (opts) => {
      edits.push(opts);
    },
  };
}

function makeCtx(over: Partial<SlashContext> = {}): SlashContext {
  // Temp non-git project root: /session start and /work must never create
  // real worktrees or talk/* branches in this repo during tests.
  const store =
    over.store ??
    new SessionStore({ defaultProjectRoot: mkdtempSync(join(tmpdir(), "corvidinho-slash-proj-")) });
  const workStore = over.workStore ?? new WorkStore();
  return {
    store,
    workStore,
    allowlist: over.allowlist ?? allowCfg(),
    agent: over.agent ?? createEchoAgentClient({ delayMs: 0 }),
    version: over.version ?? "0.0.3",
    protocolVersion: over.protocolVersion ?? CORVIDINHO_PROTOCOL_VERSION,
    startedAt: over.startedAt ?? Date.now() - 90_000,
    channelIds: over.channelIds ?? ["chan-allowed"],
    thinkingOutbound: over.thinkingOutbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    env: over.env,
    gitTipSha: over.gitTipSha,
    adminUserIds: over.adminUserIds,
    adminRoleIds: over.adminRoleIds,
    mutedUsers: over.mutedUsers,
  };
}

describe("slash command bodies (DISCORD-4)", () => {
  test("includes session/status/agents/work/mute/unmute/schedule", () => {
    const bodies = buildSlashCommandBodies();
    const names = bodies.map((b) => b.name).sort();
    expect(names).toEqual([...SLASH_COMMAND_NAMES].sort());
    const session = bodies.find((b) => b.name === "session");
    expect(session?.options?.map((o) => o.name).sort()).toEqual(["list", "start"]);
    const work = bodies.find((b) => b.name === "work");
    expect(work?.options?.[0]?.name).toBe("description");
    expect(work?.options?.[0]?.required).toBe(true);
  });
});

describe("formatUptime", () => {
  test("formats minutes and hours", () => {
    expect(formatUptime(45)).toBe("0m");
    expect(formatUptime(125)).toBe("2m");
    expect(formatUptime(3700)).toBe("1h 1m");
  });
});

describe("slash dispatch gates", () => {
  test("non-allowlisted channel non-admin → ephemeral silent ack; no session (DISCORD-DENY-3)", async () => {
    const ctx = makeCtx();
    const ix = memoryInteraction({
      commandName: "status",
      channelId: "chan-other",
      userId: "user-1",
    });
    const result = await handleSlashInteraction(ctx, ix);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("channel_not_allowlisted");
      expect(result.reply).toBeUndefined();
    }
    expect(ix.replies[0]?.ephemeral).toBe(true);
    expect(ix.replies[0]?.content).toBe(EPHEMERAL_SILENT_ACK);
    expect(ix.replies[0]?.content).not.toContain("allowlist");
    expect(ix.replies[0]?.content).not.toBe(NOT_AUTHORIZED);
    expect(ctx.store.list().length).toBe(0);
  });

  test("non-allowlisted channel admin → ephemeral allowlist tip (DISCORD-DENY-2)", async () => {
    const ctx = makeCtx({ adminUserIds: ["boss"] });
    const ix = memoryInteraction({
      commandName: "status",
      channelId: "chan-other",
      userId: "boss",
    });
    const result = await handleSlashInteraction(ctx, ix);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("channel_not_allowlisted");
      expect(result.reply).toBe(ALLOWLIST_DENY_TIP);
    }
    expect(ix.replies[0]?.ephemeral).toBe(true);
    expect(ix.replies[0]?.content).toBe(ALLOWLIST_DENY_TIP);
    expect(ix.replies[0]?.content).toContain("allowlist.toml");
    expect(ctx.store.list().length).toBe(0);
  });

  test("unknown command refused", async () => {
    const ctx = makeCtx();
    const ix = memoryInteraction({ commandName: "council" });
    const result = await handleSlashInteraction(ctx, ix);
    expect(result.ok).toBe(false);
    expect(ix.replies[0]?.content).toContain("Unknown command");
  });
});

describe("slash handlers", () => {
  test("/status reports metrics", async () => {
    const store = new SessionStore();
    store.create({ channelId: "chan-allowed", userId: "u1", topic: "hi" });
    const workStore = new WorkStore();
    workStore.create({
      description: "t",
      userId: "u1",
      channelId: "chan-allowed",
    });
    const ctx = makeCtx({
      store,
      workStore,
      startedAt: Date.now() - 125_000,
      env: {},
      gitTipSha: "abc1234",
    });
    const ix = memoryInteraction({ commandName: "status" });
    const result = await handleSlashInteraction(ctx, ix);
    expect(result.ok).toBe(true);
    const body = ix.replies[0]?.content ?? "";
    expect(body).toContain("v0.0.3");
    expect(body).toContain(`Protocol: ${CORVIDINHO_PROTOCOL_VERSION}`);
    expect(body).toContain("Active sessions: 1");
    expect(body).toContain("Channels (allowlist): 1");
    expect(body).toContain("LLM: demo stub");
    expect(body).toContain("Slash commands: session, status, agents, work, mute, unmute");
    expect(body).toContain("Git tip: abc1234");
    expect(body).not.toContain("sk-");
    expect(ix.replies[0]?.ephemeral).toBe(true);
  });

  test("/agents lists corvidinho", async () => {
    const ctx = makeCtx();
    const ix = memoryInteraction({ commandName: "agents" });
    await handleSlashInteraction(ctx, ix);
    expect(ix.replies[0]?.content).toContain("corvidinho");
    expect(ix.replies[0]?.ephemeral).toBe(true);
  });

  test("/session list empty and populated", async () => {
    const ctx = makeCtx();
    const emptyIx = memoryInteraction({
      commandName: "session",
      subcommand: "list",
    });
    await handleSlashInteraction(ctx, emptyIx);
    expect(emptyIx.replies[0]?.content).toBe("No active sessions.");

    ctx.store.create({
      channelId: "chan-allowed",
      userId: "user-1",
      topic: "ship slash",
    });
    const listIx = memoryInteraction({
      commandName: "session",
      subcommand: "list",
    });
    await handleSlashInteraction(ctx, listIx);
    expect(listIx.replies[0]?.content).toContain("Active sessions (1)");
    expect(listIx.replies[0]?.content).toContain("ship slash");
  });

  test("/session start creates stub and runs agent", async () => {
    const ctx = makeCtx();
    const ix = memoryInteraction({
      commandName: "session",
      subcommand: "start",
      options: { topic: "fix the flaky test" },
    });
    const result = await handleSlashInteraction(ctx, ix);
    expect(result.ok).toBe(true);
    expect(ctx.store.list().length).toBe(1);
    expect(ctx.store.list()[0]?.topic).toBe("fix the flaky test");
    const out = ix.edits[0]?.content ?? ix.replies[0]?.content ?? "";
    expect(out).toContain("Session `");
    expect(out).toContain("fix the flaky test");
  });

  test("/work creates work stub and runs agent", async () => {
    const ctx = makeCtx();
    const ix = memoryInteraction({
      commandName: "work",
      options: { description: "open PR for slash" },
    });
    const result = await handleSlashInteraction(ctx, ix);
    expect(result.ok).toBe(true);
    expect(ctx.workStore.list().length).toBe(1);
    const task = ctx.workStore.list()[0]!;
    expect(task.description).toBe("open PR for slash");
    expect(task.status).toBe("completed");
    expect(ctx.store.list().length).toBe(1);
    const out = ix.edits[0]?.content ?? ix.replies[0]?.content ?? "";
    expect(out).toContain("Work task `");
    expect(out).toContain("completed");
  });

  test("/work on denied channel creates nothing", async () => {
    const ctx = makeCtx();
    const ix = memoryInteraction({
      commandName: "work",
      channelId: "chan-denied",
      options: { description: "should not run" },
    });
    await handleSlashInteraction(ctx, ix);
    expect(ctx.workStore.list().length).toBe(0);
    expect(ctx.store.list().length).toBe(0);
    expect(ix.replies[0]?.ephemeral).toBe(true);
    expect(ix.replies[0]?.content).toBe(EPHEMERAL_SILENT_ACK);
  });
});

describe("formatStatusReport", () => {
  test("includes LLM host without key and omits git when absent", () => {
    const body = formatStatusReport({
      version: "0.0.3",
      protocolVersion: 1,
      startedAt: Date.now() - 60_000,
      channelCount: 2,
      sessions: 0,
      workActive: 0,
      workDone: 1,
      workFailed: 0,
      env: {
        CORVIDINHO_LLM_API_KEY: "sk-should-not-appear",
        CORVIDINHO_LLM_MODEL: "mini",
        CORVIDINHO_LLM_BASE_URL: "https://llm.example/v1",
      },
    });
    expect(body).toContain("**Corvidinho** v0.0.3");
    expect(body).toContain("LLM: mini @ llm.example");
    expect(body).not.toContain("sk-should");
    expect(body).not.toContain("Git tip:");
    expect(body).toContain("Slash commands: session, status, agents, work, mute, unmute");
  });
});
