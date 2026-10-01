/**
 * PLUGIN-5 / PLUGIN-5.a — /work and /schedule (and the scheduler) are extras
 * I can turn off in `[corvidinho.plugins]`; on an existing install they stay
 * on until I turn them off (REQ-agent-157, REQ-discord-157, REQ-cli-157).
 *
 * Fixtures only: temp install roots, temp allowlist files, in-memory or temp
 * SQLite, injected agents, a null gateway. No live Discord, no network, no
 * git worktrees in this checkout.
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stuckAfterVerifyAsk } from "../src/agent/ask.ts";
import type { HumanAsk } from "../src/agent/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import {
  combineExtrasReads,
  extraStateLabel,
  formatExtraStateLog,
  loadExtrasToggles,
  parseAutonomousConfig,
  parseExtrasSettings,
  parseExtrasSettingsJson,
  trackExtraState,
  type ExtraState,
} from "../src/autonomous/enabled.ts";
import { createDaemonLogger, startDaemon } from "../src/daemon/index.ts";
import type { AgentClient, AgentRunChatOpts } from "../src/discord/agent-client.ts";
import { openCustomId, pickCustomId } from "../src/discord/ask-buttons.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import {
  createNullGateway,
  type ComponentInteraction,
  type GatewayHandlers,
} from "../src/discord/gateway.ts";
import { RUN_STOPPED_TEXT } from "../src/discord/run-control.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import { extraOffReply, extraOffText, handleSlashInteraction } from "../src/discord/slash-dispatch.ts";
import type { SlashContext, SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import { EPHEMERAL_SILENT_ACK, MUTED, type InboundMessage } from "../src/discord/types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const REPO_ROOT = join(import.meta.dir, "..");
const OWNER = "111122223333444455";
const OTHER = "222233334444555566";
const CHAN = "chan-1";
const HOUR = 3_600_000;
/** A night the nightly backup is due (as in tests/ops.backup-wiring.test.ts). */
const NIGHT = new Date(2026, 8, 29, 3, 30).getTime();

const dirs: string[] = [];
function tempDir(prefix = "corvidinho-extras-"): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}
const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function until(cond: () => boolean, ms = 3000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await Bun.sleep(10);
  }
  return cond();
}

/** An install root with this fledge.toml (none when `toml` is undefined). */
function installRoot(toml?: string): string {
  const dir = tempDir("corvidinho-extras-root-");
  if (toml !== undefined) writeFileSync(join(dir, "fledge.toml"), toml);
  return dir;
}

/** An allowlist file path with this text (missing when `text` is undefined). */
function allowlistFile(text?: string, name = "allowlist.toml"): string {
  const path = join(tempDir("corvidinho-extras-allow-"), name);
  if (text !== undefined) writeFileSync(path, text);
  return path;
}

const OFF_WORK = "[corvidinho.plugins]\nwork = false\n";
const OFF_SCHEDULE = "[corvidinho.plugins]\nschedule = false\n";
const OFF_BOTH = "[corvidinho.plugins]\nwork = false\nschedule = false\n";

