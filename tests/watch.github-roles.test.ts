/**
 * IDENTITY-12.a (#65, REQ-watch-1201 / REQ-plugins-1201): "On GitHub, the
 * owner and team members I've declared get their role's tools too, behind
 * the same must-ask gate; anyone else stays community."
 *
 * - The poller resolves the person who triggered a WATCH run — the comment or
 *   issue-body author that @mentioned the watch user, by the GitHub numeric
 *   user id the API reported, in the owner's people list — to their declared
 *   role; an assignment or review request (triggered by someone else on the
 *   thread) is community, never the thread author's role.
 * - The WATCH spawn stamps that role like a Discord run (owner: the ADMIN bit
 *   and `CORVIDINHO_ACTING_ROLE=owner`; team; else community), never a /work
 *   task, always overwritten.
 * - The tool layer (src/plugins/roles.ts) re-resolves it from the GitHub id
 *   at every call; a login, a Discord id or a stamp alone never raises it.
 * - An owner run's must-ask call raises the owner's Approve card; team and
 *   community runs never reach it for owner-only tools.
 * - WATCH-specific limits stay: secret paths hidden, no shell, workers
 *   community.
 *
 * Temp allowlist file and data dir, a fake spawn bin that dumps its env, a
 * registered test command; no token, no network.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shellToolsGate } from "../src/agent/shell-gate.ts";
import { buildDelegateSpawn } from "../src/autonomous/delegate.ts";
import type { OwnerRecord } from "../src/identity/owner.ts";
import { buildPeopleDirectory, parsePeopleToml } from "../src/identity/people.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { secretPathsRefused } from "../plugins/files/protectedPaths.ts";
import { setMustAskNotifier, setMustAskTestHooks, MUST_ASK_PROD_KIND } from "../src/plugins/must-ask.ts";
import { get, register, unregister } from "../src/plugins/registry.ts";
import {
  ROLE_REFUSED_MESSAGE,
  actingWorkTask,
  resolveActingIsAdmin,
  resolveActingRole,
  roleAllowsPlugin,
} from "../src/plugins/roles.ts";
import { runPlugin } from "../src/plugins/run.ts";
import type { PluginCommand } from "../src/plugins/types.ts";
import { createEchoAckClient } from "../src/watch/ack.ts";
import { createSpawnAgentClient, type AgentClient, type AgentRunChatOpts } from "../src/watch/agent-client.ts";
import { startWatchPoller } from "../src/watch/poller.ts";
import * as routerModule from "../src/watch/router.ts";
import type { DetectedEvent } from "../src/watch/types.ts";
import { answerMustAsk, MUST_ASK_TEST_OWNER } from "./fixtures/must-ask.ts";

/** Read through the namespace, so the base sources fail on behaviour, not on import. */
type TriggerRole = (event: Pick<DetectedEvent, "type" | "senderId">, people: unknown) => string;
const watchTriggerRole: TriggerRole | undefined = (routerModule as { watchTriggerRole?: TriggerRole }).watchTriggerRole;

const OWNER_DC = MUST_ASK_TEST_OWNER;
const TOFU_DC = "200000000000000002";
const OWNER_GH = 8268288;
const TOFU_GH = 4242; // team
const KYN_GH = 5151; // declared community
const STRANGER_GH = 777; // undeclared
const SQUATTER_GH = 31337; // re-registered the owner's login
const REPO = "corvidlabs/app";
const OWNER: OwnerRecord = { discordId: OWNER_DC, display: "Leif", githubLogin: "0xleif", githubId: String(OWNER_GH) };

const PEOPLE = `[people.tofu]
display = "Tofu"
role = "team"
discord_ids = ["${TOFU_DC}"]
github_logins = ["tofu-dev"]
github_ids = ["${TOFU_GH}"]

[people.kyn]
display = "Kyn"
role = "community"
github_logins = ["kyn-gh"]
github_ids = ["${KYN_GH}"]
`;

function fileText(over: { people?: string; ghDeny?: string; dcDeny?: string; ownerGhId?: string | null } = {}): string {
  const ownerGh = over.ownerGhId === undefined ? String(OWNER_GH) : over.ownerGhId;
  return `[github]
repos = ["${REPO}"]
users = ["0xleif", "tofu-dev", "kyn-gh", "stranger-gh"]
deny_users = [${over.ghDeny ?? ""}]

[discord]
channels = ["600000000000000006"]
users = []
roles = []
deny_users = [${over.dcDeny ?? ""}]

[owner]
discord_id = "${OWNER_DC}"
display = "Leif"
github_login = "0xleif"
${ownerGh === null ? "" : `github_id = "${ownerGh}"`}

${over.people ?? PEOPLE}`;
}

