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
  parseSimpleToml,
  resolveAllowlistPath,
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

const SECTION_RE = /^\[([^\]]+)\]$/;
const KV_RE = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/;

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

function parseJsonObject(text: string): Record<string, unknown> {
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

/**
 * Set `[discord].<key>` in TOML text. Rewrites every `<key> = …` line inside
 * `[discord]` (single- or multi-line array); keeps indentation, trailing
 * comments and every other line. Adds the key (or the section) when missing.
 */
export function setTomlDiscordList(
  text: string,
  key: AdminListKey,
  values: readonly string[],
): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.length > 0 ? text.split(/\r?\n/) : [];
  const out: string[] = [];
  let section = "";
  let seenDiscord = false;
  let inFirstDiscord = false;
  let insertAfter = -1;
  let replaced = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const stripped = raw.replace(/#.*$/, "").trim();
    const sec = stripped.match(SECTION_RE);
    if (sec) {
      section = sec[1]!.trim().toLowerCase();
      inFirstDiscord = section === "discord" && !seenDiscord;
      if (inFirstDiscord) {
        seenDiscord = true;
        out.push(raw);
        insertAfter = out.length - 1;
        continue;
      }
      out.push(raw);
      continue;
    }
    const kv = section === "discord" ? stripped.match(KV_RE) : null;
    if (kv && kv[1]!.toLowerCase() === key) {
      const indent = raw.match(/^\s*/)?.[0] ?? "";
      const hashAt = raw.indexOf("#");
      let comment = "";
      if (hashAt >= 0) {
        const gap = raw.slice(0, hashAt).match(/\s*$/)?.[0] ?? "";
        comment = `${gap || " "}${raw.slice(hashAt)}`;
      }
      const value = kv[2]!.trim();
      if (value.startsWith("[") && !value.includes("]")) {
        // Multi-line array: drop continuation lines up to the closing "]".
        while (i + 1 < lines.length) {
          const next = lines[i + 1]!.replace(/#.*$/, "").trim();
          if (SECTION_RE.test(next) || KV_RE.test(next)) break;
          i++;
          if (next.includes("]")) break;
        }
      }
      out.push(`${indent}${kv[1]} = ${formatTomlList(values)}${comment}`);
      replaced = true;
      if (inFirstDiscord) insertAfter = out.length - 1;
      continue;
    }
    out.push(raw);
    if (kv && inFirstDiscord) insertAfter = out.length - 1;
  }

  const line = `${key} = ${formatTomlList(values)}`;
  if (!replaced) {
    if (seenDiscord) {
      out.splice(insertAfter + 1, 0, line);
    } else {
      const trailing = out.length > 0 && out[out.length - 1] === "";
      if (trailing) out.pop();
      if (out.length > 0) out.push("");
      out.push("[discord]", line, "");
    }
  }
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
