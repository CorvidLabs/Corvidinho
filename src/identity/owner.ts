/**
 * IDENTITY-1 — durable owner record from bot-VM config (ALLOW-4).
 *
 * Sources (env wins per field):
 *   - env: CORVIDINHO_OWNER_DISCORD_ID, CORVIDINHO_OWNER_GITHUB_LOGIN,
 *     CORVIDINHO_OWNER_DISPLAY
 *   - allowlist file `[owner]` section (discord_id, github_id, github_login,
 *     display), or an `owner` object in a `.json` allowlist file.
 *
 * Matching is by Discord snowflake, and on GitHub by the numeric user id
 * (`[owner] github_id`) only — never by display name, and never by GitHub
 * login (IDENTITY-7.a: a renamed or re-registered login is someone else).
 * The login is kept to @mention the owner on GitHub. Missing / blank /
 * non-snowflake Discord id ⇒ no owner (IDENTITY-3 owner path). Ids and logins
 * are never echoed in status lines.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolveAllowlistPath } from "../allowlist/load.ts";

export type OwnerRecord = {
  /** Discord user snowflake (digits only). */
  discordId: string;
  /**
   * GitHub numeric user id (digits), from `[owner] github_id` — the only way
   * the owner is recognised on GitHub (IDENTITY-7.a).
   */
  githubId?: string;
  /** Lowercased GitHub login without a leading `@` (for @mentions; never matched). */
  githubLogin?: string;
  /** Human display name (never used for matching). */
  display?: string;
};

/** Raw owner fields as read from one source (before validation). */
export type OwnerFields = {
  discordId?: string;
  githubId?: string;
  githubLogin?: string;
  display?: string;
};

export type OwnerLoadResult = {
  owner: OwnerRecord | null;
  /** Plain-language config problems; never contain ids, logins, or tokens. */
  issues: string[];
};

export const OWNER_ENV = {
  discordId: "CORVIDINHO_OWNER_DISCORD_ID",
  githubLogin: "CORVIDINHO_OWNER_GITHUB_LOGIN",
  display: "CORVIDINHO_OWNER_DISPLAY",
} as const;

/** Display names are for humans only; keep them short and single-line. */
export const OWNER_DISPLAY_MAX = 64;

const SNOWFLAKE_RE = /^\d{1,25}$/;
const GITHUB_LOGIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,38})$/;
const GITHUB_ID_RE = /^\d{1,20}$/;

function clean(raw: string | undefined | null): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const t = String(raw).trim();
  return t.length > 0 ? t : undefined;
}

export function normalizeGithubLogin(raw: string | undefined | null): string | undefined {
  const t = clean(raw);
  if (!t) return undefined;
  return t.replace(/^@/, "").toLowerCase();
}

/** GitHub numeric user id as digits (no leading zeros), else undefined. */
export function normalizeGithubId(raw: string | number | undefined | null): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number") {
    return Number.isSafeInteger(raw) && raw > 0 ? String(raw) : undefined;
  }
  const t = String(raw).trim();
  return GITHUB_ID_RE.test(t) ? t.replace(/^0+(?=\d)/, "") : undefined;
}

export function normalizeDisplay(raw: string | undefined | null): string | undefined {
  const t = clean(raw);
  if (!t) return undefined;
  const oneLine = t.replace(/\s+/g, " ");
  return oneLine.length > OWNER_DISPLAY_MAX
    ? oneLine.slice(0, OWNER_DISPLAY_MAX)
    : oneLine;
}