const KEYS = [
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_ALLOWLIST",
  "CORVIDINHO_DATA_DIR",
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_OWNER_GITHUB_LOGIN",
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_ROLE",
  "CORVIDINHO_ACTING_WORK_TASK",
  "CORVIDINHO_ACTING_SURFACE",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ACTING_CONFIRM_TOKENS",
  "CORVIDINHO_ACTING_GITHUB_LOGIN",
  "CORVIDINHO_ACTING_GITHUB_ID",
  "CORVIDINHO_ACTING_GITHUB_REPO",
  "CORVIDINHO_WATCH_SESSION_ID",
  "CORVIDINHO_DISCORD_SESSION_ID",
  "CORVIDINHO_DISCORD_REPLY_CHANNEL_ID",
  "CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID",
  "CORVIDINHO_NON_INTERACTIVE",
  "CORVIDINHO_DELEGATE_DEPTH",
  "CORVIDINHO_GITHUB_DENY_USERS",
  "CORVIDINHO_GITHUB_ALLOW_USERS",
  "CORVIDINHO_DISCORD_DENY_USERS",
  "DISCORD_MUTED_USER_IDS",
] as const;

let saved: Record<string, string | undefined> = {};
let dir = "";
let path = "";
let ran: string[][] = [];

/** A mutating, owner-only command whose every call is must-ask prod (a push to the default branch, say). */
const PROD_TOOL: PluginCommand = {
  name: "test-watch-role-prod",
  description: "IDENTITY-12.a must-ask test command",
  mutating: true,
  mustAsk: "prod",
  async handler(ctx) {
    ran.push([PROD_TOOL.name, ...ctx.args]);
    return { ok: true, message: "ran", exitCode: 0 };
  },
};

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  dir = mkdtempSync(join(tmpdir(), "corvidinho-watch-roles-"));
  path = join(dir, "allowlist.toml");
  writeFileSync(path, fileText());
  process.env.CORVIDINHO_ALLOWLIST_FILE = path;
  process.env.CORVIDINHO_DATA_DIR = join(dir, "data");
  ran = [];
  setMustAskNotifier(() => {});
  if (!get(PROD_TOOL.name)) register(PROD_TOOL);
});

afterEach(() => {
  setMustAskTestHooks({});
  setMustAskNotifier(null);
  unregister(PROD_TOOL.name, PROD_TOOL);
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
});

function ev(over: Partial<DetectedEvent> = {}): DetectedEvent {
  return {
    id: "comment-1",
    type: "issue_comment",
    body: "@corvid-agent please push the fix",
    sender: "0xLeif",
    senderId: OWNER_GH,
    repo: REPO,
    number: 7,
    title: "Crash on start",
    htmlUrl: `https://github.com/${REPO}/issues/7`,
    createdAt: "2026-10-06T12:00:00Z",
    isPullRequest: false,
    ...over,
  };
}

