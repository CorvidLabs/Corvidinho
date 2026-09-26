/**
 * `corvidinho daemon` (REQ-cli-108 / CLI-8 / AUTONOMOUS-4): single-instance
 * lock, JSON-line scrubbed logs, headless ticking, graceful stop.
 * Fixtures only: temp data dirs, injected agent, no network; the only spawn
 * is a fake `sh` agent bin proving shutdown kills an abandoned run's tree.
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireDaemonLock,
  createDaemonLogger,
  daemonLockPath,
  formatDaemonLogLine,
  isHolderAlive,
  readProcStart,
  startDaemon,
  type DaemonLogger,
} from "../src/daemon/index.ts";
import { createSpawnAgentClient, type AgentClient } from "../src/discord/agent-client.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const dirs: string[] = [];
function tempDir(prefix = "corvidinho-daemon-"): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const DEAD_PID = 2_147_483_646;

/** Alive and not a zombie (an unreaped orphan counts as dead). */
function running(pid: number): boolean {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const state = stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
    return state !== "Z" && state !== "X";
  } catch {
    return false;
  }
}

async function until(cond: () => boolean, ms = 3000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await Bun.sleep(20);
  }
  return cond();
}
const fakeToken = () => "gh" + "p_" + "a1B2c3D4e5".repeat(4).slice(0, 36);

function memoryLogger(): { log: DaemonLogger; lines: Array<Record<string, unknown>> } {
  const lines: Array<Record<string, unknown>> = [];
  return {
    lines,
    log: createDaemonLogger({ write: (l) => lines.push(JSON.parse(l)) }),
  };
}

describe("daemon lock", () => {
  test("second holder is refused and named; release frees it", () => {
    const dataDir = tempDir();
    const first = acquireDaemonLock({ dataDir });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(existsSync(daemonLockPath(dataDir))).toBe(true);

    const second = acquireDaemonLock({ dataDir, pid: DEAD_PID - 1 });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe("held");
    expect(second.holder?.pid).toBe(process.pid);
    expect(second.message).toContain(`pid ${process.pid}`);

    first.lock.release();
    expect(existsSync(daemonLockPath(dataDir))).toBe(false);
    const third = acquireDaemonLock({ dataDir });
    expect(third.ok).toBe(true);
    if (third.ok) third.lock.release();
  });

  test("a lock left by a dead pid is taken over", () => {
    const dataDir = tempDir();
    writeFileSync(
      daemonLockPath(dataDir),
      JSON.stringify({ pid: DEAD_PID, startedAt: "x", procStart: null }),
    );
    const got = acquireDaemonLock({ dataDir });
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    const onDisk = JSON.parse(readFileSync(got.lock.path, "utf8"));
    expect(onDisk.pid).toBe(process.pid);
    got.lock.release();
  });

  test("a recycled pid (different /proc start time) is stale", () => {
    const dataDir = tempDir();
    writeFileSync(
      daemonLockPath(dataDir),
      JSON.stringify({ pid: process.pid, startedAt: "x", procStart: "1" }),
    );
    expect(readProcStart(process.pid)).not.toBe("1");
    const got = acquireDaemonLock({ dataDir, pid: DEAD_PID - 2 });
    expect(got.ok).toBe(true);
    if (got.ok) got.lock.release();
  });

  test("liveness: live self, dead pid, bad pid", () => {
    expect(
      isHolderAlive({ pid: process.pid, startedAt: "", procStart: readProcStart(process.pid) }),
    ).toBe(true);
    expect(isHolderAlive({ pid: DEAD_PID, startedAt: "", procStart: null })).toBe(false);
    expect(isHolderAlive({ pid: 0, startedAt: "", procStart: null })).toBe(false);
  });

  test("an unreadable young lock is not stolen; an old one is", () => {
    const dataDir = tempDir();
    const path = daemonLockPath(dataDir);
    writeFileSync(path, "");
    const young = acquireDaemonLock({ dataDir });
    expect(young.ok).toBe(false);
    if (!young.ok) expect(young.reason).toBe("contended");

    const old = new Date(Date.now() - 60_000);
    utimesSync(path, old, old);
    const taken = acquireDaemonLock({ dataDir });
    expect(taken.ok).toBe(true);
    if (taken.ok) taken.lock.release();
  });

  test("release leaves a lock that now names someone else", () => {
    const dataDir = tempDir();
    const got = acquireDaemonLock({ dataDir });
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    const other = JSON.stringify({ pid: DEAD_PID, startedAt: "y", procStart: null });
    writeFileSync(got.lock.path, other);
    got.lock.release();
    expect(readFileSync(got.lock.path, "utf8")).toBe(other);
  });
});

