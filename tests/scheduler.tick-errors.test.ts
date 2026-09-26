/**
 * A scheduler tick or run that throws never becomes an unhandled rejection
 * (REQ-discord-331 / DISCORD-SCHEDULE-4 / CLI-8 / AUTONOMOUS-4). Bun exits 1
 * on an unhandled rejection, so one SQLITE_BUSY from a tick used to take the
 * whole Discord bridge down. Errors are logged scrubbed (SAFE-6), the tick
 * lock and running slots are released, and the next tick still runs.
 */
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyConfig } from "../src/allowlist/types.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { ScheduleStore, type Schedule } from "../src/scheduler/store.ts";
import * as worktree from "../src/worktree/index.ts";

const FAKE_TOKEN = `ghp_${"a".repeat(36)}`;
const BUSY = `SQLITE_BUSY: database is locked (${FAKE_TOKEN})`;

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** Record unhandled rejections for this test only (removed in afterEach). */
function watchUnhandled(): unknown[] {
  const seen: unknown[] = [];
  const onRejection = (reason: unknown) => {
    seen.push(reason);
  };
  process.on("unhandledRejection", onRejection);
  cleanups.push(() => process.off("unhandledRejection", onRejection));
  return seen;
}

function quietErrors(): string[] {
  const lines: string[] = [];
  const spy = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  cleanups.push(() => spy.mockRestore());
  return lines;
}

async function waitFor(cond: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await Bun.sleep(5);
  }
}

function dueSchedule(store: ScheduleStore, name: string, project = "proj-a"): Schedule {
  const past = Date.now() - 60_000;
  const s = store.create({
    name,
    cronExpression: "0 * * * *",
    project,
    prompt: "do thing",
    createdByUserId: "admin",
    now: past - 3_600_000,
  });
  s.nextRunAt = past;
  return s;
}

function okAgent(calls: string[] = []) {
  return {
    calls,
    runChat: async (opts: { sessionId: string }) => {
      calls.push(opts.sessionId);
      return { ok: true as const, summary: "done", exitCode: 0 };
    },
  };
}

