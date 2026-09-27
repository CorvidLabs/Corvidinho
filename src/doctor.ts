/**
 * `corvidinho doctor` checks that read what the long-running surfaces read
 * (CLI-4: say what is missing instead of failing later mid-task):
 * - Discord channel / GitHub repo allowlists through the same loader as the
 *   bridge and WATCH (allowlist file + env overlays, deny wins; ALLOW-1..4),
 *   naming where the entries came from (file / env), never the entries.
 * - The LLM key `task run` uses (none ⇒ demo stub).
 * - The shared data dir (exists / can be created, writable).
 * Secret and list values are never printed (SAFE-6).
 */

import { existsSync, lstatSync, mkdtempSync, rmdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadLlmEnv } from "./agent/execute.ts";
import { checkChannel } from "./allowlist/discord.ts";
import { isRepoAllowed } from "./allowlist/github.ts";
import {
  configFromEnvOnly,
  loadAllowlist,
  loadAllowlistFile,
  resolveAllowlistPath,
} from "./allowlist/load.ts";
import type { AllowlistConfig } from "./allowlist/types.ts";
import { mergeChannelIds } from "./discord/config.ts";
import { resolveDataDir } from "./store/paths.ts";
import { expandWatchRepos } from "./watch/config.ts";

export type DoctorCheck = {
  name: string;
  ok: boolean;
  detail: string;
  /** Printed label override (informational checks never fail doctor). */
  mark?: string;
};

/** Where usable allowlist entries came from. */
export type AllowlistSource = "file" | "env";

/**
 * Allowlists as the bridge / WATCH load them (`merged`), plus the file-only
 * and env-only halves so doctor can name the source. `ok: false` when the
 * file exists but cannot be read or parsed (bridge / watch refuse to start).
 */
export type DoctorAllowlist =
  | { ok: true; merged: AllowlistConfig; file: AllowlistConfig | null; env: AllowlistConfig }
  | { ok: false; error: string };

/**
 * Usable (allowlisted and not deny-listed) entry count and its sources;
 * `denied` counts listed entries a deny list refuses (the rest of
 * `listed - usable` are entries the gate cannot use, e.g. not OWNER/REPO).
 */
export type AllowlistUsage = {
  listed: number;
  usable: number;
  denied: number;
  sources: AllowlistSource[];
};

/**
 * Resolves and reads the allowlist file once, exactly as `loadAllowlist` does
 * for the bridge / WATCH, then merges the env overlays through `loadAllowlist`
 * itself (`preloaded`), so the merged set and the file half come from the
 * same read.
 */
export async function loadDoctorAllowlist(
  env: NodeJS.ProcessEnv = process.env,
  home?: string,
): Promise<DoctorAllowlist> {
  const path = resolveAllowlistPath(env, home);
  let file: AllowlistConfig | null = null;
  if (path && existsSync(path)) {
    const loaded = await loadAllowlistFile(path);
    if (!loaded.ok) return { ok: false, error: loaded.error };
    file = { sourcePath: path, github: loaded.github, discord: loaded.discord };
  }
  const merged = await loadAllowlist({
    env,
    home,
    filePath: null,
    preloaded: file ? { sourcePath: path!, github: file.github, discord: file.discord } : null,
  });
  return { ok: true, merged, file, env: configFromEnvOnly(env) };
}

function sourcesOf(
  usable: string[],
  file: Iterable<string>,
  fromEnv: Iterable<string>,
): AllowlistSource[] {
  const f = new Set(file);
  const e = new Set(fromEnv);
  const out: AllowlistSource[] = [];
  if (usable.some((x) => f.has(x))) out.push("file");
  if (usable.some((x) => e.has(x))) out.push("env");
  return out;
}

