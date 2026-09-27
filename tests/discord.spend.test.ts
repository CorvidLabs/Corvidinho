/**
 * SAFE-8 as amended on #98 on Discord (REQ-discord-098): the spend-cap ask
 * goes through the AUTONOMY-1/2 ask path with the owner pinged, the 80%
 * warning rides the reply / schedule post and pings the owner, and /status
 * shows 24 h spend vs the cap (AUTONOMOUS-8). Fixtures only: fake gateway,
 * fake sh bin, in-memory DB — no live Discord, no network, no git worktrees.
 */
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatAskSummary } from "../src/agent/ask.ts";
import { resultFrame, serializeFrame } from "../src/agent/events-ndjson.ts";
import { extractUsage, loadLlmEnv } from "../src/agent/execute.ts";
import { createSpendGuard, SPEND_CAP_ENV, SpendLedger } from "../src/agent/spend.ts";
import { SPEND_CAP_SUMMARY, spendCapReachedAsk } from "../src/agent/spend-notice.ts";
import { createSpendAlertOutbox } from "../src/agent/spend-outbox.ts";
import type { HumanAsk, SpendWarning, TaskResult } from "../src/agent/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createDaemonLogger, startDaemon } from "../src/daemon/index.ts";
import { createSpawnAgentClient, type AgentClient } from "../src/discord/agent-client.ts";
import { finishSlashWithOwnerNotice } from "../src/discord/spend-post.ts";
import {
  appendPostLine,
  ASK_REPLY_HINT,
  ASK_REPLY_MAX,
  askPingKey,
  formatAskReply,
  formatSpendWarningReply,
  SPEND_CAP_HEADLINE,
  SPEND_CAP_STATUS,
  withSpendWarningPost,
} from "../src/discord/ask-ping.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import { InflightReplyStore } from "../src/discord/inflight-replies.ts";
import { pickCustomId } from "../src/discord/ask-buttons.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import {
  THINKING_COLORS,
  type DiscordEmbedPayload,
  type EditMessageOpts,
  type ThinkingOutbound,
} from "../src/discord/thinking-status.ts";
import type { SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import { formatStatusReport } from "../src/discord/command-handlers/status.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const OWNER_ID = "111122223333444455";
const OWNER = { discordId: OWNER_ID, display: "Leif" };
const WARNING: SpendWarning = { spentMicroUsd: 4_100_000, capMicroUsd: 5_000_000, percent: 82 };
const CAP_ASK: HumanAsk = spendCapReachedAsk({
  spentMicroUsd: 4_999_000,
  estimateMicroUsd: 2_600,
  capMicroUsd: 5_000_000,
});

describe("spend-cap ask on Discord (ask path + owner ping)", () => {
  test("headline and status say the run paused at the cap; owner pinged; not a failure", () => {
    const r = formatAskReply({ ask: CAP_ASK, owner: OWNER, replyHint: true });
    const lines = r.content.split("\n");
    expect(lines[0]).toBe(`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`);
    expect(r.content).toContain("> Daily spend cap reached (SAFE-8): $4.9990 spent in the last 24h");
    expect(r.content).toContain(SPEND_CAP_ENV);
    expect(r.status).toBe(SPEND_CAP_STATUS);
    expect(r.failed).toBe(false);
    expect(r.mentionUserIds).toEqual([OWNER_ID]);
  });

  test("askPingKey ignores the live amounts of a spend-cap ask (one ping per cap episode)", () => {
    const other = spendCapReachedAsk({ spentMicroUsd: 4_000_000, estimateMicroUsd: 9, capMicroUsd: 5_000_000 });
    expect(askPingKey(other)).toBe(askPingKey(CAP_ASK));
    expect(askPingKey(CAP_ASK)).not.toBe(askPingKey({ reason: "clarify", question: CAP_ASK.question }));
    // Other reasons still key on the question.
    expect(askPingKey({ reason: "clarify", question: "a" })).not.toBe(askPingKey({ reason: "clarify", question: "b" }));
  });
});

describe("80% warning line (formatSpendWarningReply / withSpendWarningPost)", () => {
  test("owner mentioned in the line and allowed; no owner → plain line, no mention", () => {
    const withOwner = formatSpendWarningReply(WARNING, OWNER);
    expect(withOwner.line).toStartWith(`⚠️ <@${OWNER_ID}> Spend warning (SAFE-8): $4.10 of the $5.00 daily cap`);
    expect(withOwner.mentionUserIds).toEqual([OWNER_ID]);
    const none = formatSpendWarningReply(WARNING, null);
    expect(none.line).toStartWith("⚠️ Spend warning (SAFE-8)");
    expect(none.mentionUserIds).toEqual([]);
  });

  test("no warning → same post object; warning → appended line, mention ids merged", () => {
    const post: { channelId: string; content: string; mentionUserIds?: string[] } = {
      channelId: "c",
      content: "all good",
    };
    expect(withSpendWarningPost(post, undefined, OWNER)).toBe(post);
    const out = withSpendWarningPost({ ...post, mentionUserIds: ["u2", OWNER_ID] }, WARNING, OWNER);
    expect(out.content).toStartWith("all good\n\n⚠️ <@");
    expect(out.mentionUserIds).toEqual(["u2", OWNER_ID]);
    const plain = withSpendWarningPost(post, WARNING, null);
    expect(plain.mentionUserIds).toBeUndefined();
  });

  test("a long post is cut so the warning line always fits", () => {
    const out = appendPostLine("x".repeat(5000), "LINE");
    expect(out.length).toBeLessThanOrEqual(ASK_REPLY_MAX);
    expect(out).toEndWith("…\n\nLINE");
  });
});

type Reply = { channelId: string; content: string; replyToMessageId?: string; mentionUserIds?: string[] };

async function bridgeWith(
  agent: AgentClient,
  env: Record<string, string>,
  db = openCorvidinhoDb({ memory: true }),
  /** True while gateway posts should fail (the live gateway then returns null). */
  failReplies: () => boolean = () => false,
  /**
   * Thinking outbound. Default: embeds only (no `editMessage`), so the run
   * answers with the fallback reply (DISCORD-ASK-6/7 collapse unavailable);
   * pass one with `editMessage` to exercise the collapsed single message.
   */
  thinkingOutbound?: ThinkingOutbound,
) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const replies: Reply[] = [];
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: "chan-1",
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: join(mkdtempSync(join(tmpdir(), "corvidinho-spend-")), "none.toml"),
      ...env,
    },
    db,
    projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-spend-proj-")),
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound: thinkingOutbound ?? {
      sendEmbed: outbound.sendEmbed,
      editEmbed: outbound.editEmbed,
    },
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent,
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      handlers.reply = async (opts) => {
        if (failReplies()) return null;
        replies.push(opts);
        return { messageId: `bot_${replies.length}` };
      };
      return createNullGateway();
    },
  });
  if (!result.ok || !box.handlers) throw new Error("bridge did not start");
  return { result, handlers: box.handlers, outbound, replies };
}

