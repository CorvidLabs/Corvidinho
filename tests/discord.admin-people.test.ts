/**
 * ADMIN-3.a / IDENTITY-6 / IDENTITY-13 — `/admin people list|add|link|unlink|
 * remove` (#36): owner-only, audited (SAFE-5), written to the allowlist file
 * the bridge already reads, live on the next message. Fixture tests only:
 * temp allowlist files, in-memory SQLite, no live Discord token or network.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAllowlist, parseAllowlistText } from "../src/allowlist/load.ts";
import type { AllowlistConfig } from "../src/allowlist/types.ts";
import { appendAudit } from "../src/audit/index.ts";
import { loadOwnerConfig, type OwnerRecord } from "../src/identity/owner.ts";
import { loadDeclaredPeople, parsePeopleText, resolvePerson } from "../src/identity/people.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import { setJsonPerson, setTomlPerson } from "../src/discord/admin-people.ts";
import { handleAdminCommand } from "../src/discord/command-handlers/admin.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import { handleSlashInteraction } from "../src/discord/slash-dispatch.ts";
import type { SlashContext, SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import { NOT_AUTHORIZED } from "../src/discord/types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { migrateCorvidinhoDb } from "../src/store/db.ts";

const OWNER_ID = "100000000000000001";
const TOFU_DC = "200000000000000002";
const ADA_DC = "300000000000000003";
const CHAN = "400000000000000004";
const OWNER: OwnerRecord = { discordId: OWNER_ID, display: "Leif", githubLogin: "0xleif" };

/**
 * IDENTITY-7.a: `link github:<login>` looks the numeric id up; this fake
 * GitHub knows these logins (no network in tests).
 */
const GITHUB_IDS: Record<string, string> = { "tofu-dev": "4242", ada: "5151", "0xleif": "8268288" };
const fakeLookup: NonNullable<SlashContext["lookupGithubUser"]> = async (login) =>
  GITHUB_IDS[login] ? { ok: true, id: GITHUB_IDS[login]!, login } : { ok: false, error: `GitHub has no user @${login}` };

const SAMPLE_TOML = `# Corvidinho allowlist — operator notes stay
[github]
repos = ["corvidlabs/corvidinho"]

[discord]
channels = ["${CHAN}"]  # dogfood

# durable owner
[owner]
discord_id = "${OWNER_ID}"
display = "Leif # the owner"

[people.ada]  # hand-written
# Ada from the hackathon
display = "Ada"
discord_ids = ["${ADA_DC}"]
team = "infra"

# the next section is unrelated
[notes]
text = "keep me"
`;

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Fixture = { dir: string; path: string; ctx: SlashContext; db: Database };

async function fixture(opts: {
  text?: string | null;
  fileName?: string;
  recordAudit?: SlashContext["recordAudit"] | null;
} = {}): Promise<Fixture> {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-people-admin-"));
  tmpDirs.push(dir);
  const path = join(dir, opts.fileName ?? "allowlist.toml");
  if (opts.text !== null) writeFileSync(path, opts.text ?? SAMPLE_TOML);
  const env: NodeJS.ProcessEnv = { HOME: dir, CORVIDINHO_ALLOWLIST_FILE: path };
  const loaded: AllowlistConfig = await loadAllowlist({ env, home: dir });
  const allowlist: AllowlistConfig = {
    ...loaded,
    discord: { ...loaded.discord, channels: [...new Set([...loaded.discord.channels, CHAN])] },
  };
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
    lookupGithubUser: fakeLookup,
    recordAudit:
      opts.recordAudit === undefined
        ? (entry) => appendAudit(db, entry)
        : opts.recordAudit ?? undefined,
  };
  return { dir, path, ctx, db };
}

function ix(
  subcommand: string,
  options: SlashInteraction["options"],
  userId = OWNER_ID,
): SlashInteraction & { replies: SlashReplyPayload[] } {
  const replies: SlashReplyPayload[] = [];
  return {
    id: "ix_people",
    commandName: "admin",
    subcommandGroup: "people",
    subcommand,
    channelId: CHAN,
    userId,
    options,
    replies,
    reply: async (o) => {
      replies.push(o);
    },
  };
}