describe("scheduler interval tick errors (REQ-discord-331)", () => {
  test("listDue throws once: logged scrubbed, no unhandled rejection, next tick runs the due schedule", async () => {
    const unhandled = watchUnhandled();
    const errors = quietErrors();
    const store = new ScheduleStore();
    const s = dueSchedule(store, "Busy list");
    const listDue = store.listDue.bind(store);
    let listCalls = 0;
    store.listDue = (now?: number) => {
      listCalls += 1;
      if (listCalls === 1) throw new Error(BUSY);
      return listDue(now);
    };
    const agent = okAgent();
    const svc = new SchedulerService({
      store,
      agent: agent as never,
      allowlist: emptyConfig(),
      pollIntervalMs: 5,
      useWorktrees: false,
    });
    cleanups.push(() => svc.stop());

    await waitFor(() => agent.calls.length >= 1);
    svc.stop();
    expect(await svc.drain(2_000)).toBe(true);
    await Bun.sleep(10);

    expect(unhandled).toEqual([]);
    expect(listCalls).toBeGreaterThanOrEqual(2);
    expect(agent.calls).toEqual([`schedule_${s.id}`]);
    expect(store.get(s.id)?.executionCount).toBe(1);
    const logged = errors.find((l) => l.startsWith("[scheduler] tick failed:"));
    expect(logged).toContain("SQLITE_BUSY: database is locked");
    expect(logged).toContain("[redacted:github-token]");
    expect(errors.join("\n")).not.toContain(FAKE_TOKEN);
  });

  test("claimRun throws once: no unhandled rejection, the next tick claims and runs it", async () => {
    const unhandled = watchUnhandled();
    const errors = quietErrors();
    const store = new ScheduleStore();
    const s = dueSchedule(store, "Busy claim");
    const claimRun = store.claimRun.bind(store);
    let claimCalls = 0;
    store.claimRun = (schedule: Schedule, now?: number) => {
      claimCalls += 1;
      if (claimCalls === 1) throw new Error(BUSY);
      return claimRun(schedule, now);
    };
    const agent = okAgent();
    const svc = new SchedulerService({
      store,
      agent: agent as never,
      allowlist: emptyConfig(),
      pollIntervalMs: 5,
      useWorktrees: false,
    });
    cleanups.push(() => svc.stop());

    await waitFor(() => agent.calls.length >= 1);
    svc.stop();
    expect(await svc.drain(2_000)).toBe(true);
    await Bun.sleep(10);

    expect(unhandled).toEqual([]);
    expect(claimCalls).toBeGreaterThanOrEqual(2);
    expect(agent.calls).toEqual([`schedule_${s.id}`]);
    expect(errors.some((l) => l.startsWith("[scheduler] tick failed: SQLITE_BUSY"))).toBe(true);
  });

  test("a multi-line or unprintable tick error is logged on one line and never rejects", async () => {
    const unhandled = watchUnhandled();
    const errors = quietErrors();
    const store = new ScheduleStore();
    const s = dueSchedule(store, "Odd errors");
    const listDue = store.listDue.bind(store);
    let listCalls = 0;
    store.listDue = (now?: number) => {
      listCalls += 1;
      if (listCalls === 1) {
        throw new Error(`${BUSY}\n[discord] forged line`);
      }
      // String() of a null-prototype object throws.
      if (listCalls === 2) throw Object.create(null);
      return listDue(now);
    };
    const agent = okAgent();
    const svc = new SchedulerService({
      store,
      agent: agent as never,
      allowlist: emptyConfig(),
      pollIntervalMs: 5,
      useWorktrees: false,
    });
    cleanups.push(() => svc.stop());

    await waitFor(() => agent.calls.length >= 1);
    svc.stop();
    expect(await svc.drain(2_000)).toBe(true);
    await Bun.sleep(10);

    expect(unhandled).toEqual([]);
    expect(agent.calls).toEqual([`schedule_${s.id}`]);
    const ticks = errors.filter((l) => l.startsWith("[scheduler] tick failed:"));
    expect(ticks).toEqual([
      "[scheduler] tick failed: SQLITE_BUSY: database is locked ([redacted:github-token]) [discord] forged line",
      "[scheduler] tick failed: (unprintable error)",
    ]);
  });

  test("a bridge-style process stays up after a tick throws (no global unhandledRejection handler)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-tick-crash-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const src = join(import.meta.dir, "..", "src");
    const script = join(dir, "bridge-like.ts");
    writeFileSync(
      script,
      [
        `import { SchedulerService } from ${JSON.stringify(join(src, "scheduler", "service.ts"))};`,
        `import { ScheduleStore } from ${JSON.stringify(join(src, "scheduler", "store.ts"))};`,
        `import { emptyConfig } from ${JSON.stringify(join(src, "allowlist", "types.ts"))};`,
        "const store = new ScheduleStore();",
        "let ticks = 0;",
        "store.listDue = () => {",
        "  ticks += 1;",
        `  if (ticks === 1) throw new Error(${JSON.stringify(BUSY)});`,
        "  return [];",
        "};",
        "new SchedulerService({",
        "  store,",
        "  agent: { runChat: async () => ({ ok: true, summary: '', exitCode: 0 }) } as never,",
        "  allowlist: emptyConfig(),",
        "  pollIntervalMs: 5,",
        "  useWorktrees: false,",
        "});",
        "// Like the bridge: the process lives on its own ref'd handles.",
        "const alive = setInterval(() => {",
        "  if (ticks >= 3) {",
        "    clearInterval(alive);",
        "    console.log(`alive after ${ticks} ticks`);",
        "    process.exit(0);",
        "  }",
        "}, 5);",
        "",
      ].join("\n"),
    );
    const proc = Bun.spawn([process.execPath, script], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    });
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    expect({ code, out: out.trim() }).toMatchObject({ code: 0 });
    expect(out).toContain("alive after");
    expect(err).toContain("[scheduler] tick failed: SQLITE_BUSY");
    expect(err).not.toContain(FAKE_TOKEN);
  });
});