const MENTION = {
  id: "m1",
  channelId: "chan-1",
  authorId: "222233334444555566",
  authorBot: false,
  content: "@bot add storage",
  mentionedBot: true,
};

describe("bridge replies", () => {
  test("spend-cap ask → question + owner ping; status paused, not an error (fallback reply path)", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: `state=blocked\n${formatAskSummary(CAP_ASK)}`, exitCode: 0, ask: CAP_ASK };
      },
    };
    const { result, handlers, outbound, replies } = await bridgeWith(agent, { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID });
    await handlers.onMessage(MENTION);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toContain(SPEND_CAP_HEADLINE);
    expect(replies[0]!.content).toContain("Daily spend cap reached");
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    const last = outbound.edits[outbound.edits.length - 1]!.embed as DiscordEmbedPayload;
    expect(last.description).toContain(SPEND_CAP_STATUS);
    expect(last.color).not.toBe(THINKING_COLORS.error);
    await result.stop();
  });

  test("80% warning → reply gets the warning line and pings the owner", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: "all good", exitCode: 0, spendWarning: WARNING };
      },
    };
    const { result, handlers, replies } = await bridgeWith(agent, { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID });
    await handlers.onMessage(MENTION);
    expect(replies[0]!.content).toStartWith("all good\n\n⚠️ <@");
    expect(replies[0]!.content).toContain("$4.10 of the $5.00 daily cap used in the last 24h (82%)");
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    await result.stop();
  });

  test("/status shows 24 h spend vs the cap from the shared DB", async () => {
    const db = openCorvidinhoDb({ memory: true });
    new SpendLedger(db).reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: 4_100_000, capMicroUsd: 1e12, now: Date.now() - 1000 });
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: "x", exitCode: 0 };
      },
    };
    const { result, handlers } = await bridgeWith(
      agent,
      { [SPEND_CAP_ENV]: "5", CORVIDINHO_LLM_MODEL: "gpt-4o-mini" },
      db,
    );
    const replies: SlashReplyPayload[] = [];
    const ix: SlashInteraction = {
      id: "ix_1",
      commandName: "status",
      channelId: "chan-1",
      userId: "user-1",
      options: {},
      reply: async (p) => void replies.push(p),
    };
    await handlers.onSlash!(ix);
    expect(replies[0]?.ephemeral).toBe(true);
    expect(replies[0]?.content).toContain("Spend (24h): $4.10 of $5.00 daily cap (82%) — ⚠️ past 80%");
    await result.stop();
  });

  test("formatStatusReport: the spend line is listed when supplied", () => {
    const body = formatStatusReport({
      version: "0.0.0",
      protocolVersion: 2,
      startedAt: 0,
      now: 60_000,
      channelCount: 1,
      sessions: 0,
      workActive: 0,
      workDone: 0,
      workFailed: 0,
      llmLine: "LLM: demo stub",
      spendLine: "Spend cap: off (set CORVIDINHO_DAILY_SPEND_CAP_USD to track spend)",
    });
    expect(body).toContain("Spend cap: off");
  });
});

describe("spawn client reads spendWarning from the result frame", () => {
  test("valid amounts pass (percent recomputed); a malformed warning is dropped", async () => {
    const run = async (result: TaskResult) => {
      const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-bin-"));
      const bin = join(dir, "corvidinho");
      writeFileSync(bin, `#!/bin/sh\ncat <<'NDJSON_EOF'\n${serializeFrame(resultFrame(result))}\nNDJSON_EOF\n`, {
        mode: 0o755,
      });
      chmodSync(bin, 0o755);
      return createSpawnAgentClient({ bin, cwd: dir }).runChat({ prompt: "p", sessionId: "s1" });
    };
    const base: TaskResult = {
      summary: "ok",
      filesChanged: [],
      verified: false,
      verifySkipped: true,
      cancelled: false,
      state: "done",
      attempts: 1,
    };
    const good = await run({ ...base, spendWarning: { ...WARNING, percent: 5 } });
    expect(good.spendWarning).toEqual(WARNING);
    const bad = await run({ ...base, spendWarning: { spentMicroUsd: "lots", capMicroUsd: 1 } as never });
    expect("spendWarning" in bad).toBe(false);
  }, 30_000);
});

describe("scheduler post carries the 80% warning", () => {
  test("warning line appended to the ✅ post; owner pinged", async () => {
    const store = new ScheduleStore();
    const posts: Array<{ channelId: string; content: string; mentionUserIds?: string[] }> = [];
    const past = Date.now() - 60_000;
    const s = store.create({
      name: "Nightly",
      cronExpression: "0 * * * *",
      project: "proj-a",
      prompt: "do thing",
      createdByUserId: "admin",
      channelId: "chan-allowed",
      now: past - 3_600_000,
    });
    s.nextRunAt = past;
    const cfg = emptyConfig();
    cfg.discord.channels = ["chan-allowed"];
    const svc = new SchedulerService({
      store,
      agent: {
        async runChat({ sessionId }) {
          return { ok: true, sessionId, summary: "done", exitCode: 0, spendWarning: WARNING };
        },
      },
      allowlist: cfg,
      manual: true,
      useWorktrees: false,
      owner: OWNER,
      outbound: { post: async (p) => void posts.push(p) },
    });
    await svc.tick();
    for (let i = 0; i < 50 && svc.runningIds().length > 0; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    svc.stop();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.content).toStartWith("✅ Schedule **Nightly**");
    expect(posts[0]!.content).toContain(`⚠️ <@${OWNER_ID}> Spend warning (SAFE-8)`);
    expect(posts[0]!.mentionUserIds).toEqual([OWNER_ID]);
  });
});

