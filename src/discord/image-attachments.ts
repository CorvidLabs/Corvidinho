/**
 * DISCORD-9 — Discord image attachment extraction for the agent.
 *
 * Steal shape from archived corvid-agent `server/discord/image-attachments.ts`
 * (MIME allowlist; 20MB / 5 images caps; multimodal blocks + URL fallback).
 * Merlin `bridges/discord/src/images.ts` localPath: write downloaded bytes
 * to local files so HI "files it can actually look at" holds for the
 * headless CLI prompt path (no ProcessManager / no Anthropic SDK). The bridge
 * writes them inside the session workspace (`attachmentCacheDir`) because the
 * agent's file tools refuse paths outside their cwd (REQ-discord-013).
 */

import { realpathSync, rmdirSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { DiscordAttachment } from "./types.ts";

/** Supported image MIME types (corvid-agent allowlist). */
export const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/** Maximum file size for image attachments (20 MB). */
export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;

/** Maximum number of image attachments per message. */
export const MAX_IMAGES_PER_MESSAGE = 5;

/** Fetch timeout for Discord CDN downloads (Merlin FETCH_TIMEOUT_MS). */
export const FETCH_TIMEOUT_MS = 15_000;

/**
 * Fallback cache dir when a caller passes no `cacheDir` (Merlin
 * IMAGE_CACHE_DIR). The bridge never uses it: it is outside any session cwd,
 * so the agent's file tools cannot open it.
 */
export const IMAGE_CACHE_DIR = "/tmp/corvidinho-images";

/** Attachment dir relative to a session workspace (agent cwd). */
export const WORKSPACE_ATTACHMENTS_SUBDIR = join(".corvidinho", "attachments");

/**
 * Where the bridge writes a session's attachments: inside the agent cwd so
 * files-read can open them; removed with the workspace when the session ends.
 */
export function attachmentCacheDir(workDir: string): string {
  return join(workDir, WORKSPACE_ATTACHMENTS_SUBDIR);
}

/** A session id as one safe path component. */
function sessionComponent(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, "") || "session";
}

/**
 * AGENT-1.a: in a non-git project a talk runs in the project folder itself
 * (`project_dir`), so the owner's images go to their own per-session folder,
 * `<project>/.corvidinho/attachments/<session>/`, which every end of the
 * session removes ({@link removeSessionAttachments}).
 */
export function sessionAttachmentDir(projectDir: string, sessionId: string): string {
  return join(attachmentCacheDir(projectDir), sessionComponent(sessionId));
}

function realOrResolved(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

function strictlyInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== "" && rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel);
}

/**
 * Remove one session's attachment folder in a project folder
 * ({@link sessionAttachmentDir}), then `.corvidinho/attachments` and
 * `.corvidinho` when that left them empty. Only a folder that resolves
 * strictly inside the project is touched, so a symlinked `.corvidinho`
 * never deletes anything outside it, nor the project itself. Never throws.
 */
export function removeSessionAttachments(projectDir: string, sessionId: string): void {
  try {
    const project = realOrResolved(projectDir);
    const dir = sessionAttachmentDir(projectDir, sessionId);
    const real = realOrResolved(dir);
    if (!strictlyInside(project, real)) return;
    rmSync(real, { recursive: true, force: true });
    for (const parent of [dirname(dir), dirname(dirname(dir))]) {
      const realParent = realOrResolved(parent);
      if (!strictlyInside(project, realParent)) break;
      try {
        rmdirSync(realParent);
      } catch {
        break; // not empty (or gone): leave it
      }
    }
  } catch {
    /* best-effort: a leftover image is not worth failing the end of a talk */
  }
}

export type { DiscordAttachment };

export type ImageMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

/** Multimodal image block (Anthropic-shaped; no SDK dependency). */
export type ImageContentBlock = {
  type: "image";
  source: {
    type: "base64";
    media_type: ImageMediaType;
    data: string;
  };
};

export type TextContentBlock = {
  type: "text";
  text: string;
};

export type ContentBlock = ImageContentBlock | TextContentBlock;

