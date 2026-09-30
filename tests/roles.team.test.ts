/**
 * IDENTITY-8..12 / ADMIN-3.b — three roles gate every tool (#65).
 *
 * - IDENTITY-8: each declared person has exactly one role (owner, team or
 *   community), read from `role` in the owner's people list; only the owner
 *   sets it (the file on the VM or audited `/admin people role`, ADMIN-3.b).
 * - IDENTITY-9: the owner keeps every tool (unchanged ROLES-CHAT-4).
 * - IDENTITY-10: team gets work tasks (file edits in a /work run, the /work
 *   PR), reviews (issue/PR comments and reviews, allowlisted repos only) and
 *   only their own memory.
 * - IDENTITY-11: community gets read/chat tools only, never a mutating tool.
 * - IDENTITY-12: the role is resolved in the tool layer (runPlugin + the
 *   catalog) on every call and surface; a surface's stamp can only lower it,
 *   and anyone undeclared is community at most.
 *
 * Fixture files, dry-run GitHub, a scripted LLM, fake spawn bins and the
 * slash handlers directly; no token, no network.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskExecute } from "../src/agent/execute.ts";
import { buildOpenAiTools } from "../src/agent/tools.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import type { AgentClient, AgentRunChatOpts } from "../src/discord/agent-client.ts";
import { createSpawnAgentClient } from "../src/discord/agent-client.ts";
import { handleAdminCommand } from "../src/discord/command-handlers/admin.ts";
import { handleSessionCommand } from "../src/discord/command-handlers/session.ts";
import { handleWorkCommand } from "../src/discord/command-handlers/work.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { resolveDiscordActingRole } from "../src/discord/permissions.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import type { SlashContext, SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { NOT_AUTHORIZED } from "../src/discord/types.ts";
import type { OwnerRecord } from "../src/identity/owner.ts";
import {
  buildPeopleDirectory,
  parsePeopleJson,
  parsePeopleToml,
  resolvePerson,
  roleOfPerson,
} from "../src/identity/people.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { checkRepoGateForActingRole } from "../src/plugins/githubPublic.ts";
import { isMutatingPlugin } from "../src/plugins/mutating.ts";
import { clearRegistry, list } from "../src/plugins/registry.ts";
import {
  ACTING_ROLE_ENV,
  ACTING_WORK_TASK_ENV,
  ROLE_REFUSED_MESSAGE,
  TEAM_REVIEW_TOOLS,
  TEAM_WORK_TOOLS,
  resolveActingRole,
  roleAllowsPlugin,
} from "../src/plugins/roles.ts";
import { runPlugin } from "../src/plugins/run.ts";
import type { WorkPrOutcome } from "../src/work/pr.ts";

const OWNER_ID = "181969874455756800";
const TOFU = "200000000000000002"; // team
const KYN = "300000000000000003"; // declared community
const GASPAR = "400000000000000004"; // declared, no role key
const STRANGER = "500000000000000005"; // undeclared
const CHAN = "600000000000000006";
const REPO = "CorvidLabs/Corvidinho";
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
  return `[github]
repos = ["${REPO}"]

[discord]
channels = ["${CHAN}"]
users = []
roles = []
deny_users = []

[owner]
discord_id = "${OWNER_ID}"
display = "Leif"

${people}`;
}

/** Keys a test may set; restored after each test. */
const KEYS = [
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  ACTING_ROLE_ENV,
  ACTING_WORK_TASK_ENV,
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_ALLOWLIST",
  "CORVIDINHO_MEMORY_INMEM",
  "CORVIDINHO_GITHUB_DRY_RUN",
  "CORVIDINHO_GITHUB_ALLOW_REPOS",
  "CORVIDINHO_GITHUB_ALLOW_ORGS",
  "CORVIDINHO_GITHUB_ALLOW_USERS",
  "CORVIDINHO_GITHUB_DENY_REPOS",
  "CORVIDINHO_GITHUB_DENY_ORGS",
  "DISCORD_MUTED_USER_IDS",
  "GITHUB_TOKEN",
  "GH_TOKEN",
] as const;

let saved: Record<string, string | undefined> = {};
let dir = "";
let path = "";

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  dir = mkdtempSync(join(tmpdir(), "corvidinho-roles-team-"));
  path = join(dir, "allowlist.toml");
  writeFileSync(path, fileText());
  process.env.CORVIDINHO_ALLOWLIST_FILE = path;
  process.env.CORVIDINHO_MEMORY_INMEM = "1";
  clearRegistry();
  loadBuiltins();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  clearRegistry();
  rmSync(dir, { recursive: true, force: true });
});

/** A Discord role session as the bridge stamps it. */
function session(actor: string, opts: { admin?: boolean; role?: string; work?: boolean } = {}): void {
  process.env.CORVIDINHO_ACTING_IS_ADMIN = opts.admin ? "1" : "0";
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = actor;
  if (opts.role !== undefined) process.env[ACTING_ROLE_ENV] = opts.role;
  else delete process.env[ACTING_ROLE_ENV];
  process.env[ACTING_WORK_TASK_ENV] = opts.work ? "1" : "0";
}

function names(opts: Parameters<typeof buildOpenAiTools>[0]): Set<string> {
  return new Set(buildOpenAiTools(opts).map((t) => t.function.name));
}

const MUTATING = () => list().filter((e) => isMutatingPlugin(e)).map((e) => e.name);
const EVERY_DANGEROUS = () => new Set(list().filter((e) => e.dangerous).map((e) => e.name));

