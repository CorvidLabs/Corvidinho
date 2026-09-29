/**
 * OPS-1 / OPS-2 (#68, REQ-cli-680 / REQ-discord-680): the nightly backup runs
 * from the existing scheduler tick in `corvidinho daemon` and the Discord
 * bridge, the bridge tells the owner about a failure in the announcements
 * channel once per failure streak, `corvidinho backup list|restore` and the
 * doctor line. These tests do not import src/store/backup.ts, so on a tree
 * without it each one fails on its own assertion. Fixtures only: temp data /
 * backup dirs, injected agent and clock, null gateway, no network.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDaemonLogger, startDaemon } from "../src/daemon/index.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { AnnounceStore } from "../src/discord/announce-store.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway } from "../src/discord/gateway.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const REPO_ROOT = join(import.meta.dir, "..");
const OWNER = "111122223333444455";
const SNAP_RE = /^corvidinho-\d{8}T\d{6}Z\.db$/;

const dirs: string[] = [];
function tempDir(prefix = "corvidinho-backup-wiring-"): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}
const open: Database[] = [];
afterEach(() => {
  for (const db of open.splice(0)) {
    try {
      db.close();
    } catch {
      // closed by the test
    }
  }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** 03:30 local on 2026-09-29 (the backup is due from 03:00 local). */
const NIGHT = new Date(2026, 8, 29, 3, 30).getTime();

function liveDb(dataDir = tempDir("corvidinho-backup-data-")): { db: Database; path: string } {
  const path = join(dataDir, "corvidinho.db");
  const db = openCorvidinhoDb({ path });
  open.push(db);
  db.run(
    `INSERT INTO memories (id, owner_user_id, category, key, content, created_at, updated_at)
     VALUES ('m1', 'u1', 'note', 'k1', 'remember this', 1, 1)`,
  );
  return { db, path };
}

function meta(db: Database, key: string): string | null {
  const row = db.query("SELECT value FROM schema_meta WHERE key = ?").get(key) as {
    value: string;
  } | null;
  return row?.value ?? null;
}

function snapshots(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((n) => SNAP_RE.test(n)) : [];
}

async function until(cond: () => boolean, ms = 3000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await Bun.sleep(20);
  }
  return cond();
}

const idleAgent: AgentClient = {
  async runChat({ sessionId }) {
    return { ok: true, sessionId, summary: "done", exitCode: 0 };
  },
};

describe("scheduler tick (OPS-1: runs from the existing tick)", () => {
  test("every tick hands its clock to the backup ticker", async () => {
    const { db } = liveDb();
    const seen: number[] = [];
    const scheduler = new SchedulerService({
      store: new ScheduleStore({ db }),
      agent: idleAgent,
      allowlist: emptyConfig(),
      manual: true,
      useWorktrees: false,
      now: () => NIGHT,
      backup: { tick: (now: number) => void seen.push(now), settle: async () => {} },
    } as ConstructorParameters<typeof SchedulerService>[0]);
    await scheduler.tick();
    await scheduler.tick();
    expect(seen).toEqual([NIGHT, NIGHT]);
  });
});

