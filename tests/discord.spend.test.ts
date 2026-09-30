/**
 * SAFE-8 as amended on #98 on Discord (REQ-discord-098): the spend-cap ask
 * goes through the AUTONOMY-1/2 ask path with the owner pinged, and /status
 * shows the owner 24 h spend vs the cap (AUTONOMOUS-8). SAFE-14.a: only the
 * owner sees spend amounts and cap settings — every channel post says only
 * "Work is paused for budget.", the 80% warning and a cap stop's details go
 * to the owner by DM, and anyone else's /status shows at most that work is
 * paused. Fixtures only: fake gateway (replies and DMs recorded), fake sh
 * bin, in-memory DB — no live Discord, no network, no git worktrees.
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
import { chatBodyFromTaskResult, ROLE_REFUSED_SUMMARY_NOTE } from "../src/agent/task-summary.ts";
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
  SPEND_CAP_HEADLINE,
  SPEND_CAP_STATUS,
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
import { teamPeopleFile } from "./fixtures/team-people.ts";
import { useConfiguredModel } from "./fixtures/fake-llm.ts";

// The footer names the configured model; there is no built-in default
// (AGENT-13), so this file configures one (a priced id; the stub agent calls
// no model).
useConfiguredModel();

/** The /work and /session start requester: a declared team member. */
const SLASH_REQUESTER = "222233334444555566";

/** DISCORD-15: an answer footer is `<before> | <time> [| <after>]` (time from the real clock). */
function answerFooterText(before: string, after?: string) {
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return expect.stringMatching(
    new RegExp(`^${esc(before)} \\| \\d+s${after ? ` \\| ${esc(after)}` : ""}$`),
  );
}

const OWNER_ID = "111122223333444455";
const OWNER = { discordId: OWNER_ID, display: "Leif" };
const WARNING: SpendWarning = { spentMicroUsd: 4_100_000, capMicroUsd: 5_000_000, percent: 82 };
const CAP_ASK: HumanAsk = spendCapReachedAsk({
  spentMicroUsd: 4_999_000,
  estimateMicroUsd: 2_600,
  capMicroUsd: 5_000_000,
});
/** SAFE-14.a: all a channel learns about spend. */
const PAUSED = "Work is paused for budget.";
/** SAFE-14.a: no amount, cap value or setting name in `text`. */
function expectNoSpendDetails(text: string | null | undefined): void {
  const t = text ?? "";
  expect(t).not.toMatch(/\$\d/);
  expect(t).not.toContain("CORVIDINHO_");
  expect(t).not.toContain("SAFE-8");
  expect(t).not.toMatch(/daily (spend )?cap/i);
  expect(t).not.toMatch(/\d+%/);
}
/** The warning DM for the pending 80% warning below ($0.85 of $1.00). */
const WARNING_DM_85 = "⚠️ Spend warning (SAFE-8): $0.85 of the $1.00 daily cap used in the last 24h (85%)";

