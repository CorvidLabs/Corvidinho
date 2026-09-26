/**
 * Non-interactive + allowlist detection shared by CLI and plugin run.
 * Honors --non-interactive, CORVIDINHO_NON_INTERACTIVE, FLEDGE_NON_INTERACTIVE.
 */

export function isNonInteractive(argvFlags: {
  nonInteractiveFlag?: boolean;
}): boolean {
  if (argvFlags.nonInteractiveFlag) return true;
  const a = process.env.CORVIDINHO_NON_INTERACTIVE;
  const b = process.env.FLEDGE_NON_INTERACTIVE;
  return truthy(a) || truthy(b);
}

function truthy(v: string | undefined): boolean {
  if (v == null || v === "") return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

/** Comma/space-separated allowlist from CORVIDINHO_ALLOWLIST. */
export function allowlistFromEnv(): Set<string> {
  const raw = process.env.CORVIDINHO_ALLOWLIST ?? "";
  if (!raw.trim()) return new Set();
  return new Set(
    raw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}