describe("daemon logs", () => {
  test("one JSON object per line with reserved keys first; secrets scrubbed", () => {
    const token = fakeToken();
    const line = formatDaemonLogLine(
      "warn",
      "run.finished",
      { error: `401 using ${token}`, nested: { ids: [token] }, event: "spoof" },
      new Date("2026-09-26T12:00:00Z"),
    );
    expect(line).not.toContain("\n");
    expect(line).not.toContain(token);
    const obj = JSON.parse(line);
    expect(Object.keys(obj).slice(0, 4)).toEqual(["ts", "level", "component", "event"]);
    expect(obj).toMatchObject({
      ts: "2026-09-26T12:00:00.000Z",
      level: "warn",
      component: "daemon",
      event: "run.finished",
    });
    expect(obj.error).toContain("[redacted:");
    expect(obj.nested.ids[0]).toContain("[redacted:");
  });
});

describe("startDaemon", () => {
  function fixture() {
    const dataDir = tempDir();
    const projectRoot = tempDir("corvidinho-daemon-proj-");
    const env = { ...process.env, CORVIDINHO_DATA_DIR: dataDir };
    return { dataDir, projectRoot, env };
  }

  function echoAgent(delayMs = 0, onCall?: () => void): AgentClient {
    return {
      async runChat({ sessionId }) {
        onCall?.();
        if (delayMs > 0) await Bun.sleep(delayMs);
        return { ok: true, sessionId, summary: "scheduled work done", exitCode: 0 };
      },
    };
  }

  function seedDue(db: Database, name = "nightly"): string {
    const store = new ScheduleStore({ db });
    const s = store.create({
      name,
      cronExpression: "0 * * * *",
      project: ".",
      prompt: "summarize",
      createdByUserId: "owner",
    });
    db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [Date.now() - 1000, s.id]);
    return s.id;
  }

  test("ticks a due schedule headlessly and logs run.finished", async () => {
    const { dataDir, projectRoot, env } = fixture();
    const other = openCorvidinhoDb({ env }); // e.g. the bridge that created it
    const id = seedDue(other);
    const { log, lines } = memoryLogger();
    const d = await startDaemon({
      env,
      projectRoot,
      logger: log,
      agent: echoAgent(),
      useWorktrees: false,
    });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.lockPath).toBe(daemonLockPath(dataDir));
    expect(lines[0]).toMatchObject({ event: "daemon.started", schedulesActive: 1 });

    const r = await d.tick();
    expect(r.started).toEqual([id]);
    await Bun.sleep(30);
    expect(lines.some((l) => l.event === "tick")).toBe(true);
    expect(lines.find((l) => l.event === "run.finished")).toMatchObject({
      scheduleId: id,
      ok: true,
    });
    const run = other
      .query("SELECT status, summary FROM schedule_runs WHERE schedule_id = ?")
      .get(id) as { status: string; summary: string };
    expect(run.status).toBe("completed");

    const stopped = await d.stop("SIGTERM");
    expect(stopped).toEqual({ drained: true, abandoned: [] });
    expect(existsSync(d.lockPath)).toBe(false);
    expect(lines.at(-1)).toMatchObject({ event: "daemon.stopped", reason: "SIGTERM" });
    other.close();
  });

  test("a second daemon on the same data dir refuses to start", async () => {
    const { projectRoot, env } = fixture();
    const first = await startDaemon({
      env,
      projectRoot,
      logger: memoryLogger().log,
      agent: echoAgent(),
    });
    expect(first.ok).toBe(true);
    const { log, lines } = memoryLogger();
    const second = await startDaemon({
      env,
      projectRoot,
      logger: log,
      agent: echoAgent(),
      lock: { pid: DEAD_PID - 3 },
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.exitCode).toBe(1);
    expect(lines[0]).toMatchObject({
      level: "error",
      event: "daemon.lock_held",
      holderPid: process.pid,
    });
    if (first.ok) await first.stop();
  });

  test("stop waits the grace, then records stragglers failed and frees the lock", async () => {
    const { projectRoot, env } = fixture();
    const db = openCorvidinhoDb({ env });
    const id = seedDue(db);
    const { log, lines } = memoryLogger();
    const d = await startDaemon({
      env,
      projectRoot,
      logger: log,
      agent: echoAgent(5_000),
      useWorktrees: false,
      shutdownGraceMs: 30,
    });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect((await d.tick()).started).toEqual([id]);
    const first = d.stop("SIGTERM");
    expect(d.stop("again")).toBe(first); // idempotent
    const summary = await first;
    expect(summary).toEqual({ drained: false, abandoned: [id] });
    expect(existsSync(d.lockPath)).toBe(false);
    expect(lines.find((l) => l.event === "daemon.abandoned")).toMatchObject({
      scheduleIds: [id],
    });
    const run = db
      .query("SELECT status, error FROM schedule_runs WHERE schedule_id = ?")
      .get(id) as { status: string; error: string };
    expect(run.status).toBe("failed");
    expect(run.error).toContain("daemon shutdown");
    db.close();
  });

  test("stop after the grace kills an abandoned run's process tree (AGENT-3)", async () => {
    const { projectRoot, env } = fixture();
    const db = openCorvidinhoDb({ env });
    const id = seedDue(db);
    const binDir = tempDir("corvidinho-daemon-bin-");
    const bin = join(binDir, "corvidinho");
    writeFileSync(
      bin,
      [
        "#!/bin/sh",
        `echo $$ > "${binDir}/run.pid"`,
        `sleep 30 & echo $! > "${binDir}/bg.pid"`,
        `setsid sleep 30 & echo $! > "${binDir}/sess.pid"`,
        "sleep 30",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    const { log, lines } = memoryLogger();
    const d = await startDaemon({
      env,
      projectRoot,
      logger: log,
      agent: createSpawnAgentClient({ bin, cwd: projectRoot }),
      useWorktrees: false,
      shutdownGraceMs: 100,
    });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect((await d.tick()).started).toEqual([id]);
    const pidFiles = ["run.pid", "bg.pid", "sess.pid"].map((f) => join(binDir, f));
    expect(await until(() => pidFiles.every((f) => existsSync(f) && readFileSync(f, "utf8").trim() !== ""))).toBe(true);
    const pids = pidFiles.map((f) => Number(readFileSync(f, "utf8").trim()));
    expect(await until(() => pids.every(running))).toBe(true);

    const summary = await d.stop("SIGTERM");
    expect(summary.abandoned).toEqual([id]);
    expect(lines.find((l) => l.event === "daemon.abandoned")).toMatchObject({ scheduleIds: [id] });
    // Nothing of the abandoned run keeps working after the shutdown.
    expect(await until(() => pids.every((p) => !running(p)))).toBe(true);
    const run = db
      .query("SELECT status, error FROM schedule_runs WHERE schedule_id = ?")
      .get(id) as { status: string; error: string };
    expect(run.status).toBe("failed");
    db.close();
  });

  test("forceStop cuts the grace short", async () => {
    const { projectRoot, env } = fixture();
    const db = openCorvidinhoDb({ env });
    const id = seedDue(db);
    const d = await startDaemon({
      env,
      projectRoot,
      logger: memoryLogger().log,
      agent: echoAgent(5_000),
      useWorktrees: false,
      shutdownGraceMs: 60_000,
    });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    await d.tick();
    const t0 = Date.now();
    const pending = d.stop("SIGINT");
    d.forceStop();
    const summary = await pending;
    expect(Date.now() - t0).toBeLessThan(5_000);
    expect(summary.abandoned).toEqual([id]);
    db.close();
  });

  test("a channel outside the allowlist is refused, not run (DISCORD-SCHEDULE-3)", async () => {
    const { projectRoot, env } = fixture();
    const db = openCorvidinhoDb({ env });
    const store = new ScheduleStore({ db });
    const s = store.create({
      name: "posts somewhere",
      cronExpression: "0 * * * *",
      project: ".",
      prompt: "x",
      channelId: "chan-not-allowed",
      createdByUserId: "owner",
    });
    db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [Date.now() - 1000, s.id]);
    let calls = 0;
    const { log, lines } = memoryLogger();
    const d = await startDaemon({
      env: {
        ...env,
        CORVIDINHO_DISCORD_ALLOW_CHANNELS: "",
        DISCORD_CHANNEL_IDS: "",
        CORVIDINHO_ALLOWLIST_FILE: join(projectRoot, "missing.toml"),
      },
      projectRoot,
      logger: log,
      agent: echoAgent(0, () => {
        calls += 1;
      }),
      useWorktrees: false,
    });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    await d.tick();
    await Bun.sleep(20);
    expect(calls).toBe(0);
    expect(lines.find((l) => l.event === "run.finished")).toMatchObject({
      ok: false,
      error: "channel not allowlisted: chan-not-allowed",
    });
    await d.stop();
    db.close();
  });
});
