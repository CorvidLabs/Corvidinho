/**
 * Admin-shaped /mute /unmute (DISCORD-7): aliases of `/admin mutes add` /
 * `/admin mutes remove` (ADMIN-3.c part 2), served by the same audited helper
 * (`applyMuteChange` in ./admin.ts — SAFE-5 rows `admin-mutes-add|remove`,
 * fail closed without a trail).
 * Permission floor enforced in slash-dispatch via minPermission ADMIN.
 * DISCORD-6 / IDENTITY-2: /mute never targets the invoker or the configured
 * owner — a muted owner is not ADMIN, so /unmute would be refused until the
 * bridge restarts.
 */

import type { SlashContext, SlashInteraction } from "../slash-types.ts";
import { applyMuteChange, MUTE_SELF_OR_OWNER_REFUSED } from "./admin.ts";

export { MUTE_SELF_OR_OWNER_REFUSED };

export async function handleMuteCommand(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  await applyMuteChange(ctx, interaction, "add", "/mute");
}

export async function handleUnmuteCommand(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  await applyMuteChange(ctx, interaction, "remove", "/unmute");
}
