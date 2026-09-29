/**
 * DISCORD-ASK-4.a (REQ-discord-548): a free-text ask (its choices cannot be
 * listed) keeps the question in the short public stub with one "Answer"
 * button; the requester's press opens a private form (a modal, interaction
 * response type 9) with one paragraph input; the form's submit (interaction
 * type 5, MODAL_SUBMIT) passes the same channel, actor (deny lists),
 * mute/rate, not-yours and expiry gates as a button press, is scrubbed
 * (SAFE-6) and resumes the requester's session exactly as a reply that
 * answers the ask would, in the stub (DISCORD-ASK-7/8). A reply in the
 * channel still answers it. Refusals are ephemeral only (DISCORD-DENY).
 * Fixture only: fake gateway, injected agent, memory outbound, no token.
 */
import { describe, expect, test } from "bun:test";
import { Client, Events } from "discord.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ASK_QUESTION_MAX } from "../src/agent/ask.ts";
import type { HumanAsk } from "../src/agent/types.ts";
import type { AgentClient, AgentRunChatOpts } from "../src/discord/agent-client.ts";
import {
  ASK_ANSWER_ACK,
  ASK_ANSWER_INPUT_ID,
  ASK_ANSWER_LABEL,
  ASK_ANSWER_MAX,
  ASK_CHOICE_EXPIRED,
  DISCORD_MODAL_INPUT_MAX,
  answerAskFor,
  answerCustomId,
  buildAnswerModal,
  buildAnswerStubComponents,
  normalizeAskAnswer,
  openCustomId,
  parseAskCustomId,
  pickCustomId,
  type DiscordModal,
} from "../src/discord/ask-buttons.ts";
import { ASK_ANSWER_HINT, ASK_REPLY_HINT, formatAskReply } from "../src/discord/ask-ping.ts";
import { ASK_CANCELLED_ACK } from "../src/discord/thin-ack.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import {
  adaptComponent,
  adaptModalSubmit,
  createLiveGateway,
  createNullGateway,
  modalTextValues,
  type ComponentInteraction,
  type GatewayHandlers,
} from "../src/discord/gateway.ts";
import type { SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import {
  EPHEMERAL_SILENT_ACK,
  MUTED,
  RATE_LIMITED,
  type BridgeConfig,
  type InboundMessage,
} from "../src/discord/types.ts";
import { teamPeopleFile } from "./fixtures/team-people.ts";

const OWNER_ID = "111122223333444455";
const USER_ID = "222233334444555566";
const OTHER_ID = "333344445555666677";
const CHAN = "chan-on";
const QUESTION = "Which region should the new bucket live in, and why?";
const FREE_TEXT: HumanAsk = { reason: "clarify", question: QUESTION };
const PRIOR_BLOCK = `[Prior clarifying question you asked (the human is answering it now):\n${QUESTION}]`;

type Ephemeral = { content?: string; ephemeral?: boolean; update?: boolean; components?: unknown[] };

/**
 * Run n asks `askFor(n)` when given; else the first run asks `ask` (default
 * FREE_TEXT) and later runs finish with "DONE: <n>".
 */
async function askBridge(
  opts: { ask?: HumanAsk; env?: Record<string, string>; askFor?: (n: number) => HumanAsk | undefined } = {},
) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const replies: Array<{ channelId: string; content: string; components?: unknown[] }> = [];
  const calls: AgentRunChatOpts[] = [];
  const agent: AgentClient = {
    async runChat(o) {
      calls.push(o);
      const ask = opts.askFor ? opts.askFor(calls.length) : calls.length === 1 ? opts.ask ?? FREE_TEXT : undefined;
      if (ask) {
        return {
          ok: true,
          sessionId: o.sessionId,
          summary: "need input",
          exitCode: 0,
          ask,
          task: { verified: false, verifySkipped: true, state: "blocked" },
        };
      }
      return {
        ok: true,
        sessionId: o.sessionId,
        summary: `DONE: ${calls.length}`,
        exitCode: 0,
        task: { verified: true, verifySkipped: false, state: "done" },
      };
    },
  };
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: CHAN,
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      // Missing allowlist file: never read the operator's allowlist (ALLOW-4).
      CORVIDINHO_ALLOWLIST_FILE: join(mkdtempSync(join(tmpdir(), "corvidinho-ask4a-")), "none.toml"),
      CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
      ...opts.env,
    },
    // Temp non-git project: never create real worktrees/branches in this repo.
    projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-ask4a-proj-")),
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound: outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent,
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      handlers.reply = async (o) => {
        replies.push(o);
        return { messageId: `bot_${replies.length}` };
      };
      return createNullGateway();
    },
  });
  if (!result.ok || !box.handlers) throw new Error("bridge did not start");
  return { result, handlers: box.handlers, replies, calls, outbound };
}

type Bridge = Awaited<ReturnType<typeof askBridge>>;

function sent(b: Bridge): number {
  return (
    b.replies.length +
    b.outbound.sends.length +
    b.outbound.edits.length +
    b.outbound.contentEdits.length +
    b.outbound.deletes.length
  );
}

