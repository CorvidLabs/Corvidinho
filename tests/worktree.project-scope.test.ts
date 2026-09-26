/**
 * Discord `project` scope (REQ-discord-202 / ALLOW-2, ALLOW-6, SAFE-3,
 * DISCORD-SCHEDULE-3): the `project` option of /work, /session start and
 * /schedule may only pick the bridge project root (or a directory inside it)
 * or a sibling checkout whose `origin` is on the GitHub repo allowlist. An
 * absolute path, `../` traversal or symlink to any other repo on the host is
 * refused before any worktree, branch or agent run.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AllowlistConfig } from "../src/allowlist/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import type { AgentRunChatOpts } from "../src/discord/agent-client.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import { handleSlashInteraction } from "../src/discord/slash-dispatch.ts";
import type {
  SlashContext,
  SlashInteraction,
  SlashReplyPayload,
} from "../src/discord/slash-types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { resolveProjectDir } from "../src/worktree/index.ts";

function git(dir: string, args: string[]): string {
  const p = Bun.spawnSync(["git", ...args], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${new TextDecoder().decode(p.stderr)}`);
  }
  return new TextDecoder().decode(p.stdout);
}

function initGitRepo(dir: string, origin?: string): void {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  writeFileSync(join(dir, "README.md"), "# test\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", "init"]);
  if (origin) git(dir, ["remote", "add", "origin", origin]);
}

/** talk/* branches and extra worktrees the bridge left in a repo. */
function bridgeTraces(repo: string): { branches: string; worktrees: number } {
  return {
    branches: git(repo, ["branch", "--list", "talk/*"]).trim(),
    worktrees: git(repo, ["worktree", "list", "--porcelain"])
      .split("\n")
      .filter((l) => l.startsWith("worktree ")).length,
  };
}

type Sandbox = {
  root: string;
  bridgeRoot: string;
  privateRepo: string;
  fledge: string;
  stranger: string;
  plainSibling: string;
};

let sb: Sandbox;
let savedBase: string | undefined;

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "corvidinho-scope-"));
  const bridgeRoot = join(root, "workspace", "Corvidinho");
  initGitRepo(bridgeRoot, "https://github.com/CorvidLabs/Corvidinho.git");
  mkdirSync(join(bridgeRoot, "sub"), { recursive: true });
  const privateRepo = join(root, "home", "leif", "private-repo");
  initGitRepo(privateRepo, "https://github.com/leif/private-repo.git");
  writeFileSync(join(privateRepo, "secrets.txt"), "s3cret\n");
  // Symlink inside the bridge root that points at the unrelated repo.
  symlinkSync(privateRepo, join(bridgeRoot, "escape"));
  const fledge = join(root, "workspace", "fledge");
  initGitRepo(fledge, "git@github.com:CorvidLabs/fledge.git");
  const stranger = join(root, "workspace", "stranger");
  initGitRepo(stranger, "https://github.com/evil/stranger.git");
  const plainSibling = join(root, "workspace", "plain");
  mkdirSync(plainSibling, { recursive: true });
  savedBase = process.env.WORKTREE_BASE_DIR;
  process.env.WORKTREE_BASE_DIR = join(root, "wts");
  sb = { root, bridgeRoot, privateRepo, fledge, stranger, plainSibling };
});

afterEach(() => {
  if (savedBase === undefined) delete process.env.WORKTREE_BASE_DIR;
  else process.env.WORKTREE_BASE_DIR = savedBase;
  rmSync(sb.root, { recursive: true, force: true });
});

function allowCfg(orgs: string[] = ["CorvidLabs"]): AllowlistConfig {
  const cfg = emptyConfig();
  cfg.discord.channels = ["chan-allowed"];
  cfg.github.orgs = orgs;
  return cfg;
}

function recordingAgent(): { calls: AgentRunChatOpts[]; runChat: (o: AgentRunChatOpts) => Promise<never> } {
  const calls: AgentRunChatOpts[] = [];
  return {
    calls,
    runChat: async (opts: AgentRunChatOpts) => {
      calls.push(opts);
      return { ok: true, sessionId: "s", summary: "ok", exitCode: 0 } as never;
    },
  };
}

function interaction(
  over: Partial<SlashInteraction> & { commandName: string },
): SlashInteraction & { out: () => string } {
  const replies: SlashReplyPayload[] = [];
  const edits: SlashReplyPayload[] = [];
  return {
    id: "ix_scope",
    commandName: over.commandName,
    subcommand: over.subcommand,
    channelId: "chan-allowed",
    userId: over.userId ?? "random-member",
    options: over.options ?? {},
    reply: async (o) => {
      replies.push(o);
    },
    deferReply: async () => {},
    editReply: async (o) => {
      edits.push(o);
    },
    out: () => edits[0]?.content ?? replies[0]?.content ?? "",
  };
}

function makeCtx(agent: ReturnType<typeof recordingAgent>, cfg = allowCfg()): SlashContext {
  return {
    store: new SessionStore({ defaultProjectRoot: sb.bridgeRoot, allowlist: cfg }),
    workStore: new WorkStore(),
    scheduleStore: new ScheduleStore(),
    allowlist: cfg,
    agent,
    version: "0.0.0",
    protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
    startedAt: Date.now(),
    channelIds: ["chan-allowed"],
    owner: { discordId: "boss" },
    openWorkPr: async () => ({ opened: false, reason: "not-allowed", line: "PR: skipped" }) as never,
  };
}