describe("[corvidinho.plugins] settings (REQ-agent-157)", () => {
  test("absent or literal true is on; false or any other value is off", () => {
    expect(parseExtrasSettings("")).toEqual({});
    expect(parseExtrasSettings("[corvidinho]\nmax_retries = 3\n")).toEqual({});
    expect(parseExtrasSettings("[corvidinho.plugins]\nwork = true\nschedule = true\n")).toEqual({
      work: true,
      schedule: true,
    });
    expect(parseExtrasSettings(OFF_BOTH)).toEqual({ work: false, schedule: false });
    for (const v of ["false", '"false"', '"true"', "0", "1", "{ enabled = true }", "no"]) {
      expect(parseExtrasSettings(`[corvidinho.plugins]\nwork = ${v}\n`)).toEqual({ work: false });
    }
    expect(parseExtrasSettings("[corvidinho.plugins]\nwork = false # off for now\n")).toEqual({ work: false });
    expect(parseExtrasSettings("[corvidinho.plugins]\n# work = false\n")).toEqual({});
  });

  test("the dotted and inline-table spellings under [corvidinho] are the same keys", () => {
    expect(parseExtrasSettings("[corvidinho]\nplugins.work = false\n")).toEqual({ work: false });
    expect(parseExtrasSettings("corvidinho.plugins.schedule = false\n")).toEqual({ schedule: false });
    expect(parseExtrasSettings("[corvidinho]\nplugins = { work = false, schedule = true }\n")).toEqual({
      work: false,
      schedule: true,
    });
  });

  test("a key under a later table, another table or another extra name does not count", () => {
    expect(parseExtrasSettings("[corvidinho.plugins]\n[tasks.test]\nwork = false\n")).toEqual({});
    expect(parseExtrasSettings("[corvidinho.plugins]\n[[lanes.x]]\nschedule = false\n")).toEqual({});
    expect(parseExtrasSettings("[merlin.plugins]\nwork = false\n")).toEqual({});
    expect(parseExtrasSettings("[corvidinho.plugins]\ncouncil = false\n")).toEqual({});
    // A key written twice is off if any copy is not `true`.
    expect(parseExtrasSettings("[corvidinho.plugins]\nwork = false\nwork = true\n")).toEqual({ work: false });
  });

  test("a .json allowlist file takes a corvidinho.plugins object", () => {
    expect(parseExtrasSettingsJson("{}")).toEqual({});
    expect(parseExtrasSettingsJson('{"corvidinho":{"plugins":{"work":false}}}')).toEqual({ work: false });
    expect(parseExtrasSettingsJson('{"corvidinho":{"plugins":{"schedule":true,"work":"false"}}}')).toEqual({
      schedule: true,
      work: false,
    });
    expect(parseExtrasSettingsJson('{"corvidinho":{"plugins":false}}')).toEqual({ work: false, schedule: false });
    expect(() => parseExtrasSettingsJson("{not json")).toThrow();
  });

  test("nothing set anywhere: both on (an existing install stays on, PLUGIN-5.a)", () => {
    const env = { CORVIDINHO_ALLOWLIST_FILE: allowlistFile() };
    expect(loadExtrasToggles({ installRoot: installRoot(), env })).toEqual({
      work: { on: true },
      schedule: { on: true },
    });
    // This checkout's own fledge.toml ships both on (its block is commented out).
    expect(loadExtrasToggles({ installRoot: REPO_ROOT, env })).toEqual({
      work: { on: true },
      schedule: { on: true },
    });
    // No CORVIDINHO_ALLOWLIST_FILE and no default file under the home dir.
    expect(loadExtrasToggles({ installRoot: installRoot(), env: {}, home: tempDir() })).toEqual({
      work: { on: true },
      schedule: { on: true },
    });
  });

  test("off in either file is off, and it says where", () => {
    const fledgeOff = installRoot(OFF_WORK);
    const env = (text?: string) => ({ CORVIDINHO_ALLOWLIST_FILE: allowlistFile(text) });
    expect(loadExtrasToggles({ installRoot: fledgeOff, env: env() })).toEqual({
      work: { on: false, reason: "off", offIn: ["fledge.toml"] },
      schedule: { on: true },
    });
    // The allowlist file's off wins over a fledge.toml on (update-proof place).
    const fledgeOn = installRoot("[corvidinho.plugins]\nwork = true\nschedule = true\n");
    expect(loadExtrasToggles({ installRoot: fledgeOn, env: env(`[discord]\nchannels = ["1"]\n\n${OFF_SCHEDULE}`) })).toEqual({
      work: { on: true },
      schedule: { on: false, reason: "off", offIn: ["allowlist file"] },
    });
    expect(loadExtrasToggles({ installRoot: fledgeOff, env: env(OFF_WORK) }).work).toEqual({
      on: false,
      reason: "off",
      offIn: ["fledge.toml", "allowlist file"],
    });
    // JSON allowlist file.
    const json = allowlistFile('{"discord":{"channels":["1"]},"corvidinho":{"plugins":{"work":false}}}', "allowlist.json");
    expect(loadExtrasToggles({ installRoot: installRoot(), env: { CORVIDINHO_ALLOWLIST_FILE: json } }).work).toEqual({
      on: false,
      reason: "off",
      offIn: ["allowlist file"],
    });
    // The default allowlist path under the home dir is read too.
    const home = tempDir();
    mkdirSync(join(home, ".config", "corvidinho"), { recursive: true });
    writeFileSync(join(home, ".config", "corvidinho", "allowlist.toml"), OFF_SCHEDULE);
    expect(loadExtrasToggles({ installRoot: installRoot(), env: {}, home }).schedule).toMatchObject({
      on: false,
      offIn: ["allowlist file"],
    });
  });

  test("a settings file that cannot be read turns both off as config-unreadable (fail closed)", () => {
    const env = { CORVIDINHO_ALLOWLIST_FILE: allowlistFile() };
    // fledge.toml is a directory: EISDIR.
    const root = installRoot();
    mkdirSync(join(root, "fledge.toml"));
    const t = loadExtrasToggles({ installRoot: root, env });
    expect(t.work).toEqual({
      on: false,
      reason: "config-unreadable",
      error: "the install's fledge.toml could not be read (EISDIR)",
    });
    expect(t.schedule).toEqual(t.work);
    // A .json allowlist file that does not parse.
    const bad = allowlistFile("{oops", "allowlist.json");
    expect(loadExtrasToggles({ installRoot: installRoot(), env: { CORVIDINHO_ALLOWLIST_FILE: bad } }).schedule).toEqual({
      on: false,
      reason: "config-unreadable",
      error: "the allowlist file could not be parsed",
    });
    expect(extraStateLabel(t.work)).toBe("config-unreadable");
    expect(formatExtraStateLog("work", t.work)).toBe(
      "work: off, config-unreadable (the install's fledge.toml could not be read (EISDIR))",
    );
  });

  test("[corvidinho.autonomous] has no say: autonomous off, extras on; extras off, autonomous unchanged", () => {
    const env = { CORVIDINHO_ALLOWLIST_FILE: allowlistFile() };
    const root = installRoot("[corvidinho.autonomous]\nenabled = false\n");
    expect(loadExtrasToggles({ installRoot: root, env }).work).toEqual({ on: true });
    const both = "[corvidinho.autonomous]\nenabled = true\n\n" + OFF_BOTH;
    expect(parseAutonomousConfig(both).enabled).toBe(true);
    expect(parseExtrasSettings(both)).toEqual({ work: false, schedule: false });
  });

  test("combineExtrasReads: unreadable anywhere wins; missing files are on", () => {
    expect(combineExtrasReads([null, null]).work).toEqual({ on: true });
    expect(
      combineExtrasReads([
        { source: "fledge.toml", settings: { work: false } },
        { source: "allowlist file", error: "the allowlist file could not be read (EACCES)" },
      ]).work,
    ).toMatchObject({ on: false, reason: "config-unreadable" });
  });

  test("trackExtraState reports the first read and each change, not every read", () => {
    let next: ExtraState = { on: true };
    const seen: string[] = [];
    const read = trackExtraState(
      () => next,
      (s, prev) => seen.push(`${prev ? extraStateLabel(prev) : "-"}>${extraStateLabel(s)}`),
    );
    read();
    read();
    next = { on: false, reason: "off", offIn: ["allowlist file"] };
    read();
    read();
    next = { on: false, reason: "config-unreadable", error: "x" };
    read();
    next = { on: true };
    read();
    expect(seen).toEqual(["->on", "on>off", "off>config-unreadable", "config-unreadable>on"]);
  });
});

