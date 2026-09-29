/**
 * Cooperative scheduler ticker (DISCORD-SCHEDULE-3/4).
 */
import { describe, expect, test } from "bun:test";
import { chatBodyFromTaskResult, ROLE_REFUSED_SUMMARY_NOTE } from "../src/agent/task-summary.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { autoPauseAsk, FAILURE_AUTO_PAUSE, SchedulerService } from "../src/scheduler/service.ts";

function allowCfg(channels: string[] = ["chan-allowed"]) {
  const cfg = emptyConfig();
  cfg.discord.channels = channels.map((c) => c.toLowerCase());
  return cfg;
}

describe("ScheduleStore durable", () => {
  test("create/list/pause/resume/delete roundtrip via SQLite", () => {
    const db = openCorvidinhoDb({ memory: true });
    const store = new ScheduleStore({ db });
    const s = store.create({
      name: "Hourly dig",
      cronExpression: "0 * * * *",
      project: "CorvidLabs/Corvidinho",
      prompt: "Summarize open PRs",
      createdByUserId: "admin-1",
      channelId: "chan-allowed",
      now: Date.parse("2026-09-26T12:00:00Z"),
    });
    expect(s.id).toStartWith("sched_");
    expect(s.nextRunAt).toBeGreaterThan(s.createdAt);
    expect(store.list()).toHaveLength(1);

    store.setStatus(s.id, "paused");
    expect(store.get(s.id)?.status).toBe("paused");
    expect(store.listDue(Date.now() + 86_400_000)).toHaveLength(0);

    store.setStatus(s.id, "active");
    expect(store.get(s.id)?.status).toBe("active");

    const db2 = openCorvidinhoDb({ memory: true });
    // Reload same rows: use file path for real reopen — memory is fresh.
    // Instead re-open by constructing from same db handle after clear maps:
    const reloaded = new ScheduleStore({ db });
    expect(reloaded.list()).toHaveLength(1);
    expect(reloaded.get(s.id)?.project).toBe("CorvidLabs/Corvidinho");

    store.delete(s.id);
    expect(store.list()).toHaveLength(0);
    void db2;
  });
});

describe("ScheduleStore auto-pause ask (REQ-discord-353, AUTONOMY-2)", () => {
  test("the failure that reaches the pause stores the pause ask, counted in SQL even from a stale cache", () => {
    const db = openCorvidinhoDb({ memory: true });
    const store = new ScheduleStore({ db });
    const now = Date.parse("2026-09-27T10:00:00Z");
    const s = store.create({
      name: "flaky",
      cronExpression: "0 * * * *",
      project: "p",
      prompt: "x",
      createdByUserId: "owner",
      channelId: "chan-allowed",
      now,
    });
    const pause = autoPauseAsk();
    const autoPause = { at: FAILURE_AUTO_PAUSE, ask: pause };
    const own = { reason: "stuck" as const, question: "Verification still fails. How should I proceed?" };
    const askRow = (id: string) =>
      db.query("SELECT ask_reason, ask_question FROM schedule_runs WHERE id = ?").get(id) as {
        ask_reason: string | null;
        ask_question: string | null;
      };

    const run1 = store.claimRun(s, now)!;
    // Another process recorded failures meanwhile; this cache still says 0.
    db.run("UPDATE schedules SET consecutive_failures = ? WHERE id = ?", [FAILURE_AUTO_PAUSE - 2, s.id]);
    store.markRunFinished(s, run1, { ok: false, error: "boom", ask: own, autoPause });
    expect(s.consecutiveFailures).toBe(FAILURE_AUTO_PAUSE - 1);
    expect(run1.ask).toEqual(own);
    expect(askRow(run1.id)).toEqual({ ask_reason: "stuck", ask_question: own.question });

    const run2 = store.claimRun(s, now + 3_600_000)!;
    store.markRunFinished(s, run2, { ok: false, error: "boom", ask: own, autoPause });
    expect(s.consecutiveFailures).toBe(FAILURE_AUTO_PAUSE);
    expect(run2.ask).toEqual(pause);
    expect(askRow(run2.id)).toEqual({ ask_reason: "stuck", ask_question: pause.question });

    // A run that succeeds never stores the pause ask, and resets the count.
    const run3 = store.claimRun(s, now + 7_200_000)!;
    store.markRunFinished(s, run3, { ok: true, summary: "done", autoPause });
    expect(s.consecutiveFailures).toBe(0);
    expect(run3.ask).toBeUndefined();
    expect(askRow(run3.id)).toEqual({ ask_reason: null, ask_question: null });
  });
});

