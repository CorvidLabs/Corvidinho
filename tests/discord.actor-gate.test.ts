/**
 * Actor gate on the Discord chat + slash paths (REQ-discord-201;
 * ALLOW-3 / ALLOW-5 / DISCORD-5 / DISCORD-DENY-1..3 / ROLES-CHAT-1).
 * Fixture only — no live Discord token, no real agent spawn.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { emptyConfig } from "../src/allowlist/types.ts";
import type { AgentClient, AgentRunChatOpts } from "../src/discord/agent-client.ts";
import { routeMessage } from "../src/discord/message-router.ts";
import { gateActor } from "../src/discord/permissions.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import { handleSlashInteraction } from "../src/discord/slash-dispatch.ts";
import type {
  SlashContext,
  SlashInteraction,
  SlashReplyPayload,
} from "../src/discord/slash-types.ts";
import { EPHEMERAL_SILENT_ACK, type InboundMessage } from "../src/discord/types.ts";
import { WorkStore } from "../src/discord/work-store.ts";

const OWNER = { discordId: "boss" };

function cfg(over: {
  users?: string[];
  roles?: string[];
  denyUsers?: string[];
  denyRoles?: string[];
} = {}) {
  const c = emptyConfig();
  c.discord.channels = ["chan-ok"];
  c.discord.users = over.users ?? [];
  c.discord.roles = over.roles ?? [];
  c.discord.denyUsers = over.denyUsers ?? [];
  c.discord.denyRoles = over.denyRoles ?? [];
  return c;
}

/** Operator config from the bug report: allow leif, deny mallory. */
const LISTED = () => cfg({ users: ["leif"], denyUsers: ["mallory"] });

function msg(over: Partial<InboundMessage> = {}): InboundMessage {
  return {
    id: "m1",
    channelId: "chan-ok",
    authorId: "leif",
    authorBot: false,
    content: "<@1> cat secrets",
    mentionedBot: true,
    ...over,
  };
}

function tempStore(): SessionStore {
  // Non-git root: slash /session start and /work never create talk/* worktrees.
  return new SessionStore({
    defaultProjectRoot: mkdtempSync(join(tmpdir(), "corvidinho-actor-gate-")),
  });
}

function recordingAgent(spawned: string[]): AgentClient {
  return {
    async runChat(o: AgentRunChatOpts) {
      spawned.push(`${o.actingUserId}: ${o.prompt}`);
      return { ok: true, sessionId: o.sessionId, summary: "ok", exitCode: 0 };
    },
  };
}

function ix(
  over: Partial<SlashInteraction> & { commandName: string },
): SlashInteraction & { replies: SlashReplyPayload[] } {
  const replies: SlashReplyPayload[] = [];
  return {
    id: "ix_1",
    channelId: "chan-ok",
    userId: "leif",
    options: {},
    ...over,
    replies,
    reply: async (p) => {
      replies.push(p);
    },
    deferReply: async () => {},
    editReply: async (p) => {
      replies.push(p);
    },
  };
}

function ctx(allowlist = LISTED(), spawned: string[] = []): SlashContext {
  return {
    store: tempStore(),
    workStore: new WorkStore(),
    allowlist,
    agent: recordingAgent(spawned),
    version: "0.0.0",
    protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
    startedAt: Date.now(),
    channelIds: ["chan-ok"],
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    owner: OWNER,
    mutedUsers: new Set(),
    openWorkPr: async () => ({ opened: false, reason: "no-changes", line: "PR: none (test)" }),
  };
}

describe("gateActor (REQ-discord-201)", () => {
  test("user list set: listed user, owner and allowed role pass; others refused", () => {
    const c = cfg({ users: ["leif"], roles: ["crew"], denyUsers: ["mallory"] });
    expect(gateActor({ userId: "leif", allowlist: c, owner: OWNER }).ok).toBe(true);
    expect(gateActor({ userId: "boss", allowlist: c, owner: OWNER }).ok).toBe(true);
    expect(gateActor({ userId: "sam", roleIds: ["crew"], allowlist: c }).ok).toBe(true);
    expect(gateActor({ userId: "stranger", allowlist: c, owner: OWNER }).ok).toBe(false);
    expect(gateActor({ userId: "mallory", roleIds: ["crew"], allowlist: c }).ok).toBe(false);
  });

  test("empty user+role lists: channel gate alone (ROLES-CHAT-1), deny still wins", () => {
    const c = cfg({ denyUsers: ["mallory"], denyRoles: ["banned"] });
    expect(gateActor({ userId: "anyone", allowlist: c }).ok).toBe(true);
    expect(gateActor({ userId: "mallory", allowlist: c }).ok).toBe(false);
    expect(gateActor({ userId: "anyone", roleIds: ["banned"], allowlist: c }).ok).toBe(false);
  });

  test("a denied role refuses even a listed user and the owner (deny always wins)", () => {
    const c = cfg({ users: ["leif"], denyRoles: ["banned"] });
    expect(gateActor({ userId: "leif", roleIds: ["banned"], allowlist: c }).ok).toBe(false);
    expect(
      gateActor({ userId: "boss", roleIds: ["banned"], allowlist: c, owner: OWNER }).ok,
    ).toBe(false);
  });
});