export type MaterializedImage = {
  attachment: DiscordAttachment;
  mediaType: ImageMediaType;
  base64: string;
  /** Absolute path under the cache dir when write succeeded. */
  localPath?: string;
};

/** Result of extracting images from a Discord message's attachments. */
export type ExtractedImages = {
  blocks: ImageContentBlock[];
  /** Number of images skipped (too large, over limit, download fail). */
  skipped: number;
  materialized: MaterializedImage[];
};

/**
 * Check whether an attachment is a supported image.
 * Uses content_type when available, falls back to file extension.
 */
export function isImageAttachment(attachment: DiscordAttachment): boolean {
  if (attachment.content_type) {
    return SUPPORTED_IMAGE_TYPES.has(attachment.content_type);
  }
  const ext = attachment.filename.split(".").pop()?.toLowerCase();
  return (
    ext === "jpg" ||
    ext === "jpeg" ||
    ext === "png" ||
    ext === "gif" ||
    ext === "webp"
  );
}

function inferMediaType(attachment: DiscordAttachment): ImageMediaType {
  if (
    attachment.content_type &&
    SUPPORTED_IMAGE_TYPES.has(attachment.content_type)
  ) {
    return attachment.content_type as ImageMediaType;
  }
  const ext = attachment.filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

function extFromMediaType(ct: ImageMediaType): string {
  if (ct === "image/jpeg") return "jpg";
  return ct.replace(/^image\//, "") || "png";
}

function attachmentUrl(attachment: DiscordAttachment): string {
  return attachment.proxy_url || attachment.url;
}

/**
 * Extract image attachments, download bytes, optionally write local files,
 * and build multimodal image blocks (corvid-agent extractImageBlocks +
 * Merlin downloadAndEncode localPath).
 */
export async function extractImageBlocks(
  attachments: DiscordAttachment[] | undefined,
  opts: { messageId?: string; cacheDir?: string } = {},
): Promise<ExtractedImages> {
  if (!attachments || attachments.length === 0) {
    return { blocks: [], skipped: 0, materialized: [] };
  }

  const blocks: ImageContentBlock[] = [];
  const materialized: MaterializedImage[] = [];
  let skipped = 0;
  const cacheDir = opts.cacheDir ?? IMAGE_CACHE_DIR;
  let ensuredDir = false;

  if (opts.messageId) {
    try {
      await mkdir(cacheDir, { recursive: true });
      ensuredDir = true;
    } catch {
      /* best-effort — keep base64 even if disk write fails */
    }
    if (ensuredDir) {
      // Self-ignoring dir: downloaded images never land in a commit.
      try {
        await writeFile(join(cacheDir, ".gitignore"), "*\n", { flag: "wx" });
      } catch {
        /* already present, or not writable — images still write below */
      }
    }
  }

  for (const attachment of attachments) {
    if (!isImageAttachment(attachment)) continue;

    if (blocks.length >= MAX_IMAGES_PER_MESSAGE) {
      skipped++;
      continue;
    }

    if (attachment.size > MAX_IMAGE_SIZE_BYTES) {
      skipped++;
      continue;
    }

    const imageUrl = attachmentUrl(attachment);
    const mediaType = inferMediaType(attachment);

    try {
      const resp = await fetch(imageUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!resp.ok) {
        skipped++;
        continue;
      }

      const arrayBuffer = await resp.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
        skipped++;
        continue;
      }
      const fileBuffer = Buffer.from(arrayBuffer);
      const base64Data = fileBuffer.toString("base64");

      let localPath: string | undefined;
      if (opts.messageId && ensuredDir) {
        const fname = `${opts.messageId}-${blocks.length}.${extFromMediaType(mediaType)}`;
        const full = join(cacheDir, fname);
        try {
          await writeFile(full, fileBuffer);
          localPath = full;
        } catch {
          /* ignore — agent still gets URL / base64 metadata */
        }
      }

      const block: ImageContentBlock = {
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: base64Data,
        },
      };
      blocks.push(block);
      materialized.push({
        attachment,
        mediaType,
        base64: base64Data,
        localPath,
      });
    } catch {
      skipped++;
    }
  }

  return { blocks, skipped, materialized };
}

