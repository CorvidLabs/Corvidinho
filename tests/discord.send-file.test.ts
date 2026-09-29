/**
 * REQ-discord-476 / REQ-agent-476 — DISCORD-17: the agent can attach files and
 * images (screenshots, logs, diffs, charts) to its replies in the
 * conversation's channel, and it never says it can't send them.
 *
 * `discord-send-file` is dangerous (SAFE-1 allowlist, SAFE-5 audit) and
 * mutating (ROLES-CHAT-3: owner runs only); it attaches only in the channel
 * the bridge set for the run (never a model-chosen one), after the channel
 * allowlist (DISCORD-5) and the acting user's DISCORD-8 check (Attach Files
 * too); Discord's 8 MB cap and a type allowlist apply; text is secret-scrubbed
 * (SAFE-6); SAFE-2 protected and secret paths are refused by name and by where
 * they resolve; dry run posts nothing. The system prompt says it can attach
 * whenever the tool is offered in a conversation.
 *
 * Fixtures only: stubbed fetch, an injected requester checker, a fake CLI for
 * the spawn env, a fake gateway for the bridge, a fake LLM provider. No live
 * Discord, no network.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentClient, AgentRunChatOpts } from "../src/discord/agent-client.ts";
import { createSpawnAgentClient } from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import {
  setRequesterPermCheckerForTests,
  type RequesterCheckResult,
} from "../src/discord/requester-perms.ts";
import type { SlashInteraction } from "../src/discord/slash-types.ts";
import { createTaskExecute } from "../src/agent/execute.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { get, list } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const NAME = "discord-send-file";
const OWNER = "181969874455756800";
const MEMBER = "181969874455756801";
const CHAN = "999000000000000001";
const THREAD = "999000000000000002";
const OTHER_CHAN = "999000000000000003";
const TOKEN = "fake-bot-token-value-0123456789";
const UPLOAD_MAX = 8 * 1024 * 1024;

/** A vendor-key-shaped secret SAFE-6 scrubs. */
const SECRET = `sk-ant-api03-${"A".repeat(40)}`;

/** Smallest bytes the PNG sniff accepts, plus a body. */
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 1, 2, 3, 4,
]);

const KEYS = [
  "CORVIDINHO_DISCORD_ALLOW_CHANNELS",
  "CORVIDINHO_DISCORD_DENY_CHANNELS",
  "DISCORD_CHANNEL_IDS",
  "DISCORD_TOKEN",
  "DISCORD_BOT_TOKEN",
  "CORVIDINHO_DISCORD_DRY_RUN",
  "CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_DISCORD_REPLY_CHANNEL_ID",
  "CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID",
  "DISCORD_MUTED_USER_IDS",
] as const;

type Upload = {
  url: string;
  auth: string | null;
  payload: {
    content?: string;
    allowed_mentions?: { parse?: string[] };
    attachments?: { id: number; filename: string }[];
  };
  filename: string;
  type: string;
  bytes: Uint8Array;
};

let saved: Record<string, string | undefined> = {};
let project = "";
const temps: string[] = [];
const realFetch = globalThis.fetch;
let uploads: Upload[] = [];
/** What the requester must be able to do besides view + send. */
type Needs = { attachFiles?: boolean };
let checks: { channelId: string; userId: string; needs?: Needs }[] = [];
let fetchReply: () => Response = () => Response.json({ id: "msg-1" });

