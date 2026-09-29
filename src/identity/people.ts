/**
 * IDENTITY-13 / IDENTITY-14 / IDENTITY-6 / IDENTITY-7 — declared people (#36).
 *
 * The owner declares who's who in the allowlist file the process loaded
 * (ALLOW-4; `CORVIDINHO_ALLOWLIST_FILE`, else ~/.config/corvidinho/
 * allowlist.toml|json) — the file `[owner]` is read from. No second store,
 * no env, no DB table:
 *
 *   TOML  [people.<id>]                       JSON  { "people": { "<id>": {
 *         display = "Tofu"                              "display": "Tofu",
 *         nicknames = ["T"]                             "nicknames": ["T"],
 *         discord_ids = ["123456789012345678"]          "discord_ids": ["1234…"],
 *         github_logins = ["tofu-dev"]                  "github_logins": ["tofu-dev"],
 *         github_ids = ["4242"]                         "github_ids": ["4242"] } } }
 *
 * Singular keys (`discord_id`, `github_login`, `github_id`, `nickname`) are
 * read too, as the `[owner]` section spells them. Values stay on one line.
 *
 * - People are matched only on stable ids: Discord user snowflakes, GitHub
 *   numeric ids and GitHub logins (IDENTITY-7). Display names and nicknames
 *   are for humans and the prompt; they never match anyone.
 * - A login match is dropped when the caller also knows the GitHub numeric id
 *   and the person declared ids that do not include it (renamed or re-used
 *   login).
 * - Fail closed: a person entry with any unreadable value is skipped whole
 *   (never half-matched), and an id declared for two people matches nobody.
 *   Problems are reported as plain-language issues that name the person id
 *   and key, never the account ids.
 * - The configured owner (IDENTITY-1) is always a person: the declared person
 *   whose `discord_ids` hold the owner's Discord id, else a built-in `owner`
 *   entry from `[owner]` / env. Its `role` is "owner"; other roles (#65) are
 *   not read yet.
 * - Only the owner changes the list: by editing the file on the VM, or with
 *   owner-only, audited `/admin people …` (ADMIN-3.a). Chat and the model have
 *   no writer (IDENTITY-6).
 */

import { existsSync, readFileSync } from "node:fs";
import {
  normalizeDisplay,
  normalizeGithubLogin,
  type OwnerRecord,
} from "./owner.ts";

/** Person ids: the `<id>` of `[people.<id>]`. Lowercase slug. */
export const PERSON_ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
/** Reserved for the built-in owner entry (`[owner]` / env). */
export const OWNER_PERSON_ID = "owner";

const SNOWFLAKE_RE = /^\d{1,25}$/;
const GITHUB_LOGIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,38})$/;
const GITHUB_ID_RE = /^\d{1,20}$/;
// Control characters (other than whitespace, which normalizeDisplay collapses).
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000e-\u001f\u007f]/g;

/** Roles a resolved person can carry. #65 adds team / community. */
export type PersonRole = "owner";

/** Kinds of link `/admin people link|unlink` changes. */
export type PersonLinkKind = "discord" | "github" | "github_id" | "nickname";

export type DeclaredPerson = {
  /** `<id>` of `[people.<id>]` (or `owner` for the built-in owner entry). */
  id: string;
  /** Human display name (never matched). */
  display?: string;
  /** Nicknames (never matched; shown to the model). */
  nicknames: string[];
  /** Discord user snowflakes. */
  discordIds: string[];
  /** Lowercased GitHub logins without `@`. */
  githubLogins: string[];
  /** GitHub numeric user ids (digits). */
  githubIds: string[];
};

export type PeopleParseResult = {
  /** Valid entries, in file order. */
  people: DeclaredPerson[];
  /** Person ids present in the file but skipped (unreadable value, duplicate section…). */
  invalid: string[];
  /** Plain-language problems; name person ids and keys, never account ids. */
  issues: string[];
};