describe("IDENTITY-8: one role per declared person, read from the owner's list", () => {
  test("role = team / community (any case), no role ⇒ community, undeclared ⇒ community; TOML and JSON", () => {
    const dirT = buildPeopleDirectory(parsePeopleToml(PEOPLE.replace('role = "team"', 'role = "Team"')), OWNER);
    expect(resolvePerson(dirT, { discordId: TOFU })?.role).toBe("team");
    expect(resolvePerson(dirT, { discordId: KYN })?.role).toBe("community");
    expect(resolvePerson(dirT, { discordId: GASPAR })?.role).toBeUndefined();
    expect(roleOfPerson(resolvePerson(dirT, { discordId: GASPAR }))).toBe("community");
    expect(roleOfPerson(resolvePerson(dirT, { discordId: STRANGER }))).toBe("community");
    expect(roleOfPerson(resolvePerson(dirT, { discordId: OWNER_ID }))).toBe("owner");
    expect(dirT.issues).toEqual([]);

    const dirJ = buildPeopleDirectory(
      parsePeopleJson({ people: { tofu: { role: "team", discord_ids: [TOFU] }, kyn: { discord_ids: [KYN] } } }),
      OWNER,
    );
    expect(roleOfPerson(resolvePerson(dirJ, { discordId: TOFU }))).toBe("team");
    expect(roleOfPerson(resolvePerson(dirJ, { discordId: KYN }))).toBe("community");
  });

  test("exactly one role: a list, an unknown value or a JSON array makes the entry unreadable (skipped whole)", () => {
    for (const bad of ['role = ["team", "community"]', 'role = "admin"', 'role = ""']) {
      const d = buildPeopleDirectory(parsePeopleToml(`[people.tofu]\n${bad}\ndiscord_ids = ["${TOFU}"]\n`), OWNER);
      expect(resolvePerson(d, { discordId: TOFU })).toBeNull();
      expect(roleOfPerson(resolvePerson(d, { discordId: TOFU }))).toBe("community");
      expect(d.issues.join("\n")).toContain('person "tofu"');
      expect(d.issues.join("\n")).not.toContain(TOFU);
    }
    const j = parsePeopleJson({ people: { tofu: { role: ["team"], discord_ids: [TOFU] } } });
    expect(j.people).toEqual([]);
    expect(j.invalid).toEqual(["tofu"]);
  });

  test("the owner role is the configured owner's only: role = owner elsewhere is community; the owner's person stays owner", () => {
    const d = buildPeopleDirectory(
      parsePeopleToml(`[people.tofu]\nrole = "owner"\ndiscord_ids = ["${TOFU}"]\n\n[people.leif]\nrole = "community"\ndiscord_ids = ["${OWNER_ID}"]\n`),
      OWNER,
    );
    expect(roleOfPerson(resolvePerson(d, { discordId: TOFU }))).toBe("community");
    expect(roleOfPerson(resolvePerson(d, { discordId: OWNER_ID }))).toBe("owner");
    expect(d.issues.join("\n")).toContain('person "tofu": role owner comes only from [owner] / env (IDENTITY-1) — treated as community');
    expect(d.issues.join("\n")).toContain('person "leif" holds the owner\'s Discord id, so its role is owner');
    // No owner configured: nobody is owner, whatever the file says.
    const none = buildPeopleDirectory(parsePeopleToml(`[people.tofu]\nrole = "owner"\ndiscord_ids = ["${TOFU}"]\n`), null);
    expect(roleOfPerson(resolvePerson(none, { discordId: TOFU }))).toBe("community");
  });
});

describe("IDENTITY-12: the tool layer resolves the role on every call", () => {
  test("owner, team and community from the live file; the surface stamp only lowers; no role session ⇒ null", async () => {
    expect(await resolveActingRole()).toBeNull();
    session(OWNER_ID, { admin: true, role: "owner" });
    expect(await resolveActingRole()).toBe("owner");
    session(TOFU, { role: "team" });
    expect(await resolveActingRole()).toBe("team");
    // Stamp community (WATCH / schedule / worker) or no stamp: community.
    session(TOFU, { role: "community" });
    expect(await resolveActingRole()).toBe("community");
    session(TOFU);
    expect(await resolveActingRole()).toBe("community");
    // A stamp never raises: owner stamp for a team person is team; for the
    // undeclared, declared-community and no-role people it is community.
    session(TOFU, { admin: true, role: "owner" });
    expect(await resolveActingRole()).toBe("team");
    for (const who of [KYN, GASPAR, STRANGER, ""]) {
      session(who, { role: "team" });
      expect(await resolveActingRole()).toBe("community");
    }
  });

  test("a role change in the file applies at the next call; muted or deny-listed team is community; unreadable file ⇒ community", async () => {
    session(TOFU, { role: "team" });
    expect(await resolveActingRole()).toBe("team");
    writeFileSync(path, fileText(PEOPLE.replace('role = "team"', 'role = "community"')));
    expect(await resolveActingRole()).toBe("community");
    writeFileSync(path, fileText());
    expect(await resolveActingRole()).toBe("team");
    process.env.DISCORD_MUTED_USER_IDS = TOFU;
    expect(await resolveActingRole()).toBe("community");
    delete process.env.DISCORD_MUTED_USER_IDS;
    writeFileSync(path, fileText().replace("deny_users = []", `deny_users = ["${TOFU}"]`));
    expect(await resolveActingRole()).toBe("community");
    writeFileSync(path, `${fileText()}\n[github\n`);
    expect(await resolveActingRole()).toBe("community");
  });

  test("roleAllowsPlugin: read tools for all; mutating for the owner; team only its review tools (+ work tools in /work)", () => {
    const every = list();
    for (const e of every) {
      expect(roleAllowsPlugin(null, e)).toBe(true);
      expect(roleAllowsPlugin("owner", e)).toBe(true);
      const mut = isMutatingPlugin(e);
      expect(roleAllowsPlugin("community", e, true)).toBe(!mut);
      expect(roleAllowsPlugin("team", e)).toBe(!mut || TEAM_REVIEW_TOOLS.has(e.name));
      expect(roleAllowsPlugin("team", e, true)).toBe(!mut || TEAM_REVIEW_TOOLS.has(e.name) || TEAM_WORK_TOOLS.has(e.name));
    }
    expect([...TEAM_REVIEW_TOOLS].sort()).toEqual(["github-issue-comment", "github-pr-review"]);
    // AGENT-18 / AGENT-18.a: working the repo's SpecSync change is team work too.
    expect([...TEAM_WORK_TOOLS].sort()).toEqual([
      "files-edit",
      "files-write",
      "specsync-change-answer",
      "specsync-change-approve",
      "specsync-change-finalize",
      "specsync-change-new",
    ]);
  });
});

