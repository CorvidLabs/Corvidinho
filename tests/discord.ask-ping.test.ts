/**
 * REQ-discord-044 — AUTONOMY-1/2 (#44): a run that needs a human replies with
 * its question and pings the configured owner (mentions limited to the
 * owner); no owner ⇒ no ping (IDENTITY-3). Fixtures only: fake gateway, fake
 * sh bin, in-memory scheduler — no live Discord, no network, no git worktrees.
 */
import { describe, expect, spyOn, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatAskSummary, stuckAfterVerifyAsk } from "../src/agent/ask.ts";
import { resultFrame, serializeFrame } from "../src/agent/events-ndjson.ts";
import { loadLlmEnv } from "../src/agent/execute.ts";
import type { HumanAsk, TaskResult } from "../src/agent/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createSpawnAgentClient, type AgentClient } from "../src/discord/agent-client.ts";
import {
  ASK_ANSWER_HINT,
  ASK_NO_OWNER_WARNING,
  ASK_REPLY_HINT,
  ASK_REPLY_MAX,
  askPingKey,
  defangMassMentions,
  formatAskReply,
} from "../src/discord/ask-ping.ts";
import { buildAnswerStubComponents, toPendingAsk } from "../src/discord/ask-buttons.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { THINKING_COLORS, type DiscordEmbedPayload } from "../src/discord/thinking-status.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { migrateCorvidinhoDb, openCorvidinhoDb, SCHEMA_VERSION } from "../src/store/db.ts";
import { Database as SqliteDatabase } from "bun:sqlite";
import { SchedulerService } from "../src/scheduler/service.ts";
import { openWorkPr } from "../src/work/pr.ts";
import { useConfiguredModel } from "./fixtures/fake-llm.ts";

// The footer names the configured model; there is no built-in default
// (AGENT-13), so this file configures one (a priced id; the stub agent calls
// no model).
useConfiguredModel();

/** DISCORD-15: an answer footer is `<before> | <time> [| <after>]` (time from the real clock). */
function answerFooterText(before: string, after?: string) {
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return expect.stringMatching(
    new RegExp(`^${esc(before)} \\| \\d+s${after ? ` \\| ${esc(after)}` : ""}$`),
  );
}

const OWNER_ID = "111122223333444455";
const OWNER = { discordId: OWNER_ID, display: "Leif" };
const CLARIFY: HumanAsk = { reason: "clarify", question: "Postgres or SQLite?" };

