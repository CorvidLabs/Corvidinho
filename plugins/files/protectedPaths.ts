/**
 * SAFE-2 protected project infra — hard refuse overwrite/delete via file tools.
 * No in-band override (Merlin files-delete pattern).
 */

import { basename } from "node:path";
import {
  resolveActingIsAdmin,
  roleSessionActive,
} from "../../src/plugins/roles.ts";

/** True when path looks like protected project infrastructure (SAFE-2). */
export function isProtectedPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((p) => p.length > 0 && p !== ".");

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === ".git") return true;
    if (lower === ".env" || lower.startsWith(".env.")) return true;
    if (lower === "specs") return true;
  }

  const base = basename(normalized);
  const baseLower = base.toLowerCase();
  if (baseLower === "fledge.toml") return true;
  // Bun runtime config: a planted `preload` runs code in every spawned agent.
  if (baseLower === "bunfig.toml" || baseLower === ".bunfig.toml") return true;
  if (baseLower.endsWith(".spec.md")) return true;
  if (baseLower.includes("keystore")) return true;
  if (baseLower === "wallet-keystore.json") return true;

  return false;
}

export function protectedRefuseMessage(path: string): string {
  return (
    `refused (SAFE-2): '${path}' is protected project infra ` +
    `(.env* / .git / fledge.toml / bunfig.toml / specs / *.spec.md / keystores). ` +
    `There is NO override — edit via SpecSync or outside the agent file tools.`
  );
}

/**
 * Secret-looking paths — refused on read for non-ADMIN community sessions
 * (ROLES-CHAT-8). Narrower than SAFE-2 write protection (does not block specs/).
 */
export function isSecretPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((p) => p.length > 0 && p !== ".");
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === ".env" || lower.startsWith(".env.")) return true;
    if (lower === ".ssh") return true;
    if (lower.includes("keystore")) return true;
  }
  const base = parts.length ? parts[parts.length - 1]!.toLowerCase() : "";
  if (base === "credentials" || base === "credentials.json") return true;
  if (base === "id_rsa" || base === "id_ed25519" || base.endsWith(".pem")) return true;
  if (base === "wallet-keystore.json") return true;
  return false;
}

/**
 * grep globs mirroring isSecretPath, so a recursive search never opens a
 * secret file (ROLES-CHAT-8). grep globs are case-sensitive and isSecretPath
 * is not, so callers still drop result lines whose file isSecretPath matches.
 */
export const SECRET_GREP_EXCLUDES: readonly string[] = [
  "--exclude=.env",
  "--exclude=.env.*",
  "--exclude=*keystore*",
  "--exclude=credentials",
  "--exclude=credentials.json",
  "--exclude=id_rsa",
  "--exclude=id_ed25519",
  "--exclude=*.pem",
  "--exclude-dir=.env",
  "--exclude-dir=.env.*",
  "--exclude-dir=.ssh",
  "--exclude-dir=*keystore*",
];

/**
 * git exclude pathspecs mirroring isSecretPath (any `.env` / `.env.*` / `.ssh`
 * / `*keystore*` component; key, `*.pem` and credentials basenames), so a
 * non-ADMIN `git-diff` never prints a tracked secret file (ROLES-CHAT-8).
 * `icase` matches isSecretPath's case folding; `**` / `/**` match any depth.
 */
export const SECRET_GIT_EXCLUDE_PATHSPECS: readonly string[] = [
  "**/.env",
  "**/.env/**",
  "**/.env.*",
  "**/.env.*/**",
  "**/.ssh",
  "**/.ssh/**",
  "**/*keystore*",
  "**/*keystore*/**",
  "**/credentials",
  "**/credentials.json",
  "**/id_rsa",
  "**/id_ed25519",
  "**/*.pem",
].map((glob) => `:(exclude,glob,icase)${glob}`);

/**
 * ROLES-CHAT-8: true when this call runs in a non-ADMIN role session, so the
 * read-ish file tools refuse an explicit secret path and leave secret paths
 * out of listings and searches. ADMIN and the local CLI (no role session) keep
 * full access. Re-checked each call (ROLES-CHAT-6).
 */
export async function secretPathsRefused(): Promise<boolean> {
  return roleSessionActive() && !(await resolveActingIsAdmin());
}

export function secretRefuseMessage(path: string): string {
  return (
    `refused (ROLES-CHAT-8): '${path}' looks like a secret path ` +
    `(.env* / .ssh / keys / keystores) — not available in community chat`
  );
}
