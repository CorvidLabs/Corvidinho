/**
 * ADMIN-3.a / IDENTITY-6 — owner-only edits of the declared people
 * (IDENTITY-13) in the allowlist file the bridge already reads (ALLOW-4):
 * `[people.<id>]` sections (TOML) or the `people` object (JSON). No second
 * store; the only writer is `/admin people` (command-handlers/admin.ts),
 * which re-checks the owner and audits every change (SAFE-5). Chat and the
 * model have no path here.
 *
 * - The file is rewritten atomically with `writeFileAtomic` (same as
 *   `/admin users|channels`). TOML: only the keys this module reads in the
 *   one `[people.<id>]` section are rewritten (at the place of the first
 *   one); its header, comments and any other key stay verbatim, and so does
 *   every other line of the file. A new person is appended as a section; a
 *   removed person loses its header and body (comment lines just before the
 *   next section stay). JSON: only that person's entry changes.
 * - Before any write, the new text is re-read the way the loaders will read
 *   it: the allow/deny lists and `[owner]` must be unchanged, every other
 *   person must read back unchanged, and this person must read back exactly
 *   as planned. Otherwise the change is refused and nothing is written.
 * - Fail closed: a person whose entry cannot be read is not edited (fix it on
 *   the VM); a stable id (Discord id, GitHub login, GitHub id) linked to
 *   another person is refused, because it would then match nobody.
 * - Plan and commit are synchronous, so two admin commands in one bridge
 *   process cannot interleave a read-modify-write.
 */

import { existsSync, readFileSync } from "node:fs";
import {
  parseAllowlistText,
  parseSimpleToml,
  scanSimpleToml,
} from "../allowlist/load.ts";
import type { AllowlistConfig } from "../allowlist/types.ts";
import {
  ownerFieldsFromJson,
  parseOwnerToml,
  type OwnerRecord,
} from "../identity/owner.ts";
import {
  buildPeopleDirectory,
  cleanPersonLabel,
  emptyPerson,
  LINK_FIELD,
  normalizePersonLink,
  OWNER_PERSON_ID,
  parsePeopleText,
  PERSON_ID_RE,
  PERSON_KEYS,
  type DeclaredPerson,
  type PeopleParseResult,
  type PersonLinkKind,
} from "../identity/people.ts";
import {
  allowlistFileFormat,
  danglingSymlinkError,
  parseJsonObject,
  resolveAdminAllowlistPath,
  writeFileAtomic,
  type AllowlistFileFormat,
} from "./admin-allowlist.ts";

export type PeopleAdminOp = "add" | "link" | "unlink" | "remove";

export type PersonLink = { kind: PersonLinkKind; value: string };

export type PeopleAdminRequest = {
  op: PeopleAdminOp;
  /** `<id>` of `[people.<id>]`. */
  personId: string;
  /** `add`: display name (new person, or a change of an existing one's). */
  display?: string;
  /** `link` / `unlink`: raw values, normalized by the plan. */
  links?: Array<{ kind: PersonLinkKind; value: string }>;
};

export type PeopleAdminPlan = {
  path: string;
  format: AllowlistFileFormat;
  /** False when the file does not exist yet (commit creates it). */
  exists: boolean;
  op: PeopleAdminOp;
  personId: string;
  /** The entry in the file before / after (null: not declared / removed). */
  before: DeclaredPerson | null;
  after: DeclaredPerson | null;
  /** Links added (link) or removed (unlink), normalized. */
  changed: PersonLink[];
  /** Links asked for that were already there (link) or not there (unlink). */
  unchanged: PersonLink[];
  displayChanged: boolean;
  /** Declared people in the file before / after. */
  countBefore: number;
  countAfter: number;
  fileChanged: boolean;
  /** New file text when fileChanged. */
  newText?: string;
};

export type PeopleAdminPlanResult =
  | { ok: true; plan: PeopleAdminPlan }
  /** `refused`: the request is not allowed (audited "denied"); `error`: the file (audited "error"). */
  | { ok: false; kind: "refused" | "error"; path: string; error: string };