let seq = 0;
function mention(authorId: string): InboundMessage {
  seq += 1;
  return {
    id: `m_${seq}`,
    channelId: CHAN,
    authorId,
    authorBot: false,
    content: "<@bot> make me a bucket",
    mentionedBot: true,
  };
}

function replyTo(messageId: string, authorId: string, content: string): InboundMessage {
  seq += 1;
  return {
    id: `r_${seq}`,
    channelId: CHAN,
    authorId,
    authorBot: false,
    content,
    mentionedBot: false,
    referencedMessageId: messageId,
  };
}

type Recorder = { eph: Ephemeral[]; modals: DiscordModal[]; deleted: number };
function recorder(): Recorder {
  return { eph: [], modals: [], deleted: 0 };
}

/** A press of the stub's Answer button (a live press can open a modal). */
function answerPress(askId: string, userId: string, rec: Recorder, over: Partial<ComponentInteraction> = {}): ComponentInteraction {
  seq += 1;
  return {
    id: `ix_${seq}`,
    customId: openCustomId(askId),
    channelId: CHAN,
    userId,
    reply: async (o) => {
      rec.eph.push(o);
    },
    showModal: async (m) => {
      rec.modals.push(m);
    },
    deleteReply: async () => {
      rec.deleted += 1;
    },
    ...over,
  };
}

/** The Answer form's submit (MODAL_SUBMIT) with `text` in its one input. */
function submit(askId: string, userId: string, text: string, rec: Recorder, over: Partial<ComponentInteraction> = {}): ComponentInteraction {
  seq += 1;
  return {
    id: `ix_${seq}`,
    customId: answerCustomId(askId),
    channelId: CHAN,
    userId,
    modalValues: { [ASK_ANSWER_INPUT_ID]: text },
    reply: async (o) => {
      rec.eph.push(o);
    },
    deleteReply: async () => {
      rec.deleted += 1;
    },
    ...over,
  };
}

/** `userId` @mentions and gets a pending free-text ask with its Answer stub. */
async function withFreeTextAsk(userId = USER_ID, env: Record<string, string> = {}) {
  const b = await askBridge({ env });
  await b.handlers.onMessage(mention(userId));
  const pending = b.result.store.list()[0]?.pendingAsk;
  if (!pending || pending.options?.length) throw new Error("no free-text ask");
  expect(b.calls).toHaveLength(1);
  return { ...b, askId: pending.askId, stubId: pending.stubMessageId! };
}

function pendingAskId(b: Bridge): string | undefined {
  return b.result.store.list()[0]?.pendingAsk?.askId;
}

/** A refused submit or press: one ephemeral ack, no run, nothing posted, ask kept. */
function expectRefused(b: Bridge & { askId: string }, before: number, rec: Recorder, content: string): void {
  expect(b.calls).toHaveLength(1);
  expect(sent(b)).toBe(before);
  expect(rec.modals).toHaveLength(0);
  expect(rec.eph).toEqual([{ content, ephemeral: true }]);
  expect(pendingAskId(b)).toBe(b.askId);
}

describe("free-text ask stub: question + one Answer button (DISCORD-ASK-4.a)", () => {
  test("the public stub quotes the question, says a reply still works and carries exactly one Answer button; the ask is free text with the stub id", async () => {
    const b = await withFreeTextAsk();
    const stub = b.outbound.contentEdits.find((e) => e.messageId === b.stubId && typeof e.content === "string");
    expect(stub).toBeDefined();
    expect(String(stub!.content)).toContain(`> ${QUESTION}`);
    expect(String(stub!.content)).toContain(ASK_ANSWER_HINT);
    expect(String(stub!.content)).toContain(`<@${USER_ID}>`);
    expect(stub!.components).toEqual(buildAnswerStubComponents(b.askId));
    expect(stub!.components).toEqual([
      { type: 1, components: [{ type: 2, style: 1, label: ASK_ANSWER_LABEL, custom_id: openCustomId(b.askId) }] },
    ]);
    // DISCORD-3.a / DISCORD-15: still the turn's answer — footer-only embed kept.
    expect(stub!.embed).not.toBeNull();
    const pending = b.result.store.list()[0]!.pendingAsk!;
    expect(pending).toMatchObject(FREE_TEXT);
    expect(pending.options).toBeUndefined();
    await b.result.stop();
  });

  test("a spend-cap stop gets no Answer button and is never pending (SAFE-8)", async () => {
    const b = await askBridge({ ask: { reason: "spend-cap", question: "Daily cap reached." } });
    await b.handlers.onMessage(mention(USER_ID));
    const withButtons = b.outbound.contentEdits.filter((e) => Array.isArray(e.components) && e.components.length);
    expect(withButtons).toHaveLength(0);
    expect(b.result.store.list()[0]?.pendingAsk ?? null).toBeNull();
    await b.result.stop();
  });

  test("a Choose ask (listable options) keeps its Choose stub, not the Answer button", () => {
    expect(
      answerAskFor({ ask: { reason: "clarify", question: "DB?", options: [{ id: "1", label: "A" }, { id: "2", label: "B" }] } }),
    ).toBeNull();
    expect(answerAskFor({ ask: { reason: "clarify", question: "Pick:\n1. A\n2. B" } })).toBeNull();
    expect(answerAskFor({ ask: { reason: "spend-cap", question: "cap" } })).toBeNull();
    // A lone option is not a list: free text, the option dropped.
    const lone = answerAskFor({ ask: { reason: "stuck", question: "Now what?", options: [{ id: "1", label: "A" }] } })!;
    expect(lone.pending).toMatchObject({ reason: "stuck", question: "Now what?" });
    expect(lone.pending.options).toBeUndefined();
    expect(lone.components).toEqual(buildAnswerStubComponents(lone.pending.askId));
  });

  test("formatAskReply: the Answer hint replaces the reply hint; never on a spend-cap stop", () => {
    const withButton = formatAskReply({ ask: FREE_TEXT, owner: null, requesterDiscordId: USER_ID, replyHint: true, answerButton: true });
    expect(withButton.content).toContain(ASK_ANSWER_HINT);
    expect(withButton.content).not.toContain(ASK_REPLY_HINT);
    const plain = formatAskReply({ ask: FREE_TEXT, owner: null, requesterDiscordId: USER_ID, replyHint: true });
    expect(plain.content).toContain(ASK_REPLY_HINT);
    expect(plain.content).not.toContain(ASK_ANSWER_HINT);
    const cap = formatAskReply({ ask: { reason: "spend-cap", question: "cap" }, owner: null, answerButton: true });
    expect(cap.content).not.toContain(ASK_ANSWER_HINT);
  });
});