/** Run each event through a real poller (one poll each) and return what each run was started with. */
async function pollerRuns(events: DetectedEvent[]): Promise<AgentRunChatOpts[]> {
  const calls: AgentRunChatOpts[] = [];
  const agent: AgentClient = {
    async runChat(opts) {
      calls.push(opts);
      return { ok: true, sessionId: opts.sessionId, summary: "ok", exitCode: 0 };
    },
  };
  const db = openCorvidinhoDb({ memory: true });
  let i = 0;
  const result = await startWatchPoller({
    env: {
      GITHUB_TOKEN: "fixture-token-not-real",
      CORVIDINHO_WATCH_USERNAME: "corvid-agent",
      CORVIDINHO_WATCH_DRY_RUN: "1",
      HOME: dir,
    },
    filePath: path,
    runLoop: false,
    agent,
    ackClient: createEchoAckClient(),
    db,
    log: () => {},
    fetchEvents: async () => {
      const e = events[i];
      i += 1;
      return e ? [e] : [];
    },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return calls;
  try {
    for (let n = 0; n < events.length; n++) await result.pollOnce();
  } finally {
    await result.stop();
    db.close();
  }
  return calls;
}

/** The env a real WATCH spawn hands its child (a fake bin dumps it), for `opts`. */
async function watchSpawnEnv(opts: Partial<AgentRunChatOpts>): Promise<Record<string, string>> {
  const bin = join(dir, "dump-env.ts");
  const out = join(dir, `env-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(
    bin,
    'import { writeFileSync } from "node:fs";\nwriteFileSync(process.env.DUMP_ENV_TO!, JSON.stringify(process.env));\nconsole.log("ok");\n',
  );
  const client = createSpawnAgentClient({ bin, cwd: dir, env: { DUMP_ENV_TO: out } });
  await client.runChat({ prompt: "hi", sessionId: "watch_w1", ...opts });
  return JSON.parse(readFileSync(out, "utf8")) as Record<string, string>;
}

const STAMP_KEYS = [
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_ROLE",
  "CORVIDINHO_ACTING_WORK_TASK",
  "CORVIDINHO_ACTING_SURFACE",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ACTING_CONFIRM_TOKENS",
  "CORVIDINHO_ACTING_GITHUB_LOGIN",
  "CORVIDINHO_ACTING_GITHUB_ID",
  "CORVIDINHO_ACTING_GITHUB_REPO",
  "CORVIDINHO_WATCH_SESSION_ID",
  "CORVIDINHO_NON_INTERACTIVE",
] as const;

/** Put this process in the role session a WATCH run would be in. */
async function becomeWatchRun(opts: Partial<AgentRunChatOpts>): Promise<void> {
  const env = await watchSpawnEnv(opts);
  for (const k of STAMP_KEYS) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
}

/** Set a WATCH-shaped stamp by hand (what a forged or stale stamp would look like). */
function stamp(fields: Partial<Record<(typeof STAMP_KEYS)[number], string>>): void {
  process.env.CORVIDINHO_ACTING_SURFACE = "watch";
  process.env.CORVIDINHO_WATCH_SESSION_ID = "watch_w1";
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = "";
  for (const [k, v] of Object.entries(fields)) process.env[k] = v;
}

describe("IDENTITY-12.a: the poller stamps the role of whoever triggered the run", () => {
  test("owner comment → owner; team → team; declared community, stranger, spoofed login and no id → community", async () => {
    const calls = await pollerRuns([
      ev({ id: "comment-1", number: 1 }),
      ev({ id: "comment-2", number: 2, sender: "tofu-dev", senderId: TOFU_GH }),
      ev({ id: "comment-3", number: 3, sender: "kyn-gh", senderId: KYN_GH }),
      ev({ id: "comment-4", number: 4, sender: "stranger-gh", senderId: STRANGER_GH }),
      // The owner's login re-registered by someone else: another numeric id.
      ev({ id: "comment-5", number: 5, sender: "0xLeif", senderId: SQUATTER_GH }),
      // The owner's login with no id in the payload.
      ev({ id: "comment-6", number: 6, sender: "0xLeif", senderId: undefined }),
    ]);
    expect(calls).toHaveLength(6);
    expect(calls.map((c) => c.actingRole)).toEqual(["owner", "team", "community", "community", "community", "community"]);
    expect(calls[0]!.prompt).toContain("- role: owner (this run has the owner's tools, behind the same must-ask gate as on Discord)");
    expect(calls[1]!.prompt).toContain("- role: team (this run has the team's tools");
    for (const c of calls.slice(2)) expect(c.prompt).not.toMatch(/- role: (owner|team)/);
    // The thread text stays fenced as untrusted data, whoever triggered it.
    expect(calls[0]!.prompt).toContain("[untrusted GitHub text (title and body)");
  });

  test("an issue-body mention is triggered by its author; an assignment or review request never takes the thread author's role", async () => {
    const calls = await pollerRuns([
      ev({ id: `issue-${REPO}#1`, type: "issues", number: 1, sender: "tofu-dev", senderId: TOFU_GH }),
      // The owner's own thread; a team member assigned / requested review.
      ev({ id: `assign-${REPO}#2`, type: "assignment", number: 2, actor: "tofu-dev" }),
      ev({ id: `reviewreq-${REPO}#3`, type: "review_request", number: 3, actor: "tofu-dev", isPullRequest: true }),
    ]);
    expect(calls.map((c) => c.actingRole)).toEqual(["team", "community", "community"]);
    expect(calls[1]!.prompt).toContain("- role: owner (but this run was started by an assignment or review request, so it has community tools)");
    expect(calls[1]!.prompt).not.toContain("this run has the owner's tools");
  });

  test("watchTriggerRole: the trigger's declared role by numeric id only; no people list, no id or an actor-gated event ⇒ community", () => {
    expect(typeof watchTriggerRole).toBe("function");
    if (!watchTriggerRole) return;
    const people = buildPeopleDirectory(parsePeopleToml(PEOPLE), OWNER);
    expect(watchTriggerRole({ type: "issue_comment", senderId: OWNER_GH }, people)).toBe("owner");
    expect(watchTriggerRole({ type: "issues", senderId: TOFU_GH }, people)).toBe("team");
    expect(watchTriggerRole({ type: "pull_request_review_comment", senderId: TOFU_GH }, people)).toBe("team");
    for (const id of [KYN_GH, STRANGER_GH, SQUATTER_GH, undefined]) {
      expect(watchTriggerRole({ type: "issue_comment", senderId: id }, people)).toBe("community");
    }
    for (const type of ["assignment", "review_request"] as const) {
      expect(watchTriggerRole({ type, senderId: OWNER_GH }, people)).toBe("community");
    }
    expect(watchTriggerRole({ type: "issue_comment", senderId: OWNER_GH }, null)).toBe("community");
  });
});

