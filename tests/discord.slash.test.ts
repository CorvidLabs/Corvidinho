/**
 * DISCORD-4 slash commands — fixture tests (no live Discord token).
 */
import { describe, expect, test } from "bun:test";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import { formatUptime } from "../src/discord/command-handlers/status.ts";
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
  const store = over.store ?? new SessionStore();
  const workStore = over.workStore ?? new WorkStore();
  return {
    store,
    workStore,
    allowlist: over.allowlist ?? allowCfg(),
    agent: over.agent ?? createEchoAgentClient({ delayMs: 0 }),
    version: over.version ?? "0.0.1",
    protocolVersion: over.protocolVersion ?? CORVIDINHO_PROTOCOL_VERSION,
    startedAt: over.startedAt ?? Date.now() - 90_000,
    channelIds: over.channelIds ?? ["chan-allowed"],
    thinkingOutbound: over.thinkingOutbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
  };
}

describe("slash command bodies (DISCORD-4)", () => {
  test("includes session/status/agents/work", () => {
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
  test("non-allowlisted channel → not authorized; no session", async () => {
    const ctx = makeCtx();
    const ix = memoryInteraction({
      commandName: "status",
      channelId: "chan-other",
    });
    const result = await handleSlashInteraction(ctx, ix);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reply).toBe(NOT_AUTHORIZED);
    }
    expect(ix.replies[0]?.content).toBe(NOT_AUTHORIZED);
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
    const ctx = makeCtx({ store, workStore, startedAt: Date.now() - 125_000 });
    const ix = memoryInteraction({ commandName: "status" });
    const result = await handleSlashInteraction(ctx, ix);
    expect(result.ok).toBe(true);
    const body = ix.replies[0]?.content ?? "";
    expect(body).toContain("v0.0.1");
    expect(body).toContain("Protocol: 1");
    expect(body).toContain("Active sessions: 1");
    expect(body).toContain("Channels (allowlist): 1");
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
    expect(ix.replies[0]?.content).toBe(NOT_AUTHORIZED);
  });
});
