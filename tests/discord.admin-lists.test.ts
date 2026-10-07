/**
 * ADMIN-3.c (part 1) — "As owner I can change deny lists, mutes and the
 * GitHub repo allow lists with /admin; every change is audited." This file
 * covers the deny lists and the GitHub repo allow lists (mutes are part 2):
 *
 * - The allowlist writer edits every list key the loader reads — `[discord]`
 *   users, channels, deny_channels, deny_users, deny_roles and `[github]`
 *   orgs, repos, deny_orgs, deny_repos, deny_users — under the spelling the
 *   loader reads for aliases, keeps every other key ([owner],
 *   [corvidinho.plugins], people …), and splices the live config in place.
 * - `/admin deny add|remove` (exactly one of channel, user, role, github_org,
 *   github_repo, github_user) and `/admin github add|remove` (org or repo):
 *   handler-time owner re-check, input validation, env-only and lockout
 *   refusals, SAFE-5 rows `admin-deny-*` / `admin-github-*`
 *   (started / ok / denied), fail closed without a trail.
 * - `/admin config show` lists them, `[github].users` read-only.
 *
 * Fixture tests only: temp allowlist files, in-memory SQLite, no Discord
 * token or network.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isRepoAllowed } from "../src/allowlist/github.ts";
import { loadAllowlist } from "../src/allowlist/load.ts";
import type { AllowlistConfig } from "../src/allowlist/types.ts";
import { appendAudit } from "../src/audit/index.ts";
import { parseExtrasSettings, parseExtrasSettingsJson } from "../src/autonomous/enabled.ts";
import type { OwnerRecord } from "../src/identity/owner.ts";
import * as writer from "../src/discord/admin-allowlist.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import { handleAdminCommand } from "../src/discord/command-handlers/admin.ts";
import { gateActor, gateChannel } from "../src/discord/permissions.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import {
  buildSlashCommandBodies,
  OPT_STRING,
  OPT_SUB_COMMAND,
  OPT_SUB_COMMAND_GROUP,
  OPT_USER,
  type SlashOptionDef,
} from "../src/discord/slash-commands.ts";
import { handleSlashInteraction } from "../src/discord/slash-dispatch.ts";
import type { SlashContext, SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import { NOT_AUTHORIZED } from "../src/discord/types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { migrateCorvidinhoDb } from "../src/store/db.ts";

/** Discord option type ROLE (the role picker; the value is the role id). */
const ROLE = 8;

const OWNER_ID = "100000000000000001";
const OTHER_ID = "200000000000000002";
const CHAN_A = "300000000000000003";
const CHAN_B = "400000000000000004";
const ROLE_X = "600000000000000006";
const ROLE_MINE = "700000000000000007";
const GUILD_ID = "800000000000000008";
const OWNER: OwnerRecord = { discordId: OWNER_ID, display: "Leif", githubLogin: "0xleif", githubId: "8268288" };

const SAMPLE = `# operator notes stay
[github]
orgs = ["corvidlabs"]
repos = ["corvidlabs/app"]
users = ["0xleif", "tofu-dev"]
deny_repos = []

[discord]
# channels we listen in
channels = ["${CHAN_A}", "${CHAN_B}"]  # dogfood
roles = []
users = []
deny_users = []

[owner]
discord_id = "${OWNER_ID}"
display = "Leif # the owner"

[corvidinho.plugins]
work = false
schedule = true
`;

const tmpDirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "corvidinho-admin-lists-"));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Fixture = { dir: string; path: string; ctx: SlashContext; db: Database; env: NodeJS.ProcessEnv };

