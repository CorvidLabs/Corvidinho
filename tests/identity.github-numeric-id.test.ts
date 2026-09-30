/**
 * IDENTITY-7.a (#36, REQ-discord-367): "On GitHub it matches people only by
 * their numeric user id, so a renamed or re-registered login never counts as
 * them."
 *
 * - `resolvePerson` / `memorySubjectForGithub`: a GitHub login alone, or with
 *   another numeric id, is nobody; the declared numeric id is the person
 *   whatever the login now is.
 * - `[owner] github_id` (TOML / JSON) is the only way the owner is recognised
 *   on GitHub; the `[owner]` / env login alone never is.
 * - People entries with only `github_logins` still load (and still match on
 *   Discord); they are not recognised on GitHub until an id is linked.
 * - `/admin people link github:<login>` looks the login's numeric id up once
 *   (GitHub API, owner-only, audited) and stores it in `github_ids`; a failed
 *   lookup links nothing.
 * Temp files, in-memory SQLite, a fake or stubbed GitHub; no network.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAllowlist } from "../src/allowlist/load.ts";
import { appendAudit } from "../src/audit/index.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import { handleSlashInteraction } from "../src/discord/slash-dispatch.ts";
import type { SlashContext, SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { loadOwnerConfig, ownerFieldsFromJson, parseOwnerToml, resolveOwner, type OwnerRecord } from "../src/identity/owner.ts";
import {
  buildPeopleDirectory,
  loadDeclaredPeople,
  OWNER_PERSON_ID,
  parsePeopleToml,
  resolvePerson,
} from "../src/identity/people.ts";
import { memorySubjectForGithub } from "../src/memory/scope.ts";
import { migrateCorvidinhoDb } from "../src/store/db.ts";

const OWNER_DC = "100000000000000001";
const TOFU_DC = "200000000000000002";
const ADA_DC = "300000000000000003";
const CHAN = "400000000000000004";
const OWNER_GH_ID = "8268288";

const tmpDirs: string[] = [];
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "corvidinho-gh-numeric-id-"));
  tmpDirs.push(d);
  return d;
}

/** A people file written before IDENTITY-7.a: logins only for ada, an id for tofu. */
const PEOPLE = `[people.tofu]
display = "Tofu"
role = "team"
discord_ids = ["${TOFU_DC}"]
github_logins = ["tofu-dev"]
github_ids = ["4242"]

[people.ada]
display = "Ada"
discord_ids = ["${ADA_DC}"]
github_logins = ["ada-gh"]
`;

describe("resolvePerson: GitHub matches the numeric user id only (IDENTITY-7.a)", () => {
  const owner: OwnerRecord = { discordId: OWNER_DC, display: "Leif", githubLogin: "0xleif", githubId: OWNER_GH_ID };
  const dir = buildPeopleDirectory(parsePeopleToml(PEOPLE), owner);

  test("a renamed or re-registered login never resolves as the owner or a declared person", () => {
    // Re-registered: the same login, another account (another numeric id).
    expect(resolvePerson(dir, { githubLogin: "0xLeif", githubId: 31337 })).toBeNull();
    expect(resolvePerson(dir, { githubLogin: "tofu-dev", githubId: 31337 })).toBeNull();
    // No id known: a login alone is nobody.
    expect(resolvePerson(dir, { githubLogin: "0xLeif" })).toBeNull();
    expect(resolvePerson(dir, { githubLogin: "tofu-dev" })).toBeNull();
    expect(resolvePerson(dir, { githubLogin: "ada-gh" })).toBeNull();
    // Renamed: the declared numeric id is still them, whatever the login says.
    expect(resolvePerson(dir, { githubLogin: "leif-renamed", githubId: Number(OWNER_GH_ID) })).toMatchObject({
      personId: OWNER_PERSON_ID,
      role: "owner",
    });
    expect(resolvePerson(dir, { githubLogin: "tofu-renamed", githubId: "4242" })?.personId).toBe("tofu");
  });

  test("memory scope follows the numeric id only (MEMORY-8)", () => {
    expect(memorySubjectForGithub(dir, { login: "0xLeif" })).toBeNull();
    expect(memorySubjectForGithub(dir, { login: "0xLeif", id: 31337 })).toBeNull();
    expect(memorySubjectForGithub(dir, { login: "tofu-dev" })).toBeNull();
    expect(memorySubjectForGithub(dir, { login: "x", id: OWNER_GH_ID })?.writeScope).toBe(OWNER_DC);
    expect(memorySubjectForGithub(dir, { login: "x", id: 4242 })?.writeScope).toBe("person:tofu");
  });

  test("people with only github_logins still load and still match on Discord, but not on GitHub until an id is linked", () => {
    const parsed = parsePeopleToml(PEOPLE);
    expect(parsed.issues).toEqual([]);
    expect(parsed.invalid).toEqual([]);
    const ada = parsed.people.find((p) => p.id === "ada");
    expect(ada).toMatchObject({ githubLogins: ["ada-gh"], githubIds: [] });
    expect(resolvePerson(dir, { discordId: ADA_DC })?.personId).toBe("ada");
    expect(resolvePerson(dir, { githubLogin: "ada-gh", githubId: 5151 })).toBeNull();
    const linked = buildPeopleDirectory(parsePeopleToml(`${PEOPLE}github_ids = ["5151"]\n`), owner);
    expect(resolvePerson(linked, { githubLogin: "ada-renamed", githubId: 5151 })?.personId).toBe("ada");
  });
});

