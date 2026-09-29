/**
 * Ask button presses pass the same gates as chat and slash (REQ-discord-201 /
 * REQ-discord-010; ALLOW-5 / DISCORD-6 / DISCORD-DENY-3): after the channel
 * gate, the presser passes `gateActor` (deny lists, a non-empty user/role
 * allowlist, role ids from the interaction) and then mute/rate. A refusal is
 * an ephemeral ack only (zero-width for an actor deny, MUTED / RATE_LIMITED
 * for mute/rate); the ask stays pending, the agent does not run, and nothing
 * is sent or edited. Before this, a muted or deny-listed session owner could
 * keep a session going through buttons alone.
 * Fixture only: fake gateway, injected agent, memory outbound, no token.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HumanAsk } from "../src/agent/types.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { openCustomId, pickCustomId } from "../src/discord/ask-buttons.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import {
  adaptComponent,
  createNullGateway,
  interactionRoleIds,
  type ComponentInteraction,
  type GatewayHandlers,
} from "../src/discord/gateway.ts";
import type { SlashReplyPayload } from "../src/discord/slash-types.ts";
import {
  EPHEMERAL_SILENT_ACK,
  MUTED,
  RATE_LIMITED,
  type InboundMessage,
} from "../src/discord/types.ts";

const OWNER_ID = "111122223333444455";
const USER_ID = "222233334444555566";
const CHAN = "chan-on";

/** Every run asks again with buttons, so a resumed press would loop. */
const BUTTON_ASK: HumanAsk = {
  reason: "clarify",
  question: "Which DB?",
  options: [
    { id: "1", label: "Postgres" },
    { id: "2", label: "SQLite" },
  ],
};

type Ephemeral = { content?: string; ephemeral?: boolean; update?: boolean };

async function askBridge(extraEnv: Record<string, string> = {}) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const replies: Array<{ channelId: string; content: string }> = [];
  const prompts: string[] = [];
  const agent: AgentClient = {
    async runChat({ sessionId, prompt }) {
      prompts.push(prompt);
      return {
        ok: true,
        sessionId,
        summary: "need input",
        exitCode: 0,
        ask: BUTTON_ASK,
        task: { verified: false, verifySkipped: true, state: "blocked" },
      };
    },
  };
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: CHAN,
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      // Missing allowlist file: never read the operator's allowlist (ALLOW-4).
      CORVIDINHO_ALLOWLIST_FILE: join(mkdtempSync(join(tmpdir(), "corvidinho-ask-gate-")), "none.toml"),
      CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
      ...extraEnv,
    },
    // Temp non-git project: never create real worktrees/branches in this repo.
    projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-ask-gate-proj-")),
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound: outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent,
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      handlers.reply = async (opts) => {
        replies.push(opts);
        return { messageId: `bot_${replies.length}` };
      };
      return createNullGateway();
    },
  });
  if (!result.ok || !box.handlers) throw new Error("bridge did not start");
  return { result, handlers: box.handlers, replies, prompts, outbound };
}

type Bridge = Awaited<ReturnType<typeof askBridge>>;

function sent(b: Bridge): number {
  const { replies, outbound } = b;
  return (
    replies.length +
    outbound.sends.length +
    outbound.edits.length +
    outbound.contentEdits.length +
    outbound.deletes.length
  );
}

let seq = 0;
function mention(authorId: string, over: Partial<InboundMessage> = {}): InboundMessage {
  seq += 1;
  return {
    id: `m_${seq}`,
    channelId: CHAN,
    authorId,
    authorBot: false,
    content: "<@bot> pick a database",
    mentionedBot: true,
    ...over,
  };
}

function press(
  customId: string,
  userId: string,
  ephemeral: Ephemeral[],
  roleIds?: string[],
): ComponentInteraction {
  seq += 1;
  return {
    id: `ix_${seq}`,
    customId,
    channelId: CHAN,
    userId,
    ...(roleIds ? { roleIds } : {}),
    reply: async (opts) => {
      ephemeral.push(opts);
    },
    deleteReply: async () => {},
  };
}

/** `userId` @mentions and gets a pending button ask. */
async function withButtonAsk(
  userId = USER_ID,
  extraEnv: Record<string, string> = {},
  authorRoleIds?: string[],
) {
  const b = await askBridge(extraEnv);
  await b.handlers.onMessage(mention(userId, authorRoleIds ? { authorRoleIds } : {}));
  const pending = b.result.store.list()[0]?.pendingAsk;
  if (!pending?.options?.length) throw new Error("no button ask");
  expect(b.prompts).toHaveLength(1);
  return { ...b, askId: pending.askId };
}

function pendingAskId(b: Bridge): string | undefined {
  return b.result.store.list()[0]?.pendingAsk?.askId;
}