describe("corvidinho daemon (OPS-1/2)", () => {
  function fixture(backupDir: string) {
    const dataDir = tempDir("corvidinho-backup-daemon-");
    return {
      dataDir,
      env: {
        ...process.env,
        CORVIDINHO_DATA_DIR: dataDir,
        CORVIDINHO_ALLOWLIST_FILE: join(dataDir, "no-allowlist.toml"),
        CORVIDINHO_OWNER_DISCORD_ID: "",
        CORVIDINHO_BACKUP_DIR: backupDir,
      },
    };
  }

  test("logs where backups go, then its tick takes the nightly snapshot and the restore test", async () => {
    const backupDir = join(tempDir(), "backups");
    const { env } = fixture(backupDir);
    const lines: Array<Record<string, unknown>> = [];
    const d = await startDaemon({
      env,
      projectRoot: tempDir("corvidinho-backup-proj-"),
      logger: createDaemonLogger({ write: (l) => lines.push(JSON.parse(l)) }),
      agent: idleAgent,
      useWorktrees: false,
      now: () => NIGHT,
    } as Parameters<typeof startDaemon>[0]);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(lines[0]).toMatchObject({ event: "daemon.started", backup: backupDir });
    await d.tick();
    await d.tick();
    expect(snapshots(backupDir)).toHaveLength(1);
    const ok = lines.find((l) => l.event === "backup.ok");
    expect(ok).toMatchObject({ level: "info", component: "daemon", dir: backupDir });
    expect(SNAP_RE.test(String(ok?.snapshot))).toBe(true);
    expect(lines.find((l) => l.event === "restore_test.ok")).toMatchObject({
      level: "info",
      snapshot: ok?.snapshot,
    });
    expect(lines.filter((l) => l.event === "backup.ok")).toHaveLength(1);
    await d.stop();
  });

  test("a failed backup is logged as an error and its owner notice waits for a bridge", async () => {
    const file = join(tempDir(), "not-a-dir");
    writeFileSync(file, "x");
    const { dataDir, env } = fixture(file);
    const lines: Array<Record<string, unknown>> = [];
    const d = await startDaemon({
      env,
      projectRoot: tempDir("corvidinho-backup-proj-"),
      logger: createDaemonLogger({ write: (l) => lines.push(JSON.parse(l)) }),
      agent: idleAgent,
      useWorktrees: false,
      now: () => NIGHT,
    } as Parameters<typeof startDaemon>[0]);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    await d.tick();
    expect(lines.find((l) => l.event === "backup.failed")).toMatchObject({
      level: "error",
      component: "daemon",
      ownerNotice: "recorded",
    });
    await d.stop();
    const db = openCorvidinhoDb({ path: join(dataDir, "corvidinho.db") });
    open.push(db);
    expect(meta(db, "ops_backup_notice")).toBe(String(NIGHT));
  });

  test("unset CORVIDINHO_BACKUP_DIR: daemon.started says off and no backup runs", async () => {
    const { env } = fixture("");
    const lines: Array<Record<string, unknown>> = [];
    const d = await startDaemon({
      env,
      projectRoot: tempDir("corvidinho-backup-proj-"),
      logger: createDaemonLogger({ write: (l) => lines.push(JSON.parse(l)) }),
      agent: idleAgent,
      useWorktrees: false,
      now: () => NIGHT,
    } as Parameters<typeof startDaemon>[0]);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(lines[0]).toMatchObject({ event: "daemon.started", backup: "off" });
    await d.tick();
    expect(lines.some((l) => String(l.event).startsWith("backup."))).toBe(false);
    await d.stop();
  });
});

describe("Discord bridge (OPS-1: I'm told if it fails)", () => {
  type Reply = { channelId: string; content: string; mentionUserIds?: string[] };

  async function bridge(opts: { backupDir: string; announce?: string }) {
    const { db } = liveDb();
    if (opts.announce) new AnnounceStore(db).setChannelId(opts.announce);
    const replies: Reply[] = [];
    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: "chan-1",
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: join(tempDir(), "none.toml"),
        CORVIDINHO_OWNER_DISCORD_ID: OWNER,
        CORVIDINHO_BACKUP_DIR: opts.backupDir,
      },
      db,
      projectRoot: tempDir("corvidinho-backup-proj-"),
      skipProtocolCheck: true,
      thinkingOutbound: memoryThinkingOutbound(),
      agent: idleAgent,
      schedulerPollIntervalMs: 20,
      schedulerNow: () => NIGHT,
      gatewayFactory: async (_cfg, handlers) => {
        handlers.reply = async (o) => {
          replies.push(o);
          return { messageId: `bot_${replies.length}` };
        };
        return createNullGateway();
      },
    } as Parameters<typeof startBridge>[0]);
    if (!result.ok) throw new Error("bridge did not start");
    return { db, result, replies };
  }

  test("a failed nightly backup pings the owner once in the announcements channel, fixed text only", async () => {
    const file = join(tempDir(), "not-a-dir");
    writeFileSync(file, "x");
    const { db, result, replies } = await bridge({ backupDir: file, announce: "announce-1" });
    expect(await until(() => replies.length > 0)).toBe(true);
    await Bun.sleep(150); // several more ticks: still one post
    await result.stop();
    expect(replies).toHaveLength(1);
    expect(replies[0]!.channelId).toBe("announce-1");
    expect(replies[0]!.mentionUserIds).toEqual([OWNER]);
    expect(replies[0]!.content.startsWith(`<@${OWNER}> ⚠️ The nightly backup failed`)).toBe(true);
    expect(replies[0]!.content).not.toContain(file);
    expect(meta(db, "ops_backup_notice")).toBeNull();
    expect(meta(db, "ops_backup_failing_since")).toBe(String(NIGHT));
  });

  test("with no announcements channel the notice is not posted anywhere and stays pending", async () => {
    const file = join(tempDir(), "not-a-dir");
    writeFileSync(file, "x");
    const { db, result, replies } = await bridge({ backupDir: file });
    expect(await until(() => meta(db, "ops_backup_failing_since") !== null)).toBe(true);
    await Bun.sleep(150);
    await result.stop();
    expect(replies).toEqual([]);
    expect(meta(db, "ops_backup_notice")).toBe(String(NIGHT));
  });

  test("a good backup dir gets tonight's snapshot and nobody is pinged", async () => {
    const backupDir = join(tempDir(), "backups");
    const { result, replies } = await bridge({ backupDir, announce: "announce-1" });
    expect(await until(() => snapshots(backupDir).length === 1)).toBe(true);
    await Bun.sleep(100);
    await result.stop();
    expect(snapshots(backupDir)).toHaveLength(1);
    expect(replies).toEqual([]);
  });
});