describe("Answer press opens the private form (type 9 modal)", () => {
  test("the requester's press opens the modal: short title, one required paragraph input capped at ASK_QUESTION_MAX (≤ Discord's 4000); nothing posted, no run, ask kept", async () => {
    const b = await withFreeTextAsk();
    const before = sent(b);
    const rec = recorder();
    await b.handlers.onComponent!(answerPress(b.askId, USER_ID, rec, { messageId: b.stubId }));
    expect(rec.eph).toHaveLength(0);
    expect(rec.modals).toHaveLength(1);
    const modal = rec.modals[0]!;
    expect(modal).toEqual(buildAnswerModal({ askId: b.askId, question: QUESTION }));
    expect(modal.custom_id).toBe(answerCustomId(b.askId));
    expect(modal.title.length).toBeLessThanOrEqual(45);
    expect(modal.components).toHaveLength(1);
    const label = modal.components[0]!;
    expect(label.type).toBe(18);
    expect(label.label.length).toBeLessThanOrEqual(45);
    expect(label.description).toBe(QUESTION);
    expect(label.component).toEqual({
      type: 4,
      custom_id: ASK_ANSWER_INPUT_ID,
      style: 2,
      min_length: 1,
      max_length: ASK_ANSWER_MAX,
      required: true,
    });
    expect(ASK_ANSWER_MAX).toBe(Math.min(ASK_QUESTION_MAX, DISCORD_MODAL_INPUT_MAX));
    expect(ASK_ANSWER_MAX).toBeLessThanOrEqual(4000);
    expect(b.calls).toHaveLength(1);
    expect(sent(b)).toBe(before);
    expect(pendingAskId(b)).toBe(b.askId);
    await b.result.stop();
  });

  test("the form's input description is the scrubbed start of the question, one line, ≤100 chars", () => {
    const secret = `sk-ant-${"a".repeat(30)}`;
    const long = `Use key ${secret}?\n${"x".repeat(300)}`;
    const modal = buildAnswerModal({ askId: "a1", question: long });
    const d = modal.components[0]!.description!;
    expect(d.length).toBeLessThanOrEqual(100);
    expect(d).not.toContain(secret);
    expect(d).not.toContain("\n");
  });

  test("another user's press gets the not-for-you reply and no form", async () => {
    const b = await withFreeTextAsk();
    const before = sent(b);
    const rec = recorder();
    await b.handlers.onComponent!(answerPress(b.askId, OTHER_ID, rec));
    expect(rec.modals).toHaveLength(0);
    expect(rec.eph).toHaveLength(1);
    expect(rec.eph[0]!.ephemeral).toBe(true);
    expect(String(rec.eph[0]!.content).toLowerCase()).toContain("isn’t for you");
    expect(sent(b)).toBe(before);
    expect(pendingAskId(b)).toBe(b.askId);
    await b.result.stop();
  });
});

