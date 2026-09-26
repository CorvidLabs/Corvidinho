/**
 * Bridge config: token + allowlists.
 * Required non-empty channel list (DISCORD_CHANNEL_IDS ∪ file/env allow).
 * Secrets never logged.
 */

import { resolve } from "node:path";
import {
  loadAllowlist,
  type LoadOptions,
} from "../allowlist/load.ts";
import type { AllowlistConfig } from "../allowlist/types.ts";
import { loadOwnerConfig } from "../identity/owner.ts";
import {
  DEFAULT_RATE_LIMIT_MAX_MESSAGES,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
} from "./permissions.ts";
import type { BridgeConfig } from "./types.ts";

export type ConfigError = {
  ok: false;
  code: "missing_token" | "empty_channels" | "allowlist";
  message: string;
};

export type ConfigOk = { ok: true; config: BridgeConfig };

export type ConfigResult = ConfigOk | ConfigError;

function parseList(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveToken(env: NodeJS.ProcessEnv): string | null {
  const t =
    env.DISCORD_BOT_TOKEN?.trim() ||
    env.DISCORD_TOKEN?.trim() ||
    "";
  return t.length > 0 ? t : null;
}

/** Agent binary spawned for runs: CORVIDINHO_BIN or <projectRoot>/src/cli.ts (bridge + daemon). */
export function resolveCorvidinhoBin(env: NodeJS.ProcessEnv, projectRoot: string): string {
  if (env.CORVIDINHO_BIN?.trim()) return env.CORVIDINHO_BIN.trim();
  const local = resolve(projectRoot, "src/cli.ts");
  return local;
}

/**
 * Merge Merlin-style DISCORD_CHANNEL_IDS into allowlist channels (union).
 */
export function mergeChannelIds(
  allowlist: AllowlistConfig,
  env: NodeJS.ProcessEnv,
): string[] {
  const fromEnv = parseList(env.DISCORD_CHANNEL_IDS).map((s) => s.toLowerCase());
  const merged = [...new Set([...allowlist.discord.channels, ...fromEnv])];
  return merged;
}


function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw || !raw.trim()) return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Parse optional JSON object of level→max, e.g. {"1":5,"2":20}. */
function parseRateLimitByLevel(
  raw: string | undefined,
): Record<number, number> | undefined {
  if (!raw || !raw.trim()) return undefined;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<number, number> = {};
    for (const [k, v] of Object.entries(obj)) {
      const level = Number.parseInt(k, 10);
      const max = typeof v === "number" ? v : Number.parseInt(String(v), 10);
      if (Number.isFinite(level) && Number.isFinite(max) && max > 0) {
        out[level] = max;
      }
    }
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

export type LoadBridgeOptions = LoadOptions & {
  projectRoot?: string;
  /** Skip token requirement (unit tests building partial config). */
  requireToken?: boolean;
};

/**
 * Load bridge config. Fails when token missing or channel allowlist empty.
 */
export async function loadBridgeConfig(
  opts: LoadBridgeOptions = {},
): Promise<ConfigResult> {
  const env = opts.env ?? process.env;
  const projectRoot = opts.projectRoot ?? process.cwd();
  const requireToken = opts.requireToken !== false;

  const allowlist = await loadAllowlist({
    env,
    home: opts.home,
    filePath: opts.filePath,
    preloaded: opts.preloaded,
  });

  const channelIds = mergeChannelIds(allowlist, env);
  if (channelIds.length === 0) {
    return {
      ok: false,
      code: "empty_channels",
      message:
        "Discord channel allowlist empty — set DISCORD_CHANNEL_IDS or CORVIDINHO_DISCORD_ALLOW_CHANNELS / allowlist file [discord].channels (empty = deny-all; refuse start)",
    };
  }

  // Apply merged channels back onto allowlist copy for gate checks.
  const cfgAllow: AllowlistConfig = {
    ...allowlist,
    discord: {
      ...allowlist.discord,
      channels: channelIds,
    },
  };

  const token = resolveToken(env);
  if (requireToken && !token) {
    return {
      ok: false,
      code: "missing_token",
      message:
        "missing DISCORD_TOKEN or DISCORD_BOT_TOKEN — set the bot token in the VM env/secret store (never commit). Run `corvidinho doctor` for the go-live checklist.",
    };
  }

  const guildId = env.DISCORD_GUILD_ID?.trim() || undefined;

  const rateLimitWindowMs = parsePositiveInt(
    env.DISCORD_RATE_LIMIT_WINDOW_MS,
    DEFAULT_RATE_LIMIT_WINDOW_MS,
  );
  const rateLimitMaxMessages = parsePositiveInt(
    env.DISCORD_RATE_LIMIT_MAX,
    DEFAULT_RATE_LIMIT_MAX_MESSAGES,
  );
  const rateLimitByLevel = parseRateLimitByLevel(env.DISCORD_RATE_LIMIT_BY_LEVEL);
  const mutedUserIds = parseList(env.DISCORD_MUTED_USER_IDS);
  const adminUserIds = parseList(env.CORVIDINHO_DISCORD_ADMIN_USERS).map((s) =>
    s.toLowerCase(),
  );
  const adminRoleIds = parseList(env.CORVIDINHO_DISCORD_ADMIN_ROLES).map((s) =>
    s.toLowerCase(),
  );
  // IDENTITY-1 — owner from the allowlist file actually loaded + env overlay.
  const { owner } = await loadOwnerConfig({
    env,
    filePath: allowlist.sourcePath,
  });
  const requireRequesterCheck =
    env.CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK === "1" ||
    env.CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK?.toLowerCase() === "true";

  return {
    ok: true,
    config: {
      token: token ?? "",
      channelIds,
      allowlist: cfgAllow,
      corvidinhoBin: resolveCorvidinhoBin(env, projectRoot),
      projectRoot,
      guildId,
      rateLimitWindowMs,
      rateLimitMaxMessages,
      rateLimitByLevel,
      mutedUserIds,
      adminUserIds,
      adminRoleIds,
      owner,
      requireRequesterCheck,
      dryRun: env.CORVIDINHO_DISCORD_DRY_RUN === "1",
    },
  };
}

/** Human-facing go-live hint (no secrets). */
export function goLiveChecklist(): string {
  return `Discord HEAR go-live checklist (Leif / CoS):
  1. Set DISCORD_TOKEN or DISCORD_BOT_TOKEN in the VM env/secret store (never commit).
  2. Non-empty channel allowlist: DISCORD_CHANNEL_IDS and/or
     CORVIDINHO_DISCORD_ALLOW_CHANNELS / ~/.config/corvidinho/allowlist.toml [discord].channels
  3. Optional user/role allowlists (empty = deny-all when those gates apply):
     CORVIDINHO_DISCORD_ALLOW_USERS / _ROLES (or file [discord].users / .roles)
  4. Optional rate/mute (DISCORD-6): DISCORD_RATE_LIMIT_WINDOW_MS (default 60000),
     DISCORD_RATE_LIMIT_MAX (default 10), DISCORD_MUTED_USER_IDS (comma snowflakes)
  5. Owner = the only ADMIN (IDENTITY-1/2/3): CORVIDINHO_OWNER_DISCORD_ID
     (+ _GITHUB_LOGIN, _DISPLAY) or allowlist file [owner] discord_id / github_login / display.
     No owner = nobody ADMIN (default-deny). CORVIDINHO_DISCORD_ADMIN_USERS / _ROLES
     no longer grant ADMIN (ignored; the bridge warns if set).
  6. Optional DISCORD-8 strict: CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK=1
  7. Optional but preferred for slash dogfood: DISCORD_GUILD_ID=<guild snowflake>
     (guild PUT of the current slash set + clear globals; avoids duplicate /agents)
  8. Then: corvidinho discord bridge
     Or re-register only: corvidinho discord register-commands [--guild-id ID]
Empty channel lists refuse start (not Merlin BASIC). Secrets stay out of the repo.`;
}
