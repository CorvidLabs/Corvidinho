/**
 * ADMIN-1 / ADMIN-2 / ADMIN-3.c — runtime edits of the allow and deny lists
 * the loader already reads (ALLOW-4): `[discord]` users, channels,
 * deny_channels, deny_users, deny_roles and `[github]` orgs, repos,
 * deny_orgs, deny_repos, deny_users in the allowlist file
 * (CORVIDINHO_ALLOWLIST_FILE, else ~/.config/corvidinho/allowlist.toml|json).
 * No second store. `[github].users` and `[discord].roles` are not edited here.
 *
 * - The file is rewritten atomically (temp file in the same dir + rename),
 *   keeping its mode. TOML edits touch only the one key's line(s) inside its
 *   section; every other line (other sections such as `[owner]` or
 *   `[corvidinho.plugins]`, comments, blank lines) is kept verbatim.
 * - A key the loader also reads under another spelling (`organizations`,
 *   `repositories`, `denyusers`, …) is written under the spelling the loader
 *   reads: the canonical key when the file has it, else the alias when the
 *   file has that, else the canonical key.
 * - Before any write the new text is re-read as the loader will: TOML must
 *   keep every other key of every section; JSON must keep every other key of
 *   the whole document.
 * - Env overlays (CORVIDINHO_DISCORD_ALLOW_* / _DENY_*, DISCORD_CHANNEL_IDS,
 *   CORVIDINHO_GITHUB_ALLOW_* / _DENY_*) are never written to the file and
 *   cannot be changed at runtime.
 * - The live list is recomputed exactly as a restart would load it
 *   (file ∪ env, lowercased, deduped) and spliced in place, so every holder
 *   of the bridge's allowlist object sees the change without a restart.
 * - Plan and commit are synchronous, so two admin commands in one bridge
 *   process cannot interleave a read-modify-write.
 */

import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  defaultAllowlistPaths,
  discordFromEnv,
  githubFromEnv,
  isJsonAllowlistPath,
  parseAllowlistText,
  parseSimpleToml,
  resolveAllowlistPath,
  scanSimpleToml,
} from "../allowlist/load.ts";
import type {
  AllowlistConfig,
  DiscordAllowlists,
  GithubAllowlists,
} from "../allowlist/types.ts";
import { GITHUB_LOGIN_RE } from "../identity/people.ts";

/**
 * Allowlist keys `/admin` may change: `[discord]` users (ADMIN-1), channels
 * (ADMIN-2) and the deny lists, and the `[github]` repo allow lists and deny
 * lists (ADMIN-3.c). Discord keys are bare (as before); GitHub keys carry a
 * `github.` prefix.
 */
export type AdminListKey =
  | "users"
  | "channels"
  | "deny_channels"
  | "deny_users"
  | "deny_roles"
  | "github.orgs"
  | "github.repos"
  | "github.deny_orgs"
  | "github.deny_repos"
  | "github.deny_users";
export type AdminListOp = "add" | "remove";
export type AdminListSection = "discord" | "github";

/** Where one `/admin` list lives in the file, the loaded config and env. */
export type AdminListSpec =
  | AdminListSpecOf<"discord", keyof DiscordAllowlists>
  | AdminListSpecOf<"github", keyof GithubAllowlists>;

type AdminListSpecOf<S extends AdminListSection, F extends string> = {
  section: S;
  /** Canonical file key (lowercase), written when the file has no other spelling. */
  key: string;
  /** The other spelling the loader reads when `key` is absent (lowercase). */
  alias?: string;
  /** Field of the loaded `AllowlistConfig[section]`. */
  field: F;
  /** Env var(s) that feed the live list (read-only at runtime). */
  env: string;
  /** What an entry is (Discord snowflake, GitHub login, OWNER/REPO pattern). */
  kind: "snowflake" | "login" | "repo";
};

