/**
 * AGENT-1.a / AGENT-1.c (#84, captured from Leif's 2026-09-28 interview):
 * "In a project that isn't a git repo, my own runs work in the project folder
 * itself (protected files and the verify gate still apply); other people's
 * runs only read there." and "My schedules for a project that isn't a git
 * repo work in their own separate folder, never in the live project folder."
 *
 * - `ensureTalkWorkspace({ nonGit: "project_dir" })` hands back the non-git
 *   project folder itself: no `.corvid-worktrees` base, no scoped dir. The
 *   default (schedules, AGENT-1.c) is still the scoped dir.
 * - Park and remove never delete a dir that is the project folder or holds
 *   it (by realpath), whatever kind a caller passes.
 * - `SessionStore.bindWorktree` binds a non-git talk in place; ending it, a
 *   TTL purge and a restart leave the folder and its files; a legacy row
 *   bound to a scoped dir is parked, then re-bound; a mid-conversation switch
 *   is still refused; a folder that became a git repo gets a worktree.
 * - The bridge writes the owner's images to the session's own
 *   `<project>/.corvidinho/attachments/<session>/` (removed when the talk
 *   ends) and keeps anyone else's URL-only.
 *
 * Temp folders, in-memory or temp SQLite, a recording agent, a null gateway
 * and a mocked CDN fetch; no token, no network.
 */
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import type { AgentRunChatOpts } from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { sessionAttachmentDir } from "../src/discord/image-attachments.ts";
import { SessionStore, sessionWorkspaceKind } from "../src/discord/session-store.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import {
  ensureTalkWorkspace,
  parkWorktree,
  removeWorktree,
} from "../src/worktree/index.ts";
import { makeProject } from "./fixtures/talk-worktree.ts";

const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}

/** A plain (non-git) project folder with one file. */
function plainProject(root: string, name = "plain"): string {
  const project = join(root, name);
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "notes.txt"), "live project file\n");
  return project;
}

const prevBase = process.env.WORKTREE_BASE_DIR;
beforeEach(() => {
  delete process.env.WORKTREE_BASE_DIR;
});
afterEach(() => {
  if (prevBase === undefined) delete process.env.WORKTREE_BASE_DIR;
  else process.env.WORKTREE_BASE_DIR = prevBase;
});