function parseScalar(raw: string): string {
  const v = raw.trim();
  const q = v[0];
  if (q === '"' || q === "'") {
    const end = v.indexOf(q, 1);
    return end > 0 ? v.slice(1, end) : v.slice(1);
  }
  return v.replace(/#.*$/, "").trim();
}

/**
 * Read the `[owner]` section of a TOML allowlist file.
 * Scalar-aware (quoted or bare values; `#` inside quotes kept) — the shared
 * list parser splits on whitespace/commas and would mangle display names.
 */
export function parseOwnerToml(text: string): OwnerFields {
  const out: OwnerFields = {};
  let inOwner = false;
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    const sec = line.match(/^\[([^\]]+)\]\s*(?:#.*)?$/);
    if (sec) {
      inOwner = sec[1]!.trim().toLowerCase() === "owner";
      continue;
    }
    if (!inOwner) continue;
    const kv = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1]!.toLowerCase();
    const value = parseScalar(kv[2]!);
    if (key === "discord_id") out.discordId = value;
    else if (key === "github_id") out.githubId = value;
    else if (key === "github_login") out.githubLogin = value;
    else if (key === "display") out.display = value;
  }
  return out;
}

/**
 * Read an `owner` object from a parsed JSON allowlist file.
 * A numeric `discord_id` is rejected: JSON numbers lose snowflake precision.
 */
export function ownerFieldsFromJson(raw: unknown): { fields: OwnerFields; issues: string[] } {
  const issues: string[] = [];
  const fields: OwnerFields = {};
  if (!raw || typeof raw !== "object") return { fields, issues };
  const o = (raw as Record<string, unknown>).owner;
  if (!o || typeof o !== "object") return { fields, issues };
  const rec = o as Record<string, unknown>;
  const str = (k: string): string | undefined =>
    typeof rec[k] === "string" ? (rec[k] as string) : undefined;
  if (typeof rec.discord_id === "number") {
    issues.push(
      "owner discord_id in the JSON allowlist file must be a quoted string (JSON numbers lose snowflake precision)",
    );
  } else {
    fields.discordId = str("discord_id");
  }
  // GitHub ids fit a JSON number exactly (well under 2^53), so both spellings read.
  const gid = rec.github_id;
  if (typeof gid === "number") {
    if (Number.isSafeInteger(gid) && gid > 0) fields.githubId = String(gid);
    else issues.push("owner github_id in the JSON allowlist file is not a numeric GitHub user id (ignored)");
  } else {
    fields.githubId = str("github_id");
  }
  fields.githubLogin = str("github_login");
  fields.display = str("display");
  return { fields, issues };
}

export function ownerFieldsFromEnv(env: NodeJS.ProcessEnv): OwnerFields {
  return {
    discordId: clean(env[OWNER_ENV.discordId]),
    githubLogin: clean(env[OWNER_ENV.githubLogin]),
    display: clean(env[OWNER_ENV.display]),
  };
}

/**
 * Merge file + env fields (env wins per non-empty field) and validate.
 * Returns no owner unless a digits-only Discord snowflake is present.
 */
export function resolveOwner(
  file: OwnerFields | null | undefined,
  env: OwnerFields | null | undefined,
): OwnerLoadResult {
  const issues: string[] = [];
  const pick = (k: keyof OwnerFields) => clean(env?.[k]) ?? clean(file?.[k]);
  const discordId = pick("discordId");
  const rawGithubId = pick("githubId");
  const githubId = normalizeGithubId(rawGithubId);
  const githubLogin = normalizeGithubLogin(pick("githubLogin"));
  const display = normalizeDisplay(pick("display"));

  if (rawGithubId && !githubId) {
    issues.push("owner github_id is not a numeric GitHub user id (ignored — the owner is not recognised on GitHub until fixed)");
  }

  if (githubLogin && !GITHUB_LOGIN_RE.test(githubLogin)) {
    issues.push("owner github_login is not a valid GitHub login (ignored)");
  }
  const validLogin =
    githubLogin && GITHUB_LOGIN_RE.test(githubLogin) ? githubLogin : undefined;

  if (!discordId) {
    if (validLogin || display) {
      issues.push(
        "owner has no Discord id — set CORVIDINHO_OWNER_DISCORD_ID or [owner].discord_id (no owner until set)",
      );
    }
    return { owner: null, issues };
  }
  if (!SNOWFLAKE_RE.test(discordId)) {
    issues.push(
      "owner Discord id is not a numeric Discord snowflake (no owner until fixed)",
    );
    return { owner: null, issues };
  }
  const owner: OwnerRecord = { discordId };
  if (githubId) owner.githubId = githubId;
  if (validLogin) owner.githubLogin = validLogin;
  if (display) owner.display = display;
  return { owner, issues };
}