function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // The owner's run in an allowlisted channel, as the bridge spawns it.
  process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS = CHAN;
  process.env.DISCORD_TOKEN = TOKEN;
  process.env.CORVIDINHO_OWNER_DISCORD_ID = OWNER;
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = OWNER;
  process.env.CORVIDINHO_ACTING_IS_ADMIN = "1";
  process.env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID = CHAN;
  project = tempDir("corvidinho-send-file-");
  uploads = [];
  checks = [];
  fetchReply = () => Response.json({ id: "msg-1" });
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const form = init?.body as FormData;
    const file = form.get("files[0]") as File;
    uploads.push({
      url: String(input),
      auth: new Headers(init?.headers).get("authorization"),
      payload: JSON.parse(String(form.get("payload_json"))),
      filename: file.name,
      type: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return fetchReply();
  }) as unknown as typeof fetch;
  // Takes the needs argument whether or not the module declares it.
  const checker = async (
    channelId: string,
    userId: string,
    needs?: Needs,
  ): Promise<RequesterCheckResult> => {
    checks.push({ channelId, userId, needs });
    return { ok: true };
  };
  setRequesterPermCheckerForTests(checker);
  loadBuiltins();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setRequesterPermCheckerForTests(undefined);
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

function send(args: string[], allowlist: string[] = [NAME]) {
  return runPlugin({ name: NAME, args, cwd: project, nonInteractive: true, allowlist });
}

function put(rel: string, data: string | Uint8Array): string {
  const abs = join(project, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, data);
  return abs;
}

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function git(cwd: string, ...args: string[]): void {
  const r = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
}