async function run(f: Fixture, subcommand: string, options: SlashInteraction["options"], userId = OWNER_ID) {
  const i = ix(subcommand, options, userId);
  await handleSlashInteraction(f.ctx, i);
  expect(i.replies).toHaveLength(1);
  expect(i.replies[0]?.ephemeral).toBe(true);
  return i.replies[0]!.content ?? "";
}

function audit(db: Database): Array<[string, string, string, string]> {
  return (
    db.query("SELECT action, actor, surface, outcome FROM audit_log ORDER BY seq").all() as Array<{
      action: string;
      actor: string;
      surface: string;
      outcome: string;
    }>
  ).map((r) => [r.action, r.actor, r.surface, r.outcome]);
}

/** What chat / WATCH see right now (the file the process loaded, re-read). */
function who(f: Fixture, q: Parameters<typeof resolvePerson>[1]): string | null {
  return resolvePerson(loadDeclaredPeople({ allowlist: f.ctx.allowlist, owner: OWNER }), q)?.personId ?? null;
}

describe("/admin people — owner adds, changes and removes people and links (ADMIN-3.a)", () => {
  test("add → link → unlink → change display → remove, each audited and live without a restart", async () => {
    const f = await fixture();
    expect(who(f, { discordId: TOFU_DC })).toBeNull();

    let out = await run(f, "add", { person: "Tofu", display: "Tofu" });
    expect(out).toContain('✅ /admin people add: declared "tofu" (Tofu)');
    expect(out).toContain("people 1 → 2");
    expect(out).toContain("Audit: #1 started · #2 ok");

    out = await run(f, "link", { person: "tofu", discord: TOFU_DC, github: "@Tofu-Dev", github_id: "4242", nickname: "T" });
    expect(out).toContain(`linked Discord <@${TOFU_DC}>, GitHub @tofu-dev, GitHub id 4242, nickname "T"`);
    // Live: the next message / comment resolves them, on each stable id
    // (on GitHub the numeric id only, IDENTITY-7.a).
    expect(who(f, { discordId: TOFU_DC })).toBe("tofu");
    expect(who(f, { githubId: 4242 })).toBe("tofu");
    expect(who(f, { githubLogin: "tofu-dev" })).toBeNull();
    expect(who(f, { githubLogin: "T" })).toBeNull();

    const text = readFileSync(f.path, "utf8");
    expect(text).toContain(
      `[people.tofu]\ndisplay = "Tofu"\nnicknames = ["T"]\ndiscord_ids = ["${TOFU_DC}"]\ngithub_logins = ["tofu-dev"]\ngithub_ids = ["4242"]\n`,
    );
    // Every other line kept verbatim (other people, [owner], comments, notes).
    expect(text.startsWith(SAMPLE_TOML.trimEnd())).toBe(true);

    out = await run(f, "unlink", { person: "tofu", github: "tofu-dev", nickname: "nope" });
    expect(out).toContain("unlinked GitHub @tofu-dev");
    expect(out).toContain('Not linked (unchanged): nickname "nope"');
    // The login is a label: the numeric id stays linked and still matches.
    expect(out).toContain("GitHub id 4242 stays linked, so GitHub still recognises them — unlink github_id to stop that (IDENTITY-7.a).");
    expect(who(f, { githubId: 4242 })).toBe("tofu");
    expect(who(f, { discordId: TOFU_DC })).toBe("tofu");

    out = await run(f, "add", { person: "tofu", display: "Tofu the Dev" });
    expect(out).toContain("display name changed from Tofu");
    expect(resolvePerson(loadDeclaredPeople({ allowlist: f.ctx.allowlist, owner: OWNER }), { discordId: TOFU_DC })?.displayName).toBe(
      "Tofu the Dev",
    );

    out = await run(f, "remove", { person: "tofu" });
    expect(out).toContain('"tofu" (Tofu the Dev) is no longer a declared person (3 links dropped)');
    expect(who(f, { githubId: 4242 })).toBeNull();
    expect(who(f, { discordId: TOFU_DC })).toBeNull();
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE_TOML);

    expect(audit(f.db)).toEqual([
      ["admin-people-add", OWNER_ID, "discord:admin", "started"],
      ["admin-people-add", OWNER_ID, "discord:admin", "ok"],
      ["admin-people-link", OWNER_ID, "discord:admin", "started"],
      ["admin-people-link", OWNER_ID, "discord:admin", "ok"],
      ["admin-people-unlink", OWNER_ID, "discord:admin", "started"],
      ["admin-people-unlink", OWNER_ID, "discord:admin", "ok"],
      ["admin-people-add", OWNER_ID, "discord:admin", "started"],
      ["admin-people-add", OWNER_ID, "discord:admin", "ok"],
      ["admin-people-remove", OWNER_ID, "discord:admin", "started"],
      ["admin-people-remove", OWNER_ID, "discord:admin", "ok"],
    ]);
  });

  test("editing a hand-written person keeps its comments and unread keys; remove keeps the next section's comment", async () => {
    const f = await fixture();
    await run(f, "link", { person: "ada", github: "ada" });
    const text = readFileSync(f.path, "utf8");
    expect(text).toContain(
      `[people.ada]  # hand-written\n# Ada from the hackathon\ndisplay = "Ada"\ndiscord_ids = ["${ADA_DC}"]\ngithub_logins = ["ada"]\ngithub_ids = ["5151"]\nteam = "infra"\n`,
    );
    await run(f, "remove", { person: "ada" });
    const after = readFileSync(f.path, "utf8");
    expect(after).not.toContain("[people.ada]");
    expect(after).not.toContain("Ada from the hackathon");
    expect(after).toContain('display = "Leif # the owner"\n\n# the next section is unrelated\n[notes]\ntext = "keep me"\n');
    expect((await loadOwnerConfig({ env: {}, filePath: f.path })).owner?.display).toBe("Leif # the owner");
    expect(parseAllowlistText(after, f.path).discord.channels).toEqual([CHAN]);
  });

  test("no change: add of a declared person, link already there, remove of nobody (no audit rows)", async () => {
    const f = await fixture();
    expect(await run(f, "add", { person: "ada" })).toContain('No change: "ada" is already declared as Ada');
    expect(await run(f, "link", { person: "ada", discord: ADA_DC })).toContain(`No change: "ada" already has Discord <@${ADA_DC}>`);
    expect(await run(f, "remove", { person: "zed" })).toContain('No change: "zed" is not a declared person');
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE_TOML);
    expect(audit(f.db)).toEqual([]);
  });

  test("a new file is created where /admin writes, and chat reads it at once", async () => {
    const f = await fixture({ text: null });
    expect(f.ctx.allowlist.sourcePath).toBeNull();
    const out = await run(f, "add", { person: "tofu", display: "Tofu" });
    expect(out).toContain("(created): people 0 → 1");
    await run(f, "link", { person: "tofu", discord: TOFU_DC });
    expect(f.ctx.allowlist.sourcePath).toBe(f.path);
    expect(who(f, { discordId: TOFU_DC })).toBe("tofu");
    // The loader reads the created file after a restart too.
    const reloaded = await loadAllowlist({ env: { CORVIDINHO_ALLOWLIST_FILE: f.path }, home: f.dir });
    expect(reloaded.sourcePath).toBe(f.path);
  });

  test("JSON allowlist file: only that person's entry changes; other keys and unread person keys stay", async () => {
    const json = {
      discord: { channels: [CHAN] },
      owner: { discord_id: OWNER_ID },
      people: { Ada: { display: "Ada", discord_id: ADA_DC, team: "infra" } },
    };
    const f = await fixture({ fileName: "allowlist.json", text: JSON.stringify(json, null, 2) });
    await run(f, "link", { person: "ada", github_id: "77" });
    await run(f, "add", { person: "tofu" });
    await run(f, "link", { person: "tofu", discord: TOFU_DC });
    const after = JSON.parse(readFileSync(f.path, "utf8"));
    expect(after.discord).toEqual(json.discord);
    expect(after.owner).toEqual(json.owner);
    expect(after.people).toEqual({
      Ada: { display: "Ada", discord_ids: [ADA_DC], github_ids: ["77"], team: "infra" },
      tofu: { discord_ids: [TOFU_DC] },
    });
    expect(who(f, { githubId: "77" })).toBe("ada");
    await run(f, "remove", { person: "ada" });
    expect(Object.keys(JSON.parse(readFileSync(f.path, "utf8")).people)).toEqual(["tofu"]);
  });
});

