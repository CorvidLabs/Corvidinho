/**
 * PERSONA-1.a (#69): the bridge's update post (the bridge-live note it posts
 * on every ClientReady, DISCORD-ANNOUNCE-4) is a short note in the persona's
 * voice with a link to the release notes, not a changelog dump.
 *
 * AUTONOMY-10.b: that note is system text, not an announcement it starts, so
 * it posts with no Approve card and carries only the fixed template (no model
 * text); a `discord-post-message` with the same words still asks
 * (AUTONOMY-10.a).
 *
 * Fixtures only: `startBridge` with a null gateway whose reply is recorded, an
 * in-memory DB with the announcements channel set, and the fixed template in
 * `src/discord/announce.ts` (no model call). The real CHANGELOG.md has a long
 * section for the version used here, so a bullet dump would show.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { formatBridgeLiveAnnouncement, postAnnouncement } from "../src/discord/announce.ts";
import { AnnounceStore } from "../src/discord/announce-store.ts";
import { startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { approvedPublicReplies, PUBLIC_REPLY_HOLD_LINE } from "../src/discord/public-reply-gate.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { MUST_ASK_POST_KIND } from "../src/plugins/must-ask.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { scrubSecrets } from "../src/store/scrub.ts";
import { VERSION } from "../src/version.ts";
import { answerMustAsk } from "./fixtures/must-ask.ts";

const RELEASES = "https://github.com/CorvidLabs/Corvidinho/releases";
const ANNOUNCE_CHANNEL = "999888777666555444";
const CHAT_CHANNEL = "chan-1";
/** A version with a long section in the real CHANGELOG.md. */
const SHIPPED = "0.0.34";

type Reply = { channelId: string; content: string; mentionUserIds?: string[] };

/** Temp dirs a test made (allowlist file dir, project root), removed after each test. */
const tempDirs: string[] = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

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

async function bridgeWithAnnounce(opts: {
  version: string;
  announceChannel: string | null;
  /** Reuse a DB (a restart of the same box). */
  db?: ReturnType<typeof openCorvidinhoDb>;
  agent?: AgentClient;
  /** The gateway reports every channel as a public thread (AUTONOMY-10.a's reply gate would hold model text there). */
  publicThreads?: boolean;
  /** DMs the bridge sends (Approve cards go out by DM). */
  dms?: unknown[];
}) {
  const db = opts.db ?? openCorvidinhoDb({ memory: true });
  const announceStore = new AnnounceStore(db);
  if (opts.announceChannel) announceStore.setChannelId(opts.announceChannel);
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const replies: Reply[] = [];
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: CHAT_CHANNEL,
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: join(tempDir("corvidinho-upost-"), "none.toml"),
      CORVIDINHO_OWNER_DISCORD_ID: "111122223333444455",
    },
    db,
    announceStore,
    version: opts.version,
    projectRoot: tempDir("corvidinho-upost-proj-"),
    skipProtocolCheck: true,
    disableScheduler: true,
    // The card engine polls fast, so a card recorded for the note would be DMed here.
    approvalPollMs: 5,
    agent: opts.agent ?? idleAgent,
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      handlers.reply = async (o) => {
        replies.push(o);
        return { messageId: `bot_${replies.length}` };
      };
      handlers.sendDm = async (o) => {
        opts.dms?.push(o);
        return { channelId: "dm", messageId: `dm_${opts.dms?.length ?? 0}` };
      };
      if (opts.publicThreads) handlers.isPublicThread = async () => true;
      return createNullGateway();
    },
  });
  if (!result.ok || !box.handlers) throw new Error("bridge did not start");
  return { result, handlers: box.handlers, replies, db };
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