/** A refused press: one ephemeral ack, no run, nothing posted, ask kept. */
function expectRefused(
  b: Bridge & { askId: string },
  before: number,
  eph: Ephemeral[],
  content: string,
): void {
  expect(b.prompts).toHaveLength(1);
  expect(sent(b)).toBe(before);
  expect(eph).toEqual([{ content, ephemeral: true }]);
  expect(pendingAskId(b)).toBe(b.askId);
}

describe("ask button press: mute (DISCORD-6 / REQ-discord-010)", () => {
  test("muted session owner's pick gets ephemeral MUTED: no run, nothing posted, ask stays pending", async () => {
    const b = await withButtonAsk();
    b.result.muteUser(USER_ID);
    const before = sent(b);
    const eph: Ephemeral[] = [];
    await b.handlers.onComponent!(press(pickCustomId(b.askId, "1"), USER_ID, eph));
    expectRefused(b, before, eph, MUTED);

    // Pressing again (the follow-up ask loop from the report) stays refused.
    const again: Ephemeral[] = [];
    await b.handlers.onComponent!(press(pickCustomId(b.askId, "2"), USER_ID, again));
    expectRefused(b, before, again, MUTED);

    // The ask was not cleared: once unmuted, the same button resumes.
    b.result.unmuteUser(USER_ID);
    const ok: Ephemeral[] = [];
    await b.handlers.onComponent!(press(pickCustomId(b.askId, "1"), USER_ID, ok));
    expect(b.prompts).toHaveLength(2);
    expect(b.prompts[1]).toContain("Postgres");
    await b.result.stop();
  });

  test("muted session owner's open gets ephemeral MUTED, not the choice buttons", async () => {
    const b = await withButtonAsk();
    b.result.muteUser(USER_ID);
    const before = sent(b);
    const eph: Ephemeral[] = [];
    await b.handlers.onComponent!(press(openCustomId(b.askId), USER_ID, eph));
    expectRefused(b, before, eph, MUTED);
    await b.result.stop();
  });
});

describe("ask button press: actor gate (REQ-discord-201 / DISCORD-DENY-3)", () => {
  test("deny-listed session owner's pick and open get only the zero-width ack", async () => {
    const b = await withButtonAsk();
    b.result.config.allowlist.discord.denyUsers = [USER_ID];
    const before = sent(b);
    const pick: Ephemeral[] = [];
    await b.handlers.onComponent!(press(pickCustomId(b.askId, "1"), USER_ID, pick));
    expectRefused(b, before, pick, EPHEMERAL_SILENT_ACK);
    const open: Ephemeral[] = [];
    await b.handlers.onComponent!(press(openCustomId(b.askId), USER_ID, open));
    expectRefused(b, before, open, EPHEMERAL_SILENT_ACK);
    await b.result.stop();
  });

  test("a deny-listed role on the presser gets only the zero-width ack", async () => {
    const b = await withButtonAsk();
    b.result.config.allowlist.discord.denyRoles = ["role-bad"];
    const before = sent(b);
    const eph: Ephemeral[] = [];
    await b.handlers.onComponent!(press(pickCustomId(b.askId, "1"), USER_ID, eph, ["role-bad"]));
    expectRefused(b, before, eph, EPHEMERAL_SILENT_ACK);
    const open: Ephemeral[] = [];
    await b.handlers.onComponent!(press(openCustomId(b.askId), USER_ID, open, ["role-bad"]));
    expectRefused(b, before, open, EPHEMERAL_SILENT_ACK);
    await b.result.stop();
  });

  test("an actor deny wins over mute: zero-width ack, not MUTED", async () => {
    const b = await withButtonAsk();
    b.result.config.allowlist.discord.denyUsers = [USER_ID];
    b.result.muteUser(USER_ID);
    const before = sent(b);
    const eph: Ephemeral[] = [];
    await b.handlers.onComponent!(press(pickCustomId(b.askId, "1"), USER_ID, eph));
    expectRefused(b, before, eph, EPHEMERAL_SILENT_ACK);
    await b.result.stop();
  });

  test("with a non-empty user allowlist, an unlisted presser is refused; an allowed role still resumes", async () => {
    const b = await withButtonAsk(USER_ID, {}, ["role-a"]);
    b.result.config.allowlist.discord.users = ["someone-else"];
    b.result.config.allowlist.discord.roles = ["role-a"];
    const before = sent(b);
    const eph: Ephemeral[] = [];
    await b.handlers.onComponent!(press(pickCustomId(b.askId, "1"), USER_ID, eph));
    expectRefused(b, before, eph, EPHEMERAL_SILENT_ACK);

    // ROLES-CHAT-1: the same member passes by role (role ids from the press).
    const ok: Ephemeral[] = [];
    await b.handlers.onComponent!(press(pickCustomId(b.askId, "1"), USER_ID, ok, ["role-a"]));
    expect(b.prompts).toHaveLength(2);
    expect(b.prompts[1]).toContain("Postgres");
    await b.result.stop();
  });

  test("the owner not on a non-empty user list still resumes (IDENTITY-1)", async () => {
    const b = await withButtonAsk(OWNER_ID);
    b.result.config.allowlist.discord.users = ["someone-else"];
    const eph: Ephemeral[] = [];
    await b.handlers.onComponent!(press(pickCustomId(b.askId, "1"), OWNER_ID, eph));
    expect(b.prompts).toHaveLength(2);
    await b.result.stop();
  });
});

