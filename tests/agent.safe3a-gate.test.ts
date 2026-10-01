/**
 * SAFE-3.a (#83, #124, REQ-agent-503): `shellToolsGate` decides whether an
 * execute attempt may be offered the allowlisted shell, language runners and
 * Fledge core runs. Only the owner's own chat, `/session start`, `/work` or
 * ask answer, inside that talk's own linked worktree; never a run with no
 * role session outside the worktree a local CLI run made for itself (those
 * rows: tests/cli.safe3a-shell.test.ts), a delegate or council worker, WATCH, a
 * schedule, a non-owner, a muted or deny-listed owner, the main checkout,
 * another talk's worktree, a subdirectory or a non-git scoped dir.
 *
 * Temp git projects and talk worktrees made by the product's own
 * `ensureTalkWorkspace`, a temp allowlist file; no network, no tokens.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ACTING_SURFACE_ENV,
  ACTING_SURFACES,
  SAFE3A_SURFACES,
  actingSurface,
  isOwnTalkWorktree,
  shellToolsGate,
  shellToolsRefusedLine,
} from "../src/agent/shell-gate.ts";
import { SAFE3A_TOOLS, allowlistOffers, buildOpenAiTools } from "../src/agent/tools.ts";
import { isVerifyEnvDropped } from "../src/agent/verify.ts";
import { DELEGATE_DEPTH_ENV, isWorkerEnvDropped } from "../src/autonomous/delegate.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { get } from "../src/plugins/registry.ts";
import { ensureTalkWorkspace, talkWorktreeId } from "../src/worktree/manager.ts";
import { makeProject } from "./fixtures/talk-worktree.ts";

const OWNER = "181969874455756800";
const TEAM = "200000000000000002";
const SID = "sess_safe3a_owner";
const OTHER_SID = "sess_safe3a_other";

const temps: string[] = [];
let saved: string | undefined;

function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}

beforeEach(() => {
  saved = process.env.WORKTREE_BASE_DIR;
  delete process.env.WORKTREE_BASE_DIR;
});

afterEach(() => {
  if (saved === undefined) delete process.env.WORKTREE_BASE_DIR;
  else process.env.WORKTREE_BASE_DIR = saved;
});

afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

function allowlistFile(dir: string, denyUsers: string[] = []): string {
  const path = join(dir, "allowlist.toml");
  writeFileSync(
    path,
    `[discord]
channels = ["600000000000000006"]
deny_users = [${denyUsers.map((u) => `"${u}"`).join(", ")}]

[owner]
discord_id = "${OWNER}"
display = "Leif"

[people.tofu]
display = "Tofu"
role = "team"
discord_ids = ["${TEAM}"]
`,
  );
  return path;
}

type Fixture = {
  base: string;
  project: string;
  own: string;
  other: string;
  scoped: string;
  allowlist: string;
};

async function fixture(): Promise<Fixture> {
  const base = tempDir("corvidinho-safe3a-gate-");
  const project = makeProject(base);
  const own = await ensureTalkWorkspace({ projectWorkingDir: project, sessionId: SID });
  const other = await ensureTalkWorkspace({ projectWorkingDir: project, sessionId: OTHER_SID });
  const plain = join(base, "plain");
  mkdirSync(plain);
  const scoped = await ensureTalkWorkspace({ projectWorkingDir: plain, sessionId: SID });
  if (!own.ok || !other.ok || !scoped.ok) throw new Error("fixture workspace failed");
  expect(own.workspace.kind).toBe("worktree");
  expect(scoped.workspace.kind).toBe("scoped_dir");
  return {
    base,
    project,
    own: own.workspace.workDir,
    other: other.workspace.workDir,
    scoped: scoped.workspace.workDir,
    allowlist: allowlistFile(base),
  };
}

/** The owner's chat run in its own talk, as the Discord spawn client stamps it. */
function ownerChatEnv(f: Fixture, extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    HOME: f.base,
    PATH: process.env.PATH,
    CORVIDINHO_ALLOWLIST_FILE: f.allowlist,
    CORVIDINHO_OWNER_DISCORD_ID: OWNER,
    CORVIDINHO_ACTING_IS_ADMIN: "1",
    CORVIDINHO_ACTING_DISCORD_USER_ID: OWNER,
    CORVIDINHO_ACTING_ROLE: "owner",
    CORVIDINHO_ACTING_WORK_TASK: "0",
    CORVIDINHO_DISCORD_SESSION_ID: SID,
    [ACTING_SURFACE_ENV]: "chat",
  };
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env;
}

