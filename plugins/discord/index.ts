/**
 * Discord outbound plugins — discord-post-message is dangerous (externally visible write).
 * DISCORD-8: confused-deputy requester check (Merlin-primary). In a run the
 * bridge started, the check is always for the acting Discord user the bridge
 * set (CORVIDINHO_ACTING_DISCORD_USER_ID), never a model-supplied id. The
 * content is model-written, so the post parses no mentions (REQ-discord-205).
 */

import { checkChannel } from "../../src/allowlist/discord.ts";
import { tryLoadAllowlist } from "../../src/allowlist/load.ts";
import { formatErrorLine } from "../../src/store/scrub.ts";
import { get, register } from "../../src/plugins/registry.ts";
import type { PluginCommand } from "../../src/plugins/types.ts";
import { defangMassMentions } from "../../src/discord/allowed-mentions.ts";
import {
  requesterCheckFix,
  setRequesterPermCheckerForTests,
  verifyRequesterCanSend,
  type RequesterCheckResult,
} from "../../src/discord/requester-perms.ts";

import {
  discordUserLookup,
  DISCORD_USER_LOOKUP_NAME,
} from "./user-lookup.ts";

export {
  extractUserSnowflake,
  resolveLookupGuildId,
  USER_SNOWFLAKE_RE,
  DISCORD_USER_LOOKUP_NAME,
  buildDiscordUserLookupCommand,
} from "./user-lookup.ts";

export { setRequesterPermCheckerForTests };

function parseFlag(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1] && !args[i + 1]!.startsWith("-")) return args[i + 1];
  return undefined;
}

/** Every value given for `name` (repeated flags and `name=value` forms). */
function flagValues(args: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith(`${name}=`)) out.push(a.slice(name.length + 1));
    else if (a === name && args[i + 1] && !args[i + 1]!.startsWith("-")) out.push(args[i + 1]!);
  }
  return out;
}

function requireRequesterCheck(env: NodeJS.ProcessEnv): boolean {
  const raw = env.CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK?.trim();
  return raw === "1" || raw?.toLowerCase() === "true";
}

/**
 * The Discord user a bridge-started run acts for (set per spawn by the
 * bridge, REQ-discord-021); empty outside the bridge (operator `plugins run`,
 * local `task run`, WATCH clears it).
 */
function actingDiscordUser(env: NodeJS.ProcessEnv): string {
  return env.CORVIDINHO_ACTING_DISCORD_USER_ID?.trim() ?? "";
}

/**
 * Dangerous: posts a message to a Discord channel via REST.
 * Requires token + allowlisted channel. DISCORD-8 requester check: in a
 * bridge-started run always for the acting user (a --requesting-user-id
 * naming anyone else is refused, and a check that cannot run refuses);
 * otherwise when --requesting-user-id is provided (or strict mode requires it).
 */
