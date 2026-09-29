/**
 * ADMIN-1 / ADMIN-2 — runtime edits of the Discord allowlist the bridge
 * already reads (ALLOW-4): `[discord].users` and `[discord].channels` in the
 * allowlist file (CORVIDINHO_ALLOWLIST_FILE, else ~/.config/corvidinho/
 * allowlist.toml|json). No second store.
 *
 * - The file is rewritten atomically (temp file in the same dir + rename),
 *   keeping its mode. TOML edits touch only the one key line inside
 *   `[discord]`; every other line (other sections such as `[owner]`,
 *   comments, blank lines) is kept verbatim.
 * - Env overlays (CORVIDINHO_DISCORD_ALLOW_*, DISCORD_CHANNEL_IDS) are never
 *   written to the file and cannot be changed at runtime.
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
  isJsonAllowlistPath,
  parseAllowlistText,
  parseSimpleToml,
  resolveAllowlistPath,
  scanSimpleToml,
} from "../allowlist/load.ts";
import type { AllowlistConfig } from "../allowlist/types.ts";

/** Allowlist keys `/admin` may change (ADMIN-1 users, ADMIN-2 channels). */
export type AdminListKey = "users" | "channels";
export type AdminListOp = "add" | "remove";

/** Discord snowflake: digits only (also keeps TOML/JSON output injection-free). */
export const ADMIN_SNOWFLAKE_RE = /^\d{1,25}$/;

/** Env vars that feed each live list (read-only at runtime). */
export const ADMIN_LIST_ENV: Record<AdminListKey, string> = {
  users: "CORVIDINHO_DISCORD_ALLOW_USERS",
  channels: "CORVIDINHO_DISCORD_ALLOW_CHANNELS / DISCORD_CHANNEL_IDS",
};

export type AllowlistFileFormat = "toml" | "json";

export type AdminListPlan = {
  path: string;
  format: AllowlistFileFormat;
  /** False when the file does not exist yet (commit creates it). */
  exists: boolean;
  key: AdminListKey;
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
  const e = discordFromEnv(env);
  if (key === "users") return lowerDedupe(e.users ?? []);
  return lowerDedupe([...(e.channels ?? []), ...splitList(env.DISCORD_CHANNEL_IDS)]);
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

function jsonDiscordObject(
  raw: Record<string, unknown>,
): { name: string; obj: Record<string, unknown> | undefined } {
  const name = raw.discord !== undefined ? "discord" : raw.Discord !== undefined ? "Discord" : "discord";
  const v = raw[name];
  if (v === undefined) return { name, obj: undefined };
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`JSON allowlist "${name}" must be an object`);
  }
  return { name, obj: v as Record<string, unknown> };
}

/** Raw entries of `[discord].<key>` in allowlist file text (case kept). */
export function readFileAdminList(
  text: string,
  format: AllowlistFileFormat,
  key: AdminListKey,
): string[] {
  if (format === "toml") {
    return (parseSimpleToml(text).discord?.[key] ?? []).map((s) => s.trim()).filter(Boolean);
  }
  const { obj } = jsonDiscordObject(parseJsonObject(text));
  if (!obj) return [];
  let value: unknown;
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() === key) value = v;
  }
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  if (typeof value === "string") return splitList(value);
  return [];
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
 * Set `[discord].<key>` in TOML text. Lines are located with the loader's own
 * reader (`scanSimpleToml`), so a multi-line array — the key's own or any
 * other — is always handled whole. Every `<key> = …` inside `[discord]`
 * (single- or multi-line) becomes one line; indentation and the comment on
 * its first line are kept (comments on the lines of a collapsed multi-line
 * array are not). A missing key goes after the last value in the first
 * `[discord]` (after its closing `]`), or a `[discord]` section is appended.
 * Every other line is kept verbatim. Throws on text the loader would refuse.
 */
export function setTomlDiscordList(
  text: string,
  key: AdminListKey,
  values: readonly string[],
): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.length > 0 ? text.split(/\r?\n/) : [];
  const scan = scanSimpleToml(text);
  const list = formatTomlList(values);
  const targets = scan.entries.filter((e) => e.section === "discord" && e.key === key);

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
  const discord = scan.headers.find((h) => h.section === "discord");
  if (discord) {
    const end = scan.headers.find((h) => h.row > discord.row)?.row ?? lines.length;
    const inBlock = scan.entries.filter(
      (e) => e.section === "discord" && e.row > discord.row && e.row < end,
    );
    const after = inBlock.length > 0 ? inBlock[inBlock.length - 1]!.endRow : discord.row;
    const out = [...lines];
    out.splice(after + 1, 0, line);
    return out.join(eol);
  }
  const out = [...lines];
  const trailing = out.length > 0 && out[out.length - 1] === "";
  if (trailing) out.pop();
  if (out.length > 0) out.push("");
  out.push("[discord]", line, "");
  return out.join(eol);
}

