/**
 * IDENTITY-11.a — community members can't start /work (#65, Leif's
 * 2026-09-29 decision). Declared community, a declared person with no role
 * and anyone undeclared (IDENTITY-12: community at most) get the quiet
 * ephemeral "not authorized" of the owner-only commands, and nothing else
 * happens: no session, no worktree or talk/* branch, no work task, no agent
 * run (so no verify lane) and no PR step. The owner and a declared team
 * member keep /work unchanged. The role is resolved from the owner config
 * and the people list re-read at the time of the command.
 *
 * Fixture only: a temp git repo as the project, a temp worktree base, a
 * recording agent and a stub PR step; no Discord token, no real spawn.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyConfig } from "../src/allowlist/types.ts";
import type { AgentClient, AgentRunChatOpts } from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { handleWorkCommand } from "../src/discord/command-handlers/work.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import { handleSlashInteraction } from "../src/discord/slash-dispatch.ts";
import type { SlashContext, SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import { EPHEMERAL_SILENT_ACK, MUTED, NOT_AUTHORIZED } from "../src/discord/types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import type { OwnerRecord } from "../src/identity/owner.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import type { WorkPrOutcome } from "../src/work/pr.ts";

const OWNER_ID = "181969874455756800";
const TOFU = "200000000000000002"; // declared team
const KYN = "300000000000000003"; // declared community
const GASPAR = "400000000000000004"; // declared, no role key (community)
const STRANGER = "500000000000000005"; // undeclared (community at most)
const CHAN = "600000000000000006";
const OWNER: OwnerRecord = { discordId: OWNER_ID, display: "Leif" };

const PEOPLE = `[people.tofu]
display = "Tofu"
role = "team"
discord_ids = ["${TOFU}"]

[people.kyn]
display = "Kyn"
role = "community"
discord_ids = ["${KYN}"]

[people.gaspar]
display = "Gaspar"
discord_ids = ["${GASPAR}"]
`;

function fileText(people = PEOPLE): string {
  return `[discord]
channels = ["${CHAN}"]
users = []
roles = []

[owner]
discord_id = "${OWNER_ID}"
display = "Leif"

${people}`;
}

let root = "";
let project = "";
let wts = "";
let allowPath = "";
let savedBase: string | undefined;

function git(dir: string, args: string[]): string {
  const p = Bun.spawnSync(["git", ...args], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${new TextDecoder().decode(p.stderr)}`);
  }
  return new TextDecoder().decode(p.stdout);
}

function initGitRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  writeFileSync(join(dir, "README.md"), "# test\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", "init"]);
  git(dir, ["branch", "-M", "main"]);
}

/** talk/* branches and worktrees the run left in the project repo. */
function traces(): { branches: string; worktrees: number; worktreeDirs: number } {
  return {
    branches: git(project, ["branch", "--list", "talk/*"]).trim(),
    worktrees: git(project, ["worktree", "list", "--porcelain"])
      .split("\n")
      .filter((l) => l.startsWith("worktree ")).length,
    worktreeDirs: existsSync(wts) ? readdirSync(wts).length : 0,
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "corvidinho-community-no-work-"));
  project = join(root, "proj");
  wts = join(root, "wts");
  initGitRepo(project);
  allowPath = join(root, "allowlist.toml");
  writeFileSync(allowPath, fileText());
  savedBase = process.env.WORKTREE_BASE_DIR;
  process.env.WORKTREE_BASE_DIR = wts;
});

afterEach(() => {
  if (savedBase === undefined) delete process.env.WORKTREE_BASE_DIR;
  else process.env.WORKTREE_BASE_DIR = savedBase;
  rmSync(root, { recursive: true, force: true });
});

type Harness = {
  ctx: SlashContext;
  runs: AgentRunChatOpts[];
  prCalls: () => number;
};

function harness(opts: { owner?: OwnerRecord | null; sourcePath?: string | null } = {}): Harness {
  const allowlist = emptyConfig();
  allowlist.discord.channels = [CHAN];
  allowlist.sourcePath = opts.sourcePath === undefined ? allowPath : opts.sourcePath;
  const runs: AgentRunChatOpts[] = [];
  const agent: AgentClient = {
    async runChat(o) {
      runs.push(o);
      return {
        ok: true,
        sessionId: o.sessionId,
        summary: "did it",
        exitCode: 0,
        task: { verified: true, verifySkipped: false, state: "done" },
      };
    },
  };
  let prCalls = 0;
  const ctx: SlashContext = {
    store: new SessionStore({ db: openCorvidinhoDb({ memory: true }), defaultProjectRoot: project }),
    workStore: new WorkStore(),
    allowlist,
    agent,
    version: "0.0.0",
    protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
    startedAt: Date.now(),
    channelIds: [CHAN],
    owner: opts.owner === undefined ? OWNER : opts.owner,
    mutedUsers: new Set(),
    openWorkPr: async (): Promise<WorkPrOutcome> => {
      prCalls += 1;
      return { opened: false, reason: "not-allowed", line: "PR: fixture line" };
    },
  };
  return { ctx, runs, prCalls: () => prCalls };
}

