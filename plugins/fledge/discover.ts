/**
 * Discover the Fledge plugins registered for a project (FLEDGE-4 / PLUGIN-3).
 *
 * Asks the local fledge CLI — `fledge plugins list --json` (required) and
 * `fledge plugins audit --json` (capabilities, best effort) — with cwd set to
 * the project root. Output is untrusted data: names are validated, free text
 * is cleaned and length-capped, and nothing is ever run through a shell.
 * Every failure degrades to "no Fledge plugins" plus a reason.
 */

import { resolve } from "node:path";
import { fledgeChildEnv, spawnCapped } from "./spawn.ts";

export const DISCOVERY_TIMEOUT_MS = 10_000;
const DISCOVERY_MAX_BYTES = 512 * 1024;

/**
 * Fledge command names we will expose as `fledge-<command>`. The cap keeps the
 * Corvidinho name within the 64-char tool-name limit of chat/completions.
 */
const COMMAND_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,56}$/;

export type FledgeCapabilities = {
  exec: boolean;
  store: boolean;
  metadata: boolean;
  filesystem: string;
  network: boolean;
};

export type FledgePluginInfo = {
  name: string;
  version: string;
  trustTier: string;
  runtime: string;
  commands: string[];
  /** null when `plugins audit` was unavailable (treated as worst case). */
  capabilities: FledgeCapabilities | null;
};

export type FledgeDiscovery = {
  ok: boolean;
  fledgeBin: string | null;
  plugins: FledgePluginInfo[];
  warnings: string[];
  error?: string;
};

export type DiscoverOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Absolute fledge path; default: `fledge` on the env's PATH. */
  fledgeBin?: string;
  timeoutMs?: number;
};

/** Strip control characters, collapse whitespace, cap length. */
export function cleanText(value: unknown, max: number): string {
  if (value == null) return "";
  const s = String(value)
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function isValidCommandName(name: unknown): name is string {
  return typeof name === "string" && COMMAND_NAME_RE.test(name);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function tail(text: string, max = 300): string {
  const t = cleanText(text, 100_000);
  return t.length > max ? `…${t.slice(t.length - max)}` : t;
}

/** Parse the `plugins list --json` envelope into validated plugin rows. */
export function parsePluginList(
  raw: unknown,
  warnings: string[],
): FledgePluginInfo[] | null {
  if (!raw || typeof raw !== "object") return null;
  const env = raw as { schema_version?: unknown; plugins?: unknown };
  if (!Array.isArray(env.plugins)) return null;
  if (env.schema_version !== 1) {
    warnings.push(
      `fledge plugins list schema_version ${cleanText(env.schema_version, 16) || "?"} (expected 1); parsed best effort`,
    );
  }
  const out: FledgePluginInfo[] = [];
  for (const row of env.plugins) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const name = cleanText(r.name, 64);
    if (!name) {
      warnings.push("skipped a Fledge plugin row with no name");
      continue;
    }
    const commands: string[] = [];
    const rawCommands = Array.isArray(r.commands) ? r.commands : [];
    for (const c of rawCommands) {
      if (isValidCommandName(c)) {
        commands.push(c);
      } else {
        warnings.push(
          `skipped Fledge command "${cleanText(c, 40)}" of plugin ${name}: name must match ${COMMAND_NAME_RE.source}`,
        );
      }
    }
    out.push({
      name,
      version: cleanText(r.version, 32) || "?",
      trustTier: cleanText(r.trust_tier, 24) || "unknown",
      runtime: cleanText(r.runtime, 16) || "native",
      commands,
      capabilities: null,
    });
  }
  return out;
}

/** Parse `plugins audit --json` into name → capabilities. */
export function parseAudit(raw: unknown): Map<string, FledgeCapabilities> {
  const map = new Map<string, FledgeCapabilities>();
  if (!raw || typeof raw !== "object") return map;
  const rows = (raw as { audit?: unknown }).audit;
  if (!Array.isArray(rows)) return map;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const name = cleanText(r.name, 64);
    const caps = r.capabilities;
    if (!name || !caps || typeof caps !== "object") continue;
    const c = caps as Record<string, unknown>;
    map.set(name, {
      exec: c.exec === true,
      store: c.store === true,
      metadata: c.metadata === true,
      filesystem: cleanText(c.filesystem, 24) || "none",
      network: c.network === true,
    });
  }
  return map;
}

export async function discoverFledgePlugins(
  opts: DiscoverOptions = {},
): Promise<FledgeDiscovery> {
  const env = opts.env ?? process.env;
  const cwd = resolve(opts.cwd ?? process.cwd());
  const timeoutMs = opts.timeoutMs ?? DISCOVERY_TIMEOUT_MS;
  const warnings: string[] = [];

  const fledgeBin =
    opts.fledgeBin ?? Bun.which("fledge", { PATH: env.PATH ?? "" }) ?? null;
  if (!fledgeBin) {
    return {
      ok: false,
      fledgeBin: null,
      plugins: [],
      warnings,
      error: "fledge not on PATH",
    };
  }

  const childEnv = fledgeChildEnv(env, cwd);
  const spawnOpts = { cwd, env: childEnv, timeoutMs, maxBytes: DISCOVERY_MAX_BYTES };
  const [listRes, auditRes] = await Promise.all([
    spawnCapped([fledgeBin, "--non-interactive", "plugins", "list", "--json"], spawnOpts),
    spawnCapped([fledgeBin, "--non-interactive", "plugins", "audit", "--json"], spawnOpts),
  ]);

  const fail = (error: string): FledgeDiscovery => ({
    ok: false,
    fledgeBin,
    plugins: [],
    warnings,
    error,
  });

  if (listRes.spawnError) {
    return fail(`fledge could not start: ${cleanText(listRes.spawnError, 200)}`);
  }
  if (listRes.timedOut) {
    return fail(`fledge plugins list timed out after ${timeoutMs}ms`);
  }
  if (listRes.code !== 0) {
    const why = tail(listRes.stderr || listRes.stdout);
    return fail(`fledge plugins list exited ${listRes.code}${why ? `: ${why}` : ""}`);
  }
  if (listRes.truncated) {
    return fail("fledge plugins list output too large");
  }
  const plugins = parsePluginList(parseJson(listRes.stdout), warnings);
  if (!plugins) {
    return fail("fledge plugins list --json returned unexpected output");
  }

  let caps = new Map<string, FledgeCapabilities>();
  if (auditRes.code === 0 && !auditRes.timedOut && !auditRes.spawnError) {
    caps = parseAudit(parseJson(auditRes.stdout));
  } else {
    warnings.push(
      "fledge plugins audit unavailable; capabilities unknown, treating every plugin as unsandboxed",
    );
  }
  for (const p of plugins) {
    p.capabilities = caps.get(p.name) ?? null;
  }

  return { ok: true, fledgeBin, plugins, warnings };
}