describe("discord-send-file plugin (REQ-discord-476, DISCORD-17)", () => {
  test("registered dangerous and mutating at minTier 1; its description says it can attach and never to say it can't", () => {
    const entry = list().find((e) => e.name === NAME);
    expect(entry).toMatchObject({ dangerous: true, mutating: true, minTier: 1 });
    const desc = get(NAME)!.description;
    expect(desc).toContain("You CAN send files and images");
    expect(desc).toContain("never tell the user you cannot send or attach them");
    expect(desc).toContain("--git-diff");
    expect(desc).toContain("no --channel");
  });

  test("SAFE-1: non-interactive without the allowlist entry is denied; nothing uploaded", async () => {
    put("shot.png", PNG);
    const r = await send(["shot.png"], []);
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(2);
    expect(uploads).toHaveLength(0);
  });

  test("ROLES-CHAT-3: a non-owner run is refused before the tool runs; nothing uploaded or checked", async () => {
    put("shot.png", PNG);
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = MEMBER;
    process.env.CORVIDINHO_ACTING_IS_ADMIN = "0";
    const r = await send(["shot.png"]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("not allowed for your role");
    expect(uploads).toHaveLength(0);
    expect(checks).toHaveLength(0);
  });

  test("a PNG goes to the conversation's channel as image/png, bytes unchanged, parsing no mentions", async () => {
    put("shots/screen.png", PNG);
    const r = await send(["shots/screen.png"]);
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({
      messageId: "msg-1",
      channelId: CHAN,
      filename: "screen.png",
      contentType: "image/png",
      bytes: PNG.byteLength,
    });
    expect(uploads).toHaveLength(1);
    const u = uploads[0]!;
    expect(u.url).toBe(`https://discord.com/api/v10/channels/${CHAN}/messages`);
    expect(u.auth).toBe(`Bot ${TOKEN}`);
    expect(u.payload.allowed_mentions).toEqual({ parse: [] });
    expect(u.payload.attachments).toEqual([{ id: 0, filename: "screen.png" }]);
    expect(u.filename).toBe("screen.png");
    expect(u.type).toBe("image/png");
    expect([...u.bytes]).toEqual([...PNG]);
    // DISCORD-8: checked for the acting user, who must be able to attach too.
    expect(checks).toEqual([{ channelId: CHAN, userId: OWNER, needs: { attachFiles: true } }]);
  });

  test("SAFE-6: a text log is secret-scrubbed before upload, the bot token's own value too", async () => {
    put("build.log", `step 1 ok\nkey=${SECRET}\ntoken ${TOKEN}\nstep 2 ok\n`);
    const r = await send(["build.log"]);
    expect(r.ok).toBe(true);
    expect((r.data as { scrubbed?: boolean }).scrubbed).toBe(true);
    const body = text(uploads[0]!.bytes);
    expect(body).not.toContain(SECRET);
    expect(body).not.toContain(TOKEN);
    expect(body).toContain("[redacted:");
    expect(body).toContain("step 1 ok");
    expect(body).toContain("step 2 ok");
    expect(uploads[0]!.type).toStartWith("text/plain");
  });

  test("the caption parses no mentions and is defanged and scrubbed", async () => {
    put("notes.md", "# notes\n");
    const r = await send(["notes.md", "--caption", `@everyone @here <@&123> see ${SECRET}`]);
    expect(r.ok).toBe(true);
    const p = uploads[0]!.payload;
    expect(p.allowed_mentions).toEqual({ parse: [] });
    expect(p.content).not.toContain("@everyone");
    expect(p.content).not.toContain("@here");
    expect(p.content).not.toContain(SECRET);
  });

  test("the model cannot choose a channel: --channel / -c / --channel=… refused; nothing uploaded", async () => {
    put("shot.png", PNG);
    for (const args of [
      ["shot.png", "--channel", OTHER_CHAN],
      ["-c", OTHER_CHAN, "shot.png"],
      ["shot.png", `--channel=${CHAN}`],
    ]) {
      const r = await send(args);
      expect(r.ok).toBe(false);
      expect(r.error).toContain("this conversation's own channel");
    }
    expect(uploads).toHaveLength(0);
  });

  test("no conversation channel (schedule, WATCH, operator run) refuses; nothing uploaded", async () => {
    put("shot.png", PNG);
    delete process.env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID;
    const r = await send(["shot.png"]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("no Discord conversation for this run");
    process.env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID = CHAN;
    delete process.env.CORVIDINHO_ACTING_DISCORD_USER_ID;
    delete process.env.CORVIDINHO_ACTING_IS_ADMIN;
    const r2 = await send(["shot.png"]);
    expect(r2.ok).toBe(false);
    expect(r2.error).toContain("no acting Discord user");
    expect(uploads).toHaveLength(0);
  });

  test("DISCORD-5: the channel allowlist gates first; a thread passes through its allowlisted parent", async () => {
    put("shot.png", PNG);
    process.env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID = OTHER_CHAN;
    const r = await send(["shot.png"]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("not authorized");
    expect(uploads).toHaveLength(0);
    expect(checks).toHaveLength(0);

    process.env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID = THREAD;
    process.env.CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID = CHAN;
    const t = await send(["shot.png"]);
    expect(t.ok).toBe(true);
    expect(uploads[0]!.url).toContain(`/channels/${THREAD}/messages`);
    expect(checks[0]).toMatchObject({ channelId: THREAD, userId: OWNER });
  });

  test("DISCORD-5 / REQ-plugins-005: a deny-listed thread is refused even under its allowlisted parent (deny wins); nothing checked or uploaded", async () => {
    put("shot.png", PNG);
    process.env.CORVIDINHO_DISCORD_DENY_CHANNELS = THREAD;
    process.env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID = THREAD;
    process.env.CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID = CHAN;
    const r = await send(["shot.png"]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain(`"${THREAD}" is denied`);
    expect(uploads).toHaveLength(0);
    expect(checks).toHaveLength(0);

    // Another thread under the same parent still passes through it.
    process.env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID = OTHER_CHAN;
    const ok = await send(["shot.png"]);
    expect(ok.ok).toBe(true);
    expect(uploads[0]!.url).toContain(`/channels/${OTHER_CHAN}/messages`);
  });

  test("SAFE-2: protected and secret paths are refused by name and by where a link points; escapes refused", async () => {
    const outside = tempDir("corvidinho-send-file-outside-");
    writeFileSync(join(outside, "leak.txt"), "outside\n");
    put(".env", `TOKEN=${SECRET}\n`);
    put(".env.local.txt", "x\n");
    put(".git/notes.txt", "x\n");
    put("keystore/notes.txt", "x\n");
    put(".specsync/changes/c1/notes.md", "x\n");
    put(".specsync/config.txt", "x\n");
    put("specs/a/notes.md", "x\n");
    put(".ssh/config.txt", "x\n");
    put("fledge.toml", "x\n");
    symlinkSync(join(project, ".env"), join(project, "innocent.txt"));
    symlinkSync(join(outside, "leak.txt"), join(project, "escape.txt"));
    symlinkSync(join(project, ".git"), join(project, "gitlink"));
    for (const p of [
      ".env",
      ".env.local.txt",
      ".git/notes.txt",
      "keystore/notes.txt",
      ".specsync/changes/c1/notes.md",
      ".specsync/config.txt",
      "specs/a/notes.md",
      ".ssh/config.txt",
      "fledge.toml",
      "innocent.txt",
      "escape.txt",
      "gitlink/notes.txt",
      "../leak.txt",
      join(outside, "leak.txt"),
    ]) {
      const r = await send([p]);
      expect(`${p}: ${r.ok}`).toBe(`${p}: false`);
      expect(r.error ?? "").toMatch(/refused/);
    }
    expect(uploads).toHaveLength(0);
  });

  test("only allowed types; an image whose bytes do not match its name, or non-UTF-8 text, is refused", async () => {
    put("run.sh", "echo hi\n");
    put("fake.png", "not a png at all\n");
    put("binary.txt", new Uint8Array([0x68, 0x69, 0x00, 0xff, 0xfe]));
    for (const [p, why] of [
      ["run.sh", "not an allowed type"],
      ["fake.png", "not a PNG image"],
      ["binary.txt", "not UTF-8 text"],
    ] as const) {
      const r = await send([p]);
      expect(r.ok).toBe(false);
      expect(r.error).toContain(why);
    }
    expect(uploads).toHaveLength(0);
  });

  test("over Discord's 8 MB upload limit is refused before any upload", async () => {
    const big = put("big.log", "");
    truncateSync(big, UPLOAD_MAX + 1);
    const r = await send(["big.log"]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("upload limit");
    expect(uploads).toHaveLength(0);
    expect(checks).toHaveLength(0);
  });

  test("a server limit lower than 8 MB (Discord 413 / code 40005) is reported, not retried", async () => {
    put("shot.png", PNG);
    fetchReply = () => Response.json({ code: 40005, message: "Request entity too large" }, { status: 413 });
    const r = await send(["shot.png"]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("over this server's upload limit");
    expect(uploads).toHaveLength(1);
  });

  test("DISCORD-8: an acting user who cannot attach, or a check that cannot run, sends nothing", async () => {
    put("shot.png", PNG);
    setRequesterPermCheckerForTests(async () => ({
      ok: false,
      status: 403,
      reason: "requester cannot attach files in this channel",
    }));
    const r = await send(["shot.png"]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Attach Files");
    setRequesterPermCheckerForTests(async () => {
      throw new Error("login refused: disallowed intents");
    });
    const r2 = await send(["shot.png"]);
    expect(r2.ok).toBe(false);
    expect(r2.error).toContain("could not check");
    expect(uploads).toHaveLength(0);
  });

  test("dry run posts nothing", async () => {
    put("shot.png", PNG);
    process.env.CORVIDINHO_DISCORD_DRY_RUN = "1";
    const r = await send(["shot.png"]);
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ dryRun: true, channelId: CHAN, filename: "shot.png" });
    expect(uploads).toHaveLength(0);
  });

  test("SAFE-5: every attach is on the audit trail like other posts", async () => {
    put("shot.png", PNG);
    const db = openCorvidinhoDb({ env: process.env });
    const count = () =>
      (
        db
          .query("SELECT COUNT(*) AS n FROM audit_log WHERE action = ?")
          .get(NAME) as { n: number }
      ).n;
    try {
      const before = count();
      expect((await send(["shot.png"])).ok).toBe(true);
      const rows = db
        .query("SELECT outcome FROM audit_log WHERE action = ? ORDER BY seq DESC LIMIT 2")
        .all(NAME) as { outcome: string }[];
      expect(count()).toBe(before + 2);
      expect(rows.map((x) => x.outcome).sort()).toEqual(["ok", "started"]);
    } finally {
      db.close();
    }
  });

  test("--git-diff attaches the worktree diff as changes.diff, secret paths left out and text scrubbed", async () => {
    git(project, "init", "-q");
    git(project, "config", "user.email", "t@example.invalid");
    git(project, "config", "user.name", "t");
    put("src/app.ts", "export const a = 1;\n");
    put(".env.local", "A=1\n");
    git(project, "add", "-A");
    git(project, "commit", "-q", "-m", "init");

    const empty = await send(["--git-diff"]);
    expect(empty.ok).toBe(false);
    expect(empty.error).toContain("no changes to attach");

    put("src/app.ts", `export const a = 2;\nconst k = "${SECRET}";\n`);
    put(".env.local", `A=${SECRET}\n`);
    const r = await send(["--git-diff", "--caption", "the diff"]);
    expect(r.ok).toBe(true);
    const u = uploads[0]!;
    expect(u.filename).toBe("changes.diff");
    expect(u.type).toStartWith("text/x-diff");
    const diff = text(u.bytes);
    expect(diff).toContain("src/app.ts");
    expect(diff).toContain("+export const a = 2;");
    expect(diff).not.toContain(".env.local");
    expect(diff).not.toContain(SECRET);
    expect(u.payload.content).toBe("the diff");
  });
});

describe("the bridge supplies the conversation channel (REQ-discord-476)", () => {
  test("the spawn client sets the reply channel env and always overwrites it (empty when none)", async () => {
    const dir = tempDir("corvidinho-send-file-spawn-");
    const bin = join(dir, "fake-cli.ts");
    writeFileSync(
      bin,
      'const e = process.env; console.log(`reply=[${e.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID ?? "unset"}] parent=[${e.CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID ?? "unset"}]`);\n',
    );
    // A stale channel in the bridge's own env never reaches a run.
    process.env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID = OTHER_CHAN;
    process.env.CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID = OTHER_CHAN;
    const client = createSpawnAgentClient({ bin, cwd: dir });
    const inThread = await client.runChat({
      prompt: "hi",
      sessionId: "s1",
      actingUserId: OWNER,
      actingIsAdmin: true,
      replyChannelId: THREAD,
      replyParentChannelId: CHAN,
    });
    expect(inThread.summary).toContain(`reply=[${THREAD}] parent=[${CHAN}]`);
    const none = await client.runChat({ prompt: "hi", sessionId: "s2", actingUserId: OWNER });
    expect(none.summary).toContain("reply=[] parent=[]");
  });

  test("chat runs get the conversation's channel (thread + parent in a thread); /session start and /work the command's channel", async () => {
    const calls: AgentRunChatOpts[] = [];
    const agent: AgentClient = {
      async runChat(opts) {
        calls.push(opts);
        return { ok: true, sessionId: opts.sessionId, summary: "done", exitCode: 0 };
      },
    };
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: CHAN,
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: join(tempDir("corvidinho-send-file-allow-"), "none.toml"),
        CORVIDINHO_OWNER_DISCORD_ID: OWNER,
      },
      projectRoot: tempDir("corvidinho-send-file-proj-"),
      skipProtocolCheck: true,
      disableScheduler: true,
      thinkingOutbound: memoryThinkingOutbound(),
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent,
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        let n = 0;
        handlers.reply = async () => ({ messageId: `bot-reply-${++n}` });
        return createNullGateway();
      },
    });
    if (result.ok !== true || !box.handlers) throw new Error("bridge did not start");
    try {
      const h = box.handlers;
      await h.onMessage({
        id: "m1",
        channelId: CHAN,
        authorId: OWNER,
        authorBot: false,
        content: "send me the log",
        mentionedBot: true,
      });
      await h.onMessage({
        id: "m2",
        channelId: CHAN,
        threadId: THREAD,
        authorId: MEMBER,
        authorBot: false,
        content: "and the screenshot",
        mentionedBot: true,
      });
      const slash = (n: number, command: "session" | "work"): SlashInteraction => ({
        id: `ix-${n}`,
        commandName: command,
        ...(command === "session" ? { subcommand: "start" } : {}),
        channelId: CHAN,
        userId: OWNER,
        options: command === "session" ? { topic: "attach it" } : { description: "attach it" },
        reply: async () => {},
        deferReply: async () => {},
        editReply: async () => ({ messageId: `slash-reply-${n}` }),
        deleteReply: async () => {},
      });
      await h.onSlash?.(slash(1, "session"));
      await h.onSlash?.(slash(2, "work"));

      expect(calls).toHaveLength(4);
      expect(calls[0]).toMatchObject({ replyChannelId: CHAN });
      expect(calls[0]!.replyParentChannelId).toBeUndefined();
      expect(calls[1]).toMatchObject({ replyChannelId: THREAD, replyParentChannelId: CHAN });
      expect(calls[2]).toMatchObject({ replyChannelId: CHAN });
      expect(calls[3]).toMatchObject({ replyChannelId: CHAN });
    } finally {
      await result.stop();
    }
  });
});

describe("the model is told it can attach (REQ-agent-476, DISCORD-17)", () => {
  const LLM_ENV = {
    CORVIDINHO_LLM_API_KEY: "k",
    CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
    CORVIDINHO_LLM_MODEL: "m",
  };

  async function systemPrompt(opts: { allowlist: string[]; replyChannel?: string }) {
    const seen: { system: string; offered: string[] } = { system: "", offered: [] };
    const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: { role: string; content: string }[];
        tools?: { function: { name: string } }[];
      };
      seen.system = body.messages?.find((m) => m.role === "system")?.content ?? "";
      seen.offered = (body.tools ?? []).map((t) => t.function.name);
      return Response.json({ choices: [{ message: { role: "assistant", content: "done" } }] });
    };
    const env: NodeJS.ProcessEnv = { ...process.env, ...LLM_ENV };
    // A local run: no role session, so the owner-only tool can be offered.
    delete env.CORVIDINHO_ACTING_IS_ADMIN;
    delete env.CORVIDINHO_ACTING_DISCORD_USER_ID;
    if (opts.replyChannel) env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID = opts.replyChannel;
    else delete env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID;
    const exec = createTaskExecute({
      taskText: "show me the build log",
      cwd: project,
      env,
      fetchImpl,
      tier: "tool",
      nonInteractive: true,
      allowlist: opts.allowlist,
      autonomous: false,
      projectInstructions: false,
      maxToolRounds: 1,
    });
    await exec({ attempt: 1, signal: new AbortController().signal });
    return seen;
  }

  test("offered in a conversation: the tool is in the catalog and the system prompt says never to say it can't", async () => {
    const seen = await systemPrompt({ allowlist: [NAME], replyChannel: CHAN });
    expect(seen.offered).toContain(NAME);
    expect(seen.system).toContain("Attachments (DISCORD-17)");
    expect(seen.system).toContain("never say you cannot send or attach files or images");
    expect(seen.system).toContain("discord-send-file --git-diff");
  });

  test("not allowlisted, or no conversation channel: no attach promise in the prompt", async () => {
    const notListed = await systemPrompt({ allowlist: [], replyChannel: CHAN });
    expect(notListed.offered).not.toContain(NAME);
    expect(notListed.system).not.toContain("Attachments (DISCORD-17)");
    const noChannel = await systemPrompt({ allowlist: [NAME] });
    expect(noChannel.system).not.toContain("Attachments (DISCORD-17)");
  });
});
