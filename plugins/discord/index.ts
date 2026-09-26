/**
 * Discord outbound plugins — discord-post-message is dangerous (externally visible write).
 * DISCORD-8: confused-deputy requester check (Merlin-primary).
 */

import { checkChannel } from "../../src/allowlist/discord.ts";
import { loadAllowlist } from "../../src/allowlist/load.ts";
import { get, register } from "../../src/plugins/registry.ts";
import type { PluginCommand } from "../../src/plugins/types.ts";
import {
  requesterCheckFix,
  setRequesterPermCheckerForTests,
  verifyRequesterCanSend,
  type RequesterCheckResult,
} from "../../src/discord/requester-perms.ts";

export { setRequesterPermCheckerForTests };

function parseFlag(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1] && !args[i + 1]!.startsWith("-")) return args[i + 1];
  return undefined;
}

function requireRequesterCheck(env: NodeJS.ProcessEnv): boolean {
  const raw = env.CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK?.trim();
  return raw === "1" || raw?.toLowerCase() === "true";
}

/**
 * Dangerous: posts a message to a Discord channel via REST.
 * Requires token + allowlisted channel. DISCORD-8 requester check when
 * --requesting-user-id is provided (or strict mode requires it).
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

    const allow = await loadAllowlist({ env: process.env });
    const gate = checkChannel(channelId, allow);
    if (!gate.ok) {
      return {
        ok: false,
        error: gate.error,
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
    if (requestingUserId) {
      const check = await verifyRequesterCanSend(channelId, requestingUserId, {
        token,
        dryRun,
      });
      if (!check.ok) {
        const fix = requesterCheckFix(check, channelId, requestingUserId);
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
          requestingUserId: requestingUserId ?? null,
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
          body: JSON.stringify({ content: content.slice(0, 1900) }),
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
  if (get("discord-post-message")) return;
  register(discordPostMessage);
}
