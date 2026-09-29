/**
 * IDENTITY-13 / IDENTITY-14 / IDENTITY-7 — declared people in the allowlist
 * file (#36): parsing (TOML + JSON, fail closed), the one resolver
 * (`resolvePerson`), the owner's person, and live re-reads. Temp files only.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAllowlist, parseAllowlistText } from "../src/allowlist/load.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import { loadOwnerConfig, type OwnerRecord } from "../src/identity/owner.ts";
import {
  buildPeopleDirectory,
  loadDeclaredPeople,
  OWNER_PERSON_ID,
  parsePeopleJson,
  parsePeopleText,
  parsePeopleToml,
  resolvePerson,
  type PeopleDirectory,
} from "../src/identity/people.ts";

const OWNER_ID = "181969874455756800";
const TOFU_DC = "222222222222222222";
const ADA_DC = "333333333333333333";
const OWNER: OwnerRecord = { discordId: OWNER_ID, githubLogin: "0xleif", display: "Leif" };

const SAMPLE = `[discord]
channels = ["1"]

[owner]
discord_id = "${OWNER_ID}"

[people.tofu]
display = "Tofu # the dev"
nicknames = ["T", 'Toff']
discord_ids = ["${TOFU_DC}"]
github_logins = ["Tofu-Dev"]
github_ids = [4242]

[people.ada]   # singular keys, as [owner] spells them
display = 'Ada L'
discord_id = "${ADA_DC}"
github_login = "@ada"
`;

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "corvidinho-people-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function dir(text: string, owner: OwnerRecord | null = OWNER): PeopleDirectory {
  return buildPeopleDirectory(parsePeopleToml(text), owner);
}

describe("parse (IDENTITY-13: the owner's list is who's who)", () => {
  test("TOML [people.<id>] plural and singular keys; the loader still reads the file", async () => {
    const r = parsePeopleToml(SAMPLE);
    expect(r.issues).toEqual([]);
    expect(r.people).toEqual([
      {
        id: "tofu",
        display: "Tofu # the dev",
        nicknames: ["T", "Toff"],
        discordIds: [TOFU_DC],
        githubLogins: ["tofu-dev"],
        githubIds: ["4242"],
      },
      { id: "ada", display: "Ada L", nicknames: [], discordIds: [ADA_DC], githubLogins: ["ada"], githubIds: [] },
    ]);
    // The allowlist loader and the [owner] reader are unaffected by people sections.
    expect(parseAllowlistText(SAMPLE, "/x/allowlist.toml").discord.channels).toEqual(["1"]);
    const d = tmp();
    const path = join(d, "allowlist.toml");
    writeFileSync(path, SAMPLE);
    expect((await loadOwnerConfig({ env: {}, filePath: path })).owner?.discordId).toBe(OWNER_ID);
    expect((await loadAllowlist({ env: {}, filePath: path })).discord.channels).toEqual(["1"]);
  });

  test("JSON people object; numeric Discord ids refused (precision), numeric GitHub ids read", () => {
    const r = parsePeopleJson({
      people: {
        Tofu: { display: "Tofu", discord_ids: [TOFU_DC], github_ids: [4242], github_logins: "tofu-dev" },
        bad: { discord_ids: [222222222222222222] },
      },
    });
    expect(r.people).toEqual([
      { id: "tofu", display: "Tofu", nicknames: [], discordIds: [TOFU_DC], githubLogins: ["tofu-dev"], githubIds: ["4242"] },
    ]);
    expect(r.invalid).toEqual(["bad"]);
    expect(r.issues.join("\n")).toContain("quote Discord ids as strings");
    expect(parsePeopleText("{ not json", true).issues).toEqual([
      "JSON allowlist file could not be parsed for declared people",
    ]);
  });

  test("fail closed: an unreadable entry is skipped whole; issues never echo account ids", () => {
    const r = parsePeopleToml(`[people.tofu]
display = "Tofu"
discord_ids = ["${TOFU_DC}", "not-a-snowflake"]

[people.ada]
discord_ids = [
  "${ADA_DC}",
]

[people.dup]
discord_ids = ["1"]
[people.dup]
github_logins = ["x"]

[people.owner]
discord_ids = ["2"]

[people.Bad.Id]
discord_ids = ["3"]

[people.ok]
github_ids = ["77"]
colour = "blue"
`);
    expect(r.people.map((p) => p.id)).toEqual(["ok"]);
    expect(r.invalid.sort()).toEqual(["ada", "dup", "tofu"]);
    const issues = r.issues.join("\n");
    expect(issues).toContain('person "tofu": a discord id is not a numeric Discord snowflake');
    expect(issues).toContain("keep each [people.*] list on one line");
    expect(issues).toContain('person "dup" is declared 2 times');
    expect(issues).toContain('person id "owner" is reserved');
    expect(issues).toContain("key colour is not read (ignored)");
    expect(issues).not.toContain(TOFU_DC);
    expect(issues).not.toContain(ADA_DC);
  });
});

describe("resolvePerson (IDENTITY-14 recognise; IDENTITY-7 stable ids only)", () => {
  test("Discord user id, GitHub login (any case, @) and GitHub numeric id each resolve", () => {
    const d = dir(SAMPLE);
    expect(resolvePerson(d, { discordId: TOFU_DC })).toMatchObject({ personId: "tofu", displayName: "Tofu # the dev" });
    expect(resolvePerson(d, { discordId: `<@${TOFU_DC}>` })?.personId).toBe("tofu");
    expect(resolvePerson(d, { githubLogin: "@TOFU-dev" })?.personId).toBe("tofu");
    expect(resolvePerson(d, { githubId: 4242 })?.personId).toBe("tofu");
    expect(resolvePerson(d, { githubId: "4242" })?.personId).toBe("tofu");
    expect(resolvePerson(d, { githubLogin: "ada" })).toMatchObject({ personId: "ada", displayName: "Ada L" });
    expect(resolvePerson(d, { discordId: TOFU_DC })?.role).toBeUndefined();
  });

  test("names never match: display names and nicknames resolve nobody", () => {
    const d = dir(SAMPLE);
    for (const name of ["Tofu # the dev", "Tofu", "T", "Toff", "Ada L", "Ada-L"]) {
      expect(resolvePerson(d, { githubLogin: name })).toBeNull();
      expect(resolvePerson(d, { discordId: name })).toBeNull();
    }
    expect(resolvePerson(d, {})).toBeNull();
    expect(resolvePerson(null, { discordId: TOFU_DC })).toBeNull();
  });

  test("a login is not trusted when the GitHub id is known and differs (renamed / reused login)", () => {
    const d = dir(SAMPLE);
    expect(resolvePerson(d, { githubLogin: "tofu-dev", githubId: 9999 })).toBeNull();
    expect(resolvePerson(d, { githubLogin: "tofu-dev", githubId: 4242 })?.personId).toBe("tofu");
    // ada declared no GitHub id: the login alone still resolves.
    expect(resolvePerson(d, { githubLogin: "ada", githubId: 9999 })?.personId).toBe("ada");
  });

  test("ids pointing at two different people, or one id linked to two people, resolve nobody", () => {
    const d = dir(SAMPLE);
    expect(resolvePerson(d, { discordId: TOFU_DC, githubLogin: "ada" })).toBeNull();
    const clash = dir(`[people.a]\ndiscord_ids = ["${TOFU_DC}"]\n[people.b]\ndiscord_ids = ["${TOFU_DC}"]\n`);
    expect(resolvePerson(clash, { discordId: TOFU_DC })).toBeNull();
    expect(clash.issues.join("\n")).toContain("a Discord id is linked to more than one person (a, b)");
    expect(clash.issues.join("\n")).not.toContain(TOFU_DC);
  });

  test("the owner is always a person: built-in from [owner]/env, or the declared person holding the owner's Discord id", () => {
    const builtIn = dir(SAMPLE);
    expect(builtIn.ownerPersonId).toBe(OWNER_PERSON_ID);
    expect(resolvePerson(builtIn, { discordId: OWNER_ID })).toMatchObject({
      personId: "owner",
      displayName: "Leif",
      role: "owner",
    });
    expect(resolvePerson(builtIn, { githubLogin: "0xLeif" })?.role).toBe("owner");

    const declared = dir(`${SAMPLE}\n[people.leif]\nnicknames = ["L"]\ndiscord_ids = ["${OWNER_ID}"]\ngithub_ids = ["1"]\n`);
    expect(declared.ownerPersonId).toBe("leif");
    expect(declared.people.some((p) => p.id === OWNER_PERSON_ID)).toBe(false);
    const leif = resolvePerson(declared, { githubLogin: "0xleif", githubId: 1 });
    expect(leif).toMatchObject({ personId: "leif", displayName: "Leif", role: "owner" });
    expect(leif?.person.githubLogins).toEqual(["0xleif"]);

    const noOwner = dir(SAMPLE, null);
    expect(noOwner.ownerPersonId).toBeNull();
    expect(resolvePerson(noOwner, { discordId: OWNER_ID })).toBeNull();
  });
});

describe("loadDeclaredPeople (live; the file the process loaded)", () => {
  test("re-reads the loaded file on every call; no file loaded ⇒ only the owner; never throws", () => {
    const d = tmp();
    const path = join(d, "allowlist.toml");
    const allowlist = { ...emptyConfig(), sourcePath: path };
    // Loaded path missing: only the owner.
    expect(loadDeclaredPeople({ allowlist, owner: OWNER }).people.map((p) => p.id)).toEqual(["owner"]);
    writeFileSync(path, SAMPLE);
    expect(resolvePerson(loadDeclaredPeople({ allowlist, owner: OWNER }), { discordId: ADA_DC })?.personId).toBe("ada");
    writeFileSync(path, SAMPLE.replace(/\[people\.ada\][\s\S]*$/, ""));
    expect(resolvePerson(loadDeclaredPeople({ allowlist, owner: OWNER }), { discordId: ADA_DC })).toBeNull();
    // No file loaded (sourcePath null, e.g. env-only start): nobody but the
    // owner, even with a file at the default path — as [owner] is read.
    const none = loadDeclaredPeople({ allowlist: emptyConfig(), owner: OWNER });
    expect(none.people.map((p) => p.id)).toEqual(["owner"]);
    expect(loadDeclaredPeople({ allowlist: emptyConfig(), owner: null }).people).toEqual([]);
    // A directory where the file should be reads as nobody declared.
    const broken = loadDeclaredPeople({ allowlist: { ...allowlist, sourcePath: d }, owner: null });
    expect(broken.people).toEqual([]);
    expect(broken.issues).toEqual(["allowlist file could not be read for declared people"]);
  });
});