describe("spend-cap ask on Discord (ask path + owner ping)", () => {
  test("headline and status say only that work is paused for budget; the question is not quoted; owner pinged; not a failure (SAFE-14.a)", () => {
    const r = formatAskReply({ ask: CAP_ASK, owner: OWNER, replyHint: true });
    const lines = r.content.split("\n");
    expect(lines[0]).toBe(`💸 ${PAUSED} <@${OWNER_ID}>`);
    expect(lines).toHaveLength(1);
    expect(r.content).not.toContain("Daily spend cap reached");
    expectNoSpendDetails(r.content);
    expect(r.status).toBe(SPEND_CAP_STATUS);
    expect(r.status).toBe("💸 Work is paused for budget");
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

describe("appendPostLine (a slash owner notice or SAFE-13 line on a post)", () => {
  test("a long post is cut so the appended line always fits", () => {
    const out = appendPostLine("x".repeat(5000), "LINE");
    expect(out.length).toBeLessThanOrEqual(ASK_REPLY_MAX);
    expect(out).toEndWith("…\n\nLINE");
  });

  test("the cut for an appended line keeps a closing role note (REQ-discord-734, ROLES-CHAT-3)", () => {
    const tail = `\n\n${ROLE_REFUSED_SUMMARY_NOTE}`;
    // A non-ADMIN chat answer: 1800 chars, the note last.
    const content = chatBodyFromTaskResult({ summary: `${"y".repeat(2500)}${tail}` });
    expect(content.length).toBe(1800);
    const line = `💸 <@${OWNER_ID}> /work \`w\`: ${PAUSED} ${"z".repeat(150)}`;
    const out = appendPostLine(content, line);
    expect(out.length).toBe(ASK_REPLY_MAX);
    expect(out).toEndWith(`y…${tail}\n\n${line}`);
    // A body that fits is untouched.
    const short = `answer${tail}`;
    expect(appendPostLine(short, "LINE")).toBe(`${short}\n\nLINE`);
  });
});

type Reply = { channelId: string; content: string; replyToMessageId?: string; mentionUserIds?: string[] };
type Dm = { userId: string; content: string };

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
  /** True while DMs should fail (the live gateway then returns null). */
  failDms: () => boolean = () => false,
) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const replies: Reply[] = [];
  const dms: Dm[] = [];
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: "chan-1",
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      // IDENTITY-11.a: the slash requester is declared team (community can't
      // start /work); nothing else is in the file.
      CORVIDINHO_ALLOWLIST_FILE: teamPeopleFile(SLASH_REQUESTER),
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
      // SAFE-14.a: the owner's spend DMs.
      handlers.sendDm = async ({ userId, content }) => {
        if (failDms()) return null;
        dms.push({ userId, content });
        return { channelId: `dm_${userId}`, messageId: `dm_${dms.length}` };
      };
      return createNullGateway();
    },
  });
  if (!result.ok || !box.handlers) throw new Error("bridge did not start");
  return { result, handlers: box.handlers, outbound, replies, dms };
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
  test("spend-cap ask → only 'Work is paused for budget.' + owner ping in the channel; the details go to the owner by DM; status paused, not an error (fallback reply path)", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: SPEND_CAP_SUMMARY, exitCode: 0, ask: CAP_ASK };
      },
    };
    const { result, handlers, outbound, replies, dms } = await bridgeWith(agent, { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID });
    await handlers.onMessage(MENTION);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toBe(`💸 ${PAUSED} <@${OWNER_ID}>`);
    expectNoSpendDetails(replies[0]!.content);
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    const last = outbound.edits[outbound.edits.length - 1]!.embed as DiscordEmbedPayload;
    expect(last.description).toContain(SPEND_CAP_STATUS);
    expectNoSpendDetails(last.description);
    expect(last.color).not.toBe(THINKING_COLORS.error);
    // SAFE-14.a: the amounts and the setting reach only the owner, by DM.
    expect(dms).toHaveLength(1);
    expect(dms[0]!.userId).toBe(OWNER_ID);
    expect(dms[0]!.content).toStartWith(`💸 ${PAUSED} Only you see these details (SAFE-14.a).\nIn <#chan-1>:\n> Daily spend cap reached (SAFE-8): $4.9990 spent in the last 24h`);
    expect(dms[0]!.content).toContain(SPEND_CAP_ENV);
    await result.stop();
  });

  test("80% warning → the reply carries no warning line and pings nobody; the owner gets the warning by DM", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: "all good", exitCode: 0, spendWarning: WARNING };
      },
    };
    const { result, handlers, replies, dms } = await bridgeWith(agent, { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID });
    await handlers.onMessage(MENTION);
    expect(replies[0]!.content).toBe("all good");
    expect(replies[0]!.mentionUserIds ?? []).toEqual([]);
    expect(dms).toEqual([
      {
        userId: OWNER_ID,
        content:
          "⚠️ Spend warning (SAFE-8): $4.10 of the $5.00 daily cap used in the last 24h (82%). At the cap I stop and ask before spending more.",
      },
    ]);
    await result.stop();
  });

  test("/status: the owner sees 24 h spend vs the cap from the shared DB; anyone else sees no spend line, and only 'Work is paused for budget.' at the cap (SAFE-14.a)", async () => {
    const db = openCorvidinhoDb({ memory: true });
    new SpendLedger(db).reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: 4_100_000, capMicroUsd: 1e12, now: Date.now() - 1000 });
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: "x", exitCode: 0 };
      },
    };
    const { result, handlers } = await bridgeWith(
      agent,
      { [SPEND_CAP_ENV]: "5", CORVIDINHO_LLM_MODEL: "gpt-4o-mini", CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID },
      db,
    );
    const status = async (userId: string) => {
      const replies: SlashReplyPayload[] = [];
      await handlers.onSlash!({
        id: `ix_${userId}_${Math.random()}`,
        commandName: "status",
        channelId: "chan-1",
        userId,
        options: {},
        reply: async (p) => void replies.push(p),
      });
      expect(replies[0]?.ephemeral).toBe(true);
      return replies[0]?.content ?? "";
    };
    expect(await status(OWNER_ID)).toContain("Spend (24h): $4.10 of $5.00 daily cap (82%) — ⚠️ past 80%");
    // Under the cap: nothing about spend for anyone else.
    const other = await status(SLASH_REQUESTER);
    expect(other).not.toContain("Spend");
    expect(other).not.toContain(PAUSED);
    expectNoSpendDetails(other);
    // At the cap: only that work is paused for budget.
    new SpendLedger(db).reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: 1_000_000, capMicroUsd: 1e12, now: Date.now() - 500 });
    const paused = await status(SLASH_REQUESTER);
    expect(paused).toContain(`Spend: ${PAUSED}`);
    expectNoSpendDetails(paused);
    expect(await status(OWNER_ID)).toContain("Spend (24h): $5.10 of $5.00 daily cap (102%) — 🛑 cap reached");
    await result.stop();
  });

  test("/status with no cap set: the owner sees it is off and which setting turns it on; anyone else sees nothing about spend (SAFE-14.a)", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: "x", exitCode: 0 };
      },
    };
    const { result, handlers } = await bridgeWith(agent, { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID });
    const status = async (userId: string) => {
      const replies: SlashReplyPayload[] = [];
      await handlers.onSlash!({
        id: `ix_${userId}`,
        commandName: "status",
        channelId: "chan-1",
        userId,
        options: {},
        reply: async (p) => void replies.push(p),
      });
      return replies[0]?.content ?? "";
    };
    expect(await status(OWNER_ID)).toContain(`Spend cap: off (set ${SPEND_CAP_ENV} to track spend)`);
    const other = await status(SLASH_REQUESTER);
    expect(other).not.toContain("Spend");
    expectNoSpendDetails(other);
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
      llmLine: "LLM: none — No model provider is configured.",
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