async function fixture(opts: {
  text?: string;
  fileName?: string;
  env?: NodeJS.ProcessEnv;
  recordAudit?: SlashContext["recordAudit"] | null;
} = {}): Promise<Fixture> {
  const dir = tmp();
  const path = join(dir, opts.fileName ?? "allowlist.toml");
  writeFileSync(path, opts.text ?? SAMPLE);
  const env: NodeJS.ProcessEnv = { HOME: dir, CORVIDINHO_ALLOWLIST_FILE: path, ...(opts.env ?? {}) };
  const allowlist: AllowlistConfig = await loadAllowlist({ env, home: dir });
  const db = new Database(":memory:");
  migrateCorvidinhoDb(db);
  const ctx: SlashContext = {
    store: new SessionStore(),
    workStore: new WorkStore(),
    allowlist,
    agent: createEchoAgentClient({ delayMs: 0 }),
    version: "0.0.9",
    protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
    startedAt: Date.now(),
    channelIds: allowlist.discord.channels,
    owner: OWNER,
    mutedUsers: new Set(),
    env,
    ...(opts.recordAudit === null
      ? {}
      : { recordAudit: opts.recordAudit ?? ((entry) => appendAudit(db, entry)) }),
  };
  return { dir, path, ctx, db, env };
}

function ix(
  group: string,
  sub: string,
  options: SlashInteraction["options"],
  over: Partial<SlashInteraction> = {},
): SlashInteraction & { replies: SlashReplyPayload[] } {
  const replies: SlashReplyPayload[] = [];
  return {
    id: "ix_admin_lists",
    commandName: "admin",
    subcommandGroup: group,
    subcommand: sub,
    channelId: CHAN_A,
    guildId: GUILD_ID,
    userId: OWNER_ID,
    roleIds: [ROLE_MINE],
    options,
    ...over,
    replies,
    reply: async (o) => {
      replies.push(o);
    },
  };
}

async function run(f: Fixture, group: string, sub: string, options: SlashInteraction["options"], over: Partial<SlashInteraction> = {}) {
  const i = ix(group, sub, options, over);
  await handleAdminCommand(f.ctx, i);
  return i.replies[0]?.content ?? "";
}

function rows(db: Database): Array<[string, string, string]> {
  return (db.query("SELECT action, actor, outcome FROM audit_log ORDER BY seq").all() as Array<{
    action: string;
    actor: string;
    outcome: string;
  }>).map((r) => [r.action, r.actor, r.outcome]);
}

async function reload(f: Fixture): Promise<AllowlistConfig> {
  return loadAllowlist({ env: f.env, home: f.dir });
}

describe("/admin deny + /admin github command body (ADMIN-3.c)", () => {
  test("deny add|remove takes channel, user, role, github_org, github_repo, github_user; github add|remove takes org, repo — all optional", () => {
    const admin = buildSlashCommandBodies().find((b) => b.name === "admin");
    const group = (name: string) => admin?.options?.find((g) => g.name === name);
    const deny = group("deny");
    const github = group("github");
    expect(deny?.type).toBe(OPT_SUB_COMMAND_GROUP);
    expect(github?.type).toBe(OPT_SUB_COMMAND_GROUP);
    for (const g of [deny, github]) {
      expect(g?.options?.map((o) => [o.type, o.name])).toEqual([
        [OPT_SUB_COMMAND, "add"],
        [OPT_SUB_COMMAND, "remove"],
      ]);
    }
    for (const sub of deny?.options ?? []) {
      expect(sub.options?.map((o) => [o.type, o.name, o.required])).toEqual([
        [OPT_STRING, "channel", false],
        [OPT_USER, "user", false],
        [ROLE, "role", false],
        [OPT_STRING, "github_org", false],
        [OPT_STRING, "github_repo", false],
        [OPT_STRING, "github_user", false],
      ]);
      expect(sub.options?.[0]?.autocomplete).toBe(true);
    }
    for (const sub of github?.options ?? []) {
      expect(sub.options?.map((o) => [o.type, o.name, o.required])).toEqual([
        [OPT_STRING, "org", false],
        [OPT_STRING, "repo", false],
      ]);
    }
    // Discord caps names at 32 and descriptions at 100 characters.
    const walk = (opts: SlashOptionDef[] | undefined): void => {
      for (const o of opts ?? []) {
        expect(o.name.length).toBeLessThanOrEqual(32);
        expect(o.description.length).toBeLessThanOrEqual(100);
        walk(o.options);
      }
    };
    walk(admin?.options);
  });
});