/** Bridge channel set (`mergeChannelIds`), minus deny-listed channels. */
export function discordChannelUsage(
  allow: Extract<DoctorAllowlist, { ok: true }>,
  env: NodeJS.ProcessEnv = process.env,
): AllowlistUsage {
  const listed = mergeChannelIds(allow.merged, env);
  const gate: AllowlistConfig = {
    ...allow.merged,
    discord: { ...allow.merged.discord, channels: listed },
  };
  const usable = listed.filter((id) => checkChannel(id, gate).ok);
  return {
    listed: listed.length,
    usable: usable.length,
    // A listed channel fails the channel gate only on a deny list.
    denied: listed.length - usable.length,
    sources: sourcesOf(
      usable,
      allow.file?.discord.channels ?? [],
      mergeChannelIds(allow.env, env),
    ),
  };
}

/** WATCH repo set (`expandWatchRepos`), minus deny-listed repos / orgs. */
export function githubRepoUsage(
  allow: Extract<DoctorAllowlist, { ok: true }>,
): AllowlistUsage {
  const listed = expandWatchRepos(allow.merged);
  const gates = listed.map((r) => ({ r, gate: isRepoAllowed(r, allow.merged.github) }));
  const usable = gates.filter((g) => g.gate.ok).map((g) => g.r);
  const denied = gates.filter((g) => !g.gate.ok && g.gate.error.endsWith(" is denied")).length;
  return {
    listed: listed.length,
    usable: usable.length,
    denied,
    sources: sourcesOf(
      usable,
      allow.file ? expandWatchRepos(allow.file) : [],
      expandWatchRepos(allow.env),
    ),
  };
}

/** Set and not blank — the bridge / WATCH trim tokens and logins the same way. */
function present(env: NodeJS.ProcessEnv, name: string): boolean {
  return (env[name]?.trim() ?? "").length > 0;
}

function fromText(sources: AllowlistSource[]): string {
  return sources.join(" + ");
}

const ALLOWLIST_BROKEN = "the allowlist file does not load (see allowlist-file)";

export function discordDoctorCheck(
  allow: DoctorAllowlist,
  env: NodeJS.ProcessEnv = process.env,
): DoctorCheck {
  const name = "discord";
  if (!present(env, "DISCORD_TOKEN") && !present(env, "DISCORD_BOT_TOKEN")) {
    return {
      name,
      ok: false,
      detail:
        "missing DISCORD_TOKEN or DISCORD_BOT_TOKEN (go-live: token + non-empty Discord allowlists)",
    };
  }
  if (!allow.ok) {
    return {
      name,
      ok: false,
      detail: `token present but ${ALLOWLIST_BROKEN} — the bridge refuses to start`,
    };
  }
  const use = discordChannelUsage(allow, env);
  if (use.usable > 0) {
    return {
      name,
      ok: true,
      detail: `token + ${use.usable} allowlisted channel(s) from ${fromText(use.sources)} (values not shown)`,
    };
  }
  return {
    name,
    ok: false,
    detail:
      use.listed > 0
        ? "token present but every allowlisted channel is also deny-listed (deny wins) — the bridge hears no channel"
        : "token present but channel allowlist empty — set DISCORD_CHANNEL_IDS or CORVIDINHO_DISCORD_ALLOW_CHANNELS or allowlist file [discord].channels",
  };
}

export function githubWatchDoctorCheck(
  allow: DoctorAllowlist,
  env: NodeJS.ProcessEnv = process.env,
): DoctorCheck {
  const name = "github-watch";
  const fail = (detail: string): DoctorCheck => ({ name, ok: false, detail });
  if (!present(env, "GITHUB_TOKEN") && !present(env, "GH_TOKEN")) {
    return fail("WATCH needs GITHUB_TOKEN/GH_TOKEN (poll-first; see docs/WATCH.md)");
  }
  if (!present(env, "CORVIDINHO_WATCH_USERNAME") && !present(env, "GITHUB_WATCH_USERNAME")) {
    return fail("set CORVIDINHO_WATCH_USERNAME (login to listen for)");
  }
  if (!allow.ok) return fail(`${ALLOWLIST_BROKEN} — watch refuses to start`);
  const use = githubRepoUsage(allow);
  if (use.usable > 0) {
    return {
      name,
      ok: true,
      detail: `token + username + ${use.usable} allowlisted repo/org entr${use.usable === 1 ? "y" : "ies"} from ${fromText(use.sources)} (values not shown)`,
    };
  }
  return fail(
    use.listed === 0
      ? "set CORVIDINHO_GITHUB_ALLOW_REPOS / ORGS or allowlist file [github] repos / orgs (empty = deny-all)"
      : use.denied === use.listed
        ? "every allowlisted repo/org is also deny-listed (deny wins) — WATCH acts on no repo"
        : "no allowlisted repo/org entry is usable (deny-listed, or a repo that is not OWNER/REPO / an org that is not a bare name) — WATCH acts on no repo",
  );
}