/** Every list `/admin` edits, with the spelling(s) `githubFromObj` / `discordFromObj` read. */
export const ADMIN_LISTS: Readonly<Record<AdminListKey, AdminListSpec>> = {
  users: { section: "discord", key: "users", field: "users", env: "CORVIDINHO_DISCORD_ALLOW_USERS", kind: "snowflake" },
  channels: {
    section: "discord",
    key: "channels",
    field: "channels",
    env: "CORVIDINHO_DISCORD_ALLOW_CHANNELS / DISCORD_CHANNEL_IDS",
    kind: "snowflake",
  },
  deny_channels: {
    section: "discord",
    key: "deny_channels",
    alias: "denychannels",
    field: "denyChannels",
    env: "CORVIDINHO_DISCORD_DENY_CHANNELS",
    kind: "snowflake",
  },
  deny_users: {
    section: "discord",
    key: "deny_users",
    alias: "denyusers",
    field: "denyUsers",
    env: "CORVIDINHO_DISCORD_DENY_USERS",
    kind: "snowflake",
  },
  deny_roles: {
    section: "discord",
    key: "deny_roles",
    alias: "denyroles",
    field: "denyRoles",
    env: "CORVIDINHO_DISCORD_DENY_ROLES",
    kind: "snowflake",
  },
  "github.orgs": {
    section: "github",
    key: "orgs",
    alias: "organizations",
    field: "orgs",
    env: "CORVIDINHO_GITHUB_ALLOW_ORGS",
    kind: "login",
  },
  "github.repos": {
    section: "github",
    key: "repos",
    alias: "repositories",
    field: "repos",
    env: "CORVIDINHO_GITHUB_ALLOW_REPOS",
    kind: "repo",
  },
  "github.deny_orgs": {
    section: "github",
    key: "deny_orgs",
    alias: "denyorgs",
    field: "denyOrgs",
    env: "CORVIDINHO_GITHUB_DENY_ORGS",
    kind: "login",
  },
  "github.deny_repos": {
    section: "github",
    key: "deny_repos",
    alias: "denyrepos",
    field: "denyRepos",
    env: "CORVIDINHO_GITHUB_DENY_REPOS",
    kind: "repo",
  },
  "github.deny_users": {
    section: "github",
    key: "deny_users",
    alias: "denyusers",
    field: "denyUsers",
    env: "CORVIDINHO_GITHUB_DENY_USERS",
    kind: "login",
  },
};

export const ADMIN_LIST_KEYS = Object.keys(ADMIN_LISTS) as AdminListKey[];

/** Discord snowflake: digits only (also keeps TOML/JSON output injection-free). */
export const ADMIN_SNOWFLAKE_RE = /^\d{1,25}$/;

/**
 * GitHub repo entry: `owner/repo` or the `owner/*` pattern the gate reads,
 * lowercased (owner is a GitHub login; a repo name is letters, digits, `.`,
 * `_`, `-`, never `.` or `..`). Injection-free in TOML and JSON.
 */
export const ADMIN_GITHUB_REPO_RE = /^([a-z0-9](?:[a-z0-9-]{0,38}))\/(\*|[a-z0-9._-]{1,100})$/;

/** Env vars that feed each live list (read-only at runtime). */
export const ADMIN_LIST_ENV: Readonly<Record<AdminListKey, string>> = Object.fromEntries(
  ADMIN_LIST_KEYS.map((k) => [k, ADMIN_LISTS[k].env]),
) as Record<AdminListKey, string>;

/**
 * The entry `/admin` would store for `raw` on list `key` (trimmed,
 * lowercased), or null when it is not a valid entry for that list: a Discord
 * snowflake, a GitHub login (orgs, deny_orgs, deny_users) or `owner/repo` /
 * `owner/*` (repos, deny_repos).
 */
export function normalizeAdminListId(key: AdminListKey, raw: string | null | undefined): string | null {
  const id = String(raw ?? "").trim().toLowerCase();
  const kind = ADMIN_LISTS[key].kind;
  if (kind === "snowflake") return ADMIN_SNOWFLAKE_RE.test(id) ? id : null;
  if (kind === "login") return GITHUB_LOGIN_RE.test(id) ? id : null;
  const m = id.match(ADMIN_GITHUB_REPO_RE);
  if (!m || m[2] === "." || m[2] === "..") return null;
  return id;
}