describe("MessageCreate actor gate (ALLOW-3/5, DISCORD-5, DISCORD-DENY-1)", () => {
  test("@mention: deny-listed and unlisted members are refused silently; nothing starts", () => {
    const store = new SessionStore();
    const deps = { store, allowlist: LISTED(), channelOnlyGate: true, owner: OWNER };
    for (const who of ["mallory", "stranger"]) {
      const a = routeMessage(msg({ authorId: who }), deps);
      expect(`${who} => ${a.kind}`).toBe(`${who} => refuse`);
      if (a.kind === "refuse") expect(a.reply).toBeUndefined();
    }
    expect(store.bySessionId.size).toBe(0);
  });

  test("@mention: listed user and unlisted owner still start a session", () => {
    const store = new SessionStore();
    const deps = { store, allowlist: LISTED(), channelOnlyGate: true, owner: OWNER };
    expect(routeMessage(msg({ authorId: "leif" }), deps).kind).toBe("start_session");
    expect(routeMessage(msg({ authorId: "boss" }), deps).kind).toBe("start_session");
  });

  test("@mention: role allowlist admits a member with an allowed role", () => {
    const deps = { store: new SessionStore(), allowlist: cfg({ roles: ["crew"] }) };
    expect(routeMessage(msg({ authorId: "sam", authorRoleIds: ["crew"] }), deps).kind).toBe(
      "start_session",
    );
    expect(routeMessage(msg({ authorId: "sam" }), deps).kind).toBe("refuse");
  });

  test("empty user+role lists keep the channel-only chat path; deny-listed user still refused", () => {
    const deps = { store: new SessionStore(), allowlist: cfg({ denyUsers: ["mallory"] }) };
    expect(routeMessage(msg({ authorId: "anyone" }), deps).kind).toBe("start_session");
    const a = routeMessage(msg({ authorId: "mallory" }), deps);
    expect(a.kind).toBe("refuse");
    if (a.kind === "refuse") expect(a.reply).toBeUndefined();
  });

  test("reply-to-bot and thread continuation refuse a denied or unlisted member silently", () => {
    const store = new SessionStore();
    const deps = { store, allowlist: LISTED(), channelOnlyGate: true, owner: OWNER };
    const start = routeMessage(msg({ authorId: "leif", threadId: "thr-1" }), deps);
    expect(start.kind).toBe("start_session");
    if (start.kind !== "start_session") return;
    store.trackBotMessage("bot-1", start.session);

    for (const who of ["mallory", "stranger"]) {
      const reply = routeMessage(
        msg({ authorId: who, mentionedBot: false, referencedMessageId: "bot-1" }),
        deps,
      );
      expect(`${who} reply => ${reply.kind}`).toBe(`${who} reply => refuse`);
      if (reply.kind === "refuse") expect(reply.reply).toBeUndefined();

      const thread = routeMessage(
        msg({ authorId: who, mentionedBot: false, threadId: "thr-1" }),
        deps,
      );
      expect(`${who} thread => ${thread.kind}`).toBe(`${who} thread => refuse`);
      if (thread.kind === "refuse") expect(thread.reply).toBeUndefined();
    }

    // The listed user still continues the same talk.
    const cont = routeMessage(
      msg({ authorId: "leif", mentionedBot: false, referencedMessageId: "bot-1" }),
      deps,
    );
    expect(cont.kind).toBe("continue_session");
  });
});

describe("slash actor gate (ALLOW-3/5, DISCORD-5, DISCORD-DENY-3)", () => {
  test("/work, /session start and /status by deny-listed or unlisted member: ephemeral silent ack, no spawn", async () => {
    for (const who of ["mallory", "stranger"]) {
      const spawned: string[] = [];
      const c = ctx(LISTED(), spawned);
      const cases = [
        ix({ commandName: "work", userId: who, options: { description: "cat secrets" } }),
        ix({ commandName: "session", subcommand: "start", userId: who, options: { topic: "cat secrets" } }),
        ix({ commandName: "status", userId: who }),
      ];
      for (const i of cases) {
        const r = await handleSlashInteraction(c, i);
        expect(r).toEqual({ ok: false, reason: "user_not_allowlisted" });
        expect(i.replies).toEqual([{ content: EPHEMERAL_SILENT_ACK, ephemeral: true }]);
      }
      expect(spawned).toEqual([]);
      expect(c.workStore.list().length).toBe(0);
      expect(c.store.list().length).toBe(0);
    }
  });

  test("listed user may /work; unlisted owner may /status", async () => {
    const spawned: string[] = [];
    const c = ctx(LISTED(), spawned);
    const work = ix({ commandName: "work", userId: "leif", options: { description: "fix it" } });
    expect(await handleSlashInteraction(c, work)).toEqual({ ok: true, handled: true });
    expect(spawned).toEqual(["leif: fix it"]);

    const status = ix({ commandName: "status", userId: "boss" });
    expect(await handleSlashInteraction(c, status)).toEqual({ ok: true, handled: true });
  });
});
