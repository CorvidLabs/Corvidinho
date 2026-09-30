/**
 * DISCORD-ASK-1..5 — ephemeral Discord button asks.
 *
 * MessageCreate cannot post ephemeral content. Flow:
 * 1) Public stub with a single "Choose" button (no MCQ body).
 * 2) Requester press → ephemeral interaction reply with option buttons.
 * 3) Option press → resume that user's session; late press → expired ack.
 *
 * Pending asks with options are not cleared by ordinary chat (SESSION-MULTI-3);
 * only pick / cancel / expiry clears them.
 *
 * DISCORD-ASK-4.a — a free-text ask (choices that cannot be listed) keeps its
 * question in the public stub and gets one "Answer" button: the requester's
 * press opens a private form (modal, interaction response type 9) with one
 * paragraph input; its submit (interaction type 5) passes the same gates as a
 * press and resumes the session like a reply. A reply still answers it.
 */

import type { AskOption, HumanAsk } from "../agent/types.ts";
import { cleanAskLabel, resolveAskOptions } from "../agent/ask-options.ts";
import { ASK_QUESTION_MAX, normalizeQuestion } from "../agent/ask.ts";
import { defangMassMentions } from "./ask-ping.ts";
import { scrubSecrets } from "../store/scrub.ts";

/** Button prompts expire after ~30 minutes (DISCORD-ASK-5). */
export const ASK_BUTTON_TTL_MS = 30 * 60 * 1000;

export const ASK_CHOICE_EXPIRED = "that choice expired";

export const ASK_STUB_HINT = "Press **Choose** to answer privately.";

/** custom_id prefix — keep short (Discord custom_id ≤100). */
export const ASK_CUSTOM_PREFIX = "cvask";

/** DISCORD-ASK-4.a — the free-text stub's one button. */
export const ASK_ANSWER_LABEL = "Answer";

/** Discord's cap on a modal text input value. */
export const DISCORD_MODAL_INPUT_MAX = 4000;

/**
 * Longest private answer (chars): the ask-human question cap
 * (`ASK_QUESTION_MAX`), never past Discord's modal input cap. The form's
 * input is capped here and a submitted value is cut here too.
 */
export const ASK_ANSWER_MAX = Math.min(ASK_QUESTION_MAX, DISCORD_MODAL_INPUT_MAX);

/** Answer form title and input label (Discord caps both at 45). */
export const ASK_ANSWER_MODAL_TITLE = "Answer privately";
export const ASK_ANSWER_INPUT_LABEL = "Your answer";

/** Answer form input description cap (Discord: 100). */
export const ASK_ANSWER_DESCRIPTION_MAX = 100;

/** custom_id of the Answer form's one text input. */
export const ASK_ANSWER_INPUT_ID = "answer";

/** Ephemeral ack once a private answer is taken (dropped when the resume ends, DISCORD-ASK-8). */
export const ASK_ANSWER_ACK = "Got it — working on it…";

export type PendingAsk = HumanAsk & {
  /** Stable id embedded in button custom_ids. */
  askId: string;
  /** Epoch ms when buttons expire. */
  expiresAt: number;
  /** Public stub message id (Choose button), when posted. */
  stubMessageId?: string;
};

export type DiscordButton = {
  type: 2;
  style: number;
  label: string;
  custom_id: string;
  disabled?: boolean;
};

export type DiscordActionRow = {
  type: 1;
  components: DiscordButton[];
};

/**
 * Text input (component type 4) of a form: paragraph (style 2) for the ask
 * Answer form, short (style 1) for an Approve card's one-time code.
 */
export type DiscordTextInput = {
  type: 4;
  custom_id: string;
  style: 1 | 2;
  min_length: number;
  max_length: number;
  required: true;
};

/** Label (component type 18) around the form's one text input. */
export type DiscordModalLabel = {
  type: 18;
  label: string;
  description?: string;
  component: DiscordTextInput;
};

/** Modal payload (interaction response type 9 data). */
export type DiscordModal = {
  custom_id: string;
  title: string;
  components: DiscordModalLabel[];
};

export function newAskId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export function askExpiresAt(nowMs = Date.now()): number {
  return nowMs + ASK_BUTTON_TTL_MS;
}

export function isAskExpired(
  pending: Pick<PendingAsk, "expiresAt">,
  nowMs = Date.now(),
): boolean {
  return nowMs >= pending.expiresAt;
}

