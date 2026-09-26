/**
 * DISCORD-9 fixture tests — steal coverage from corvid-agent
 * discord-image-attachments.test.ts (no live Discord token).
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendAttachmentUrls,
  buildMultimodalContent,
  enrichPromptWithImages,
  extractImageBlocks,
  isImageAttachment,
  MAX_IMAGE_SIZE_BYTES,
  type DiscordAttachment,
} from "../src/discord/image-attachments.ts";

function makeAttachment(
  overrides: Partial<DiscordAttachment> = {},
): DiscordAttachment {
  return {
    id: "123456",
    filename: "test.png",
    content_type: "image/png",
    size: 1024,
    url: "https://cdn.discordapp.com/attachments/ch/msg/test.png",
    proxy_url: "https://media.discordapp.net/attachments/ch/msg/test.png",
    width: 800,
    height: 600,
    ...overrides,
  };
}

const FAKE_IMAGE_DATA = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const FAKE_IMAGE_BASE64 = Buffer.from(FAKE_IMAGE_DATA).toString("base64");
const originalFetch = globalThis.fetch;

function mockFetchSuccess() {
  globalThis.fetch = mock(
    async () =>
      new Response(FAKE_IMAGE_DATA, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
  ) as unknown as typeof fetch;
}

function mockFetchFailure(status = 404) {
  globalThis.fetch = mock(
    async () => new Response(null, { status }),
  ) as unknown as typeof fetch;
}

describe("isImageAttachment", () => {
  test("accepts supported image content types", () => {
    expect(isImageAttachment(makeAttachment({ content_type: "image/png" }))).toBe(true);
    expect(isImageAttachment(makeAttachment({ content_type: "image/jpeg" }))).toBe(true);
    expect(isImageAttachment(makeAttachment({ content_type: "image/gif" }))).toBe(true);
    expect(isImageAttachment(makeAttachment({ content_type: "image/webp" }))).toBe(true);
  });

  test("rejects unsupported content types", () => {
    expect(isImageAttachment(makeAttachment({ content_type: "image/svg+xml" }))).toBe(false);
    expect(isImageAttachment(makeAttachment({ content_type: "application/pdf" }))).toBe(false);
    expect(isImageAttachment(makeAttachment({ content_type: "video/mp4" }))).toBe(false);
  });

  test("falls back to file extension when content_type is missing", () => {
    expect(
      isImageAttachment(makeAttachment({ content_type: undefined, filename: "photo.jpg" })),
    ).toBe(true);
    expect(
      isImageAttachment(makeAttachment({ content_type: undefined, filename: "doc.pdf" })),
    ).toBe(false);
  });
});

describe("extractImageBlocks", () => {
  beforeEach(() => mockFetchSuccess());
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns empty for undefined / empty attachments", async () => {
    expect((await extractImageBlocks(undefined)).blocks).toHaveLength(0);
    expect((await extractImageBlocks([])).blocks).toHaveLength(0);
  });

  test("extracts single image attachment as base64", async () => {
    const result = await extractImageBlocks([makeAttachment()]);
    expect(result.blocks).toHaveLength(1);
    expect(result.skipped).toBe(0);
    expect(result.blocks[0]).toEqual({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: FAKE_IMAGE_BASE64,
      },
    });
  });

  test("fetches proxy_url over url", async () => {
    const fetchMock = mock(
      async () =>
        new Response(FAKE_IMAGE_DATA, {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await extractImageBlocks([
      makeAttachment({
        url: "https://cdn.discordapp.com/original.png",
        proxy_url: "https://media.discordapp.net/proxied.png",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalled();
    const calledUrl = (fetchMock.mock.calls[0] as unknown as [string])[0];
    expect(calledUrl).toBe("https://media.discordapp.net/proxied.png");
  });

  test("skips images that exceed size limit (20 MB)", async () => {
    const result = await extractImageBlocks([
      makeAttachment({ size: 1024 }),
      makeAttachment({ id: "2", size: MAX_IMAGE_SIZE_BYTES + 1 }),
    ]);
    expect(result.blocks).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  test("enforces max 5 images per message", async () => {
    const attachments = Array.from({ length: 7 }, (_, i) =>
      makeAttachment({ id: String(i), filename: `img${i}.png` }),
    );
    const result = await extractImageBlocks(attachments);
    expect(result.blocks).toHaveLength(5);
    expect(result.skipped).toBe(2);
  });

  test("skips non-image attachments silently", async () => {
    const result = await extractImageBlocks([
      makeAttachment({ filename: "image.png", content_type: "image/png" }),
      makeAttachment({ filename: "doc.pdf", content_type: "application/pdf" }),
    ]);
    expect(result.blocks).toHaveLength(1);
    expect(result.skipped).toBe(0);
  });

  test("skips images that fail to download", async () => {
    mockFetchFailure(404);
    const result = await extractImageBlocks([makeAttachment()]);
    expect(result.blocks).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  test("writes localPath under cacheDir when messageId provided (HI files)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-img-"));
    try {
      const result = await extractImageBlocks([makeAttachment()], {
        messageId: "m42",
        cacheDir: dir,
      });
      expect(result.materialized).toHaveLength(1);
      expect(result.materialized[0]!.localPath).toBeTruthy();
      const path = result.materialized[0]!.localPath!;
      expect(path.startsWith(dir)).toBe(true);
      expect(readFileSync(path)).toEqual(Buffer.from(FAKE_IMAGE_DATA));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("appendAttachmentUrls", () => {
  test("appends attachment URLs to text", () => {
    const result = appendAttachmentUrls("hello", [makeAttachment()]);
    expect(result).toContain("hello");
    expect(result).toContain(
      "[attachment: https://media.discordapp.net/attachments/ch/msg/test.png]",
    );
  });

  test("returns text unchanged when no attachments", () => {
    expect(appendAttachmentUrls("hello", undefined)).toBe("hello");
  });
});

describe("buildMultimodalContent", () => {
  beforeEach(() => mockFetchSuccess());
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns plain string when no images", async () => {
    expect(await buildMultimodalContent("hello", undefined)).toBe("hello");
  });

  test("returns content block array when images are present", async () => {
    const result = await buildMultimodalContent("check this out", [
      makeAttachment(),
    ]);
    expect(Array.isArray(result)).toBe(true);
    const blocks = result as Array<{ type: string }>;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.type).toBe("text");
    expect(blocks[1]!.type).toBe("image");
  });
});

describe("enrichPromptWithImages (DISCORD-9 agent files)", () => {
  beforeEach(() => mockFetchSuccess());
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("includes local file path in prompt for the agent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-img-"));
    try {
      const prompt = await enrichPromptWithImages(
        "what is this?",
        [makeAttachment()],
        { messageId: "m9", cacheDir: dir },
      );
      expect(prompt).toContain("what is this?");
      expect(prompt).toContain(dir);
      expect(prompt).toContain("[image:");
      expect(prompt.toLowerCase()).toContain("local path");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns original text when no attachments", async () => {
    expect(await enrichPromptWithImages("hi", undefined)).toBe("hi");
  });
});