describe("a scheduler post never carries the 80% warning (SAFE-14.a)", () => {
  test("the ✅ post has no warning line and pings nobody; the owner gets the warning by DM", async () => {
    const store = new ScheduleStore();
    const posts: Array<{ channelId: string; content: string; mentionUserIds?: string[] }> = [];
    const dms: SpendWarning[] = [];
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
      spendDm: {
        async deliver(o) {
          if (o?.warning) dms.push(o.warning);
          return { stop: "none", warning: o?.warning ? "sent" : "none" };
        },
      },
    });
    await svc.tick();
    for (let i = 0; i < 50 && svc.runningIds().length > 0; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    svc.stop();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.content).toStartWith("✅ Schedule **Nightly**");
    expect(posts[0]!.content).not.toContain("Spend warning");
    expectNoSpendDetails(posts[0]!.content);
    expect(posts[0]!.mentionUserIds ?? []).toEqual([]);
    expect(dms).toEqual([WARNING]);
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
    userId: SLASH_REQUESTER,
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

describe("80% warning reaches the owner (by DM) even when the crossing run could not show it", () => {
  test("a WATCH-style run crosses 80% (warning ignored there); the next bridge run DMs the owner once and the reply stays plain", async () => {
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
      const { result, handlers, replies, dms } = await bridgeWith(
        agent,
        { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID, [SPEND_CAP_ENV]: "1" },
        openCorvidinhoDb({ path }),
      );
      await handlers.onMessage(MENTION);
      expect(replies[0]!.content).toBe("all good");
      expect(dms).toHaveLength(1);
      expect(dms[0]!.userId).toBe(OWNER_ID);
      expect(dms[0]!.content).toContain("of the $1.00 daily cap used in the last 24h (80%)");
      await handlers.onMessage({ ...MENTION, id: "m2" });
      expect(replies[1]!.content).toBe("all good");
      expect(dms).toHaveLength(1);
      await result.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("/work DMs a pending warning to the owner; no channel post carries it", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const ledger = new SpendLedger(db);
    ledger.reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: 850_000, capMicroUsd: 1e12, now: Date.now() - 1000 });
    expect(ledger.noteWarning({ capMicroUsd: 1_000_000, now: Date.now() })).not.toBeNull();
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: "did it", exitCode: 0 };
      },
    };
    const { result, handlers, replies, dms } = await bridgeWith(agent, { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID }, db);
    const { ix, edits } = slashInteraction("work", { description: "add storage" });
    await handlers.onSlash!(ix);
    expect(edits.at(-1)!.content).toContain("(completed)");
    expectNoSpendDetails(edits.at(-1)!.content);
    expect(replies).toHaveLength(0);
    expect(dms.map((d) => d.userId)).toEqual([OWNER_ID]);
    expect(dms[0]!.content).toStartWith(WARNING_DM_85);
    await result.stop();
  });
});