/** The loaded (live) list for `key`: the array the gates read, spliced in place on commit. */
export function liveAdminList(allowlist: AllowlistConfig, key: AdminListKey): string[] {
  const spec = ADMIN_LISTS[key];
  return spec.section === "discord" ? allowlist.discord[spec.field] : allowlist.github[spec.field];
}

export type AllowlistFileFormat = "toml" | "json";

export type AdminListPlan = {
  path: string;
  format: AllowlistFileFormat;
  /** False when the file does not exist yet (commit creates it). */
  exists: boolean;
  key: AdminListKey;
  /** `[section]` of the file key. */
  section: AdminListSection;
  /** The spelling written: the key the loader reads (canonical, or its alias). */
  fileKey: string;
  op: AdminListOp;
  id: string;
  /** Raw file entries before/after (case kept). */
  fileBefore: string[];
  fileAfter: string[];
  /** Env overlay entries for this key (lowercased). */
  env: string[];
  /** Live (file ∪ env) before/after, lowercased. */
  liveBefore: string[];
  liveAfter: string[];
  inFileBefore: boolean;
  inEnv: boolean;
  fileChanged: boolean;
  liveChanged: boolean;
  /** New file text when fileChanged. */
  newText?: string;
};

export type AdminListPlanResult =
  | { ok: true; plan: AdminListPlan }
  | { ok: false; path: string; error: string };


