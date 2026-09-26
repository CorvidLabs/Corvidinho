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
 */

import type { AskOption, HumanAsk } from "../agent/types.ts";
import { defangMassMentions } from "./ask-ping.ts";
import { scrubSecrets } from "../store/scrub.ts";

/** Button prompts expire after ~30 minutes (DISCORD-ASK-5). */
export const ASK_BUTTON_TTL_MS = 30 * 60 * 1000;

export const ASK_CHOICE_EXPIRED = "that choice expired";

export const ASK_STUB_HINT = "Press **Choose** to answer privately.";

/** custom_id prefix — keep short (Discord custom_id ≤100). */
export const ASK_CUSTOM_PREFIX = "cvask";

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

export type ParsedAskCustomId =
  | { kind: "open"; askId: string }
  | { kind: "pick"; askId: string; optionId: string };

export function parseAskCustomId(raw: string): ParsedAskCustomId | null {
  const parts = raw.split(":");
  if (parts[0] !== ASK_CUSTOM_PREFIX) return null;
  if (parts[1] === "open" && parts[2]) {
    return { kind: "open", askId: parts[2] };
  }
  if (parts[1] === "pick" && parts[2] && parts[3]) {
    return { kind: "pick", askId: parts[2], optionId: parts[3] };
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

/** Option buttons (style Secondary = 2), one row, ≤5. */
export function buildChoiceComponents(
  askId: string,
  options: readonly AskOption[],
): DiscordActionRow[] {
  const components: DiscordButton[] = options.slice(0, 5).map((o) => ({
    type: 2,
    style: 2,
    label: o.label.slice(0, 80),
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

/** Ephemeral body: question (quoted) + option buttons. */
export function formatAskEphemeralContent(ask: HumanAsk): string {
  const q = clean(ask.question, 1200);
  const quoted = q
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  return `❓ Pick one:\n${quoted}`;
}

export function findOptionLabel(
  options: readonly AskOption[] | undefined,
  optionId: string,
): string | undefined {
  return options?.find((o) => o.id === optionId)?.label;
}