describe("spend-cap ask: once per cap episode, no reply hint, blocked (not done) on slash runs", () => {
  test("chat: the first ask at the cap pings the owner and DMs them the details; later ones post without a ping, a reply hint or a DM", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ...CAP_RESULT, sessionId };
      },
    };
    const { result, handlers, replies, dms } = await bridgeWith(
      agent,
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID, [SPEND_CAP_ENV]: "5" },
      db,
    );
    await handlers.onMessage(MENTION);
    await handlers.onMessage({ ...MENTION, id: "m2" });
    expect(replies[0]!.content).toContain(`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`);
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    expect(replies[1]!.content).toBe(SPEND_CAP_HEADLINE);
    expect(replies[1]!.mentionUserIds).toEqual([]);
    for (const r of replies) {
      expect(r.content).not.toContain(ASK_REPLY_HINT);
      expect(r.content).not.toContain("Replying can't lift the cap");
      expectNoSpendDetails(r.content);
    }
    // One DM per cap episode, like one channel ping.
    expect(dms).toHaveLength(1);
    expect(dms[0]!.content).toContain("Replying can't lift the cap");
    // Spend seen back under 70% (the next call's check) re-arms the ping.
    new SpendLedger(db).reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: 1, capMicroUsd: 5_000_000, now: Date.now() });
    await handlers.onMessage({ ...MENTION, id: "m3" });
    expect(replies[2]!.mentionUserIds).toEqual([OWNER_ID]);
    expect(dms).toHaveLength(2);
    await result.stop();
  });

  test("/work at the cap: blocked task, paused status, 'Work is paused for budget.' in the reply, owner pinged once in a fresh post and DMed the details", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ...CAP_RESULT, sessionId };
      },
    };
    const { result, handlers, replies, outbound, dms } = await bridgeWith(agent, {
      CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
      [SPEND_CAP_ENV]: "5",
    });
    const { ix, edits } = slashInteraction("work", { description: "add storage" });
    await handlers.onSlash!(ix);
    const body = edits.at(-1)!.content!;
    expect(body).toContain("(blocked)");
    expect(body).toContain(SPEND_CAP_HEADLINE);
    expect(body).not.toContain("Daily spend cap reached");
    expect(body).toContain(`PR: not opened — ${PAUSED}`);
    expectNoSpendDetails(body);
    expect(body).not.toContain("✅");
    expect(body).not.toContain("<@");
    if (!result.ok) throw new Error("bridge did not start");
    expect(result.workStore.list()[0]!.status).toBe("blocked");
    const last = outbound.edits[outbound.edits.length - 1]!.embed as DiscordEmbedPayload;
    expect(last.description).toContain(SPEND_CAP_STATUS);
    expect(last.color).not.toBe(THINKING_COLORS.error);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toMatch(
      new RegExp(`^💸 <@${OWNER_ID}> /work \`work_[0-9a-f]+\`: Work is paused for budget\\.$`),
    );
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    expect(dms).toHaveLength(1);
    expect(dms[0]!.content).toContain("Daily spend cap reached (SAFE-8)");
    // Same cap episode: the next /work posts its reply but does not ping or DM again.
    const second = slashInteraction("work", { description: "more storage" });
    await handlers.onSlash!(second.ix);
    expect(second.edits.at(-1)!.content).toContain("(blocked)");
    expect(replies).toHaveLength(1);
    expect(dms).toHaveLength(1);
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

  test("/session start at the cap shows only that work is paused (not ✅), pings the owner and DMs them the details", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ...CAP_RESULT, sessionId };
      },
    };
    const { result, handlers, replies, dms } = await bridgeWith(agent, { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID });
    const { ix, edits } = slashInteraction("session", { topic: "storage" });
    await handlers.onSlash!(ix);
    expect(edits.at(-1)!.content).toContain(SPEND_CAP_HEADLINE);
    expectNoSpendDetails(edits.at(-1)!.content);
    expect(replies[0]!.content).toMatch(
      new RegExp(`^💸 <@${OWNER_ID}> /session \`[^\`]+\`: Work is paused for budget\\.$`),
    );
    expect(dms).toHaveLength(1);
    expect(dms[0]!.content).toContain("Daily spend cap reached (SAFE-8)");
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

