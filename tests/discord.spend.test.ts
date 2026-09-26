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
import { extractUsage } from "../src/agent/execute.ts";
import { createSpendGuard, SPEND_CAP_ENV, SpendLedger } from "../src/agent/spend.ts";
import { SPEND_CAP_SUMMARY, spendCapReachedAsk } from "../src/agent/spend-notice.ts";
import { createSpendAlertOutbox } from "../src/agent/spend-outbox.ts";
import type { HumanAsk, SpendWarning, TaskResult } from "../src/agent/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createDaemonLogger, startDaemon } from "../src/daemon/index.ts";
import { createSpawnAgentClient, type AgentClient } from "../src/discord/agent-client.ts";
import { replyWithOwnerNotice } from "../src/discord/spend-post.ts";
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
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { THINKING_COLORS, type DiscordEmbedPayload } from "../src/discord/thinking-status.ts";
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
    thinkingOutbound: outbound,
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
  test("spend-cap ask → question + owner ping; status paused (not error)", async () => {
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
  };
  return { ix, edits };
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
    expect(store.getByBotMessage("b_clarify")?.pendingAsk).toEqual({ reason: "clarify", question: "A or B?" });
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
    const edits: SlashReplyPayload[] = [];
    await replyWithOwnerNotice({
      interaction: { channelId: "c", reply: async (p) => void edits.push(p), editReply: async (p) => void edits.push(p) },
      body: "Work task `w` (blocked).",
      notice: { content: `💸 <@${OWNER_ID}> x`, mentionUserIds: [OWNER_ID], release: () => {} },
    });
    expect(edits.map((e) => e.content)).toEqual([`Work task \`w\` (blocked).\n\n💸 <@${OWNER_ID}> x`]);
    const edits2: SlashReplyPayload[] = [];
    await replyWithOwnerNotice({
      interaction: { channelId: "c", reply: async (p) => void edits2.push(p), editReply: async (p) => void edits2.push(p) },
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