describe("ask button press: rate limit (DISCORD-6 / REQ-discord-010)", () => {
  test("presses share the chat budget: over the max, pick gets ephemeral RATE_LIMITED and the ask stays pending", async () => {
    const b = await withButtonAsk(USER_ID, { DISCORD_RATE_LIMIT_MAX: "1" });
    const before = sent(b);
    const eph: Ephemeral[] = [];
    await b.handlers.onComponent!(press(pickCustomId(b.askId, "1"), USER_ID, eph));
    expectRefused(b, before, eph, RATE_LIMITED);

    // Another user's budget is untouched (DISCORD-6: no punishing everyone).
    await b.handlers.onMessage(mention(OWNER_ID));
    expect(b.prompts).toHaveLength(2);
    await b.result.stop();
  });

  test("over the max, open gets ephemeral RATE_LIMITED, not the choice buttons", async () => {
    const b = await withButtonAsk(USER_ID, { DISCORD_RATE_LIMIT_MAX: "1" });
    const before = sent(b);
    const eph: Ephemeral[] = [];
    await b.handlers.onComponent!(press(openCustomId(b.askId), USER_ID, eph));
    expectRefused(b, before, eph, RATE_LIMITED);
    await b.result.stop();
  });

  test("presses share the budget with slash: @mention + /status fill max 2, then pick is refused", async () => {
    const b = await withButtonAsk(USER_ID, { DISCORD_RATE_LIMIT_MAX: "2" });
    const slashReplies: SlashReplyPayload[] = [];
    await b.handlers.onSlash!({
      id: "ix_status",
      commandName: "status",
      channelId: CHAN,
      userId: USER_ID,
      options: {},
      reply: async (p) => void slashReplies.push(p),
    });
    expect(slashReplies[0]?.content).not.toBe(RATE_LIMITED);
    const before = sent(b);
    const eph: Ephemeral[] = [];
    await b.handlers.onComponent!(press(pickCustomId(b.askId, "1"), USER_ID, eph));
    expectRefused(b, before, eph, RATE_LIMITED);
    await b.result.stop();
  });

  test("rateLimitByLevel keys on the presser's resolved level: the owner (ADMIN) still resumes", async () => {
    const b = await withButtonAsk(OWNER_ID, {
      DISCORD_RATE_LIMIT_MAX: "1",
      DISCORD_RATE_LIMIT_BY_LEVEL: '{"3":100}',
    });
    const eph: Ephemeral[] = [];
    await b.handlers.onComponent!(press(pickCustomId(b.askId, "1"), OWNER_ID, eph));
    expect(b.prompts).toHaveLength(2);
    expect(eph[0]?.content).not.toBe(RATE_LIMITED);
    await b.result.stop();
  });
});

describe("adaptComponent (gateway: a live press carries the member's role ids)", () => {
  function raw(member: unknown) {
    return {
      id: "ix-raw",
      customId: pickCustomId("ask-1", "1"),
      channelId: CHAN,
      guildId: "guild-1",
      user: { id: USER_ID },
      member: member as never,
      message: { id: "stub-1" },
      deferred: false,
      replied: false,
      reply: async () => undefined,
      update: async () => undefined,
    };
  }

  test("roleIds come from a cached member, a raw API member, or are empty outside a guild", () => {
    const cached = adaptComponent(raw({ roles: { cache: new Map([["role-a", {}]]) } }));
    expect(cached.roleIds).toEqual(["role-a"]);
    expect(cached.userId).toBe(USER_ID);
    expect(cached.messageId).toBe("stub-1");
    expect(adaptComponent(raw({ roles: ["role-b"] })).roleIds).toEqual(["role-b"]);
    expect(adaptComponent(raw(null)).roleIds).toEqual([]);
  });
});

describe("interactionRoleIds (gateway: role ids for slash and component presses)", () => {
  test("reads a cached role manager, raw API role ids, or nothing", () => {
    const cache = new Map([
      ["role-a", {}],
      ["role-b", {}],
    ]);
    expect(interactionRoleIds({ roles: { cache } })).toEqual(["role-a", "role-b"]);
    expect(interactionRoleIds({ roles: ["role-c"] })).toEqual(["role-c"]);
    expect(interactionRoleIds({})).toEqual([]);
    expect(interactionRoleIds(null)).toEqual([]);
    expect(interactionRoleIds(undefined)).toEqual([]);
  });
});