describe("a post that did not go out hands back its cap ping; the warning goes by DM regardless (review #160, SAFE-14.a)", () => {
  function pendingWarningDb() {
    const db = openCorvidinhoDb({ memory: true });
    const ledger = new SpendLedger(db);
    ledger.reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: 850_000, capMicroUsd: 1e12, now: Date.now() - 1000 });
    expect(ledger.noteWarning({ capMicroUsd: 1_000_000, now: Date.now() })).not.toBeNull();
    return db;
  }
  const expired = () => new Error("Unknown interaction (token expired)");

  test("/work whose final reply fails (expired token) still posts the owner notice, the owner still gets the DMs, and the error is re-thrown", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ...CAP_RESULT, sessionId };
      },
    };
    const { result, handlers, replies, dms } = await bridgeWith(
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
    expect(replies[0]!.content).toMatch(new RegExp(`^💸 <@${OWNER_ID}> /work \`work_[0-9a-f]+\`: Work is paused for budget\\.$`));
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    expect(dms.map((d) => d.content.split("\n")[0])).toEqual([
      `💸 ${PAUSED} Only you see these details (SAFE-14.a).`,
      expect.stringContaining(WARNING_DM_85),
    ]);
    await result.stop();
  });

  test("/session start whose reply and notice both fail hands back the cap ping (the next chat reply pings the owner); the details and the warning were DMed at once, never riding a post", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ...CAP_RESULT, sessionId };
      },
    };
    let failing = true;
    const { result, handlers, replies, dms } = await bridgeWith(
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
    expect(dms).toHaveLength(2);
    expect(dms[1]!.content).toStartWith(WARNING_DM_85);
    failing = false;
    await handlers.onMessage(MENTION);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toBe(`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`);
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    await result.stop();
  });

  test("a run resumed by a button pick that stops at the cap: 'Work is paused for budget.' with the owner pinged once, the details and the warning DMed, no pending ask", async () => {
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
    const { result, handlers, replies, dms } = await bridgeWith(
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
    expect(last.content).toBe(`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`);
    expect(last.mentionUserIds).toEqual([OWNER_ID]);
    expect(last.components).toBeUndefined();
    expect(result.store.list()[0]!.pendingAsk ?? null).toBeNull();
    expect(dms.map((d) => d.content.split("\n")[0])).toEqual([
      `💸 ${PAUSED} Only you see these details (SAFE-14.a).`,
      expect.stringContaining(WARNING_DM_85),
    ]);
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

describe("collapsed answer (DISCORD-ASK-6/7) carries SAFE-8 like a reply; the warning never rides it (SAFE-14.a)", () => {
  function pendingWarningDb() {
    const db = openCorvidinhoDb({ memory: true });
    const ledger = new SpendLedger(db);
    ledger.reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: 850_000, capMicroUsd: 1e12, now: Date.now() - 1000 });
    expect(ledger.noteWarning({ capMicroUsd: 1_000_000, now: Date.now() })).not.toBeNull();
    return db;
  }

  test("with an 80% warning pending, the edit of the thinking message is the plain answer, pings nobody and adds no fresh post; the owner gets the warning by DM, once", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: "all good", exitCode: 0 };
      },
    };
    const { outbound, finals } = collapseOutbound();
    const { result, handlers, replies, dms } = await bridgeWith(
      agent,
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID },
      pendingWarningDb(),
      () => false,
      outbound,
    );
    await handlers.onMessage(MENTION);
    expect(finals).toHaveLength(1);
    expect(finals[0]!.content).toBe("all good");
    expect(finals[0]!.mentionUserIds ?? []).toEqual([]);
    // DISCORD-3.a — the answer keeps a footer-only embed (model).
    expect(finals[0]!.embed).toStrictEqual({
      color: THINKING_COLORS.success,
      footer: { text: answerFooterText(loadLlmEnv(process.env).model) },
    });
    // REQ-discord-215: nobody is mentioned, so no fresh ping post.
    expect(replies).toHaveLength(0);
    expect(dms).toHaveLength(1);
    expect(dms[0]!.content).toStartWith(WARNING_DM_85);
    // Delivered once: the next answer DMs nothing more.
    await handlers.onMessage({ ...MENTION, id: "m2" });
    expect(finals[1]!.content).toBe("all good");
    expect(replies).toHaveLength(0);
    expect(dms).toHaveLength(1);
    await result.stop();
  });

  test("REQ-discord-311: a collapsed answer clears its in-flight row; so does a turn where nothing went out; a warning pending meanwhile still reaches the owner by DM", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: "all good", exitCode: 0 };
      },
    };
    let failing = false;
    const db = pendingWarningDb();
    const inflight = new InflightReplyStore(db);
    const { outbound, finals } = collapseOutbound(() => failing);
    const { result, handlers, replies, dms } = await bridgeWith(
      agent,
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID },
      db,
      () => failing,
      outbound,
    );
    await handlers.onMessage(MENTION);
    expect(finals[0]!.content).toBe("all good");
    expect(dms).toHaveLength(1);
    expect(inflight.list()).toEqual([]);
    // A second warning is pending; edit and fallback reply both fail.
    const ledger = new SpendLedger(db);
    ledger.reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: 1, capMicroUsd: 1e12, now: Date.now() });
    expect(ledger.noteWarning({ capMicroUsd: 1_000_001, now: Date.now() })).not.toBeNull();
    failing = true;
    await handlers.onMessage({ ...MENTION, id: "m2" });
    expect(replies).toHaveLength(0);
    expect(inflight.list()).toEqual([]);
    // The DM does not depend on the post.
    expect(dms).toHaveLength(2);
    expect(dms[1]!.content).toContain("Spend warning (SAFE-8)");
    failing = false;
    await handlers.onMessage({ ...MENTION, id: "m3" });
    expect(finals.at(-1)!.content).toBe("all good");
    expect(dms).toHaveLength(2);
    expect(inflight.list()).toEqual([]);
    await result.stop();
  });

  test("a spend-cap stop collapses to 'Work is paused for budget.' (no buttons) that pings the owner once per episode and leaves no pending ask", async () => {
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
    expect(finals[0]!.content).toBe(`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`);
    expect(finals[0]!.content).not.toContain(ASK_REPLY_HINT);
    expect(finals[0]!.components).toBeNull();
    expect(finals[0]!.mentionUserIds).toEqual([OWNER_ID]);
    expect(finals[1]!.content).toBe(SPEND_CAP_HEADLINE);
    expect(finals[1]!.mentionUserIds).toEqual([]);
    for (const s of result.store.list()) expect(s.pendingAsk ?? null).toBeNull();
    await result.stop();
  });

  test("collapsed edit fails → the fallback reply carries the owner ping (no warning); edit and reply both fail → the cap ping goes to the next answer; the details and the warning are DMed either way", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ...CAP_RESULT, sessionId };
      },
    };
    let failEdits = true;
    let failReplies = false;
    const { outbound, finals } = collapseOutbound(() => failEdits);
    const { result, handlers, replies, dms } = await bridgeWith(
      agent,
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID, [SPEND_CAP_ENV]: "5" },
      pendingWarningDb(),
      () => failReplies,
      outbound,
    );
    // Edit fails, the fallback reply goes out: it carries the ping, never the warning.
    await handlers.onMessage(MENTION);
    expect(finals).toHaveLength(0);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toBe(`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`);
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    expect(dms).toHaveLength(2);
    expect(dms[1]!.content).toStartWith(WARNING_DM_85);
    await result.stop();

    // Both fail: nothing went out, so the cap ping is handed back; the DMs still went.
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
    expect(second.dms).toHaveLength(2);
    failEdits = false;
    failReplies = false;
    await second.handlers.onMessage({ ...MENTION, id: "m2" });
    expect(again.finals).toHaveLength(1);
    expect(again.finals[0]!.content).toBe(`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`);
    expect(again.finals[0]!.mentionUserIds).toEqual([OWNER_ID]);
    // The re-claimed ping re-sends the stop's details (one per ping); no warning left.
    expect(second.dms).toHaveLength(3);
    expect(second.dms[2]!.content).toContain("Daily spend cap reached (SAFE-8)");
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

  test("/work at the cap: the thinking message becomes the paused ask (not ✅ Done), the deferred reply is dropped, the owner is pinged once in a fresh post without the warning, which goes by DM", async () => {
    const { outbound, finals } = collapseOutbound();
    const { result, handlers, replies, dms } = await bridgeWith(
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
    expectNoSpendDetails(finals[0]!.content);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toMatch(new RegExp(`^💸 <@${OWNER_ID}> /work \`work_[0-9a-f]+\`: Work is paused for budget\\.$`));
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    expect(dms.map((d) => d.content.split("\n")[0])).toEqual([
      `💸 ${PAUSED} Only you see these details (SAFE-14.a).`,
      expect.stringContaining(WARNING_DM_85),
    ]);
    // Same episode, warning delivered: no second owner post or DM.
    const second = slashInteraction("work", { description: "more storage" });
    await handlers.onSlash!(second.ix);
    expect(finals).toHaveLength(2);
    expect(replies).toHaveLength(1);
    expect(dms).toHaveLength(2);
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
    expect(finals[1]!.content).toMatch(new RegExp(`💸 <@${OWNER_ID}> /work \`work_[0-9a-f]+\`: Work is paused for budget\\.$`));
    expect(finals[1]!.mentionUserIds).toEqual([OWNER_ID]);
    // DISCORD-3.a (REQ-discord-457): the re-edit keeps the answer's
    // footer-only embed (model + plumbing, done color like the fallback's
    // paused status); the plumbing never enters either body.
    expect(finals[0]!.embed).toStrictEqual({
      color: THINKING_COLORS.success,
      footer: {
        text: answerFooterText(
          loadLlmEnv(process.env).model,
          "state=blocked verified=false verifySkipped attempts=1",
        ),
      },
    });
    expect(finals[1]!.embed).toStrictEqual(finals[0]!.embed);
    expect(finals[1]!.content).not.toContain("state=");
    await result.stop();
  });

  test("nothing carried the notice (collapse, owner post and re-edit all fail; the reply throws): the cap ping goes to the next chat answer; the warning was DMed at once", async () => {
    let failing = true;
    const { outbound, finals } = collapseOutbound(() => failing);
    const { result, handlers, replies, dms } = await bridgeWith(
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
    expect(dms).toHaveLength(2);
    expect(dms[1]!.content).toStartWith(WARNING_DM_85);
    failing = false;
    await handlers.onMessage(MENTION);
    expect(finals).toHaveLength(1);
    expect(finals[0]!.content).toBe(`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`);
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
