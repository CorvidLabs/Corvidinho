/**
 * Listing scope for slash list surfaces (REQ-discord-418).
 *
 * SESSION-MULTI-1: sessions are per user, so a non-ADMIN member lists only
 * their own; ADMIN (the configured owner, IDENTITY-2) keeps the full list.
 * Empty owner ⇒ nobody is ADMIN (IDENTITY-3). A member reply never carries an
 * absolute host path — only the project name.
 */

import { PermissionLevel, resolvePermissionLevel } from "./permissions.ts";
import type { SlashContext, SlashInteraction } from "./slash-types.ts";

/** True when the acting user resolves to ADMIN (owner) right now. */
export function actorIsAdmin(
  ctx: SlashContext,
  interaction: SlashInteraction,
): boolean {
  return (
    resolvePermissionLevel({
      userId: interaction.userId,
      roleIds: interaction.roleIds,
      mutedUsers: ctx.mutedUsers,
      allowlist: ctx.allowlist,
      adminUserIds: ctx.adminUserIds,
      adminRoleIds: ctx.adminRoleIds,
      owner: ctx.owner,
    }) >= PermissionLevel.ADMIN
  );
}

/**
 * Member-safe project label: an absolute path becomes its last segment
 * (`/home/leif/src/Corvidinho` → `Corvidinho`); a relative name is kept.
 * Empty (or bare `/`) → undefined.
 */
export function projectLabel(project: string | undefined): string | undefined {
  const trimmed = project?.trim().replace(/\/+$/, "");
  if (!trimmed) return undefined;
  if (!trimmed.startsWith("/")) return trimmed;
  const last = trimmed.slice(trimmed.lastIndexOf("/") + 1);
  return last || undefined;
}
