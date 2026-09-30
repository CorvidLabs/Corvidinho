/**
 * Ops/dev announcement helper (DISCORD-ANNOUNCE-4 / REQ-discord-025).
 * Posts only to the configured announcements channel — never to the
 * dogfood/chat allowlist by default.
 *
 * The update post (the bridge-live note on every ClientReady) is a short
 * note in the persona's voice with a link to the release notes, not a
 * changelog dump (PERSONA-1.a, #69). It is a fixed template: no model call,
 * no spend, and nothing read from CHANGELOG.md.
 */

import { CORVIDINHO_URL } from "../attribution.ts";
import { scrubSecrets } from "../store/scrub.ts";
import { VERSION as PACKAGE_VERSION } from "../version.ts";
import { defangMassMentions } from "./allowed-mentions.ts";
import type { AnnounceStore } from "./announce-store.ts";

export type AnnounceSender = (opts: {
  channelId: string;
  content: string;
}) => Promise<{ messageId: string } | null>;

export type PostAnnouncementResult =
  | { ok: true; channelId: string; messageId?: string }
  | { ok: false; reason: "not_configured" | "send_failed" | "empty_content" };

/** GitHub Releases of Corvidinho; every package version has a `v<version>` Release. */
const RELEASES_URL = `${CORVIDINHO_URL}/releases`;

/**
 * A plain release version (`X.Y.Z`, each part at most 6 digits): the only
 * shape echoed into the note and its link. Anything else (a pre-release, a
 * mention, markdown, a secret) is never posted.
 */
const RELEASE_VERSION_RE = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;

/** GitHub Release page for `version`, or null when it is not a plain release version. */
function releaseNotesUrl(version: string): string | null {
  const ver = version.trim().replace(/^v/i, "");
  return RELEASE_VERSION_RE.test(ver) ? `${RELEASES_URL}/tag/v${ver}` : null;
}

/**
 * The bridge's update post for ClientReady (DISCORD-ANNOUNCE-4, PERSONA-1.a /
 * REQ-discord-025): one short line (under 200 chars) in persona.md's voice
 * naming the running version, with a link to that version's GitHub Release
 * notes. The link is wrapped in `<>` so Discord shows no preview card of the
 * notes. A version that is not a plain release version is not echoed; the
 * note then links the Releases page. Scrubbed (SAFE-6) and mass mentions
 * defanged, though the template only ever holds fixed text and a validated
 * version.
 */
export function formatBridgeLiveAnnouncement(version: string = PACKAGE_VERSION): string {
  const ver = version.trim().replace(/^v/i, "");
  const url = releaseNotesUrl(ver);
  const note = url
    ? `Back online and running **v${ver}** 🐦‍⬛ Everything new in this version is in the release notes 👀 <${url}>`
    : `Back online 🐦‍⬛ Everything new is in the release notes 👀 <${RELEASES_URL}>`;
  return defangMassMentions(scrubSecrets(note));
}

/**
 * Post `content` only to the configured announcements channel.
 * No-op (not_configured) when unset — default-deny.
 */
export async function postAnnouncement(
  store: AnnounceStore,
  send: AnnounceSender,
  content: string,
): Promise<PostAnnouncementResult> {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, reason: "empty_content" };

  const channelId = store.getChannelId();
  if (!channelId) return { ok: false, reason: "not_configured" };

  try {
    const sent = await send({
      channelId,
      content: trimmed.slice(0, 1900),
    });
    if (!sent) return { ok: false, reason: "send_failed" };
    return { ok: true, channelId, messageId: sent.messageId };
  } catch {
    return { ok: false, reason: "send_failed" };
  }
}

/** Format for `/announce show` and `/status` surface. */
export function formatAnnounceChannelLine(
  channelId: string | null | undefined,
): string {
  if (!channelId) {
    return "Announcements: (not configured — default-deny; no posts until set)";
  }
  return `Announcements: <#${channelId}>`;
}