describe("IDENTITY-12.a: the WATCH spawn stamps that role exactly like a Discord run", () => {
  test("owner → ADMIN bit + owner; team → team; omitted → community; never a /work task; never inherited", async () => {
    process.env.CORVIDINHO_ACTING_IS_ADMIN = "1";
    process.env.CORVIDINHO_ACTING_ROLE = "owner";
    process.env.CORVIDINHO_ACTING_WORK_TASK = "1";
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = OWNER_DC;

    const owner = await watchSpawnEnv({ actingRole: "owner", actingGithubId: OWNER_GH, actingGithubLogin: "0xLeif", repo: REPO });
    expect(owner).toMatchObject({
      CORVIDINHO_ACTING_IS_ADMIN: "1",
      CORVIDINHO_ACTING_ROLE: "owner",
      CORVIDINHO_ACTING_WORK_TASK: "0",
      CORVIDINHO_ACTING_SURFACE: "watch",
      CORVIDINHO_ACTING_DISCORD_USER_ID: "",
      CORVIDINHO_ACTING_GITHUB_ID: String(OWNER_GH),
      CORVIDINHO_WATCH_SESSION_ID: "watch_w1",
    });
    const team = await watchSpawnEnv({ actingRole: "team", actingGithubId: TOFU_GH });
    expect(team).toMatchObject({ CORVIDINHO_ACTING_IS_ADMIN: "0", CORVIDINHO_ACTING_ROLE: "team", CORVIDINHO_ACTING_WORK_TASK: "0" });
    for (const r of [undefined, "community" as const]) {
      const none = await watchSpawnEnv({ ...(r ? { actingRole: r } : {}), actingGithubId: OWNER_GH });
      expect(none).toMatchObject({ CORVIDINHO_ACTING_IS_ADMIN: "0", CORVIDINHO_ACTING_ROLE: "community", CORVIDINHO_ACTING_WORK_TASK: "0" });
    }
  });
});