/**
 * Extract URLs from attachments and append them to the text as a fallback.
 */
export function appendAttachmentUrls(
  text: string,
  attachments: DiscordAttachment[] | undefined,
): string {
  if (!attachments || attachments.length === 0) return text;

  const urls: string[] = [];
  for (const attachment of attachments) {
    const url = attachmentUrl(attachment);
    if (url) urls.push(url);
  }

  if (urls.length === 0) return text;

  const urlSection = urls.map((u) => `[attachment: ${u}]`).join("\n");
  return text ? `${text}\n\n${urlSection}` : urlSection;
}

/**
 * Build multimodal content from text + attachments (corvid-agent shape).
 * Returns a string when no images landed; otherwise text + image blocks.
 */
export async function buildMultimodalContent(
  text: string,
  attachments: DiscordAttachment[] | undefined,
  opts: { messageId?: string; cacheDir?: string } = {},
): Promise<string | ContentBlock[]> {
  const { blocks: imageBlocks, skipped, materialized } =
    await extractImageBlocks(attachments, opts);

  const textWithUrls = appendAttachmentUrls(text, attachments);

  if (imageBlocks.length === 0) {
    if (skipped > 0) {
      return `${textWithUrls}\n\n[${skipped} image attachment(s) skipped — unsupported format or too large]`;
    }
    return textWithUrls;
  }

  const contentBlocks: ContentBlock[] = [];
  if (textWithUrls) {
    contentBlocks.push({ type: "text", text: textWithUrls });
  }
  contentBlocks.push(...imageBlocks);

  if (skipped > 0) {
    contentBlocks.push({
      type: "text",
      text: `[${skipped} additional image attachment(s) skipped — unsupported format or too large]`,
    });
  }

  // Touch materialized so callers using buildMultimodalContent still get
  // localPath writes when messageId was provided (side effect of extract).
  void materialized;

  return contentBlocks;
}

/**
 * Enrich a plain agent prompt with downloaded image file paths (DISCORD-9 HI).
 * Headless CLI only accepts a string task — local paths are how the agent
 * can actually look at attached images (Merlin formatImageContext analogue).
 */
export async function enrichPromptWithImages(
  text: string,
  attachments: DiscordAttachment[] | undefined,
  opts: { messageId?: string; cacheDir?: string } = {},
): Promise<string> {
  if (!attachments || attachments.length === 0) return text;

  const { materialized, skipped } = await extractImageBlocks(attachments, {
    messageId: opts.messageId ?? "msg",
    cacheDir: opts.cacheDir,
  });

  const textWithUrls = appendAttachmentUrls(text, attachments);

  if (materialized.length === 0) {
    if (skipped > 0) {
      return `${textWithUrls}\n\n[${skipped} image attachment(s) skipped — unsupported format or too large]`;
    }
    return textWithUrls;
  }

  const lines = materialized.map((m) => {
    const dims =
      m.attachment.width && m.attachment.height
        ? ` ${m.attachment.width}x${m.attachment.height}`
        : "";
    const ref = m.localPath ?? attachmentUrl(m.attachment);
    return `[image: ${m.attachment.filename} (${m.mediaType}${dims}) ${ref}]`;
  });

  const directive =
    text.trim().length > 0
      ? `\n\nThe user attached ${materialized.length === 1 ? "an image" : `${materialized.length} images`}. Open the local path(s) above to look at ${materialized.length === 1 ? "it" : "them"} before answering.`
      : `\n\nThe user shared ${materialized.length === 1 ? "an image" : `${materialized.length} images`} with no other text. Open the local path(s) above and describe what you see.`;

  let out = textWithUrls
    ? `${textWithUrls}\n${lines.join("\n")}${directive}`
    : `${lines.join("\n")}${directive}`;

  if (skipped > 0) {
    out += `\n\n[${skipped} additional image attachment(s) skipped — unsupported format or too large]`;
  }
  return out;
}
