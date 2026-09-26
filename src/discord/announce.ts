/**
 * Ops/dev announcement helper (DISCORD-ANNOUNCE-4 / REQ-discord-025).
 * Posts only to the configured announcements channel — never to the
 * dogfood/chat allowlist by default.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { VERSION as PACKAGE_VERSION } from "../version.ts";
import type { AnnounceStore } from "./announce-store.ts";

export type AnnounceSender = (opts: {
  channelId: string;
  content: string;
}) => Promise<{ messageId: string } | null>;

export type PostAnnouncementResult =
  | { ok: true; channelId: string; messageId?: string }
  | { ok: false; reason: "not_configured" | "send_failed" | "empty_content" };

export type FormatBridgeLiveOpts = {
  /** Override CHANGELOG.md path (default: repo-root CHANGELOG.md). */
  changelogPath?: string;
  /** Injected CHANGELOG body for tests (skips filesystem). */
  changelogText?: string;
  /** Fallback one-liner when CHANGELOG has no bullets (default: package.json description). */
  packageDescription?: string;
  /** Optional tip line used when description also missing. */
  tip?: string;
  /** Max feature bullets (Discord-friendly). Default 5. */
  maxBullets?: number;
};

const DEFAULT_CHANGELOG = join(import.meta.dir, "..", "..", "CHANGELOG.md");
const DEFAULT_PACKAGE_JSON = join(import.meta.dir, "..", "..", "package.json");
const MAX_BULLET_CHARS = 160;

/** Ops-only / meta lines we skip so announce focuses on what shipped. */
function isMetaBullet(text: string): boolean {
  const t = text.toLowerCase();
  if (/^package version\b/.test(t)) return true;
  if (/^restart\b/.test(t)) return true;
  if (/^hi captured\b/.test(t)) return true;
  if (/^operators running\b/.test(t)) return true;
  if (/^bot config belongs\b/.test(t)) return true;
  if (/^no schema\b/.test(t)) return true;
  if (/^draft\b/.test(t) && /wait for hi/.test(t)) return true;
  return false;
}

/**
 * Extract the body of a `## <version>` / `## v<version>` CHANGELOG section.
 * Returns "" when missing.
 */
export function extractChangelogSection(
  changelogText: string,
  version: string,
): string {
  const ver = version.trim().replace(/^v/i, "");
  if (!ver || !changelogText) return "";
  const lines = changelogText.split(/\r?\n/);
  let want = false;
  const body: string[] = [];
  for (const line of lines) {
    const heading = /^##[ \t]+v?(.+?)\s*$/i.exec(line);
    if (heading) {
      const h = heading[1]!.trim().replace(/^v/i, "");
      if (h === ver) {
        want = true;
        continue;
      }
      if (want) break;
      continue;
    }
    if (want) body.push(line);
  }
  return body.join("\n").replace(/\n+$/, "");
}

/**
 * Collect up to `maxBullets` short feature bullets from a CHANGELOG section body.
 */
export function changelogBulletsFromSection(
  sectionBody: string,
  maxBullets = 5,
): string[] {
  const out: string[] = [];
  for (const raw of sectionBody.split(/\r?\n/)) {
    const m = /^\s*[-*]\s+(.+)$/.exec(raw);
    if (!m) continue;
    let text = m[1]!.trim();
    // Drop trailing markdown link noise for Discord brevity: keep label text.
    text = text.replace(/\s*\[[^\]]*\]\([^)]*\)/g, "").trim();
    if (!text || isMetaBullet(text)) continue;
    if (text.length > MAX_BULLET_CHARS) {
      text = `${text.slice(0, MAX_BULLET_CHARS - 1).trimEnd()}…`;
    }
    out.push(text);
    if (out.length >= maxBullets) break;
  }
  return out;
}

function readDefaultPackageDescription(): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(DEFAULT_PACKAGE_JSON, "utf8")) as {
      description?: unknown;
    };
    if (typeof parsed.description === "string" && parsed.description.trim()) {
      return parsed.description.trim();
    }
  } catch {
    /* missing */
  }
  return undefined;
}

function loadChangelogText(opts: FormatBridgeLiveOpts): string {
  if (typeof opts.changelogText === "string") return opts.changelogText;
  const path = opts.changelogPath ?? DEFAULT_CHANGELOG;
  try {
    if (!existsSync(path)) return "";
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/**
 * Short bridge-live / version-bump note for ClientReady (DISCORD-ANNOUNCE-4 /
 * REQ-discord-025). Version header + ≤5 CHANGELOG bullets; fallback to package
 * description or tip when CHANGELOG missing/empty.
 */
export function formatBridgeLiveAnnouncement(
  version: string = PACKAGE_VERSION,
  opts: FormatBridgeLiveOpts = {},
): string {
  const ver = (version.trim() || "0.0.0").replace(/^v/i, "");
  const header = `bridge live **v${ver}**`;
  const max = opts.maxBullets ?? 5;
  const section = extractChangelogSection(loadChangelogText(opts), ver);
  const bullets = changelogBulletsFromSection(section, max);

  if (bullets.length > 0) {
    return `${header}\n${bullets.map((b) => `- ${b}`).join("\n")}`;
  }

  const description =
    opts.packageDescription !== undefined
      ? opts.packageDescription.trim()
      : (readDefaultPackageDescription() ?? "");
  const tip = opts.tip?.trim() ?? "";
  const fallback = description || tip;
  if (fallback) {
    const line =
      fallback.length > MAX_BULLET_CHARS
        ? `${fallback.slice(0, MAX_BULLET_CHARS - 1).trimEnd()}…`
        : fallback;
    return `${header}\n- ${line}`;
  }
  return header;
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