// ---------------------------------------------------------------------------
// Slash dispatch (REQ-discord-157)

function allowCfg() {
  const cfg = emptyConfig();
  cfg.discord.channels = [CHAN];
  return cfg;
}

function memoryInteraction(over: Partial<SlashInteraction> & { commandName: string }) {
  const replies: SlashReplyPayload[] = [];
  const ix: SlashInteraction = {
    id: "ix_1",
    channelId: CHAN,
    userId: OWNER,
    options: {},
    ...over,
    reply: async (p) => void replies.push(p),
    deferReply: async () => {},
    editReply: async (p) => void replies.push(p),
  };
  return { ix, replies };
}

function slashCtx(over: Partial<SlashContext> & { calls?: AgentRunChatOpts[] } = {}): SlashContext {
  const calls = over.calls ?? [];
  const agent: AgentClient = {
    async runChat(o) {
      calls.push(o);
      return { ok: true, sessionId: o.sessionId, summary: "did it", exitCode: 0 };
    },
  };
  return {
    store: new SessionStore({ defaultProjectRoot: tempDir("corvidinho-extras-proj-") }),
    workStore: new WorkStore(),
    allowlist: allowCfg(),
    agent,
    version: "0.0.0",
    protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
    startedAt: Date.now(),
    channelIds: [CHAN],
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    owner: { discordId: OWNER },
    ...over,
  };
}

const OFF_IN_ALLOWLIST: ExtraState = { on: false, reason: "off", offIn: ["allowlist file"] };