/** Human label of a link for replies (Discord ids as mentions). */
export function formatPersonLink(l: PersonLink): string {
  switch (l.kind) {
    case "discord":
      return `Discord <@${l.value}>`;
    case "github":
      return `GitHub @${l.value}`;
    case "github_id":
      return `GitHub id ${l.value}`;
    default:
      return `nickname "${l.value}"`;
  }
}

function copyPerson(p: DeclaredPerson): DeclaredPerson {
  const c: DeclaredPerson = {
    id: p.id,
    nicknames: [...p.nicknames],
    discordIds: [...p.discordIds],
    githubLogins: [...p.githubLogins],
    githubIds: [...p.githubIds],
  };
  if (p.display !== undefined) c.display = p.display;
  return c;
}

/** Field-by-field equality (order kept), independent of object key order. */
export function samePerson(a: DeclaredPerson | null, b: DeclaredPerson | null): boolean {
  if (a === null || b === null) return a === b;
  const eq = (x: readonly string[], y: readonly string[]) =>
    x.length === y.length && x.every((v, i) => v === y[i]);
  return (
    a.id === b.id &&
    (a.display ?? null) === (b.display ?? null) &&
    eq(a.nicknames, b.nicknames) &&
    eq(a.discordIds, b.discordIds) &&
    eq(a.githubLogins, b.githubLogins) &&
    eq(a.githubIds, b.githubIds)
  );
}

function hasLink(p: DeclaredPerson, l: PersonLink): boolean {
  const list = p[LINK_FIELD[l.kind]];
  return l.kind === "nickname"
    ? list.some((v) => v.toLowerCase() === l.value.toLowerCase())
    : list.includes(l.value);
}

// ---------------------------------------------------------------------------
// Rendering

function tomlQuoted(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function tomlArray(values: readonly string[]): string {
  return `[${values.map(tomlQuoted).join(", ")}]`;
}

/** The managed key lines of one person (empty lists left out). */
export function renderPersonTomlLines(p: DeclaredPerson): string[] {
  const lines: string[] = [];
  if (p.display) lines.push(`display = ${tomlQuoted(p.display)}`);
  if (p.nicknames.length) lines.push(`nicknames = ${tomlArray(p.nicknames)}`);
  if (p.discordIds.length) lines.push(`discord_ids = ${tomlArray(p.discordIds)}`);
  if (p.githubLogins.length) lines.push(`github_logins = ${tomlArray(p.githubLogins)}`);
  if (p.githubIds.length) lines.push(`github_ids = ${tomlArray(p.githubIds)}`);
  return lines;
}

const KEY_LINE_RE = /^\s*([A-Za-z0-9_]+)\s*=/;

const NEW_TOML_HEADER =
  "# Corvidinho allowlist (ALLOW-4). Created by /admin (ADMIN-3.a); see allowlist.example.toml.\n# Default-deny: empty allow lists refuse. Deny overrides always win.\n";

/**
 * Set (or with `person` null, remove) `[people.<id>]` in TOML text. Sections
 * are located with the loader's own reader (`scanSimpleToml`), so multi-line
 * arrays elsewhere are skipped whole. Throws on text the loader would refuse.
 */
export function setTomlPerson(text: string, id: string, person: DeclaredPerson | null): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.length > 0 ? text.split(/\r?\n/) : [];
  const scan = scanSimpleToml(text);
  const section = `people.${id}`;
  const at = scan.headers.findIndex((h) => h.section === section);

  if (at < 0) {
    if (!person) return text;
    const out = [...lines];
    while (out.length > 0 && out[out.length - 1]!.trim() === "") out.pop();
    if (out.length > 0) out.push("");
    out.push(`[${section}]`, ...renderPersonTomlLines(person), "");
    return out.join(eol);
  }

  const head = scan.headers[at]!.row;
  const end = scan.headers[at + 1]?.row ?? lines.length;
  const out = lines.slice(0, head);
  if (!person) {
    // Drop the header and body; comment / blank lines right before the next
    // section stay (they usually describe it).
    let last = head;
    for (let r = head + 1; r < end; r++) {
      const t = lines[r]!.trim();
      if (t !== "" && !t.startsWith("#")) last = r;
    }
    const rest = lines.slice(last + 1);
    if (out.length > 0 && out[out.length - 1]!.trim() === "" && (rest.length === 0 || rest[0]!.trim() === "")) {
      out.pop();
    }
    return [...out, ...rest].join(eol);
  }

  out.push(lines[head]!);
  const rendered = renderPersonTomlLines(person);
  let placed = false;
  for (let r = head + 1; r < end; r++) {
    const key = lines[r]!.match(KEY_LINE_RE)?.[1]?.toLowerCase();
    if (key && PERSON_KEYS.has(key)) {
      if (!placed) {
        out.push(...rendered);
        placed = true;
      }
      continue;
    }
    out.push(lines[r]!);
  }
  if (!placed) out.splice(out.length - (end - head - 1), 0, ...rendered);
  out.push(...lines.slice(end));
  return out.join(eol);
}