describe("IDENTITY-9..11: the catalog by role", () => {
  test("owner = every allowlisted tool (unchanged); team = read + reviews (+ file edits in /work); community = read only (unchanged)", () => {
    const allowlist = EVERY_DANGEROUS();
    const legacyAdmin = names({ tier: "code", allowlist, actingIsAdmin: true, autonomous: true });
    const legacyNonAdmin = names({ tier: "code", allowlist, actingIsAdmin: false, autonomous: true });
    expect(names({ tier: "code", allowlist, actingRole: "owner", autonomous: true })).toEqual(legacyAdmin);
    expect(names({ tier: "code", allowlist, actingRole: null, autonomous: true })).toEqual(legacyAdmin);
    const community = names({ tier: "code", allowlist, actingRole: "community", workTask: true, autonomous: true });
    expect(community).toEqual(legacyNonAdmin);
    for (const m of MUTATING()) expect(community.has(m)).toBe(false);

    const team = names({ tier: "code", allowlist, actingRole: "team", autonomous: true });
    expect(team.has("github-issue-comment")).toBe(true);
    expect(team.has("github-pr-review")).toBe(true);
    expect(team.has("files-read")).toBe(true);
    expect(team.has("memory-store")).toBe(true);
    expect(team.has("memory-recall")).toBe(true);
    for (const no of [
      "files-write",
      "files-edit",
      "files-delete",
      "shell-exec",
      "git-commit",
      "git-push",
      "github-pr-create",
      "github-issue-create",
      "discord-post-message",
      "discord-send-file",
      "memory-forget",
      "memory-override",
      "web-fetch",
      "delegate",
      "council",
    ]) {
      expect(team.has(no)).toBe(false);
    }
    const teamWork = names({ tier: "code", allowlist, actingRole: "team", workTask: true, autonomous: true });
    // The approve and finalize steps are never offered (the run takes them itself, AGENT-18.a).
    expect([...teamWork].filter((n) => !team.has(n)).sort()).toEqual([
      "files-edit",
      "files-write",
      "specsync-change-answer",
      "specsync-change-new",
    ]);
    // SAFE-1 still applies to team: an unallowlisted review tool is not offered.
    expect(names({ tier: "code", actingRole: "team" }).has("github-pr-review")).toBe(false);
  });

  test("the tool loop builds each run's catalog from the role resolved now (team chat, team /work, community)", async () => {
    const bodies: unknown[] = [];
    const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const offered = (n: number) =>
      ((bodies[n] as { tools?: { function: { name: string } }[] }).tools ?? []).map((t) => t.function.name);
    const run = async (actor: string, extra: Record<string, string>) => {
      const exec = createTaskExecute({
        taskText: "review PR 12",
        cwd: dir,
        env: {
          CORVIDINHO_LLM_API_KEY: "test-key-not-real",
          CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
          CORVIDINHO_LLM_MODEL: "test-model",
          CORVIDINHO_ALLOWLIST_FILE: path,
          CORVIDINHO_ACTING_IS_ADMIN: "0",
          CORVIDINHO_ACTING_DISCORD_USER_ID: actor,
          ...extra,
        },
        tier: "code",
        allowlist: ["github-issue-comment", "github-pr-review", "github-pr-create"],
        fetchImpl,
        projectInstructions: false,
        maxToolRounds: 2,
      });
      await exec({ attempt: 1, signal: new AbortController().signal });
    };
    await run(TOFU, { [ACTING_ROLE_ENV]: "team", [ACTING_WORK_TASK_ENV]: "0" });
    await run(TOFU, { [ACTING_ROLE_ENV]: "team", [ACTING_WORK_TASK_ENV]: "1" });
    await run(TOFU, { [ACTING_ROLE_ENV]: "community" });
    await run(STRANGER, { [ACTING_ROLE_ENV]: "team" });
    expect(offered(0)).toContain("github-pr-review");
    expect(offered(0)).toContain("github-issue-comment");
    expect(offered(0)).not.toContain("github-pr-create");
    expect(offered(0)).not.toContain("files-write");
    expect(offered(1)).toContain("files-write");
    expect(offered(1)).toContain("files-edit");
    for (const n of [2, 3]) {
      for (const no of ["github-pr-review", "github-issue-comment", "files-write", "github-pr-create"]) {
        expect(offered(n)).not.toContain(no);
      }
      expect(offered(n)).toContain("files-read");
    }
  });
});