function lowerDedupe(list: readonly string[]): string[] {
  return [...new Set(list.map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

function splitList(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/** Same rule as the loader (`isJsonAllowlistPath`), so edits match what loads. */
export function allowlistFileFormat(path: string): AllowlistFileFormat {
  return isJsonAllowlistPath(path) ? "json" : "toml";
}

/**
 * When `path` is a symlink whose target does not resolve (dangling, or a
 * loop), the error to refuse with; else null. The loader reads such a path
 * as "no file", and a write there would replace the operator's link with a
 * regular file, so `/admin` refuses instead.
 */
export function danglingSymlinkError(path: string): string | null {
  try {
    if (!lstatSync(path).isSymbolicLink()) return null;
  } catch {
    return null;
  }
  try {
    realpathSync(path);
    return null;
  } catch {
    let dest = "?";
    try {
      dest = readlinkSync(path);
    } catch {
      /* keep "?" */
    }
    return `allowlist file is a symlink to ${dest}, which does not resolve (dangling or looping); fix or remove the link on the VM`;
  }
}

/**
 * The file `/admin` edits: the file the bridge loaded, else the configured /
 * default path the loader would read (created on first write).
 */
export function resolveAdminAllowlistPath(
  allowlist: AllowlistConfig,
  env: NodeJS.ProcessEnv = process.env,
  home: string = env.HOME?.trim() || homedir(),
): string {
  return (
    allowlist.sourcePath ??
    resolveAllowlistPath(env, home) ??
    defaultAllowlistPaths(home)[0]!
  );
}

/** Env overlay entries for one key (lowercased), as loadBridgeConfig merges them. */
export function envAdminList(env: NodeJS.ProcessEnv, key: AdminListKey): string[] {
  const spec = ADMIN_LISTS[key];
  if (spec.section === "github") return lowerDedupe(githubFromEnv(env)[spec.field] ?? []);
  const e = discordFromEnv(env)[spec.field] ?? [];
  return lowerDedupe(key === "channels" ? [...e, ...splitList(env.DISCORD_CHANNEL_IDS)] : e);
}

/** Precision guard: JSON numbers above 2^53 cannot round-trip. */
function hasUnsafeNumber(v: unknown): boolean {
  if (typeof v === "number") return Number.isInteger(v) && !Number.isSafeInteger(v);
  if (Array.isArray(v)) return v.some(hasUnsafeNumber);
  if (v && typeof v === "object") return Object.values(v).some(hasUnsafeNumber);
  return false;
}

/**
 * JSON allowlist text as an object (`{}` for blank text). Throws on a
 * non-object or on numeric ids that lose precision. Shared with
 * `/admin people` (admin-people.ts).
 */
export function parseJsonObject(text: string): Record<string, unknown> {
  const raw: unknown = text.trim() ? JSON.parse(text) : {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("JSON allowlist file must be an object");
  }
  if (hasUnsafeNumber(raw)) {
    throw new Error(
      "JSON allowlist file has numeric ids that lose precision — quote them as strings first",
    );
  }
  return raw as Record<string, unknown>;
}

/**
 * The JSON section object the loader reads (`raw.github ?? raw.Github`,
 * `raw.discord ?? raw.Discord`) and its key name. Throws when it is not an
 * object (refused, never clobbered).
 */
function jsonSectionObject(
  raw: Record<string, unknown>,
  section: AdminListSection,
): { name: string; obj: Record<string, unknown> | undefined } {
  const cap = `${section[0]!.toUpperCase()}${section.slice(1)}`;
  const name = raw[section] !== undefined ? section : raw[cap] !== undefined ? cap : section;
  const v = raw[name];
  if (v === undefined) return { name, obj: undefined };
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`JSON allowlist "${name}" must be an object`);
  }
  return { name, obj: v as Record<string, unknown> };
}

/** A JSON section's list values by lowercased key, exactly as the loader collects them (last case variant wins). */
function jsonSectionLists(obj: Record<string, unknown> | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (Array.isArray(v)) out[k.toLowerCase()] = v.map((x) => String(x).trim()).filter(Boolean);
    else if (typeof v === "string") out[k.toLowerCase()] = splitList(v);
  }
  return out;
}

/** The key the loader reads for `spec` among `present`: canonical, else alias, else canonical. */
function effectiveKey(spec: AdminListSpec, present: Record<string, unknown> | undefined): string {
  if (present && Object.hasOwn(present, spec.key)) return spec.key;
  if (spec.alias && present && Object.hasOwn(present, spec.alias)) return spec.alias;
  return spec.key;
}

/**
 * The file key `/admin` reads and writes for `key` (lowercase): the spelling
 * the loader reads (`githubFromObj` / `discordFromObj`).
 */
export function adminListFileKey(text: string, format: AllowlistFileFormat, key: AdminListKey): string {
  const spec = ADMIN_LISTS[key];
  if (format === "toml") return effectiveKey(spec, parseSimpleToml(text)[spec.section]);
  return effectiveKey(spec, jsonSectionLists(jsonSectionObject(parseJsonObject(text), spec.section).obj));
}

/** Raw entries of `key` in allowlist file text (case kept), under the spelling the loader reads. */
export function readFileAdminList(
  text: string,
  format: AllowlistFileFormat,
  key: AdminListKey,
): string[] {
  const spec = ADMIN_LISTS[key];
  if (format === "toml") {
    const sec = parseSimpleToml(text)[spec.section];
    return (sec?.[effectiveKey(spec, sec)] ?? []).map((s) => s.trim()).filter(Boolean);
  }
  const lists = jsonSectionLists(jsonSectionObject(parseJsonObject(text), spec.section).obj);
  return lists[effectiveKey(spec, lists)] ?? [];
}

function tomlString(v: string): string {
  return v.includes('"') ? `'${v}'` : `"${v}"`;
}

export function formatTomlList(values: readonly string[]): string {
  return `[${values.map(tomlString).join(", ")}]`;
}

/** Column of the `#` that starts a comment on `line` (quote-aware), or -1. */
function commentColumn(line: string): number {
  let q = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (q === '"' && c === "\\") i++;
      else if (c === q) q = "";
      continue;
    }
    if (c === '"' || c === "'") q = c;
    else if (c === "#") return i;
  }
  return -1;
}

/**
 * Set `[<section>].<key>` in TOML text (`key` lowercase, as the loader reads
 * it). Lines are located with the loader's own reader (`scanSimpleToml`), so
 * a multi-line array — the key's own or any other — is always handled whole.
 * Every `<key> = …` inside `[<section>]` (single- or multi-line) becomes one
 * line; its spelling, indentation and the comment on its first line are kept
 * (comments on the lines of a collapsed multi-line array are not). A missing
 * key goes after the last value in the first `[<section>]` (after its closing
 * `]`), or a `[<section>]` section is appended. Every other line is kept
 * verbatim. Throws on text the loader would refuse.
 */