describe("/admin people refusals (fail closed; nothing written)", () => {
  test("an id already linked to another person is refused (it would match nobody)", async () => {
    const f = await fixture();
    await run(f, "add", { person: "tofu" });
    const before = readFileSync(f.path, "utf8");
    const out = await run(f, "link", { person: "tofu", discord: ADA_DC });
    expect(out).toContain(`Refused: Discord <@${ADA_DC}> is already linked to "ada"`);
    // The owner's GitHub login from [owner] belongs to the owner.
    expect(await run(f, "link", { person: "tofu", github: "0xLeif" })).toContain('already linked to "owner"');
    expect(readFileSync(f.path, "utf8")).toBe(before);
    expect(audit(f.db).slice(-2)).toEqual([
      ["admin-people-link", OWNER_ID, "discord:admin", "denied"],
      ["admin-people-link", OWNER_ID, "discord:admin", "denied"],
    ]);
  });

  test("the owner can name themselves: linking the owner's Discord id to a person makes it the owner's person", async () => {
    const f = await fixture();
    await run(f, "add", { person: "leif", display: "Leif" });
    await run(f, "link", { person: "leif", discord: OWNER_ID });
    const people = () => loadDeclaredPeople({ allowlist: f.ctx.allowlist, owner: OWNER });
    expect(resolvePerson(people(), { discordId: OWNER_ID })).toMatchObject({ personId: "leif", role: "owner" });
    // IDENTITY-7.a: on GitHub the owner is theirs once the numeric id is linked, never by the [owner] login.
    expect(resolvePerson(people(), { githubLogin: "0xleif" })).toBeNull();
    await run(f, "link", { person: "leif", github: "0xLeif" });
    expect(resolvePerson(people(), { githubId: 8268288 })).toMatchObject({ personId: "leif", role: "owner" });
  });

  test("bad input: person id, reserved owner id, unknown person, bad link values, missing links", async () => {
    const f = await fixture();
    expect(await run(f, "add", { person: "Bad Id!" })).toContain("Refused: a person id is 1–32 lowercase letters");
    expect(await run(f, "add", { person: "owner" })).toContain('Refused: person id "owner" is reserved');
    expect(await run(f, "link", { person: "zed", discord: TOFU_DC })).toContain(
      'Refused: person "zed" is not declared — /admin people add person:zed first',
    );
    expect(await run(f, "link", { person: "ada", discord: "not-an-id" })).toContain("Refused: discord is not a valid Discord user");
    expect(await run(f, "link", { person: "ada", github: "bad login!" })).toContain("Refused: github is not a valid GitHub login");
    expect(await run(f, "link", { person: "ada", github_id: "12x" })).toContain("Refused: github_id is not a valid GitHub numeric user id");
    expect(await run(f, "link", { person: "ada" })).toContain("usage: /admin people link");
    expect(await run(f, "add", {})).toContain("usage: /admin people add");
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE_TOML);
  });

  test("an unreadable person entry is not edited (fix it on the VM)", async () => {
    const text = `${SAMPLE_TOML}\n[people.bad]\ndiscord_ids = ["nope"]\n`;
    const f = await fixture({ text });
    const out = await run(f, "link", { person: "bad", discord: TOFU_DC });
    expect(out).toContain('Refused: person "bad" has an entry that cannot be read');
    expect(out).toContain("fix it in the allowlist file on the VM first");
    expect(readFileSync(f.path, "utf8")).toBe(text);
  });

  test("no audit trail ⇒ refused, nothing written (SAFE-5 fail closed)", async () => {
    const f = await fixture({ recordAudit: null });
    expect(await run(f, "add", { person: "tofu" })).toContain("Refused: audit log unavailable (SAFE-5)");
    const g = await fixture({
      recordAudit: () => {
        throw new Error("disk full");
      },
    });
    expect(await run(g, "add", { person: "tofu" })).toContain("disk full");
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE_TOML);
    expect(readFileSync(g.path, "utf8")).toBe(SAMPLE_TOML);
    expect(readdirSync(f.dir)).toEqual(["allowlist.toml"]);
  });
});