describe("IDENTITY-10/11: runPlugin by role", () => {
  test("team reviews/comments run (dry-run) on an allowlisted repo; other writes get the role refusal", async () => {
    process.env.CORVIDINHO_GITHUB_DRY_RUN = "1";
    session(TOFU, { role: "team" });
    const allowlist = ["github-issue-comment", "github-pr-review", "github-pr-create", "github-issue-create", "files-delete", "shell-exec", "memory-forget", "git-push"];
    const comment = await runPlugin({
      name: "github-issue-comment",
      args: ["12", "--repo", REPO, "--body", "LGTM"],
      nonInteractive: true,
      allowlist,
      cwd: dir,
    });
    expect(comment.ok).toBe(true);
    expect((comment.data as { dryRun?: boolean }).dryRun).toBe(true);
    const review = await runPlugin({
      name: "github-pr-review",
      args: ["12", "--repo", REPO, "--body", "Looks good", "--event", "COMMENT"],
      nonInteractive: true,
      allowlist,
      cwd: dir,
    });
    expect(review.error ?? "").not.toContain(ROLE_REFUSED_MESSAGE);
    expect(review.ok).toBe(true);
    // Reviews on a repo that is not allowlisted: GITHUB-6 refuses (no public path for team writes).
    const elsewhere = await runPlugin({
      name: "github-issue-comment",
      args: ["1", "--repo", "someone/public-thing", "--body", "hi"],
      nonInteractive: true,
      allowlist,
      cwd: dir,
    });
    expect(elsewhere.ok).toBe(false);
    expect(elsewhere.error ?? "").toContain("GITHUB-6");
    for (const name of ["github-pr-create", "github-issue-create", "files-delete", "shell-exec", "memory-forget", "memory-override", "git-push", "files-write", "files-edit", "discord-post-message"]) {
      const r = await runPlugin({ name, args: [], nonInteractive: true, allowlist, cwd: dir });
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(2);
      expect(r.error ?? "").toContain(ROLE_REFUSED_MESSAGE);
    }
  });

  test("team file edits run only in a /work run (SAFE-2 still refuses protected paths); community never", async () => {
    session(TOFU, { role: "team", work: true });
    const w = await runPlugin({ name: "files-write", args: ["notes.txt", "from tofu"], nonInteractive: true, allowlist: [], cwd: dir });
    expect(w.ok).toBe(true);
    expect(readFileSync(join(dir, "notes.txt"), "utf8")).toBe("from tofu");
    const env = await runPlugin({ name: "files-write", args: [".env", "X=1"], nonInteractive: true, allowlist: [], cwd: dir });
    expect(env.ok).toBe(false);
    expect(env.error ?? "").not.toContain(ROLE_REFUSED_MESSAGE);
    expect(existsSync(join(dir, ".env"))).toBe(false);

    session(TOFU, { role: "team", work: false });
    const chat = await runPlugin({ name: "files-write", args: ["chat.txt", "x"], nonInteractive: true, allowlist: [], cwd: dir });
    expect(chat.error ?? "").toContain(ROLE_REFUSED_MESSAGE);
    expect(existsSync(join(dir, "chat.txt"))).toBe(false);

    for (const who of [KYN, GASPAR, STRANGER]) {
      session(who, { role: "team", work: true });
      const r = await runPlugin({ name: "files-write", args: ["c.txt", "x"], nonInteractive: true, allowlist: [], cwd: dir });
      expect(r.error ?? "").toContain(ROLE_REFUSED_MESSAGE);
      const c = await runPlugin({
        name: "github-issue-comment",
        args: ["12", "--repo", REPO, "--body", "hi"],
        nonInteractive: true,
        allowlist: ["github-issue-comment"],
        cwd: dir,
      });
      expect(c.error ?? "").toContain(ROLE_REFUSED_MESSAGE);
    }
    expect(existsSync(join(dir, "c.txt"))).toBe(false);
  });

  test("team reviews post as COMMENT: APPROVE and REQUEST_CHANGES stay the owner's (IDENTITY-10)", async () => {
    process.env.CORVIDINHO_GITHUB_DRY_RUN = "1";
    const allowlist = ["github-pr-review"];
    const review = (event: string) =>
      runPlugin({
        name: "github-pr-review",
        args: ["12", "--repo", REPO, "--body", "Reviewed", "--event", event],
        nonInteractive: true,
        allowlist,
        cwd: dir,
      });
    session(TOFU, { role: "team" });
    expect((await review("COMMENT")).ok).toBe(true);
    for (const event of ["APPROVE", "approve", "REQUEST_CHANGES"]) {
      const r = await review(event);
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(2);
      expect(r.error ?? "").toContain(ROLE_REFUSED_MESSAGE);
      expect(r.error ?? "").toContain("IDENTITY-10");
    }
    session(OWNER_ID, { admin: true, role: "owner" });
    for (const event of ["APPROVE", "REQUEST_CHANGES", "COMMENT"]) {
      const r = await review(event);
      expect(r.ok).toBe(true);
      expect((r.data as { event?: string }).event).toBe(event);
    }
  });

  test("a team /work run never writes or edits a secret-looking path; the owner still can (ROLES-CHAT-8)", async () => {
    writeFileSync(join(dir, "credentials.json"), '{"token":"abc123"}');
    session(TOFU, { role: "team", work: true });
    for (const p of ["credentials.json", "id_rsa", "deploy.pem", ".ssh/config"]) {
      const w = await runPlugin({ name: "files-write", args: [p, "x"], nonInteractive: true, allowlist: [], cwd: dir });
      expect(w.ok).toBe(false);
      expect(w.exitCode).toBe(2);
      expect(w.error ?? "").toContain("ROLES-CHAT-8");
    }
    // files-edit is not a read oracle for a secret file.
    const probe = await runPlugin({
      name: "files-edit",
      args: ["credentials.json", "--old", "abc", "--new", "abc"],
      nonInteractive: true,
      allowlist: [],
      cwd: dir,
    });
    expect(probe.ok).toBe(false);
    expect(probe.error ?? "").toContain("ROLES-CHAT-8");
    expect(probe.error ?? "").not.toContain("no match");
    expect(readFileSync(join(dir, "credentials.json"), "utf8")).toBe('{"token":"abc123"}');
    expect(existsSync(join(dir, "id_rsa"))).toBe(false);
    session(OWNER_ID, { admin: true, role: "owner", work: true });
    const own = await runPlugin({
      name: "files-edit",
      args: ["credentials.json", "--old", "abc123", "--new", "rotated"],
      nonInteractive: true,
      allowlist: [],
      cwd: dir,
    });
    expect(own.ok).toBe(true);
    expect(readFileSync(join(dir, "credentials.json"), "utf8")).toBe('{"token":"rotated"}');
  });

  test("a demotion in the file refuses the team member's next call (IDENTITY-12)", async () => {
    process.env.CORVIDINHO_GITHUB_DRY_RUN = "1";
    session(TOFU, { role: "team" });
    const args = ["12", "--repo", REPO, "--body", "LGTM"];
    const opts = { name: "github-issue-comment", args, nonInteractive: true, allowlist: ["github-issue-comment"], cwd: dir };
    expect((await runPlugin(opts)).ok).toBe(true);
    writeFileSync(path, fileText(PEOPLE.replace('role = "team"', 'role = "community"')));
    const after = await runPlugin(opts);
    expect(after.ok).toBe(false);
    expect(after.error ?? "").toContain(ROLE_REFUSED_MESSAGE);
  });

  test("team memory is their own: store/recall in their scope, never forget/override (MEMORY-ACL)", async () => {
    // The preload's scratch data dir (one DB for the calls below).
    delete process.env.CORVIDINHO_MEMORY_INMEM;
    const fact = `likes tabs ${Date.now()}`;
    session(TOFU, { role: "team" });
    const stored = await runPlugin({ name: "memory-store", args: ["--category", "person", "--key", "pref", fact], nonInteractive: true, allowlist: [], cwd: dir });
    expect(stored.ok).toBe(true);
    const mine = await runPlugin({ name: "memory-recall", args: ["--category", "person"], nonInteractive: true, allowlist: [], cwd: dir, json: true });
    expect(JSON.stringify(mine.data)).toContain(fact);
    session(KYN, { role: "team" });
    const theirs = await runPlugin({ name: "memory-recall", args: ["--category", "person"], nonInteractive: true, allowlist: [], cwd: dir, json: true });
    expect(theirs.ok).toBe(true);
    expect(JSON.stringify(theirs.data ?? "")).not.toContain(fact);
    session(TOFU, { role: "team" });
    for (const name of ["memory-forget", "memory-override"]) {
      const r = await runPlugin({ name, args: ["--id", "x"], nonInteractive: true, allowlist: [name], cwd: dir });
      expect(r.error ?? "").toContain(ROLE_REFUSED_MESSAGE);
    }
  });

  test("GitHub repo gate by role: team reads allowlisted or public, writes allowlisted only; community writes refused", async () => {
    const lookup = (vis: "public" | "private") => ({ visibilityLookup: async () => vis });
    session(TOFU, { role: "team" });
    expect((await checkRepoGateForActingRole(REPO, { write: true })).ok).toBe(true);
    expect((await checkRepoGateForActingRole("someone/pub", { ...lookup("public") })).ok).toBe(true);
    expect((await checkRepoGateForActingRole("someone/priv", { ...lookup("private") })).ok).toBe(false);
    const w = await checkRepoGateForActingRole("someone/pub", { ...lookup("public"), write: true });
    expect(w.ok).toBe(false);
    session(STRANGER, { role: "team" });
    expect((await checkRepoGateForActingRole("someone/pub", { ...lookup("public") })).ok).toBe(true);
    const cw = await checkRepoGateForActingRole(REPO, { ...lookup("public"), write: true });
    expect(cw.ok).toBe(false);
    if (!cw.ok) expect(cw.error).toContain(ROLE_REFUSED_MESSAGE);
    // Deny lists still win for team.
    writeFileSync(path, fileText().replace(`repos = ["${REPO}"]`, `repos = ["${REPO}"]\ndeny_repos = ["${REPO}"]`));
    session(TOFU, { role: "team" });
    expect((await checkRepoGateForActingRole(REPO, { write: true })).ok).toBe(false);
  });
});

