/**
 * files-read image mode (DISCORD-9 / REQ-plugins-427).
 *
 * An image is told apart by its magic bytes, not its name, so the agent tool
 * loop can show the model the picture (REQ-agent-428) instead of a lossy
 * UTF-8 decode. Same formats and size cap as Discord attachments
 * (`src/discord/image-attachments.ts`).
 */

import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import {
  MAX_IMAGE_SIZE_BYTES,
  type ImageMediaType,
} from "../../src/discord/image-attachments.ts";

export { MAX_IMAGE_SIZE_BYTES };

/** Enough leading bytes to tell PNG, JPEG, GIF and WebP apart. */
const SNIFF_BYTES = 12;

function ascii(b: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...b.subarray(start, end));
}

/** Image type from a file's leading bytes, or null when it is not one we show. */
export function sniffImageMediaType(head: Uint8Array): ImageMediaType | null {
  if (
    head.length >= 8 &&
    head[0] === 0x89 &&
    ascii(head, 1, 4) === "PNG" &&
    head[4] === 0x0d &&
    head[5] === 0x0a &&
    head[6] === 0x1a &&
    head[7] === 0x0a
  ) {
    return "image/png";
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return "image/jpeg";
  }
  if (head.length >= 6) {
    const sig = ascii(head, 0, 6);
    if (sig === "GIF87a" || sig === "GIF89a") return "image/gif";
  }
  if (
    head.length >= 12 &&
    ascii(head, 0, 4) === "RIFF" &&
    ascii(head, 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** An existing file's image type and size, or null when it is not an image. */
export function sniffImageFile(
  absPath: string,
): { mediaType: ImageMediaType; size: number } | null {
  const fd = openSync(absPath, "r");
  try {
    const head = Buffer.alloc(SNIFF_BYTES);
    const n = readSync(fd, head, 0, SNIFF_BYTES, 0);
    const mediaType = sniffImageMediaType(head.subarray(0, n));
    return mediaType ? { mediaType, size: fstatSync(fd).size } : null;
  } finally {
    closeSync(fd);
  }
}
