/**
 * SESSION-WORKTREE session binding + explicit project (REQ-discord-022).
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../src/discord/session-store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { buildSlashCommandBodies } from "../src/discord/slash-commands.ts";
import {
  ensureTalkWorkspace,
  parkWorktree,
  resolveProjectDir,
} from "../src/worktree/index.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { startBridge } from "../src/discord/bridge.ts";
import { handleSessionStart } from "../src/discord/command-handlers/session.ts";
import { handleWorkCommand } from "../src/discord/command-handlers/work.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import type { SlashContext, SlashReplyPayload } from "../src/discord/slash-types.ts";
import { WorkStore } from "../src/discord/work-store.ts";

function initGitRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  const run = (args: string[]) => {
    const p = Bun.spawnSync(["git", ...args], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (p.exitCode !== 0) {
      throw new Error(
        `git ${args.join(" ")} failed: ${new TextDecoder().decode(p.stderr)}`,
      );
    }
  };
  run(["init"]);
  run(["config", "user.email", "test@example.com"]);
  run(["config", "user.name", "Test"]);
  writeFileSync(join(dir, "README.md"), "# test\n");
  run(["add", "."]);
  run(["commit", "-m", "init"]);
  const branch = Bun.spawnSync(["git", "branch", "--show-current"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const name = new TextDecoder().decode(branch.stdout).trim();
  if (name && name !== "main") {
    run(["branch", "-M", "main"]);
  }
}

describe("session worktree binding (SESSION-WORKTREE-1..4)", () => {
  test("createWithWorktree binds isolated cwd; continue refuses project switch", async () => {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-sess-wt-"));
    try {
      const projectA = join(root, "proj-a");
      const projectB = join(root, "proj-b");
      initGitRepo(projectA);
      initGitRepo(projectB);
      process.env.WORKTREE_BASE_DIR = join(root, "wts");

      const db = openCorvidinhoDb({ memory: true });
      const store = new SessionStore({
        db,
        ttlMs: 45 * 60 * 1000,
        defaultProjectRoot: projectA,
      });

      const created = await store.createWithWorktree({
        channelId: "chan",
        userId: "u1",
        topic: "do stuff",
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.session.project).toBe(projectA);
      expect(created.session.worktreePath).toBeTruthy();
      expect(created.session.worktreeState).toBe("active");
      expect(store.cwdFor(created.session)).toBe(created.session.worktreePath);
      expect(existsSync(created.session.worktreePath!)).toBe(true);

      // Explicit different project mid-talk refused
      const switched = await store.bindWorktree(created.session, {
        project: projectB,
      });
      expect(switched.ok).toBe(false);

      // Same project re-bind ok
      const same = await store.bindWorktree(created.session, {
        project: projectA,
      });
      expect(same.ok).toBe(true);

      const pathBefore = created.session.worktreePath!;
      await store.endSession(created.session);
      expect(store.get(created.session.id)).toBeUndefined();
      expect(existsSync(pathBefore)).toBe(false);
    } finally {
      delete process.env.WORKTREE_BASE_DIR;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("explicit project on create freezes that project", async () => {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-sess-proj-"));
    try {
      const def = join(root, "default");
      const other = join(root, "other");
      initGitRepo(def);
      initGitRepo(other);
      // A sibling project must be an allowlisted checkout (REQ-discord-202).
      Bun.spawnSync(
        ["git", "remote", "add", "origin", "https://github.com/acme/other.git"],
        { cwd: other },
      );
      const allowlist = emptyConfig();
      allowlist.github.repos = ["acme/other"];
      process.env.WORKTREE_BASE_DIR = join(root, "wts");

      const store = new SessionStore({
        db: openCorvidinhoDb({ memory: true }),
        defaultProjectRoot: def,
        allowlist,
      });
      const created = await store.createWithWorktree({
        channelId: "c",
        userId: "u",
        project: other,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.session.project).toBe(other);
      expect(created.workspace.workDir).toContain(
        join(root, "wts").split("/").pop()!,
      );
      await store.endSession(created.session);
    } finally {
      delete process.env.WORKTREE_BASE_DIR;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("TTL purge parks worktree", async () => {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-sess-ttl-"));
    try {
      const project = join(root, "proj");
      initGitRepo(project);
      process.env.WORKTREE_BASE_DIR = join(root, "wts");

      let now = 1_000_000;
      const ttlMs = 45 * 60 * 1000;
      const store = new SessionStore({
        db: openCorvidinhoDb({ memory: true }),
        ttlMs,
        now: () => now,
        defaultProjectRoot: project,
      });
      const created = await store.createWithWorktree({
        channelId: "c",
        userId: "u",
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const wt = created.session.worktreePath!;
      expect(existsSync(wt)).toBe(true);

      now += ttlMs + 1000;
      expect(store.get(created.session.id)).toBeUndefined();
      // Allow async park to finish
      await Bun.sleep(50);
      expect(existsSync(wt)).toBe(false);
    } finally {
      delete process.env.WORKTREE_BASE_DIR;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("slash bodies expose optional project on session start and work", () => {
    const bodies = buildSlashCommandBodies();
    const session = bodies.find((b) => b.name === "session");
    const start = session?.options?.find((o) => o.name === "start");
    const startOpts = start?.options?.map((o) => o.name) ?? [];
    expect(startOpts).toContain("topic");
    expect(startOpts).toContain("project");

    const work = bodies.find((b) => b.name === "work");
    const workOpts = work?.options?.map((o) => o.name) ?? [];
    expect(workOpts).toContain("description");
    expect(workOpts).toContain("project");
    // Nine top-level commands (incl. /admin, ADMIN-1..3)
    expect(bodies.map((b) => b.name).sort()).toEqual(
      ["admin", "agents", "announce", "mute", "schedule", "session", "status", "unmute", "work"].sort(),
    );
  });
});

describe("schedule tick uses project worktree (SESSION-WORKTREE + DISCORD-SCHEDULE)", () => {
  test("tick spawns with cwd under schedule project worktree then parks", async () => {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-sched-wt-"));
    try {
      const project = join(root, "sched-proj");
      initGitRepo(project);
      process.env.WORKTREE_BASE_DIR = join(root, "wts");

      const store = new ScheduleStore();
      const cwds: string[] = [];
      const agent = {
        runChat: async (opts: { cwd?: string }) => {
          if (opts.cwd) cwds.push(opts.cwd);
          return { ok: true as const, sessionId: "s", summary: "ok", exitCode: 0 };
        },
      };

      const past = Date.now() - 60_000;
      const s = store.create({
        name: "WT schedule",
        cronExpression: "0 * * * *",
        project,
        prompt: "do",
        createdByUserId: "admin",
        channelId: "chan-allowed",
        now: past - 3_600_000,
      });
      s.nextRunAt = past;

      const cfg = emptyConfig();
      cfg.discord.channels = ["chan-allowed"];
      const svc = new SchedulerService({
        store,
        agent: agent as never,
        allowlist: cfg,
        manual: true,
        defaultProjectRoot: root,
        useWorktrees: true,
      });

      const tick = await svc.tick();
      expect(tick.started).toContain(s.id);
      await Bun.sleep(100);
      expect(cwds.length).toBe(1);
      expect(cwds[0]).toContain(join(root, "wts"));
      // After run, worktree parked (dir gone)
      expect(existsSync(cwds[0]!)).toBe(false);
      svc.stop();
    } finally {
      delete process.env.WORKTREE_BASE_DIR;
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("soft-TTL purge never parks a busy session (REQ-discord-204)", () => {
  const TTL = 45 * 60 * 1000;

  type Seen = {
    cwd?: string;
    midRunListed?: number;
    midRunDirKept?: boolean;
    midRunFileKept?: boolean;
  };

  /**
   * Agent that writes a half-done edit into its cwd, then, still running,
   * lets 46 minutes pass while someone runs /status or /session list
   * (store.list()) and an id lookup.
   */
  function slowAgent(store: SessionStore, clock: { now: number }, seen: Seen): AgentClient {
    return {
      runChat: async ({ sessionId, cwd }) => {
        seen.cwd = cwd;
        writeFileSync(join(cwd!, "half-done.ts"), "export const x = 1;\n");
        clock.now += TTL + 60_000;
        seen.midRunListed = store.list().length;
        store.get(sessionId);
        await Bun.sleep(100); // let any fire-and-forget park finish
        seen.midRunDirKept = existsSync(cwd!);
        seen.midRunFileKept = existsSync(join(cwd!, "half-done.ts"));
        return { ok: true, sessionId, summary: "did it", exitCode: 0 };
      },
    };
  }

  function slashCtx(store: SessionStore, agent: AgentClient): SlashContext {
    const allow = emptyConfig();
    allow.discord.channels = ["chan-allowed"];
    return {
      store,
      workStore: new WorkStore(),
      allowlist: allow,
      agent,
      version: "0.0.0",
      protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
      startedAt: Date.now(),
      channelIds: ["chan-allowed"],
      // Acting user is not the owner, so /work never runs the PR step here.
      owner: { discordId: "owner-x" },
    };
  }

  function slashIx(commandName: string, options: Record<string, string>, subcommand?: string) {
    const edits: SlashReplyPayload[] = [];
    return {
      edits,
      ix: {
        id: "ix",
        commandName,
        subcommand,
        channelId: "chan-allowed",
        userId: "user-1",
        options,
        reply: async (p: SlashReplyPayload) => {
          edits.push(p);
        },
        deferReply: async () => {},
        editReply: async (p: SlashReplyPayload) => {
          edits.push(p);
        },
      },
    };
  }

  /** Temp git repo + temp worktree base (talk/* branches live only there). */
  async function withRepo(
    prefix: string,
    fn: (project: string, clock: { now: number }, store: SessionStore) => Promise<void>,
  ): Promise<void> {
    const root = mkdtempSync(join(tmpdir(), prefix));
    try {
      const project = join(root, "proj");
      initGitRepo(project);
      process.env.WORKTREE_BASE_DIR = join(root, "wts");
      const clock = { now: 1_000_000 };
      const store = new SessionStore({
        db: openCorvidinhoDb({ memory: true }),
        ttlMs: TTL,
        now: () => clock.now,
        defaultProjectRoot: project,
      });
      await fn(project, clock, store);
    } finally {
      delete process.env.WORKTREE_BASE_DIR;
      rmSync(root, { recursive: true, force: true });
    }
  }

  test("/work: a lookup past the TTL mid-run keeps the worktree and the agent's edits", async () => {
    await withRepo("corvidinho-busy-work-", async (_project, clock, store) => {
      const seen: Seen = {};
      const { ix, edits } = slashIx("work", { description: "Long task" });
      await handleWorkCommand(slashCtx(store, slowAgent(store, clock, seen)), ix);

      expect(seen.cwd).toBeTruthy();
      expect(seen.midRunListed).toBe(1);
      expect(seen.midRunDirKept).toBe(true);
      expect(seen.midRunFileKept).toBe(true);
      const body = edits.at(-1)?.content ?? "";
      expect(body).toContain("(completed)");
      expect(body).toContain(`Worktree: \`${seen.cwd}\``);
      // The end of the run counts as activity, so the talk is still live.
      const [session] = store.list();
      expect(session?.worktreePath).toBe(seen.cwd);
      expect(session?.lastActivityAt).toBe(clock.now);
      await store.endSession(session!);
    });
  });

  test("/session start: a lookup past the TTL mid-run keeps the worktree", async () => {
    await withRepo("corvidinho-busy-sess-", async (_project, clock, store) => {
      const seen: Seen = {};
      const { ix, edits } = slashIx("session", { topic: "Long talk" }, "start");
      await handleSessionStart(slashCtx(store, slowAgent(store, clock, seen)), ix);

      expect(seen.midRunDirKept).toBe(true);
      expect(seen.midRunFileKept).toBe(true);
      expect(edits.at(-1)?.content ?? "").toContain(`Worktree: \`${seen.cwd}\``);
      const [session] = store.list();
      expect(session?.worktreePath).toBe(seen.cwd);
      await store.endSession(session!);
    });
  });

  test("bridge mention: a lookup past the TTL mid-run keeps the worktree", async () => {
    await withRepo("corvidinho-busy-bridge-", async (project, clock, store) => {
      const seen: Seen = {};
      const box: { handlers: GatewayHandlers | null } = { handlers: null };
      const started = await startBridge({
        env: {
          DISCORD_BOT_TOKEN: "fake",
          DISCORD_CHANNEL_IDS: "chan-1",
          CORVIDINHO_DISCORD_DRY_RUN: "1",
          // Missing file: never read the operator's allowlist (ALLOW-4).
          CORVIDINHO_ALLOWLIST_FILE: join(project, "no-allowlist.toml"),
        },
        projectRoot: project,
        skipProtocolCheck: true,
        sessionStore: store,
        workStore: new WorkStore(),
        agent: slowAgent(store, clock, seen),
        gatewayFactory: async (_cfg, handlers) => {
          box.handlers = handlers;
          handlers.reply = async () => ({ messageId: "bot_1" });
          return createNullGateway();
        },
      });
      expect(started.ok).toBe(true);
      if (started.ok !== true) return;
      await box.handlers!.onMessage({
        id: "m1",
        channelId: "chan-1",
        authorId: "u1",
        authorBot: false,
        content: "@bot long job",
        mentionedBot: true,
      });
      expect(seen.midRunDirKept).toBe(true);
      expect(seen.midRunFileKept).toBe(true);
      // A reply to the bot still continues the same live session.
      const session = store.getByBotMessage("bot_1");
      expect(session?.worktreePath).toBe(seen.cwd);
      await store.endSession(session!);
      await started.stop();
    });
  });

  test("once the run ends, an idle session past the TTL is still purged and parked", async () => {
    await withRepo("corvidinho-busy-idle-", async (_project, clock, store) => {
      const created = await store.createWithWorktree({ channelId: "c", userId: "u" });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const wt = created.session.worktreePath!;
      await store.runActive(created.session, async () => {
        clock.now += TTL + 60_000;
        expect(store.get(created.session.id)).toBe(created.session);
      });
      expect(store.get(created.session.id)).toBe(created.session);
      clock.now += TTL + 1000;
      expect(store.list()).toEqual([]);
      await Bun.sleep(50);
      expect(existsSync(wt)).toBe(false);
    });
  });
});