describe("formatAskReply (AUTONOMY-1/2/4)", () => {
  const REQUESTER_ID = "222233334444555566";

  test("clarify: question quoted, requester pinged (not owner) on the first line", () => {
    const r = formatAskReply({
      ask: CLARIFY,
      owner: OWNER,
      requesterDiscordId: REQUESTER_ID,
      replyHint: true,
    });
    const lines = r.content.split("\n");
    expect(lines[0]).toContain("I need your input");
    expect(lines[0]).toContain(`<@${REQUESTER_ID}>`);
    expect(lines[0]).not.toContain(`<@${OWNER_ID}>`);
    expect(r.content).toContain("> Postgres or SQLite?");
    expect(r.content).toContain(ASK_REPLY_HINT);
    expect(r.mentionUserIds).toEqual([REQUESTER_ID]);
    expect(r.ownerPinged).toBe(false);
    expect(r.pinged).toBe(true);
    expect(r.failed).toBe(false);
    expect(r.status).toContain("Needs your input");
  });

  test("clarify when requester is owner → owner pinged", () => {
    const r = formatAskReply({
      ask: CLARIFY,
      owner: OWNER,
      requesterDiscordId: OWNER_ID,
    });
    expect(r.mentionUserIds).toEqual([OWNER_ID]);
    expect(r.ownerPinged).toBe(true);
    expect(r.content).toContain(`<@${OWNER_ID}>`);
  });

  test("clarify with no requester → question posts, nobody pinged", () => {
    for (const owner of [null, undefined, OWNER, { discordId: "" }]) {
      const r = formatAskReply({ ask: CLARIFY, owner });
      expect(r.content).toContain("> Postgres or SQLite?");
      expect(r.content).not.toContain("<@");
      expect(r.mentionUserIds).toEqual([]);
      expect(r.ownerPinged).toBe(false);
      expect(r.pinged).toBe(false);
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
    expect(r.content.split("\n")[0]).not.toContain("<@");
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

describe("bridge mention path asks + pings (AUTONOMY-1/2/4)", () => {
  test("clarify ask → question reply pings requester (not owner), pendingAsk set", async () => {
    const { result, handlers, outbound, replies } = await bridgeWith(askingAgent(CLARIFY), {
      CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
    });
    await handlers.onMessage(MENTION);

    // DISCORD-ASK-6/7 — collapsed into thinking message (no separate answer
    // reply); an edit does not notify, so the only fresh post is the
    // requester ping (REQ-discord-215).
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toBe(`<@${MENTION.authorId}> ↑ question for you`);
    expect(replies[0]!.mentionUserIds).toEqual([MENTION.authorId]);
    const edit = outbound.contentEdits.find(
      (e) => typeof e.content === "string" && e.content.includes("Postgres or SQLite?"),
    );
    expect(edit).toBeDefined();
    expect(String(edit!.content)).toContain(`<@${MENTION.authorId}>`);
    expect(String(edit!.content)).not.toContain(`<@${OWNER_ID}>`);
    // DISCORD-ASK-4.a — the free-text question carries the Answer button (and
    // says a reply still works).
    expect(String(edit!.content)).toContain(ASK_ANSWER_HINT);
    expect(String(edit!.content)).not.toContain(ASK_REPLY_HINT);
    // DISCORD-3.a — a free-text question is the turn's answer: footer-only embed.
    expect(edit!.embed).toStrictEqual({
      color: THINKING_COLORS.success,
      footer: { text: answerFooterText(loadLlmEnv(process.env).model) },
    });

    const session = result.store.getByBotMessage(edit!.messageId);
    expect(session).toBeDefined();
    expect(session!.pendingAsk).toMatchObject(CLARIFY);
    expect(edit!.components).toEqual(buildAnswerStubComponents(session!.pendingAsk!.askId));
    expect(session!.pendingAsk!.stubMessageId).toBe(edit!.messageId);
    await result.stop();
  });

  test("stuck ask on a failed run → question + owner ping instead of a bare exit code", async () => {
    const { result, handlers, outbound, replies } = await bridgeWith(
      askingAgent(stuckAfterVerifyAsk(2), false),
      { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID },
    );
    await handlers.onMessage(MENTION);
    // Collapsed answer + one fresh owner ping (REQ-discord-215).
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toBe(`<@${OWNER_ID}> ↑ needs you`);
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    const edit = outbound.contentEdits.find(
      (e) => typeof e.content === "string" && e.content.includes("I'm stuck"),
    );
    expect(edit).toBeDefined();
    expect(String(edit!.content)).toContain("Verification still fails after 2 retries");
    expect(String(edit!.content)).not.toContain("failed (exit 1)");
    // DISCORD-3.a — a stuck ask shows as a failure in the footer-only embed.
    expect(edit!.embed).toStrictEqual({
      color: THINKING_COLORS.error,
      footer: { text: answerFooterText(loadLlmEnv(process.env).model) },
    });
    await result.stop();
  });

  test("no owner configured → clarify still pings requester (AUTONOMY-4)", async () => {
    const { result, handlers, outbound, replies } = await bridgeWith(askingAgent(CLARIFY), {});
    await handlers.onMessage(MENTION);
    // Collapsed answer + one fresh requester ping (REQ-discord-215).
    expect(replies).toHaveLength(1);
    expect(replies[0]!.mentionUserIds).toEqual([MENTION.authorId]);
    const edit = outbound.contentEdits.find(
      (e) => typeof e.content === "string" && e.content.includes("Postgres or SQLite?"),
    );
    expect(edit).toBeDefined();
    expect(String(edit!.content)).toContain(`<@${MENTION.authorId}>`);
    await result.stop();
  });

  test("ordinary runs keep the plain reply (no user added to allowed mentions)", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: "all good", exitCode: 0 };
      },
    };
    const { result, handlers, outbound, replies } = await bridgeWith(agent, {
      CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
    });
    await handlers.onMessage(MENTION);
    expect(replies).toHaveLength(0);
    const edit = outbound.contentEdits.find(
      (e) => typeof e.content === "string" && e.content === "all good",
    );
    expect(edit).toBeDefined();
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
    // DISCORD-3.a — spawn summary is chat body only (plumbing lives on the embed).
    expect(good.summary).not.toContain("state=");
    expect(good.summary).toContain("Needs your input: Postgres or SQLite?");
    expect(good.task?.state).toBe("blocked");

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

  test("clarify ask → schedule post pings the creator (requester), not owner", async () => {
    const posts = await tickWith(CLARIFY, OWNER);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.content.split("\n")[0]).toContain("Schedule **Nightly**");
    expect(posts[0]!.content).toContain("> Postgres or SQLite?");
    expect(posts[0]!.content).toContain("<@admin>");
    expect(posts[0]!.content).not.toContain(`<@${OWNER_ID}>`);
    expect(posts[0]!.content).not.toContain(ASK_REPLY_HINT);
    expect(posts[0]!.mentionUserIds).toEqual(["admin"]);
  });

  test("no ask → unchanged ✅ post with no user added to allowed mentions", async () => {
    const posts = await tickWith(undefined, OWNER);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.content).toStartWith("✅ Schedule **Nightly**");
    expect(posts[0]!.mentionUserIds).toBeUndefined();
  });
});

describe("scheduler pings the owner once per question (AUTONOMY-2 dedupe)", () => {
  type Step = HumanAsk | "ok" | "fail";
  type Post = { channelId: string; content: string; mentionUserIds?: string[] };
  const STUCK: HumanAsk = stuckAfterVerifyAsk(2);
  const HOUR = 3_600_000;

  function allowCfg() {
    const cfg = emptyConfig();
    cfg.discord.channels = ["chan-allowed"];
    return cfg;
  }

  function stepAgent(steps: { next: Step }): AgentClient {
    return {
      async runChat({ sessionId }) {
        const step = steps.next;
        if (step === "ok") return { ok: true, sessionId, summary: "done", exitCode: 0 };
        if (step === "fail") return { ok: false, sessionId, summary: "boom", exitCode: 1 };
        const ok = step.reason === "clarify";
        return {
          ok,
          sessionId,
          summary: `state=${ok ? "blocked" : "failed"}\n${formatAskSummary(step)}`,
          exitCode: ok ? 0 : 1,
          ask: step,
        };
      },
    };
  }

  /** One schedule, a manual clock, and a tick(step) that runs one due run. */
  function harness(opts: { db?: Database; clock?: { now: number } } = {}) {
    const clock = opts.clock ?? { now: Date.parse("2026-09-26T10:30:00Z") };
    const store = new ScheduleStore(opts.db ? { db: opts.db } : {});
    const schedule =
      store.list()[0] ??
      store.create({
        name: "Nightly",
        cronExpression: "0 * * * *",
        project: "proj-a",
        prompt: "do thing",
        createdByUserId: "admin",
        channelId: "chan-allowed",
        now: clock.now,
      });
    const steps: { next: Step } = { next: "ok" };
    const posts: Post[] = [];
    const svc = new SchedulerService({
      store,
      agent: stepAgent(steps),
      allowlist: allowCfg(),
      manual: true,
      useWorktrees: false,
      owner: OWNER,
      now: () => clock.now,
      outbound: { post: async (p) => void posts.push(p) },
    });
    async function tick(step: Step): Promise<Post> {
      steps.next = step;
      clock.now += HOUR;
      const r = await svc.tick();
      expect(r.started).toEqual([schedule.id]);
      for (let i = 0; i < 50 && svc.runningIds().length > 0; i++) {
        await new Promise((res) => setTimeout(res, 10));
      }
      return posts.at(-1)!;
    }
    return { store, schedule, svc, tick, posts, clock };
  }

  function pinged(p: Post, who: string = OWNER_ID): boolean {
    return p.content.includes(`<@${who}>`) && (p.mentionUserIds ?? []).includes(who);
  }

  function silent(p: Post): boolean {
    return !p.content.includes("<@") && (p.mentionUserIds ?? []).length === 0;
  }

  const CREATOR = "admin";

  test("the same question pings once; repeats still post the question, unpinged and unwarned", async () => {
    const h = harness();
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const first = await h.tick(CLARIFY);
      const second = await h.tick(CLARIFY);
      const third = await h.tick(CLARIFY);
      expect(pinged(first, CREATOR)).toBe(true);
      for (const p of [second, third]) {
        expect(p.content).toContain("> Postgres or SQLite?");
        expect(p.content).toContain("Schedule **Nightly**");
        expect(silent(p)).toBe(true);
      }
      expect(warn.mock.calls.some((c) => c[0] === ASK_NO_OWNER_WARNING)).toBe(false);
      expect(h.store.get(h.schedule.id)!.askPingKey).toBe(askPingKey(CLARIFY));
    } finally {
      warn.mockRestore();
      h.svc.stop();
    }
  });

  test("a changed question (or reason) pings again", async () => {
    const h = harness();
    expect(pinged(await h.tick(CLARIFY), CREATOR)).toBe(true);
    expect(pinged(await h.tick({ reason: "clarify", question: "Which port?" }), CREATOR)).toBe(true);
    expect(pinged(await h.tick(STUCK))).toBe(true);
    expect(silent(await h.tick(STUCK))).toBe(true);
    h.svc.stop();
  });

  test("a failed run keeps the marker; a clean run re-arms the ping", async () => {
    const h = harness();
    expect(pinged(await h.tick(CLARIFY), CREATOR)).toBe(true);
    expect((await h.tick("fail")).content).toStartWith("❌");
    expect(silent(await h.tick(CLARIFY))).toBe(true);
    expect((await h.tick("ok")).content).toStartWith("✅");
    expect(h.store.get(h.schedule.id)!.askPingKey).toBeUndefined();
    expect(pinged(await h.tick(CLARIFY), CREATOR)).toBe(true);
    h.svc.stop();
  });

  test("pause/resume re-arms the ping", async () => {
    const h = harness();
    expect(pinged(await h.tick(CLARIFY), CREATOR)).toBe(true);
    h.store.setStatus(h.schedule.id, "paused", h.clock.now);
    expect(h.store.get(h.schedule.id)!.askPingKey).toBeUndefined();
    h.store.setStatus(h.schedule.id, "active", h.clock.now);
    expect(pinged(await h.tick(CLARIFY), CREATOR)).toBe(true);
    h.svc.stop();
  });

  test("the marker persists in SQLite across a restart / second ticker", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const clock = { now: Date.parse("2026-09-26T10:30:00Z") };
    const a = harness({ db, clock });
    expect(pinged(await a.tick(CLARIFY), CREATOR)).toBe(true);
    a.svc.stop();
    const row = db
      .query("SELECT ask_ping_key FROM schedules WHERE id = ?")
      .get(a.schedule.id) as { ask_ping_key: string | null };
    expect(row.ask_ping_key).toBe(askPingKey(CLARIFY));
    expect(row.ask_ping_key).not.toContain("Postgres");

    // Fresh store + service on the same data (bridge restart / daemon).
    const b = harness({ db, clock });
    expect(b.schedule.id).toBe(a.schedule.id);
    expect(silent(await b.tick(CLARIFY))).toBe(true);
    // Pause elsewhere is seen via refresh and re-arms the ping.
    a.store.setStatus(a.schedule.id, "paused", clock.now);
    a.store.setStatus(a.schedule.id, "active", clock.now);
    expect(pinged(await b.tick(CLARIFY), CREATOR)).toBe(true);
    b.svc.stop();
    db.close();
  });

  test("no owner + clarify still pings creator and records marker (AUTONOMY-4)", async () => {
    const store = new ScheduleStore();
    const s = store.create({
      name: "Nightly",
      cronExpression: "0 * * * *",
      project: "proj-a",
      prompt: "do thing",
      createdByUserId: "admin",
      channelId: "chan-allowed",
      now: Date.now() - 2 * HOUR,
    });
    s.nextRunAt = Date.now() - 60_000;
    const posts: Post[] = [];
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const svc = new SchedulerService({
      store,
      agent: stepAgent({ next: CLARIFY }),
      allowlist: allowCfg(),
      manual: true,
      useWorktrees: false,
      owner: null,
      outbound: { post: async (p) => void posts.push(p) },
    });
    try {
      await svc.tick();
      for (let i = 0; i < 50 && svc.runningIds().length > 0; i++) {
        await new Promise((res) => setTimeout(res, 10));
      }
      expect(posts).toHaveLength(1);
      expect(pinged(posts[0]!, "admin")).toBe(true);
      expect(warn.mock.calls.some((c) => c[0] === ASK_NO_OWNER_WARNING)).toBe(false);
      expect(store.get(s.id)!.askPingKey).toBe(askPingKey(CLARIFY));
    } finally {
      warn.mockRestore();
      svc.stop();
    }
  });

  test("no owner + stuck → no ping, warning, no marker (AUTONOMY-2)", async () => {
    const store = new ScheduleStore();
    const s = store.create({
      name: "Nightly",
      cronExpression: "0 * * * *",
      project: "proj-a",
      prompt: "do thing",
      createdByUserId: "admin",
      channelId: "chan-allowed",
      now: Date.now() - 2 * HOUR,
    });
    s.nextRunAt = Date.now() - 60_000;
    const posts: Post[] = [];
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const svc = new SchedulerService({
      store,
      agent: stepAgent({ next: STUCK }),
      allowlist: allowCfg(),
      manual: true,
      useWorktrees: false,
      owner: null,
      outbound: { post: async (p) => void posts.push(p) },
    });
    try {
      await svc.tick();
      for (let i = 0; i < 50 && svc.runningIds().length > 0; i++) {
        await new Promise((res) => setTimeout(res, 10));
      }
      expect(posts).toHaveLength(1);
      expect(silent(posts[0]!)).toBe(true);
      expect(warn.mock.calls.some((c) => c[0] === ASK_NO_OWNER_WARNING)).toBe(true);
      expect(store.get(s.id)!.askPingKey).toBeUndefined();
    } finally {
      warn.mockRestore();
      svc.stop();
    }
  });

  test("askPingKey is a stable hex digest of reason + scrubbed question", () => {
    const k = askPingKey(CLARIFY);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(askPingKey({ ...CLARIFY, question: "  Postgres or SQLite?  " })).toBe(k);
    expect(askPingKey({ reason: "stuck", question: CLARIFY.question })).not.toBe(k);
  });

  test("schema v8 adds discord_sessions.pending_ask and migrates a v7 DB", () => {
    // v9 (in-flight Discord replies, REQ-discord-311) builds on v8.
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(8);
    const db = new SqliteDatabase(":memory:");
    migrateCorvidinhoDb(db);
    db.exec("ALTER TABLE discord_sessions DROP COLUMN pending_ask");
    db.run("UPDATE schema_meta SET value = '7' WHERE key = 'version'");
    db.run(
      `INSERT INTO discord_sessions (id, channel_id, user_id, created_at, last_activity_at)
       VALUES ('sess_x', 'c', 'u', 1, 1)`,
    );
    migrateCorvidinhoDb(db);
    const v = db.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
      value: string;
    };
    expect(v.value).toBe(String(SCHEMA_VERSION));
    const row = db.query("SELECT pending_ask FROM discord_sessions WHERE id = 'sess_x'").get() as {
      pending_ask: string | null;
    };
    expect(row.pending_ask).toBeNull();
    db.close();
  });
});

