/**
 * REQ-discord-044 — AUTONOMY-1/2 (#44): a run that needs a human replies with
 * its question and pings the configured owner (mentions limited to the
 * owner); no owner ⇒ no ping (IDENTITY-3). Fixtures only: fake gateway, fake
 * sh bin, in-memory scheduler — no live Discord, no network, no git worktrees.
 */
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatAskSummary, stuckAfterVerifyAsk } from "../src/agent/ask.ts";
import { resultFrame, serializeFrame } from "../src/agent/events-ndjson.ts";
import type { HumanAsk, TaskResult } from "../src/agent/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createSpawnAgentClient, type AgentClient } from "../src/discord/agent-client.ts";
import {
  ASK_REPLY_HINT,
  ASK_REPLY_MAX,
  defangMassMentions,
  formatAskReply,
} from "../src/discord/ask-ping.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { THINKING_COLORS, type DiscordEmbedPayload } from "../src/discord/thinking-status.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { SchedulerService } from "../src/scheduler/service.ts";

const OWNER_ID = "111122223333444455";
const OWNER = { discordId: OWNER_ID, display: "Leif" };
const CLARIFY: HumanAsk = { reason: "clarify", question: "Postgres or SQLite?" };

describe("formatAskReply (AUTONOMY-1/2)", () => {
  test("clarify: question quoted, owner pinged on the first line", () => {
    const r = formatAskReply({ ask: CLARIFY, owner: OWNER, replyHint: true });
    const lines = r.content.split("\n");
    expect(lines[0]).toContain("I need your input");
    expect(lines[0]).toContain(`<@${OWNER_ID}>`);
    expect(r.content).toContain("> Postgres or SQLite?");
    expect(r.content).toContain(ASK_REPLY_HINT);
    expect(r.mentionUserIds).toEqual([OWNER_ID]);
    expect(r.ownerPinged).toBe(true);
    expect(r.failed).toBe(false);
    expect(r.status).toContain("Needs your input");
  });

  test("no owner configured → question still posts, nobody pinged", () => {
    for (const owner of [null, undefined, { discordId: "" }]) {
      const r = formatAskReply({ ask: CLARIFY, owner });
      expect(r.content).toContain("> Postgres or SQLite?");
      expect(r.content).not.toContain("<@");
      expect(r.mentionUserIds).toEqual([]);
      expect(r.ownerPinged).toBe(false);
    }
  });

  test("stuck: failed status, context shown, prefix first", () => {
    const r = formatAskReply({
      ask: stuckAfterVerifyAsk(2),
      owner: OWNER,
      context: "state=failed verified=false\nVerification failed after 2 retries",
      prefix: "Schedule **nightly**:",
    });
    const lines = r.content.split("\n");
    expect(lines[0]).toBe("Schedule **nightly**:");
    expect(lines[1]).toContain("I'm stuck");
    expect(lines[1]).toContain(`<@${OWNER_ID}>`);
    expect(r.content).toContain("Verification failed after 2 retries");
    expect(r.content).not.toContain(ASK_REPLY_HINT);
    expect(r.failed).toBe(true);
    expect(r.status).toContain("Stuck");
  });

  test("clarify ignores context (question only)", () => {
    const r = formatAskReply({ ask: CLARIFY, owner: OWNER, context: "SECRET-CONTEXT" });
    expect(r.content).not.toContain("SECRET-CONTEXT");
  });

  test("model text is scrubbed, mass mentions defanged, length capped", () => {
    const r = formatAskReply({
      ask: {
        reason: "clarify",
        question: `@everyone use ghp_${"a".repeat(36)}? @here ${"x".repeat(3000)}`,
      },
      owner: OWNER,
    });
    expect(r.content).not.toMatch(/@everyone|@here/);
    expect(r.content).toContain("@​everyone");
    expect(r.content).not.toContain(`ghp_${"a".repeat(36)}`);
    expect(r.content).toContain("[redacted:");
    expect(r.content.length).toBeLessThanOrEqual(ASK_REPLY_MAX);
    expect(r.content.split("\n")[0]).toContain(`<@${OWNER_ID}>`);
    expect(defangMassMentions("hi @Here")).toBe("hi @​Here");
  });
});

type Reply = {
  channelId: string;
  content: string;
  replyToMessageId?: string;
  mentionUserIds?: string[];
};

async function bridgeWith(agent: AgentClient, env: Record<string, string>) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const replies: Reply[] = [];
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: "chan-1",
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      // Env-only owner: never read a real allowlist file from $HOME.
      CORVIDINHO_ALLOWLIST_FILE: join(mkdtempSync(join(tmpdir(), "corvidinho-ask-")), "none.toml"),
      ...env,
    },
    // Temp non-git project: never create real worktrees/branches in this repo.
    projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-ask-proj-")),
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

function askingAgent(ask: HumanAsk, ok = true): AgentClient {
  return {
    async runChat({ sessionId }) {
      return {
        ok,
        sessionId,
        summary: `state=${ok ? "blocked" : "failed"}\n${formatAskSummary(ask)}`,
        exitCode: ok ? 0 : 1,
        ask,
      };
    },
  };
}

const MENTION = {
  id: "m1",
  channelId: "chan-1",
  authorId: "222233334444555566",
  authorBot: false,
  content: "@bot add storage",
  mentionedBot: true,
};