describe("allowlist writer: every list key the loader reads (ADMIN-3.c)", () => {
  const ids: Record<string, string> = {
    users: OTHER_ID,
    channels: "900000000000000009",
    deny_channels: "910000000000000001",
    deny_users: "920000000000000002",
    deny_roles: ROLE_X,
    "github.orgs": "octo-org",
    "github.repos": "octo-org/tool",
    "github.deny_orgs": "evil-org",
    "github.deny_repos": "corvidlabs/secret",
    "github.deny_users": "spammer",
  };

  test("the writer covers exactly the ten keys named for /admin", () => {
    expect(writer.ADMIN_LIST_KEYS).toEqual(Object.keys(ids) as never);
  });

  for (const [key, id] of Object.entries(ids)) {
    test(`${key}: add then remove round-trips through the loader; every other line stays; live spliced in place`, async () => {
      const f = await fixture();
      const k = key as writer.AdminListKey;
      const live = writer.liveAdminList(f.ctx.allowlist, k);
      const plan = writer.planAdminListChange({ allowlist: f.ctx.allowlist, env: f.env, home: f.dir, key: k, op: "add", id });
      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      writer.commitAdminListChange(plan.plan, { allowlist: f.ctx.allowlist, channelIds: f.ctx.channelIds });
      expect(writer.liveAdminList(f.ctx.allowlist, k)).toBe(live);
      expect(live).toContain(id);
      const after = readFileSync(f.path, "utf8");
      // Only the target key's line differs (or one line was added).
      const before = SAMPLE.split("\n");
      const now = after.split("\n");
      expect(now.filter((l) => !before.includes(l))).toHaveLength(1);
      expect(before.filter((l) => !now.includes(l)).length).toBeLessThanOrEqual(1);
      expect(parseExtrasSettings(after)).toEqual(parseExtrasSettings(SAMPLE));
      const reloaded = await reload(f);
      expect(writer.liveAdminList(reloaded, k)).toContain(id);

      const back = writer.planAdminListChange({ allowlist: f.ctx.allowlist, env: f.env, home: f.dir, key: k, op: "remove", id });
      expect(back.ok).toBe(true);
      if (!back.ok) return;
      writer.commitAdminListChange(back.plan, { allowlist: f.ctx.allowlist, channelIds: f.ctx.channelIds });
      expect(writer.liveAdminList((await reload(f)), k)).not.toContain(id);
      expect(live).not.toContain(id);
    });
  }

  test("TOML aliases: writes the spelling the loader reads (alias only when the canonical key is absent)", async () => {
    const text = `[github]\norganizations = ["corvidlabs"]\nrepositories = ["corvidlabs/app"]\n[discord]\nchannels = ["${CHAN_A}"]\ndenyUsers = ["${OTHER_ID}"] # camel\n`;
    const f = await fixture({ text });
    const org = writer.planAdminListChange({ allowlist: f.ctx.allowlist, env: f.env, key: "github.orgs", op: "add", id: "octo-org" });
    expect(org.ok && org.plan.fileKey).toBe("organizations");
    if (!org.ok) return;
    writer.commitAdminListChange(org.plan, { allowlist: f.ctx.allowlist });
    const deny = writer.planAdminListChange({ allowlist: f.ctx.allowlist, env: f.env, key: "deny_users", op: "add", id: "930000000000000003" });
    expect(deny.ok && deny.plan.fileKey).toBe("denyusers");
    if (!deny.ok) return;
    writer.commitAdminListChange(deny.plan, { allowlist: f.ctx.allowlist });
    expect(readFileSync(f.path, "utf8")).toBe(
      `[github]\norganizations = ["corvidlabs", "octo-org"]\nrepositories = ["corvidlabs/app"]\n[discord]\nchannels = ["${CHAN_A}"]\ndenyUsers = ["${OTHER_ID}", "930000000000000003"] # camel\n`,
    );
    const r = await reload(f);
    expect(r.github.orgs).toEqual(["corvidlabs", "octo-org"]);
    expect(r.discord.denyUsers).toEqual([OTHER_ID, "930000000000000003"]);

    // Both spellings: the loader reads the canonical one, so that is written.
    const both = await fixture({ text: `[github]\norgs = ["a-org"]\norganizations = ["ignored-org"]\n` });
    const p = writer.planAdminListChange({ allowlist: both.ctx.allowlist, env: both.env, key: "github.orgs", op: "add", id: "b-org" });
    expect(p.ok && p.plan.fileKey).toBe("orgs");
    if (!p.ok) return;
    writer.commitAdminListChange(p.plan, { allowlist: both.ctx.allowlist });
    expect(readFileSync(both.path, "utf8")).toBe(`[github]\norgs = ["a-org", "b-org"]\norganizations = ["ignored-org"]\n`);
  });

  test("JSON: alias spelling kept, every other key of the document kept ([owner], corvidinho.plugins, people)", async () => {
    const doc = {
      owner: { discord_id: OWNER_ID, display: "Leif" },
      corvidinho: { plugins: { work: false } },
      people: { tofu: { role: "team", discord_ids: [OTHER_ID] } },
      github: { Repositories: ["corvidlabs/app"], users: ["0xleif"], note: 5 },
      discord: { channels: [CHAN_A], DenyRoles: [] },
    };
    const f = await fixture({ fileName: "allowlist.json", text: JSON.stringify(doc) });
    for (const [key, id] of [
      ["github.repos", "octo-org/tool"],
      ["deny_roles", ROLE_X],
      ["github.deny_orgs", "evil-org"],
    ] as const) {
      const p = writer.planAdminListChange({ allowlist: f.ctx.allowlist, env: f.env, key, op: "add", id });
      expect(p.ok).toBe(true);
      if (!p.ok) return;
      writer.commitAdminListChange(p.plan, { allowlist: f.ctx.allowlist });
    }
    const out = JSON.parse(readFileSync(f.path, "utf8"));
    expect(out).toEqual({
      ...doc,
      github: { Repositories: ["corvidlabs/app", "octo-org/tool"], users: ["0xleif"], note: 5, deny_orgs: ["evil-org"] },
      discord: { channels: [CHAN_A], DenyRoles: [ROLE_X] },
    });
    expect(parseExtrasSettingsJson(readFileSync(f.path, "utf8"))).toEqual({ work: false });
    const r = await reload(f);
    expect(r.github.repos).toEqual(["corvidlabs/app", "octo-org/tool"]);
    expect(r.discord.denyRoles).toEqual([ROLE_X]);
    expect(r.github.denyOrgs).toEqual(["evil-org"]);
  });

  test("the re-read guard: TOML compares every key of every section, JSON every non-target key", () => {
    const toml = `[github]\nrepos = []\n[corvidinho.plugins]\nwork = false\n`;
    const base = { path: "/x/allowlist.toml", format: "toml" as const, key: "github.repos" as const, fileKey: "repos", before: toml };
    expect(writer.allowlistRewriteProblem({ ...base, after: `[github]\nrepos = ["a/b"]\n[corvidinho.plugins]\nwork = false\n`, fileAfter: ["a/b"] })).toBeNull();
    expect(
      writer.allowlistRewriteProblem({ ...base, after: `[github]\nrepos = ["a/b"]\n[corvidinho.plugins]\nwork = true\n`, fileAfter: ["a/b"] }),
    ).toContain("[corvidinho.plugins] work");

    const before = JSON.stringify({ owner: { discord_id: OWNER_ID }, corvidinho: { plugins: { work: false } }, github: { repos: [] } });
    const jbase = { path: "/x/allowlist.json", format: "json" as const, key: "github.repos" as const, fileKey: "repos", before };
    const ok = JSON.stringify({ owner: { discord_id: OWNER_ID }, corvidinho: { plugins: { work: false } }, github: { repos: ["a/b"] } });
    expect(writer.allowlistRewriteProblem({ ...jbase, after: ok, fileAfter: ["a/b"] })).toBeNull();
    for (const bad of [
      { owner: { discord_id: OTHER_ID }, corvidinho: { plugins: { work: false } }, github: { repos: ["a/b"] } },
      { owner: { discord_id: OWNER_ID }, corvidinho: { plugins: { work: true } }, github: { repos: ["a/b"] } },
      { owner: { discord_id: OWNER_ID }, corvidinho: { plugins: { work: false } }, github: { repos: ["a/b"], note: 1 } },
    ]) {
      expect(writer.allowlistRewriteProblem({ ...jbase, after: JSON.stringify(bad), fileAfter: ["a/b"] })).toContain(
        "a JSON key other than github.repos",
      );
    }
  });

  test("only valid entries are planned: snowflakes, GitHub logins, OWNER/REPO or OWNER/*", async () => {
    const f = await fixture();
    const bad: Array<[writer.AdminListKey, string]> = [
      ["deny_users", "not-a-snowflake"],
      ["deny_roles", '1"; x = ["2'],
      ["github.deny_orgs", "-leading-dash"],
      ["github.deny_users", "has space"],
      ["github.repos", "corvidlabs"],
      ["github.repos", "corvidlabs/.."],
      ["github.deny_repos", 'a/b"c'],
      ["github.deny_repos", "a/b/c"],
    ];
    for (const [key, id] of bad) {
      const p = writer.planAdminListChange({ allowlist: f.ctx.allowlist, env: f.env, key, op: "add", id });
      expect(p.ok).toBe(false);
    }
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE);
    expect(writer.normalizeAdminListId("github.repos", " CorvidLabs/App ")).toBe("corvidlabs/app");
    expect(writer.normalizeAdminListId("github.deny_repos", "corvidlabs/*")).toBe("corvidlabs/*");
    expect(writer.normalizeAdminListId("github.deny_users", "8268288")).toBe("8268288");
  });
});

