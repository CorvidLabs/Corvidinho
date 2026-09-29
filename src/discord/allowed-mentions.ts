/**
 * Outbound mention safety (DISCORD-8 confused deputy; ROLES-CHAT-3/8).
 *
 * Bridge posts carry model-written text: chat summaries, `/session start`
 * and `/work` replies, schedule posts, agent `discord-post-message`.
 * Untrusted input (a non-owner's prompt, public GitHub content) can steer
 * that text to contain `@everyone`, `@here`, `<@&role>` or `<@user>`, and
 * Discord would ping with the bot's own permissions. Every outbound post
 * therefore sends an explicit allowed_mentions that parses nothing from the
 * content: the only pings are the author a reply answers and, for an
 * AUTONOMY-2 ask, the owner by id. `@everyone` / `@here` are also defanged
 * in the text itself.
 */

/** discord.js `MessageMentionOptions` subset the bridge sends. */
export type OutboundAllowedMentions = {
  /** Always empty: no `@everyone` / `@here`, role or user parsed from content. */
  parse: [];
  /** The only users this post may ping (e.g. the owner for an ask). */
  users?: string[];
  /** Ping the author of the message this post replies to. */
  repliedUser?: boolean;
};

/**
 * Allowed mentions for one outbound post. Nothing is parsed from content;
 * `users` (deduped) and `repliedUser` are the only pings allowed. A fresh
 * object per call so discord.js never shares one between payloads.
 */
export function outboundAllowedMentions(
  opts: { users?: readonly string[]; repliedUser?: boolean } = {},
): OutboundAllowedMentions {
  const out: OutboundAllowedMentions = { parse: [] };
  const users = [...new Set(opts.users ?? [])].filter(Boolean);
  if (users.length > 0) out.users = users;
  if (opts.repliedUser !== undefined) out.repliedUser = opts.repliedUser;
  return out;
}

/** Break `@everyone` / `@here` so they never render as mass mentions. */
export function defangMassMentions(text: string): string {
  return text.replace(/@(everyone|here)\b/gi, "@​$1");
}