// ─── Delivery: recorded anywhere, delivered by the bridge (review #160) ──────

function slashInteraction(commandName: "work" | "session", options: Record<string, string>) {
  const edits: SlashReplyPayload[] = [];
  const ix: SlashInteraction = {
    id: `ix_${commandName}_${Math.random()}`,
    commandName,
    ...(commandName === "session" ? { subcommand: "start" } : {}),
    channelId: "chan-1",
    userId: "222233334444555566",
    options,
    reply: async (p) => void edits.push(p),
    deferReply: async () => {},
    editReply: async (p) => void edits.push(p),
    deleteReply: async () => {
      deleted.push(true);
    },
  };
  const deleted: boolean[] = [];
  return { ix, edits, deleted };
}

const CAP_RESULT = {
  ok: true,
  summary: SPEND_CAP_SUMMARY,
  exitCode: 0,
  ask: CAP_ASK,
  task: { state: "blocked", verified: false, verifySkipped: true, attempts: 1, cancelled: false },
};

describe("80% warning reaches the owner even when the crossing run could not show it", () => {
  test("a WATCH-style run crosses 80% (warning ignored there); the next bridge reply pings the owner once", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-spend-deliver-"));
    const path = join(dir, "corvidinho.db");
    try {
      // The other process (e.g. `github watch` or the daemon) shares the data dir.
      const runnerDb = openCorvidinhoDb({ path });
      new SpendLedger(runnerDb).reserve({
        provider: "p",
        model: "gpt-4o-mini",
        estimateMicroUsd: 799_800,
        capMicroUsd: Number.MAX_SAFE_INTEGER,
        now: Date.now() - 1000,
      });
      const ignored: SpendWarning[] = [];
      const guard = createSpendGuard(
        async () =>
          Response.json({
            choices: [{ message: { content: "ok" } }],
            usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
          }),
        { env: { [SPEND_CAP_ENV]: "1" }, readUsage: extractUsage, db: runnerDb, onWarning: (w) => ignored.push(w) },
      );
      await guard.fetch("https://llm.test/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [] }),
      });
      expect(ignored).toHaveLength(1); // recorded, but WATCH never shows it
      runnerDb.close();

      const agent: AgentClient = {
        async runChat({ sessionId }) {
          return { ok: true, sessionId, summary: "all good", exitCode: 0 };
        },
      };
      const { result, handlers, replies } = await bridgeWith(
        agent,
        { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID, [SPEND_CAP_ENV]: "1" },
        openCorvidinhoDb({ path }),
      );
      await handlers.onMessage(MENTION);
      expect(replies[0]!.content).toStartWith("all good\n\n⚠️ <@");
      expect(replies[0]!.content).toContain("of the $1.00 daily cap used in the last 24h (80%)");
      expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
      await handlers.onMessage({ ...MENTION, id: "m2" });
      expect(replies[1]!.content).toBe("all good");
      await result.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("/work delivers a pending warning as a fresh post that pings the owner", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const ledger = new SpendLedger(db);
    ledger.reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: 850_000, capMicroUsd: 1e12, now: Date.now() - 1000 });
    expect(ledger.noteWarning({ capMicroUsd: 1_000_000, now: Date.now() })).not.toBeNull();
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: "did it", exitCode: 0 };
      },
    };
    const { result, handlers, replies } = await bridgeWith(agent, { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID }, db);
    const { ix, edits } = slashInteraction("work", { description: "add storage" });
    await handlers.onSlash!(ix);
    expect(edits.at(-1)!.content).toContain("(completed)");
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toStartWith(`⚠️ <@${OWNER_ID}> Spend warning (SAFE-8): $0.85 of the $1.00 daily cap`);
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    await result.stop();
  });
});