export type PeopleDirectory = {
  /** Effective entries: declared people plus the built-in owner when not declared. */
  people: DeclaredPerson[];
  /** Id of the owner's person, or null with no owner configured. */
  ownerPersonId: string | null;
  owner: OwnerRecord | null;
  issues: string[];
  /** Stable-id indexes (ids declared for two people are left out). */
  byDiscordId: Map<string, string>;
  byGithubLogin: Map<string, string>;
  byGithubId: Map<string, string>;
};

/** What a surface knows about the actor: only stable ids (IDENTITY-7). */
export type PersonQuery = {
  discordId?: string | null;
  githubLogin?: string | null;
  githubId?: string | number | null;
};

export type ResolvedPerson = {
  personId: string;
  /** Declared display, else the owner's display (owner), else first nickname, else the id; undefined only for a built-in owner with no display. */
  displayName?: string;
  /** "owner" for the configured owner; other roles arrive with #65. */
  role?: PersonRole;
  /** The effective entry (links and nicknames). */
  person: DeclaredPerson;
};

/** Empty entry for `id`. */
export function emptyPerson(id: string): DeclaredPerson {
  return { id, nicknames: [], discordIds: [], githubLogins: [], githubIds: [] };
}

/** Human label (display / nickname): one line, no control characters, ≤64 chars. */
export function cleanPersonLabel(raw: string | undefined | null): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  return normalizeDisplay(String(raw).replace(CONTROL_RE, ""));
}

/** Discord snowflake from a raw id or a `<@id>` / `<@!id>` mention; else undefined. */
export function normalizeDiscordUserId(raw: string | undefined | null): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const t = String(raw).trim();
  const m = t.match(/^<@!?(\d{1,25})>$/);
  const id = m ? m[1]! : t;
  return SNOWFLAKE_RE.test(id) ? id : undefined;
}

/** Valid lowercased GitHub login, else undefined. */
export function validGithubLogin(raw: string | undefined | null): string | undefined {
  const l = normalizeGithubLogin(raw);
  return l && GITHUB_LOGIN_RE.test(l) ? l : undefined;
}

/** GitHub numeric id as digits, else undefined. */
export function normalizeGithubId(raw: string | number | undefined | null): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number") {
    return Number.isSafeInteger(raw) && raw > 0 ? String(raw) : undefined;
  }
  const t = raw.trim();
  return GITHUB_ID_RE.test(t) ? t.replace(/^0+(?=\d)/, "") : undefined;
}

// ---------------------------------------------------------------------------
// Parsing (TOML subset + JSON)

/** DeclaredPerson fields read from the file. */
export type PersonField = "display" | "nicknames" | "discordIds" | "githubLogins" | "githubIds";
type Field = PersonField;

const KEY_FIELD: Record<string, Field> = {
  display: "display",
  nickname: "nicknames",
  nicknames: "nicknames",
  discord_id: "discordIds",
  discord_ids: "discordIds",
  github_login: "githubLogins",
  github_logins: "githubLogins",
  github_id: "githubIds",
  github_ids: "githubIds",
};

/** Keys a `[people.<id>]` entry is read from (the writer owns exactly these). */
export const PERSON_KEYS: ReadonlySet<string> = new Set(Object.keys(KEY_FIELD));

/** Directory field each `/admin people link|unlink` kind edits. */
export const LINK_FIELD: Record<PersonLinkKind, Exclude<Field, "display">> = {
  discord: "discordIds",
  github: "githubLogins",
  github_id: "githubIds",
  nickname: "nicknames",
};

/**
 * Normalized link value, or undefined when `raw` is not a valid value of
 * that kind (Discord snowflake or `<@id>`, GitHub login, GitHub numeric id,
 * one-line nickname).
 */
export function normalizePersonLink(kind: PersonLinkKind, raw: string | undefined | null): string | undefined {
  if (kind === "discord") return normalizeDiscordUserId(raw);
  if (kind === "github") return validGithubLogin(raw);
  if (kind === "github_id") return normalizeGithubId(raw);
  return cleanPersonLabel(raw);
}

type RawPerson = {
  id: string;
  values: Partial<Record<Field, string[]>>;
  bad: boolean;
};

const BARE_ITEM_RE = /^[A-Za-z0-9_.@+-]+/;