/** Build a PendingAsk from a HumanAsk that already has resolved options. */
export function toPendingAsk(
  ask: HumanAsk,
  opts?: { askId?: string; nowMs?: number },
): PendingAsk {
  const askId = opts?.askId ?? newAskId();
  return {
    ...ask,
    askId,
    expiresAt: askExpiresAt(opts?.nowMs),
  };
}

export function openCustomId(askId: string): string {
  return `${ASK_CUSTOM_PREFIX}:open:${askId}`;
}

export function pickCustomId(askId: string, optionId: string): string {
  return `${ASK_CUSTOM_PREFIX}:pick:${askId}:${optionId}`;
}

/** DISCORD-ASK-4.a — the Answer form (modal) custom_id; its submit carries it. */
export function answerCustomId(askId: string): string {
  return `${ASK_CUSTOM_PREFIX}:answer:${askId}`;
}

export type ParsedAskCustomId =
  | { kind: "open"; askId: string }
  | { kind: "pick"; askId: string; optionId: string }
  | { kind: "answer"; askId: string };

export function parseAskCustomId(raw: string): ParsedAskCustomId | null {
  const parts = raw.split(":");
  if (parts[0] !== ASK_CUSTOM_PREFIX) return null;
  if (parts[1] === "open" && parts[2]) {
    return { kind: "open", askId: parts[2] };
  }
  if (parts[1] === "pick" && parts[2] && parts[3]) {
    return { kind: "pick", askId: parts[2], optionId: parts[3] };
  }
  if (parts[1] === "answer" && parts[2]) {
    return { kind: "answer", askId: parts[2] };
  }
  return null;
}

/** Primary style = 1. */
export function buildOpenStubComponents(askId: string): DiscordActionRow[] {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1,
          label: "Choose",
          custom_id: openCustomId(askId),
        },
      ],
    },
  ];
}

/**
 * DISCORD-ASK-4.a — the free-text stub's one Answer button (Primary). It
 * shares the Choose button's `open` custom_id: the press handler opens the
 * private form when the ask has no options.
 */
export function buildAnswerStubComponents(askId: string): DiscordActionRow[] {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1,
          label: ASK_ANSWER_LABEL,
          custom_id: openCustomId(askId),
        },
      ],
    },
  ];
}

/**
 * DISCORD-ASK-4.a — the private Answer form: a short title and one required
 * paragraph input capped at ASK_ANSWER_MAX. The input's description is the
 * start of the question (SAFE-6 scrubbed, mass mentions defanged, one line,
 * ≤100 chars), since the form covers the stub while it is open.
 */
export function buildAnswerModal(ask: Pick<PendingAsk, "askId" | "question">): DiscordModal {
  const description = clean(ask.question.replace(/\s+/g, " "), ASK_ANSWER_DESCRIPTION_MAX);
  return {
    custom_id: answerCustomId(ask.askId),
    title: ASK_ANSWER_MODAL_TITLE,
    components: [
      {
        type: 18,
        label: ASK_ANSWER_INPUT_LABEL,
        ...(description ? { description } : {}),
        component: {
          type: 4,
          custom_id: ASK_ANSWER_INPUT_ID,
          style: 2,
          min_length: 1,
          max_length: ASK_ANSWER_MAX,
          required: true,
        },
      },
    ],
  };
}

/**
 * DISCORD-ASK-4.a — a submitted private answer as the resumed run and the
 * session thread get it: SAFE-6 scrubbed first, then control characters
 * dropped, trimmed and cut at ASK_ANSWER_MAX (`normalizeQuestion`). Empty
 * (or not a string) ⇒ "".
 */
export function normalizeAskAnswer(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const text = normalizeQuestion(scrubSecrets(raw));
  return text.length <= ASK_ANSWER_MAX ? text : `${text.slice(0, ASK_ANSWER_MAX - 1)}…`;
}

/**
 * Option buttons (style Secondary = 2), one row, ≤5. Each label is SAFE-6
 * scrubbed before it is cut to Discord's 80 (SAFE-6.a, `cleanAskLabel`);
 * the custom_id keeps the option id byte-identical.
 */
export function buildChoiceComponents(
  askId: string,
  options: readonly AskOption[],
): DiscordActionRow[] {
  const components: DiscordButton[] = options.slice(0, 5).map((o) => ({
    type: 2,
    style: 2,
    label: cleanAskLabel(o.label),
    custom_id: pickCustomId(askId, o.id),
  }));
  return [{ type: 1, components }];
}

