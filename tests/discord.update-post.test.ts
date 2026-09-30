/**
 * PERSONA-1.a (#69): the bridge's update post (the bridge-live note it posts
 * on every ClientReady, DISCORD-ANNOUNCE-4) is a short note in the persona's
 * voice with a link to the release notes, not a changelog dump.
 *
 * Fixtures only: `startBridge` with a null gateway whose reply is recorded, an
 * in-memory DB with the announcements channel set, and the fixed template in
 * `src/discord/announce.ts` (no model call). The real CHANGELOG.md has a long
 * section for the version used here, so a bullet dump would show.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { formatBridgeLiveAnnouncement, postAnnouncement } from "../src/discord/announce.ts";
import { AnnounceStore } from "../src/discord/announce-store.ts";
import { startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { scrubSecrets } from "../src/store/scrub.ts";
import { VERSION } from "../src/version.ts";

const RELEASES = "https://github.com/CorvidLabs/Corvidinho/releases";
const ANNOUNCE_CHANNEL = "999888777666555444";
const CHAT_CHANNEL = "chan-1";
/** A version with a long section in the real CHANGELOG.md. */
const SHIPPED = "0.0.34";

type Reply = { channelId: string; content: string; mentionUserIds?: string[] };

const idleAgent: AgentClient = {
  async runChat({ sessionId }) {
    return { ok: true, sessionId, summary: "unused", exitCode: 0 };
  },
};

/** First `- ` bullet of a CHANGELOG section, without markdown bold. */
function firstChangelogBullet(version: string): string {
  const text = readFileSync(join(import.meta.dir, "..", "CHANGELOG.md"), "utf8");
  const start = text.indexOf(`\n## ${version}\n`);
  expect(start).toBeGreaterThanOrEqual(0);
  const bullet = /\n- \*\*([^*]+)\*\*/.exec(text.slice(start))?.[1];
  expect(bullet?.length ?? 0).toBeGreaterThan(20);
  return bullet!;
}

/** Things a changelog dump would have: bullet lines, headings, a list. */
function expectNoChangelogDump(note: string): void {
  expect(note).not.toMatch(/^\s*[-*•]\s/m);
  expect(note).not.toMatch(/^\s*#/m);
  expect(note).not.toContain("\n");
  expect(note.toLowerCase()).not.toContain("changelog");
}

async function bridgeWithAnnounce(opts: { version: string; announceChannel: string | null }) {
  const db = openCorvidinhoDb({ memory: true });
  const announceStore = new AnnounceStore(db);
  if (opts.announceChannel) announceStore.setChannelId(opts.announceChannel);
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const replies: Reply[] = [];
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: CHAT_CHANNEL,
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: join(mkdtempSync(join(tmpdir(), "corvidinho-upost-")), "none.toml"),
      CORVIDINHO_OWNER_DISCORD_ID: "111122223333444455",
    },
    db,
    announceStore,
    version: opts.version,
    projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-upost-proj-")),
    skipProtocolCheck: true,
    disableScheduler: true,
    agent: idleAgent,
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      handlers.reply = async (o) => {
        replies.push(o);
        return { messageId: `bot_${replies.length}` };
      };
      return createNullGateway();
    },
  });
  if (!result.ok || !box.handlers) throw new Error("bridge did not start");
  return { result, handlers: box.handlers, replies };
}