describe("spend-cap ask: once per cap episode, no reply hint, blocked (not done) on slash runs", () => {
  test("chat: the first ask at the cap pings the owner; later ones post without a ping or a reply hint", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ...CAP_RESULT, sessionId };
      },
    };
    const { result, handlers, replies } = await bridgeWith(
      agent,
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID, [SPEND_CAP_ENV]: "5" },
      db,
    );
    await handlers.onMessage(MENTION);
    await handlers.onMessage({ ...MENTION, id: "m2" });
    expect(replies[0]!.content).toContain(`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`);
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    expect(replies[1]!.content).toContain(SPEND_CAP_HEADLINE);
    expect(replies[1]!.content).not.toContain("<@");
    expect(replies[1]!.mentionUserIds).toEqual([]);
    for (const r of replies) {
      expect(r.content).not.toContain(ASK_REPLY_HINT);
      expect(r.content).toContain("Replying can't lift the cap");
    }
    // Spend seen back under 70% (the next call's check) re-arms the ping.
    new SpendLedger(db).reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: 1, capMicroUsd: 5_000_000, now: Date.now() });
    await handlers.onMessage({ ...MENTION, id: "m3" });
    expect(replies[2]!.mentionUserIds).toEqual([OWNER_ID]);
    await result.stop();
  });

  test("/work at the cap: blocked task, paused status, ask in the reply, owner pinged once in a fresh post", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ...CAP_RESULT, sessionId };
      },
    };
    const { result, handlers, replies, outbound } = await bridgeWith(agent, {
      CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
      [SPEND_CAP_ENV]: "5",
    });
    const { ix, edits } = slashInteraction("work", { description: "add storage" });
    await handlers.onSlash!(ix);
    const body = edits.at(-1)!.content!;
    expect(body).toContain("(blocked)");
    expect(body).toContain(SPEND_CAP_HEADLINE);
    expect(body).toContain("Daily spend cap reached (SAFE-8)");
    expect(body).toContain("PR: not opened — the work run paused at the daily spend cap (SAFE-8).");
    expect(body).not.toContain("✅");
    expect(body).not.toContain("<@");
    if (!result.ok) throw new Error("bridge did not start");
    expect(result.workStore.list()[0]!.status).toBe("blocked");
    const last = outbound.edits[outbound.edits.length - 1]!.embed as DiscordEmbedPayload;
    expect(last.description).toContain(SPEND_CAP_STATUS);
    expect(last.color).not.toBe(THINKING_COLORS.error);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toMatch(
      new RegExp(`^💸 <@${OWNER_ID}> /work \`work_[0-9a-f]+\` paused at the daily spend cap`),
    );
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    // Same cap episode: the next /work posts its reply but does not ping again.
    const second = slashInteraction("work", { description: "more storage" });
    await handlers.onSlash!(second.ix);
    expect(second.edits.at(-1)!.content).toContain("(blocked)");
    expect(replies).toHaveLength(1);
    await result.stop();
  });

  test("a spend-cap stop is not the pending ask: a later \"ok\" runs the agent (no restated cap ask), a substantive reply carries no cap text", async () => {
    const prompts: string[] = [];
    const agent: AgentClient = {
      async runChat({ sessionId, prompt }) {
        prompts.push(prompt);
        return { ...CAP_RESULT, sessionId };
      },
    };
    const { result, handlers, replies } = await bridgeWith(agent, {
      CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
      [SPEND_CAP_ENV]: "5",
    });
    await handlers.onMessage(MENTION);
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    if (!result.ok) throw new Error("bridge did not start");
    expect(result.store.getByBotMessage("bot_1")?.pendingAsk ?? null).toBeNull();
    const reply = (id: string, content: string, ref: string) => ({
      id,
      channelId: "chan-1",
      authorId: MENTION.authorId,
      authorBot: false,
      content,
      mentionedBot: false,
      referencedMessageId: ref,
    });
    await handlers.onMessage(reply("m2", "ok", "bot_1"));
    // The agent ran again (still at the cap: the ask posts, no second ping).
    expect(prompts).toHaveLength(2);
    expect(replies[1]!.content).toContain(SPEND_CAP_HEADLINE);
    expect(replies[1]!.mentionUserIds).toEqual([]);
    await handlers.onMessage(reply("m3", "the cap is raised now, please continue", "bot_2"));
    expect(prompts).toHaveLength(3);
    expect(prompts[2]).not.toContain("Prior clarifying question");
    expect(prompts[2]).not.toContain("Daily spend cap reached");
    await result.stop();
  });

  test("a spend-cap ask persisted as pending by an earlier build loads as no pending ask", () => {
    const db = openCorvidinhoDb({ memory: true });
    const now = Date.now();
    db.run(
      `INSERT INTO discord_sessions (id, channel_id, user_id, created_at, last_activity_at, pending_ask)
       VALUES ('sess_cap', 'chan-1', 'u', ?, ?, ?), ('sess_clarify', 'chan-1', 'u', ?, ?, ?)`,
      [now, now, JSON.stringify(CAP_ASK), now, now, JSON.stringify({ reason: "clarify", question: "A or B?" })],
    );
    db.run("INSERT INTO discord_session_bot_messages (bot_message_id, session_id) VALUES ('b_cap', 'sess_cap'), ('b_clarify', 'sess_clarify')");
    const store = new SessionStore({ db });
    expect(store.getByBotMessage("b_cap")?.pendingAsk).toBeNull();
    expect(store.getByBotMessage("b_clarify")?.pendingAsk).toMatchObject({ reason: "clarify", question: "A or B?" });
  });

  test("/work with a clarify ask: blocked, addresses the requester, no owner post (AUTONOMY-4)", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return {
          ...CAP_RESULT,
          sessionId,
          summary: "Needs your input: Postgres or SQLite?",
          ask: { reason: "clarify", question: "Postgres or SQLite?" },
        };
      },
    };
    const { result, handlers, replies } = await bridgeWith(agent, { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID });
    const { ix, edits } = slashInteraction("work", { description: "pick a DB" });
    await handlers.onSlash!(ix);
    const body = edits.at(-1)!.content!;
    expect(body).toContain("(blocked)");
    expect(body).toContain("<@222233334444555566>");
    expect(body).toContain("> Postgres or SQLite?");
    expect(body).not.toContain(`<@${OWNER_ID}>`);
    expect(replies).toHaveLength(0);
    await result.stop();
  });

  test("/session start at the cap shows the ask (not ✅) and pings the owner", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ...CAP_RESULT, sessionId };
      },
    };
    const { result, handlers, replies } = await bridgeWith(agent, { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID });
    const { ix, edits } = slashInteraction("session", { topic: "storage" });
    await handlers.onSlash!(ix);
    expect(edits.at(-1)!.content).toContain(SPEND_CAP_HEADLINE);
    expect(replies[0]!.content).toMatch(
      new RegExp(`^💸 <@${OWNER_ID}> /session \`[^\`]+\` paused at the daily spend cap`),
    );
    await result.stop();
  });

  test("without a gateway post (or when it fails) the owner notice is appended to the slash reply", async () => {
    const reply = (edits: SlashReplyPayload[]): SlashInteraction => ({
      id: "ix",
      commandName: "work",
      channelId: "c",
      userId: "u",
      options: {},
      reply: async (p) => void edits.push(p),
      editReply: async (p) => void edits.push(p),
    });
    const edits: SlashReplyPayload[] = [];
    await finishSlashWithOwnerNotice({
      thinking: null,
      interaction: reply(edits),
      sessionId: "s",
      ok: true,
      body: "Work task `w` (blocked).",
      notice: { content: `💸 <@${OWNER_ID}> x`, mentionUserIds: [OWNER_ID], release: () => {} },
    });
    expect(edits.map((e) => e.content)).toEqual([`Work task \`w\` (blocked).\n\n💸 <@${OWNER_ID}> x`]);
    const edits2: SlashReplyPayload[] = [];
    await finishSlashWithOwnerNotice({
      thinking: null,
      interaction: reply(edits2),
      sessionId: "s",
      ok: true,
      body: "B",
      notice: { content: "N", mentionUserIds: [], release: () => {} },
      post: async () => null,
    });
    expect(edits2.map((e) => e.content)).toEqual(["B", "B\n\nN"]);
  });

  test("schedule: a spend-cap ask already pinged this episode posts without a ping", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const outbox = createSpendAlertOutbox({ db, env: { [SPEND_CAP_ENV]: "5" } });
    expect(outbox.claimCapPing()).not.toBeNull(); // e.g. a chat reply pinged already
    const store = new ScheduleStore();
    const posts: Array<{ channelId: string; content: string; mentionUserIds?: string[] }> = [];
    const past = Date.now() - 60_000;
    const s = store.create({
      name: "Nightly",
      cronExpression: "0 * * * *",
      project: "proj-a",
      prompt: "do thing",
      createdByUserId: "admin",
      channelId: "chan-allowed",
      now: past - 3_600_000,
    });
    s.nextRunAt = past;
    const cfg = emptyConfig();
    cfg.discord.channels = ["chan-allowed"];
    const svc = new SchedulerService({
      store,
      agent: {
        async runChat({ sessionId }) {
          return { ...CAP_RESULT, sessionId };
        },
      },
      allowlist: cfg,
      manual: true,
      useWorktrees: false,
      owner: OWNER,
      spendAlerts: outbox,
      outbound: { post: async (p) => void posts.push(p) },
    });
    await svc.tick();
    for (let i = 0; i < 50 && svc.runningIds().length > 0; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    svc.stop();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.content).toContain(SPEND_CAP_HEADLINE);
    expect(posts[0]!.content).not.toContain("<@");
    expect(posts[0]!.mentionUserIds).toEqual([]);
  });
});