describe("SAFE-3.a gate: who gets the shell, runners and Fledge runs (REQ-agent-503)", () => {
  test("the six gated tools and the four allowed surfaces", () => {
    expect([...SAFE3A_TOOLS].sort()).toEqual(
      ["cargo-exec", "fledge-lanes-run", "fledge-run", "node-exec", "python-exec", "shell-exec"],
    );
    expect([...SAFE3A_SURFACES].sort()).toEqual(["ask", "chat", "session", "work"]);
    expect([...ACTING_SURFACES].sort()).toEqual(["ask", "chat", "schedule", "session", "watch", "work"]);
    expect(actingSurface({ [ACTING_SURFACE_ENV]: " Work " })).toBe("work");
    for (const raw of [undefined, "", "cli", "chat,work", "owner"]) {
      expect(actingSurface({ [ACTING_SURFACE_ENV]: raw })).toBeNull();
    }
  });

  test("granted: the owner's chat, /session start, /work and ask answer in the talk's own worktree", async () => {
    const f = await fixture();
    for (const surface of ["chat", "session", "work", "ask"]) {
      const v = await shellToolsGate({ env: ownerChatEnv(f, { [ACTING_SURFACE_ENV]: surface }), cwd: f.own });
      expect({ surface, v }).toEqual({ surface, v: { granted: true } });
    }
  });

  test("refused: WATCH, schedules, an unknown surface and no stamp, even for the owner in the own worktree", async () => {
    const f = await fixture();
    const reasons = async (extra: Record<string, string | undefined>) => {
      const v = await shellToolsGate({ env: ownerChatEnv(f, extra), cwd: f.own });
      expect(v.granted).toBe(false);
      return v.granted ? "" : v.reason;
    };
    expect(await reasons({ [ACTING_SURFACE_ENV]: "watch" })).toContain("this run: watch");
    expect(await reasons({ [ACTING_SURFACE_ENV]: "schedule" })).toContain("this run: schedule");
    expect(await reasons({ [ACTING_SURFACE_ENV]: "" })).toContain("this run: no surface");
    expect(await reasons({ [ACTING_SURFACE_ENV]: undefined })).toContain("this run: no surface");
    expect(await reasons({ [ACTING_SURFACE_ENV]: "cli" })).toContain("this run: no surface");
    // A WATCH or scheduled run's own marker refuses whatever the stamp says.
    expect(await reasons({ CORVIDINHO_WATCH_SESSION_ID: "w1" })).toBe("WATCH runs never get them");
    expect(await reasons({ CORVIDINHO_DISCORD_SESSION_ID: `schedule_${SID}` })).toBe("scheduled runs never get them");
  });

  test("refused: non-owners, and an owner who is muted or deny-listed (role re-resolved now)", async () => {
    const f = await fixture();
    const refused = async (env: NodeJS.ProcessEnv) => {
      const v = await shellToolsGate({ env, cwd: f.own });
      expect(v).toEqual({ granted: false, reason: "only the owner's own runs get them" });
    };
    // A declared team member's own chat: team, never the shell.
    await refused(ownerChatEnv(f, {
      CORVIDINHO_ACTING_IS_ADMIN: "0",
      CORVIDINHO_ACTING_DISCORD_USER_ID: TEAM,
      CORVIDINHO_ACTING_ROLE: "team",
    }));
    // Community, and a forged owner id without the bridge's ADMIN bit.
    await refused(ownerChatEnv(f, { CORVIDINHO_ACTING_IS_ADMIN: "0", CORVIDINHO_ACTING_ROLE: "community" }));
    await refused(ownerChatEnv(f, { CORVIDINHO_ACTING_IS_ADMIN: "0" }));
    // The ADMIN bit for someone who is not the owner.
    await refused(ownerChatEnv(f, { CORVIDINHO_ACTING_DISCORD_USER_ID: TEAM }));
    // Muted now, or deny-listed in the live file.
    await refused(ownerChatEnv(f, { DISCORD_MUTED_USER_IDS: OWNER }));
    await refused(ownerChatEnv(f, { CORVIDINHO_ALLOWLIST_FILE: allowlistFile(tempDir("corvidinho-safe3a-deny-"), [OWNER]) }));
    // No owner configured: nobody is the owner.
    const noOwner = tempDir("corvidinho-safe3a-noowner-");
    const empty = join(noOwner, "allowlist.toml");
    writeFileSync(empty, "[discord]\nchannels = []\n");
    await refused(ownerChatEnv(f, { CORVIDINHO_ALLOWLIST_FILE: empty, CORVIDINHO_OWNER_DISCORD_ID: undefined }));
  });

  test("refused: delegate and council workers (depth > 0) and a run with no role session outside its own CLI worktree", async () => {
    const f = await fixture();
    for (const depth of ["1", "2", "junk"]) {
      const v = await shellToolsGate({ env: ownerChatEnv(f, { [DELEGATE_DEPTH_ENV]: depth }), cwd: f.own });
      expect(v).toEqual({ granted: false, reason: "a delegate or council worker never gets them" });
    }
    // No role session but a Discord session id and stamp: a spawn, never the local CLI (REQ-cli-681).
    const spawned = await shellToolsGate({ env: ownerChatEnv(f, { CORVIDINHO_ACTING_IS_ADMIN: undefined }), cwd: f.own });
    expect(spawned).toEqual({
      granted: false,
      reason: "a run with no role session gets them only as a local CLI run, and this one carries a Discord session or surface stamp",
    });
    // A plain local CLI run with no worktree of its own (--here, a non-git folder): refused.
    const local = ownerChatEnv(f, {
      CORVIDINHO_ACTING_IS_ADMIN: undefined,
      CORVIDINHO_DISCORD_SESSION_ID: undefined,
      [ACTING_SURFACE_ENV]: undefined,
    });
    expect(await shellToolsGate({ env: local, cwd: f.own })).toEqual({
      granted: false,
      reason: "a local CLI run gets them only in the new worktree it made for itself, not with --here or outside a git repo",
    });
  });

  test("refused: any cwd but the top of this talk's own linked worktree", async () => {
    const f = await fixture();
    const reason = "the run is not in this talk's own worktree";
    const sub = join(f.own, "sub");
    mkdirSync(sub);
    const link = join(f.base, "link-to-own");
    symlinkSync(f.own, link);
    // Dirs named like the talk's worktree whose `.git` file points at the
    // main repo, or at the talk's real admin dir (which points back elsewhere).
    const lookalike = join(f.base, "elsewhere", talkWorktreeId(SID));
    mkdirSync(lookalike, { recursive: true });
    writeFileSync(join(lookalike, ".git"), `gitdir: ${join(f.project, ".git")}\n`);
    const borrowed = join(f.base, "borrowed", talkWorktreeId(SID));
    mkdirSync(borrowed, { recursive: true });
    writeFileSync(join(borrowed, ".git"), readFileSync(join(f.own, ".git"), "utf8"));
    for (const cwd of [f.project, f.other, f.scoped, sub, lookalike, borrowed, join(f.base, "missing")]) {
      expect({ cwd, v: await shellToolsGate({ env: ownerChatEnv(f), cwd }) }).toEqual({
        cwd,
        v: { granted: false, reason },
      });
    }
    // The other talk's own session is granted in its own worktree only.
    expect(await shellToolsGate({ env: ownerChatEnv(f, { CORVIDINHO_DISCORD_SESSION_ID: OTHER_SID }), cwd: f.other }))
      .toEqual({ granted: true });
    expect(await shellToolsGate({ env: ownerChatEnv(f, { CORVIDINHO_DISCORD_SESSION_ID: OTHER_SID }), cwd: f.own }))
      .toEqual({ granted: false, reason });
    // No session id: no talk to own a worktree.
    expect(await shellToolsGate({ env: ownerChatEnv(f, { CORVIDINHO_DISCORD_SESSION_ID: undefined }), cwd: f.own }))
      .toEqual({ granted: false, reason });
    // A symlink to the own worktree resolves to it (the kernel's cwd is the real path).
    expect(isOwnTalkWorktree(link, SID)).toBe(true);
    expect(isOwnTalkWorktree(f.own, "")).toBe(false);
  });

  test("the catalog: with the grant the allowlisted six are offered at code tier (never at tool tier); without it none", () => {
    loadBuiltins();
    const allow = new Set([...SAFE3A_TOOLS, "files-delete"]);
    const names = (opts: Parameters<typeof buildOpenAiTools>[0]) =>
      new Set(buildOpenAiTools(opts).map((t) => t.function.name));
    const registered = [...SAFE3A_TOOLS].filter((n) => get(n));
    expect(registered).toContain("shell-exec");
    expect(registered).toContain("fledge-run");
    const granted = names({ tier: "code", allowlist: allow, safe3a: true, actingRole: "owner" });
    for (const n of registered) expect(granted.has(n)).toBe(true);
    expect(granted.has("files-delete")).toBe(true);
    const toolTier = names({ tier: "tool", allowlist: allow, safe3a: true, actingRole: "owner" });
    for (const n of SAFE3A_TOOLS) expect(toolTier.has(n)).toBe(false);
    const held = names({ tier: "code", allowlist: allow, actingRole: "owner" });
    for (const n of SAFE3A_TOOLS) expect(held.has(n)).toBe(false);
    // The grant never offers an unlisted one, nor any to a non-owner role.
    const unlisted = names({ tier: "code", allowlist: new Set(["shell-exec"]), safe3a: true, actingRole: "owner" });
    expect(unlisted.has("fledge-run")).toBe(false);
    const team = names({ tier: "code", allowlist: allow, safe3a: true, actingRole: "team", workTask: true });
    for (const n of SAFE3A_TOOLS) expect(team.has(n)).toBe(false);
    expect(allowlistOffers(allow, "shell-exec")).toBe(false);
    expect(allowlistOffers(allow, "shell-exec", true)).toBe(true);
    expect(allowlistOffers(allow, "files-delete")).toBe(true);
    expect(allowlistOffers(new Set(), "shell-exec", true)).toBe(false);
  });

  test("the stamp never reaches a worker or the verify lane; the refusal line names tools and reason", () => {
    expect(isWorkerEnvDropped(ACTING_SURFACE_ENV)).toBe(true);
    expect(isVerifyEnvDropped(ACTING_SURFACE_ENV)).toBe(true);
    expect(shellToolsRefusedLine(["shell-exec", "fledge-run"], "WATCH runs never get them")).toBe(
      "[operator] SAFE-3.a: shell-exec, fledge-run allowlisted but not offered: WATCH runs never get them",
    );
  });
});