/**
 * Set `discord.<key>` in JSON text; keeps every other key (e.g. `owner`).
 * Case-variant duplicates of the key collapse onto the first one.
 */
export function setJsonDiscordList(
  text: string,
  key: AdminListKey,
  values: readonly string[],
): string {
  const raw = parseJsonObject(text);
  const { name, obj } = jsonDiscordObject(raw);
  const target: Record<string, unknown> = obj ?? {};
  const matches = Object.keys(target).filter((k) => k.toLowerCase() === key);
  const keep = matches[0] ?? key;
  for (const k of matches.slice(1)) delete target[k];
  target[keep] = [...values];
  raw[name] = target;
  return `${JSON.stringify(raw, null, 2)}\n`;
}

/**
 * Safety net before any write: re-read the new text exactly as the loader
 * will after a restart. It must load; `[discord].<key>` must read back as
 * `fileAfter`; every other allow/deny list the loader reads must be
 * unchanged, and (TOML) so must every other key of every section, `[owner]`
 * included. Returns what is wrong, or null.
 */
function rewriteProblem(o: {
  path: string;
  format: AllowlistFileFormat;
  key: AdminListKey;
  before: string;
  after: string;
  fileAfter: readonly string[];
}): string | null {
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
  if (!same(after.discord[o.key], o.fileAfter.map((x) => x.trim().toLowerCase()).filter(Boolean))) {
    return `[discord].${o.key} would not read back as intended`;
  }
  for (const k of Object.keys(before.github) as Array<keyof typeof before.github>) {
    if (!same(before.github[k], after.github[k])) return `it would change [github] ${k}`;
  }
  for (const k of Object.keys(before.discord) as Array<keyof typeof before.discord>) {
    if (k !== o.key && !same(before.discord[k], after.discord[k])) return `it would change [discord] ${k}`;
  }
  if (o.format === "toml") {
    const b = parseSimpleToml(o.before);
    const a = parseSimpleToml(o.after);
    for (const sec of new Set([...Object.keys(b), ...Object.keys(a)])) {
      const keys = new Set([...Object.keys(b[sec] ?? {}), ...Object.keys(a[sec] ?? {})]);
      for (const k of keys) {
        if (sec === "discord" && k === o.key) continue;
        if (!same(b[sec]?.[k], a[sec]?.[k])) return `it would change [${sec}] ${k}`;
      }
    }
  }
  return null;
}

const NEW_TOML_HEADER =
  "# Corvidinho allowlist (ALLOW-4). Created by /admin (ADMIN-1/2); see allowlist.example.toml.\n# Default-deny: empty allow lists refuse. Deny overrides always win.\n";

/**
 * Read the file and compute the change for one id (no writes).
 * Unreadable / unparsable files refuse instead of being clobbered.
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
  const path = resolveAdminAllowlistPath(opts.allowlist, env, opts.home);
  const format = allowlistFileFormat(path);
  const id = opts.id.trim().toLowerCase();
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
    const fileBefore = readFileAdminList(text, format, opts.key);
    const inFileBefore = fileBefore.some((x) => x.toLowerCase() === id);
    let fileAfter = fileBefore;
    if (opts.op === "add" && !inFileBefore) fileAfter = [...fileBefore, id];
    if (opts.op === "remove" && inFileBefore) {
      fileAfter = fileBefore.filter((x) => x.toLowerCase() !== id);
    }
    const envList = envAdminList(env, opts.key);
    const liveBefore = [...opts.allowlist.discord[opts.key]];
    const liveAfter = lowerDedupe([...fileAfter, ...envList]);
    const fileChanged = fileAfter !== fileBefore;
    let newText: string | undefined;
    if (fileChanged) {
      newText =
        format === "json"
          ? setJsonDiscordList(text, opts.key, fileAfter)
          : setTomlDiscordList(exists ? text : NEW_TOML_HEADER, opts.key, fileAfter);
      const problem = rewriteProblem({ path, format, key: opts.key, before: text, after: newText, fileAfter });
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
  const arr = live.allowlist.discord[plan.key];
  arr.splice(0, arr.length, ...plan.liveAfter);
  if (plan.key === "channels" && live.channelIds && live.channelIds !== arr) {
    live.channelIds.splice(0, live.channelIds.length, ...plan.liveAfter);
  }
}

/** Per-key file/env counts for `/admin config show` (read-only). */
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
    return {
      ok: true,
      path,
      format,
      exists,
      file: {
        users: readFileAdminList(text, format, "users"),
        channels: readFileAdminList(text, format, "channels"),
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, path, error: msg };
  }
}
