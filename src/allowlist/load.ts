/**
 * ALLOW-4 — load allowlists from bot-VM file + env overlays.
 * Paths: CORVIDINHO_ALLOWLIST_FILE, else ~/.config/corvidinho/allowlist.toml|json
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  emptyConfig,
  emptyDiscord,
  emptyGithub,
  type AllowlistConfig,
  type DiscordAllowlists,
  type GithubAllowlists,
} from "./types.ts";

function parseList(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normList(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items.map((x) => String(x).trim()).filter(Boolean);
}

function lower(list: string[]): string[] {
  return list.map((s) => s.toLowerCase());
}

const HEADER_RE = /^\[\s*([A-Za-z0-9_.-]+)\s*\]$/;
const KEY_RE = /^\s*([A-Za-z0-9_]+)\s*=/;
/** Unquoted array item / value characters. */
const BARE_RE = /^[^\s,[\]"'#=]+/;

/**
 * Sections read as allow/deny lists, plus the top level (where a dotted
 * `github.deny_repos = …` would land). Anything the parser cannot read there
 * throws: a deny list is never silently dropped (fail closed).
 */
function isListSection(section: string): boolean {
  return section === "" || section === "github" || section === "discord";
}

/** Error text names the line and key only, never the values. */
function tomlError(row: number, where: string, msg: string): Error {
  return new Error(`allowlist TOML line ${row + 1}: ${where}${msg}`);
}

function blankFrom(line: string, col: number): boolean {
  const rest = line.slice(col).trimStart();
  return rest === "" || rest.startsWith("#");
}

/** `"…"` (only `\"` / `\\` escapes) or `'…'` on one line, starting at `col`. */
function readQuoted(
  line: string,
  col: number,
  fail: (msg: string) => Error,
): { text: string; end: number } {
  const q = line[col]!;
  let text = "";
  for (let j = col + 1; j < line.length; j++) {
    const c = line[j]!;
    if (c === q) return { text, end: j + 1 };
    if (q === '"' && c === "\\") {
      const n = line[j + 1];
      if (n !== '"' && n !== "\\") throw fail("unsupported escape in string");
      text += n;
      j++;
      continue;
    }
    text += c;
  }
  throw fail("unterminated string");
}

/**
 * Array starting at `lines[row][col]` (`[`); may span lines, with a trailing
 * comma and `#` comments between items. Items are quoted strings or bare
 * words; a quoted item holding commas is split on them, as the single-line
 * reader always did. Returns the items and the row of the closing `]`.
 */
function readArray(
  lines: string[],
  row: number,
  col: number,
  where: string,
): { items: string[]; row: number } {
  const start = row;
  const items: string[] = [];
  let needItem = true;
  col++;
  for (;;) {
    const line = lines[row]!;
    while (col < line.length && (line[col] === " " || line[col] === "\t")) col++;
    if (col >= line.length || line[col] === "#") {
      row++;
      col = 0;
      const next = lines[row];
      if (
        next === undefined ||
        HEADER_RE.test(next.replace(/#.*$/, "").trim()) ||
        KEY_RE.test(next)
      ) {
        throw tomlError(start, where, 'unterminated array (no closing "]")');
      }
      continue;
    }
    const c = line[col]!;
    const fail = (msg: string) => tomlError(row, where, msg);
    if (c === "]") {
      if (!blankFrom(line, col + 1)) throw fail('unexpected text after "]"');
      return { items, row };
    }
    if (c === ",") {
      if (needItem) throw fail('unexpected ","');
      needItem = true;
      col++;
      continue;
    }
    if (!needItem) throw fail('expected "," or "]" between array items');
    if (c === "[") throw fail("nested arrays are not supported");
    if (c === '"' || c === "'") {
      const s = readQuoted(line, col, fail);
      items.push(...s.text.split(",").map((p) => p.trim()).filter(Boolean));
      col = s.end;
    } else {
      const m = line.slice(col).match(BARE_RE);
      if (!m) throw fail(`unexpected "${c}"`);
      items.push(m[0]);
      col += m[0].length;
    }
    needItem = false;
  }
}

/** Non-array value on one line: `"a,b"`, `'a b'` or bare `a, b` (split on commas / whitespace). */
function readScalar(line: string, col: number, row: number, where: string): string[] {
  const fail = (msg: string) => tomlError(row, where, msg);
  const c = line[col];
  if (c === '"' || c === "'") {
    const s = readQuoted(line, col, fail);
    if (!blankFrom(line, s.end)) throw fail("unexpected text after string");
    return parseList(s.text);
  }
  const hash = line.indexOf("#", col);
  const raw = (hash >= 0 ? line.slice(col, hash) : line.slice(col)).trim();
  if (!raw) throw fail("missing value");
  if (/["'[\]=]/.test(raw)) throw fail("cannot parse value");
  return parseList(raw);
}

/** Lenient one-line reading kept for sections that hold no allow/deny lists. */
function legacyValue(val: string): string[] {
  if (val.startsWith("[")) {
    return val
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map((p) => p.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return parseList(val.replace(/^["']|["']$/g, ""));
}

/**
 * Minimal TOML subset for the allowlist file (ALLOW-4): `[section]` headers
 * and `key = value`, section names and keys lowercased. A value is an array
 * of quoted strings / bare words (`["a", 'b', c]`, `[]`) that may span lines
 * with a trailing comma and `#` comments, or a one-line `"a,b"` / `a b` list.
 * Single-line files read exactly as before.
 *
 * Fail closed: in `[github]`, `[discord]` and the top level, any line or
 * value outside this subset throws (line + key in the message, no values), as
 * does a malformed `[header]` anywhere. Other sections (e.g. `[owner]`, which
 * identity/owner.ts reads itself) keep the lenient one-line reading.
 */
export function parseSimpleToml(text: string): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  const lines = text.split(/\r?\n/);
  let section = "";
  for (let row = 0; row < lines.length; row++) {
    const raw = lines[row]!;
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    if (line.startsWith("[")) {
      const sec = line.match(HEADER_RE);
      if (!sec) throw tomlError(row, "", "malformed or unsupported section header");
      section = sec[1]!.toLowerCase();
      if (!out[section]) out[section] = {};
      continue;
    }
    if (!isListSection(section)) {
      const kv = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
      if (kv) out[section]![kv[1]!.toLowerCase()] = legacyValue(kv[2]!.trim());
      continue;
    }
    const kv = raw.match(KEY_RE);
    if (!kv) {
      throw tomlError(
        row,
        section ? `[${section}]: ` : "",
        "expected key = value (bare key of letters, digits and _)",
      );
    }
    const key = kv[1]!.toLowerCase();
    const where = `${section ? `[${section}].` : ""}${key}: `;
    let col = kv[0].length;
    while (col < raw.length && (raw[col] === " " || raw[col] === "\t")) col++;
    let items: string[];
    if (raw[col] === "[") {
      const arr = readArray(lines, row, col, where);
      items = arr.items;
      row = arr.row;
    } else {
      items = readScalar(raw, col, row, where);
    }
    // Top-level keys are checked (fail closed) but hold nothing the loader reads.
    if (section) out[section]![key] = items;
  }
  return out;
}

function githubFromObj(o: Record<string, string[]> | undefined): GithubAllowlists {
  const g = emptyGithub();
  if (!o) return g;
  g.orgs = lower(normList(o.orgs ?? o.organizations));
  g.repos = lower(normList(o.repos ?? o.repositories));
  g.users = lower(normList(o.users));
  g.denyOrgs = lower(normList(o.deny_orgs ?? o.denyorgs));
  g.denyRepos = lower(normList(o.deny_repos ?? o.denyrepos));
  g.denyUsers = lower(normList(o.deny_users ?? o.denyusers));
  return g;
}

function discordFromObj(o: Record<string, string[]> | undefined): DiscordAllowlists {
  const d = emptyDiscord();
  if (!o) return d;
  d.channels = lower(normList(o.channels));
  d.roles = lower(normList(o.roles));
  d.users = lower(normList(o.users));
  d.denyChannels = lower(normList(o.deny_channels ?? o.denychannels));
  d.denyRoles = lower(normList(o.deny_roles ?? o.denyroles));
  d.denyUsers = lower(normList(o.deny_users ?? o.denyusers));
  return d;
}

function mergeGithub(base: GithubAllowlists, over: Partial<GithubAllowlists>): GithubAllowlists {
  const pick = (a: string[], b: string[] | undefined) =>
    b && b.length > 0 ? lower([...a, ...b]) : a;
  return {
    orgs: pick(base.orgs, over.orgs),
    repos: pick(base.repos, over.repos),
    users: pick(base.users, over.users),
    denyOrgs: pick(base.denyOrgs, over.denyOrgs),
    denyRepos: pick(base.denyRepos, over.denyRepos),
    denyUsers: pick(base.denyUsers, over.denyUsers),
  };
}

function mergeDiscord(base: DiscordAllowlists, over: Partial<DiscordAllowlists>): DiscordAllowlists {
  const pick = (a: string[], b: string[] | undefined) =>
    b && b.length > 0 ? lower([...a, ...b]) : a;
  return {
    channels: pick(base.channels, over.channels),
    roles: pick(base.roles, over.roles),
    users: pick(base.users, over.users),
    denyChannels: pick(base.denyChannels, over.denyChannels),
    denyRoles: pick(base.denyRoles, over.denyRoles),
    denyUsers: pick(base.denyUsers, over.denyUsers),
  };
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}

function finalize(cfg: AllowlistConfig): AllowlistConfig {
  return {
    sourcePath: cfg.sourcePath,
    github: {
      orgs: dedupe(cfg.github.orgs),
      repos: dedupe(cfg.github.repos),
      users: dedupe(cfg.github.users),
      denyOrgs: dedupe(cfg.github.denyOrgs),
      denyRepos: dedupe(cfg.github.denyRepos),
      denyUsers: dedupe(cfg.github.denyUsers),
    },
    discord: {
      channels: dedupe(cfg.discord.channels),
      roles: dedupe(cfg.discord.roles),
      users: dedupe(cfg.discord.users),
      denyChannels: dedupe(cfg.discord.denyChannels),
      denyRoles: dedupe(cfg.discord.denyRoles),
      denyUsers: dedupe(cfg.discord.denyUsers),
    },
  };
}

export function defaultAllowlistPaths(home: string = homedir()): string[] {
  const base = join(home, ".config", "corvidinho");
  return [join(base, "allowlist.toml"), join(base, "allowlist.json")];
}

export function resolveAllowlistPath(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string | null {
  const explicit = env.CORVIDINHO_ALLOWLIST_FILE?.trim();
  if (explicit) return explicit;
  for (const p of defaultAllowlistPaths(home)) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * True when an allowlist file path is read as JSON (else the TOML subset).
 * Case-sensitive `.json` suffix. The loader and `/admin`'s writer both use
 * this one rule so they always agree on a file's format.
 */
export function isJsonAllowlistPath(path: string): boolean {
  return path.endsWith(".json");
}

export async function loadAllowlistFile(
  path: string,
): Promise<
  | { ok: true; github: GithubAllowlists; discord: DiscordAllowlists }
  | { ok: false; error: string }
> {
  try {
    const text = await Bun.file(path).text();
    if (isJsonAllowlistPath(path)) {
      const raw = JSON.parse(text) as Record<string, unknown>;
      const gh = (raw.github ?? raw.Github ?? {}) as Record<string, unknown>;
      const dc = (raw.discord ?? raw.Discord ?? {}) as Record<string, unknown>;
      const asLists = (obj: Record<string, unknown>): Record<string, string[]> => {
        const out: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(obj)) {
          if (Array.isArray(v)) out[k.toLowerCase()] = normList(v);
          else if (typeof v === "string") out[k.toLowerCase()] = parseList(v);
        }
        return out;
      };
      return {
        ok: true,
        github: githubFromObj(asLists(gh)),
        discord: discordFromObj(asLists(dc)),
      };
    }
    const parsed = parseSimpleToml(text);
    return {
      ok: true,
      github: githubFromObj(parsed.github),
      discord: discordFromObj(parsed.discord),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `allowlist file unreadable or malformed (${path}): ${msg}` };
  }
}

/** Env overlays — only non-empty lists contribute (union onto file). */
export function githubFromEnv(env: NodeJS.ProcessEnv): Partial<GithubAllowlists> {
  return {
    orgs: lower(parseList(env.CORVIDINHO_GITHUB_ALLOW_ORGS)),
    repos: lower(parseList(env.CORVIDINHO_GITHUB_ALLOW_REPOS)),
    users: lower(parseList(env.CORVIDINHO_GITHUB_ALLOW_USERS)),
    denyOrgs: lower(parseList(env.CORVIDINHO_GITHUB_DENY_ORGS)),
    denyRepos: lower(parseList(env.CORVIDINHO_GITHUB_DENY_REPOS)),
    denyUsers: lower(parseList(env.CORVIDINHO_GITHUB_DENY_USERS)),
  };
}

export function discordFromEnv(env: NodeJS.ProcessEnv): Partial<DiscordAllowlists> {
  return {
    channels: lower(parseList(env.CORVIDINHO_DISCORD_ALLOW_CHANNELS)),
    roles: lower(parseList(env.CORVIDINHO_DISCORD_ALLOW_ROLES)),
    users: lower(parseList(env.CORVIDINHO_DISCORD_ALLOW_USERS)),
    denyChannels: lower(parseList(env.CORVIDINHO_DISCORD_DENY_CHANNELS)),
    denyRoles: lower(parseList(env.CORVIDINHO_DISCORD_DENY_ROLES)),
    denyUsers: lower(parseList(env.CORVIDINHO_DISCORD_DENY_USERS)),
  };
}

export type LoadOptions = {
  env?: NodeJS.ProcessEnv;
  home?: string;
  /** Skip auto-resolve; null skips file. */
  filePath?: string | null;
  preloaded?: {
    github: GithubAllowlists;
    discord: DiscordAllowlists;
    sourcePath: string;
  } | null;
};

/**
 * Load allowlist config: file (if present) then env overlays.
 * Missing file is OK — env-only still works; empty allow ⇒ deny-all at gate.
 * A file that exists but cannot be read or parsed THROWS (fail closed): env
 * allow overlays would otherwise admit what the file's deny lists refuse.
 * Callers refuse on the throw (bridge / watch / daemon do not start; gates,
 * git-push and discord-post-message refuse the action).
 */
export async function loadAllowlist(opts: LoadOptions = {}): Promise<AllowlistConfig> {
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir();
  let cfg = emptyConfig();

  if (opts.preloaded) {
    cfg = {
      sourcePath: opts.preloaded.sourcePath,
      github: opts.preloaded.github,
      discord: opts.preloaded.discord,
    };
  } else {
    const path =
      opts.filePath !== undefined ? opts.filePath : resolveAllowlistPath(env, home);
    if (path && existsSync(path)) {
      const loaded = await loadAllowlistFile(path);
      if (!loaded.ok) {
        // Never read a broken file as "no file": its deny lists would be lost
        // while env allow still admits (ALLOW-1..6 / GITHUB-6).
        throw new Error(`${loaded.error} — refusing to fall back to env-only allowlists`);
      }
      cfg = {
        sourcePath: path,
        github: loaded.github,
        discord: loaded.discord,
      };
    }
  }

  cfg = {
    sourcePath: cfg.sourcePath,
    github: mergeGithub(cfg.github, githubFromEnv(env)),
    discord: mergeDiscord(cfg.discord, discordFromEnv(env)),
  };
  return finalize(cfg);
}

/** Sync helper for gates that already have env overlays (no file). */
export function configFromEnvOnly(env: NodeJS.ProcessEnv = process.env): AllowlistConfig {
  return finalize({
    sourcePath: null,
    github: mergeGithub(emptyGithub(), githubFromEnv(env)),
    discord: mergeDiscord(emptyDiscord(), discordFromEnv(env)),
  });
}
