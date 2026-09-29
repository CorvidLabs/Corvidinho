/**
 * ALLOW-4 — load allowlists from bot-VM file + env overlays.
 * Paths: CORVIDINHO_ALLOWLIST_FILE (a leading ~ or ~/ is HOME), else
 * ~/.config/corvidinho/allowlist.toml|json
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
/**
 * Any other one- or two-bracket header (`[my notes]`, `[[rules]]`, `["x"]`):
 * read as an unrelated, lenient section unless it names github / discord.
 */
const LOOSE_HEADER_RE = /^\[(\[?)([^[\]]+)\](\]?)$/;
const KEY_RE = /^\s*([A-Za-z0-9_]+)\s*=/;
/** Unquoted array item / value characters. */
const BARE_RE = /^[^\s,[\]"'#=]+/;
/** A deny list key, in any spelling an operator might write. */
const DENY_KEY_RE = /^["']?deny[\w-]*["']?\s*=/i;

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

/** Space between tokens: any Unicode whitespace (a pasted U+00A0 too). */
function skipSpace(line: string, col: number): number {
  while (col < line.length && /\s/.test(line[col]!)) col++;
  return col;
}

function blankFrom(line: string, col: number): boolean {
  const rest = line.slice(col).trimStart();
  return rest === "" || rest.startsWith("#");
}

/**
 * Section named by a header line (comment stripped, trimmed), lowercased.
 * `[name]` is a section; another one- or two-bracket header is an unrelated
 * lenient section, and throws when it names github / discord (a list the
 * loader would otherwise skip). Anything else starting with `[` throws.
 */
function headerSection(line: string, row: number): string {
  const sec = line.match(HEADER_RE);
  if (sec) return sec[1]!.toLowerCase();
  const loose = line.match(LOOSE_HEADER_RE);
  const name = loose?.[2]!.replace(/["']/g, "").trim().toLowerCase() ?? "";
  if (
    !loose ||
    loose[1]!.length !== loose[3]!.length ||
    !name ||
    /[,=]/.test(name) ||
    /(^|[^a-z0-9_])(github|discord)([^a-z0-9_]|$)/.test(name)
  ) {
    throw tomlError(row, "", "malformed or unsupported section header");
  }
  return name;
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
    col = skipSpace(line, col);
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

/** One `key = value` of the allowlist TOML file, with the lines it spans. */
export type SimpleTomlEntry = {
  /** Lowercased section name; `""` is the top level. */
  section: string;
  /** Lowercased key. */
  key: string;
  /** First and last line (0-based, split on `\r?\n`); they differ for a multi-line array. */
  row: number;
  endRow: number;
  items: string[];
};

export type SimpleTomlScan = {
  /** Section headers in file order (0-based row, lowercased section name). */
  headers: Array<{ row: number; section: string }>;
  /** Every key read, in file order (duplicates included; the last one wins). */
  entries: SimpleTomlEntry[];
};

/**
 * Read the allowlist TOML subset (ALLOW-4) with line positions, so `/admin`
 * edits exactly the lines the loader read. `parseSimpleToml` is built on it
 * and documents the subset; this throws exactly when it does.
 */
export function scanSimpleToml(text: string): SimpleTomlScan {
  const scan: SimpleTomlScan = { headers: [], entries: [] };
  const lines = text.split(/\r?\n/);
  let section = "";
  for (let row = 0; row < lines.length; row++) {
    const raw = lines[row]!;
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    if (line.startsWith("[")) {
      section = headerSection(line, row);
      scan.headers.push({ row, section });
      continue;
    }
    if (!isListSection(section)) {
      if (DENY_KEY_RE.test(line)) {
        throw tomlError(row, `[${section}]: `, "deny list outside [github] / [discord] (it would be ignored)");
      }
      const kv = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
      if (kv) {
        const key = kv[1]!.toLowerCase();
        scan.entries.push({ section, key, row, endRow: row, items: legacyValue(kv[2]!.trim()) });
      }
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
    if (!section && DENY_KEY_RE.test(line)) {
      throw tomlError(row, where, "deny list outside [github] / [discord] (it would be ignored)");
    }
    const col = skipSpace(raw, kv[0].length);
    const start = row;
    let items: string[];
    if (raw[col] === "[") {
      const arr = readArray(lines, row, col, where);
      items = arr.items;
      row = arr.row;
    } else {
      items = readScalar(raw, col, row, where);
    }
    scan.entries.push({ section, key, row: start, endRow: row, items });
  }
  return scan;
}

/**
 * Minimal TOML subset for the allowlist file (ALLOW-4): `[section]` headers
 * and `key = value`, section names and keys lowercased. A value is an array
 * of quoted strings / bare words (`["a", 'b', c]`, `[]`) that may span lines
 * with a trailing comma and `#` comments, or a one-line `"a,b"` / `a b` list.
 * Any Unicode whitespace separates tokens. Single-line files read as before.
 *
 * Fail closed: in `[github]`, `[discord]` and the top level, any line or
 * value outside this subset throws (line + key in the message, no values).
 * A header that names github / discord in an unsupported form
 * (`[[github]]`, `["discord"]`, `[github`) throws, and so does a `deny…` key
 * anywhere but `[github]` / `[discord]`, where the loader would skip it.
 * Other sections — `[owner]` (read by identity/owner.ts), `[my notes]`,
 * `[[rules]]` — keep the lenient one-line reading.
 */
export function parseSimpleToml(text: string): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  const scan = scanSimpleToml(text);
  for (const h of scan.headers) out[h.section] ??= {};
  // Top-level keys are checked (fail closed) but hold nothing the loader reads.
  for (const e of scan.entries) if (e.section) out[e.section]![e.key] = e.items;
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

/**
 * CORVIDINHO_ALLOWLIST_FILE, else the first default path that exists. A
 * leading `~` or `~/` in the explicit value means `home`: dotenv loaders (Bun's
 * included) keep `~` literally, and a cwd-relative `~/…` is never found, which
 * would silently drop the file's deny lists. `~user` and every other value are
 * used as written.
 */
export function resolveAllowlistPath(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string | null {
  const explicit = env.CORVIDINHO_ALLOWLIST_FILE?.trim();
  if (explicit) {
    if (explicit === "~") return home;
    if (explicit.startsWith("~/")) return join(home, explicit.slice(2));
    return explicit;
  }
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

/**
 * The allow/deny lists the loader reads from allowlist file text (JSON when
 * `isJsonAllowlistPath(path)`, else the TOML subset). Throws when the text
 * cannot be parsed. `/admin` re-reads its rewrite with this before writing.
 */
export function parseAllowlistText(
  text: string,
  path: string,
): { github: GithubAllowlists; discord: DiscordAllowlists } {
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
    return { github: githubFromObj(asLists(gh)), discord: discordFromObj(asLists(dc)) };
  }
  const parsed = parseSimpleToml(text);
  return { github: githubFromObj(parsed.github), discord: discordFromObj(parsed.discord) };
}

export async function loadAllowlistFile(
  path: string,
): Promise<
  | { ok: true; github: GithubAllowlists; discord: DiscordAllowlists }
  | { ok: false; error: string }
> {
  try {
    const text = await Bun.file(path).text();
    return { ok: true, ...parseAllowlistText(text, path) };
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
 * Callers refuse on the throw (bridge / watch / daemon do not start); gates
 * use `tryLoadAllowlist` and refuse the action with its error.
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

/**
 * `loadAllowlist` for action gates: a file that cannot be read or parsed is
 * an error to refuse with (it names the path, line and key, never list
 * values), not a throw, so a gate never surfaces a stack trace.
 */
export async function tryLoadAllowlist(
  opts: LoadOptions = {},
): Promise<{ ok: true; config: AllowlistConfig } | { ok: false; error: string }> {
  try {
    return { ok: true, config: await loadAllowlist(opts) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Sync helper for gates that already have env overlays (no file). */
export function configFromEnvOnly(env: NodeJS.ProcessEnv = process.env): AllowlistConfig {
  return finalize({
    sourcePath: null,
    github: mergeGithub(emptyGithub(), githubFromEnv(env)),
    discord: mergeDiscord(emptyDiscord(), discordFromEnv(env)),
  });
}
