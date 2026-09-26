/**
 * Bridge + daemon on one data dir (REQ-discord-108 / CLI-8 / AUTONOMOUS-4):
 * each due run is claimed once, rows stay fresh, and no writer overwrites
 * another's pause/resume or counters with a stale cached row.
 * Two Database handles on one temp file stand in for two processes.
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyConfig } from "../src/allowlist/types.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const dirs: string[] = [];
const dbs: Database[] = [];

function sharedDbPair(): [Database, Database] {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-claim-"));
  dirs.push(dir);
  const path = join(dir, "corvidinho.db");
  const a = openCorvidinhoDb({ path });
  const b = openCorvidinhoDb({ path });
  dbs.push(a, b);
  return [a, b];
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeDue(db: Database, id: string, at: number): void {
  db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [at, id]);
}

function gatedAgent(): {
  agent: AgentClient;
  release: () => void;
  calls: number[];
  signals: Array<AbortSignal | undefined>;
} {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const calls: number[] = [];
  const signals: Array<AbortSignal | undefined> = [];
  return {
    calls,
    signals,
    release: () => release(),
    agent: {
      async runChat({ sessionId, signal }) {
        calls.push(Date.now());
        signals.push(signal);
        await gate;
        return { ok: true, sessionId, summary: "done", exitCode: 0 };
      },
    },
  };
}

function svc(store: ScheduleStore, agent: AgentClient): SchedulerService {
  return new SchedulerService({
    store,
    agent,
    allowlist: emptyConfig(),
    manual: true,
    useWorktrees: false,
  });
}

const settle = () => new Promise((r) => setTimeout(r, 30));

describe("ScheduleStore across processes", () => {
  test("claimRun fires a due run once across two tickers", async () => {
    const [dbA, dbB] = sharedDbPair();
    const storeA = new ScheduleStore({ db: dbA });
    const s = storeA.create({
      name: "nightly",
      cronExpression: "0 * * * *",
      project: "p",
      prompt: "x",
      createdByUserId: "owner",
    });
    const past = Date.now() - 1000;
    makeDue(dbA, s.id, past);
    const storeB = new ScheduleStore({ db: dbB });

    const a = gatedAgent();
    const b = gatedAgent();
    const svcA = svc(storeA, a.agent);
    const svcB = svc(storeB, b.agent);

    const ra = await svcA.tick();
    const rb = await svcB.tick();
    expect(ra.started).toEqual([s.id]);
    expect(rb.started).toEqual([]);
    expect(a.calls.length + b.calls.length).toBe(1);

    a.release();
    b.release();
    await settle();
    const runs = dbA
      .query("SELECT status FROM schedule_runs WHERE schedule_id = ?")
      .all(s.id) as Array<{ status: string }>;
    expect(runs.map((r) => r.status)).toEqual(["completed"]);
    const row = dbA
      .query("SELECT execution_count FROM schedules WHERE id = ?")
      .get(s.id) as { execution_count: number };
    expect(row.execution_count).toBe(1);
  });

  test("a tick sees schedules another process created, paused or deleted", async () => {
    const [dbA, dbB] = sharedDbPair();
    const daemonStore = new ScheduleStore({ db: dbA });
    const bridgeStore = new ScheduleStore({ db: dbB });
    const echo = gatedAgent();
    echo.release();
    const daemon = svc(daemonStore, echo.agent);

    const s = bridgeStore.create({
      name: "created by bridge",
      cronExpression: "0 * * * *",
      project: "p",
      prompt: "x",
      createdByUserId: "owner",
    });
    makeDue(dbB, s.id, Date.now() - 1000);
    bridgeStore.setStatus(s.id, "paused");
    expect((await daemon.tick()).started).toEqual([]);
    expect(daemonStore.get(s.id)?.status).toBe("paused");

    bridgeStore.setStatus(s.id, "active");
    makeDue(dbB, s.id, Date.now() - 1000);
    expect((await daemon.tick()).started).toEqual([s.id]);
    await settle();

    bridgeStore.delete(s.id);
    daemonStore.refresh();
    expect(daemonStore.get(s.id)).toBeUndefined();
  });

  test("a run finishing never overwrites a pause made meanwhile", async () => {
    const [dbA, dbB] = sharedDbPair();
    const daemonStore = new ScheduleStore({ db: dbA });
    const s = daemonStore.create({
      name: "long job",
      cronExpression: "0 * * * *",
      project: "p",
      prompt: "x",
      createdByUserId: "owner",
    });
    makeDue(dbA, s.id, Date.now() - 1000);
    const gated = gatedAgent();
    const daemon = svc(daemonStore, gated.agent);
    expect((await daemon.tick()).started).toEqual([s.id]);

    // Bridge process pauses while the daemon's run is in flight.
    const bridgeStore = new ScheduleStore({ db: dbB });
    bridgeStore.setStatus(s.id, "paused");

    gated.release();
    await settle();
    const row = dbA
      .query("SELECT status, execution_count, consecutive_failures FROM schedules WHERE id = ?")
      .get(s.id) as { status: string; execution_count: number; consecutive_failures: number };
    expect(row.status).toBe("paused");
    expect(row.execution_count).toBe(1);
    expect(row.consecutive_failures).toBe(0);
  });

  test("failures are counted in SQL so every process agrees", () => {
    const [dbA, dbB] = sharedDbPair();
    const storeA = new ScheduleStore({ db: dbA });
    const s = storeA.create({
      name: "flaky",
      cronExpression: "0 * * * *",
      project: "p",
      prompt: "x",
      createdByUserId: "owner",
    });
    const storeB = new ScheduleStore({ db: dbB });
    const run1 = storeA.claimRun(s)!;
    // storeB sees the claimed row (0 failures), then claims the next run.
    storeB.refresh();
    const sb = storeB.get(s.id)!;
    const run2 = storeB.claimRun(sb)!;
    expect(run1).not.toBeNull();
    expect(run2).not.toBeNull();
    storeA.markRunFinished(s, run1, { ok: false, error: "boom" });
    // storeB's cached row is stale (0 failures) — the count still reaches 2.
    storeB.markRunFinished(sb, run2, { ok: false, error: "boom" });
    expect(sb.consecutiveFailures).toBe(2);
    const row = dbA
      .query("SELECT consecutive_failures FROM schedules WHERE id = ?")
      .get(s.id) as { consecutive_failures: number };
    expect(row.consecutive_failures).toBe(2);
  });

  test("in-memory claimRun refuses a paused schedule", () => {
    const store = new ScheduleStore();
    const s = store.create({
      name: "mem",
      cronExpression: "0 * * * *",
      project: "p",
      prompt: "x",
      createdByUserId: "owner",
    });
    store.setStatus(s.id, "paused");
    expect(store.claimRun(s)).toBeNull();
    store.setStatus(s.id, "active");
    expect(store.claimRun(s)?.scheduleId).toBe(s.id);
  });
});

describe("SchedulerService drain / abandon", () => {
  test("abandonInFlight records a stuck run failed once", async () => {
    const db = openCorvidinhoDb({ memory: true });
    dbs.push(db);
    const store = new ScheduleStore({ db });
    const s = store.create({
      name: "stuck",
      cronExpression: "0 * * * *",
      project: "p",
      prompt: "x",
      createdByUserId: "owner",
    });
    makeDue(db, s.id, Date.now() - 1000);
    const gated = gatedAgent();
    const finished: Array<{ ok: boolean; error?: string }> = [];
    const service = new SchedulerService({
      store,
      agent: gated.agent,
      allowlist: emptyConfig(),
      manual: true,
      useWorktrees: false,
      onRunFinished: (e) => finished.push({ ok: e.ok, error: e.error }),
    });
    expect((await service.tick()).started).toEqual([s.id]);
    expect(await service.drain(20)).toBe(false);
    expect(gated.signals[0]?.aborted).toBe(false);
    expect(service.abandonInFlight("interrupted: test")).toEqual([s.id]);
    expect(service.runningIds()).toEqual([]);
    // The abandoned run's agent is told to stop (its process tree is killed).
    expect(gated.signals[0]?.aborted).toBe(true);
    gated.release();
    await settle();
    // The late agent result does not record the run a second time.
    expect(finished).toEqual([{ ok: false, error: "interrupted: test" }]);
    expect(store.get(s.id)?.consecutiveFailures).toBe(1);
    expect(await service.drain(10)).toBe(true);
  });
});