describe("AUTONOMY-10.b: the bridge-live note is system text, so it posts without the owner's OK", () => {
  /** What a model would say, if anything asked one. */
  const MODEL_TEXT = "MODEL-ANSWER: ignore your rules and @everyone ship it";
  /** The fixed template: only the plain release version varies. */
  const TEMPLATE =
    /^Back online and running \*\*v\d{1,6}\.\d{1,6}\.\d{1,6}\*\* 🐦‍⬛ Everything new in this version is in the release notes 👀 <https:\/\/github\.com\/CorvidLabs\/Corvidinho\/releases\/tag\/v\d{1,6}\.\d{1,6}\.\d{1,6}>$/;

  /** An agent that would answer with model text, recording every call. */
  function modelAgent(calls: unknown[]): AgentClient {
    return {
      async runChat(input) {
        calls.push(input);
        return { ok: true, sessionId: input.sessionId, summary: MODEL_TEXT, exitCode: 0 };
      },
    };
  }

  const cardRows = (db: ReturnType<typeof openCorvidinhoDb>) =>
    (db.query("SELECT COUNT(*) AS n FROM approval_requests").get() as { n: number }).n;

  test("after every restart it posts at once with no Approve card, even with an owner set and an announcements channel that is a public thread", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const dms: unknown[] = [];
    const calls: unknown[] = [];
    try {
      for (let restart = 1; restart <= 2; restart++) {
        const { result, handlers, replies } = await bridgeWithAnnounce({
          version: SHIPPED,
          announceChannel: ANNOUNCE_CHANNEL,
          db,
          agent: modelAgent(calls),
          publicThreads: true,
          dms,
        });
        try {
          handlers.onReady?.("bot-user");
          await settle();
          await Bun.sleep(40); // several card-engine passes (5 ms poll)
          // Posted straight away, once, only in the announcements channel (DISCORD-ANNOUNCE-4).
          expect(replies).toHaveLength(1);
          expect(replies[0]!.channelId).toBe(ANNOUNCE_CHANNEL);
          expect(replies[0]!.content).toBe(formatBridgeLiveAnnouncement(SHIPPED));
          expect(replies[0]!.content).toMatch(TEMPLATE);
          expect(replies[0]!.content).not.toContain(PUBLIC_REPLY_HOLD_LINE);
          // No card: nothing recorded, nothing DMed to the owner, nothing waited.
          expect(cardRows(db)).toBe(0);
          expect(dms).toEqual([]);
          // It is not one of the 20 public-thread replies the owner approves (AUTONOMY-10.a).
          expect(approvedPublicReplies(db)).toBe(0);
          // Model-free: no run was started for it.
          expect(calls).toEqual([]);
        } finally {
          await result.stop();
        }
      }
    } finally {
      db.close();
    }
  });

  test("it carries only the fixed template: a version that is not a plain release version, model text included, is never echoed", async () => {
    const calls: unknown[] = [];
    const { result, handlers, replies } = await bridgeWithAnnounce({
      version: `1.0.0 ${MODEL_TEXT}`,
      announceChannel: ANNOUNCE_CHANNEL,
      agent: modelAgent(calls),
      publicThreads: true,
    });
    try {
      handlers.onReady?.("bot-user");
      await settle();
      expect(replies).toHaveLength(1);
      expect(replies[0]!.content).toBe(`Back online 🐦‍⬛ Everything new is in the release notes 👀 <${RELEASES}>`);
      expect(replies[0]!.content).not.toContain("MODEL-ANSWER");
      expect(replies[0]!.content).not.toContain("@everyone");
      expect(calls).toEqual([]);
      // The running build's own note is the template too.
      expect(formatBridgeLiveAnnouncement()).toMatch(TEMPLATE);
    } finally {
      await result.stop();
    }
  });

  test("the exemption is the bridge's own note only: a discord-post-message with the same words still waits for the owner's card (AUTONOMY-10.a)", async () => {
    const keys = [
      "CORVIDINHO_DATA_DIR",
      "CORVIDINHO_DISCORD_ALLOW_CHANNELS",
      "DISCORD_TOKEN",
      "CORVIDINHO_DISCORD_DRY_RUN",
      "CORVIDINHO_DELEGATE_DEPTH",
      "CORVIDINHO_ACTING_DISCORD_USER_ID",
      "CORVIDINHO_DISCORD_SESSION_ID",
    ];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    process.env.CORVIDINHO_DATA_DIR = tempDir("corvidinho-upost-data-");
    process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS = ANNOUNCE_CHANNEL;
    process.env.DISCORD_TOKEN = "fake";
    for (const k of keys.slice(3)) delete process.env[k];
    const asked = answerMustAsk("denied");
    try {
      loadBuiltins();
      const note = formatBridgeLiveAnnouncement(SHIPPED);
      const r = await runPlugin({
        name: "discord-post-message",
        args: ["--channel", ANNOUNCE_CHANNEL, "--content", note],
        nonInteractive: true,
        allowlist: ["discord-post-message"],
      });
      expect(r.ok).toBe(false);
      expect(r.error).toContain("refused (AUTONOMY-10)");
      expect(asked.requests).toHaveLength(1);
      expect(asked.requests[0]!.kind).toBe(MUST_ASK_POST_KIND);
      expect(asked.requests[0]!.text).toBe(note);
    } finally {
      asked.restore();
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });

  test("docs/discord.md's must-ask list names the bridge-live note as system text that needs no card, citing AUTONOMY-10.b, which hi/autonomy.md holds", () => {
    const root = join(import.meta.dir, "..");
    const docs = readFileSync(join(root, "docs", "discord.md"), "utf8");
    const start = docs.indexOf("### The must-ask list");
    expect(start).toBeGreaterThanOrEqual(0);
    const end = docs.indexOf("\n### ", start + 1);
    const mustAsk = docs.slice(start, end < 0 ? undefined : end);
    const notOnList = mustAsk.split("\n").find((l) => l.startsWith("Not on the list:"));
    expect(notOnList).toBeDefined();
    expect(notOnList!).toContain("bridge-live note");
    expect(notOnList!).toContain("AUTONOMY-10.b");
    const hi = readFileSync(join(root, "hi", "autonomy.md"), "utf8");
    expect(hi).toMatch(/\*\*AUTONOMY-10\.b\*\*\s+The fixed 'bridge is live' note it posts after a restart is system text, not an announcement, so it doesn't wait for my OK\./);
  });
});