/** `task run` without a key uses the demo stub: warn, never fail doctor. */
export function llmDoctorCheck(env: NodeJS.ProcessEnv = process.env): DoctorCheck {
  const llm = loadLlmEnv(env);
  if (llm.apiKey) {
    return {
      name: "llm",
      ok: true,
      detail: `CORVIDINHO_LLM_API_KEY/OPENAI_API_KEY present (value not shown); model ${llm.model}`,
    };
  }
  return {
    name: "llm",
    ok: true,
    mark: "warn",
    detail:
      "no CORVIDINHO_LLM_API_KEY or OPENAI_API_KEY — task run uses the demo stub (no model is called)",
  };
}

function errCode(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "error";
}

/** True for stat errors that mean "nothing there (yet)". */
function isMissing(e: unknown): boolean {
  const code = errCode(e);
  return code === "ENOENT" || code === "ENOTDIR";
}

/**
 * A symlink whose target does not exist: `stat` says ENOENT, yet `mkdir -p`
 * fails on it (EEXIST), so it is not "created on first use".
 */
function isBrokenLink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * The data dir holds `corvidinho.db` for the bridge, WATCH, daemon and memory
 * tools. Probes by creating and removing a temp dir (in the data dir, or in
 * its nearest existing parent when it does not exist yet); leaves nothing.
 */
export function dataDirDoctorCheck(
  env: NodeJS.ProcessEnv = process.env,
  home?: string,
): DoctorCheck {
  const dir = resolve(resolveDataDir({ env, home }));
  const fail = (why: string): DoctorCheck => ({
    name: "data-dir",
    ok: false,
    mark: "fail",
    detail: `${dir} ${why} — the bridge, watch, daemon and memory tools cannot open corvidinho.db; set CORVIDINHO_DATA_DIR to a writable directory`,
  });

  let exists = false;
  try {
    if (!statSync(dir).isDirectory()) return fail("is not a directory");
    exists = true;
  } catch (e) {
    if (!isMissing(e)) return fail(`cannot be read (${errCode(e)})`);
    if (isBrokenLink(dir)) return fail("is a symlink to a path that does not exist");
  }

  let probeIn = dir;
  if (!exists) {
    // mkdir -p starts at the nearest existing parent.
    for (let cur = dir; ; ) {
      const parent = dirname(cur);
      if (parent === cur) return fail("cannot be created (no existing parent)");
      cur = parent;
      try {
        if (!statSync(cur).isDirectory()) {
          return fail(`cannot be created (${cur} is not a directory)`);
        }
        probeIn = cur;
        break;
      } catch (e) {
        if (!isMissing(e)) return fail(`cannot be created (${errCode(e)})`);
        if (isBrokenLink(cur)) {
          return fail(`cannot be created (${cur} is a symlink to a path that does not exist)`);
        }
      }
    }
  }

  try {
    rmdirSync(mkdtempSync(join(probeIn, ".corvidinho-doctor-")));
  } catch (e) {
    return fail(exists ? `is not writable (${errCode(e)})` : `cannot be created (${errCode(e)})`);
  }
  return exists
    ? { name: "data-dir", ok: true, detail: `${dir} exists and is writable` }
    : {
        name: "data-dir",
        ok: true,
        mark: "info",
        detail: `${dir} does not exist yet — created on first use (${probeIn} is writable)`,
      };
}
