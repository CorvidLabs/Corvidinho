/**
 * SAFE-18..20 test helpers: drive an Approve/Deny card as Discord would —
 * a button press (which may open the code form), the code form's submit
 * with typed text, and the full SAFE-19 path (Approve, Enter code, submit
 * the code the owner was DMed).
 */
import { approveCardCustomId, parseApproveCardCustomId } from "../../src/discord/approve-card.ts";
import type { DiscordModal } from "../../src/discord/ask-buttons.ts";
import type { ComponentInteraction, GatewayHandlers } from "../../src/discord/gateway.ts";

/**
 * The code form's input id (`APPROVAL_CODE_INPUT_ID`), spelled out so the
 * tests that drive the code step still load, and fail on what they check,
 * against sources without it.
 */
const CODE_INPUT_ID = "code";

export type CardReply = { content?: string; ephemeral?: boolean; components?: unknown[]; update?: boolean };

export type CardPress = { replies: CardReply[]; modals: DiscordModal[] };

/**
 * One card interaction: a button press (with `showModal`, as discord.js
 * gives one), or — when `code` is set — the code form's submit, which
 * carries the typed text and cannot open a form.
 */
export async function cardInteraction(
  handlers: Pick<GatewayHandlers, "onComponent">,
  userId: string,
  customId: string,
  opts: { code?: string; channelId?: string; messageId?: string; roleIds?: string[] } = {},
): Promise<CardPress> {
  const replies: CardReply[] = [];
  const modals: DiscordModal[] = [];
  const ix: ComponentInteraction = {
    id: `ix-${Math.random()}`,
    customId,
    channelId: opts.channelId ?? `dm-${userId}`,
    userId,
    ...(opts.messageId ? { messageId: opts.messageId } : {}),
    ...(opts.roleIds ? { roleIds: opts.roleIds } : {}),
    reply: async (o) => {
      replies.push(o);
    },
    ...(opts.code === undefined
      ? {
          showModal: async (m: DiscordModal) => {
            modals.push(m);
          },
        }
      : { modalValues: { [CODE_INPUT_ID]: opts.code } }),
  };
  await handlers.onComponent!(ix);
  return { replies, modals };
}

const CODE_DM_RE = /^One-time code for request (\S+) \(action ([0-9a-f]{8})\): \*\*([A-Z0-9]+)\*\*/;

/** The newest one-time code DMed to `userId` (optionally for one request). */
export function lastCode(
  dms: ReadonlyArray<{ userId: string; content: string }>,
  userId: string,
  requestId?: string,
): string {
  for (let i = dms.length - 1; i >= 0; i--) {
    const m = CODE_DM_RE.exec(dms[i]!.content);
    if (dms[i]!.userId === userId && m && (!requestId || m[1] === requestId)) return m[3]!;
  }
  throw new Error("no one-time code DM");
}

/** Every DM that carries a one-time code. */
export function codeDms<T extends { content: string }>(dms: readonly T[]): T[] {
  return dms.filter((d) => CODE_DM_RE.test(d.content));
}

/**
 * SAFE-19: Approve on the card, Enter code (opens the form), then submit the
 * code DMed to `userId`. Returns each step; `submit` holds the final answer.
 */
export async function approveWithCode(
  handlers: Pick<GatewayHandlers, "onComponent">,
  dms: ReadonlyArray<{ userId: string; content: string }>,
  userId: string,
  approveCustomId: string,
): Promise<{ approve: CardReply[]; modals: DiscordModal[]; code: string; submit: CardReply[] }> {
  const parsed = parseApproveCardCustomId(approveCustomId);
  if (!parsed || parsed.decision !== "approve") throw new Error("not an Approve button");
  const approve = await cardInteraction(handlers, userId, approveCustomId);
  const open = await cardInteraction(handlers, userId, approveCardCustomId(parsed.kind, "code", parsed.id));
  const code = lastCode(dms, userId, parsed.id);
  const submit = await cardInteraction(handlers, userId, approveCardCustomId(parsed.kind, "submit", parsed.id), {
    code,
  });
  return { approve: approve.replies, modals: open.modals, code, submit: submit.replies };
}