describe("IDENTITY-12.a: the tool layer re-resolves the GitHub trigger's role on every call", () => {
  test("owner and team by GitHub numeric id; strangers, declared community and spoofed stamps are community", async () => {
    await becomeWatchRun({ actingRole: "owner", actingGithubId: OWNER_GH, actingGithubLogin: "0xLeif" });
    expect(await resolveActingIsAdmin()).toBe(true);
    expect(await resolveActingRole()).toBe("owner");

    await becomeWatchRun({ actingRole: "team", actingGithubId: TOFU_GH, actingGithubLogin: "tofu-dev" });
    expect(await resolveActingRole()).toBe("team");

    // A stamp never raises: owner's stamp on someone else's id is not owner.
    for (const id of [STRANGER_GH, SQUATTER_GH, KYN_GH]) {
      stamp({ CORVIDINHO_ACTING_IS_ADMIN: "1", CORVIDINHO_ACTING_ROLE: "owner", CORVIDINHO_ACTING_GITHUB_ID: String(id), CORVIDINHO_ACTING_GITHUB_LOGIN: "0xleif" });
      expect(await resolveActingIsAdmin()).toBe(false);
      expect(await resolveActingRole()).toBe("community");
    }
    // A team stamp on the owner's id lowers to community; a community stamp is community.
    stamp({ CORVIDINHO_ACTING_IS_ADMIN: "0", CORVIDINHO_ACTING_ROLE: "team", CORVIDINHO_ACTING_GITHUB_ID: String(OWNER_GH) });
    expect(await resolveActingRole()).toBe("community");
    stamp({ CORVIDINHO_ACTING_IS_ADMIN: "0", CORVIDINHO_ACTING_ROLE: "community", CORVIDINHO_ACTING_GITHUB_ID: String(TOFU_GH) });
    expect(await resolveActingRole()).toBe("community");
    // A login alone (no id) never counts.
    stamp({ CORVIDINHO_ACTING_IS_ADMIN: "1", CORVIDINHO_ACTING_ROLE: "owner", CORVIDINHO_ACTING_GITHUB_ID: "", CORVIDINHO_ACTING_GITHUB_LOGIN: "0xleif" });
    expect(await resolveActingRole()).toBe("community");
    // A Discord id never counts in a WATCH run, not even the owner's.
    stamp({ CORVIDINHO_ACTING_IS_ADMIN: "1", CORVIDINHO_ACTING_ROLE: "owner", CORVIDINHO_ACTING_GITHUB_ID: "", CORVIDINHO_ACTING_DISCORD_USER_ID: OWNER_DC });
    expect(await resolveActingRole()).toBe("community");
    // No WATCH session: the GitHub stamp raises nothing.
    stamp({ CORVIDINHO_ACTING_IS_ADMIN: "1", CORVIDINHO_ACTING_ROLE: "owner", CORVIDINHO_ACTING_GITHUB_ID: String(OWNER_GH) });
    delete process.env.CORVIDINHO_WATCH_SESSION_ID;
    expect(await resolveActingRole()).toBe("community");
  });

  test("a Discord run never uses the GitHub keys", async () => {
    process.env.CORVIDINHO_ACTING_SURFACE = "chat";
    process.env.CORVIDINHO_ACTING_IS_ADMIN = "1";
    process.env.CORVIDINHO_ACTING_ROLE = "owner";
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = "";
    process.env.CORVIDINHO_ACTING_GITHUB_ID = String(OWNER_GH);
    process.env.CORVIDINHO_WATCH_SESSION_ID = "watch_w1";
    expect(await resolveActingRole()).toBe("community");
    // ...and the owner's Discord id still works there.
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = OWNER_DC;
    expect(await resolveActingRole()).toBe("owner");
  });

  test("live: a role change, a GitHub deny (login or id), a muted or deny-listed Discord id, or no owner GitHub id apply at the next call", async () => {
    await becomeWatchRun({ actingRole: "team", actingGithubId: TOFU_GH, actingGithubLogin: "tofu-dev" });
    expect(await resolveActingRole()).toBe("team");
    writeFileSync(path, fileText({ people: PEOPLE.replace('role = "team"', 'role = "community"') }));
    expect(await resolveActingRole()).toBe("community");
    writeFileSync(path, fileText({ ghDeny: '"tofu-dev"' }));
    expect(await resolveActingRole()).toBe("community");
    writeFileSync(path, fileText({ ghDeny: `"${TOFU_GH}"` }));
    expect(await resolveActingRole()).toBe("community");
    writeFileSync(path, fileText({ dcDeny: `"${TOFU_DC}"` }));
    expect(await resolveActingRole()).toBe("community");
    writeFileSync(path, fileText());
    process.env.DISCORD_MUTED_USER_IDS = TOFU_DC;
    expect(await resolveActingRole()).toBe("community");
    delete process.env.DISCORD_MUTED_USER_IDS;
    expect(await resolveActingRole()).toBe("team");

    await becomeWatchRun({ actingRole: "owner", actingGithubId: OWNER_GH, actingGithubLogin: "0xLeif" });
    expect(await resolveActingRole()).toBe("owner");
    writeFileSync(path, fileText({ ownerGhId: null }));
    expect(await resolveActingRole()).toBe("community");
    writeFileSync(path, `${fileText()}\n[github\n`);
    expect(await resolveActingRole()).toBe("community");
  });

  test("team on GitHub: reviews and search, never /work file edits; the owner: everything", async () => {
    process.env.CORVIDINHO_ACTING_WORK_TASK = "1";
    await becomeWatchRun({ actingRole: "team", actingGithubId: TOFU_GH });
    process.env.CORVIDINHO_ACTING_WORK_TASK = "1"; // a stale stamp still is no /work task
    expect(actingWorkTask()).toBe(false);
    const role = await resolveActingRole();
    expect(role).toBe("team");
    expect(roleAllowsPlugin(role, { name: "github-issue-comment", dangerous: true }, actingWorkTask())).toBe(true);
    expect(roleAllowsPlugin(role, { name: "github-pr-review", dangerous: true }, actingWorkTask())).toBe(true);
    expect(roleAllowsPlugin(role, { name: "files-edit", mutating: true }, actingWorkTask())).toBe(false);
    expect(roleAllowsPlugin(role, { name: "git-push", dangerous: true }, actingWorkTask())).toBe(false);
    await becomeWatchRun({ actingRole: "owner", actingGithubId: OWNER_GH });
    const owner = await resolveActingRole();
    expect(roleAllowsPlugin(owner, { name: "git-push", dangerous: true })).toBe(true);
    expect(roleAllowsPlugin(owner, { name: "files-edit", mutating: true })).toBe(true);
  });
});

