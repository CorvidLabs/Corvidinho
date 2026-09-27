/**
 * DISCORD-ASK-1/4 (REQ-discord-044) on the slash path: a `/work` or
 * `/session start` run that stops with a clarify or stuck ask whose choices
 * fit a short list answers with the chat's public Choose stub (no MCQ body,
 * no public "reply to this" question), keeps the ask with its options as the
 * session's pending ask, and a requester's press opens the ephemeral choice
 * UI whose pick resumes that session in the stub message. Free text stays
 * only when the options cannot be listed, and a SAFE-8 spend-cap stop is
 * never a button ask. Fixtures only: fake gateway, in-memory outbound.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HumanAsk } from "../src/agent/types.ts";
import type { AgentClient, AgentRunChatOpts } from "../src/discord/agent-client.ts";
import {
  ASK_STUB_HINT,
  buildOpenStubComponents,
  buttonAskFor,
  openCustomId,
  pickCustomId,
} from "../src/discord/ask-buttons.ts";
import { ASK_REPLY_HINT, COLLAPSED_PING_QUESTION } from "../src/discord/ask-ping.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import {
  createNullGateway,
  type ComponentInteraction,
  type GatewayHandlers,
} from "../src/discord/gateway.ts";
import type { SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";

const OWNER_ID = "111122223333444455";
const REQUESTER = "222233334444555566";
const OPTIONS_ASK: HumanAsk = {
  reason: "clarify",
  question: "Postgres or SQLite?",
  options: [
    { id: "pg", label: "Postgres" },
    { id: "sqlite", label: "SQLite" },
  ],
};
/** No structured options: the choices are a numbered list in the question. */
const NUMBERED_ASK: HumanAsk = {
  reason: "clarify",
  question: "Which storage should I use?\n1. Postgres\n2. SQLite",
};
const STUCK_OPTIONS_ASK: HumanAsk = {
  reason: "stuck",
  question: "Verify keeps failing on the migration. How should I proceed?",
  options: [
    { id: "skip", label: "Skip the migration" },
    { id: "revert", label: "Revert it" },
  ],
};

type Reply = {
  channelId: string;
  content: string;
  replyToMessageId?: string;
  mentionUserIds?: string[];
  components?: unknown[];
};

/** First run returns `first`; later runs answer plainly. */
function askingAgent(first: { ask: HumanAsk; summary: string; ok?: boolean }) {
  const calls: AgentRunChatOpts[] = [];
  const agent: AgentClient = {
    async runChat(input) {
      calls.push(input);
      if (calls.length === 1) {
        return {
          ok: first.ok ?? true,
          sessionId: input.sessionId,
          summary: first.summary,
          exitCode: first.ok === false ? 1 : 0,
          ask: first.ask,
          task: {
            state: first.ask.reason === "stuck" ? "failed" : "blocked",
            verified: false,
            verifySkipped: true,
            attempts: 1,
            cancelled: false,
          },
        };
      }
      return { ok: true, sessionId: input.sessionId, summary: `ANSWERED_${calls.length}`, exitCode: 0 };
    },
  };
  return { agent, calls };
}

async function bridgeWith(
  agent: AgentClient,
  opts: { editMessage?: boolean; failPost?: (content: string) => boolean } = {},
) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const replies: Reply[] = [];
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: "chan-1",
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: join(mkdtempSync(join(tmpdir(), "corvidinho-slash-choose-")), "none.toml"),
      CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
    },
    projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-slash-choose-proj-")),
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound:
      opts.editMessage === false
        ? { sendEmbed: outbound.sendEmbed, editEmbed: outbound.editEmbed }
        : outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent,
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      handlers.reply = async (p) => {
        if (opts.failPost?.(p.content)) return null;
        replies.push(p);
        return { messageId: `bot_${replies.length}` };
      };
      return createNullGateway();
    },
  });
  if (!result.ok || !box.handlers) throw new Error("bridge did not start");
  return { result, handlers: box.handlers, outbound, replies };
}

function slashInteraction(
  commandName: "work" | "session",
  options: Record<string, string>,
  replyMessageId?: string,
) {
  const edits: SlashReplyPayload[] = [];
  const state = { deleted: 0 };
  const ix: SlashInteraction = {
    id: `ix_${commandName}_${Math.random()}`,
    commandName,
    ...(commandName === "session" ? { subcommand: "start" } : {}),
    channelId: "chan-1",
    userId: REQUESTER,
    options,
    reply: async (p) => void edits.push(p),
    deferReply: async () => {},
    editReply: async (p) => {
      edits.push(p);
      return replyMessageId ? { messageId: replyMessageId } : undefined;
    },
    deleteReply: async () => {
      state.deleted += 1;
    },
  };
  return { ix, edits, state };
}

