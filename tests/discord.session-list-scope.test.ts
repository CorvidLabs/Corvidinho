import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
/**
 * REQ-discord-418 — /session list is per-user for non-ADMIN (SESSION-MULTI-1,
 * ROLES-CHAT-*, IDENTITY-2/3): a member sees only their own sessions and never
 * an absolute host path; the owner (ADMIN) keeps the full list. Other listing
 * surfaces (/status, /schedule list) carry no other user's session data or
 * absolute host path to a member either.
 */
import { describe, expect, test } from "bun:test";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import { projectLabel } from "../src/discord/list-scope.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import { handleSlashInteraction } from "../src/discord/slash-dispatch.ts";
import type {
  SlashContext,
  SlashInteraction,
  SlashReplyPayload,
} from "../src/discord/slash-types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";

const OWNER = "boss";

function allowCfg() {
  const cfg = emptyConfig();
  cfg.discord.channels = ["chan-allowed"];
  return cfg;
}

function ix(
  userId: string,
  commandName: string,
  subcommand?: string,
): SlashInteraction & { replies: SlashReplyPayload[] } {
  const replies: SlashReplyPayload[] = [];
  return {
    id: `ix_${userId}_${commandName}`,
    commandName,
    subcommand,
    channelId: "chan-allowed",
    userId,
    options: {},
    replies,
    reply: async (opts) => {
      replies.push(opts);
    },
  };
}

function setup(opts: { owner?: boolean } = { owner: true }) {
  // Temp non-git project root: an absolute host path every session resolves to.
  const projectRoot = mkdtempSync(join(tmpdir(), "corvidinho-list-scope-"));
  const store = new SessionStore({ defaultProjectRoot: projectRoot });
  const ctx: SlashContext = {
    store,
    workStore: new WorkStore(),
    scheduleStore: new ScheduleStore(),
    allowlist: allowCfg(),
    agent: createEchoAgentClient({ delayMs: 0 }),
    version: "0.0.3",
    protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
    startedAt: Date.now() - 90_000,
    channelIds: ["chan-allowed"],
    owner: opts.owner === false ? undefined : { discordId: OWNER },
  };
  const alice = store.create({
    channelId: "chan-allowed",
    userId: "alice",
    topic: "alice private refactor plan",
  });
  const bob = store.create({
    channelId: "chan-allowed",
    userId: "bob",
    topic: "bob fixes the flaky test",
  });
  const boss = store.create({
    channelId: "chan-allowed",
    userId: OWNER,
    topic: "owner release checklist",
  });
  return { ctx, projectRoot, alice, bob, boss };
}

async function listAs(ctx: SlashContext, userId: string): Promise<string> {
  const i = ix(userId, "session", "list");
  await handleSlashInteraction(ctx, i);
  expect(i.replies).toHaveLength(1);
  expect(i.replies[0]?.ephemeral).toBe(true);
  return i.replies[0]?.content ?? "";
}

describe("/session list scope (REQ-discord-418)", () => {
  test("member sees only their own sessions", async () => {
    const { ctx, alice, bob, boss } = setup();
    const body = await listAs(ctx, "bob");
    expect(body).toContain("Active sessions (1)");
    expect(body).toContain(bob.id);
    expect(body).toContain("bob fixes the flaky test");
    // Nothing of any other user's session: id, mention, topic.
    for (const other of [alice, boss]) {
      expect(body).not.toContain(other.id);
      expect(body).not.toContain(`<@${other.userId}>`);
      expect(body).not.toContain(other.topic!);
    }
  });

  test("member with no own session sees none, even when others have sessions", async () => {
    const { ctx, alice, bob, boss } = setup();
    const body = await listAs(ctx, "carol");
    expect(body).toBe("No active sessions.");
    for (const s of [alice, bob, boss]) {
      expect(body).not.toContain(s.id);
    }
  });

  test("member view never shows an absolute host path (project name only)", async () => {
    const { ctx, projectRoot, bob } = setup();
    expect(bob.project).toBe(projectRoot);
    const body = await listAs(ctx, "bob");
    expect(body).not.toContain(projectRoot);
    expect(body).not.toContain(tmpdir());
    expect(body).toContain(`\`${basename(projectRoot)}\``);
    // No absolute POSIX path anywhere in the member reply.
    expect(body).not.toMatch(/`\//);
  });

  test("owner (ADMIN) keeps the full list with every user's sessions", async () => {
    const { ctx, projectRoot, alice, bob, boss } = setup();
    const body = await listAs(ctx, OWNER);
    expect(body).toContain("Active sessions (3)");
    for (const s of [alice, bob, boss]) {
      expect(body).toContain(s.id);
      expect(body).toContain(`<@${s.userId}>`);
      expect(body).toContain(s.topic!);
    }
    expect(body).toContain(projectRoot);
  });

  test("no owner configured: nobody is ADMIN, so everyone sees only their own (IDENTITY-3)", async () => {
    const { ctx, alice, bob } = setup({ owner: false });
    const body = await listAs(ctx, OWNER);
    expect(body).toContain("Active sessions (1)");
    expect(body).not.toContain(alice.id);
    expect(body).not.toContain(bob.id);
  });
});

describe("other listing surfaces for a member (REQ-discord-418)", () => {
  test("/status carries counts only — no session ids, mentions, topics or host paths", async () => {
    const { ctx, projectRoot, alice, boss } = setup();
    const i = ix("bob", "status");
    await handleSlashInteraction(ctx, i);
    const body = i.replies[0]?.content ?? "";
    expect(body).toContain("Active sessions: 3");
    for (const s of [alice, boss]) {
      expect(body).not.toContain(s.id);
      expect(body).not.toContain(`<@${s.userId}>`);
      expect(body).not.toContain(s.topic!);
    }
    expect(body).not.toContain(projectRoot);
  });

  test("/schedule list shows a member the project name, the owner the full path", async () => {
    const { ctx, projectRoot } = setup();
    ctx.scheduleStore!.create({
      name: "Nightly dig",
      cronExpression: "0 3 * * *",
      project: projectRoot,
      prompt: "Summarize open issues",
      createdByUserId: OWNER,
    });
    const member = ix("bob", "schedule", "list");
    await handleSlashInteraction(ctx, member);
    const memberBody = member.replies[0]?.content ?? "";
    expect(memberBody).toContain("Nightly dig");
    expect(memberBody).not.toContain(projectRoot);
    expect(memberBody).toContain(`Project: \`${basename(projectRoot)}\``);

    const owner = ix(OWNER, "schedule", "list");
    await handleSlashInteraction(ctx, owner);
    expect(owner.replies[0]?.content).toContain(`Project: \`${projectRoot}\``);
  });
});

describe("projectLabel", () => {
  test("absolute path → last segment; relative name kept; empty → undefined", () => {
    expect(projectLabel("/home/leif/src/Corvidinho")).toBe("Corvidinho");
    expect(projectLabel("/home/leif/src/Corvidinho/")).toBe("Corvidinho");
    expect(projectLabel("Corvidinho")).toBe("Corvidinho");
    expect(projectLabel("acme/other")).toBe("acme/other");
    expect(projectLabel("/")).toBeUndefined();
    expect(projectLabel("  ")).toBeUndefined();
    expect(projectLabel(undefined)).toBeUndefined();
  });
});