const discordPostMessage: PluginCommand = {
  name: "discord-post-message",
  description:
    "Post a message to an allowlisted Discord channel (dangerous; DISCORD-5/8)",
  dangerous: true,
  minTier: 1,
  async handler(ctx) {
    const channelId =
      parseFlag(ctx.args, "--channel") ?? parseFlag(ctx.args, "-c");
    const content =
      parseFlag(ctx.args, "--content") ??
      parseFlag(ctx.args, "-m") ??
      ctx.args.filter((a) => !a.startsWith("-")).join(" ").trim();
    const requestingUserId =
      parseFlag(ctx.args, "--requesting-user-id") ??
      parseFlag(ctx.args, "--requester");

    if (!channelId) {
      return {
        ok: false,
        error: "usage: discord-post-message --channel <id> --content <text> [--requesting-user-id <id>]",
        exitCode: 1,
      };
    }
    if (!content) {
      return {
        ok: false,
        error: "missing --content",
        exitCode: 1,
      };
    }

    // A malformed / unreadable allowlist file refuses (fail closed), never env-only.
    const loaded = await tryLoadAllowlist({ env: process.env });
    if (!loaded.ok) {
      return { ok: false, error: `not authorized: ${loaded.error}`, exitCode: 3 };
    }
    const gate = checkChannel(channelId, loaded.config);
    if (!gate.ok) {
      return {
        ok: false,
        error: gate.error,
        exitCode: 3,
      };
    }

    // DISCORD-8: in a bridge-started run the check is about the acting user
    // only. A requester id naming someone else is refused, not replaced —
    // any of them, so a repeated flag or the other alias cannot slip one by.
    const actingUserId = actingDiscordUser(process.env);
    const namedRequesters = [
      ...flagValues(ctx.args, "--requesting-user-id"),
      ...flagValues(ctx.args, "--requester"),
    ]
      .map((id) => id.trim())
      .filter((id) => id !== "");
    if (actingUserId && namedRequesters.some((id) => id !== actingUserId)) {
      return {
        ok: false,
        error:
          "refused: --requesting-user-id / --requester names a different Discord user than the one this run acts for. The requester check is always for the acting user the bridge set (DISCORD-8); leave the flag out. Nothing was posted.",
        exitCode: 3,
      };
    }

    const token =
      process.env.DISCORD_BOT_TOKEN?.trim() ||
      process.env.DISCORD_TOKEN?.trim() ||
      "";
    if (!token) {
      return {
        ok: false,
        error:
          "missing DISCORD_TOKEN or DISCORD_BOT_TOKEN (set in env; never commit)",
        exitCode: 1,
      };
    }

    const dryRun = process.env.CORVIDINHO_DISCORD_DRY_RUN === "1";
    const strict = requireRequesterCheck(process.env);

    // DISCORD-8 — confused-deputy: check requester can send, not only the bot.
    const checkUserId = actingUserId || requestingUserId;
    if (checkUserId) {
      let check: RequesterCheckResult;
      try {
        check = await verifyRequesterCanSend(channelId, checkUserId, {
          token,
          dryRun,
        });
      } catch (e) {
        if (!actingUserId) throw e;
        // Fail closed: a bridge run posts only after the acting user's check.
        return {
          ok: false,
          error: `refused: could not check that the acting Discord user can post in channel ${channelId} (DISCORD-8), so nothing was posted: ${formatErrorLine(e, { max: 200 })}. The check logs in with the Guild Members intent to look the user up: if Server Members Intent is off for the bot in the Discord Developer Portal, turn it on.`,
          exitCode: 3,
        };
      }
      if (!check.ok) {
        const fix = requesterCheckFix(check, channelId, checkUserId);
        return {
          ok: false,
          error: `${check.reason} — ${fix}`,
          exitCode: check.status === 404 ? 4 : 3,
          data: { status: check.status, reason: check.reason },
        };
      }
    } else if (strict) {
      return {
        ok: false,
        error:
          "requesting_user_id is required (strict mode). Pass --requesting-user-id <discord-user-id> or unset CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK.",
        exitCode: 3,
      };
    }

    if (dryRun) {
      return {
        ok: true,
        data: {
          dryRun: true,
          channelId,
          content: content.slice(0, 100),
          requestingUserId: actingUserId || (requestingUserId ?? null),
        },
        message: `dry-run post to ${channelId}`,
        exitCode: 0,
      };
    }

    try {
      const res = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          // REQ-discord-205: no @everyone/@here, role or user ping from text.
          body: JSON.stringify({
            content: defangMassMentions(content).slice(0, 1900),
            allowed_mentions: { parse: [] },
          }),
        },
      );
      if (!res.ok) {
        const body = await res.text();
        return {
          ok: false,
          error: `discord API ${res.status}: ${body.slice(0, 200)}`,
          exitCode: 1,
        };
      }
      const json = (await res.json()) as { id?: string };
      return {
        ok: true,
        data: { messageId: json.id, channelId },
        message: `posted message ${json.id ?? "?"} to ${channelId}`,
        exitCode: 0,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg, exitCode: 1 };
    }
  },
};

export function loadDiscordPlugins(): void {
  // Re-register after clearRegistry() in other tests (module flag would stick).
  if (!get("discord-post-message")) register(discordPostMessage);
  if (!get(DISCORD_USER_LOOKUP_NAME)) register(discordUserLookup);
}