describe("a crash between park and row delete never leaves a dead cwd (SESSION-WORKTREE-3 / REQ-discord-357)", () => {
  const TTL = 45 * 60 * 1000;
  type Db = ReturnType<typeof openCorvidinhoDb>;

  /**
   * Temp git repo + DB file + temp worktree base (talk/* branches live only
   * there). `reopen()` is a bridge restart: a fresh store on the same file.
   */
  async function withDurable(
    prefix: string,
    fn: (project: string, reopen: () => { db: Db; store: SessionStore }) => Promise<void>,
  ): Promise<void> {
    const root = mkdtempSync(join(tmpdir(), prefix));
    const opened: Db[] = [];
    try {
      const project = join(root, "proj");
      initGitRepo(project);
      process.env.WORKTREE_BASE_DIR = join(root, "wts");
      const dbPath = join(root, "corvidinho.db");
      await fn(project, () => {
        const db = openCorvidinhoDb({ path: dbPath });
        opened.push(db);
        return { db, store: new SessionStore({ db, ttlMs: TTL, defaultProjectRoot: project }) };
      });
    } finally {
      for (const db of opened) db.close();
      delete process.env.WORKTREE_BASE_DIR;
      rmSync(root, { recursive: true, force: true });
    }
  }

  function rowOf(db: Db, id: string) {
    return db
      .query(`SELECT worktree_state, worktree_path FROM discord_sessions WHERE id = ?`)
      .get(id) as { worktree_state: string | null; worktree_path: string | null } | null;
  }

  test("parking records the parked state before removal; after a crash the talk re-binds a fresh worktree", async () => {
    await withDurable("corvidinho-park-crash-", async (project, reopen) => {
      const first = reopen();
      const created = await first.store.createWithWorktree({ channelId: "c", userId: "u", threadId: "t1" });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const id = created.session.id;
      const wt = created.session.worktreePath!;

      // endSession's first step. The row stops saying `active` before any
      // removal side effect completes, so a crash from here on never
      // restarts into a removed directory.
      const parking = first.store.parkSessionWorktree(created.session);
      expect(rowOf(first.db, id)?.worktree_state).toBe("parked");
      await parking;
      expect(existsSync(wt)).toBe(false);
      expect(rowOf(first.db, id)?.worktree_state).not.toBe("active");
      // Crash here: endSession's row delete never ran.

      const { store } = reopen();
      const revived = store.getByThread("t1")!;
      expect(revived.id).toBe(id);
      expect(revived.worktreeState).not.toBe("active");
      const bound = await store.bindWorktree(revived);
      expect(bound.ok).toBe(true);
      const cwd = store.cwdFor(revived)!;
      expect(existsSync(cwd)).toBe(true);
      expect(cwd).not.toBe(project);
      expect(revived.worktreeState).toBe("active");
      await store.endSession(revived);
      expect(existsSync(cwd)).toBe(false);
    });
  });

  test("a park cut short before removal is finished when the talk ends after restart", async () => {
    await withDurable("corvidinho-park-retry-", async (_project, reopen) => {
      const first = reopen();
      const created = await first.store.createWithWorktree({ channelId: "c", userId: "u" });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const id = created.session.id;
      const wt = created.session.worktreePath!;
      // Crash right after the parked marker was written, before any removal.
      first.db.run(`UPDATE discord_sessions SET worktree_state = 'parked' WHERE id = ?`, [id]);
      expect(existsSync(wt)).toBe(true);

      const { db, store } = reopen();
      const revived = store.get(id)!;
      expect(revived.worktreeState).toBe("parked");
      expect(revived.worktreePath).toBe(wt);
      await store.endSession(revived);
      expect(existsSync(wt)).toBe(false);
      expect(rowOf(db, id)).toBeNull();
    });
  });

  test("bind re-creates a recorded active worktree whose directory is gone (same project, never the repo root)", async () => {
    await withDurable("corvidinho-dead-wt-", async (project, reopen) => {
      const first = reopen();
      const created = await first.store.createWithWorktree({ channelId: "c", userId: "u" });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const id = created.session.id;
      const wt = created.session.worktreePath!;
      // Pre-fix crash row: the directory is removed, the row still says active.
      await parkWorktree(project, wt, { kind: "worktree", branchName: created.session.worktreeBranch });
      expect(existsSync(wt)).toBe(false);
      expect(rowOf(first.db, id)?.worktree_state).toBe("active");

      const { db, store } = reopen();
      const revived = store.get(id)!;
      expect(revived.worktreeState).toBe("active");
      expect(revived.worktreePath).toBe(wt);

      // A different project is still refused on a stale binding (SESSION-WORKTREE-4).
      mkdirSync(join(project, "sub"));
      const switched = await store.bindWorktree(revived, { project: join(project, "sub") });
      expect(switched.ok).toBe(false);

      const bound = await store.bindWorktree(revived);
      expect(bound.ok).toBe(true);
      if (!bound.ok) return;
      const cwd = store.cwdFor(revived)!;
      expect(cwd).toBe(bound.workspace.workDir);
      expect(existsSync(cwd)).toBe(true);
      expect(cwd).not.toBe(project);
      expect(revived.project).toBe(project);
      expect(rowOf(db, id)).toEqual({ worktree_state: "active", worktree_path: cwd });
      await store.endSession(revived);
      expect(existsSync(cwd)).toBe(false);
    });
  });

  test("bridge: a thread continue after restart never spawns in a removed worktree", async () => {
    await withDurable("corvidinho-dead-bridge-", async (project, reopen) => {
      const first = reopen();
      const created = await first.store.createWithWorktree({
        channelId: "chan-1",
        userId: "u1",
        threadId: "thr-1",
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const wt = created.session.worktreePath!;
      await parkWorktree(project, wt, { kind: "worktree", branchName: created.session.worktreeBranch });
      expect(existsSync(wt)).toBe(false);

      const { db, store } = reopen();
      const runs: Array<{ cwd?: string; existed: boolean }> = [];
      const box: { handlers: GatewayHandlers | null } = { handlers: null };
      const started = await startBridge({
        env: {
          DISCORD_BOT_TOKEN: "fake",
          DISCORD_CHANNEL_IDS: "chan-1",
          CORVIDINHO_DISCORD_DRY_RUN: "1",
        },
        projectRoot: project,
        db,
        sessionStore: store,
        workStore: new WorkStore({ db }),
        skipProtocolCheck: true,
        disableScheduler: true,
        agent: {
          runChat: async ({ sessionId, cwd }) => {
            runs.push({ cwd, existed: cwd ? existsSync(cwd) : false });
            return { ok: true, sessionId, summary: "ok", exitCode: 0 };
          },
        },
        gatewayFactory: async (_cfg, handlers) => {
          box.handlers = handlers;
          handlers.reply = async () => ({ messageId: "bot_2" });
          return createNullGateway();
        },
      });
      expect(started.ok).toBe(true);
      if (started.ok !== true) return;
      await box.handlers!.onMessage({
        id: "m2",
        channelId: "chan-1",
        threadId: "thr-1",
        authorId: "u1",
        authorBot: false,
        content: "keep going",
        mentionedBot: false,
      });
      expect(runs.length).toBe(1);
      expect(runs[0]!.existed).toBe(true);
      expect(runs[0]!.cwd).not.toBe(project);
      const session = store.getByThread("thr-1");
      expect(session?.worktreePath).toBe(runs[0]!.cwd);
      await store.endSession(session!);
      await started.stop();
    });
  });
});