function blankOrComment(rest: string): boolean {
  const t = rest.trim();
  return t === "" || t.startsWith("#");
}

/** `"…"` (only `\"` / `\\` escapes) or `'…'` starting at `col`. */
function readQuotedAt(s: string, col: number): { text: string; end: number } | { error: string } {
  const q = s[col]!;
  let text = "";
  for (let j = col + 1; j < s.length; j++) {
    const c = s[j]!;
    if (c === q) return { text, end: j + 1 };
    if (q === '"' && c === "\\") {
      const n = s[j + 1];
      if (n !== '"' && n !== "\\") return { error: "unsupported escape in string" };
      text += n;
      j++;
      continue;
    }
    text += c;
  }
  return { error: "unterminated string" };
}

/**
 * One-line TOML value: a quoted string, a bare word, or an array of those.
 * Returns the items and whether it was an array.
 */
export function parsePeopleTomlValue(
  raw: string,
): { items: string[]; array: boolean } | { error: string } {
  const s = raw.trim();
  if (!s) return { error: "missing value" };
  const c = s[0]!;
  if (c === '"' || c === "'") {
    const r = readQuotedAt(s, 0);
    if ("error" in r) return r;
    if (!blankOrComment(s.slice(r.end))) return { error: "unexpected text after string" };
    return { items: [r.text], array: false };
  }
  if (c === "[") {
    const items: string[] = [];
    let col = 1;
    let needItem = true;
    for (;;) {
      while (col < s.length && /\s/.test(s[col]!)) col++;
      if (col >= s.length || s[col] === "#") {
        return { error: "array not closed on its line (keep each [people.*] list on one line)" };
      }
      const ch = s[col]!;
      if (ch === "]") {
        if (!blankOrComment(s.slice(col + 1))) return { error: 'unexpected text after "]"' };
        return { items, array: true };
      }
      if (ch === ",") {
        if (needItem) return { error: 'unexpected ","' };
        needItem = true;
        col++;
        continue;
      }
      if (!needItem) return { error: 'expected "," or "]" between items' };
      if (ch === '"' || ch === "'") {
        const r = readQuotedAt(s, col);
        if ("error" in r) return r;
        items.push(r.text);
        col = r.end;
      } else {
        const m = s.slice(col).match(BARE_ITEM_RE);
        if (!m) return { error: `unexpected "${ch}"` };
        items.push(m[0]);
        col += m[0].length;
      }
      needItem = false;
    }
  }
  const m = s.match(BARE_ITEM_RE);
  if (!m || !blankOrComment(s.slice(m[0].length))) return { error: "cannot parse value" };
  return { items: [m[0]], array: false };
}