describe("a post that did not go out hands back its warning and cap ping (review #160)", () => {
  function pendingWarningDb() {
    const db = openCorvidinhoDb({ memory: true });
    const ledger = new SpendLedger(db);
    ledger.reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: 850_000, capMicroUsd: 1e12, now: Date.now() - 1000 });
    expect(ledger.noteWarning({ capMicroUsd: 1_000_000, now: Date.now() })).not.toBeNull();
    return db;
  }
  const expired = () => new Error("Unknown interaction (token expired)");

  test("/work whose final reply fails (expired token) still posts the owner notice with the warning; the error is re-thrown", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ...CAP_RESULT, sessionId };
      },
    };
    const { result, handlers, replies } = await bridgeWith(
      agent,
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID, [SPEND_CAP_ENV]: "5" },
      pendingWarningDb(),
    );
    const { ix } = slashInteraction("work", { description: "add storage" });
    ix.editReply = async () => {
      throw expired();
    };
    await expect(handlers.onSlash!(ix)).rejects.toThrow("token expired");
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toMatch(new RegExp(`^💸 <@${OWNER_ID}> /work \`work_[0-9a-f]+\` paused at the daily spend cap`));
    expect(replies[0]!.content).toContain(`⚠️ <@${OWNER_ID}> Spend warning (SAFE-8): $0.85 of the $1.00 daily cap`);
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    await result.stop();
  });

  test("/session start whose reply and notice both fail hands back the warning and the cap ping: the next chat reply carries both", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ...CAP_RESULT, sessionId };
      },
    };
    let failing = true;
    const { result, handlers, replies } = await bridgeWith(
      agent,
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID, [SPEND_CAP_ENV]: "5" },
      pendingWarningDb(),
      () => failing,
    );
    const { ix } = slashInteraction("session", { topic: "storage" });
    ix.editReply = async () => {
      throw expired();
    };
    await expect(handlers.onSlash!(ix)).rejects.toThrow("token expired");
    expect(replies).toHaveLength(0);
    failing = false;
    await handlers.onMessage(MENTION);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toContain(`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`);
    expect(replies[0]!.content).toContain("Spend warning (SAFE-8): $0.85 of the $1.00 daily cap");
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    await result.stop();
  });

  test("a run resumed by a button pick that stops at the cap: free-text ask with the owner pinged once, the warning delivered, no pending ask", async () => {
    let n = 0;
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        n += 1;
        if (n === 1) {
          return {
            ok: true,
            sessionId,
            summary: "Needs your input",
            exitCode: 0,
            ask: {
              reason: "clarify",
              question: "Which DB?",
              options: [
                { id: "1", label: "Postgres" },
                { id: "2", label: "SQLite" },
              ],
            },
            task: { verified: false, verifySkipped: true, state: "blocked" },
          };
        }
        return { ...CAP_RESULT, sessionId };
      },
    };
    const db = openCorvidinhoDb({ memory: true });
    const { result, handlers, replies } = await bridgeWith(
      agent,
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID, [SPEND_CAP_ENV]: "5" },
      db,
    );
    if (!result.ok) throw new Error("bridge did not start");
    await handlers.onMessage(MENTION);
    const askId = result.store.list()[0]!.pendingAsk!.askId;
    // Another run crosses 80% while the button ask waits.
    const ledger = new SpendLedger(db);
    ledger.reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: 850_000, capMicroUsd: 1e12, now: Date.now() - 1000 });
    expect(ledger.noteWarning({ capMicroUsd: 1_000_000, now: Date.now() })).not.toBeNull();
    const pick = (id: string) => ({
      id,
      customId: pickCustomId(askId, "1"),
      channelId: "chan-1",
      userId: MENTION.authorId,
      messageId: "bot_1",
      reply: async () => {},
    });
    await handlers.onComponent!(pick("ix-pick"));
    const last = replies.at(-1)! as Reply & { components?: unknown[] };
    expect(last.content).toContain(`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`);
    expect(last.content).toContain("Spend warning (SAFE-8): $0.85 of the $1.00 daily cap");
    expect(last.mentionUserIds).toEqual([OWNER_ID]);
    expect(last.components).toBeUndefined();
    expect(result.store.list()[0]!.pendingAsk ?? null).toBeNull();
    await result.stop();
  });

  test("chat: a spend-cap reply that failed to post does not use up the episode's owner ping", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ...CAP_RESULT, sessionId };
      },
    };
    let failing = true;
    const { result, handlers, replies } = await bridgeWith(
      agent,
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID, [SPEND_CAP_ENV]: "5" },
      openCorvidinhoDb({ memory: true }),
      () => failing,
    );
    await handlers.onMessage(MENTION);
    expect(replies).toHaveLength(0);
    failing = false;
    await handlers.onMessage({ ...MENTION, id: "m2" });
    expect(replies[0]!.content).toContain(`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`);
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    await result.stop();
  });

  test("schedule: a spend-cap post that failed keeps no ping key and hands the cap ping back; the next tick pings", async () => {
    const outbox = createSpendAlertOutbox({ db: openCorvidinhoDb({ memory: true }), env: { [SPEND_CAP_ENV]: "5" } });
    const store = new ScheduleStore();
    const posts: Array<{ channelId: string; content: string; mentionUserIds?: string[] }> = [];
    const s = store.create({
      name: "Nightly",
      cronExpression: "0 * * * *",
      project: "proj-a",
      prompt: "do thing",
      createdByUserId: "admin",
      channelId: "chan-allowed",
      now: Date.now() - 7_200_000,
    });
    const cfg = emptyConfig();
    cfg.discord.channels = ["chan-allowed"];
    let failing = true;
    const svc = new SchedulerService({
      store,
      agent: {
        async runChat({ sessionId }) {
          return { ...CAP_RESULT, sessionId };
        },
      },
      allowlist: cfg,
      manual: true,
      useWorktrees: false,
      owner: OWNER,
      spendAlerts: outbox,
      outbound: {
        post: async (p) => {
          if (failing) return false;
          posts.push(p);
          return true;
        },
      },
    });
    const runDue = async () => {
      s.nextRunAt = Date.now() - 60_000;
      await svc.tick();
      for (let i = 0; i < 50 && svc.runningIds().length > 0; i++) {
        await new Promise((r) => setTimeout(r, 10));
      }
    };
    await runDue();
    expect(posts).toHaveLength(0);
    expect(store.get(s.id)?.askPingKey ?? null).toBeNull();
    failing = false;
    await runDue();
    svc.stop();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.content).toContain(`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`);
    expect(posts[0]!.mentionUserIds).toEqual([OWNER_ID]);
  });
});