describe("AGENT-1.a: a non-git talk works in the project folder itself", () => {
  test("nonGit project_dir returns the folder itself and creates no worktree base or scoped dir; a git project still gets a worktree", async () => {
    const root = tempDir("corvidinho-nongit-ensure-");
    const project = plainProject(root);
    const made = await ensureTalkWorkspace({
      projectWorkingDir: project,
      sessionId: "sess_nongit_a",
      nonGit: "project_dir",
    });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(made.workspace).toMatchObject({ kind: "project_dir", workDir: project, projectWorkingDir: project, state: "active" });
    expect(made.workspace.branchName).toBeUndefined();
    expect(existsSync(join(root, ".corvid-worktrees"))).toBe(false);

    const git = makeProject(tempDir("corvidinho-nongit-git-"));
    const wt = await ensureTalkWorkspace({ projectWorkingDir: git, sessionId: "sess_nongit_b", nonGit: "project_dir" });
    expect(wt.ok).toBe(true);
    if (!wt.ok) return;
    expect(wt.workspace.kind).toBe("worktree");
    expect(realpathSync(wt.workspace.workDir)).not.toBe(realpathSync(git));
  });

  test("AGENT-1.c: without nonGit (schedules) a non-git project still gets its own scoped folder, never the project folder", async () => {
    const root = tempDir("corvidinho-nongit-scoped-");
    const project = plainProject(root);
    const made = await ensureTalkWorkspace({ projectWorkingDir: project, sessionId: "schedule_x_run_y", nonGit: "scoped_dir" });
    const dflt = await ensureTalkWorkspace({ projectWorkingDir: project, sessionId: "schedule_x_run_z" });
    for (const m of [made, dflt]) {
      expect(m.ok).toBe(true);
      if (!m.ok) return;
      expect(m.workspace.kind).toBe("scoped_dir");
      expect(m.workspace.workDir).not.toBe(project);
      expect(m.workspace.workDir.startsWith(join(root, ".corvid-worktrees") + sep)).toBe(true);
    }
  });

  test("park and remove never delete the project folder or a dir holding it, whatever kind is passed", async () => {
    const root = tempDir("corvidinho-nongit-park-");
    const project = plainProject(root);
    for (const kind of ["project_dir", "scoped_dir", "worktree", undefined] as const) {
      expect(await parkWorktree(project, project, kind ? { kind } : undefined)).toBe("removed");
      expect(await parkWorktree(project, root, kind ? { kind } : undefined)).toBe("removed");
      expect(readFileSync(join(project, "notes.txt"), "utf8")).toBe("live project file\n");
    }
    // A git project's main checkout (git refuses to remove it, and the
    // manual fallback must not delete it either).
    const git = makeProject(tempDir("corvidinho-nongit-main-"));
    await removeWorktree(git, git, { cleanBranch: true });
    await parkWorktree(git, git, { kind: "worktree" });
    expect(existsSync(join(git, "app.ts"))).toBe(true);
    expect(existsSync(join(git, ".git"))).toBe(true);
    // A real scoped dir is still removed.
    const scoped = await ensureTalkWorkspace({ projectWorkingDir: project, sessionId: "sess_scoped_park" });
    if (!scoped.ok) throw new Error(scoped.error);
    expect(await parkWorktree(project, scoped.workspace.workDir, { kind: "scoped_dir" })).toBe("removed");
    expect(existsSync(scoped.workspace.workDir)).toBe(false);
  });
});

