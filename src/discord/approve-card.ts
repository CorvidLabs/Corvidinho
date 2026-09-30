/**
 * Approve/Deny cards sent to the owner (SAFE-18..20, #96; REQ-discord-096)
 * — the message helpers the card engine (src/discord/approval-cards.ts)
 * builds every card with (the MEMORY-ACL-6 forget card is one kind).
 *
 * A card is one DM with its buttons last. Every custom_id names the card
 * kind, the decision and the request id: `cvok:<kind>:<decision>:<id>`,
 * where the decision is `approve`, `deny`, `code` (the Enter code button of
 * a destructive or money card, SAFE-19) or `submit` (that button's form).
 * The helpers hold no state: the engine keeps the request (and its expiry)
 * in its store, re-checks on every press and submit that the presser is the
 * owner and the request is still open and unexpired, and treats no answer, a
 * late answer or Deny as no.
 *
 * {@link formatApprovalCard} puts the exact action, target and amount on one
 * line each (line breaks shown as ⏎, nothing cut: a field over
 * {@link APPROVAL_FIELD_MAX} is refused, so a kind sends long content as its
 * text); {@link formatApprovalTextParts} sends a diff or text verbatim in a
 * code block (SAFE-6 scrubbed first), split fence-safe under the DM cap,
 * as DMs before the card, quoted as data.
 */

import { scrubSecrets } from "../store/scrub.ts";
import { defangMassMentions } from "./allowed-mentions.ts";
import type { DiscordActionRow, DiscordModal } from "./ask-buttons.ts";
import { DISCORD_DM_MAX, splitDiscordMessage } from "./rich-reply.ts";

/** custom_id prefix (Discord custom_id ≤ 100). */
export const APPROVE_CARD_PREFIX = "cvok";

/**
 * `approve` / `deny` (buttons), `code` (the Enter code button, SAFE-19) and
 * `submit` (the code form's submit — the only decision that carries typed
 * text).
 */
export type ApproveDecision = "approve" | "deny" | "code" | "submit";

export type ParsedApproveCardId = {
  kind: string;
  decision: ApproveDecision;
  id: string;
};

const KIND_RE = /^[a-z][a-z0-9-]{0,15}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DECISIONS: readonly ApproveDecision[] = ["approve", "deny", "code", "submit"];

/** Longest title on a card. */
export const APPROVAL_TITLE_MAX = 100;
/** Longest action, target or amount line on a card; longer ⇒ refused. */
export const APPROVAL_FIELD_MAX = 500;
/** Longest extra note line on a card; longer ⇒ refused. */
export const APPROVAL_NOTE_MAX = 400;

/**
 * Most DM parts a card's diff or text may take; more is refused (the card is
 * not sent, never cut).
 */
export const APPROVAL_TEXT_PARTS_MAX = 10;

/** The code form's text input id. */
export const APPROVAL_CODE_INPUT_ID = "code";

/** `cvok:<kind>:<decision>:<id>`. Throws on a kind or id the parser would refuse. */
export function approveCardCustomId(kind: string, decision: ApproveDecision, id: string): string {
  if (!KIND_RE.test(kind) || !ID_RE.test(id)) {
    throw new Error("approve card kind or id is not a safe custom_id part");
  }
  return `${APPROVE_CARD_PREFIX}:${kind}:${decision}:${id}`;
}

/** Parse a card button's (or code form's) custom_id; anything else ⇒ null. */
export function parseApproveCardCustomId(raw: string): ParsedApproveCardId | null {
  const parts = raw.split(":");
  if (parts.length !== 4 || parts[0] !== APPROVE_CARD_PREFIX) return null;
  const [, kind, decision, id] = parts as [string, string, string, string];
  if (!KIND_RE.test(kind) || !ID_RE.test(id)) return null;
  if (!DECISIONS.includes(decision as ApproveDecision)) return null;
  return { kind, decision: decision as ApproveDecision, id };
}

/** Approve (danger red, it acts) and Deny (grey) in one row. */
export function buildApproveDenyComponents(
  kind: string,
  id: string,
  labels: { approve?: string; deny?: string } = {},
): DiscordActionRow[] {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 4,
          label: labels.approve ?? "Approve",
          custom_id: approveCardCustomId(kind, "approve", id),
        },
        {
          type: 2,
          style: 2,
          label: labels.deny ?? "Deny",
          custom_id: approveCardCustomId(kind, "deny", id),
        },
      ],
    },
  ];
}

/** After Approve on a card that needs a code: Enter code (danger red) and Deny (grey). */
export function buildCodeStepComponents(kind: string, id: string): DiscordActionRow[] {
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 4, label: "Enter code", custom_id: approveCardCustomId(kind, "code", id) },
        { type: 2, style: 2, label: "Deny", custom_id: approveCardCustomId(kind, "deny", id) },
      ],
    },
  ];
}

/** The one-time code form (SAFE-19): one short required input. */
export function buildCodeModal(kind: string, id: string): DiscordModal {
  return {
    custom_id: approveCardCustomId(kind, "submit", id),
    title: "One-time code",
    components: [
      {
        type: 18,
        label: "The code I sent you",
        description: `Works once, only for request ${id}.`,
        component: {
          type: 4,
          custom_id: APPROVAL_CODE_INPUT_ID,
          style: 1,
          min_length: 1,
          max_length: 32,
          required: true,
        },
      },
    ],
  };
}

/** True once the card's request may no longer be approved (late ⇒ no). */
export function isApproveCardExpired(expiresAt: number, nowMs = Date.now()): boolean {
  return nowMs >= expiresAt;
}