describe("[owner] github_id — the owner on GitHub (IDENTITY-1 / IDENTITY-7.a)", () => {
  test("TOML and JSON (string or number) read github_id; an invalid one is ignored with a value-free issue", () => {
    expect(parseOwnerToml(`[owner]\ndiscord_id = "${OWNER_DC}"\ngithub_id = "${OWNER_GH_ID}"\ngithub_login = "0xLeif"\n`)).toEqual({
      discordId: OWNER_DC,
      githubId: OWNER_GH_ID,
      githubLogin: "0xLeif",
    });
    expect(parseOwnerToml(`[owner]\ndiscord_id = "${OWNER_DC}"\ngithub_id = ${OWNER_GH_ID}\n`).githubId).toBe(OWNER_GH_ID);
    expect(ownerFieldsFromJson({ owner: { discord_id: OWNER_DC, github_id: OWNER_GH_ID } }).fields.githubId).toBe(OWNER_GH_ID);
    expect(ownerFieldsFromJson({ owner: { discord_id: OWNER_DC, github_id: Number(OWNER_GH_ID) } }).fields.githubId).toBe(
      OWNER_GH_ID,
    );
    const json = ownerFieldsFromJson({ owner: { discord_id: OWNER_DC, github_id: 1.5 } });
    expect(json.fields.githubId).toBeUndefined();
    expect(json.issues.join(" ")).toContain("github_id");

    const ok = resolveOwner({ discordId: OWNER_DC, githubId: ` ${OWNER_GH_ID} `, githubLogin: "0xLeif" }, {});
    expect(ok.owner).toEqual({ discordId: OWNER_DC, githubId: OWNER_GH_ID, githubLogin: "0xleif" });
    const bad = resolveOwner({ discordId: OWNER_DC, githubId: "leif-8268288" }, {});
    expect(bad.owner).toEqual({ discordId: OWNER_DC });
    expect(bad.issues.join(" ")).toContain("owner github_id is not a numeric GitHub user id");
    expect(bad.issues.join(" ")).not.toContain("leif-8268288");
  });

  test("loaded from the allowlist file, it joins the owner's person; the [owner] / env login alone never makes the owner", async () => {
    const d = tmp();
    const path = join(d, "allowlist.toml");
    writeFileSync(path, `[owner]\ndiscord_id = "${OWNER_DC}"\ngithub_login = "0xleif"\ngithub_id = "${OWNER_GH_ID}"\n\n${PEOPLE}`);
    const { owner } = await loadOwnerConfig({ env: {}, filePath: path });
    expect(owner).toMatchObject({ githubId: OWNER_GH_ID, githubLogin: "0xleif" });
    const dir = loadDeclaredPeople({ allowlist: { sourcePath: path }, owner });
    expect(resolvePerson(dir, { githubId: OWNER_GH_ID })?.role).toBe("owner");

    // Env-only owner login (no github_id anywhere): not the owner on GitHub.
    const envOnly = await loadOwnerConfig({
      env: { CORVIDINHO_OWNER_DISCORD_ID: OWNER_DC, CORVIDINHO_OWNER_GITHUB_LOGIN: "0xLeif" },
      filePath: null,
    });
    const noId = buildPeopleDirectory(parsePeopleToml(PEOPLE), envOnly.owner);
    expect(resolvePerson(noId, { githubLogin: "0xLeif" })).toBeNull();
    expect(resolvePerson(noId, { githubLogin: "0xLeif", githubId: OWNER_GH_ID })).toBeNull();
    expect(resolvePerson(noId, { discordId: OWNER_DC })?.role).toBe("owner");
  });
});

