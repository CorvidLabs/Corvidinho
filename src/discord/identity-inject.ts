/**
 * IDENTITY-4 — inject acting Discord user id + display name into the prompt
 * so the model does not invent names (e.g. "Kyn"). Owner map display wins when
 * the acting user is the configured owner. Memory stays scoped separately
 * (MEMORY-ACL-1 / enrichPromptWithMemories).
 */

import type { OwnerRecord } from "../identity/owner.ts";
import { isOwnerDiscord } from "../identity/owner.ts";

export const IDENTITY_INJECT_HEADER =
  "[Corvidinho acting Discord user — use these facts for who is speaking; never invent or guess another name for them]";

export type IdentityInjectInput = {
  /** Discord snowflake of the acting user (required for inject). */
  userId: string;
  /** Discord display name (globalName / displayName) when known. */
  displayName?: string;
  /** Discord username (handle) when known. */
  username?: string;
  /** Configured owner — when acting user matches, prefer owner.display. */
  owner?: OwnerRecord | null;
};

export type IdentityInjectResult = {
  prompt: string;
  injected: boolean;
  /** Resolved display label used in the block (if any). */
  displayLabel?: string;
};

/**
 * Resolve the human display label: owner.display when actor is owner and
 * display is set; else Discord displayName; else username. Never invents.
 */
export function resolveActingDisplayLabel(input: IdentityInjectInput): string | undefined {
  const id = input.userId?.trim() ?? "";
  if (!id) return undefined;
  if (isOwnerDiscord(input.owner, id) && input.owner?.display?.trim()) {
    return input.owner.display.trim();
  }
  const fromDiscord = (input.displayName ?? "").trim() || (input.username ?? "").trim();
  return fromDiscord || undefined;
}

/** Pure formatter — no I/O. */
export function formatIdentityInjectBlock(input: IdentityInjectInput): string | null {
  const id = input.userId?.trim() ?? "";
  if (!id) return null;
  const lines = [IDENTITY_INJECT_HEADER, `- discord_user_id: ${id}`];
  const label = resolveActingDisplayLabel(input);
  if (label) {
    lines.push(`- display_name: ${label}`);
  }
  if (isOwnerDiscord(input.owner, id)) {
    lines.push("- role: owner (ADMIN)");
  }
  lines.push(
    "- Address this user by display_name when present; do not invent alternate names.",
  );
  return lines.join("\n");
}

/**
 * Prepend the identity block to `text`. Blank userId ⇒ unchanged (injected=false).
 */
export function enrichPromptWithIdentity(
  text: string,
  input: IdentityInjectInput,
): IdentityInjectResult {
  const block = formatIdentityInjectBlock(input);
  if (!block) {
    return { prompt: text, injected: false };
  }
  const label = resolveActingDisplayLabel(input);
  const prompt = text.trim().length > 0 ? `${block}\n\n${text}` : block;
  return { prompt, injected: true, displayLabel: label };
}