export function setTomlList(
  text: string,
  section: AdminListSection,
  key: string,
  values: readonly string[],
): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.length > 0 ? text.split(/\r?\n/) : [];
  const scan = scanSimpleToml(text);
  const list = formatTomlList(values);
  const targets = scan.entries.filter((e) => e.section === section && e.key === key);

  if (targets.length > 0) {
    const out: string[] = [];
    let next = 0;
    for (const t of targets) {
      out.push(...lines.slice(next, t.row));
      const first = lines[t.row]!;
      const name = first.match(/^\s*([A-Za-z0-9_]+)/)?.[1] ?? key;
      const indent = first.match(/^\s*/)?.[0] ?? "";
      const hashAt = commentColumn(first);
      let comment = "";
      if (hashAt >= 0) {
        const gap = first.slice(0, hashAt).match(/\s*$/)?.[0] ?? "";
        comment = `${gap || " "}${first.slice(hashAt)}`;
      }
      out.push(`${indent}${name} = ${list}${comment}`);
      next = t.endRow + 1;
    }
    out.push(...lines.slice(next));
    return out.join(eol);
  }

  const line = `${key} = ${list}`;
  const header = scan.headers.find((h) => h.section === section);
  if (header) {
    const end = scan.headers.find((h) => h.row > header.row)?.row ?? lines.length;
    const inBlock = scan.entries.filter(
      (e) => e.section === section && e.row > header.row && e.row < end,
    );
    const after = inBlock.length > 0 ? inBlock[inBlock.length - 1]!.endRow : header.row;
    const out = [...lines];
    out.splice(after + 1, 0, line);
    return out.join(eol);
  }
  const out = [...lines];
  const trailing = out.length > 0 && out[out.length - 1] === "";
  if (trailing) out.pop();
  if (out.length > 0) out.push("");
  out.push(`[${section}]`, line, "");
  return out.join(eol);
}

/** `setTomlList` for `[discord]` (kept for callers of the ADMIN-1/2 writer). */
export function setTomlDiscordList(text: string, key: string, values: readonly string[]): string {
  return setTomlList(text, "discord", key, values);
}

/**
 * Set `<section>.<key>` in JSON text (`key` lowercase); keeps every other key
 * (e.g. `owner`, `corvidinho`). Case-variant duplicates of the key collapse
 * onto the first one, whose spelling is kept.
 */
export function setJsonList(
  text: string,
  section: AdminListSection,
  key: string,
  values: readonly string[],
): string {
  const raw = parseJsonObject(text);
  const { name, obj } = jsonSectionObject(raw, section);
  const target: Record<string, unknown> = obj ?? {};
  const matches = Object.keys(target).filter((k) => k.toLowerCase() === key);
  const keep = matches[0] ?? key;
  for (const k of matches.slice(1)) delete target[k];
  target[keep] = [...values];
  raw[name] = target;
  return `${JSON.stringify(raw, null, 2)}\n`;
}

/** `setJsonList` for `discord` (kept for callers of the ADMIN-1/2 writer). */
export function setJsonDiscordList(text: string, key: string, values: readonly string[]): string {
  return setJsonList(text, "discord", key, values);
}

/** JSON with object keys sorted, so two documents compare by content. */
function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/** The JSON document without the target key (every case variant); a section left empty counts as absent. */
function jsonWithoutTarget(text: string, section: AdminListSection, key: string): string {
  const raw = parseJsonObject(text);
  const { name, obj } = jsonSectionObject(raw, section);
  if (obj) {
    const rest = Object.fromEntries(Object.entries(obj).filter(([k]) => k.toLowerCase() !== key));
    if (Object.keys(rest).length > 0) raw[name] = rest;
    else delete raw[name];
  }
  return canonicalJson(raw);
}

/**
 * Safety net before any write: re-read the new text exactly as the loader
 * will after a restart. It must load; the target list must read back as
 * `fileAfter`; every other allow/deny list the loader reads must be
 * unchanged; and (TOML) so must every other key of every section, `[owner]`
 * and `[corvidinho.plugins]` included, and (JSON) every other key of the
 * whole document. Returns what is wrong, or null.
 */