/** Let the fire-and-forget announce post settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

describe("PERSONA-1.a: the bridge's update post on ClientReady", () => {
  test("one short in-voice note with the version and its release notes link, only in the announcements channel", async () => {
    const { result, handlers, replies } = await bridgeWithAnnounce({
      version: SHIPPED,
      announceChannel: ANNOUNCE_CHANNEL,
    });
    try {
      handlers.onReady?.("bot-user");
      await settle();
      expect(replies).toHaveLength(1);
      const post = replies[0]!;
      expect(post.channelId).toBe(ANNOUNCE_CHANNEL);
      expect(post.mentionUserIds ?? []).toEqual([]);
      const note = post.content;
      expect(note).toBe(formatBridgeLiveAnnouncement(SHIPPED));
      expect(note.length).toBeLessThan(400);
      expect(note).toContain(`**v${SHIPPED}**`);
      expect(note).toContain(`<${RELEASES}/tag/v${SHIPPED}>`);
      // Persona voice (persona.md): warm, an emoji, never "bridge live vX" + bullets.
      expect(note).toContain("🐦‍⬛");
      expect(note.startsWith("bridge live")).toBe(false);
      expectNoChangelogDump(note);
      expect(note).not.toContain(firstChangelogBullet(SHIPPED).slice(0, 40));
      expect(scrubSecrets(note)).toBe(note);
    } finally {
      if (result.ok) await result.stop();
    }
  });

  test("no announcements channel: nothing is posted anywhere", async () => {
    const { result, handlers, replies } = await bridgeWithAnnounce({
      version: SHIPPED,
      announceChannel: null,
    });
    try {
      handlers.onReady?.("bot-user");
      await settle();
      expect(replies).toHaveLength(0);
    } finally {
      if (result.ok) await result.stop();
    }
  });
});

describe("PERSONA-1.a: formatBridgeLiveAnnouncement", () => {
  test("the fixed in-voice template: version, one plain line, release notes link", () => {
    expect(formatBridgeLiveAnnouncement("0.0.34")).toBe(
      "Back online and running **v0.0.34** 🐦‍⬛ Everything new in this version is in the release notes 👀 " +
        "<https://github.com/CorvidLabs/Corvidinho/releases/tag/v0.0.34>",
    );
  });

  test("a leading v and spaces are dropped; the default is the package version", () => {
    expect(formatBridgeLiveAnnouncement(" v1.2.3 ")).toContain(
      `**v1.2.3** 🐦‍⬛ Everything new in this version is in the release notes 👀 <${RELEASES}/tag/v1.2.3>`,
    );
    expect(formatBridgeLiveAnnouncement()).toBe(formatBridgeLiveAnnouncement(VERSION));
    expect(formatBridgeLiveAnnouncement()).toContain(`<${RELEASES}/tag/v${VERSION}>`);
  });

  test("stays short and bullet-free even for the longest release version", () => {
    const note = formatBridgeLiveAnnouncement("999999.999999.999999");
    expect(note.length).toBeLessThan(400);
    expect(note).toContain("<https://github.com/CorvidLabs/Corvidinho/releases/tag/v999999.999999.999999>");
    expectNoChangelogDump(note);
  });

  test("a version that is not a plain release version is never echoed; the note links the Releases page", () => {
    // Runtime-built fake key (never a real secret in the repo).
    const fakeKey = ["sk", "proj", "A".repeat(12) + "b".repeat(12)].join("-");
    const odd = [
      "",
      "   ",
      "0.0.34-rc.1",
      "@everyone",
      "1.0.0 @here",
      `1.0.0-${fakeKey}`,
      "1.0.0\n- a bullet",
      "1.0.0)](https://example.com",
      "1".repeat(20) + ".0.0",
    ];
    const fallback = `Back online 🐦‍⬛ Everything new is in the release notes 👀 <${RELEASES}>`;
    for (const v of odd) {
      const note = formatBridgeLiveAnnouncement(v);
      expect(note).toBe(fallback);
      expect(note).not.toContain("@everyone");
      expect(note).not.toContain("@here");
      expect(note).not.toContain(fakeKey);
      expect(note).not.toContain("example.com");
      expectNoChangelogDump(note);
    }
  });

  test("postAnnouncement sends the note as one message to the announcements channel", async () => {
    const store = new AnnounceStore(openCorvidinhoDb({ memory: true }));
    store.setChannelId(ANNOUNCE_CHANNEL);
    const sends: Array<{ channelId: string; content: string }> = [];
    const note = formatBridgeLiveAnnouncement(SHIPPED);
    const r = await postAnnouncement(
      store,
      async (o) => {
        sends.push(o);
        return { messageId: "m1" };
      },
      note,
    );
    expect(r.ok).toBe(true);
    expect(sends).toEqual([{ channelId: ANNOUNCE_CHANNEL, content: note }]);
  });
});