/** The managed keys of one person as a JSON entry (empty lists left out). */
function renderPersonJson(p: DeclaredPerson): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (p.display) o.display = p.display;
  if (p.nicknames.length) o.nicknames = [...p.nicknames];
  if (p.discordIds.length) o.discord_ids = [...p.discordIds];
  if (p.githubLogins.length) o.github_logins = [...p.githubLogins];
  if (p.githubIds.length) o.github_ids = [...p.githubIds];
  return o;
}

/**
 * Set (or with `person` null, remove) `people.<id>` in JSON text. Keeps
 * every other key, and any key of the entry this module does not read.
 */
export function setJsonPerson(text: string, id: string, person: DeclaredPerson | null): string {
  const raw = parseJsonObject(text);
  let people = raw.people;
  if (people === undefined) {
    if (!person) return text;
    people = {};
  }
  if (!people || typeof people !== "object" || Array.isArray(people)) {
    throw new Error('JSON allowlist "people" must be an object');
  }
  const map = people as Record<string, unknown>;
  const key = Object.keys(map).find((k) => k.trim().toLowerCase() === id) ?? id;
  if (!person) {
    delete map[key];
  } else {
    const prev = map[key];
    const kept: Record<string, unknown> = {};
    if (prev && typeof prev === "object" && !Array.isArray(prev)) {
      for (const [k, v] of Object.entries(prev)) {
        if (!PERSON_KEYS.has(k.toLowerCase())) kept[k] = v;
      }
    }
    map[key] = { ...renderPersonJson(person), ...kept };
  }
  raw.people = map;
  return `${JSON.stringify(raw, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Safety net

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function othersOf(r: PeopleParseResult, id: string): unknown {
  return {
    people: r.people.filter((p) => p.id !== id).map((p) => renderPersonJson(p)),
    ids: r.people.filter((p) => p.id !== id).map((p) => p.id),
    invalid: r.invalid.filter((x) => x !== id),
  };
}

/**
 * Re-read the new text as the loaders will. It must load; allow/deny lists
 * and the owner fields must be unchanged; every other person must read back
 * unchanged; `id` must read back as `want` (absent when null); (TOML) every
 * key of every other section must be unchanged. Returns what is wrong, or null.
 */
function peopleRewriteProblem(o: {
  path: string;
  format: AllowlistFileFormat;
  id: string;
  before: string;
  after: string;
  want: DeclaredPerson | null;
}): string | null {
  const json = o.format === "json";
  let lists: ReturnType<typeof parseAllowlistText>;
  try {
    lists = parseAllowlistText(o.after, o.path);
  } catch (e) {
    return `the rewritten file would not load (${e instanceof Error ? e.message : String(e)})`;
  }
  const beforeText = o.before.trim() ? o.before : json ? "{}" : "";
  if (!sameJson(parseAllowlistText(beforeText, o.path), lists)) {
    return "it would change an allow or deny list";
  }
  const ownerBefore = json ? ownerFieldsFromJson(JSON.parse(beforeText)) : parseOwnerToml(beforeText);
  const ownerAfter = json ? ownerFieldsFromJson(JSON.parse(o.after)) : parseOwnerToml(o.after);
  if (!sameJson(ownerBefore, ownerAfter)) return "it would change [owner]";
  const pb = parsePeopleText(beforeText, json);
  const pa = parsePeopleText(o.after, json);
  const got = pa.people.find((p) => p.id === o.id) ?? null;
  if (pa.invalid.includes(o.id) || !samePerson(got, o.want)) {
    return `person "${o.id}" would not read back as intended`;
  }
  if (!sameJson(othersOf(pb, o.id), othersOf(pa, o.id))) return "it would change another person";
  if (!json) {
    const b = parseSimpleToml(beforeText);
    const a = parseSimpleToml(o.after);
    for (const sec of new Set([...Object.keys(b), ...Object.keys(a)])) {
      if (sec === `people.${o.id}`) continue;
      if (!sameJson(b[sec] ?? null, a[sec] ?? null)) return `it would change [${sec}]`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Plan / commit

/**
 * Read the file and compute one change (no writes). Unreadable or
 * unparsable files, unreadable person entries and conflicting links refuse
 * instead of being written over.
 */
export function planPeopleChange(opts: {
  allowlist: AllowlistConfig;
  owner?: OwnerRecord | null;
  env?: NodeJS.ProcessEnv;
  home?: string;
  request: PeopleAdminRequest;
}): PeopleAdminPlanResult {
  const env = opts.env ?? process.env;
  const path = resolveAdminAllowlistPath(opts.allowlist, env, opts.home);
  const format = allowlistFileFormat(path);
  const json = format === "json";
  const req = opts.request;
  const refuse = (error: string): PeopleAdminPlanResult => ({ ok: false, kind: "refused", path, error });
  const fail = (error: string): PeopleAdminPlanResult => ({ ok: false, kind: "error", path, error });

  const id = req.personId.trim().toLowerCase();
  if (id === OWNER_PERSON_ID) {
    return refuse(`person id "${OWNER_PERSON_ID}" is reserved for the owner from [owner] / env — pick another id (e.g. your name)`);
  }
  if (!PERSON_ID_RE.test(id)) {
    return refuse("a person id is 1–32 lowercase letters, digits, - or _ (e.g. tofu)");
  }

  const dangling = danglingSymlinkError(path);
  if (dangling) return fail(dangling);
  let exists = false;
  let text = "";
  try {
    exists = existsSync(path);
    if (exists) text = readFileSync(path, "utf8");
  } catch (e) {
    return fail(`allowlist file could not be read: ${e instanceof Error ? e.message : String(e)}`);
  }
  let parsed: PeopleParseResult;
  try {
    // The loader must read the file as it is before anything is written.
    parseAllowlistText(text.trim() ? text : json ? "{}" : "", path);
    if (json) parseJsonObject(text);
    parsed = parsePeopleText(text, json);
  } catch (e) {
    return fail(`allowlist file could not be parsed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (parsed.invalid.includes(id)) {
    const why = parsed.issues.filter((i) => i.includes(`"${id}"`));
    return refuse(
      `person "${id}" has an entry that cannot be read${why.length ? ` (${why.join("; ")})` : ""} — fix it in the allowlist file on the VM first`,
    );
  }

  const before = parsed.people.find((p) => p.id === id) ?? null;
  let after: DeclaredPerson | null = before ? copyPerson(before) : null;
  const changed: PersonLink[] = [];
  const unchanged: PersonLink[] = [];
  let displayChanged = false;

  if (req.op === "add") {
    const display = req.display === undefined ? undefined : cleanPersonLabel(req.display);
    if (req.display !== undefined && !display) return refuse("display must be a non-empty name");
    if (!after) {
      after = emptyPerson(id);
      if (display) after.display = display;
      displayChanged = !!display;
    } else if (display && display !== after.display) {
      after.display = display;
      displayChanged = true;
    }
  } else if (req.op === "remove") {
    after = null;
  } else {
    if (!before || !after) {
      return refuse(`person "${id}" is not declared — /admin people add person:${id} first`);
    }
    const links = req.links ?? [];
    if (links.length === 0) return refuse("give at least one of discord, github, github_id or nickname");
    for (const raw of links) {
      const value = normalizePersonLink(raw.kind, raw.value);
      if (!value) return refuse(`${raw.kind} is not a valid ${LINK_LABEL[raw.kind]}`);
      const link: PersonLink = { kind: raw.kind, value };
      const field = LINK_FIELD[link.kind];
      const present = hasLink(after, link);
      if (req.op === "link") {
        if (present) unchanged.push(link);
        else {
          after[field].push(value);
          changed.push(link);
        }
      } else if (!present) {
        unchanged.push(link);
      } else {
        after[field] =
          link.kind === "nickname"
            ? after[field].filter((v) => v.toLowerCase() !== value.toLowerCase())
            : after[field].filter((v) => v !== value);
        changed.push(link);
      }
    }
  }

  // A stable id linked to two people matches nobody (IDENTITY-7): refuse it.
  if (req.op === "link" && after) {
    const next: PeopleParseResult = {
      people: [...parsed.people.filter((p) => p.id !== id), after],
      invalid: parsed.invalid,
      issues: [],
    };
    const dir = buildPeopleDirectory(next, opts.owner);
    for (const l of changed) {
      if (l.kind === "nickname") continue;
      const index = l.kind === "discord" ? dir.byDiscordId : l.kind === "github" ? dir.byGithubLogin : dir.byGithubId;
      if (index.get(l.value) !== id) {
        const field = LINK_FIELD[l.kind];
        const holders = dir.people.filter((p) => p.id !== id && p[field].includes(l.value)).map((p) => p.id);
        return refuse(
          `${formatPersonLink(l)} is already linked to ${holders.length ? holders.map((h) => `"${h}"`).join(", ") : "another person"} — unlink it there first (an id linked to two people matches nobody)`,
        );
      }
    }
  }

  const countBefore = parsed.people.length;
  const countAfter = countBefore + (before ? 0 : after ? 1 : 0) - (before && !after ? 1 : 0);
  const fileChanged = !samePerson(before, after);
  const plan: PeopleAdminPlan = {
    path,
    format,
    exists,
    op: req.op,
    personId: id,
    before,
    after,
    changed,
    unchanged,
    displayChanged,
    countBefore,
    countAfter,
    fileChanged,
  };
  if (!fileChanged) return { ok: true, plan };

  let newText: string;
  try {
    newText = json
      ? setJsonPerson(text, id, after)
      : setTomlPerson(exists && text.trim() ? text : NEW_TOML_HEADER, id, after);
  } catch (e) {
    return fail(`allowlist file could not be parsed: ${e instanceof Error ? e.message : String(e)}`);
  }
  const problem = peopleRewriteProblem({ path, format, id, before: text, after: newText, want: after });
  if (problem) return fail(`refusing to write the allowlist file: ${problem}`);
  plan.newText = newText;
  return { ok: true, plan };
}

const LINK_LABEL: Record<PersonLinkKind, string> = {
  discord: "Discord user (pick a user or paste a snowflake id)",
  github: "GitHub login",
  github_id: "GitHub numeric user id",
  nickname: "one-line nickname",
};

/** Apply a plan: write the file when it changed (atomic). */
export function commitPeopleChange(plan: PeopleAdminPlan): void {
  if (plan.fileChanged && plan.newText !== undefined) {
    writeFileAtomic(plan.path, plan.newText);
  }
}
