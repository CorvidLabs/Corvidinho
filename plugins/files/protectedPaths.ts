/**
 * SAFE-2 protected project infra — hard refuse overwrite/delete via file tools.
 * No in-band override (Merlin files-delete pattern).
 */

import { basename } from "node:path";

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
  if (baseLower.endsWith(".spec.md")) return true;
  if (baseLower.includes("keystore")) return true;
  if (baseLower === "wallet-keystore.json") return true;

  return false;
}

export function protectedRefuseMessage(path: string): string {
  return (
    `refused (SAFE-2): '${path}' is protected project infra ` +
    `(.env* / .git / fledge.toml / specs / *.spec.md / keystores). ` +
    `There is NO override — edit via SpecSync or outside the agent file tools.`
  );
}
