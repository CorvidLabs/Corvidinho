/**
 * Approve/Deny cards sent to the owner (MEMORY-ACL-6 now; the base the
 * SAFE-18..20 approval cards extend later).
 *
 * A card is one message with two buttons whose custom_id names the card
 * kind, the decision and the request id: `cvok:<kind>:<approve|deny>:<id>`.
 * The helper holds no state: the caller keeps the request (and its expiry)
 * in its own store, re-checks on every press that the presser is the owner
 * and the request is still open and unexpired, and treats no answer, a late
 * answer or Deny as no. Card text never carries memory content or secrets.
 */

import type { DiscordActionRow } from "./ask-buttons.ts";

/** custom_id prefix (Discord custom_id ≤ 100). */
export const APPROVE_CARD_PREFIX = "cvok";

export type ApproveDecision = "approve" | "deny";

export type ParsedApproveCardId = {
  kind: string;
  decision: ApproveDecision;
  id: string;
};

const KIND_RE = /^[a-z][a-z0-9-]{0,15}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** `cvok:<kind>:<decision>:<id>`. Throws on a kind or id the parser would refuse. */
export function approveCardCustomId(kind: string, decision: ApproveDecision, id: string): string {
  if (!KIND_RE.test(kind) || !ID_RE.test(id)) {
    throw new Error("approve card kind or id is not a safe custom_id part");
  }
  return `${APPROVE_CARD_PREFIX}:${kind}:${decision}:${id}`;
}

/** Parse a card button's custom_id; anything else ⇒ null. */
export function parseApproveCardCustomId(raw: string): ParsedApproveCardId | null {
  const parts = raw.split(":");
  if (parts.length !== 4 || parts[0] !== APPROVE_CARD_PREFIX) return null;
  const [, kind, decision, id] = parts as [string, string, string, string];
  if (!KIND_RE.test(kind) || !ID_RE.test(id)) return null;
  if (decision !== "approve" && decision !== "deny") return null;
  return { kind, decision, id };
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

/** True once the card's request may no longer be approved (late ⇒ no). */
export function isApproveCardExpired(expiresAt: number, nowMs = Date.now()): boolean {
  return nowMs >= expiresAt;
}

/**
 * Card text: a title line, the exact action and target as given (one line
 * each), and when an unanswered card lapses. Plain text, no mentions parsed
 * by the gateway (REQ-discord-205).
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

/** The card after a decision: same text, outcome appended, buttons removed by the caller. */
export function formatDecidedCard(original: string, outcome: string): string {
  const withoutDeadline = original.replace(/\nNo answer by .* means no\.$/, "");
  return `${withoutDeadline}\n**${outcome}**`;
}