describe("/admin deny add|remove (ADMIN-3.c)", () => {
  test("user: added to [discord].deny_users + live in place, gated at once, audited started → ok; remove reverses it", async () => {
    const f = await fixture();
    const live = f.ctx.allowlist.discord.denyUsers;
    const out = await run(f, "deny", "add", { user: OTHER_ID });
    expect(out).toContain(`✅ /admin deny add: denied <@${OTHER_ID}> (added to [discord].deny_users)`);
    expect(out).toContain("Audit: #1 started · #2 ok");
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE.replace("deny_users = []", `deny_users = ["${OTHER_ID}"]`));
    expect(f.ctx.allowlist.discord.denyUsers).toBe(live);
    expect(live).toEqual([OTHER_ID]);
    expect(gateActor({ userId: OTHER_ID, allowlist: f.ctx.allowlist, owner: OWNER }).ok).toBe(false);

    const back = await run(f, "deny", "remove", { user: OTHER_ID });
    expect(back).toContain(`removed <@${OTHER_ID}> from [discord].deny_users`);
    expect(live).toEqual([]);
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE);
    expect(rows(f.db)).toEqual([
      ["admin-deny-add", OWNER_ID, "started"],
      ["admin-deny-add", OWNER_ID, "ok"],
      ["admin-deny-remove", OWNER_ID, "started"],
      ["admin-deny-remove", OWNER_ID, "ok"],
    ]);
  });

  test("role and channel: [discord].deny_roles / deny_channels, refused by the gates at once", async () => {
    const f = await fixture();
    expect(await run(f, "deny", "add", { role: ROLE_X })).toContain(`denied <@&${ROLE_X}> (added to [discord].deny_roles)`);
    expect(gateActor({ userId: OTHER_ID, roleIds: [ROLE_X], allowlist: f.ctx.allowlist, owner: OWNER }).ok).toBe(false);
    expect(await run(f, "deny", "add", { channel: `<#${CHAN_B}>` })).toContain(`denied <#${CHAN_B}> (added to [discord].deny_channels)`);
    expect(gateChannel(CHAN_B, f.ctx.allowlist).ok).toBe(false);
    expect(gateChannel(CHAN_A, f.ctx.allowlist).ok).toBe(true);
    const r = await reload(f);
    expect(r.discord.denyRoles).toEqual([ROLE_X]);
    expect(r.discord.denyChannels).toEqual([CHAN_B]);
  });

  test("GitHub org, repo, user: [github].deny_orgs / deny_repos / deny_users; the repo gate refuses at once", async () => {
    const f = await fixture();
    expect(await run(f, "deny", "add", { github_repo: "CorvidLabs/Secret" })).toContain("denied `corvidlabs/secret` (added to [github].deny_repos)");
    expect(isRepoAllowed("corvidlabs/secret", f.ctx.allowlist.github).ok).toBe(false);
    expect(await run(f, "deny", "add", { github_org: "evil-org" })).toContain("[github].deny_orgs");
    const user = await run(f, "deny", "add", { github_user: "spammer" });
    expect(user).toContain("[github].deny_users");
    expect(user).toContain("`github watch` re-reads it on its next poll");
    const r = await reload(f);
    expect(r.github.denyRepos).toEqual(["corvidlabs/secret"]);
    expect(r.github.denyOrgs).toEqual(["evil-org"]);
    expect(r.github.denyUsers).toEqual(["spammer"]);
    expect(r.github.users).toEqual(["0xleif", "tofu-dev"]);
    expect(rows(f.db).map((x) => x[2])).toEqual(["started", "ok", "started", "ok", "started", "ok"]);
  });

  test("exactly one option, each validated: otherwise usage / refusal, nothing written or audited", async () => {
    const f = await fixture();
    expect(await run(f, "deny", "add", {})).toContain("usage: /admin deny add with exactly one of");
    expect(await run(f, "deny", "add", { user: OTHER_ID, github_user: "spammer" })).toContain("exactly one of");
    expect(await run(f, "deny", "add", { github_repo: 'x/y"] , evil = ["z' })).toContain("Refused: github_repo must be OWNER/REPO or OWNER/*");
    expect(await run(f, "deny", "add", { role: "everyone" })).toContain("Refused: role must be a Discord role");
    expect(await run(f, "deny", "remove", { channel: "#general" })).toContain("Refused: channel must be");
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE);
    expect(rows(f.db)).toEqual([]);
  });

  test("lockout: the owner never denies themselves — their user, a role they hold, @everyone, the last open channel, their GitHub login or id", async () => {
    const f = await fixture();
    const refusals = [
      await run(f, "deny", "add", { user: OWNER_ID }),
      await run(f, "deny", "add", { role: ROLE_MINE }),
      await run(f, "deny", "add", { role: GUILD_ID }),
      await run(f, "deny", "add", { github_user: "0xLeif" }),
      await run(f, "deny", "add", { github_user: "8268288" }),
    ];
    for (const r of refusals) {
      expect(r).toStartWith("Refused:");
      expect(r).toContain("lock yourself out");
    }
    expect(await run(f, "deny", "add", { channel: CHAN_B })).toContain("✅");
    const last = await run(f, "deny", "add", { channel: CHAN_A });
    expect(last).toContain("Refused: denying");
    expect(last).toContain("no allowlisted channel that is not denied");
    expect(f.ctx.allowlist.discord.denyUsers).toEqual([]);
    expect(f.ctx.allowlist.discord.denyRoles).toEqual([]);
    expect(f.ctx.allowlist.discord.denyChannels).toEqual([CHAN_B]);
    expect(f.ctx.allowlist.github.denyUsers).toEqual([]);
    expect(rows(f.db)).toEqual([
      ...Array(5).fill(["admin-deny-add", OWNER_ID, "denied"]),
      ["admin-deny-add", OWNER_ID, "started"],
      ["admin-deny-add", OWNER_ID, "ok"],
      ["admin-deny-add", OWNER_ID, "denied"],
    ]);
  });

  test("env-only entries cannot be removed at runtime; file + env says it is still listed", async () => {
    const f = await fixture({ env: { CORVIDINHO_DISCORD_DENY_USERS: OTHER_ID, CORVIDINHO_GITHUB_DENY_REPOS: "corvidlabs/old" } });
    expect(f.ctx.allowlist.discord.denyUsers).toEqual([OTHER_ID]);
    const out = await run(f, "deny", "remove", { user: OTHER_ID });
    expect(out).toContain("comes from env (CORVIDINHO_DISCORD_DENY_USERS)");
    expect(await run(f, "deny", "remove", { github_repo: "corvidlabs/old" })).toContain("CORVIDINHO_GITHUB_DENY_REPOS");
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE);
    const added = await run(f, "deny", "add", { github_repo: "corvidlabs/old" });
    expect(added).toContain("already listed via env (CORVIDINHO_GITHUB_DENY_REPOS)");
    const removed = await run(f, "deny", "remove", { github_repo: "corvidlabs/old" });
    expect(removed).toContain("still listed via env");
    expect(f.ctx.allowlist.github.denyRepos).toEqual(["corvidlabs/old"]);
    expect(rows(f.db).slice(0, 2)).toEqual([
      ["admin-deny-remove", OWNER_ID, "denied"],
      ["admin-deny-remove", OWNER_ID, "denied"],
    ]);
  });

  test("no audit trail (or one that throws) fails closed: nothing written, live unchanged", async () => {
    for (const recordAudit of [null, () => { throw new Error("database is locked"); }] as const) {
      const f = await fixture({ recordAudit });
      const out = await run(f, "deny", "add", { github_org: "evil-org" });
      expect(out).toContain("audit log unavailable (SAFE-5)");
      const gh = await run(f, "github", "add", { repo: "octo-org/tool" });
      expect(gh).toContain("audit log unavailable (SAFE-5)");
      expect(readFileSync(f.path, "utf8")).toBe(SAMPLE);
      expect(f.ctx.allowlist.github.denyOrgs).toEqual([]);
      expect(f.ctx.allowlist.github.repos).toEqual(["corvidlabs/app"]);
    }
  });

  test("owner-only: the dispatcher floor and the handler re-check both refuse a non-owner; the handler records denied", async () => {
    const f = await fixture();
    const viaDispatch = ix("deny", "add", { user: OTHER_ID }, { userId: OTHER_ID, roleIds: [] });
    const r = await handleSlashInteraction(f.ctx, viaDispatch);
    expect(r).toMatchObject({ ok: false, reason: "insufficient_permission" });
    expect(viaDispatch.replies[0]).toEqual({ content: NOT_AUTHORIZED, ephemeral: true });
    expect(await run(f, "deny", "remove", { user: OTHER_ID }, { userId: OTHER_ID })).toBe(NOT_AUTHORIZED);
    expect(await run(f, "github", "add", { org: "octo-org" }, { userId: OTHER_ID })).toBe(NOT_AUTHORIZED);
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE);
    expect(rows(f.db)).toEqual([
      ["admin-deny-remove", OTHER_ID, "denied"],
      ["admin-github-add", OTHER_ID, "denied"],
    ]);
  });
});