describe("resolveProjectDir scope (REQ-discord-202)", () => {
  test("bridge root and paths inside it resolve", () => {
    const opts = { defaultProjectRoot: sb.bridgeRoot };
    for (const p of [undefined, "", ".", sb.bridgeRoot, "sub", join(sb.bridgeRoot, "sub")]) {
      const r = resolveProjectDir(p, opts);
      expect(r.ok).toBe(true);
    }
  });

  test("absolute path, ../ traversal and symlink escape to another repo are refused", () => {
    const opts = { defaultProjectRoot: sb.bridgeRoot, github: allowCfg().github };
    for (const p of [
      sb.privateRepo,
      "../../home/leif/private-repo",
      "sub/../../../home/leif/private-repo",
      "escape",
      "/",
    ]) {
      const r = resolveProjectDir(p, opts);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/not authorized/i);
    }
  });

  test("sibling checkout needs an allowlisted origin; deny wins; default-deny without allowlist", () => {
    const base = { defaultProjectRoot: sb.bridgeRoot };
    const allowed = resolveProjectDir("fledge", { ...base, github: allowCfg().github });
    expect(allowed).toEqual({ ok: true, dir: sb.fledge });

    expect(resolveProjectDir("fledge", base).ok).toBe(false);
    expect(resolveProjectDir("stranger", { ...base, github: allowCfg().github }).ok).toBe(false);
    expect(resolveProjectDir("plain", { ...base, github: allowCfg().github }).ok).toBe(false);

    const deny = allowCfg().github;
    deny.denyRepos = ["CorvidLabs/fledge"];
    expect(resolveProjectDir("fledge", { ...base, github: deny }).ok).toBe(false);
  });
});

describe("slash + schedule refuse an out-of-scope project (REQ-discord-202)", () => {
  test("/work and /session start by a non-admin never touch another repo", async () => {
    for (const project of [sb.privateRepo, "../../home/leif/private-repo"]) {
      const agent = recordingAgent();
      const ctx = makeCtx(agent);
      const work = interaction({
        commandName: "work",
        options: { description: "summarize", project },
      });
      await handleSlashInteraction(ctx, work);
      expect(work.out()).toMatch(/not authorized/i);

      const start = interaction({
        commandName: "session",
        subcommand: "start",
        options: { topic: "summarize", project },
      });
      await handleSlashInteraction(ctx, start);
      expect(start.out()).toMatch(/not authorized/i);

      expect(agent.calls).toHaveLength(0);
      expect(ctx.store.list()).toHaveLength(0);
      expect(bridgeTraces(sb.privateRepo)).toEqual({ branches: "", worktrees: 1 });
      expect(existsSync(join(sb.root, "home", "leif", ".corvid-worktrees"))).toBe(false);
    }
  });

  test("/work on an allowlisted sibling still runs in its own worktree", async () => {
    const agent = recordingAgent();
    const ctx = makeCtx(agent);
    const work = interaction({
      commandName: "work",
      options: { description: "summarize", project: "fledge" },
    });
    await handleSlashInteraction(ctx, work);
    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0]!.cwd).toStartWith(join(sb.root, "wts"));
    for (const s of ctx.store.list()) await ctx.store.endSession(s);
    expect(bridgeTraces(sb.fledge)).toEqual({ branches: "", worktrees: 1 });
  });

  test("/schedule create refuses the project; a stored tick refuses it too", async () => {
    const agent = recordingAgent();
    const ctx = makeCtx(agent);
    const create = interaction({
      commandName: "schedule",
      subcommand: "create",
      userId: "boss",
      options: {
        name: "leak",
        cadence: "every hour",
        project: sb.privateRepo,
        prompt: "summarize",
      },
    });
    await handleSlashInteraction(ctx, create);
    expect(create.out()).toMatch(/not authorized/i);
    expect(ctx.scheduleStore!.list()).toHaveLength(0);

    // A row written before this fix (or by hand) is refused at tick time.
    const store = new ScheduleStore();
    const past = Date.now() - 60_000;
    const s = store.create({
      name: "leak",
      cronExpression: "0 * * * *",
      project: "../../home/leif/private-repo",
      prompt: "summarize",
      createdByUserId: "boss",
      now: past - 3_600_000,
    });
    s.nextRunAt = past;
    const errors: string[] = [];
    const svc = new SchedulerService({
      store,
      agent,
      allowlist: allowCfg(),
      manual: true,
      defaultProjectRoot: sb.bridgeRoot,
      useWorktrees: true,
      onRunFinished: (e) => errors.push(e.error ?? "ok"),
    });
    expect((await svc.tick()).started).toContain(s.id);
    await svc.drain(5_000);
    svc.stop();
    expect(agent.calls).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/not authorized/i);
    expect(bridgeTraces(sb.privateRepo)).toEqual({ branches: "", worktrees: 1 });
  });
});