export function allowlistRewriteProblem(o: {
  path: string;
  format: AllowlistFileFormat;
  key: AdminListKey;
  fileKey: string;
  before: string;
  after: string;
  fileAfter: readonly string[];
}): string | null {
  const spec = ADMIN_LISTS[o.key];
  let after: ReturnType<typeof parseAllowlistText>;
  try {
    after = parseAllowlistText(o.after, o.path);
  } catch (e) {
    return `the rewritten file would not load (${e instanceof Error ? e.message : String(e)})`;
  }
  const before = o.before.trim()
    ? parseAllowlistText(o.before, o.path)
    : parseAllowlistText(o.format === "json" ? "{}" : "", o.path);
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const want = o.fileAfter.map((x) => x.trim().toLowerCase()).filter(Boolean);
  const got = spec.section === "discord" ? after.discord[spec.field] : after.github[spec.field];
  if (!same(got, want)) {
    return `[${spec.section}].${o.fileKey} would not read back as intended`;
  }
  for (const k of Object.keys(before.github) as Array<keyof typeof before.github>) {
    if (spec.section === "github" && k === spec.field) continue;
    if (!same(before.github[k], after.github[k])) return `it would change [github] ${k}`;
  }
  for (const k of Object.keys(before.discord) as Array<keyof typeof before.discord>) {
    if (spec.section === "discord" && k === spec.field) continue;
    if (!same(before.discord[k], after.discord[k])) return `it would change [discord] ${k}`;
  }
  if (o.format === "toml") {
    const b = parseSimpleToml(o.before);
    const a = parseSimpleToml(o.after);
    for (const sec of new Set([...Object.keys(b), ...Object.keys(a)])) {
      const keys = new Set([...Object.keys(b[sec] ?? {}), ...Object.keys(a[sec] ?? {})]);
      for (const k of keys) {
        if (sec === spec.section && k === o.fileKey) continue;
        if (!same(b[sec]?.[k], a[sec]?.[k])) return `it would change [${sec}] ${k}`;
      }
    }
  } else if (jsonWithoutTarget(o.before, spec.section, o.fileKey) !== jsonWithoutTarget(o.after, spec.section, o.fileKey)) {
    return `it would change a JSON key other than ${spec.section}.${o.fileKey}`;
  }
  return null;
}

const NEW_TOML_HEADER =
  "# Corvidinho allowlist (ALLOW-4). Created by /admin (ADMIN-1/2); see allowlist.example.toml.\n# Default-deny: empty allow lists refuse. Deny overrides always win.\n";

/**
 * Read the file and compute the change for one id (no writes).
 * Unreadable / unparsable files refuse instead of being clobbered, and so
 * does an id that is not a valid entry for the list.
 */
