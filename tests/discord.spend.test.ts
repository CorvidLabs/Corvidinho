/**
 * SAFE-8 as amended on #98 on Discord (REQ-discord-098): the spend-cap ask
 * goes through the AUTONOMY-1/2 ask path with the owner pinged, the 80%
 * warning rides the reply / schedule post and pings the owner, and /status
 * shows 24 h spend vs the cap (AUTONOMOUS-8). Fixtures only: fake gateway,
 * fake sh bin, in-memory DB — no live Discord, no network, no git worktrees.
 */
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatAskSummary } from "../src/agent/ask.ts";
import { resultFrame, serializeFrame } from "../src/agent/events-ndjson.ts";
import { SPEND_CAP_ENV, SpendLedger } from "../src/agent/spend.ts";
import { spendCapReachedAsk } from "../src/agent/spend-notice.ts";
import type { HumanAsk, SpendWarning, TaskResult } from "../src/agent/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createSpawnAgentClient, type AgentClient } from "../src/discord/agent-client.ts";
import {
  appendPostLine,
  ASK_REPLY_MAX,
  askPingKey,
  formatAskReply,
  formatSpendWarningReply,
  SPEND_CAP_HEADLINE,
  SPEND_CAP_STATUS,
  withSpendWarningPost,
} from "../src/discord/ask-ping.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
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

async function bridgeWith(agent: AgentClient, env: Record<string, string>, db = openCorvidinhoDb({ memory: true })) {
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