describe("corvidinho backup list|restore and doctor (OPS-1/2)", () => {
  async function cli(
    args: string[],
    env: Record<string, string>,
  ): Promise<{ code: number; out: string; err: string }> {
    const proc = Bun.spawn([process.execPath, "--no-env-file", join(REPO_ROOT, "src", "cli.ts"), ...args], {
      cwd: REPO_ROOT,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: tempDir("corvidinho-backup-home-"),
        TMPDIR: tmpdir(),
        ...env,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, out, err] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    return { code, out, err };
  }

  function fixture() {
    const dataDir = tempDir("corvidinho-backup-data-");
    const { db, path } = liveDb(dataDir);
    const backupDir = tempDir();
    const name = "corvidinho-20260929T033000Z.db";
    db.run("VACUUM INTO ?", [join(backupDir, name)]);
    const env = {
      CORVIDINHO_DATA_DIR: dataDir,
      CORVIDINHO_ALLOWLIST_FILE: join(dataDir, "no-allowlist.toml"),
      CORVIDINHO_BACKUP_DIR: backupDir,
    };
    return { db, path, backupDir, name, env };
  }

  test("--help lists backup list and backup restore", async () => {
    const r = await cli(["--help"], {});
    expect(r.code).toBe(0);
    expect(r.out).toContain("corvidinho backup list");
    expect(r.out).toContain("corvidinho backup restore <snapshot> <target> [--force]");
    expect(r.out).toContain("CORVIDINHO_BACKUP_DIR");
  }, 30_000);

  test("list prints the snapshots; restore copies a named one to a new target", async () => {
    const { name, env } = fixture();
    const list = await cli(["backup", "list"], env);
    expect(list.code).toBe(0);
    expect(list.out).toContain(name);
    const target = join(tempDir(), "restored.db");
    const r = await cli(["backup", "restore", name, target], env);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(r.out).toContain(`Restored ${name} to ${target}`);
    const restored = new Database(target, { readonly: true });
    open.push(restored);
    expect(restored.query("SELECT content FROM memories WHERE id = 'm1'").get()).toEqual({
      content: "remember this",
    });
  }, 30_000);

  test("restore refuses the live DB while a process holds it, even with --force", async () => {
    const { db, path, name, env } = fixture();
    db.run(
      `INSERT INTO memories (id, owner_user_id, category, key, content, created_at, updated_at)
       VALUES ('m2', 'u1', 'note', 'k2', 'newer', 1, 1)`,
    );
    const r = await cli(["backup", "restore", name, path, "--force"], env);
    expect(r.code).toBe(1);
    expect(r.err).toContain("restore refused");
    expect(r.err).toContain(`is open in process ${process.pid}`);
    expect(db.query("SELECT COUNT(*) AS n FROM memories").get()).toEqual({ n: 2 });
  }, 30_000);

  test("without CORVIDINHO_BACKUP_DIR, backup says so and doctor warns that there is no nightly backup", async () => {
    const { env } = fixture();
    const noDir = { ...env, CORVIDINHO_BACKUP_DIR: "" };
    const list = await cli(["backup", "list"], noDir);
    expect(list.code).toBe(1);
    expect(list.err).toContain("CORVIDINHO_BACKUP_DIR is not set");
    const doctor = await cli(["doctor"], noDir);
    expect(doctor.out).toContain("[warn] backup: off — CORVIDINHO_BACKUP_DIR is not set");
    const on = await cli(["doctor"], env);
    expect(on.out).toContain(`[ok] backup: ${env.CORVIDINHO_BACKUP_DIR} — 1 snapshot(s)`);
  }, 60_000);
});