const HEADER_LINE_RE = /^\[\s*([^[\]]+?)\s*\]\s*(?:#.*)?$/;

/** Section name of a header line (lowercased), or null for another `[`-line. */
export function tomlHeaderName(line: string): string | null {
  const m = line.trim().match(HEADER_LINE_RE);
  return m ? m[1]!.toLowerCase() : null;
}

/** `people.<id>` → `<id>`; `people` alone → ""; other sections → null. */
export function personIdOfSection(section: string | null): string | null {
  if (section === null) return null;
  if (section === "people") return "";
  return section.startsWith("people.") ? section.slice("people.".length) : null;
}

function finishPeople(raws: RawPerson[], issues: string[]): PeopleParseResult {
  const people: DeclaredPerson[] = [];
  const invalid: string[] = [];
  const seen = new Map<string, number>();
  for (const r of raws) seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
  for (const [id, n] of seen) {
    if (n > 1) issues.push(`person "${id}" is declared ${n} times — skipped until there is one entry`);
  }
  for (const r of raws) {
    if (seen.get(r.id)! > 1) {
      if (!invalid.includes(r.id)) invalid.push(r.id);
      continue;
    }
    const p = r.bad ? null : validatePerson(r, issues);
    if (p) people.push(p);
    else invalid.push(r.id);
  }
  return { people, invalid, issues };
}

function uniq(list: string[], key: (s: string) => string = (s) => s): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of list) {
    const k = key(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function validatePerson(r: RawPerson, issues: string[]): DeclaredPerson | null {
  const where = `person "${r.id}"`;
  const p = emptyPerson(r.id);
  const v = r.values;
  if (v.display) {
    if (v.display.length !== 1) {
      issues.push(`${where}: display must be one string — skipped`);
      return null;
    }
    const d = cleanPersonLabel(v.display[0]);
    if (d) p.display = d;
  }
  p.nicknames = uniq(
    (v.nicknames ?? []).map((n) => cleanPersonLabel(n)).filter((n): n is string => !!n),
    (n) => n.toLowerCase(),
  );
  for (const raw of v.discordIds ?? []) {
    const id = raw.trim();
    if (!SNOWFLAKE_RE.test(id)) {
      issues.push(`${where}: a discord id is not a numeric Discord snowflake — skipped`);
      return null;
    }
    p.discordIds.push(id);
  }
  for (const raw of v.githubLogins ?? []) {
    const l = validGithubLogin(raw);
    if (!l) {
      issues.push(`${where}: a github login is not a valid GitHub login — skipped`);
      return null;
    }
    p.githubLogins.push(l);
  }
  for (const raw of v.githubIds ?? []) {
    const id = normalizeGithubId(raw);
    if (!id) {
      issues.push(`${where}: a github id is not a numeric GitHub user id — skipped`);
      return null;
    }
    p.githubIds.push(id);
  }
  p.discordIds = uniq(p.discordIds);
  p.githubLogins = uniq(p.githubLogins);
  p.githubIds = uniq(p.githubIds);
  return p;
}

function checkPersonId(id: string, issues: string[]): boolean {
  if (id === "") {
    issues.push("[people] needs a person id — write [people.<id>] (letters, digits, - and _)");
    return false;
  }
  if (id === OWNER_PERSON_ID) {
    issues.push(`person id "${OWNER_PERSON_ID}" is reserved for [owner] — pick another id (skipped)`);
    return false;
  }
  if (!PERSON_ID_RE.test(id)) {
    issues.push("a [people.<id>] id must be lowercase letters, digits, - or _ (≤32 chars) — skipped");
    return false;
  }
  return true;
}

/** Read `[people.<id>]` sections from allowlist TOML text. Never throws. */
export function parsePeopleToml(text: string): PeopleParseResult {
  const issues: string[] = [];
  const raws: RawPerson[] = [];
  let current: RawPerson | null = null;
  let inPeople = false;
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("[")) {
      const pid = personIdOfSection(tomlHeaderName(line));
      current = null;
      inPeople = pid !== null;
      if (pid === null) continue;
      if (!checkPersonId(pid, issues)) continue;
      current = { id: pid, values: {}, bad: false };
      raws.push(current);
      continue;
    }
    if (!inPeople || !current) continue;
    const where = `person "${current.id}"`;
    const kv = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!kv) {
      if (!current.bad) issues.push(`${where}: a line is not key = value — skipped`);
      current.bad = true;
      continue;
    }
    const key = kv[1]!.toLowerCase();
    const field = KEY_FIELD[key];
    if (!field) {
      issues.push(`${where}: key ${key} is not read (ignored)`);
      continue;
    }
    const parsed = parsePeopleTomlValue(kv[2]!);
    if ("error" in parsed) {
      if (!current.bad) issues.push(`${where}.${key}: ${parsed.error} — skipped`);
      current.bad = true;
      continue;
    }
    if (field === "display" && parsed.array) {
      if (!current.bad) issues.push(`${where}.display must be a string — skipped`);
      current.bad = true;
      continue;
    }
    current.values[field] = [...(current.values[field] ?? []), ...parsed.items];
  }
  return finishPeople(raws, issues);
}