describe("IDENTITY-12 on Discord surfaces: the role a run is spawned with", () => {
  test("resolveDiscordActingRole: owner, team, community; muted / deny-listed team is community", () => {
    const allowlist = emptyConfig();
    allowlist.discord.channels = [CHAN];
    const people = buildPeopleDirectory(parsePeopleToml(PEOPLE), OWNER);
    const role = (userId: string, mutedUsers?: Set<string>) =>
      resolveDiscordActingRole({ userId, allowlist, owner: OWNER, people, mutedUsers });
    expect(role(OWNER_ID)).toBe("owner");
    expect(role(TOFU)).toBe("team");
    expect(role(KYN)).toBe("community");
    expect(role(GASPAR)).toBe("community");
    expect(role(STRANGER)).toBe("community");
    expect(role(TOFU, new Set([TOFU]))).toBe("community");
    allowlist.discord.denyUsers = [TOFU];
    expect(role(TOFU)).toBe("community");
    expect(resolveDiscordActingRole({ userId: TOFU, allowlist: emptyConfig(), owner: OWNER })).toBe("community");
  });

  test("the spawn env stamps owner / team / community and the /work flag, never inherited", async () => {
    const bin = join(dir, "fake-cli.ts");
    writeFileSync(
      bin,
      'const e = process.env; console.log(`admin=[${e.CORVIDINHO_ACTING_IS_ADMIN}] role=[${e.CORVIDINHO_ACTING_ROLE ?? "unset"}] work=[${e.CORVIDINHO_ACTING_WORK_TASK ?? "unset"}]`);\n',
    );
    // A stale role in the parent (bridge) env never reaches the child.
    process.env[ACTING_ROLE_ENV] = "team";
    process.env[ACTING_WORK_TASK_ENV] = "1";
    const client = createSpawnAgentClient({ bin, cwd: dir });
    const out = async (o: Partial<AgentRunChatOpts>) =>
      (await client.runChat({ prompt: "hi", sessionId: "s", actingUserId: "u", ...o })).summary;
    expect(await out({ actingIsAdmin: true })).toContain("admin=[1] role=[owner] work=[0]");
    expect(await out({ actingIsAdmin: false, actingRole: "team" })).toContain("admin=[0] role=[team] work=[0]");
    expect(await out({ actingIsAdmin: false, actingRole: "team", workTask: true })).toContain("admin=[0] role=[team] work=[1]");
    // Schedules pass no role: community.
    expect(await out({ actingIsAdmin: false })).toContain("admin=[0] role=[community] work=[0]");
    expect(await out({ actingIsAdmin: false, actingRole: "community", workTask: true })).toContain("role=[community] work=[1]");
  });
});