describe("/admin github add|remove (ADMIN-3.c: the GitHub repo allow lists)", () => {
  test("org and repo: [github].orgs / repos + live; [github].users untouched", async () => {
    const f = await fixture();
    const orgs = f.ctx.allowlist.github.orgs;
    expect(await run(f, "github", "add", { org: "Octo-Org" })).toContain("✅ /admin github add: added `octo-org` to [github].orgs");
    expect(f.ctx.allowlist.github.orgs).toBe(orgs);
    expect(isRepoAllowed("octo-org/anything", f.ctx.allowlist.github).ok).toBe(true);
    expect(await run(f, "github", "add", { repo: "other/tool" })).toContain("[github].repos");
    expect(await run(f, "github", "remove", { repo: "corvidlabs/app" })).toContain("removed `corvidlabs/app` from [github].repos");
    const r = await reload(f);
    expect(r.github.orgs).toEqual(["corvidlabs", "octo-org"]);
    expect(r.github.repos).toEqual(["other/tool"]);
    expect(r.github.users).toEqual(["0xleif", "tofu-dev"]);
    expect(rows(f.db).map((x) => x[0])).toEqual([
      "admin-github-add",
      "admin-github-add",
      "admin-github-add",
      "admin-github-add",
      "admin-github-remove",
      "admin-github-remove",
    ]);
  });

  test("deny always wins: an org or repo a deny list covers is refused (denied), nothing written", async () => {
    const f = await fixture({ text: SAMPLE.replace("deny_repos = []", 'deny_repos = ["blocked/*"]\ndeny_orgs = ["evil-org"]') });
    const before = readFileSync(f.path, "utf8");
    expect(await run(f, "github", "add", { org: "evil-org" })).toContain("deny always wins");
    expect(await run(f, "github", "add", { repo: "evil-org/x" })).toContain("deny always wins");
    expect(await run(f, "github", "add", { repo: "blocked/x" })).toContain("deny always wins");
    expect(readFileSync(f.path, "utf8")).toBe(before);
    expect(rows(f.db).map((x) => x[2])).toEqual(["denied", "denied", "denied"]);
  });

  test("removing the last org/repo is allowed and says WATCH now polls nothing; env-only refused; usage when not exactly one", async () => {
    const f = await fixture({ env: { CORVIDINHO_GITHUB_ALLOW_ORGS: "env-org" } });
    expect(await run(f, "github", "remove", { org: "env-org" })).toContain("comes from env (CORVIDINHO_GITHUB_ALLOW_ORGS)");
    expect(await run(f, "github", "add", { org: "a-org", repo: "a/b" })).toContain("usage: /admin github add with exactly one of");

    const g = await fixture({ text: `[github]\nrepos = ["corvidlabs/app"]\n[discord]\nchannels = ["${CHAN_A}"]\n` });
    const out = await run(g, "github", "remove", { repo: "corvidlabs/app" });
    expect(out).toContain("✅");
    expect(out).toContain("`github watch` polls nothing until you add one");
    expect(g.ctx.allowlist.github.repos).toEqual([]);
  });
});

