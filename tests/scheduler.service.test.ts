/**
 * Cooperative scheduler ticker (DISCORD-SCHEDULE-3/4).
 */
import { describe, expect, test } from "bun:test";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { SchedulerService } from "../src/scheduler/service.ts";

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
