/**
 * IDENTITY-4 — inject acting Discord user id + display name into the prompt
 * so the model does not invent names (e.g. "Kyn"). Owner map display wins when
 * the acting user is the configured owner. Memory stays scoped separately
 * (MEMORY-ACL-1 / enrichPromptWithMemories).
 *
 * IDENTITY-13/14/7 — with the owner's declared people, the acting user is
 * recognised by their Discord user id only (never a display name): the block
 * names the declared person, its declared display name (which wins over the
 * Discord one), nicknames and GitHub logins. Once anyone is declared, an
 * undeclared user is marked as not declared, so a Discord display name never
 * passes for a declared person.
 */

import type { OwnerRecord } from "../identity/owner.ts";
import { isOwnerDiscord } from "../identity/owner.ts";
import {
  OWNER_PERSON_ID,
  resolvePerson,
  type PeopleDirectory,
  type ResolvedPerson,
} from "../identity/people.ts";

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
  /**
   * Declared people (IDENTITY-13): the acting user is looked up by
   * `userId` only. Omitted ⇒ no declared-person lines (as before #36).
   */
  people?: PeopleDirectory | null;
};

/** True when the owner declared at least one person (the built-in owner entry does not count). */
function hasDeclaredPeople(dir: PeopleDirectory | null | undefined): boolean {
  return !!dir && dir.people.some((p) => p.id !== OWNER_PERSON_ID);
}

/**
 * Declared person for the acting Discord user id, or null (IDENTITY-7: id
 * only). The built-in owner entry (an owner not declared under `[people]`)
 * is left to the owner lines, so an undeclared owner's block is unchanged.
 */
export function resolveActingPerson(input: IdentityInjectInput): ResolvedPerson | null {
  const id = input.userId?.trim() ?? "";
  if (!id || !input.people) return null;
  const person = resolvePerson(input.people, { discordId: id });
  return person && person.personId !== OWNER_PERSON_ID ? person : null;
}

export type IdentityInjectResult = {
  prompt: string;
  injected: boolean;
  /** Resolved display label used in the block (if any). */
  displayLabel?: string;
};

/**
 * Resolve the human display label: the declared person's display; else
 * owner.display when actor is owner and display is set; else Discord
 * displayName; else username; else the declared person's nickname / id.
 * Never invents.
 */
export function resolveActingDisplayLabel(input: IdentityInjectInput): string | undefined {
  const id = input.userId?.trim() ?? "";
  if (!id) return undefined;
  const person = resolveActingPerson(input);
  if (person?.person.display) return person.person.display;
  if (isOwnerDiscord(input.owner, id) && input.owner?.display?.trim()) {
    return input.owner.display.trim();
  }
  const fromDiscord = (input.displayName ?? "").trim() || (input.username ?? "").trim();
  return fromDiscord || person?.displayName || undefined;
}

/** Pure formatter — no I/O. */
export function formatIdentityInjectBlock(input: IdentityInjectInput): string | null {
  const id = input.userId?.trim() ?? "";
  if (!id) return null;
  const lines = [IDENTITY_INJECT_HEADER, `- discord_user_id: ${id}`];
  const person = resolveActingPerson(input);
  if (person) {
    lines.push(
      `- declared_person: ${person.personId} (the owner's people list, matched on this Discord user id)`,
    );
  } else if (hasDeclaredPeople(input.people) && !isOwnerDiscord(input.owner, id)) {
    lines.push(
      "- declared_person: none (not on the owner's people list; a display name never makes someone a declared person)",
    );
  }
  const label = resolveActingDisplayLabel(input);
  if (label) {
    lines.push(`- display_name: ${label}`);
  }
  if (person && person.person.nicknames.length > 0) {
    lines.push(`- nicknames: ${person.person.nicknames.join(", ")}`);
  }
  if (person && person.person.githubLogins.length > 0) {
    lines.push(`- github: ${person.person.githubLogins.map((l) => `@${l}`).join(", ")}`);
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
