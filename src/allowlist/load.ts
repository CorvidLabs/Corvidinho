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

/** Minimal TOML subset: [section] + key = ["a","b"] or key = "a,b" or key = [] */
export function parseSimpleToml(text: string): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  let section = "";
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) {
      section = sec[1]!.trim().toLowerCase();
      if (!out[section]) out[section] = {};
      continue;
    }
    if (!section) continue;
    const kv = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1]!.toLowerCase();
    const val = kv[2]!.trim();
    if (val.startsWith("[")) {
      const inner = val.replace(/^\[/, "").replace(/\]$/, "");
      const parts = inner
        .split(",")
        .map((p) => p.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      out[section]![key] = parts;
    } else {
      out[section]![key] = parseList(val.replace(/^["']|["']$/g, ""));
    }
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

export async function loadAllowlistFile(
  path: string,
): Promise<
  | { ok: true; github: GithubAllowlists; discord: DiscordAllowlists }
  | { ok: false; error: string }
> {
  try {
    const text = await Bun.file(path).text();
    if (path.endsWith(".json")) {
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
    return { ok: false, error: `allowlist file read failed (${path}): ${msg}` };
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
      if (loaded.ok) {
        cfg = {
          sourcePath: path,
          github: loaded.github,
          discord: loaded.discord,
        };
      }
      // Unreadable/missing parse → empty (deny-all), never allow-all.
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