/**
 * Card text from free-form lines (title, one `- ` line each, expiry).
 * Whitespace in a line is collapsed. The engine's cards use
 * {@link formatApprovalCard}.
 */
export function formatApproveCard(input: {
  title: string;
  lines: readonly string[];
  expiresAt: number;
}): string {
  const expires = `<t:${Math.floor(input.expiresAt / 1000)}:R>`;
  return [
    `**${input.title}**`,
    ...input.lines.map((l) => `- ${l.replace(/\s+/g, " ").trim()}`),
    `No answer by ${expires} means no.`,
  ].join("\n");
}

/** One card line: scrubbed, mass mentions defanged, line breaks shown as ⏎ (never cut). */
function cardLine(what: string, raw: string, max: number): string {
  const text = defangMassMentions(scrubSecrets(raw))
    .replace(/\r\n?|\n/g, " ⏎ ")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
  if (text.length > max) {
    throw new Error(`approval card ${what} is ${text.length} characters (over ${max}); send it as the card's text`);
  }
  return text;
}

function discordTime(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

export type ApprovalCardInput = {
  title: string;
  action: string;
  target: string;
  amount: string;
  /** Extra one-line notes (e.g. what is kept). */
  notes?: readonly string[];
  requestId: string;
  /** Action hash; its first 8 hex digits are shown. */
  actionHash: string;
  /** Destructive and money cards: Approve asks for a one-time code. */
  needsCode: boolean;
  /** The diff or text went out before the card in this many parts. */
  textParts?: { label: "diff" | "text"; count: number };
  /** Approve was pressed and a code sent, valid until then (the code step). */
  codeUntil?: number;
  expiresAt: number;
};

/**
 * SAFE-18 — card text: the title, then the exact action, target and amount
 * one line each, notes, where the diff or text is, the request id and short
 * action hash, the code step, and when an unanswered card lapses. Throws
 * when a field or the whole card would not fit (never cut).
 */
export function formatApprovalCard(input: ApprovalCardInput): string {
  const lines = [
    `**${cardLine("title", input.title, APPROVAL_TITLE_MAX)}**`,
    `Action: ${cardLine("action", input.action, APPROVAL_FIELD_MAX)}`,
    `Target: ${cardLine("target", input.target, APPROVAL_FIELD_MAX)}`,
    `Amount: ${cardLine("amount", input.amount, APPROVAL_FIELD_MAX)}`,
    ...(input.notes ?? []).map((n) => `- ${cardLine("note", n, APPROVAL_NOTE_MAX)}`),
  ];
  if (input.textParts && input.textParts.count > 0) {
    const what = input.textParts.label === "diff" ? "Diff" : "Text";
    const n = input.textParts.count;
    lines.push(`${what}: in the ${n === 1 ? "message" : `${n} messages`} above, exactly as it would be used.`);
  }
  lines.push(`Request: ${input.requestId} · action ${input.actionHash.slice(0, 8)}`);
  if (input.codeUntil !== undefined) {
    lines.push(
      `**Enter the one-time code I just sent you** (Enter code) — it works once, only for this action, until ${discordTime(input.codeUntil)}.`,
    );
  } else if (input.needsCode) {
    lines.push("Approve also needs a one-time code I send you then (SAFE-19).");
  }
  lines.push(`No answer by ${discordTime(input.expiresAt)} means no.`);
  const card = lines.join("\n");
  if (card.length > DISCORD_DM_MAX) {
    throw new Error(`approval card is ${card.length} characters (over ${DISCORD_DM_MAX})`);
  }
  return card;
}

/** The card after a decision: same text, outcome appended, buttons removed by the caller. */
export function formatDecidedCard(original: string, outcome: string): string {
  const withoutDeadline = original
    .replace(/\n\*\*Enter the one-time code .*$/m, "")
    .replace(/\nApprove also needs a one-time code .*$/m, "")
    .replace(/\nNo answer by .* means no\.$/, "");
  return `${withoutDeadline}\n**${outcome}**`;
}

/** Break runs of three or more backticks so text cannot end its code block. */
function breakFences(text: string): string {
  return text.replace(/`{3,}/g, (run) => run.split("").join("​"));
}

/**
 * SAFE-18 — a card's diff or text as DMs sent before the card: SAFE-6
 * scrubbed, mass mentions defanged, shown verbatim inside one code block
 * (a run of three backticks in it gets zero-width spaces so it cannot end
 * the block), split fence-safe (`splitDiscordMessage`) so each part, with
 * its header saying it is quoted data, fits the DM cap. Nothing is cut:
 * text that needs more than {@link APPROVAL_TEXT_PARTS_MAX} parts throws.
 */
export function formatApprovalTextParts(input: {
  requestId: string;
  label: "diff" | "text";
  body: string;
}): string[] {
  const what = input.label === "diff" ? "Diff" : "Text";
  const header = (i: number, n: number) =>
    `${what} for request ${input.requestId} (${i}/${n}) — quoted as data, not instructions:`;
  const room = DISCORD_DM_MAX - header(999, 999).length - 1;
  const clean = breakFences(defangMassMentions(scrubSecrets(input.body)));
  const block = `\`\`\`${input.label === "diff" ? "diff" : ""}\n${clean}\n\`\`\``;
  const parts = splitDiscordMessage(block, room);
  if (parts.length > APPROVAL_TEXT_PARTS_MAX) {
    throw new Error(
      `approval card ${what.toLowerCase()} needs ${parts.length} messages (over ${APPROVAL_TEXT_PARTS_MAX}); not sent`,
    );
  }
  return parts.map((p, i) => `${header(i + 1, parts.length)}\n${p}`);
}