describe("only the owner, never through chat (IDENTITY-6)", () => {
  test("non-owner: refused at dispatch and again at the handler (audited denied); file untouched", async () => {
    const f = await fixture();
    const i = ix("link", { person: "ada", discord: TOFU_DC }, TOFU_DC);
    const r = await handleSlashInteraction(f.ctx, i);
    expect(r).toMatchObject({ ok: false, reason: "insufficient_permission" });
    expect(i.replies[0]?.content).toBe(NOT_AUTHORIZED);

    const j = ix("remove", { person: "ada" }, TOFU_DC);
    await handleAdminCommand(f.ctx, j);
    expect(j.replies[0]).toEqual({ content: NOT_AUTHORIZED, ephemeral: true });
    expect(audit(f.db)).toEqual([["admin-people-remove", TOFU_DC, "discord:admin", "denied"]]);
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE_TOML);

    const k = ix("list", {}, TOFU_DC);
    await handleAdminCommand(f.ctx, k);
    expect(k.replies[0]?.content).toBe(NOT_AUTHORIZED);
  });

  test("the people writer is reachable only from /admin: no plugin, chat path or other module imports it", () => {
    const root = join(import.meta.dir, "..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".ts") && /admin-people(\.ts)?["']/.test(readFileSync(p, "utf8"))) {
          hits.push(p.slice(root.length + 1));
        }
      }
    };
    walk(join(root, "src"));
    walk(join(root, "plugins"));
    expect(hits).toEqual(["src/discord/command-handlers/admin.ts"]);
  });
});

