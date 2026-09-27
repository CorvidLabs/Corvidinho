/**
 * IDENTITY-4 / REQ-discord-446 — a button-pick resume injects the presser's
 * Discord display name and username, as a chat message does: the gateway
 * carries them on `ComponentInteraction` and the bridge passes them to
 * `enrichPromptWithIdentity`. The owner map still wins for the owner, and a
 * pick with no names known injects the id only (never an invented name).
 * Driven through `startBridge` with a fake gateway, and through the live
 * gateway's InteractionCreate listener with the socket connect stubbed out;
 * no token, no network.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { Client, Events } from "discord.js";
import type { HumanAsk } from "../src/agent/types.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { pickCustomId } from "../src/discord/ask-buttons.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import {
  componentActorNames,
  createLiveGateway,
  createNullGateway,
  type ComponentInteraction,
  type GatewayHandlers,
} from "../src/discord/gateway.ts";
import { IDENTITY_INJECT_HEADER } from "../src/discord/identity-inject.ts";
import type { BridgeConfig } from "../src/discord/types.ts";

const CHAN = "chan-identity-pick";
const OWNER = "100000000000000011";
const MEMBER = "100000000000000012";

/** Missing allowlist file: never read the operator's allowlist (ALLOW-4). */
const NO_ALLOWLIST = join(mkdtempSync(join(tmpdir(), "corvidinho-idpick-")), "none.toml");

const running: Array<{ stop: () => Promise<void> }> = [];
afterEach(async () => {
  for (const r of running.splice(0)) await r.stop();
});

const ASK: HumanAsk = {
  reason: "clarify",
  question: "Which database should back it?",
  options: [
    { id: "1", label: "Postgres" },
    { id: "2", label: "SQLite" },
  ],
};

/** First run asks with buttons; every later run answers. Records each prompt. */
async function bridgeWithAsk() {
  const prompts: string[] = [];
  const agent: AgentClient = {
    async runChat(opts) {
      prompts.push(opts.prompt);
      if (prompts.length === 1) {
        return {
          ok: true,
          sessionId: opts.sessionId,
          summary: "Needs your input",
          exitCode: 0,
          ask: ASK,
          task: { verified: false, verifySkipped: true, state: "blocked" },
        };
      }
      return { ok: true, sessionId: opts.sessionId, summary: "done", exitCode: 0 };
    },
  };
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: CHAN,
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: NO_ALLOWLIST,
      CORVIDINHO_OWNER_DISCORD_ID: OWNER,
      CORVIDINHO_OWNER_DISPLAY: "Leif",
    },
    // Temp non-git project: never create real worktrees/branches in this repo.
    projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-idpick-proj-")),
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound: memoryThinkingOutbound(),
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent,
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      let n = 0;
      handlers.reply = async () => {
        n += 1;
        return { messageId: `bot-reply-${n}` };
      };
      return createNullGateway();
    },
  });
  if (result.ok !== true || !box.handlers) throw new Error("bridge did not start");
  running.push(result);
  return { result, handlers: box.handlers, prompts };
}

/** @mention from `userId`, then that user picks option 1; returns the resume prompt. */
async function pickPrompt(
  userId: string,
  names: Pick<ComponentInteraction, "userDisplayName" | "userUsername">,
): Promise<string> {
  const { result, handlers, prompts } = await bridgeWithAsk();
  await handlers.onMessage({
    id: "m1",
    channelId: CHAN,
    authorId: userId,
    authorBot: false,
    content: "set up storage for the service",
    mentionedBot: true,
  });
  const pending = result.store.list()[0]?.pendingAsk;
  if (!pending) throw new Error("no pending ask after the first run");
  await handlers.onComponent!({
    id: "ix-pick",
    customId: pickCustomId(pending.askId, "1"),
    channelId: CHAN,
    userId,
    messageId: pending.stubMessageId,
    reply: async () => {},
    deleteReply: async () => {},
    ...names,
  });
  expect(prompts).toHaveLength(2);
  const resumed = prompts[1]!;
  expect(resumed).toContain(IDENTITY_INJECT_HEADER);
  expect(resumed).toContain(`discord_user_id: ${userId}`);
  expect(resumed).toContain("Postgres");
  return resumed;
}

