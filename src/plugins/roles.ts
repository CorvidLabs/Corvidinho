/**
 * ROLES-CHAT role session + ADMIN re-check (ROLES-CHAT-4/6).
 * Bridge always sets CORVIDINHO_ACTING_IS_ADMIN to "0" or "1".
 * When the env key is unset (local interactive CLI), role gates do not apply.
 */

import { loadAllowlist } from "../allowlist/load.ts";
import {
  isOwnerDiscord,
  loadOwnerConfig,
} from "../identity/owner.ts";

export const ROLE_REFUSED_MESSAGE =
  "not allowed for your role";

function truthy(raw: string | undefined): boolean {
  if (raw == null) return false;
  const s = raw.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function parseList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * True when Discord/WATCH/schedule (or any bridge) stamped an acting-admin bit.
 * Unset ⇒ no role session (developer CLI path).
 */
export function roleSessionActive(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Object.prototype.hasOwnProperty.call(env, "CORVIDINHO_ACTING_IS_ADMIN");
}

/**
 * Handler-time ADMIN re-check (ROLES-CHAT-6 / IDENTITY-2 / ADMIN-4).
 * Requires the bridge bit AND owner match; empty owner ⇒ nobody.
 */
export async function resolveActingIsAdmin(
  env: NodeJS.ProcessEnv = process.env,
  userId?: string,
): Promise<boolean> {
  if (!roleSessionActive(env)) return false;
  if (!truthy(env.CORVIDINHO_ACTING_IS_ADMIN)) return false;

  const actor =
    (userId ?? env.CORVIDINHO_ACTING_DISCORD_USER_ID ?? "").trim();
  if (!actor) return false;

  const id = actor.toLowerCase();
  let isOwner = false;
  try {
    isOwner = isOwnerDiscord((await loadOwnerConfig({ env })).owner, actor);
  } catch {
    isOwner = false;
  }
  if (!isOwner) return false;
  if (parseList(env.DISCORD_MUTED_USER_IDS).includes(id)) return false;
  try {
    const allow = await loadAllowlist({ env });
    if (allow.discord.denyUsers.includes(id)) return false;
  } catch {
    return false;
  }
  return true;
}