describe("SchedulerService tick (non-blocking)", () => {
  test("tick starts due work without awaiting agent; respects allowlist", async () => {
    const store = new ScheduleStore();
    const posts: Array<{ channelId: string; content: string }> = [];
    let resolveAgent!: () => void;
    const agentGate = new Promise<void>((r) => {
      resolveAgent = r;
    });
    const agent = {
      runChat: async () => {
        await agentGate;
        return { ok: true as const, summary: "done", exitCode: 0 };
      },
    };

    const past = Date.now() - 60_000;
    const s = store.create({
      name: "Due now",
      cronExpression: "0 * * * *",
      project: "proj-a",
      prompt: "do thing",
      createdByUserId: "admin",
      channelId: "chan-allowed",
      now: past - 3_600_000,
    });
    // Force due (same object reference as in store map)
    s.nextRunAt = past;

    const svc = new SchedulerService({
      store,
      agent: agent as never,
      allowlist: allowCfg(),
      manual: true,
      maxConcurrent: 2,
      useWorktrees: false,
      outbound: {
        post: async (p) => {
          posts.push(p);
        },
      },
    });

    const tickPromise = svc.tick();
    // tick must resolve before agent finishes
    const result = await tickPromise;
    expect(result.started).toContain(s.id);
    expect(svc.runningIds()).toContain(s.id);

    resolveAgent();
    // Wait for fire-and-forget
    await new Promise((r) => setTimeout(r, 50));
    expect(svc.runningIds()).not.toContain(s.id);
    expect(posts.length).toBe(1);
    expect(posts[0]?.channelId).toBe("chan-allowed");
    svc.stop();
  });

  test("skips paused and non-allowlisted channel", async () => {
    const store = new ScheduleStore();
    const agent = createEchoAgentClient({ delayMs: 0 });
    const past = Date.now() - 1000;

    const paused = store.create({
      name: "Paused",
      cronExpression: "0 * * * *",
      project: "p",
      prompt: "x",
      createdByUserId: "a",
      now: past - 3_600_000,
    });
    paused.nextRunAt = past;
    store.setStatus(paused.id, "paused");

    const badChan = store.create({
      name: "Bad channel",
      cronExpression: "0 * * * *",
      project: "p",
      prompt: "x",
      createdByUserId: "a",
      channelId: "chan-other",
      now: past - 3_600_000,
    });
    badChan.nextRunAt = past;

    const svc = new SchedulerService({
      store,
      agent,
      allowlist: allowCfg(["chan-allowed"]),
      manual: true,
      useWorktrees: false,
    });
    const r = await svc.tick();
    expect(r.started).not.toContain(paused.id);
    expect(r.started).toContain(badChan.id);
    await new Promise((x) => setTimeout(x, 30));
    // bad channel run should have failed / not posted
    expect(store.get(badChan.id)?.consecutiveFailures).toBeGreaterThanOrEqual(1);
    svc.stop();
  });
});

describe("scheduled run posts and run rows keep the closing role note (REQ-discord-734, ROLES-CHAT-3)", () => {
  test("a long summary ending with the note keeps it in the run row and the post; one without is cut as before", async () => {
    const tail = `\n\n${ROLE_REFUSED_SUMMARY_NOTE}`;
    // What runChat hands a non-ADMIN scheduled run: 1800 chars, note last.
    const noted = chatBodyFromTaskResult({ summary: `${"x".repeat(3000)}${tail}` });
    expect(noted.length).toBe(1800);
    const plain = "p".repeat(1800);
    const db = openCorvidinhoDb({ memory: true });
    const store = new ScheduleStore({ db });
    const posts: Array<{ channelId: string; content: string }> = [];
    let settle!: () => void;
    const bothPosted = new Promise<void>((r) => {
      settle = r;
    });
    const agent = {
      runChat: async (input: { prompt: string }) => ({
        ok: true as const,
        summary: input.prompt.includes("plain run") ? plain : noted,
        exitCode: 0,
      }),
    };
    const past = Date.now() - 60_000;
    // A long name makes the post head long: the summary still fits under 1900.
    const long = store.create({
      name: `Nightly ${"n".repeat(440)}`,
      cronExpression: "0 * * * *",
      project: "proj-a",
      prompt: "noted run",
      createdByUserId: "admin",
      channelId: "chan-allowed",
      now: past - 3_600_000,
    });
    long.nextRunAt = past;
    const short = store.create({
      name: "Plain",
      cronExpression: "0 * * * *",
      project: "proj-a",
      prompt: "plain run",
      createdByUserId: "admin",
      channelId: "chan-allowed",
      now: past - 3_600_000,
    });
    short.nextRunAt = past;
    const svc = new SchedulerService({
      store,
      agent: agent as never,
      allowlist: allowCfg(),
      manual: true,
      useWorktrees: false,
      outbound: {
        post: async (p) => {
          posts.push(p);
          if (posts.length === 2) settle();
        },
      },
    });
    const r = await svc.tick();
    expect(r.started).toEqual(expect.arrayContaining([long.id, short.id]));
    await bothPosted;
    svc.stop();

    const runSummary = (id: string) =>
      (db.query("SELECT summary FROM schedule_runs WHERE schedule_id = ?").get(id) as { summary: string })
        .summary;
    const row = runSummary(long.id);
    expect(row.length).toBe(1500);
    expect(row).toBe(`${"x".repeat(1500 - tail.length)}${tail}`);
    const post = posts.find((p) => p.content.includes("Nightly"))!;
    expect(post.content.startsWith("✅ Schedule **Nightly")).toBe(true);
    expect(post.content.length).toBeLessThanOrEqual(1900);
    expect(post.content.endsWith(`x${tail}`)).toBe(true);

    // No note: the row and the post keep the plain 1500-char head cut.
    expect(runSummary(short.id)).toBe("p".repeat(1500));
    const plainPost = posts.find((p) => p.content.includes("**Plain**"))!;
    expect(plainPost.content.endsWith(`:\n${"p".repeat(1500)}`)).toBe(true);
  });
});