describe("Discord chat stamps the speaker's role, re-read live (IDENTITY-12)", () => {
  test("owner, team and community speakers; a role change in the file applies to the next message", async () => {
    const seen: AgentRunChatOpts[] = [];
    const agent: AgentClient = {
      async runChat(o) {
        seen.push(o);
        return { ok: true, sessionId: o.sessionId, summary: "done", exitCode: 0 };
      },
    };
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    const result = await startBridge({
      env: { DISCORD_BOT_TOKEN: "fake", CORVIDINHO_DISCORD_DRY_RUN: "1", CORVIDINHO_ALLOWLIST_FILE: path, HOME: dir },
      projectRoot: mkdtempSync(join(dir, "proj-")),
      skipProtocolCheck: true,
      disableScheduler: true,
      thinkingOutbound: memoryThinkingOutbound(),
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent,
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        let n = 0;
        handlers.reply = async () => {
          n += 1;
          return { messageId: `bot-reply-${n}` };
        };
        return createNullGateway();
      },
    });
    if (result.ok !== true || !box.handlers) throw new Error("bridge did not start");
    try {
      let m = 0;
      const say = async (authorId: string) => {
        m += 1;
        await box.handlers!.onMessage({
          id: `m${m}`,
          channelId: CHAN,
          authorId,
          authorBot: false,
          content: `<@999> hello ${m}`,
          mentionedBot: true,
        });
        return seen.at(-1)!;
      };
      expect(await say(TOFU)).toMatchObject({ actingRole: "team", actingIsAdmin: false });
      expect((await say(TOFU)).workTask).toBeUndefined();
      expect(await say(OWNER_ID)).toMatchObject({ actingRole: "owner", actingIsAdmin: true });
      for (const who of [KYN, GASPAR, STRANGER]) {
        expect(await say(who)).toMatchObject({ actingRole: "community", actingIsAdmin: false });
      }
      writeFileSync(path, fileText(PEOPLE.replace('role = "team"', 'role = "community"')));
      expect(await say(TOFU)).toMatchObject({ actingRole: "community" });
    } finally {
      await result.stop();
    }
  });
});