/** Read owner fields from an allowlist file (TOML or JSON). Missing file ⇒ empty. */
export async function readOwnerFile(
  path: string,
): Promise<{ fields: OwnerFields; issues: string[] }> {
  if (!existsSync(path)) return { fields: {}, issues: [] };
  try {
    const text = await Bun.file(path).text();
    if (path.endsWith(".json")) {
      return ownerFieldsFromJson(JSON.parse(text));
    }
    return { fields: parseOwnerToml(text), issues: [] };
  } catch {
    // Unreadable file ⇒ no owner from file (fail closed); env may still apply.
    return {
      fields: {},
      issues: ["allowlist file could not be read for the [owner] section"],
    };
  }
}

export type LoadOwnerOptions = {
  env?: NodeJS.ProcessEnv;
  home?: string;
  /**
   * Allowlist file to read `[owner]` from. `undefined` ⇒ resolve like the
   * allowlist loader (CORVIDINHO_ALLOWLIST_FILE, then ~/.config/corvidinho);
   * `null` ⇒ env only.
   */
  filePath?: string | null;
};

/**
 * Load the owner record from bot-VM config. Re-read on every call, so the
 * owner survives restarts without any DB state.
 */
export async function loadOwnerConfig(
  opts: LoadOwnerOptions = {},
): Promise<OwnerLoadResult> {
  const env = opts.env ?? process.env;
  const path =
    opts.filePath !== undefined
      ? opts.filePath
      : resolveAllowlistPath(env, opts.home ?? homedir());
  const file = path ? await readOwnerFile(path) : { fields: {}, issues: [] };
  const resolved = resolveOwner(file.fields, ownerFieldsFromEnv(env));
  return {
    owner: resolved.owner,
    issues: [...file.issues, ...resolved.issues],
  };
}

/** Configured owner or null (IDENTITY-3: empty ⇒ no owner). */
export async function getOwner(opts: LoadOwnerOptions = {}): Promise<OwnerRecord | null> {
  return (await loadOwnerConfig(opts)).owner;
}

/** True only when `userId` is the owner's Discord snowflake. */
export function isOwnerDiscord(
  owner: OwnerRecord | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!owner || !userId) return false;
  const id = userId.trim();
  return id.length > 0 && id === owner.discordId;
}

/**
 * True only when `githubId` is the owner's declared GitHub numeric user id
 * (IDENTITY-7.a). A login never counts: it can be renamed or re-registered.
 * No `[owner] github_id` ⇒ nobody is the owner on GitHub.
 */
export function isOwnerGithub(
  owner: OwnerRecord | null | undefined,
  githubId: string | number | null | undefined,
): boolean {
  if (!owner?.githubId) return false;
  const id = normalizeGithubId(githubId);
  return id !== undefined && id === owner.githubId;
}

/** Status line: configured yes/no plus display name only (no ids). */
export function formatOwnerStatus(owner: OwnerRecord | null | undefined): string {
  if (!owner) return "Owner configured: no";
  return owner.display
    ? `Owner configured: yes (${owner.display})`
    : "Owner configured: yes";
}

/**
 * `corvidinho doctor` detail (CLI-4): configured yes/no plus display only,
 * with value-free config issues. Missing owner is informational.
 */
export function formatOwnerDoctorDetail(result: OwnerLoadResult): string {
  const base = result.owner
    ? result.owner.display
      ? `configured: yes (${result.owner.display})`
      : "configured: yes (no display name set)"
    : `configured: no — optional; set ${OWNER_ENV.discordId} or allowlist [owner] discord_id (IDENTITY-1)`;
  return result.issues.length > 0
    ? `${base}; ${result.issues.join("; ")}`
    : base;
}