describe("/work never ships a PR from a run that asked a human (AUTONOMY-1)", () => {
  test("blocked run → needs-input line; no repo calls, no plugins, no verify", async () => {
    const calls: string[] = [];
    const r = await openWorkPr(
      {
        worktreePath: "/nonexistent/work-tree",
        branch: "work/w1",
        taskId: "w1",
        description: "pick a DB",
        run: {
          ok: true,
          exitCode: 0,
          task: { verified: false, verifySkipped: true, state: "blocked" },
        },
      },
      {
        git: async (_cwd, args) => {
          calls.push(`repo ${args.join(" ")}`);
          return {
            code: 1,
            stdout: "",
            stdoutBytes: 0,
            truncated: false,
            stderr: "",
            timedOut: false,
          };
        },
        runPlugin: async (o) => {
          calls.push(`plugin ${o.name}`);
          return { ok: false, exitCode: 1 };
        },
        verify: async () => {
          calls.push("verify");
          return { success: true, output: "" };
        },
        allowlist: new Set(["git-commit", "git-push", "github-pr-create"]),
        repoGate: () => ({ ok: true as const, repo: "acme/widget" }),
      },
    );
    expect(r).toMatchObject({ opened: false, reason: "needs-input" });
    expect(r.line).toBe(
      "PR: not opened — the work run is waiting for your answer to its question.",
    );
    expect(calls).toEqual([]);
  });
});