describe("/admin config show lists the deny lists and the GitHub repo allow lists (ADMIN-3.c)", () => {
  test("entries per list, [github].users read-only, the new knobs named, under Discord's 2000 characters", async () => {
    const f = await fixture({ text: SAMPLE.replace("deny_users = []", `deny_users = ["${OTHER_ID}"]\ndeny_roles = ["${ROLE_X}"]`) });
    await run(f, "deny", "add", { github_repo: "corvidlabs/secret" });
    const out = await run(f, "config", "show", {});
    expect(out).toContain(`• deny_users: live 1 (file 1 · env 0) — <@${OTHER_ID}>`);
    expect(out).toContain(`• deny_roles: live 1 (file 1 · env 0) — <@&${ROLE_X}>`);
    expect(out).toContain("• orgs: live 1 (file 1 · env 0) — `corvidlabs`");
    expect(out).toContain("• repos: live 1 (file 1 · env 0) — `corvidlabs/app`");
    expect(out).toContain("• deny_repos: live 1 (file 1 · env 0) — `corvidlabs/secret`");
    expect(out).toContain("• users: live 2 (read-only here: file / CORVIDINHO_GITHUB_ALLOW_USERS) — `0xleif` `tofu-dev`");
    expect(out).toContain("(/admin deny add|remove)");
    expect(out).toContain("(/admin github add|remove)");
    expect(out).toContain("[github].users, [discord].roles and every other file key");

    const many = Array.from({ length: 60 }, (_, n) => `"${String(950000000000000000n + BigInt(n))}"`).join(", ");
    const big = await fixture({
      text: `[github]\nrepos = [${Array.from({ length: 60 }, (_, n) => `"some-long-org-name/repository-${n}"`).join(", ")}]\n[discord]\nchannels = ["${CHAN_A}"]\ndeny_users = [${many}]\ndeny_channels = [${many}]\ndeny_roles = [${many}]\n`,
    });
    const long = await run(big, "config", "show", {});
    expect(long.length).toBeLessThanOrEqual(2000);
    expect(long).toContain("• deny_users: live 60 (file 60 · env 0)");
    expect(long).toContain("Updatable here:");
  });
});