describe("/work and /session start by role (IDENTITY-10/11)", () => {
  function ctxFor(store: SessionStore, agent: AgentClient, openPr: SlashContext["openWorkPr"]): SlashContext {
    const allow = emptyConfig();
    allow.discord.channels = [CHAN];
    allow.sourcePath = path;
    return {
      store,
      workStore: new WorkStore(),
      allowlist: allow,
      agent,
      version: "0.0.0",
      protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
      startedAt: Date.now(),
      channelIds: [CHAN],
      openWorkPr: openPr,
      owner: OWNER,
    };
  }

  function ix(commandName: string, userId: string, options: SlashInteraction["options"]) {
    const edits: SlashReplyPayload[] = [];
    const interaction: SlashInteraction = {
      id: "ix",
      commandName,
      channelId: CHAN,
      userId,
      options,
      reply: async (p) => {
        edits.push(p);
      },
      deferReply: async () => {},
      editReply: async (p) => {
        edits.push(p);
      },
    };
    if (commandName === "session") interaction.subcommand = "start";
    return { interaction, edits };
  }

  async function work(userId: string) {
    const store = new SessionStore({ defaultProjectRoot: mkdtempSync(join(dir, "proj-")) });
    const seen: AgentRunChatOpts[] = [];
    const agent: AgentClient = {
      runChat: async (o) => {
        seen.push(o);
        return { ok: true, sessionId: o.sessionId, summary: "did it", exitCode: 0, task: { verified: true, verifySkipped: false, state: "done" } };
      },
    };
    let prCalls = 0;
    const openPr = async (): Promise<WorkPrOutcome> => {
      prCalls += 1;
      return { opened: false, reason: "not-allowed", line: "PR: fixture line" };
    };
    const { interaction, edits } = ix("work", userId, { description: "Add greeting" });
    await handleWorkCommand(ctxFor(store, agent, openPr), interaction);
    return { seen, prCalls, body: edits.at(-1)?.content ?? "" };
  }

  test("a team member's /work runs with team + the work flag and reaches the PR step", async () => {
    const t = await work(TOFU);
    expect(t.seen[0]).toMatchObject({ actingIsAdmin: false, actingRole: "team", workTask: true, actingUserId: TOFU });
    expect(t.prCalls).toBe(1);
    expect(t.body).toContain("PR: fixture line");
  });

  test("the owner's /work is unchanged; community and undeclared can't start it, so never reach the PR step (IDENTITY-11.a)", async () => {
    const o = await work(OWNER_ID);
    expect(o.seen[0]).toMatchObject({ actingIsAdmin: true, actingRole: "owner", workTask: true });
    expect(o.prCalls).toBe(1);
    for (const who of [KYN, GASPAR, STRANGER]) {
      const c = await work(who);
      expect(c.seen).toHaveLength(0);
      expect(c.prCalls).toBe(0);
      expect(c.body).toBe(NOT_AUTHORIZED);
    }
  });

  test("a team member demoted during the run gets no PR", async () => {
    const store = new SessionStore({ defaultProjectRoot: mkdtempSync(join(dir, "proj-")) });
    const agent: AgentClient = {
      runChat: async (o) => {
        writeFileSync(path, fileText(PEOPLE.replace('role = "team"', 'role = "community"')));
        return { ok: true, sessionId: o.sessionId, summary: "did it", exitCode: 0 };
      },
    };
    let prCalls = 0;
    const openPr = async (): Promise<WorkPrOutcome> => {
      prCalls += 1;
      return { opened: false, reason: "not-allowed", line: "PR: fixture" };
    };
    const { interaction, edits } = ix("work", TOFU, { description: "x" });
    await handleWorkCommand(ctxFor(store, agent, openPr), interaction);
    expect(prCalls).toBe(0);
    expect(edits.at(-1)?.content ?? "").toContain("only the owner (ADMIN) can ship /work as a PR");
  });

  test("/session start stamps the invoker's role (no work flag)", async () => {
    for (const [who, role] of [[TOFU, "team"], [OWNER_ID, "owner"], [STRANGER, "community"]] as const) {
      const store = new SessionStore({ defaultProjectRoot: mkdtempSync(join(dir, "proj-")) });
      const seen: AgentRunChatOpts[] = [];
      const agent: AgentClient = {
        runChat: async (o) => {
          seen.push(o);
          return { ok: true, sessionId: o.sessionId, summary: "hi", exitCode: 0 };
        },
      };
      const { interaction } = ix("session", who, { topic: "hello" });
      await handleSessionCommand(ctxFor(store, agent, undefined), interaction);
      expect(seen[0]?.actingRole).toBe(role);
      expect(seen[0]?.workTask).toBeUndefined();
    }
  });
});

