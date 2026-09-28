/**
 * DISCORD-9 fixture tests — steal coverage from corvid-agent
 * discord-image-attachments.test.ts (no live Discord token).
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import type { AgentRunChatOpts } from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import {
  createNullGateway,
  type GatewayHandlers,
} from "../src/discord/gateway.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";
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

/** A real 1x1 PNG, for paths the agent opens (REQ-discord-013 / DISCORD-9). */
const REAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function mockFetchRealPng() {
  globalThis.fetch = mock(
    async () =>
      new Response(REAL_PNG, {
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

function initGitRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  const run = (args: string[]) => {
    const p = Bun.spawnSync(["git", ...args], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (p.exitCode !== 0) {
      throw new Error(
        `git ${args.join(" ")} failed: ${new TextDecoder().decode(p.stderr)}`,
      );
    }
  };
  run(["init", "-b", "main"]);
  run(["config", "user.email", "test@example.com"]);
  run(["config", "user.name", "Test"]);
  writeFileSync(join(dir, "README.md"), "# test\n");
  run(["add", "."]);
  run(["commit", "-m", "init"]);
}

describe("bridge writes attachments inside the session workspace (DISCORD-9 / REQ-discord-013)", () => {
  const prevBase = process.env.WORKTREE_BASE_DIR;
  beforeEach(() => mockFetchRealPng());
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (prevBase === undefined) delete process.env.WORKTREE_BASE_DIR;
    else process.env.WORKTREE_BASE_DIR = prevBase;
  });

  test("agent files-read opens the image under the session cwd as an image part; git ignores it; session end deletes it", async () => {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-img-bridge-"));
    const project = join(root, "proj");
    initGitRepo(project);
    // Keep the talk worktree inside the temp root (cleaned below).
    process.env.WORKTREE_BASE_DIR = join(root, "wts");
    const calls: AgentRunChatOpts[] = [];
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    const bridge = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: "chan-1",
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        // Missing file: never read the operator's allowlist (ALLOW-4).
        CORVIDINHO_ALLOWLIST_FILE: join(root, "no-allowlist.toml"),
      },
      projectRoot: project,
      skipProtocolCheck: true,
      disableScheduler: true,
      thinkingOutbound: memoryThinkingOutbound(),
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent: {
        async runChat(opts) {
          calls.push(opts);
          return {
            ok: true,
            sessionId: opts.sessionId,
            summary: "ok",
            exitCode: 0,
          };
        },
      },
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        return createNullGateway();
      },
    });
    try {
      expect(bridge.ok).toBe(true);
      if (bridge.ok !== true || !box.handlers) return;

      await box.handlers.onMessage({
        id: `imgws${Date.now()}`,
        channelId: "chan-1",
        authorId: "u1",
        authorBot: false,
        content: "@bot what is in this screenshot?",
        mentionedBot: true,
        attachments: [makeAttachment()],
      });

      expect(calls).toHaveLength(1);
      const cwd = calls[0]!.cwd!;
      expect(cwd).toBeTruthy();
      const m = calls[0]!.prompt.match(
        /\[image: test\.png \(image\/png[^)]*\) (\S+)\]/,
      );
      expect(m).not.toBeNull();
      const imagePath = m![1]!;

      // The agent's non-dangerous reader must be able to open the path it was given.
      loadBuiltins();
      const read = await runPlugin({
        name: "files-read",
        args: [imagePath],
        cwd,
        nonInteractive: true,
      });
      expect(read.error).toBeUndefined();
      expect(read.ok).toBe(true);
      // DISCORD-9: the model gets the image itself, not decoded bytes.
      expect(read.data).toMatchObject({ mediaType: "image/png", image: true });
      expect(read.image?.mediaType).toBe("image/png");
      expect(Buffer.from(read.image!.base64, "base64").equals(REAL_PNG)).toBe(true);
      expect(readFileSync(imagePath).equals(REAL_PNG)).toBe(true);
      expect(
        imagePath.startsWith(join(cwd, ".corvidinho", "attachments") + sep),
      ).toBe(true);

      // Excluded from commits: the talk worktree stays clean.
      const status = Bun.spawnSync(
        ["git", "status", "--porcelain", "--untracked-files=all"],
        { cwd, stdout: "pipe", stderr: "pipe" },
      );
      expect(new TextDecoder().decode(status.stdout).trim()).toBe("");

      // Session end removes the attachment together with the workspace.
      const session = [...bridge.store.bySessionId.values()][0]!;
      await bridge.store.endSession(session);
      expect(existsSync(imagePath)).toBe(false);
    } finally {
      if (bridge.ok) await bridge.stop();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