/** Read a `people` object from parsed JSON allowlist data. Never throws. */
export function parsePeopleJson(raw: unknown): PeopleParseResult {
  const issues: string[] = [];
  const raws: RawPerson[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { people: [], invalid: [], issues };
  const people = (raw as Record<string, unknown>).people;
  if (people === undefined) return { people: [], invalid: [], issues };
  if (!people || typeof people !== "object" || Array.isArray(people)) {
    issues.push('"people" in the JSON allowlist file must be an object of person entries');
    return { people: [], invalid: [], issues };
  }
  for (const [rawId, entry] of Object.entries(people as Record<string, unknown>)) {
    const id = rawId.trim().toLowerCase();
    if (!checkPersonId(id, issues)) continue;
    const r: RawPerson = { id, values: {}, bad: false };
    raws.push(r);
    const where = `person "${id}"`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      issues.push(`${where} must be an object — skipped`);
      r.bad = true;
      continue;
    }
    for (const [k, v] of Object.entries(entry as Record<string, unknown>)) {
      const key = k.toLowerCase();
      const field = KEY_FIELD[key];
      if (!field) {
        issues.push(`${where}: key ${key} is not read (ignored)`);
        continue;
      }
      const list = Array.isArray(v) ? v : [v];
      const items: string[] = [];
      for (const item of list) {
        if (typeof item === "string") items.push(item);
        else if (typeof item === "number" && field === "githubIds" && Number.isSafeInteger(item)) {
          items.push(String(item));
        } else {
          issues.push(
            typeof item === "number" && field === "discordIds"
              ? `${where}.${key}: quote Discord ids as strings (JSON numbers lose snowflake precision) — skipped`
              : `${where}.${key}: values must be strings — skipped`,
          );
          r.bad = true;
          break;
        }
      }
      if (r.bad) break;
      if (field === "display" && Array.isArray(v)) {
        issues.push(`${where}.display must be a string — skipped`);
        r.bad = true;
        break;
      }
      r.values[field] = [...(r.values[field] ?? []), ...items];
    }
  }
  return finishPeople(raws, issues);
}

/** Read people from allowlist file text (JSON when `json`, else TOML). */
export function parsePeopleText(text: string, json: boolean): PeopleParseResult {
  if (!json) return parsePeopleToml(text);
  if (!text.trim()) return { people: [], invalid: [], issues: [] };
  try {
    return parsePeopleJson(JSON.parse(text));
  } catch {
    return { people: [], invalid: [], issues: ["JSON allowlist file could not be parsed for declared people"] };
  }
}

/**
 * Read declared people from the allowlist file at `path` (sync; re-read on
 * every call so `/admin people` and VM edits apply without a restart).
 * Missing file ⇒ nobody declared. Unreadable ⇒ nobody, with an issue.
 */
export function readPeopleFile(path: string | null | undefined): PeopleParseResult {
  if (!path || !existsSync(path)) return { people: [], invalid: [], issues: [] };
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { people: [], invalid: [], issues: ["allowlist file could not be read for declared people"] };
  }
  return parsePeopleText(text, path.endsWith(".json"));
}

// ---------------------------------------------------------------------------
// Directory + resolver

/**
 * Effective directory: declared people plus the owner. The owner's person is
 * the declared entry whose `discord_ids` hold the owner's Discord id (the
 * owner's GitHub login is added to it), else a built-in `owner` entry.
 * Any id declared for two people is left out of the indexes (matches nobody).
 */