// ─── DISCORD-ASK-6/7 collapsed single message (thinking edited into the answer) ──

/** Thinking outbound whose `editMessage` records every edit and can fail. */
function collapseOutbound(failEdits: () => boolean = () => false) {
  const base = memoryThinkingOutbound();
  const finals: EditMessageOpts[] = [];
  const outbound: ThinkingOutbound = {
    sendEmbed: base.sendEmbed,
    editEmbed: base.editEmbed,
    async editMessage(opts) {
      if (failEdits()) return false;
      finals.push(opts);
      return true;
    },
  };
  return { outbound, finals };
}

describe("collapsed answer (DISCORD-ASK-6/7) carries SAFE-8 like a reply", () => {
  function pendingWarningDb() {
    const db = openCorvidinhoDb({ memory: true });
    const ledger = new SpendLedger(db);
    ledger.reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: 850_000, capMicroUsd: 1e12, now: Date.now() - 1000 });
    expect(ledger.noteWarning({ capMicroUsd: 1_000_000, now: Date.now() })).not.toBeNull();
    return db;
  }

  test("the 80% warning and the owner mention ride the edit of the thinking message; the only fresh post is the owner ping (an edit does not notify)", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: "all good", exitCode: 0 };
      },
    };
    const { outbound, finals } = collapseOutbound();
    const { result, handlers, replies } = await bridgeWith(
      agent,
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID },
      pendingWarningDb(),
      () => false,
      outbound,
    );
    await handlers.onMessage(MENTION);
    expect(finals).toHaveLength(1);
    expect(finals[0]!.content).toStartWith(`all good\n\n⚠️ <@${OWNER_ID}> Spend warning (SAFE-8): $0.85 of the $1.00 daily cap`);
    expect(finals[0]!.mentionUserIds).toEqual([OWNER_ID]);
    // DISCORD-3.a — the answer keeps a footer-only embed (model).
    expect(finals[0]!.embed).toStrictEqual({
      color: THINKING_COLORS.success,
      footer: { text: loadLlmEnv(process.env).model },
    });
    // REQ-discord-215: one short fresh post pings the owner (no answer copy).
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toBe(`<@${OWNER_ID}> ↑ needs you`);
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    expect(replies[0]!.replyToMessageId).toBe(finals[0]!.messageId);
    // Delivered once: the next answer carries no warning and pings nobody.
    await handlers.onMessage({ ...MENTION, id: "m2" });
    expect(finals[1]!.content).toBe("all good");
    expect(replies).toHaveLength(1);
    await result.stop();
  });

  test("REQ-discord-311: a collapsed answer carrying the 80% warning clears its in-flight row; so does a turn where nothing went out (claims handed back)", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: "all good", exitCode: 0 };
      },
    };
    let failing = false;
    const db = pendingWarningDb();
    const inflight = new InflightReplyStore(db);
    const { outbound, finals } = collapseOutbound(() => failing);
    const { result, handlers, replies } = await bridgeWith(
      agent,
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID },
      db,
      () => failing,
      outbound,
    );
    await handlers.onMessage(MENTION);
    expect(finals[0]!.content).toContain(`⚠️ <@${OWNER_ID}> Spend warning (SAFE-8)`);
    expect(inflight.list()).toEqual([]);
    // A second warning is pending; edit and fallback reply both fail.
    const ledger = new SpendLedger(db);
    ledger.reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: 1, capMicroUsd: 1e12, now: Date.now() });
    expect(ledger.noteWarning({ capMicroUsd: 1_000_001, now: Date.now() })).not.toBeNull();
    failing = true;
    await handlers.onMessage({ ...MENTION, id: "m2" });
    // Only the first answer's owner ping (REQ-discord-215) went out.
    expect(replies).toHaveLength(1);
    expect(inflight.list()).toEqual([]);
    failing = false;
    await handlers.onMessage({ ...MENTION, id: "m3" });
    expect(finals.at(-1)!.content).toContain(`⚠️ <@${OWNER_ID}> Spend warning (SAFE-8)`);
    expect(inflight.list()).toEqual([]);
    await result.stop();
  });

  test("a spend-cap stop collapses to plain text (no buttons) that pings the owner once per episode and leaves no pending ask", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ...CAP_RESULT, sessionId };
      },
    };
    const { outbound, finals } = collapseOutbound();
    const { result, handlers, replies } = await bridgeWith(
      agent,
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID, [SPEND_CAP_ENV]: "5" },
      openCorvidinhoDb({ memory: true }),
      () => false,
      outbound,
    );
    if (!result.ok) throw new Error("bridge did not start");
    await handlers.onMessage(MENTION);
    await handlers.onMessage({ ...MENTION, id: "m2" });
    // One fresh owner ping for the episode (REQ-discord-215), none for the second stop.
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toBe(`<@${OWNER_ID}> ↑ needs you`);
    expect(finals).toHaveLength(2);
    expect(finals[0]!.content).toContain(`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`);
    expect(finals[0]!.content).not.toContain(ASK_REPLY_HINT);
    expect(finals[0]!.components).toBeNull();
    expect(finals[0]!.mentionUserIds).toEqual([OWNER_ID]);
    expect(finals[1]!.content).toContain(SPEND_CAP_HEADLINE);
    expect(finals[1]!.content).not.toContain("<@");
    expect(finals[1]!.mentionUserIds).toEqual([]);
    for (const s of result.store.list()) expect(s.pendingAsk ?? null).toBeNull();
    await result.stop();
  });

  test("collapsed edit fails → the fallback reply carries the warning; edit and reply both fail → warning and cap ping go to the next answer", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ...CAP_RESULT, sessionId };
      },
    };
    let failEdits = true;
    let failReplies = false;
    const { outbound, finals } = collapseOutbound(() => failEdits);
    const { result, handlers, replies } = await bridgeWith(
      agent,
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID, [SPEND_CAP_ENV]: "5" },
      pendingWarningDb(),
      () => failReplies,
      outbound,
    );
    // Edit fails, the fallback reply goes out: it carries the ping and the warning.
    await handlers.onMessage(MENTION);
    expect(finals).toHaveLength(0);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toContain(`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`);
    expect(replies[0]!.content).toContain("Spend warning (SAFE-8): $0.85 of the $1.00 daily cap");
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    await result.stop();

    // Both fail: nothing went out, so both claims are handed back.
    const again = collapseOutbound(() => failEdits);
    const second = await bridgeWith(
      agent,
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID, [SPEND_CAP_ENV]: "5" },
      pendingWarningDb(),
      () => failReplies,
      again.outbound,
    );
    failReplies = true;
    await second.handlers.onMessage(MENTION);
    expect(again.finals).toHaveLength(0);
    expect(second.replies).toHaveLength(0);
    failEdits = false;
    failReplies = false;
    await second.handlers.onMessage({ ...MENTION, id: "m2" });
    expect(again.finals).toHaveLength(1);
    expect(again.finals[0]!.content).toContain(`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`);
    expect(again.finals[0]!.content).toContain("Spend warning (SAFE-8): $0.85 of the $1.00 daily cap");
    expect(again.finals[0]!.mentionUserIds).toEqual([OWNER_ID]);
    await second.result.stop();
  });

  test("a button pick whose run stops at the cap collapses the stub into the plain-text ask with the owner pinged and no pending ask", async () => {
    let n = 0;
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        n += 1;
        if (n === 1) {
          return {
            ok: true,
            sessionId,
            summary: "Needs your input",
            exitCode: 0,
            ask: {
              reason: "clarify",
              question: "Which DB?",
              options: [
                { id: "1", label: "Postgres" },
                { id: "2", label: "SQLite" },
              ],
            },
            task: { verified: false, verifySkipped: true, state: "blocked" },
          };
        }
        return { ...CAP_RESULT, sessionId };
      },
    };
    const { outbound, finals } = collapseOutbound();
    const { result, handlers } = await bridgeWith(
      agent,
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID, [SPEND_CAP_ENV]: "5" },
      openCorvidinhoDb({ memory: true }),
      () => false,
      outbound,
    );
    if (!result.ok) throw new Error("bridge did not start");
    await handlers.onMessage(MENTION);
    const stub = result.store.list()[0]!.pendingAsk!;
    expect(stub.stubMessageId).toBeTruthy();
    await handlers.onComponent!({
      id: "ix-pick",
      customId: pickCustomId(stub.askId, "1"),
      channelId: "chan-1",
      userId: MENTION.authorId,
      messageId: stub.stubMessageId!,
      reply: async () => {},
    });
    const last = finals.at(-1)!;
    expect(last.messageId).toBe(stub.stubMessageId!);
    expect(last.content).toContain(`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`);
    expect(last.components).toBeNull();
    expect(last.mentionUserIds).toEqual([OWNER_ID]);
    expect(result.store.list()[0]!.pendingAsk ?? null).toBeNull();
    await result.stop();
  });
});