describe("/work and /schedule while off (REQ-discord-157)", () => {
  test("/work: only the fixed ephemeral line; no session, work task or run", async () => {
    const calls: AgentRunChatOpts[] = [];
    const reads: string[] = [];
    const ctx = slashCtx({
      calls,
      extraState: (name) => {
        reads.push(name);
        return name === "work" ? OFF_IN_ALLOWLIST : { on: true };
      },
    });
    const { ix, replies } = memoryInteraction({
      commandName: "work",
      userId: OTHER,
      options: { description: "do the thing" },
    });
    const r = await handleSlashInteraction(ctx, ix);
    expect(r).toEqual({ ok: false, reason: "extra_disabled", reply: "/work is turned off on this install." });
    expect(replies).toEqual([{ content: "/work is turned off on this install.", ephemeral: true }]);
    expect(ctx.workStore.list()).toEqual([]);
    expect(ctx.store.list()).toEqual([]);
    expect(calls).toEqual([]);
    expect(reads).toEqual(["work"]);
  });

  test("the owner also gets why and how to turn it back on (never a path)", async () => {
    const ctx = slashCtx({ extraState: () => OFF_IN_ALLOWLIST });
    const { ix, replies } = memoryInteraction({ commandName: "work", options: { description: "x" } });
    await handleSlashInteraction(ctx, ix);
    const content = replies[0]!.content!;
    expect(replies[0]!.ephemeral).toBe(true);
    expect(content.split("\n")[0]).toBe("/work is turned off on this install.");
    expect(content).toContain("`[corvidinho.plugins]`");
    expect(content).toContain("the allowlist file");
    // No path: the only "/" is the command name.
    expect(content.replace("/work is turned off", "")).not.toContain("/");

    const unreadable: ExtraState = {
      on: false,
      reason: "config-unreadable",
      error: "the install's fledge.toml could not be read (EACCES)",
    };
    expect(extraOffReply("schedule", unreadable, true)).toBe(
      "/schedule is turned off on this install.\nIt is off because the plugin settings could not be read: the install's fledge.toml could not be read (EACCES). Fix the file; the next command reads it again.",
    );
    expect(extraOffReply("schedule", unreadable, false)).toBe(extraOffText("schedule"));
  });

  test("/schedule: every subcommand is refused and nothing changes", async () => {
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const scheduleStore = new ScheduleStore({ db });
    const s = scheduleStore.create({
      name: "nightly",
      cronExpression: "0 * * * *",
      project: "p",
      prompt: "x",
      createdByUserId: OWNER,
      channelId: CHAN,
    });
    const before = JSON.stringify(scheduleStore.list());
    const ctx = slashCtx({
      scheduleStore,
      extraState: (name) => (name === "schedule" ? OFF_IN_ALLOWLIST : { on: true }),
    });
    for (const subcommand of ["list", "create", "pause", "resume", "delete"]) {
      const { ix, replies } = memoryInteraction({
        commandName: "schedule",
        subcommand,
        userId: OTHER,
        options: { schedule: s.id, name: "n2", cadence: "1h", project: "p", prompt: "y" },
      });
      const r = await handleSlashInteraction(ctx, ix);
      expect({ subcommand, r }).toEqual({
        subcommand,
        r: { ok: false, reason: "extra_disabled", reply: "/schedule is turned off on this install." },
      });
      expect(replies).toEqual([{ content: "/schedule is turned off on this install.", ephemeral: true }]);
    }
    expect(JSON.stringify(scheduleStore.list())).toBe(before);
    // /work is still on.
    const calls: AgentRunChatOpts[] = [];
    const ctx2 = slashCtx({ calls, extraState: ctx.extraState });
    const { ix } = memoryInteraction({ commandName: "work", options: { description: "go" } });
    expect(await handleSlashInteraction(ctx2, ix)).toEqual({ ok: true, handled: true });
    expect(calls).toHaveLength(1);
  });

  test("the switch runs after the channel, actor and mute gates (their replies are unchanged)", async () => {
    const off = () => OFF_IN_ALLOWLIST;
    // Not an allowlisted channel, non-admin: zero-width ack.
    const a = memoryInteraction({ commandName: "work", channelId: "elsewhere", userId: OTHER });
    await handleSlashInteraction(slashCtx({ extraState: off }), a.ix);
    expect(a.replies).toEqual([{ content: EPHEMERAL_SILENT_ACK, ephemeral: true }]);
    // Deny-listed actor: zero-width ack.
    const denied = allowCfg();
    denied.discord.denyUsers = [OTHER];
    const b = memoryInteraction({ commandName: "work", userId: OTHER });
    await handleSlashInteraction(slashCtx({ extraState: off, allowlist: denied }), b.ix);
    expect(b.replies).toEqual([{ content: EPHEMERAL_SILENT_ACK, ephemeral: true }]);
    // Muted: the mute reply.
    const c = memoryInteraction({ commandName: "schedule", subcommand: "list", userId: OTHER });
    await handleSlashInteraction(slashCtx({ extraState: off, mutedUsers: new Set([OTHER]) }), c.ix);
    expect(c.replies).toEqual([{ content: MUTED, ephemeral: true }]);
  });

  test("other commands never read the switch; unset means on (today's behaviour)", async () => {
    const reads: string[] = [];
    const ctx = slashCtx({
      extraState: (n) => {
        reads.push(n);
        return OFF_IN_ALLOWLIST;
      },
    });
    const { ix, replies } = memoryInteraction({ commandName: "status" });
    expect(await handleSlashInteraction(ctx, ix)).toEqual({ ok: true, handled: true });
    expect(reads).toEqual([]);
    expect(replies[0]?.content ?? replies[0]?.embeds).toBeDefined();

    const calls: AgentRunChatOpts[] = [];
    const plain = slashCtx({ calls });
    const w = memoryInteraction({ commandName: "work", options: { description: "go" } });
    expect(await handleSlashInteraction(plain, w.ix)).toEqual({ ok: true, handled: true });
    expect(calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The bridge: live re-read, /work continuation, presses, stop, scheduler

type Reply = { channelId: string; content: string; replyToMessageId?: string };

async function bridgeWith(opts: {
  agent: AgentClient;
  allowlist: string;
  root?: string;
  db?: Database;
  scheduler?: boolean;
}) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const replies: Reply[] = [];
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: CHAN,
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: opts.allowlist,
      CORVIDINHO_OWNER_DISCORD_ID: OWNER,
    },
    projectRoot: opts.root ?? installRoot(),
    skipProtocolCheck: true,
    ...(opts.scheduler ? { schedulerPollIntervalMs: 20 } : { disableScheduler: true }),
    approvalPollMs: 0,
    ...(opts.db ? { db: opts.db } : {}),
    thinkingOutbound: outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent: opts.agent,
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
  cleanups.push(() => result.stop());
  return { result, handlers: box.handlers, outbound, replies };
}

function workSlash(n: number, description: string, userId = OWNER) {
  const edits: SlashReplyPayload[] = [];
  const ix: SlashInteraction = {
    id: `ix-${n}`,
    commandName: "work",
    channelId: CHAN,
    userId,
    options: { description },
    reply: async (p) => void edits.push(p),
    deferReply: async () => {},
    editReply: async (p) => {
      edits.push(p);
      return { messageId: `slash-reply-${n}` };
    },
    deleteReply: async () => {},
  };
  return { ix, edits };
}

function replyTo(id: string, messageId: string, content: string, authorId = OWNER): InboundMessage {
  return {
    id,
    channelId: CHAN,
    authorId,
    authorBot: false,
    content,
    mentionedBot: false,
    referencedMessageId: messageId,
  };
}

function press(customId: string, messageId: string, userId = OWNER) {
  const eph: Array<Parameters<ComponentInteraction["reply"]>[0]> = [];
  const ix: ComponentInteraction = {
    id: `press_${Math.random()}`,
    customId,
    channelId: CHAN,
    userId,
    messageId,
    reply: async (p) => void eph.push(p),
    deleteReply: async () => {},
  };
  return { ix, eph };
}

function recordingAgent(opts: { firstAsk?: HumanAsk } = {}) {
  const calls: AgentRunChatOpts[] = [];
  const agent: AgentClient = {
    async runChat(input) {
      calls.push(input);
      if (calls.length === 1 && opts.firstAsk) {
        return {
          ok: true,
          sessionId: input.sessionId,
          summary: "Needs your input",
          exitCode: 0,
          ask: opts.firstAsk,
          task: { state: "blocked", verified: false, verifySkipped: true, attempts: 1, cancelled: false },
        };
      }
      return { ok: true, sessionId: input.sessionId, summary: `answer ${calls.length}`, exitCode: 0 };
    },
  };
  return { agent, calls };
}

describe("the bridge reads [corvidinho.plugins] live (REQ-discord-157)", () => {
  test("/work off in the allowlist file is refused; removing it turns /work back on without a restart", async () => {
    const file = allowlistFile(OFF_WORK);
    const { agent, calls } = recordingAgent();
    const b = await bridgeWith({ agent, allowlist: file });
    const first = workSlash(1, "first");
    await b.handlers.onSlash!(first.ix);
    expect(first.edits).toEqual([{ content: "/work is turned off on this install.\nIt is off because `work` under `[corvidinho.plugins]` is not `true` in the allowlist file. Remove that line or set it to `true` to turn it back on; the next command reads it (no restart).", ephemeral: true }]);
    expect(calls).toEqual([]);
    expect(b.result.workStore.list()).toEqual([]);

    writeFileSync(file, "[corvidinho.plugins]\nwork = true\n");
    await b.handlers.onSlash!(workSlash(2, "second").ix);
    expect(calls).toHaveLength(1);
    expect(b.result.workStore.list()).toHaveLength(1);
  });

  test("off in the install root's fledge.toml is off too", async () => {
    const { agent, calls } = recordingAgent();
    const b = await bridgeWith({ agent, allowlist: allowlistFile(), root: installRoot(OFF_WORK) });
    const s = workSlash(1, "x", OTHER);
    await b.handlers.onSlash!(s.ix);
    expect(s.edits).toEqual([{ content: "/work is turned off on this install.", ephemeral: true }]);
    expect(calls).toEqual([]);
  });

  test("a reply that would resume a /work talk gets the turned-off line and runs nothing; back on, it continues", async () => {
    const file = allowlistFile("");
    const { agent, calls } = recordingAgent();
    const b = await bridgeWith({ agent, allowlist: file });
    await b.handlers.onSlash!(workSlash(1, "topic A").ix);
    expect(calls).toHaveLength(1);
    const answer = b.outbound.sends[0]!.messageId;
    const sessionA = calls[0]!.sessionId;

    writeFileSync(file, OFF_WORK);
    await b.handlers.onMessage(replyTo("m-1", answer, "follow up"));
    expect(calls).toHaveLength(1);
    // In the channel: the fixed line only, never the owner's config hint.
    expect(b.replies.at(-1)).toEqual({
      channelId: CHAN,
      content: "/work is turned off on this install.",
      replyToMessageId: "m-1",
    });
    expect(b.result.store.get(sessionA)).toBeDefined();

    // An @mention that would continue the same /work talk (the owner's
    // active session in this channel) is refused the same way.
    const mention = (id: string, authorId: string): InboundMessage => ({
      id,
      channelId: CHAN,
      authorId,
      authorBot: false,
      content: "<@999> hello",
      mentionedBot: true,
    });
    await b.handlers.onMessage(mention("m-mention", OWNER));
    expect(calls).toHaveLength(1);
    expect(b.replies.at(-1)?.content).toBe("/work is turned off on this install.");
    // Someone else's chat (not a /work talk) still runs.
    await b.handlers.onMessage(mention("m-chat", OTHER));
    expect(calls).toHaveLength(2);
    expect(calls[1]!.sessionId).not.toBe(sessionA);

    writeFileSync(file, "");
    await b.handlers.onMessage(replyTo("m-2", answer, "follow up again"));
    expect(calls).toHaveLength(3);
    expect(calls[2]).toMatchObject({ sessionId: sessionA, resume: true, humanText: "follow up again" });
  });

  test("a press on a /work talk's ask is refused privately and resumes nothing; the ask stays open", async () => {
    const file = allowlistFile("");
    const ask: HumanAsk = {
      reason: "clarify",
      question: "Postgres or SQLite?",
      options: [
        { id: "pg", label: "Postgres" },
        { id: "sqlite", label: "SQLite" },
      ],
    };
    const { agent, calls } = recordingAgent({ firstAsk: ask });
    const b = await bridgeWith({ agent, allowlist: file });
    await b.handlers.onSlash!(workSlash(1, "pick a DB").ix);
    const session = b.result.store.get(calls[0]!.sessionId)!;
    const pending = session.pendingAsk!;
    expect(pending.options).toHaveLength(2);
    const stub = pending.stubMessageId ?? b.outbound.sends[0]!.messageId;

    writeFileSync(file, OFF_WORK);
    for (const customId of [openCustomId(pending.askId), pickCustomId(pending.askId, "pg")]) {
      const p = press(customId, stub);
      await b.handlers.onComponent!(p.ix);
      expect(p.eph).toHaveLength(1);
      expect(p.eph[0]!.ephemeral).toBe(true);
      expect(String(p.eph[0]!.content).split("\n")[0]).toBe("/work is turned off on this install.");
      // The owner pressed: they also see why.
      expect(String(p.eph[0]!.content)).toContain("[corvidinho.plugins]");
    }
    expect(calls).toHaveLength(1);
    expect(b.result.store.get(session.id)?.pendingAsk?.askId).toBe(pending.askId);

    writeFileSync(file, "");
    const pick = press(pickCustomId(pending.askId, "pg"), stub);
    await b.handlers.onComponent!(pick.ix);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ sessionId: session.id, humanText: "Postgres" });
  });

  test("turning /work off does not stop a /work run in flight, and 'stop' still stops it", async () => {
    const file = allowlistFile("");
    const runs: Array<{ aborts: number; finish: () => void }> = [];
    const agent: AgentClient = {
      runChat(input) {
        return new Promise((resolve) => {
          const gate = {
            aborts: 0,
            finish: () => resolve({ ok: true, sessionId: input.sessionId, summary: "done", exitCode: 0 }),
          };
          input.signal?.addEventListener("abort", () => {
            gate.aborts += 1;
            resolve({ ok: false, sessionId: input.sessionId, summary: "", exitCode: 137 });
          });
          runs.push(gate);
        });
      },
    };
    const b = await bridgeWith({ agent, allowlist: file });
    const slash = b.handlers.onSlash!(workSlash(1, "long job").ix);
    expect(await until(() => runs.length === 1)).toBe(true);
    writeFileSync(file, OFF_WORK);
    await Bun.sleep(30);
    expect(runs[0]!.aborts).toBe(0);
    const progress = b.outbound.sends[0]!.messageId;
    await b.handlers.onMessage(replyTo("m-stop", progress, "stop"));
    await slash;
    expect(runs[0]!.aborts).toBe(1);
    const done = b.outbound.contentEdits.filter((e) => e.messageId === progress).at(-1);
    expect(String(done?.content)).toContain(RUN_STOPPED_TEXT);
  });

  test("schedule = false: the bridge's ticker claims no run; removing it fires the due schedule", async () => {
    const dataDir = tempDir("corvidinho-extras-data-");
    const db = openCorvidinhoDb({ path: join(dataDir, "corvidinho.db") });
    cleanups.push(() => db.close());
    const store = new ScheduleStore({ db });
    const s = store.create({
      name: "nightly",
      cronExpression: "0 * * * *",
      project: ".",
      prompt: "x",
      createdByUserId: OWNER,
      channelId: CHAN,
    });
    db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [Date.now() - 1000, s.id]);
    const file = allowlistFile(OFF_SCHEDULE);
    const { agent, calls } = recordingAgent();
    await bridgeWith({ agent, allowlist: file, db, scheduler: true });
    const runRows = () =>
      (db.query("SELECT COUNT(*) AS n FROM schedule_runs WHERE schedule_id = ?").get(s.id) as { n: number }).n;
    await Bun.sleep(200);
    expect(runRows()).toBe(0);
    expect(calls).toEqual([]);
    writeFileSync(file, "");
    expect(await until(() => runRows() === 1)).toBe(true);
    expect(await until(() => calls.length === 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The scheduler tick (REQ-discord-157)

describe("SchedulerService.schedulesEnabled (REQ-discord-157)", () => {
  function setup(opts: { agent?: AgentClient } = {}) {
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const clock = { now: Date.parse("2026-09-27T10:30:00Z") };
    const store = new ScheduleStore({ db });
    const schedule = store.create({
      name: "Nightly",
      cronExpression: "0 * * * *",
      project: "proj-a",
      prompt: "do thing",
      createdByUserId: OWNER,
      channelId: CHAN,
      now: clock.now,
    });
    const runs = () =>
      (db.query("SELECT COUNT(*) AS n FROM schedule_runs WHERE schedule_id = ?").get(schedule.id) as { n: number }).n;
    return { db, clock, store, schedule, runs, agent: opts.agent ?? recordingAgent().agent };
  }

  async function settled(svc: SchedulerService): Promise<void> {
    for (let i = 0; i < 300 && svc.runningIds().length > 0; i++) await Bun.sleep(5);
    expect(svc.runningIds()).toEqual([]);
  }

  test("off: no run is claimed or started, but the tick hook, spend DMs and backup still run", async () => {
    const { db, clock, schedule, runs, agent } = setup();
    let on = false;
    const seen = { hook: 0, backup: [] as number[], spend: 0, reads: 0 };
    const svc = new SchedulerService({
      store: new ScheduleStore({ db }),
      agent,
      allowlist: allowCfg(),
      manual: true,
      useWorktrees: false,
      now: () => clock.now,
      onTick: () => void (seen.hook += 1),
      backup: { tick: (now: number) => void seen.backup.push(now) },
      spendDm: { deliver: async () => void (seen.spend += 1) } as never,
      schedulesEnabled: () => {
        seen.reads += 1;
        return on;
      },
    });
    clock.now += HOUR;
    expect(await svc.tick()).toEqual({ started: [], skipped: [] });
    expect(await svc.tick()).toEqual({ started: [], skipped: [] });
    expect(runs()).toBe(0);
    expect(seen).toEqual({ hook: 2, backup: [clock.now, clock.now], spend: 2, reads: 2 });

    // Back on several hours later: the overdue schedule fires once (no catch-up).
    clock.now += 5 * HOUR;
    on = true;
    expect((await svc.tick()).started).toEqual([schedule.id]);
    await settled(svc);
    expect((await svc.tick()).started).toEqual([]);
    expect(runs()).toBe(1);
  });

  test("a throwing switch counts as off", async () => {
    const { db, clock, runs, agent } = setup();
    const svc = new SchedulerService({
      store: new ScheduleStore({ db }),
      agent,
      allowlist: allowCfg(),
      manual: true,
      useWorktrees: false,
      now: () => clock.now,
      schedulesEnabled: () => {
        throw new Error("boom");
      },
    });
    clock.now += HOUR;
    expect(await svc.tick()).toEqual({ started: [], skipped: [] });
    expect(runs()).toBe(0);
  });

  test("off: a schedule question another ticker left pending is still posted (schedule-ask delivery)", async () => {
    const { db, clock, schedule } = setup();
    const stuck = stuckAfterVerifyAsk(2);
    const daemon = new SchedulerService({
      store: new ScheduleStore({ db }),
      agent: {
        async runChat({ sessionId }) {
          return { ok: false, sessionId, summary: "state=failed", exitCode: 1, ask: stuck };
        },
      },
      allowlist: allowCfg(),
      manual: true,
      useWorktrees: false,
      now: () => clock.now,
    });
    clock.now += HOUR;
    expect((await daemon.tick()).started).toEqual([schedule.id]);
    await settled(daemon);

    const posts: Array<{ channelId: string; content: string }> = [];
    const bridge = new SchedulerService({
      store: new ScheduleStore({ db }),
      agent: recordingAgent().agent,
      allowlist: allowCfg(),
      manual: true,
      useWorktrees: false,
      owner: { discordId: OWNER },
      now: () => clock.now,
      outbound: { post: async (p) => void posts.push(p) },
      schedulesEnabled: () => false,
    });
    expect(await bridge.tick()).toEqual({ started: [], skipped: [] });
    await bridge.settleAskDelivery();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.channelId).toBe(CHAN);
    expect(posts[0]!.content).toContain(stuck.question);
  });

  test("turning it off does not stop a run in flight", async () => {
    let release: (() => void) | undefined;
    const agent: AgentClient = {
      runChat({ sessionId, signal }) {
        return new Promise((resolve) => {
          release = () => resolve({ ok: true, sessionId, summary: "done", exitCode: 0 });
          signal?.addEventListener("abort", () => resolve({ ok: false, sessionId, summary: "", exitCode: 137 }));
        });
      },
    };
    const { db, clock, schedule } = setup({ agent });
    let on = true;
    const svc = new SchedulerService({
      store: new ScheduleStore({ db }),
      agent,
      allowlist: allowCfg(),
      manual: true,
      useWorktrees: false,
      now: () => clock.now,
      schedulesEnabled: () => on,
    });
    clock.now += HOUR;
    expect((await svc.tick()).started).toEqual([schedule.id]);
    expect(await until(() => release !== undefined)).toBe(true);
    on = false;
    await svc.tick();
    expect(svc.runningIds()).toEqual([schedule.id]);
    release!();
    await settled(svc);
    const row = db.query("SELECT status FROM schedule_runs WHERE schedule_id = ?").get(schedule.id) as {
      status: string;
    };
    expect(row.status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// The daemon (REQ-cli-157)

describe("corvidinho daemon and [corvidinho.plugins] schedule (REQ-cli-157)", () => {
  async function daemonWith(opts: { allowlist: string; root?: string; backupDir?: string }) {
    const dataDir = tempDir("corvidinho-extras-daemon-");
    const env = {
      ...process.env,
      CORVIDINHO_DATA_DIR: dataDir,
      CORVIDINHO_ALLOWLIST_FILE: opts.allowlist,
      CORVIDINHO_OWNER_DISCORD_ID: "",
      CORVIDINHO_DISCORD_ALLOW_USERS: "",
      CORVIDINHO_DISCORD_ALLOW_ROLES: "",
      CORVIDINHO_DISCORD_DENY_USERS: "",
      CORVIDINHO_DISCORD_DENY_ROLES: "",
      CORVIDINHO_BACKUP_DIR: opts.backupDir ?? "",
    };
    const db = openCorvidinhoDb({ env });
    cleanups.push(() => db.close());
    const store = new ScheduleStore({ db });
    const s = store.create({
      name: "nightly",
      cronExpression: "0 * * * *",
      project: ".",
      prompt: "x",
      createdByUserId: "someone",
    });
    db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [NIGHT - 1000, s.id]);
    const lines: Array<Record<string, unknown>> = [];
    const calls: string[] = [];
    const d = await startDaemon({
      env,
      projectRoot: opts.root ?? installRoot(),
      logger: createDaemonLogger({ write: (l) => lines.push(JSON.parse(l)) }),
      agent: {
        async runChat({ sessionId }) {
          calls.push(sessionId);
          return { ok: true, sessionId, summary: "done", exitCode: 0 };
        },
      },
      useWorktrees: false,
      now: () => NIGHT,
    });
    if (!d.ok) throw new Error(d.message);
    cleanups.push(async () => void (await d.stop()));
    return { d, db, lines, calls, id: s.id };
  }

  test("off: daemon.started says so, ticks claim no run, the nightly backup still runs; back on is logged and fires it", async () => {
    const file = allowlistFile(OFF_SCHEDULE);
    const backupDir = join(tempDir(), "backups");
    const { d, db, lines, calls, id } = await daemonWith({ allowlist: file, backupDir });
    expect(lines[0]).toMatchObject({ event: "daemon.started", schedules: "off" });
    expect(lines.find((l) => l.event === "schedules.off")).toMatchObject({
      level: "warn",
      reason: "off",
      offIn: ["allowlist file"],
    });
    expect(await d.tick()).toEqual({ started: [], skipped: [] });
    expect(await d.tick()).toEqual({ started: [], skipped: [] });
    expect(calls).toEqual([]);
    expect((db.query("SELECT COUNT(*) AS n FROM schedule_runs").get() as { n: number }).n).toBe(0);
    expect(readdirSync(backupDir).filter((f) => f.endsWith(".db"))).toHaveLength(1);
    expect(lines.find((l) => l.event === "backup.ok")).toBeDefined();
    expect(lines.filter((l) => l.event === "schedules.off")).toHaveLength(1);

    writeFileSync(file, "");
    expect((await d.tick()).started).toEqual([id]);
    expect(await d.scheduler.drain(2_000)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(lines.filter((l) => l.event === "schedules.on")).toHaveLength(1);
  });

  test("on by default: daemon.started says on and the due schedule runs", async () => {
    const { d, lines, calls, id } = await daemonWith({ allowlist: allowlistFile() });
    expect(lines[0]).toMatchObject({ event: "daemon.started", schedules: "on" });
    expect(lines.some((l) => l.event === "schedules.off")).toBe(false);
    expect((await d.tick()).started).toEqual([id]);
    expect(await d.scheduler.drain(2_000)).toBe(true);
    expect(calls).toHaveLength(1);
  });

  test("an install-root fledge.toml that cannot be read: config-unreadable, nothing runs", async () => {
    const root = installRoot();
    mkdirSync(join(root, "fledge.toml"));
    const { d, lines, calls } = await daemonWith({ allowlist: allowlistFile(), root });
    expect(lines[0]).toMatchObject({ event: "daemon.started", schedules: "config-unreadable" });
    expect(lines.find((l) => l.event === "schedules.off")).toMatchObject({
      reason: "config-unreadable",
      error: "the install's fledge.toml could not be read (EISDIR)",
    });
    expect(await d.tick()).toEqual({ started: [], skipped: [] });
    expect(calls).toEqual([]);
  });
});