/** A requester press on a button; collects the ephemeral replies. */
function press(customId: string, messageId: string, userId = REQUESTER) {
  const eph: Array<Parameters<ComponentInteraction["reply"]>[0]> = [];
  const ix: ComponentInteraction = {
    id: `press_${Math.random()}`,
    customId,
    channelId: "chan-1",
    userId,
    messageId,
    reply: async (p) => void eph.push(p),
    deleteReply: async () => {},
  };
  return { ix, eph };
}

type Bridge = Awaited<ReturnType<typeof bridgeWith>>;

/** The collapsed slash answer (the thinking message edited in place). */
function collapsedAnswer(bridge: Bridge, needle: string) {
  const answer = bridge.outbound.contentEdits.find(
    (e) => typeof e.content === "string" && e.content.includes(needle),
  );
  if (!answer) throw new Error(`no collapsed slash answer with ${needle}`);
  return answer;
}

describe("buttonAskFor (DISCORD-ASK-1/4)", () => {
  test("structured options → pending ask with those options, a Choose stub without the question, one Choose button", () => {
    const b = buttonAskFor({ ask: OPTIONS_ASK, requesterDiscordId: REQUESTER });
    expect(b).not.toBeNull();
    expect(b!.pending.options).toEqual(OPTIONS_ASK.options);
    expect(b!.pending.question).toBe(OPTIONS_ASK.question);
    expect(b!.stub.content).toContain(ASK_STUB_HINT);
    expect(b!.stub.content).not.toContain("Postgres");
    expect(b!.stub.mentionUserIds).toEqual([REQUESTER]);
    expect(b!.components).toEqual(buildOpenStubComponents(b!.pending.askId));
  });

  test("a numbered list in the question is listable", () => {
    const b = buttonAskFor({ ask: NUMBERED_ASK, requesterDiscordId: REQUESTER });
    expect(b!.pending.options!.map((o) => o.label)).toEqual(["Postgres", "SQLite"]);
  });

  test("no listable options, or a spend-cap stop → null (free text stays)", () => {
    expect(buttonAskFor({ ask: { reason: "clarify", question: "Postgres or SQLite?" } })).toBeNull();
    expect(buttonAskFor({ ask: { ...OPTIONS_ASK, reason: "spend-cap" } })).toBeNull();
  });
});