export function planAdminListChange(opts: {
  allowlist: AllowlistConfig;
  env?: NodeJS.ProcessEnv;
  home?: string;
  key: AdminListKey;
  op: AdminListOp;
  id: string;
}): AdminListPlanResult {
  const env = opts.env ?? process.env;
  const spec = ADMIN_LISTS[opts.key];
  const path = resolveAdminAllowlistPath(opts.allowlist, env, opts.home);
  const format = allowlistFileFormat(path);
  const id = normalizeAdminListId(opts.key, opts.id);
  if (id === null) {
    return { ok: false, path, error: `not a valid [${spec.section}].${spec.key} entry` };
  }
  const dangling = danglingSymlinkError(path);
  if (dangling) return { ok: false, path, error: dangling };
  let exists = false;
  let text = "";
  try {
    exists = existsSync(path);
    if (exists) text = readFileSync(path, "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, path, error: `allowlist file could not be read: ${msg}` };
  }

  try {
    const fileKey = adminListFileKey(text, format, opts.key);
    const fileBefore = readFileAdminList(text, format, opts.key);
    const inFileBefore = fileBefore.some((x) => x.toLowerCase() === id);
    let fileAfter = fileBefore;
    if (opts.op === "add" && !inFileBefore) fileAfter = [...fileBefore, id];
    if (opts.op === "remove" && inFileBefore) {
      fileAfter = fileBefore.filter((x) => x.toLowerCase() !== id);
    }
    const envList = envAdminList(env, opts.key);
    const liveBefore = [...liveAdminList(opts.allowlist, opts.key)];
    const liveAfter = lowerDedupe([...fileAfter, ...envList]);
    const fileChanged = fileAfter !== fileBefore;
    let newText: string | undefined;
    if (fileChanged) {
      newText =
        format === "json"
          ? setJsonList(text, spec.section, fileKey, fileAfter)
          : setTomlList(exists ? text : NEW_TOML_HEADER, spec.section, fileKey, fileAfter);
      const problem = allowlistRewriteProblem({
        path,
        format,
        key: opts.key,
        fileKey,
        before: text,
        after: newText,
        fileAfter,
      });
      if (problem) {
        return { ok: false, path, error: `refusing to write the allowlist file: ${problem}` };
      }
    }
    return {
      ok: true,
      plan: {
        path,
        format,
        exists,
        key: opts.key,
        section: spec.section,
        fileKey,
        op: opts.op,
        id,
        fileBefore,
        fileAfter,
        env: envList,
        liveBefore,
        liveAfter,
        inFileBefore,
        inEnv: envList.includes(id),
        fileChanged,
        liveChanged: !sameSet(liveBefore, liveAfter),
        newText,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, path, error: `allowlist file could not be parsed: ${msg}` };
  }
}

/**
 * Atomic write: temp file in the target's directory (same filesystem),
 * fsync, then rename over the target. Keeps the target's mode (new files
 * 0600, new dirs 0700). Symlinked targets are resolved first; a dangling or
 * looping symlink is refused (throws) and left in place, never replaced by a
 * regular file.
 */
export function writeFileAtomic(path: string, text: string): void {
  const dangling = danglingSymlinkError(path);
  if (dangling) throw new Error(dangling);
  const target = existsSync(path) ? realpathSync(path) : path;
  const dir = dirname(target);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  let mode = 0o600;
  try {
    mode = statSync(target).mode & 0o777;
  } catch {
    /* new file */
  }
  const tmp = join(dir, `.${basename(target)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  let fd: number | null = null;
  try {
    fd = openSync(tmp, "wx", mode);
    writeSync(fd, text);
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    chmodSync(tmp, mode);
    renameSync(tmp, target);
  } catch (e) {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw e;
  }
}

/**
 * Apply a plan: write the file when it changed, then splice the live list in
 * place (and the bridge's channelIds array when it is a separate array).
 */
export function commitAdminListChange(
  plan: AdminListPlan,
  live: { allowlist: AllowlistConfig; channelIds?: string[] },
): void {
  if (plan.fileChanged && plan.newText !== undefined) {
    writeFileAtomic(plan.path, plan.newText);
  }
  const arr = liveAdminList(live.allowlist, plan.key);
  arr.splice(0, arr.length, ...plan.liveAfter);
  if (plan.key === "channels" && live.channelIds && live.channelIds !== arr) {
    live.channelIds.splice(0, live.channelIds.length, ...plan.liveAfter);
  }
}

/** Per-key file entries for `/admin config show` (read-only). */
export function readAdminFileView(
  allowlist: AllowlistConfig,
  env: NodeJS.ProcessEnv = process.env,
  home?: string,
):
  | { ok: true; path: string; format: AllowlistFileFormat; exists: boolean; file: Record<AdminListKey, string[]> }
  | { ok: false; path: string; error: string } {
  const path = resolveAdminAllowlistPath(allowlist, env, home);
  const format = allowlistFileFormat(path);
  const dangling = danglingSymlinkError(path);
  if (dangling) return { ok: false, path, error: dangling };
  try {
    const exists = existsSync(path);
    const text = exists ? readFileSync(path, "utf8") : "";
    const file = Object.fromEntries(
      ADMIN_LIST_KEYS.map((k) => [k, readFileAdminList(text, format, k)]),
    ) as Record<AdminListKey, string[]>;
    return { ok: true, path, format, exists, file };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, path, error: msg };
  }
}