type Ix = SlashInteraction & { replies: SlashReplyPayload[]; deferred: () => boolean };

function workIx(userId: string, description = "Add a greeting to the README"): Ix {
  const replies: SlashReplyPayload[] = [];
  let deferred = false;
  return {
    id: `ix-${userId}`,
    commandName: "work",
    channelId: CHAN,
    userId,
    options: { description },
    replies,
    deferred: () => deferred,
    reply: async (p) => {
      replies.push(p);
    },
    deferReply: async () => {
      deferred = true;
    },
    editReply: async (p) => {
      replies.push(p);
    },
  };
}

async function endAll(ctx: SlashContext): Promise<void> {
  for (const s of ctx.store.list()) await ctx.store.endSession(s);
}

/** Nothing of a /work run exists: no session, task, run, PR step, worktree or branch. */
function expectNothingStarted(h: Harness, ix: Ix): void {
  expect(ix.replies).toEqual([{ content: NOT_AUTHORIZED, ephemeral: true }]);
  expect(ix.deferred()).toBe(false);
  expect(h.runs).toHaveLength(0);
  expect(h.prCalls()).toBe(0);
  expect(h.ctx.store.list()).toHaveLength(0);
  expect(h.ctx.workStore.list()).toHaveLength(0);
  expect(traces()).toEqual({ branches: "", worktrees: 1, worktreeDirs: 0 });
}