describe("scheduler tick lock and run slots are released (REQ-discord-331)", () => {
  test("tick() rejects on a store error but frees the tick lock; runs claimed before the throw keep going", async () => {
    const store = new ScheduleStore();
    const a = dueSchedule(store, "A");
    const b = dueSchedule(store, "B");
    const claimRun = store.claimRun.bind(store);
    let failB = true;
    store.claimRun = (schedule: Schedule, now?: number) => {
      if (schedule.id === b.id && failB) {
        failB = false;
        throw new Error(BUSY);
      }
      return claimRun(schedule, now);
    };
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const calls: string[] = [];
    const agent = {
      runChat: async (opts: { sessionId: string }) => {
        calls.push(opts.sessionId);
        await gate;
        return { ok: true as const, summary: "done", exitCode: 0 };
      },
    };
    const svc = new SchedulerService({
      store,
      agent: agent as never,
      allowlist: emptyConfig(),
      manual: true,
      useWorktrees: false,
    });

    await expect(svc.tick()).rejects.toThrow("SQLITE_BUSY");
    expect(svc.runningIds()).toEqual([a.id]);

    const second = await svc.tick();
    expect(second.started).toEqual([b.id]);
    // A was claimed by the first tick (next_run advanced), so it is not due.
    expect(second.skipped).toEqual([]);
    expect(svc.runningIds().sort()).toEqual([a.id, b.id].sort());

    release();
    expect(await svc.drain(2_000)).toBe(true);
    expect(calls.sort()).toEqual([`schedule_${a.id}`, `schedule_${b.id}`].sort());
    expect(store.get(a.id)?.executionCount).toBe(1);
    expect(store.get(b.id)?.executionCount).toBe(1);
  });

  test("a run whose failure cannot be recorded never rejects: logged, slot freed, no unhandled rejection", async () => {
    const unhandled = watchUnhandled();
    const errors = quietErrors();
    const store = new ScheduleStore();
    const s = dueSchedule(store, "Double fault");
    store.markRunFinished = () => {
      throw new Error(BUSY);
    };
    const agent = {
      runChat: async () => {
        throw new Error("spawn failed");
      },
    };
    const svc = new SchedulerService({
      store,
      agent: agent as never,
      allowlist: emptyConfig(),
      manual: true,
      useWorktrees: false,
    });

    expect((await svc.tick()).started).toEqual([s.id]);
    await waitFor(() => svc.runningIds().length === 0);
    await Bun.sleep(10);

    expect(unhandled).toEqual([]);
    const logged = errors.find((l) => l.startsWith("[scheduler] run failed:"));
    expect(logged).toContain("SQLITE_BUSY");
    expect(logged).not.toContain(FAKE_TOKEN);
    expect(await svc.drain(1_000)).toBe(true);
  });

  test("a worktree park failure still frees the running slot, so the schedule runs again", async () => {
    const unhandled = watchUnhandled();
    const errors = quietErrors();
    const root = mkdtempSync(join(tmpdir(), "corvidinho-tick-park-"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const projectRoot = join(root, "workspace");
    mkdirSync(join(projectRoot, "proj-park"), { recursive: true });
    const park = spyOn(worktree, "parkWorktree").mockImplementation(async () => {
      throw new Error("park failed");
    });
    cleanups.push(() => park.mockRestore());

    const store = new ScheduleStore();
    const s = dueSchedule(store, "Park fault", "proj-park");
    const agent = okAgent();
    const svc = new SchedulerService({
      store,
      agent: agent as never,
      allowlist: emptyConfig(),
      manual: true,
      defaultProjectRoot: projectRoot,
    });

    expect((await svc.tick()).started).toEqual([s.id]);
    await waitFor(() => park.mock.calls.length >= 1 && svc.runningIds().length === 0);
    await Bun.sleep(10);

    expect(unhandled).toEqual([]);
    expect(errors.some((l) => l === "[scheduler] run failed: park failed")).toBe(true);
    expect(store.get(s.id)?.consecutiveFailures).toBe(0);

    // Not wedged: once due again, the same schedule starts on the next tick.
    s.nextRunAt = Date.now() - 1_000;
    expect((await svc.tick()).started).toEqual([s.id]);
    await waitFor(() => svc.runningIds().length === 0);
    expect(agent.calls).toHaveLength(2);
  });
});
