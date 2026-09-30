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

const GIPHY_MEDIA_LINK = new RegExp(
  `https://(?:${[...GIPHY_MEDIA_HOSTS].map((h) => h.replace(/\./g, "\\.")).join("|")})/`,
  "i",
);

/** Whether `text` holds an https link on a GIPHY media host (a GIF a run posts as a link). */
export function hasGiphyMediaLink(text: string): boolean {
  return GIPHY_MEDIA_LINK.test(text);
}