describe("AGENT-1.a: SessionStore binds a non-git talk in place", () => {
  test("bind, cwd, end and TTL purge: the folder and its files stay; the session's attachments go; no worktree base", async () => {
    const root = tempDir("corvidinho-nongit-store-");
    const project = plainProject(root);
    let now = 1_000_000;
    const store = new SessionStore({
      db: openCorvidinhoDb({ memory: true }),
      defaultProjectRoot: project,
      ttlMs: 60_000,
      now: () => now,
    });
    const made = await store.createWithWorktree({ channelId: "c1", userId: "u1" });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(made.workspace.kind).toBe("project_dir");
    expect(made.workspace.workDir).toBe(project);
    expect(store.cwdFor(made.session)).toBe(project);
    expect(sessionWorkspaceKind(made.session)).toBe("project_dir");
    expect(existsSync(join(root, ".corvid-worktrees"))).toBe(false);
    // A second turn re-binds to the same folder.
    const again = await store.bindWorktree(made.session);
    expect(again.ok && again.workspace.kind).toBe("project_dir");
    expect(again.ok && again.workspace.workDir).toBe(project);

    // The owner's image for this session, and another session's.
    const mine = sessionAttachmentDir(project, made.session.id);
    mkdirSync(mine, { recursive: true });
    writeFileSync(join(mine, "m1-0.png"), "png");
    const other = await store.createWithWorktree({ channelId: "c1", userId: "u2" });
    if (!other.ok) throw new Error(other.error);
    const theirs = sessionAttachmentDir(project, other.session.id);
    mkdirSync(theirs, { recursive: true });
    writeFileSync(join(theirs, "m2-0.png"), "png");

    await store.endSession(made.session);
    expect(readFileSync(join(project, "notes.txt"), "utf8")).toBe("live project file\n");
    expect(existsSync(mine)).toBe(false);
    expect(existsSync(join(theirs, "m2-0.png"))).toBe(true);

    // TTL purge (the other session idles out): its images go, the folder stays.
    now += 10 * 60_000;
    expect(store.get(other.session.id)).toBeUndefined();
    await Bun.sleep(20);
    expect(existsSync(theirs)).toBe(false);
    expect(existsSync(join(project, ".corvidinho"))).toBe(false);
    expect(readFileSync(join(project, "notes.txt"), "utf8")).toBe("live project file\n");
  });

  test("a restart keeps the in-place binding; an expired row found at start leaves the folder", async () => {
    const root = tempDir("corvidinho-nongit-restart-");
    const project = plainProject(root);
    const dbPath = join(root, "data", "corvidinho.db");
    let now = 5_000_000;
    const store1 = new SessionStore({ db: openCorvidinhoDb({ path: dbPath }), defaultProjectRoot: project, ttlMs: 60_000, now: () => now });
    const made = await store1.createWithWorktree({ channelId: "c1", userId: "u1" });
    if (!made.ok) throw new Error(made.error);
    const store2 = new SessionStore({ db: openCorvidinhoDb({ path: dbPath }), defaultProjectRoot: project, ttlMs: 60_000, now: () => now });
    const back = store2.get(made.session.id)!;
    expect(back.worktreePath).toBe(project);
    expect(sessionWorkspaceKind(back)).toBe("project_dir");
    const bound = await store2.bindWorktree(back);
    expect(bound.ok && bound.workspace).toMatchObject({ kind: "project_dir", workDir: project });

    now += 10 * 60_000;
    new SessionStore({ db: openCorvidinhoDb({ path: dbPath }), defaultProjectRoot: project, ttlMs: 60_000, now: () => now });
    await Bun.sleep(20);
    expect(readFileSync(join(project, "notes.txt"), "utf8")).toBe("live project file\n");
  });

  test("a legacy row bound to a scoped dir of a non-git project is parked, then re-bound in place", async () => {
    const root = tempDir("corvidinho-nongit-legacy-");
    const project = plainProject(root);
    const store = new SessionStore({ db: openCorvidinhoDb({ memory: true }), defaultProjectRoot: project });
    const session = store.create({ channelId: "c1", userId: "u1" });
    const legacy = await ensureTalkWorkspace({ projectWorkingDir: project, sessionId: session.id });
    if (!legacy.ok) throw new Error(legacy.error);
    expect(legacy.workspace.kind).toBe("scoped_dir");
    session.project = project;
    session.worktreePath = legacy.workspace.workDir;
    session.worktreeState = "active";
    expect(sessionWorkspaceKind(session)).toBe("scoped_dir");
    const bound = await store.bindWorktree(session);
    expect(bound.ok && bound.workspace).toMatchObject({ kind: "project_dir", workDir: project });
    expect(existsSync(legacy.workspace.workDir)).toBe(false);
    expect(session.worktreePath).toBe(project);
    expect(session.worktreeState).toBe("active");
    expect(readFileSync(join(project, "notes.txt"), "utf8")).toBe("live project file\n");
  });

  test("a mid-conversation project switch is still refused; a folder that became a git repo gets a worktree, never the checkout", async () => {
    const root = tempDir("corvidinho-nongit-switch-");
    const a = plainProject(root, "a");
    plainProject(root, "b");
    const store = new SessionStore({ db: openCorvidinhoDb({ memory: true }), defaultProjectRoot: root });
    const made = await store.createWithWorktree({ channelId: "c1", userId: "u1", project: "a" });
    if (!made.ok) throw new Error(made.error);
    expect(made.workspace).toMatchObject({ kind: "project_dir", workDir: a });
    const sw = await store.bindWorktree(made.session, { project: join(root, "b") });
    expect(sw.ok).toBe(false);
    expect(made.session.worktreePath).toBe(a);
    expect(store.cwdFor(made.session)).toBe(a);

    // `a` becomes a git repo: the in-place binding is let go of (nothing
    // deleted) and the talk gets its own linked worktree.
    for (const args of [["init", "-q", "-b", "main"], ["add", "."], ["-c", "user.email=t@e.st", "-c", "user.name=T", "commit", "-qm", "init"]]) {
      expect(Bun.spawnSync(["git", ...args], { cwd: a, stdout: "pipe", stderr: "pipe" }).exitCode).toBe(0);
    }
    const rebound = await store.bindWorktree(made.session);
    expect(rebound.ok).toBe(true);
    if (!rebound.ok) return;
    expect(rebound.workspace.kind).toBe("worktree");
    expect(realpathSync(rebound.workspace.workDir)).not.toBe(realpathSync(a));
    expect(existsSync(join(a, "notes.txt"))).toBe(true);
    await store.endSession(made.session);
    expect(existsSync(join(a, "notes.txt"))).toBe(true);
  });
});