describe("collapsed slash answer (DISCORD-ASK-7) keeps the SAFE-8 owner notice a fresh post", () => {
  function pendingWarningDb() {
    const db = openCorvidinhoDb({ memory: true });
    const ledger = new SpendLedger(db);
    ledger.reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: 850_000, capMicroUsd: 1e12, now: Date.now() - 1000 });
    expect(ledger.noteWarning({ capMicroUsd: 1_000_000, now: Date.now() })).not.toBeNull();
    return db;
  }
  const capAgent: AgentClient = {
    async runChat({ sessionId }) {
      return { ...CAP_RESULT, sessionId };
    },
  };

  test("/work at the cap: the thinking message becomes the paused ask (not ✅ Done), the deferred reply is dropped, the owner is pinged once in a fresh post with the warning", async () => {
    const { outbound, finals } = collapseOutbound();
    const { result, handlers, replies } = await bridgeWith(
      capAgent,
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID, [SPEND_CAP_ENV]: "5" },
      pendingWarningDb(),
      () => false,
      outbound,
    );
    if (!result.ok) throw new Error("bridge did not start");
    const first = slashInteraction("work", { description: "add storage" });
    await handlers.onSlash!(first.ix);
    expect(first.edits).toHaveLength(0);
    expect(first.deleted).toHaveLength(1);
    expect(finals).toHaveLength(1);
    expect(finals[0]!.content).toContain("(blocked)");
    expect(finals[0]!.content).toContain(SPEND_CAP_HEADLINE);
    expect(finals[0]!.content).not.toContain("✅");
    expect(finals[0]!.content).not.toContain("<@");
    expect(finals[0]!.mentionUserIds).toEqual([]);
    expect(result.workStore.list()[0]!.status).toBe("blocked");
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toMatch(new RegExp(`^💸 <@${OWNER_ID}> /work \`work_[0-9a-f]+\` paused at the daily spend cap`));
    expect(replies[0]!.content).toContain(`⚠️ <@${OWNER_ID}> Spend warning (SAFE-8): $0.85 of the $1.00 daily cap`);
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    // Same episode, warning delivered: no second owner post.
    const second = slashInteraction("work", { description: "more storage" });
    await handlers.onSlash!(second.ix);
    expect(finals).toHaveLength(2);
    expect(replies).toHaveLength(1);
    await result.stop();
  });

  test("/session start with a stuck ask: collapsed answer shows the ask (not ✅ Done) and the owner gets a fresh post; a clarify ask addresses the requester with no owner post (only the requester ping)", async () => {
    let reason: "stuck" | "clarify" = "stuck";
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return {
          ok: true,
          sessionId,
          summary: "Needs a human",
          exitCode: 0,
          ask: { reason, question: "Verify keeps failing — how should I proceed" },
          task: { state: "blocked", verified: false, verifySkipped: true, attempts: 3, cancelled: false },
        };
      },
    };
    const { outbound, finals } = collapseOutbound();
    const { result, handlers, replies } = await bridgeWith(agent, { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID }, openCorvidinhoDb({ memory: true }), () => false, outbound);
    await handlers.onSlash!(slashInteraction("session", { topic: "storage" }).ix);
    expect(finals[0]!.content).toContain("I'm stuck and need a human");
    expect(finals[0]!.content).not.toContain("✅");
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toMatch(new RegExp(`^⚠️ <@${OWNER_ID}> /session \`[^\`]+\` is stuck`));
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    reason = "clarify";
    await handlers.onSlash!(slashInteraction("session", { topic: "db" }).ix);
    expect(finals[1]!.content).toContain("<@222233334444555566>");
    expect(finals[1]!.mentionUserIds).toEqual(["222233334444555566"]);
    // No owner post; one fresh requester ping (REQ-discord-215).
    expect(replies).toHaveLength(2);
    expect(replies[1]!.content).toBe("<@222233334444555566> ↑ question for you");
    expect(replies[1]!.mentionUserIds).toEqual(["222233334444555566"]);
    await result.stop();
  });

  test("the fresh owner post fails: the notice is appended to the collapsed answer (edited again)", async () => {
    const { outbound, finals } = collapseOutbound();
    const { result, handlers, replies } = await bridgeWith(
      capAgent,
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID, [SPEND_CAP_ENV]: "5" },
      openCorvidinhoDb({ memory: true }),
      () => true,
      outbound,
    );
    await handlers.onSlash!(slashInteraction("work", { description: "add storage" }).ix);
    expect(replies).toHaveLength(0);
    expect(finals).toHaveLength(2);
    expect(finals[1]!.messageId).toBe(finals[0]!.messageId);
    expect(finals[1]!.content).toStartWith(finals[0]!.content!);
    expect(finals[1]!.content).toMatch(new RegExp(`💸 <@${OWNER_ID}> /work \`work_[0-9a-f]+\` paused at the daily spend cap`));
    expect(finals[1]!.mentionUserIds).toEqual([OWNER_ID]);
    // DISCORD-3.a (REQ-discord-457): the re-edit keeps the answer's
    // footer-only embed (model + plumbing, done color like the fallback's
    // paused status); the plumbing never enters either body.
    expect(finals[0]!.embed).toStrictEqual({
      color: THINKING_COLORS.success,
      footer: {
        text: `${loadLlmEnv(process.env).model} | state=blocked verified=false verifySkipped attempts=1`,
      },
    });
    expect(finals[1]!.embed).toStrictEqual(finals[0]!.embed);
    expect(finals[1]!.content).not.toContain("state=");
    await result.stop();
  });

  test("nothing carried the notice (collapse, owner post and re-edit all fail; the reply throws): the warning and the cap ping go to the next chat answer", async () => {
    let failing = true;
    const { outbound, finals } = collapseOutbound(() => failing);
    const { result, handlers, replies } = await bridgeWith(
      capAgent,
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID, [SPEND_CAP_ENV]: "5" },
      pendingWarningDb(),
      () => failing,
      outbound,
    );
    const { ix } = slashInteraction("work", { description: "add storage" });
    ix.editReply = async () => {
      throw new Error("Unknown interaction (token expired)");
    };
    await expect(handlers.onSlash!(ix)).rejects.toThrow("token expired");
    expect(finals).toHaveLength(0);
    expect(replies).toHaveLength(0);
    failing = false;
    await handlers.onMessage(MENTION);
    expect(finals).toHaveLength(1);
    expect(finals[0]!.content).toContain(`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`);
    expect(finals[0]!.content).toContain("Spend warning (SAFE-8): $0.85 of the $1.00 daily cap");
    expect(finals[0]!.mentionUserIds).toEqual([OWNER_ID]);
    await result.stop();
  });
});