describe("IDENTITY-12.a: owner runs on GitHub go through the same must-ask gate", () => {
  test("the owner's must-ask call raises the owner's Approve card and runs only on approval", async () => {
    await becomeWatchRun({ actingRole: "owner", actingGithubId: OWNER_GH, actingGithubLogin: "0xLeif" });
    const approved = answerMustAsk("approved");
    try {
      const r = await runPlugin({ name: PROD_TOOL.name, args: ["--to", "main"] });
      expect(r.ok).toBe(true);
      expect(approved.requests).toHaveLength(1);
      const card = approved.requests[0]!;
      expect(card.kind).toBe(MUST_ASK_PROD_KIND);
      expect(card.title).toContain("from watch:watch_w1");
      expect(ran).toEqual([[PROD_TOOL.name, "--to", "main"]]);
    } finally {
      approved.restore();
    }

    const denied = answerMustAsk("denied");
    try {
      const r = await runPlugin({ name: PROD_TOOL.name, args: ["--to", "prod"] });
      expect(r.ok).toBe(false);
      expect(r.error).toContain("the owner denied it on Approve card");
      expect(denied.requests).toHaveLength(1);
      expect(ran).toHaveLength(1);
    } finally {
      denied.restore();
    }
  });

  test("team and community runs never reach the card for an owner-only tool", async () => {
    for (const who of [
      { actingRole: "team" as const, actingGithubId: TOFU_GH },
      { actingRole: "community" as const, actingGithubId: STRANGER_GH },
      { actingRole: "community" as const, actingGithubId: SQUATTER_GH, actingGithubLogin: "0xLeif" },
    ]) {
      await becomeWatchRun(who);
      const asked = answerMustAsk("approved");
      try {
        const r = await runPlugin({ name: PROD_TOOL.name, args: ["--to", "main"] });
        expect(r.ok).toBe(false);
        expect(r.error).toContain(ROLE_REFUSED_MESSAGE);
        expect(asked.requests).toHaveLength(0);
      } finally {
        asked.restore();
      }
    }
    expect(ran).toEqual([]);
  });
});

describe("IDENTITY-12.a: WATCH-specific limits stay for every role", () => {
  test("secret paths stay hidden on GitHub, the owner's included; the owner's Discord run keeps them", async () => {
    await becomeWatchRun({ actingRole: "owner", actingGithubId: OWNER_GH });
    expect(await resolveActingRole()).toBe("owner");
    expect(await secretPathsRefused()).toBe(true);
    process.env.CORVIDINHO_ACTING_SURFACE = "chat";
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = OWNER_DC;
    delete process.env.CORVIDINHO_WATCH_SESSION_ID;
    expect(await secretPathsRefused()).toBe(false);
  });

  test("the owner's WATCH run never gets the shell (SAFE-3.a); its delegate workers are community", async () => {
    await becomeWatchRun({ actingRole: "owner", actingGithubId: OWNER_GH });
    const gate = await shellToolsGate({ env: process.env, cwd: dir });
    expect(gate.granted).toBe(false);
    const { env } = buildDelegateSpawn({
      bin: "corvidinho",
      taskText: "sub",
      tier: "code",
      childDepth: 1,
      allowlist: [],
      baseEnv: process.env,
    });
    expect(await resolveActingRole(env)).toBe("community");
  });
});