// ---------------------------------------------------------------------------
// /admin people link github:<login> stores the looked-up numeric id

type Fixture = { path: string; ctx: SlashContext; db: Database; lookups: string[] };

const OWNER: OwnerRecord = { discordId: OWNER_DC, display: "Leif", githubLogin: "0xleif" };

async function fixture(github: Record<string, { id: string; login?: string } | "fail">): Promise<Fixture> {
  const d = tmp();
  const path = join(d, "allowlist.toml");
  writeFileSync(path, `[discord]\nchannels = ["${CHAN}"]\n\n[owner]\ndiscord_id = "${OWNER_DC}"\n\n${PEOPLE}`);
  const env: NodeJS.ProcessEnv = { HOME: d, CORVIDINHO_ALLOWLIST_FILE: path };
  const allowlist = await loadAllowlist({ env, home: d });
  const db = new Database(":memory:");
  migrateCorvidinhoDb(db);
  const lookups: string[] = [];
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
    recordAudit: (entry) => appendAudit(db, entry),
    lookupGithubUser: async (login) => {
      lookups.push(login);
      const hit = github[login];
      if (!hit) return { ok: false, error: `GitHub has no user @${login}` };
      if (hit === "fail") return { ok: false, error: "GitHub lookup failed (HTTP 503)" };
      return { ok: true, id: hit.id, login: hit.login ?? login };
    },
  };
  return { path, ctx, db, lookups };
}

async function link(f: Fixture, options: SlashInteraction["options"]) {
  const replies: SlashReplyPayload[] = [];
  let deferred = 0;
  await handleSlashInteraction(f.ctx, {
    id: "ix_people_link",
    commandName: "admin",
    subcommandGroup: "people",
    subcommand: "link",
    channelId: CHAN,
    userId: OWNER_DC,
    options,
    replies,
    reply: async (o) => {
      replies.push(o);
    },
    deferReply: async () => {
      deferred += 1;
    },
  } as SlashInteraction);
  expect(replies).toHaveLength(1);
  expect(replies[0]?.ephemeral).toBe(true);
  return { out: replies[0]!.content ?? "", deferred };
}

function audit(db: Database): string[] {
  return (db.query("SELECT action, outcome FROM audit_log ORDER BY seq").all() as Array<{ action: string; outcome: string }>).map(
    (r) => `${r.action}:${r.outcome}`,
  );
}

function who(f: Fixture, q: Parameters<typeof resolvePerson>[1]): string | null {
  return resolvePerson(loadDeclaredPeople({ allowlist: f.ctx.allowlist, owner: OWNER }), q)?.personId ?? null;
}