export function buildPeopleDirectory(
  parsed: PeopleParseResult,
  owner: OwnerRecord | null | undefined,
): PeopleDirectory {
  const issues = [...parsed.issues];
  const people = parsed.people.map((p) => ({
    ...p,
    nicknames: [...p.nicknames],
    discordIds: [...p.discordIds],
    githubLogins: [...p.githubLogins],
    githubIds: [...p.githubIds],
  }));
  let ownerPersonId: string | null = null;
  if (owner) {
    const holders = people.filter((p) => p.discordIds.includes(owner.discordId));
    if (holders.length === 1) {
      const p = holders[0]!;
      ownerPersonId = p.id;
      if (owner.githubLogin && !p.githubLogins.includes(owner.githubLogin)) {
        p.githubLogins.push(owner.githubLogin);
      }
    } else if (holders.length === 0) {
      ownerPersonId = OWNER_PERSON_ID;
      const p = emptyPerson(OWNER_PERSON_ID);
      if (owner.display) p.display = owner.display;
      p.discordIds.push(owner.discordId);
      if (owner.githubLogin) p.githubLogins.push(owner.githubLogin);
      people.push(p);
    }
  }

  const index = (pick: (p: DeclaredPerson) => string[], label: string): Map<string, string> => {
    const map = new Map<string, string>();
    const clash = new Map<string, Set<string>>();
    for (const p of people) {
      for (const id of pick(p)) {
        const prev = map.get(id);
        if (prev !== undefined && prev !== p.id) {
          const s = clash.get(id) ?? new Set([prev]);
          s.add(p.id);
          clash.set(id, s);
        } else {
          map.set(id, p.id);
        }
      }
    }
    for (const [id, who] of clash) {
      map.delete(id);
      issues.push(`a ${label} is linked to more than one person (${[...who].join(", ")}) — it matches nobody until fixed`);
    }
    return map;
  };

  return {
    people,
    ownerPersonId,
    owner: owner ?? null,
    issues,
    byDiscordId: index((p) => p.discordIds, "Discord id"),
    byGithubLogin: index((p) => p.githubLogins, "GitHub login"),
    byGithubId: index((p) => p.githubIds, "GitHub id"),
  };
}

/**
 * Who is this? Matches only on stable ids (IDENTITY-7): the Discord user id,
 * the GitHub numeric id, the GitHub login. A login match is dropped when the
 * GitHub id is known and the person declared other GitHub ids. No match, or
 * the ids point at two different people ⇒ null (never a guess).
 */
export function resolvePerson(
  dir: PeopleDirectory | null | undefined,
  q: PersonQuery,
): ResolvedPerson | null {
  if (!dir) return null;
  const hits = new Set<string>();
  const discordId = normalizeDiscordUserId(q.discordId ?? undefined);
  if (discordId) {
    const p = dir.byDiscordId.get(discordId);
    if (p) hits.add(p);
  }
  const githubId = normalizeGithubId(q.githubId ?? undefined);
  if (githubId) {
    const p = dir.byGithubId.get(githubId);
    if (p) hits.add(p);
  }
  const login = validGithubLogin(q.githubLogin ?? undefined);
  if (login) {
    const p = dir.byGithubLogin.get(login);
    const person = p ? dir.people.find((x) => x.id === p) : undefined;
    if (person && !(githubId && person.githubIds.length > 0 && !person.githubIds.includes(githubId))) {
      hits.add(person.id);
    }
  }
  if (hits.size !== 1) return null;
  const personId = [...hits][0]!;
  const person = dir.people.find((p) => p.id === personId);
  if (!person) return null;
  const isOwner = personId === dir.ownerPersonId;
  const displayName =
    person.display ??
    (isOwner ? dir.owner?.display : undefined) ??
    person.nicknames[0] ??
    (personId === OWNER_PERSON_ID ? undefined : personId);
  const out: ResolvedPerson = { personId, person };
  if (displayName) out.displayName = displayName;
  if (isOwner) out.role = "owner";
  return out;
}

/** Read the file and build the directory with `owner` (re-read on every call). */
export function loadPeopleDirectory(opts: {
  path: string | null | undefined;
  owner: OwnerRecord | null | undefined;
}): PeopleDirectory {
  return buildPeopleDirectory(readPeopleFile(opts.path), opts.owner);
}

/**
 * The one entry point for surfaces (Discord chat, slash, WATCH): the
 * directory for the allowlist file this process loaded (`sourcePath`, the
 * same file `[owner]` is read from), re-read now so `/admin people` and VM
 * edits apply without a restart. No file loaded ⇒ only the owner (`/admin
 * people` points `sourcePath` at the file it writes). Never throws; an
 * unexpected failure reads as nobody declared (only the owner).
 */
export function loadDeclaredPeople(opts: {
  allowlist: { sourcePath: string | null };
  owner?: OwnerRecord | null;
}): PeopleDirectory {
  try {
    return loadPeopleDirectory({ path: opts.allowlist.sourcePath, owner: opts.owner });
  } catch {
    return buildPeopleDirectory(
      { people: [], invalid: [], issues: ["declared people could not be read"] },
      opts.owner,
    );
  }
}
