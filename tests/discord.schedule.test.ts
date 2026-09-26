/**
 * DISCORD-SCHEDULE slash fixtures (no live token).
 */
import { describe, expect, test } from "bun:test";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
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
import { ScheduleStore } from "../src/scheduler/store.ts";

function allowCfg(channels: string[] = ["chan-allowed"]) {
  const cfg = emptyConfig();
  cfg.discord.channels = channels.map((c) => c.toLowerCase());
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
    options: over.options ?? {},
    roleIds: over.roleIds,
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
    scheduleStore: over.scheduleStore ?? new ScheduleStore(),
    allowlist: over.allowlist ?? allowCfg(),
    agent: over.agent ?? createEchoAgentClient({ delayMs: 0 }),
    version: over.version ?? "0.0.3",
    protocolVersion: over.protocolVersion ?? CORVIDINHO_PROTOCOL_VERSION,
    startedAt: over.startedAt ?? Date.now() - 90_000,
    channelIds: over.channelIds ?? ["chan-allowed"],
    adminUserIds: over.adminUserIds,
    adminRoleIds: over.adminRoleIds,
    owner: over.owner,
    mutedUsers: over.mutedUsers,
  };
}

describe("/schedule bodies", () => {
  test("includes schedule with list/create/pause/resume/delete", () => {
    expect(SLASH_COMMAND_NAMES).toContain("schedule");
    const schedule = buildSlashCommandBodies().find((b) => b.name === "schedule");
    expect(schedule?.options?.map((o) => o.name).sort()).toEqual([
      "create",
      "delete",
      "list",
      "pause",
      "resume",
    ]);
    const create = schedule?.options?.find((o) => o.name === "create");
    expect(create?.options?.map((o) => o.name).sort()).toEqual([
      "cadence",
      "channel",
      "name",
      "project",
      "prompt",
    ]);
  });
});

describe("/schedule dispatch", () => {
  test("list empty", async () => {
    const ctx = makeCtx();
    const ix = memoryInteraction({
      commandName: "schedule",
      subcommand: "list",
    });
    const r = await handleSlashInteraction(ctx, ix);
    expect(r.ok).toBe(true);
    expect(ix.replies[0]?.content).toContain("No schedules");
  });

  test("create requires admin; empty admin = deny-all", async () => {
    const ctx = makeCtx({ owner: null });
    const ix = memoryInteraction({
      commandName: "schedule",
      subcommand: "create",
      userId: "nobody",
      options: {
        name: "Hourly",
        cadence: "every hour",
        project: "Corvidinho",
        prompt: "Check status",
      },
    });
    const r = await handleSlashInteraction(ctx, ix);
    expect(r.ok).toBe(true); // handler replied not-authorized
    expect(ix.replies[0]?.content).toBe(NOT_AUTHORIZED);
    expect(ctx.scheduleStore!.list()).toHaveLength(0);
  });

  test("admin create + list + pause + resume + delete", async () => {
    const ctx = makeCtx({ owner: { discordId: "boss" } });
    const createIx = memoryInteraction({
      commandName: "schedule",
      subcommand: "create",
      userId: "boss",
      options: {
        name: "Hourly dig",
        cadence: "@hourly",
        project: "CorvidLabs/Corvidinho",
        prompt: "Summarize open issues",
        channel: "chan-allowed",
      },
    });
    await handleSlashInteraction(ctx, createIx);
    expect(createIx.replies[0]?.content).toContain("Schedule created");
    expect(ctx.scheduleStore!.list()).toHaveLength(1);
    const id = ctx.scheduleStore!.list()[0]!.id;

    const listIx = memoryInteraction({
      commandName: "schedule",
      subcommand: "list",
      userId: "peer",
    });
    await handleSlashInteraction(ctx, listIx);
    expect(listIx.replies[0]?.content).toContain("Hourly dig");

    const pauseIx = memoryInteraction({
      commandName: "schedule",
      subcommand: "pause",
      userId: "boss",
      options: { schedule: id },
    });
    await handleSlashInteraction(ctx, pauseIx);
    expect(ctx.scheduleStore!.get(id)?.status).toBe("paused");

    const resumeIx = memoryInteraction({
      commandName: "schedule",
      subcommand: "resume",
      userId: "boss",
      options: { schedule: id.slice(0, 10) },
    });
    await handleSlashInteraction(ctx, resumeIx);
    expect(ctx.scheduleStore!.get(id)?.status).toBe("active");

    const delIx = memoryInteraction({
      commandName: "schedule",
      subcommand: "delete",
      userId: "boss",
      options: { schedule: id },
    });
    await handleSlashInteraction(ctx, delIx);
    expect(ctx.scheduleStore!.list()).toHaveLength(0);
  });

  test("create rejects non-allowlisted channel and <5m cadence", async () => {
    const ctx = makeCtx({ owner: { discordId: "boss" } });
    const badChan = memoryInteraction({
      commandName: "schedule",
      subcommand: "create",
      userId: "boss",
      options: {
        name: "x",
        cadence: "every hour",
        project: "p",
        prompt: "do",
        channel: "chan-other",
      },
    });
    await handleSlashInteraction(ctx, badChan);
    expect(badChan.replies[0]?.content).toMatch(/not allowlisted/i);

    const fast = memoryInteraction({
      commandName: "schedule",
      subcommand: "create",
      userId: "boss",
      options: {
        name: "fast",
        cadence: "every 1 minute",
        project: "p",
        prompt: "do",
      },
    });
    await handleSlashInteraction(ctx, fast);
    expect(fast.replies[0]?.content).toMatch(/5 minutes/i);
    expect(ctx.scheduleStore!.list()).toHaveLength(0);
  });

  test("non-admin cannot pause", async () => {
    const store = new ScheduleStore();
    const s = store.create({
      name: "x",
      cronExpression: "0 * * * *",
      project: "p",
      prompt: "do",
      createdByUserId: "boss",
    });
    const ctx = makeCtx({ owner: { discordId: "boss" }, scheduleStore: store });
    const ix = memoryInteraction({
      commandName: "schedule",
      subcommand: "pause",
      userId: "peon",
      options: { schedule: s.id },
    });
    await handleSlashInteraction(ctx, ix);
    expect(ix.replies[0]?.content).toBe(NOT_AUTHORIZED);
    expect(store.get(s.id)?.status).toBe("active");
  });
});