describe("button-pick resume identity (IDENTITY-4 / REQ-discord-446)", () => {
  test("a non-owner's pick resume carries their Discord display name", async () => {
    const prompt = await pickPrompt(MEMBER, {
      userDisplayName: "Ada Lovelace",
      userUsername: "ada",
    });
    expect(prompt).toContain("display_name: Ada Lovelace");
    expect(prompt).not.toContain("role: owner (ADMIN)");
  });

  test("without a display name the pick resume falls back to the Discord username", async () => {
    const prompt = await pickPrompt(MEMBER, { userUsername: "ada" });
    expect(prompt).toContain("display_name: ada");
  });

  test("the owner map display still wins over the Discord names on the owner's pick", async () => {
    const prompt = await pickPrompt(OWNER, {
      userDisplayName: "Someone Else",
      userUsername: "someone",
    });
    expect(prompt).toContain("display_name: Leif");
    expect(prompt).toContain("role: owner (ADMIN)");
    expect(prompt).not.toContain("Someone Else");
  });

  test("a pick with no names known injects the id only, never an invented name", async () => {
    const prompt = await pickPrompt(MEMBER, {});
    expect(prompt).not.toContain("display_name:");
  });
});

describe("componentActorNames — the gateway's presser names (IDENTITY-4 / REQ-discord-446)", () => {
  const user = {
    id: MEMBER,
    username: " ada ",
    globalName: "Ada Global",
    displayName: "Ada User",
  };

  test("guild member display wins, then nickname, then global name, then user display", () => {
    expect(
      componentActorNames({ user, member: { displayName: " Ada Member ", nickname: "Nick" } }),
    ).toEqual({ userDisplayName: "Ada Member", userUsername: "ada" });
    expect(componentActorNames({ user, member: { nickname: "Nick" } }).userDisplayName).toBe(
      "Nick",
    );
    expect(componentActorNames({ user, member: null }).userDisplayName).toBe("Ada Global");
    expect(
      componentActorNames({ user: { ...user, globalName: null } }).userDisplayName,
    ).toBe("Ada User");
  });

  test("blank or missing names stay undefined", () => {
    expect(componentActorNames({ user: { id: MEMBER } })).toEqual({
      userDisplayName: undefined,
      userUsername: undefined,
    });
    expect(
      componentActorNames({
        user: { id: MEMBER, username: "  ", globalName: " " },
        member: { displayName: "" },
      }),
    ).toEqual({ userDisplayName: undefined, userUsername: undefined });
  });
});

/**
 * The live gateway wiring: a discord.js button press reaches `onComponent`
 * with the presser's names. Real `login` with the socket connect stubbed out
 * (as in `tests/discord.presence.test.ts`); the press is emitted on the client.
 */
describe("live gateway button press carries the presser's names (IDENTITY-4 / REQ-discord-446)", () => {
  const fixtureConfig = {
    token: "fixture-token-not-real",
    channelIds: [CHAN],
  } as unknown as BridgeConfig;

  async function pressThroughLiveGateway(press: {
    user: { id: string; username?: string | null; globalName?: string | null };
    member?: { displayName?: string | null; nickname?: string | null } | null;
  }): Promise<ComponentInteraction> {
    const seen: ComponentInteraction[] = [];
    const realLogin = Client.prototype.login;
    let client: Client | null = null;
    Client.prototype.login = async function (this: Client, token?: string) {
      client = this;
      (this.ws as unknown as { connect: () => Promise<void> }).connect =
        async () => {};
      return realLogin.call(this, token);
    };
    let gateway: Awaited<ReturnType<typeof createLiveGateway>> | null = null;
    try {
      gateway = await createLiveGateway(fixtureConfig, {
        onMessage: () => {},
        onComponent: (ix) => {
          seen.push(ix);
        },
      });
      await gateway.start();
    } finally {
      Client.prototype.login = realLogin;
    }
    try {
      if (!client) throw new Error("login was not called");
      (client as Client).emit(Events.InteractionCreate, {
        id: "ix-live",
        customId: pickCustomId("ask-live", "1"),
        channelId: CHAN,
        guildId: "guild-1",
        message: { id: "stub-1" },
        deferred: false,
        replied: false,
        reply: async () => ({}),
        update: async () => ({}),
        isAutocomplete: () => false,
        isMessageComponent: () => true,
        isChatInputCommand: () => false,
        ...press,
      } as never);
      expect(seen).toHaveLength(1);
      return seen[0]!;
    } finally {
      await gateway.stop();
    }
  }

  test("a guild press carries the member display name and the username", async () => {
    const ix = await pressThroughLiveGateway({
      user: { id: MEMBER, username: "ada", globalName: "Ada Global" },
      member: { displayName: "Ada Member", nickname: null },
    });
    expect(ix.userId).toBe(MEMBER);
    expect(ix.userDisplayName).toBe("Ada Member");
    expect(ix.userUsername).toBe("ada");
  });

  test("a press with no names known carries neither", async () => {
    const ix = await pressThroughLiveGateway({ user: { id: MEMBER }, member: null });
    expect(ix.userId).toBe(MEMBER);
    expect(ix.userDisplayName).toBeUndefined();
    expect(ix.userUsername).toBeUndefined();
  });
});