describe("IDENTITY-11.a: community members can't start /work", () => {
  for (const [who, id] of [
    ["declared community", KYN],
    ["declared with no role", GASPAR],
    ["undeclared", STRANGER],
  ] as const) {
    test(`a ${who} user's /work gets the quiet ephemeral "not authorized" and creates no worktree, branch, task, run or PR`, async () => {
      const h = harness();
      const ix = workIx(id);
      expect(await handleSlashInteraction(h.ctx, ix)).toEqual({ ok: true, handled: true });
      expectNothingStarted(h, ix);
    });
  }

  test("with a project option too: refused before the project is resolved (no worktree anywhere)", async () => {
    const h = harness();
    const ix = workIx(STRANGER);
    ix.options.project = project;
    await handleSlashInteraction(h.ctx, ix);
    expectNothingStarted(h, ix);
  });

  test("no owner and nobody declared: an undeclared user still can't start /work (IDENTITY-3/12)", async () => {
    const h = harness({ owner: null, sourcePath: null });
    const ix = workIx(STRANGER);
    await handleSlashInteraction(h.ctx, ix);
    expectNothingStarted(h, ix);
  });

  test("no owner configured: declared community and undeclared are refused; a declared team member still runs as team (IDENTITY-3: nobody is owner)", async () => {
    for (const id of [KYN, GASPAR, STRANGER]) {
      const h = harness({ owner: null });
      const ix = workIx(id);
      await handleSlashInteraction(h.ctx, ix);
      expectNothingStarted(h, ix);
    }
    const h = harness({ owner: null });
    const ix = workIx(TOFU);
    await handleSlashInteraction(h.ctx, ix);
    expect(h.runs).toHaveLength(1);
    expect(h.runs[0]).toMatchObject({ actingUserId: TOFU, actingRole: "team", actingIsAdmin: false, workTask: true });
    await endAll(h.ctx);
  });

  test("a muted or deny-listed team member is community at the handler and can't start /work", async () => {
    const muted = harness();
    muted.ctx.mutedUsers!.add(TOFU);
    const ix1 = workIx(TOFU);
    await handleWorkCommand(muted.ctx, ix1);
    expectNothingStarted(muted, ix1);

    const denied = harness();
    denied.ctx.allowlist.discord.denyUsers = [TOFU];
    const ix2 = workIx(TOFU);
    await handleWorkCommand(denied.ctx, ix2);
    expectNothingStarted(denied, ix2);
  });

  test("through the dispatcher a muted or deny-listed team member is stopped by the mute / actor gate first, and nothing starts", async () => {
    const muted = harness();
    muted.ctx.mutedUsers!.add(TOFU);
    const ix1 = workIx(TOFU);
    expect(await handleSlashInteraction(muted.ctx, ix1)).toMatchObject({ ok: false, reason: "muted" });
    expect(ix1.replies).toEqual([{ content: MUTED, ephemeral: true }]);

    const denied = harness();
    denied.ctx.allowlist.discord.denyUsers = [TOFU];
    const ix2 = workIx(TOFU);
    expect(await handleSlashInteraction(denied.ctx, ix2)).toMatchObject({ ok: false, reason: "user_not_allowlisted" });
    expect(ix2.replies).toEqual([{ content: EPHEMERAL_SILENT_ACK, ephemeral: true }]);

    for (const [h, ix] of [[muted, ix1], [denied, ix2]] as const) {
      expect(ix.deferred()).toBe(false);
      expect(h.runs).toHaveLength(0);
      expect(h.prCalls()).toBe(0);
      expect(h.ctx.store.list()).toHaveLength(0);
      expect(h.ctx.workStore.list()).toHaveLength(0);
    }
    expect(traces()).toEqual({ branches: "", worktrees: 1, worktreeDirs: 0 });
  });

  test("the owner's and a team member's /work run unchanged: worktree, work flag, PR step", async () => {
    for (const [id, role, admin] of [
      [OWNER_ID, "owner", true],
      [TOFU, "team", false],
    ] as const) {
      const h = harness();
      const ix = workIx(id);
      expect(await handleSlashInteraction(h.ctx, ix)).toEqual({ ok: true, handled: true });
      expect(ix.deferred()).toBe(true);
      expect(h.runs).toHaveLength(1);
      expect(h.runs[0]).toMatchObject({ actingUserId: id, actingRole: role, actingIsAdmin: admin, workTask: true });
      expect(h.runs[0]!.cwd).toStartWith(wts);
      expect(h.prCalls()).toBe(1);
      expect(h.ctx.workStore.list()).toHaveLength(1);
      expect(h.ctx.workStore.list()[0]!.status).toBe("completed");
      const body = ix.replies.at(-1)?.content ?? "";
      expect(body).toContain("PR: fixture line");
      expect(body).not.toBe(NOT_AUTHORIZED);
      expect(traces().worktrees).toBe(2);
      await endAll(h.ctx);
    }
  });

  test("the role is re-read at the time of the command: a demotion or promotion in the file applies to the next /work, no restart", async () => {
    const h = harness();
    const first = workIx(TOFU);
    await handleSlashInteraction(h.ctx, first);
    expect(h.runs).toHaveLength(1);
    await endAll(h.ctx);
    const worktreesAfterFirst = traces().worktrees;

    // Tofu demoted to community, Kyn promoted to team, on the VM.
    writeFileSync(
      allowPath,
      fileText(
        PEOPLE.replace('role = "team"', 'role = "TMP"')
          .replace('role = "community"', 'role = "team"')
          .replace('role = "TMP"', 'role = "community"'),
      ),
    );
    const demoted = workIx(TOFU);
    await handleSlashInteraction(h.ctx, demoted);
    expect(demoted.replies).toEqual([{ content: NOT_AUTHORIZED, ephemeral: true }]);
    expect(demoted.deferred()).toBe(false);
    expect(h.runs).toHaveLength(1);
    expect(h.ctx.store.list()).toHaveLength(0);
    expect(traces().worktrees).toBe(worktreesAfterFirst);

    const promoted = workIx(KYN);
    await handleSlashInteraction(h.ctx, promoted);
    expect(h.runs).toHaveLength(2);
    expect(h.runs[1]).toMatchObject({ actingUserId: KYN, actingRole: "team", workTask: true });
    await endAll(h.ctx);
  });

  test("through the bridge: a community /work is refused with the ephemeral reply and spawns nothing; the owner's still runs", async () => {
    const runs: AgentRunChatOpts[] = [];
    const agent: AgentClient = {
      async runChat(o) {
        runs.push(o);
        return { ok: true, sessionId: o.sessionId, summary: "did it", exitCode: 0 };
      },
    };
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    const store = new SessionStore({ db: openCorvidinhoDb({ memory: true }), defaultProjectRoot: project });
    const started = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: CHAN,
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: allowPath,
      },
      projectRoot: project,
      sessionStore: store,
      workStore: new WorkStore(),
      skipProtocolCheck: true,
      disableScheduler: true,
      thinkingOutbound: memoryThinkingOutbound(),
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent,
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        handlers.reply = async () => ({ messageId: "bot_1" });
        return createNullGateway();
      },
    });
    if (started.ok !== true || !box.handlers) throw new Error("bridge did not start");
    try {
      for (const id of [KYN, STRANGER]) {
        const ix = workIx(id);
        await box.handlers.onSlash!(ix);
        expect(ix.replies).toEqual([{ content: NOT_AUTHORIZED, ephemeral: true }]);
        expect(ix.deferred()).toBe(false);
      }
      expect(runs).toHaveLength(0);
      expect(store.list()).toHaveLength(0);
      expect(traces()).toEqual({ branches: "", worktrees: 1, worktreeDirs: 0 });

      const owner = workIx(OWNER_ID);
      await box.handlers.onSlash!(owner);
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({ actingUserId: OWNER_ID, actingRole: "owner", workTask: true });
      for (const s of store.list()) await store.endSession(s);
    } finally {
      await started.stop();
    }
  });
});
