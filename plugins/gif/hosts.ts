/**
 * GIPHY's media hosts (PLUGIN-8 / REQ-plugins-3182): the only hosts a
 * `gif-search` link may name, and what the Discord reply path looks for so a
 * posted GIF link is never swallowed by an embed (REQ-discord-075). No
 * imports, so `src/discord/rich-reply.ts` can use it without loading the
 * search code.
 */

/**
 * The hosts a returned media link may name (exact names, https, default port):
 * GIPHY's media CDN shards. A link anywhere else is dropped.
 */
export const GIPHY_MEDIA_HOSTS: ReadonlySet<string> = new Set([
  "media.giphy.com",
  "media0.giphy.com",
  "media1.giphy.com",
  "media2.giphy.com",
  "media3.giphy.com",
  "media4.giphy.com",
  "i.giphy.com",
]);

/**
 * Whether `text` holds an https link on a GIPHY media host (a GIF a run posts
 * as a link). Exact host match via URL parse — no hostname regex (CodeQL
 * js/incomplete-hostname-regexp).
 */
export function hasGiphyMediaLink(text: string): boolean {
  // Walk every https://… candidate; URL parse + Set.has keeps host matching exact.
  const re = /https:\/\/[^\s<>"')\]]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try {
      const u = new URL(m[0]);
      if (
        u.protocol === "https:" &&
        (u.port === "" || u.port === "443") &&
        GIPHY_MEDIA_HOSTS.has(u.hostname.toLowerCase())
      ) {
        return true;
      }
    } catch {
      // not a URL — keep scanning
    }
  }
  return false;
}