describe("headless daemon logs the spend warning and the spend-cap stop", () => {
  test("spend.warning and run.needs_human (reason spend-cap) are warn lines", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "corvidinho-spend-daemon-"));
    const projectRoot = mkdtempSync(join(tmpdir(), "corvidinho-spend-daemon-proj-"));
    const env = { ...process.env, CORVIDINHO_DATA_DIR: dataDir };
    const lines: Array<Record<string, unknown>> = [];
    const other = openCorvidinhoDb({ env });
    try {
      const s = new ScheduleStore({ db: other }).create({
        name: "nightly",
        cronExpression: "0 * * * *",
        project: ".",
        prompt: "summarize",
        createdByUserId: "owner",
      });
      other.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [Date.now() - 1000, s.id]);
      const d = await startDaemon({
        env,
        projectRoot,
        logger: createDaemonLogger({ write: (l) => lines.push(JSON.parse(l)) }),
        agent: {
          async runChat({ sessionId }) {
            return { ...CAP_RESULT, sessionId, spendWarning: WARNING };
          },
        },
        useWorktrees: false,
      });
      expect(d.ok).toBe(true);
      if (!d.ok) return;
      await d.tick();
      await Bun.sleep(30);
      expect(lines.find((l) => l.event === "spend.warning")).toMatchObject({
        level: "warn",
        spentMicroUsd: WARNING.spentMicroUsd,
        capMicroUsd: WARNING.capMicroUsd,
        percent: 82,
      });
      expect(lines.find((l) => l.event === "run.needs_human")).toMatchObject({
        level: "warn",
        reason: "spend-cap",
        message: SPEND_CAP_SUMMARY,
      });
      await d.stop("SIGTERM");
    } finally {
      other.close();
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