describe("Answer form submit resumes the requester's session like a reply", () => {
  test("submit → same session resumed with the reply's prior-question block, ephemeral ack then dropped, stub thin-updated into the answer, ask cleared; a second submit is a no-op", async () => {
    const b = await withFreeTextAsk();
    const rec = recorder();
    await b.handlers.onComponent!(submit(b.askId, USER_ID, "  eu-west-1, close to users  ", rec, { messageId: b.stubId }));
    expect(b.calls).toHaveLength(2);
    const run = b.calls[1]!;
    expect(run.sessionId).toBe(b.calls[0]!.sessionId);
    expect(run.resume).toBe(true);
    expect(run.actingUserId).toBe(USER_ID);
    expect(run.humanText).toBe("eu-west-1, close to users");
    expect(run.prompt).toContain(`${PRIOR_BLOCK}\n\nHuman answer:\neu-west-1, close to users`);
    // Ephemeral "Got it" only; dropped once the resume finished (DISCORD-ASK-8).
    expect(rec.eph).toEqual([{ content: ASK_ANSWER_ACK, ephemeral: true }]);
    expect(rec.deleted).toBe(1);
    // DISCORD-ASK-7: the stub is the progress surface (content and button
    // cleared) and becomes the answer; no extra public reply with the answer.
    const stubEdits = b.outbound.contentEdits.filter((e) => e.messageId === b.stubId);
    expect(stubEdits.some((e) => e.content === null && e.components === null)).toBe(true);
    expect(stubEdits.at(-1)!.content).toContain("DONE: 2");
    expect(b.replies.some((r) => r.content.includes("DONE: 2"))).toBe(false);
    // The typed answer is never posted publicly.
    expect(b.replies.some((r) => r.content.includes("eu-west-1"))).toBe(false);
    expect(b.outbound.contentEdits.some((e) => String(e.content ?? "").includes("eu-west-1"))).toBe(false);
    expect(b.result.store.list()[0]!.pendingAsk ?? null).toBeNull();
    // AGENT-6: the answer joined the session thread.
    const thread = b.result.store.threadFor(b.result.store.list()[0]!);
    expect(thread.some((t) => t.role === "human" && t.content === "eu-west-1, close to users")).toBe(true);

    const again = recorder();
    await b.handlers.onComponent!(submit(b.askId, USER_ID, "second answer", again));
    expect(b.calls).toHaveLength(2);
    expect(String(again.eph[0]?.content).toLowerCase()).toContain("already answered");
    await b.result.stop();
  });

  test("the submitted text is scrubbed (SAFE-6) before the run and the thread see it", async () => {
    const b = await withFreeTextAsk();
    const secret = `sk-ant-${"b".repeat(32)}`;
    const rec = recorder();
    await b.handlers.onComponent!(submit(b.askId, USER_ID, `use ${secret} please`, rec));
    expect(b.calls).toHaveLength(2);
    expect(b.calls[1]!.prompt).not.toContain(secret);
    expect(b.calls[1]!.humanText).not.toContain(secret);
    expect(b.calls[1]!.prompt).toContain("[redacted:anthropic-key]");
    const thread = b.result.store.threadFor(b.result.store.list()[0]!);
    expect(thread.some((t) => t.content.includes(secret))).toBe(false);
    await b.result.stop();
  });

  test("normalizeAskAnswer: scrubbed, control characters dropped, trimmed, cut at ASK_ANSWER_MAX; empty or not text ⇒ empty", () => {
    expect(normalizeAskAnswer("  hi\u0007 there  ")).toBe("hi there");
    const long = normalizeAskAnswer("y".repeat(ASK_ANSWER_MAX + 500));
    expect(long.length).toBe(ASK_ANSWER_MAX);
    expect(long.endsWith("…")).toBe(true);
    expect(normalizeAskAnswer("   ")).toBe("");
    expect(normalizeAskAnswer(undefined)).toBe("");
    expect(normalizeAskAnswer(42)).toBe("");
    expect(normalizeAskAnswer(`k=sk-ant-${"c".repeat(30)}`)).not.toContain("c".repeat(30));
  });

  test("a thin or blank submit is not an answer (AUTONOMY-5): the question is restated privately with the Answer button, no run, nothing posted, ask kept", async () => {
    const b = await withFreeTextAsk();
    const before = sent(b);
    for (const text of ["ok", "  \n ", "👍", "sure!"]) {
      const rec = recorder();
      await b.handlers.onComponent!(submit(b.askId, USER_ID, text, rec, { messageId: b.stubId }));
      expect(rec.eph).toHaveLength(1);
      const eph = rec.eph[0]!;
      expect(eph.ephemeral).toBe(true);
      expect(String(eph.content)).toContain(`> ${QUESTION}`);
      expect(String(eph.content)).toContain(ASK_ANSWER_HINT);
      expect(eph.components).toEqual(buildAnswerStubComponents(b.askId));
      expect(rec.deleted).toBe(0);
    }
    expect(b.calls).toHaveLength(1);
    expect(sent(b)).toBe(before);
    expect(pendingAskId(b)).toBe(b.askId);
    // The thin text never joins the session thread.
    const thread = b.result.store.threadFor(b.result.store.list()[0]!);
    expect(thread.some((t) => t.role === "human" && t.content === "ok")).toBe(false);
    // A real answer afterwards still resumes the session.
    await b.handlers.onComponent!(submit(b.askId, USER_ID, "eu-west-1", recorder(), { messageId: b.stubId }));
    expect(b.calls).toHaveLength(2);
    expect(b.calls[1]!.prompt).toContain(`${PRIOR_BLOCK}\n\nHuman answer:\neu-west-1`);
    await b.result.stop();
  });

  test("an explicit cancel typed in the form drops the session's open asks like a cancel reply (AUTONOMY-6): private ack, no run, nothing posted", async () => {
    const b = await withFreeTextAsk();
    const before = sent(b);
    const rec = recorder();
    await b.handlers.onComponent!(submit(b.askId, USER_ID, " never mind ", rec, { messageId: b.stubId }));
    expect(rec.eph).toEqual([{ content: ASK_CANCELLED_ACK, ephemeral: true }]);
    expect(b.calls).toHaveLength(1);
    expect(sent(b)).toBe(before);
    expect(b.result.store.list()[0]!.pendingAsk ?? null).toBeNull();
    // The Answer button and the form are then "already answered", as after a
    // cancel reply; a later message runs as ordinary chat.
    const again = recorder();
    await b.handlers.onComponent!(answerPress(b.askId, USER_ID, again));
    expect(again.modals).toHaveLength(0);
    expect(String(again.eph[0]?.content).toLowerCase()).toContain("already answered");
    await b.handlers.onMessage(replyTo(b.stubId, USER_ID, "us-east-2 then"));
    expect(b.calls).toHaveLength(2);
    expect(b.calls[1]!.prompt).not.toContain(PRIOR_BLOCK);
    await b.result.stop();
  });

  test("a cancel in the form also drops an earlier open Choose ask of the session, as a cancel reply does (SESSION-MULTI-3)", async () => {
    const b = await askBridge({
      askFor: (n) =>
        n === 1
          ? { reason: "clarify", question: "Which DB?", options: [{ id: "1", label: "Postgres" }, { id: "2", label: "SQLite" }] }
          : n === 2
            ? FREE_TEXT
            : undefined,
    });
    await b.handlers.onMessage(mention(USER_ID));
    const choose = pendingAskId(b)!;
    // Chat continues while the Choose buttons stay open; the run asks again in free text.
    await b.handlers.onMessage(replyTo(b.result.store.list()[0]!.pendingAsk!.stubMessageId!, USER_ID, "also make a bucket"));
    const session = b.result.store.list()[0]!;
    const free = session.pendingAsk!;
    expect(free.options).toBeUndefined();
    expect(session.openAsks?.map((a) => a.askId)).toEqual([choose]);
    const rec = recorder();
    await b.handlers.onComponent!(submit(free.askId, USER_ID, "cancel", rec));
    expect(rec.eph).toEqual([{ content: ASK_CANCELLED_ACK, ephemeral: true }]);
    expect(b.calls).toHaveLength(2);
    expect(b.result.store.list()[0]!.pendingAsk ?? null).toBeNull();
    expect(b.result.store.list()[0]!.openAsks).toBeUndefined();
    await b.result.stop();
  });

  test("a follow-up free-text ask from the resumed run gets its own Answer button in the same stub", async () => {
    const b = await askBridge({ askFor: (n) => ({ reason: "clarify", question: `Q${n}?` }) });
    await b.handlers.onMessage(mention(USER_ID));
    const first = b.result.store.list()[0]!.pendingAsk!;
    await b.handlers.onComponent!(submit(first.askId, USER_ID, "answer one", recorder(), { messageId: first.stubMessageId }));
    expect(b.calls).toHaveLength(2);
    expect(b.calls[1]!.prompt).toContain("Human answer:\nanswer one");
    const next = b.result.store.list()[0]!.pendingAsk!;
    expect(next.askId).not.toBe(first.askId);
    expect(next.question).toBe("Q2?");
    expect(next.stubMessageId).toBe(first.stubMessageId);
    const lastEdit = b.outbound.contentEdits.filter((e) => e.messageId === first.stubMessageId).at(-1)!;
    expect(String(lastEdit.content)).toContain("Q2?");
    expect(lastEdit.components).toEqual(buildAnswerStubComponents(next.askId));
    await b.result.stop();
  });
});