describe("/work and /session start ask with Choose buttons when the options can be listed (DISCORD-ASK-1/4, REQ-discord-044)", () => {
  test("/work clarify ask with options: the answer is the Choose stub, the pending ask keeps its options, and a pick resumes the session in the stub", async () => {
    const { agent, calls } = askingAgent({ ask: OPTIONS_ASK, summary: "Needs your input: Postgres or SQLite?" });
    const bridge = await bridgeWith(agent);
    const { ix, state } = slashInteraction("work", { description: "pick a DB" });
    await bridge.handlers.onSlash!(ix);
    if (!bridge.result.ok) throw new Error("bridge did not start");

    // One public answer: the collapsed stub (deferred reply dropped, ASK-7).
    const answer = collapsedAnswer(bridge, ASK_STUB_HINT);
    expect(state.deleted).toBe(1);
    expect(answer.content).toContain("(blocked)");
    expect(answer.content).toContain(`<@${REQUESTER}>`);
    // DISCORD-ASK-1/2: no public MCQ — the question and options stay off the stub.
    expect(answer.content).not.toContain("Postgres or SQLite?");
    expect(answer.content).not.toContain("SQLite");
    expect(answer.content).not.toContain(ASK_REPLY_HINT);
    const session = bridge.result.store.getByBotMessage(answer.messageId)!;
    expect(session.id).toBe(calls[0]!.sessionId);
    const pending = session.pendingAsk!;
    expect(pending).toMatchObject(OPTIONS_ASK);
    expect(pending.stubMessageId).toBe(answer.messageId);
    expect(answer.components).toEqual(buildOpenStubComponents(pending.askId));
    expect(bridge.result.workStore.list()[0]!.status).toBe("blocked");
    // The edit does not notify: one fresh ping for the requester (REQ-discord-215).
    expect(bridge.replies).toHaveLength(1);
    expect(bridge.replies[0]!.content).toBe(`<@${REQUESTER}> ${COLLAPSED_PING_QUESTION}`);

    // Choose → ephemeral question + option buttons for the requester only.
    const open = press(openCustomId(pending.askId), answer.messageId);
    await bridge.handlers.onComponent!(open.ix);
    expect(open.eph).toHaveLength(1);
    expect(open.eph[0]!.ephemeral).toBe(true);
    expect(open.eph[0]!.content).toContain("Postgres or SQLite?");
    expect(JSON.stringify(open.eph[0]!.components)).toContain(pickCustomId(pending.askId, "pg"));

    // Pick → the same session resumes with the chosen label; the stub becomes the answer.
    const pick = press(pickCustomId(pending.askId, "pg"), "ephemeral_msg");
    await bridge.handlers.onComponent!(pick.ix);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.sessionId).toBe(calls[0]!.sessionId);
    expect(calls[1]!.resume).toBe(true);
    expect(calls[1]!.humanText).toBe("Postgres");
    expect(calls[1]!.prompt).toContain("Postgres or SQLite?");
    expect(bridge.result.store.getByBotMessage(answer.messageId)!.pendingAsk ?? null).toBeNull();
    const resumed = bridge.outbound.contentEdits.find(
      (e) => typeof e.content === "string" && e.content.includes("ANSWERED_2"),
    );
    expect(resumed!.messageId).toBe(answer.messageId);
    await bridge.result.stop();
  });

  test("/session start with a numbered list in the question: Choose stub and a pending ask with the parsed options", async () => {
    const { agent, calls } = askingAgent({ ask: NUMBERED_ASK, summary: "Needs your input" });
    const bridge = await bridgeWith(agent);
    const { ix } = slashInteraction("session", { topic: "storage" });
    await bridge.handlers.onSlash!(ix);
    const answer = collapsedAnswer(bridge, ASK_STUB_HINT);
    expect(answer.content).toContain("started.");
    expect(answer.content).not.toContain("1. Postgres");
    const pending = bridge.result.store.getByBotMessage(answer.messageId)!.pendingAsk!;
    expect(pending.options!.map((o) => o.label)).toEqual(["Postgres", "SQLite"]);
    expect(pending.stubMessageId).toBe(answer.messageId);
    expect(answer.components).toEqual(buildOpenStubComponents(pending.askId));

    const pick = press(pickCustomId(pending.askId, "2"), "ephemeral_msg");
    await bridge.handlers.onComponent!(pick.ix);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.sessionId).toBe(calls[0]!.sessionId);
    expect(calls[1]!.humanText).toBe("SQLite");
    await bridge.result.stop();
  });

  test("a thin reply to the slash stub restates it with the Choose button; a substantive reply continues without clearing the button ask", async () => {
    const { agent, calls } = askingAgent({ ask: OPTIONS_ASK, summary: "Needs your input" });
    const bridge = await bridgeWith(agent);
    const { ix } = slashInteraction("session", { topic: "storage" });
    await bridge.handlers.onSlash!(ix);
    const answer = collapsedAnswer(bridge, ASK_STUB_HINT);
    const askId = bridge.result.store.getByBotMessage(answer.messageId)!.pendingAsk!.askId;
    bridge.replies.length = 0;
    const reply = (content: string) => ({
      id: `m_${Math.random()}`,
      channelId: "chan-1",
      authorId: REQUESTER,
      authorBot: false,
      content,
      mentionedBot: false,
      referencedMessageId: answer.messageId,
    });
    await bridge.handlers.onMessage(reply("ok"));
    expect(calls).toHaveLength(1);
    expect(bridge.replies[0]!.content).toContain(ASK_STUB_HINT);
    expect(bridge.replies[0]!.components).toEqual(buildOpenStubComponents(askId));
    // SESSION-MULTI-3: a button ask survives ordinary chat.
    await bridge.handlers.onMessage(reply("also, keep it small"));
    expect(calls).toHaveLength(2);
    expect(calls[1]!.sessionId).toBe(calls[0]!.sessionId);
    expect(bridge.result.store.getByBotMessage(answer.messageId)!.pendingAsk!.askId).toBe(askId);
    await bridge.result.stop();
  });

  test("/work stuck ask with options: failed task, Choose stub that pings nobody, owner told by the separate notice", async () => {
    const { agent, calls } = askingAgent({
      ask: STUCK_OPTIONS_ASK,
      summary: "verify failed after 3 attempts",
      ok: false,
    });
    const bridge = await bridgeWith(agent);
    const { ix } = slashInteraction("work", { description: "migrate db" });
    await bridge.handlers.onSlash!(ix);
    if (!bridge.result.ok) throw new Error("bridge did not start");
    expect(bridge.result.workStore.list()[0]!.status).toBe("failed");
    const answer = collapsedAnswer(bridge, ASK_STUB_HINT);
    expect(answer.content).toContain("I'm stuck");
    expect(answer.content).not.toContain("How should I proceed?");
    expect(answer.content).not.toContain(`<@${OWNER_ID}>`);
    const pending = bridge.result.store.getByBotMessage(answer.messageId)!.pendingAsk!;
    expect(pending).toMatchObject(STUCK_OPTIONS_ASK);
    expect(answer.components).toEqual(buildOpenStubComponents(pending.askId));
    expect(bridge.replies).toHaveLength(1);
    expect(bridge.replies[0]!.content).toContain(`<@${OWNER_ID}>`);
    expect(bridge.replies[0]!.mentionUserIds).toEqual([OWNER_ID]);

    const pick = press(pickCustomId(pending.askId, "revert"), "ephemeral_msg");
    await bridge.handlers.onComponent!(pick.ix);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.humanText).toBe("Revert it");
    await bridge.result.stop();
  });

  test("when the owner notice post fails, the notice rides the collapsed stub and the Choose button stays", async () => {
    const { agent } = askingAgent({ ask: STUCK_OPTIONS_ASK, summary: "verify failed", ok: false });
    const bridge = await bridgeWith(agent, { failPost: (c) => c.includes("is stuck and needs a human") });
    const { ix } = slashInteraction("work", { description: "migrate db" });
    await bridge.handlers.onSlash!(ix);
    const withNotice = collapsedAnswer(bridge, "is stuck and needs a human");
    expect(withNotice.content).toContain(ASK_STUB_HINT);
    const pending = bridge.result.store.getByBotMessage(withNotice.messageId)!.pendingAsk!;
    expect(withNotice.components).toEqual(buildOpenStubComponents(pending.askId));
    await bridge.result.stop();
  });

  test("fallback answer (no editMessage): the deferred reply carries the stub and its Choose button, and its id is the stub", async () => {
    const { agent, calls } = askingAgent({ ask: OPTIONS_ASK, summary: "Needs your input" });
    const bridge = await bridgeWith(agent, { editMessage: false });
    const { ix, edits } = slashInteraction("work", { description: "pick a DB" }, "reply_1");
    await bridge.handlers.onSlash!(ix);
    if (!bridge.result.ok) throw new Error("bridge did not start");
    const last = edits.at(-1)!;
    expect(last.content).toContain(ASK_STUB_HINT);
    expect(last.content).not.toContain("Postgres or SQLite?");
    const pending = bridge.result.store.list()[0]!.pendingAsk!;
    expect(pending.options).toEqual(OPTIONS_ASK.options);
    expect(pending.stubMessageId).toBe("reply_1");
    expect(last.components).toEqual(buildOpenStubComponents(pending.askId));
    expect(bridge.result.store.getByBotMessage("reply_1")!.id).toBe(calls[0]!.sessionId);
    await bridge.result.stop();
  });

  test("without listable options the slash answer stays free text (no Choose button), as before", async () => {
    const clarify: HumanAsk = { reason: "clarify", question: "Postgres or SQLite?" };
    const { agent } = askingAgent({ ask: clarify, summary: "Needs your input" });
    const bridge = await bridgeWith(agent);
    const { ix } = slashInteraction("work", { description: "pick a DB" });
    await bridge.handlers.onSlash!(ix);
    const answer = collapsedAnswer(bridge, "Postgres or SQLite?");
    expect(answer.content).not.toContain(ASK_STUB_HINT);
    expect(answer.components ?? null).toBeNull();
    const pending = bridge.result.store.getByBotMessage(answer.messageId)!.pendingAsk!;
    expect(pending).toMatchObject(clarify);
    expect(pending.options).toBeUndefined();
    await bridge.result.stop();
  });
});