describe("/admin people list and config show (read-only)", () => {
  test("list shows declared people, the owner and problems; config show counts them", async () => {
    const f = await fixture({ text: `${SAMPLE_TOML}\n[people.bad]\ndiscord_ids = ["nope"]\n` });
    const out = await run(f, "list", {});
    expect(out).toContain(`Allowlist file: \`${f.path}\` — 1 declared`);
    expect(out).toContain(`• ada · Ada · Discord <@${ADA_DC}>`);
    expect(out).toContain(`• owner (from [owner] / env) · Leif · Discord <@${OWNER_ID}> · GitHub @0xleif — **owner**`);
    expect(out).toContain(
      '⚠️ 2 problem(s): person "ada": key team is not read (ignored); person "bad": a discord id is not a numeric Discord snowflake — skipped',
    );
    expect(out).toContain("never through chat");
    const show = ix("show", {});
    show.subcommandGroup = "config";
    await handleAdminCommand(f.ctx, show);
    const cfg = show.replies[0]?.content ?? "";
    expect(cfg).toContain("Declared people: 1 (⚠️ 2 problem(s)) — /admin people list (IDENTITY-13)");
    expect(cfg).toContain("declared people (/admin people add|link|unlink|remove)");
  });

  test("list stays under Discord's 2000-character cap", async () => {
    const many = Array.from({ length: 80 }, (_, n) => `[people.p${n}]\ndisplay = "Person number ${n} with a long name"\ndiscord_ids = ["${9000000000 + n}"]\n`).join("\n");
    const f = await fixture({ text: `${SAMPLE_TOML}\n${many}` });
    const out = await run(f, "list", {});
    expect(out.length).toBeLessThanOrEqual(2000);
    expect(out).toMatch(/… \+\d+ more \(see the file\)/);
  });
});

describe("writers (pure)", () => {
  test("setTomlPerson appends, edits in place and removes; setJsonPerson keeps other keys", () => {
    const p = { id: "zed", display: 'Zed "Z" \\ Q', nicknames: ["z#1"], discordIds: ["9"], githubLogins: [], githubIds: [] };
    const added = setTomlPerson("[discord]\nchannels = [\n  \"1\",\n]\n", "zed", p);
    expect(added).toBe(`[discord]\nchannels = [\n  "1",\n]\n\n[people.zed]\ndisplay = "Zed \\"Z\\" \\\\ Q"\nnicknames = ["z#1"]\ndiscord_ids = ["9"]\n`);
    expect(parsePeopleText(added, false).people).toEqual([p]);
    expect(setTomlPerson(added, "zed", null)).toBe('[discord]\nchannels = [\n  "1",\n]\n');
    expect(setJsonPerson("{}", "zed", null)).toBe("{}");
    expect(JSON.parse(setJsonPerson('{"x":1}', "zed", p))).toEqual({
      x: 1,
      people: { zed: { display: 'Zed "Z" \\ Q', nicknames: ["z#1"], discord_ids: ["9"] } },
    });
  });
});