describe("/admin people link github:<login> stores the numeric id once (ADMIN-3.a / IDENTITY-7.a)", () => {
  test("a login-only person gets the looked-up id linked (github_ids), audited, and GitHub recognises that id at once", async () => {
    const f = await fixture({ "ada-gh": { id: "5151" } });
    expect(who(f, { githubLogin: "ada-gh", githubId: 5151 })).toBeNull();
    const { out, deferred } = await link(f, { person: "ada", github: "@Ada-GH" });
    expect(f.lookups).toEqual(["ada-gh"]);
    expect(deferred).toBe(1);
    expect(out).toContain('✅ /admin people link: "ada" (Ada) — linked GitHub id 5151.');
    expect(out).toContain("Already linked (unchanged): GitHub @ada-gh.");
    expect(readFileSync(f.path, "utf8")).toContain(
      `[people.ada]\ndisplay = "Ada"\ndiscord_ids = ["${ADA_DC}"]\ngithub_logins = ["ada-gh"]\ngithub_ids = ["5151"]\n`,
    );
    expect(audit(f.db)).toEqual(["admin-people-link:started", "admin-people-link:ok"]);
    expect(who(f, { githubLogin: "ada-renamed", githubId: 5151 })).toBe("ada");
    // Linking again changes nothing (the id is stored once).
    expect((await link(f, { person: "ada", github: "ada-gh" })).out).toContain('No change: "ada" already has GitHub @ada-gh, GitHub id 5151');
    expect(audit(f.db)).toHaveLength(2);
  });

  test("a new login is stored with its id; a failed or mismatched lookup links nothing and is audited as an error", async () => {
    const f = await fixture({ "tofu-alt": { id: "7070" }, flaky: "fail", renamed: { id: "8080", login: "someone-else" } });
    const before = readFileSync(f.path, "utf8");

    let r = await link(f, { person: "ada", github: "flaky" });
    expect(r.out).toContain("Refused: could not look up the GitHub numeric user id of @flaky (GitHub lookup failed (HTTP 503))");
    expect(r.out).toContain("Nothing changed");
    r = await link(f, { person: "ada", github: "nobody-here" });
    expect(r.out).toContain("GitHub has no user @nobody-here");
    r = await link(f, { person: "ada", github: "renamed" });
    expect(r.out).toContain("GitHub answered for @someone-else");
    expect(readFileSync(f.path, "utf8")).toBe(before);
    expect(audit(f.db)).toEqual(["admin-people-link:error", "admin-people-link:error", "admin-people-link:error"]);

    r = await link(f, { person: "tofu", github: "tofu-alt" });
    expect(r.out).toContain("linked GitHub @tofu-alt, GitHub id 7070");
    expect(who(f, { githubId: 7070 })).toBe("tofu");
    expect(who(f, { githubLogin: "tofu-alt" })).toBeNull();
  });

  test("a refusal keeps its own reason and never calls GitHub; github_id: and discord: links never look anything up", async () => {
    const f = await fixture({});
    expect((await link(f, { person: "zed", github: "zed-gh" })).out).toContain('Refused: person "zed" is not declared');
    expect((await link(f, { person: "ada", github: "bad login!" })).out).toContain("Refused: github is not a valid GitHub login");
    expect((await link(f, { person: "ada", github_id: "5151" })).out).toContain("linked GitHub id 5151");
    expect(f.lookups).toEqual([]);
  });
});

describe("createGithubUserLookup (GET /users/{login}; no token or body in errors)", () => {
  function stub(status: number, body: unknown): Array<{ url: string; auth: string | null }> {
    const seen: Array<{ url: string; auth: string | null }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(String(input), init);
      seen.push({ url: new URL(req.url).pathname, auth: req.headers.get("authorization") });
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    return seen;
  }

  test("200 → the numeric id and canonical login; 404 → no such user; other failures → the status only", async () => {
    const { createGithubUserLookup } = await import("../src/identity/github-user.ts");
    const token = "ghp_lookupFixtureTokenMustNotLeak000000000";
    const seen = stub(200, { login: "Ada-GH", id: 5151, type: "User" });
    expect(await createGithubUserLookup({ GITHUB_TOKEN: token })("ada-gh")).toEqual({ ok: true, id: "5151", login: "ada-gh" });
    expect(seen[0]?.url).toBe("/users/ada-gh");
    expect(seen[0]?.auth ?? "").toContain(token);

    stub(404, { message: "Not Found" });
    expect(await createGithubUserLookup({})("ghost")).toEqual({ ok: false, error: "GitHub has no user @ghost" });

    stub(500, { message: `boom ${token}` });
    const failed = await createGithubUserLookup({ GITHUB_TOKEN: token })("ada-gh");
    expect(failed).toEqual({ ok: false, error: "GitHub lookup failed (HTTP 500)" });
    expect(JSON.stringify(failed)).not.toContain(token);

    stub(200, { login: "ada-gh" });
    expect(await createGithubUserLookup({})("ada-gh")).toEqual({ ok: false, error: "GitHub returned no numeric user id" });
  });
});