function clean(text: string, max: number): string {
  const t = defangMassMentions(scrubSecrets(text)).trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/**
 * Public stub: short ping + Choose button. Does not list MCQ options
 * (DISCORD-ASK-2 — decision UI is ephemeral).
 */
export function formatAskStub(opts: {
  ask: HumanAsk;
  ownerDiscordId?: string;
  requesterDiscordId?: string;
}): { content: string; mentionUserIds: string[]; failed: boolean; status: string } {
  const stuck = opts.ask.reason === "stuck";
  const ownerId = opts.ownerDiscordId?.trim() || "";
  const requesterId = opts.requesterDiscordId?.trim() || "";
  const pingId = stuck ? ownerId : requesterId;
  const mentionUserIds = pingId ? [pingId] : [];
  const ping = pingId ? ` <@${pingId}>` : "";
  const headline = stuck
    ? "⚠️ I'm stuck and need a human."
    : "❓ I need your input before I can continue.";
  const content = `${headline}${ping}\n${ASK_STUB_HINT}`;
  return {
    content,
    mentionUserIds,
    failed: stuck,
    status: stuck ? "⚠️ Stuck — asked for help" : "❓ Needs your input",
  };
}

export type ButtonAsk = {
  /** The ask with its listed options, to store as the session's pending ask. */
  pending: PendingAsk;
  /** Public Choose stub (no MCQ body, DISCORD-ASK-2). */
  stub: ReturnType<typeof formatAskStub>;
  /** The stub's single Choose button. */
  components: DiscordActionRow[];
};

/**
 * DISCORD-ASK-1/4 — the Choose-button form of a run's ask when its choices
 * fit a short list (ask-human `options`, else a numbered list in the
 * question: `resolveAskOptions`). Null when the options cannot be listed
 * (the free-text ask stays) and for a SAFE-8 spend-cap stop, which no choice
 * can lift. `/work` and `/session start` use it for their answer
 * (REQ-discord-044); the pick path is the chat one (`onComponent`).
 */
export function buttonAskFor(opts: {
  ask: HumanAsk;
  ownerDiscordId?: string;
  requesterDiscordId?: string;
  nowMs?: number;
}): ButtonAsk | null {
  if (opts.ask.reason === "spend-cap") return null;
  const options = resolveAskOptions({
    options: opts.ask.options,
    question: opts.ask.question,
  });
  if (!options?.length) return null;
  const pending = toPendingAsk({ ...opts.ask, options }, { nowMs: opts.nowMs });
  return {
    pending,
    stub: formatAskStub({
      ask: pending,
      ownerDiscordId: opts.ownerDiscordId,
      requesterDiscordId: opts.requesterDiscordId,
    }),
    components: buildOpenStubComponents(pending.askId),
  };
}

export type AnswerAsk = {
  /** The free-text ask (no options) to store as the session's pending ask. */
  pending: PendingAsk;
  /** The stub's one Answer button. */
  components: DiscordActionRow[];
};

/**
 * DISCORD-ASK-4.a — the Answer-button form of a run's ask when its choices
 * cannot be listed (a clarify or stuck ask whose options do not resolve to a
 * short list). The stub is the free-text ask post (`formatAskReply`, the
 * question quoted); any lone option is dropped. Null for a SAFE-8 spend-cap
 * stop, which no answer can lift, and when the options can be listed
 * (`buttonAskFor` applies).
 */
export function answerAskFor(opts: { ask: HumanAsk; nowMs?: number }): AnswerAsk | null {
  if (opts.ask.reason === "spend-cap") return null;
  const options = resolveAskOptions({
    options: opts.ask.options,
    question: opts.ask.question,
  });
  if (options?.length) return null;
  const pending = toPendingAsk(
    { reason: opts.ask.reason, question: opts.ask.question },
    { nowMs: opts.nowMs },
  );
  return { pending, components: buildAnswerStubComponents(pending.askId) };
}

/** Ephemeral body: question (quoted) + option buttons. */
export function formatAskEphemeralContent(ask: HumanAsk): string {
  const q = clean(ask.question, 1200);
  const quoted = q
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  const text = `❓ Pick one:\n${quoted}`;
  // The gateway refuses a component reply over Discord's limit instead of
  // cutting it (REQ-discord-096): a question of many short lines is cut
  // here, visibly (…).
  if (text.length <= ASK_EPHEMERAL_MAX) return text;
  let end = ASK_EPHEMERAL_MAX - 1;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${text.slice(0, end)}…`;
}

/** Longest private Choose message (under Discord's 2000). */
export const ASK_EPHEMERAL_MAX = 1900;

export function findOptionLabel(
  options: readonly AskOption[] | undefined,
  optionId: string,
): string | undefined {
  return options?.find((o) => o.id === optionId)?.label;
}
