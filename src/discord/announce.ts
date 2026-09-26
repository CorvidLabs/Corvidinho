/**
 * Ops/dev announcement helper (DISCORD-ANNOUNCE-4).
 * Posts only to the configured announcements channel — never to the
 * dogfood/chat allowlist by default.
 */

import { VERSION as PACKAGE_VERSION } from "../version.ts";
import type { AnnounceStore } from "./announce-store.ts";

export type AnnounceSender = (opts: {
  channelId: string;
  content: string;
}) => Promise<{ messageId: string } | null>;

export type PostAnnouncementResult =
  | { ok: true; channelId: string; messageId?: string }
  | { ok: false; reason: "not_configured" | "send_failed" | "empty_content" };

/**
 * Short bridge-live / version-bump note for ClientReady (DISCORD-ANNOUNCE-4).
 */
export function formatBridgeLiveAnnouncement(
  version: string = PACKAGE_VERSION,
): string {
  return `bridge live **v${version}**`;
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
