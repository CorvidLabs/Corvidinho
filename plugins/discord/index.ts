/**
 * Discord outbound plugins — discord-post-message is dangerous (externally visible write).
 */

import { checkChannel } from "../../src/allowlist/discord.ts";
import { loadAllowlist } from "../../src/allowlist/load.ts";
import { register } from "../../src/plugins/registry.ts";
import type { PluginCommand } from "../../src/plugins/types.ts";

let loaded = false;

function parseFlag(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1] && !args[i + 1]!.startsWith("-")) return args[i + 1];
  return undefined;
}

/**
 * Dangerous: posts a message to a Discord channel via REST.
 * Requires token + allowlisted channel. Thin stub — no confused-deputy full path yet (#10+).
 */
const discordPostMessage: PluginCommand = {
  name: "discord-post-message",
  description:
    "Post a message to an allowlisted Discord channel (dangerous; DISCORD-5)",
  dangerous: true,
  minTier: 1,
  async handler(ctx) {
    const channelId = parseFlag(ctx.args, "--channel") ?? parseFlag(ctx.args, "-c");
    const content =
      parseFlag(ctx.args, "--content") ??
      parseFlag(ctx.args, "-m") ??
      ctx.args.filter((a) => !a.startsWith("-")).join(" ").trim();

    if (!channelId) {
      return {
        ok: false,
        error: "usage: discord-post-message --channel <id> --content <text>",
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

    // Dry / test: skip network when CORVIDINHO_DISCORD_DRY_RUN=1
    if (process.env.CORVIDINHO_DISCORD_DRY_RUN === "1") {
      return {
        ok: true,
        data: { dryRun: true, channelId, content: content.slice(0, 100) },
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
  if (loaded) return;
  register(discordPostMessage);
  loaded = true;
}