/** A real 1x1 PNG. */
const REAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const OWNER = "181969874455756800";
const OTHER = "500000000000000005";

describe("AGENT-1.a: images in a non-git project (REQ-discord-013)", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = mock(
      async () => new Response(REAL_PNG, { status: 200, headers: { "content-type": "image/png" } }),
    ) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("the owner's image goes to this session's own folder in the project and the talk's end removes it; anyone else's stays URL-only", async () => {
    const root = tempDir("corvidinho-nongit-img-");
    const project = plainProject(root);
    const calls: AgentRunChatOpts[] = [];
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    const bridge = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: "chan-1",
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: join(root, "no-allowlist.toml"),
        CORVIDINHO_OWNER_DISCORD_ID: OWNER,
      },
      projectRoot: project,
      skipProtocolCheck: true,
      disableScheduler: true,
      thinkingOutbound: memoryThinkingOutbound(),
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent: {
        async runChat(opts) {
          calls.push(opts);
          return { ok: true, sessionId: opts.sessionId, summary: "ok", exitCode: 0 };
        },
      },
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        return createNullGateway();
      },
    });
    try {
      if (bridge.ok !== true || !box.handlers) throw new Error("bridge did not start");
      const attachment = {
        id: "a1",
        filename: "shot.png",
        content_type: "image/png",
        size: REAL_PNG.length,
        url: "https://cdn.discordapp.com/attachments/ch/msg/shot.png",
        proxy_url: "https://media.discordapp.net/attachments/ch/msg/shot.png",
      };
      await box.handlers.onMessage({
        id: "m-owner",
        channelId: "chan-1",
        authorId: OWNER,
        authorBot: false,
        content: "@bot what is this?",
        mentionedBot: true,
        attachments: [attachment],
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]!.cwd).toBe(project);
      const ownerSession = bridge.store.list().find((s) => s.userId === OWNER)!;
      const m = calls[0]!.prompt.match(/\[image: shot\.png \(image\/png[^)]*\) (\S+)\]/);
      expect(m).not.toBeNull();
      const imagePath = m![1]!;
      expect(imagePath.startsWith(sessionAttachmentDir(project, ownerSession.id) + sep)).toBe(true);
      loadBuiltins();
      const read = await runPlugin({ name: "files-read", args: [imagePath], cwd: project, nonInteractive: true });
      expect(read.ok).toBe(true);
      expect(read.image?.mediaType).toBe("image/png");

      await box.handlers.onMessage({
        id: "m-other",
        channelId: "chan-1",
        authorId: OTHER,
        authorBot: false,
        content: "@bot and this?",
        mentionedBot: true,
        attachments: [attachment],
      });
      expect(calls).toHaveLength(2);
      expect(calls[1]!.cwd).toBe(project);
      const otherSession = bridge.store.list().find((s) => s.userId === OTHER)!;
      expect(calls[1]!.prompt).toContain("[attachment: https://media.discordapp.net/attachments/ch/msg/shot.png]");
      expect(calls[1]!.prompt).not.toContain("[image:");
      expect(existsSync(sessionAttachmentDir(project, otherSession.id))).toBe(false);

      await bridge.store.endSession(ownerSession);
      expect(existsSync(imagePath)).toBe(false);
      expect(existsSync(dirname(imagePath))).toBe(false);
      expect(existsSync(join(project, ".corvidinho"))).toBe(false);
      expect(readFileSync(join(project, "notes.txt"), "utf8")).toBe("live project file\n");
    } finally {
      if (bridge.ok) await bridge.stop();
    }
  });
});