describe("ADMIN-3.b: only the owner sets a role, with /admin people role (audited)", () => {
  type Row = { action: string; outcome: string; actor: string };
  function adminCtx(rows: Row[] | null): SlashContext {
    const allow = emptyConfig();
    allow.discord.channels = [CHAN];
    allow.sourcePath = path;
    return {
      store: new SessionStore({ defaultProjectRoot: dir }),
      workStore: new WorkStore(),
      allowlist: allow,
      agent: { runChat: async (o) => ({ ok: true, sessionId: o.sessionId, summary: "", exitCode: 0 }) },
      version: "0.0.0",
      protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
      startedAt: Date.now(),
      channelIds: [CHAN],
      owner: OWNER,
      env: { CORVIDINHO_ALLOWLIST_FILE: path },
      ...(rows
        ? {
            recordAudit: (e: { action: string; outcome: string; actor?: string }) => {
              rows.push({ action: e.action, outcome: e.outcome, actor: e.actor ?? "" });
              return { seq: rows.length };
            },
          }
        : {}),
    } as SlashContext;
  }
  async function admin(ctx: SlashContext, userId: string, sub: string, options: SlashInteraction["options"]) {
    const replies: SlashReplyPayload[] = [];
    await handleAdminCommand(ctx, {
      id: "ix",
      commandName: "admin",
      subcommandGroup: sub === "show" ? "config" : "people",
      subcommand: sub,
      channelId: CHAN,
      userId,
      options,
      reply: async (p) => {
        replies.push(p);
      },
    });
    return replies[0]?.content ?? "";
  }
  const personRole = (id: string) =>
    roleOfPerson(resolvePerson(buildPeopleDirectory(parsePeopleToml(readFileSync(path, "utf8")), OWNER), { discordId: id }));

  test("owner promotes and demotes: the file gets role = …, rows are audited, other text is kept", async () => {
    const rows: Row[] = [];
    const ctx = adminCtx(rows);
    const up = await admin(ctx, OWNER_ID, "role", { person: "gaspar", role: "team" });
    expect(up).toContain('✅ /admin people role: "gaspar" (Gaspar) — role community → team (IDENTITY-8)');
    expect(personRole(GASPAR)).toBe("team");
    expect(readFileSync(path, "utf8")).toContain('[people.gaspar]\ndisplay = "Gaspar"\nrole = "team"\ndiscord_ids');
    expect(rows.map((r) => `${r.action}:${r.outcome}`)).toEqual(["admin-people-role:started", "admin-people-role:ok"]);
    expect(rows.every((r) => r.actor === OWNER_ID)).toBe(true);

    const down = await admin(ctx, OWNER_ID, "role", { person: "tofu", role: "community" });
    expect(down).toContain("role team → community");
    expect(personRole(TOFU)).toBe("community");
    const same = await admin(ctx, OWNER_ID, "role", { person: "tofu", role: "Community" });
    expect(same).toContain('No change: "tofu" already has role community');
    expect(rows.length).toBe(4);
    const text = readFileSync(path, "utf8");
    expect(text).toContain(`[owner]\ndiscord_id = "${OWNER_ID}"`);
    expect(text).toContain(`repos = ["${REPO}"]`);

    // The tool layer sees the new role on the next call, no restart.
    session(GASPAR, { role: "team" });
    expect(await resolveActingRole()).toBe("team");
  });

  test("refused: the owner role, an unknown role, an undeclared person, the owner's own person, a missing role", async () => {
    const rows: Row[] = [];
    const ctx = adminCtx(rows);
    const before = readFileSync(path, "utf8");
    expect(await admin(ctx, OWNER_ID, "role", { person: "tofu", role: "owner" })).toContain("the owner role comes only from [owner] / env");
    expect(await admin(ctx, OWNER_ID, "role", { person: "tofu", role: "admin" })).toContain("role must be one of team or community");
    expect(await admin(ctx, OWNER_ID, "role", { person: "nobody", role: "team" })).toContain('person "nobody" is not declared');
    writeFileSync(path, `${before}\n[people.leif]\ndiscord_ids = ["${OWNER_ID}"]\n`);
    expect(await admin(ctx, OWNER_ID, "role", { person: "leif", role: "community" })).toContain("so its role is always owner");
    expect(await admin(ctx, OWNER_ID, "role", { person: "tofu" })).toContain("usage: /admin people role");
    expect(readFileSync(path, "utf8")).toBe(`${before}\n[people.leif]\ndiscord_ids = ["${OWNER_ID}"]\n`);
    expect(rows.map((r) => r.outcome)).toEqual(["denied", "denied", "denied", "denied"]);
  });

  test("a non-owner (even team) is refused; no audit trail refuses; the file is unchanged", async () => {
    const rows: Row[] = [];
    const before = readFileSync(path, "utf8");
    const out = await admin(adminCtx(rows), TOFU, "role", { person: "tofu", role: "team" });
    expect(out).toContain("not authorized");
    expect(rows).toEqual([{ action: "admin-people-role", outcome: "denied", actor: TOFU }]);
    expect(await admin(adminCtx(null), OWNER_ID, "role", { person: "gaspar", role: "team" })).toContain("audit log unavailable (SAFE-5)");
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  test("people list shows each role; config show counts roles; JSON files work too", async () => {
    const ctx = adminCtx([]);
    const listed = await admin(ctx, OWNER_ID, "list", {});
    expect(listed).toContain(`• tofu · Tofu · Discord <@${TOFU}> — role team`);
    expect(listed).toContain(`• kyn · Kyn · Discord <@${KYN}> — role community`);
    expect(listed).toContain(`• gaspar · Gaspar · Discord <@${GASPAR}> — role community`);
    expect(listed).toContain("— **owner**");
    const show = await admin(ctx, OWNER_ID, "show", {});
    expect(show).toContain("roles: team 1, community 2 (IDENTITY-8)");
    expect(show).toContain("their roles (/admin people role)");

    const jpath = join(dir, "allowlist.json");
    writeFileSync(jpath, JSON.stringify({ discord: { channels: [CHAN] }, owner: { discord_id: OWNER_ID }, people: { tofu: { discord_ids: [TOFU], note: "keep" } } }, null, 2));
    const jctx = adminCtx([]);
    jctx.allowlist.sourcePath = jpath;
    jctx.env = { CORVIDINHO_ALLOWLIST_FILE: jpath };
    expect(await admin(jctx, OWNER_ID, "role", { person: "tofu", role: "team" })).toContain("role community → team");
    const j = JSON.parse(readFileSync(jpath, "utf8"));
    expect(j.people.tofu).toEqual({ role: "team", discord_ids: [TOFU], note: "keep" });
  });
});