describe("Answer press and submit pass the same gates as a button press (DISCORD-DENY / DISCORD-6 / DISCORD-ASK-5)", () => {
  test("another user's submit: not-for-you, no run, the requester's ask kept", async () => {
    const b = await withFreeTextAsk();
    const before = sent(b);
    const rec = recorder();
    await b.handlers.onComponent!(submit(b.askId, OTHER_ID, "hijack", rec));
    expect(b.calls).toHaveLength(1);
    expect(sent(b)).toBe(before);
    expect(rec.eph).toHaveLength(1);
    expect(rec.eph[0]!.ephemeral).toBe(true);
    expect(String(rec.eph[0]!.content).toLowerCase()).toContain("isn’t for you");
    expect(pendingAskId(b)).toBe(b.askId);
    await b.result.stop();
  });

  test("muted requester: press and submit get ephemeral MUTED, no form, no run; once unmuted the same form resumes", async () => {
    const b = await withFreeTextAsk();
    b.result.muteUser(USER_ID);
    const before = sent(b);
    const pressRec = recorder();
    await b.handlers.onComponent!(answerPress(b.askId, USER_ID, pressRec));
    expectRefused(b, before, pressRec, MUTED);
    const subRec = recorder();
    await b.handlers.onComponent!(submit(b.askId, USER_ID, "eu-west-1", subRec));
    expectRefused(b, before, subRec, MUTED);
    b.result.unmuteUser(USER_ID);
    await b.handlers.onComponent!(submit(b.askId, USER_ID, "eu-west-1", recorder()));
    expect(b.calls).toHaveLength(2);
    expect(b.calls[1]!.prompt).toContain("Human answer:\neu-west-1");
    await b.result.stop();
  });

  test("deny-listed requester (user or role): press and submit get only the zero-width ack", async () => {
    const b = await withFreeTextAsk();
    const before = sent(b);
    b.result.config.allowlist.discord.denyUsers = [USER_ID];
    const p1 = recorder();
    await b.handlers.onComponent!(answerPress(b.askId, USER_ID, p1));
    expectRefused(b, before, p1, EPHEMERAL_SILENT_ACK);
    const s1 = recorder();
    await b.handlers.onComponent!(submit(b.askId, USER_ID, "eu-west-1", s1));
    expectRefused(b, before, s1, EPHEMERAL_SILENT_ACK);
    b.result.config.allowlist.discord.denyUsers = [];
    b.result.config.allowlist.discord.denyRoles = ["role-bad"];
    const s2 = recorder();
    await b.handlers.onComponent!(submit(b.askId, USER_ID, "eu-west-1", s2, { roleIds: ["role-bad"] }));
    expectRefused(b, before, s2, EPHEMERAL_SILENT_ACK);
    await b.result.stop();
  });

  test("a submit outside an allowlisted channel gets the zero-width ack for a non-admin", async () => {
    const b = await withFreeTextAsk();
    const before = sent(b);
    const rec = recorder();
    await b.handlers.onComponent!(submit(b.askId, USER_ID, "eu-west-1", rec, { channelId: "chan-off" }));
    expectRefused(b, before, rec, EPHEMERAL_SILENT_ACK);
    await b.result.stop();
  });

  test("rate limited: the submit shares the chat budget and gets ephemeral RATE_LIMITED", async () => {
    const b = await withFreeTextAsk(USER_ID, { DISCORD_RATE_LIMIT_MAX: "1" });
    const before = sent(b);
    const rec = recorder();
    await b.handlers.onComponent!(submit(b.askId, USER_ID, "eu-west-1", rec));
    expectRefused(b, before, rec, RATE_LIMITED);
    await b.result.stop();
  });

  test("past the ~30 min timeout: press and submit get 'that choice expired', no form, no run; the ask stays so a reply still answers it", async () => {
    const b = await withFreeTextAsk();
    b.result.store.list()[0]!.pendingAsk!.expiresAt = Date.now() - 1;
    const before = sent(b);
    const p = recorder();
    await b.handlers.onComponent!(answerPress(b.askId, USER_ID, p));
    expectRefused(b, before, p, ASK_CHOICE_EXPIRED);
    const s = recorder();
    await b.handlers.onComponent!(submit(b.askId, USER_ID, "eu-west-1", s));
    expectRefused(b, before, s, ASK_CHOICE_EXPIRED);
    // A thin reply restates it without a dead Answer button (reply hint only).
    await b.handlers.onMessage(replyTo(b.stubId, USER_ID, "ok"));
    const restated = b.replies.at(-1)!;
    expect(restated.content).toContain(ASK_REPLY_HINT);
    expect(restated.components).toBeUndefined();
    expect(b.calls).toHaveLength(1);
    // A substantive reply still answers it with the prior-question block.
    await b.handlers.onMessage(replyTo(b.stubId, USER_ID, "us-east-2"));
    expect(b.calls).toHaveLength(2);
    expect(b.calls[1]!.prompt).toContain(PRIOR_BLOCK);
    // SAFE-12: a non-owner's channel reply is fenced as untrusted data.
    expect(b.calls[1]!.prompt).toMatch(
      /Human answer:\n\[untrusted message from the acting user \(role: community\)[^\n]*\n<<<UNTRUSTED_DATA id=[0-9a-f]+ source=chat-message>>>\nus-east-2\n<<<END_UNTRUSTED_DATA/,
    );
    expect(b.result.store.list()[0]!.pendingAsk ?? null).toBeNull();
    await b.result.stop();
  });

  test("a mix-up is ignored: the form id without typed text, or a press id with typed text, gets no reply and runs nothing", async () => {
    const b = await withFreeTextAsk();
    const before = sent(b);
    const rec = recorder();
    await b.handlers.onComponent!(answerPress(b.askId, USER_ID, rec, { customId: answerCustomId(b.askId) }));
    await b.handlers.onComponent!(submit(b.askId, USER_ID, "x", rec, { customId: openCustomId(b.askId) }));
    await b.handlers.onComponent!(submit(b.askId, USER_ID, "x", rec, { customId: pickCustomId(b.askId, "1") }));
    expect(rec.eph).toHaveLength(0);
    expect(rec.modals).toHaveLength(0);
    expect(b.calls).toHaveLength(1);
    expect(sent(b)).toBe(before);
    expect(pendingAskId(b)).toBe(b.askId);
    await b.result.stop();
  });

  test("a Choose ask is answered by its buttons: a form submit on it is refused, no run", async () => {
    const b = await askBridge({
      ask: { reason: "clarify", question: "Which DB?", options: [{ id: "1", label: "Postgres" }, { id: "2", label: "SQLite" }] },
    });
    await b.handlers.onMessage(mention(USER_ID));
    const askId = pendingAskId(b)!;
    const rec = recorder();
    await b.handlers.onComponent!(submit(askId, USER_ID, "MySQL", rec));
    expect(b.calls).toHaveLength(1);
    expect(rec.eph).toHaveLength(1);
    expect(String(rec.eph[0]!.content).toLowerCase()).toContain("isn’t for you");
    expect(pendingAskId(b)).toBe(askId);
    await b.result.stop();
  });
});

describe("replying in the channel still works (DISCORD-ASK-4.a)", () => {
  test("a reply answers the free-text ask as before; the Answer button then says it was already answered", async () => {
    const b = await withFreeTextAsk();
    await b.handlers.onMessage(replyTo(b.stubId, USER_ID, "us-east-2"));
    expect(b.calls).toHaveLength(2);
    expect(b.calls[1]!.prompt).toContain(PRIOR_BLOCK);
    // SAFE-12: a non-owner's channel reply is fenced as untrusted data.
    expect(b.calls[1]!.prompt).toMatch(
      /Human answer:\n\[untrusted message from the acting user \(role: community\)[^\n]*\n<<<UNTRUSTED_DATA id=[0-9a-f]+ source=chat-message>>>\nus-east-2\n<<<END_UNTRUSTED_DATA/,
    );
    expect(b.result.store.list()[0]!.pendingAsk ?? null).toBeNull();
    const rec = recorder();
    await b.handlers.onComponent!(answerPress(b.askId, USER_ID, rec));
    expect(rec.modals).toHaveLength(0);
    expect(String(rec.eph[0]?.content).toLowerCase()).toContain("already answered");
    const late = recorder();
    await b.handlers.onComponent!(submit(b.askId, USER_ID, "too late", late));
    expect(b.calls).toHaveLength(2);
    expect(String(late.eph[0]?.content).toLowerCase()).toContain("already answered");
    await b.result.stop();
  });

  test("a thin reply restates the free-text ask with its live Answer button and runs nothing", async () => {
    const b = await withFreeTextAsk();
    await b.handlers.onMessage(replyTo(b.stubId, USER_ID, "ok"));
    expect(b.calls).toHaveLength(1);
    const restated = b.replies.at(-1)!;
    expect(restated.content).toContain(`> ${QUESTION}`);
    expect(restated.content).toContain(ASK_ANSWER_HINT);
    expect(restated.components).toEqual(buildAnswerStubComponents(b.askId));
    await b.result.stop();
  });
});

describe("/work free-text answer: Answer form resumes the slash session", () => {
  test("the /work answer carries the Answer button; its submit resumes that session in the answer message", async () => {
    // IDENTITY-11.a: the requester is declared team (community can't start /work).
    const b = await askBridge({ env: { CORVIDINHO_ALLOWLIST_FILE: teamPeopleFile(USER_ID) } });
    const replies: SlashReplyPayload[] = [];
    const ix: SlashInteraction = {
      id: "ix_work",
      commandName: "work",
      channelId: CHAN,
      userId: USER_ID,
      options: { description: "make me a bucket" },
      reply: async (p) => {
        replies.push(p);
      },
      deferReply: async () => {},
      editReply: async (p) => {
        replies.push(p);
        return { messageId: "work_answer" };
      },
      deleteReply: async () => {},
    };
    await b.handlers.onSlash!(ix);
    const session = b.result.store.list()[0]!;
    const pending = session.pendingAsk!;
    expect(pending.options).toBeUndefined();
    const answer = b.outbound.contentEdits.find((e) => String(e.content ?? "").includes(QUESTION))!;
    expect(answer.components).toEqual(buildAnswerStubComponents(pending.askId));
    expect(String(answer.content)).toContain(ASK_ANSWER_HINT);
    expect(pending.stubMessageId).toBe(answer.messageId);
    const rec = recorder();
    await b.handlers.onComponent!(answerPress(pending.askId, USER_ID, rec, { messageId: answer.messageId }));
    expect(rec.modals).toHaveLength(1);
    await b.handlers.onComponent!(submit(pending.askId, USER_ID, "eu-west-1", rec, { messageId: answer.messageId }));
    expect(b.calls).toHaveLength(2);
    expect(b.calls[1]!.sessionId).toBe(b.calls[0]!.sessionId);
    expect(b.calls[1]!.prompt).toContain(`${PRIOR_BLOCK}\n\nHuman answer:\neu-west-1`);
    expect(b.outbound.contentEdits.filter((e) => e.messageId === answer.messageId).at(-1)!.content).toContain("DONE: 2");
    await b.result.stop();
  });
});

describe("live gateway: modal open and MODAL_SUBMIT (DISCORD-ASK-4.a)", () => {
  test("parseAskCustomId reads the form id", () => {
    expect(parseAskCustomId(answerCustomId("abc123"))).toEqual({ kind: "answer", askId: "abc123" });
    expect(parseAskCustomId("cvask:answer:")).toBeNull();
  });

  test("adaptComponent.showModal sends the modal through discord.js showModal", async () => {
    const shown: unknown[] = [];
    const raw = {
      id: "ix1",
      customId: openCustomId("a1"),
      channelId: CHAN,
      guildId: null,
      user: { id: USER_ID },
      member: null,
      deferred: false,
      replied: false,
      reply: async () => {},
      update: async () => {},
      showModal: async function (this: unknown, m: unknown) {
        shown.push({ self: this === raw, m });
      },
    };
    const adapted = adaptComponent(raw);
    const modal = buildAnswerModal({ askId: "a1", question: QUESTION });
    await adapted.showModal!(modal);
    expect(shown).toEqual([{ self: true, m: modal }]);
    // No showModal on the raw interaction ⇒ none on the adapter.
    const { showModal: _drop, ...noModal } = raw;
    expect(adaptComponent(noModal).showModal).toBeUndefined();
  });

  test("adaptModalSubmit: text values by input id, ephemeral replies with no parsed mentions, stub message id", async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const fields = new Map<string, { type?: number; customId?: string; value?: unknown }>([
      [ASK_ANSWER_INPUT_ID, { type: 4, customId: ASK_ANSWER_INPUT_ID, value: "eu-west-1 @everyone" }],
      ["sel", { type: 3, customId: "sel", value: ["x"] }],
    ]);
    const adapted = adaptModalSubmit({
      id: "ix2",
      customId: answerCustomId("a1"),
      channelId: CHAN,
      guildId: "g1",
      user: { id: USER_ID, username: "req" },
      member: { roles: ["r1"] },
      message: { id: "stub_1" },
      fields: { fields },
      deferred: false,
      replied: false,
      reply: async (p) => {
        payloads.push(p as Record<string, unknown>);
      },
    });
    expect(adapted.modalValues).toEqual({ [ASK_ANSWER_INPUT_ID]: "eu-west-1 @everyone" });
    expect(adapted.messageId).toBe("stub_1");
    expect(adapted.roleIds).toEqual(["r1"]);
    expect(adapted.userUsername).toBe("req");
    expect(adapted.showModal).toBeUndefined();
    await adapted.reply({ content: "hi @everyone", ephemeral: true });
    expect(payloads[0]!.flags).toBe(64);
    expect(payloads[0]!.allowedMentions).toEqual({ parse: [] });
    expect(String(payloads[0]!.content)).not.toContain("@everyone");
    expect(modalTextValues(null)).toEqual({});
  });

  test("a MODAL_SUBMIT interaction reaches onComponent with its text", async () => {
    const realLogin = Client.prototype.login;
    let client: Client | null = null;
    Client.prototype.login = async function (this: Client, token?: string) {
      client = this;
      (this.ws as unknown as { connect: () => Promise<void> }).connect = async () => {};
      return realLogin.call(this, token);
    };
    const seen: ComponentInteraction[] = [];
    let gateway: Awaited<ReturnType<typeof createLiveGateway>> | null = null;
    try {
      gateway = await createLiveGateway(
        { token: "fixture-token-not-real", channelIds: [CHAN] } as unknown as BridgeConfig,
        { onMessage: () => {}, onComponent: (ix) => void seen.push(ix) },
        { version: "9.9.9" },
      );
      await gateway.start();
    } finally {
      Client.prototype.login = realLogin;
    }
    try {
      if (!client) throw new Error("login was not called");
      const raw = {
        id: "ix_modal",
        customId: answerCustomId("a9"),
        channelId: CHAN,
        guildId: null,
        user: { id: USER_ID },
        member: null,
        message: { id: "stub_9" },
        fields: { fields: new Map([[ASK_ANSWER_INPUT_ID, { type: 4, customId: ASK_ANSWER_INPUT_ID, value: "typed" }]]) },
        deferred: false,
        replied: false,
        isAutocomplete: () => false,
        isMessageComponent: () => false,
        isModalSubmit: () => true,
        isChatInputCommand: () => false,
        reply: async () => {},
      };
      (client as Client).emit(Events.InteractionCreate, raw as never);
      for (let i = 0; i < 20 && seen.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
      expect(seen).toHaveLength(1);
      expect(seen[0]!.customId).toBe(answerCustomId("a9"));
      expect(seen[0]!.modalValues).toEqual({ [ASK_ANSWER_INPUT_ID]: "typed" });
      expect(seen[0]!.messageId).toBe("stub_9");
    } finally {
      await gateway?.stop();
    }
  });
});