describe("bridge mention path asks + pings (AUTONOMY-1/2)", () => {
  test("clarify ask → question reply to requester, owner pinged, thread continues", async () => {
    const { result, handlers, outbound, replies } = await bridgeWith(askingAgent(CLARIFY), {
      CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
    });
    await handlers.onMessage(MENTION);

    expect(replies).toHaveLength(1);
    const r = replies[0]!;
    expect(r.replyToMessageId).toBe("m1");
    expect(r.content).toContain("> Postgres or SQLite?");
    expect(r.content).toContain(`<@${OWNER_ID}>`);
    expect(r.content).toContain(ASK_REPLY_HINT);
    expect(r.mentionUserIds).toEqual([OWNER_ID]);

    const last = outbound.edits[outbound.edits.length - 1]!.embed as DiscordEmbedPayload;
    expect(last.description).toContain("Needs your input");
    expect(last.description).not.toContain("✅ Done");

    // DISCORD-2: replying to the question continues the same session.
    const session = result.store.getByBotMessage("bot_1");
    expect(session).toBeDefined();
    await result.stop();
  });

  test("stuck ask on a failed run → question + owner ping instead of a bare exit code", async () => {
    const { result, handlers, outbound, replies } = await bridgeWith(
      askingAgent(stuckAfterVerifyAsk(2), false),
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID },
    );
    await handlers.onMessage(MENTION);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toContain("I'm stuck");
    expect(replies[0]!.content).toContain("Verification still fails after 2 retries");
    expect(replies[0]!.content).not.toContain("failed (exit 1)");
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    const last = outbound.edits[outbound.edits.length - 1]!.embed as DiscordEmbedPayload;
    expect(last.color).toBe(THINKING_COLORS.error);
    await result.stop();
  });

  test("no owner configured → question posts with no mention (IDENTITY-3)", async () => {
    const { result, handlers, replies } = await bridgeWith(askingAgent(CLARIFY), {});
    await handlers.onMessage(MENTION);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toContain("> Postgres or SQLite?");
    expect(replies[0]!.content).not.toContain("<@");
    expect(replies[0]!.mentionUserIds).toEqual([]);
    await result.stop();
  });

  test("ordinary runs keep the plain reply (no mention restriction added)", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: "all good", exitCode: 0 };
      },
    };
    const { result, handlers, replies } = await bridgeWith(agent, {
      CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
    });
    await handlers.onMessage(MENTION);
    expect(replies[0]!.content).toBe("all good");
    expect(replies[0]!.mentionUserIds).toBeUndefined();
    await result.stop();
  });
});

describe("spawn client reads the ask from the result frame", () => {
  test("valid ask passes through; a malformed one is dropped", async () => {
    const run = async (result: TaskResult) => {
      const dir = mkdtempSync(join(tmpdir(), "corvidinho-ask-bin-"));
      const bin = join(dir, "corvidinho");
      writeFileSync(
        bin,
        `#!/bin/sh\ncat <<'NDJSON_EOF'\n${serializeFrame(resultFrame(result))}\nNDJSON_EOF\n`,
        { mode: 0o755 },
      );
      chmodSync(bin, 0o755);
      return createSpawnAgentClient({ bin, cwd: dir }).runChat({
        prompt: "p",
        sessionId: "s1",
      });
    };
    const base: TaskResult = {
      summary: formatAskSummary(CLARIFY),
      filesChanged: [],
      verified: false,
      verifySkipped: true,
      cancelled: false,
      state: "blocked",
      attempts: 1,
    };
    const good = await run({ ...base, ask: CLARIFY });
    expect(good.ok).toBe(true);
    expect(good.ask).toEqual(CLARIFY);
    expect(good.summary).toContain("state=blocked");
    expect(good.summary).toContain("Needs your input: Postgres or SQLite?");

    const bad = await run({ ...base, ask: { reason: "nope", question: "x" } as never });
    expect(bad.ask).toBeUndefined();
    expect("ask" in bad).toBe(false);
  }, 30_000);
});

describe("scheduler tick asks + pings (AUTONOMY-2)", () => {
  function allowCfg() {
    const cfg = emptyConfig();
    cfg.discord.channels = ["chan-allowed"];
    return cfg;
  }

  async function tickWith(ask: HumanAsk | undefined, owner: typeof OWNER | null) {
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
    const svc = new SchedulerService({
      store,
      agent: ask ? askingAgent(ask) : {
        async runChat({ sessionId }) {
          return { ok: true, sessionId, summary: "done", exitCode: 0 };
        },
      },
      allowlist: allowCfg(),
      manual: true,
      useWorktrees: false,
      owner,
      outbound: { post: async (p) => void posts.push(p) },
    });
    await svc.tick();
    for (let i = 0; i < 50 && svc.runningIds().length > 0; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    svc.stop();
    return posts;
  }

  test("ask → schedule post carries the question and pings the owner", async () => {
    const posts = await tickWith(CLARIFY, OWNER);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.content.split("\n")[0]).toContain("Schedule **Nightly**");
    expect(posts[0]!.content).toContain("> Postgres or SQLite?");
    expect(posts[0]!.content).toContain(`<@${OWNER_ID}>`);
    expect(posts[0]!.content).not.toContain(ASK_REPLY_HINT);
    expect(posts[0]!.mentionUserIds).toEqual([OWNER_ID]);
  });

  test("no ask → unchanged ✅ post without mention restriction", async () => {
    const posts = await tickWith(undefined, OWNER);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.content).toStartWith("✅ Schedule **Nightly**");
    expect(posts[0]!.mentionUserIds).toBeUndefined();
  });
});
