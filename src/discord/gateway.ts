/**
 * Thin Discord gateway (discord.js). Live connect only when token present.
 * Tests inject InboundMessage / SlashInteraction — no ProcessManager.
 */

import { buildSlashCommandBodies } from "./slash-commands.ts";
import { registerSlashCommandsLive } from "./register-commands.ts";
import type {
  SlashInteraction,
  SlashOptionValue,
  SlashReplyPayload,
} from "./slash-types.ts";
import type { DiscordEmbedPayload } from "./thinking-status.ts";
import { buildVersionPresenceActivity } from "./presence.ts";
import type { BridgeConfig, InboundMessage } from "./types.ts";
import { VERSION as PACKAGE_VERSION } from "../version.ts";

export type GatewayHandlers = {
  onMessage: (msg: InboundMessage) => void | Promise<void>;
  /** Slash commands (DISCORD-4). */
  onSlash?: (interaction: SlashInteraction) => void | Promise<void>;
  onReady?: (botUserId: string) => void;
  /** Optional outbound helper used by bridge after agent reply. */
  reply?: (opts: {
    channelId: string;
    content: string;
    replyToMessageId?: string;
    /**
     * When set, only these users (plus the replied-to author) may be pinged
     * by this post — used for the AUTONOMY-2 owner ping.
     */
    mentionUserIds?: string[];
  }) => Promise<{ messageId: string } | null>;
  /** Progress embeds (DISCORD-3). */
  sendEmbed?: (opts: {
    channelId: string;
    embed: DiscordEmbedPayload;
    replyToMessageId?: string;
  }) => Promise<{ messageId: string } | null>;
  editEmbed?: (opts: {
    channelId: string;
    messageId: string;
    embed: DiscordEmbedPayload;
  }) => Promise<boolean>;
};

export type DiscordGateway = {
  start(): Promise<void>;
  stop(): Promise<void>;
  botUserId: string | null;
};

function optionValue(raw: unknown): SlashOptionValue {
  if (raw == null) return null;
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
    return raw;
  }
  return String(raw);
}

/**
 * Live gateway via discord.js. Dynamic import so unit tests need not load it
 * when using the null/fake gateway.
 */
export type LiveGatewayOptions = {
  /** Shared package version for Discord presence (DISCORD-12). */
  version?: string;
};

export async function createLiveGateway(
  config: BridgeConfig,
  handlers: GatewayHandlers,
  opts?: LiveGatewayOptions,
): Promise<DiscordGateway> {
  const discord = await import("discord.js");
  const {
    Client,
    GatewayIntentBits,
    Events,
    ChannelType,
    ActivityType,
  } = discord;
  const presenceVersion = opts?.version ?? PACKAGE_VERSION;

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  let botUserId: string | null = null;

  async function registerSlashCommands(): Promise<void> {
    try {
      if (!client.application) {
        console.warn("[discord] slash register skipped: application not ready");
        return;
      }
      const applicationId = client.application.id;
      const result = await registerSlashCommandsLive({
        token: config.token,
        applicationId,
        guildId: config.guildId,
        bodies: buildSlashCommandBodies(),
      });
      if (result.scope === "guild") {
        console.log(
          `[discord] registered ${result.registeredCount} guild slash command(s) on ${result.guildId} (globals cleared)`,
        );
      } else {
        console.log(
          `[discord] registered ${result.registeredCount} global slash command(s)`,
        );
        if (result.warnNoGuildId) {
          console.warn(`[discord] ${result.warnNoGuildId}`);
        }
      }
    } catch (err) {
      console.error("[discord] slash command registration failed:", err);
    }
  }

  function adaptChatInput(interaction: {
    id: string;
    commandName: string;
    channelId: string;
    guildId: string | null;
    user: { id: string };
    member?: { roles?: { cache?: { keys: () => IterableIterator<string> } } | string[] } | null;
    options: {
      getSubcommand: (required?: boolean) => string | null;
      data: Array<{ name: string; value?: unknown; type?: number; options?: Array<{ name: string; value?: unknown }> }>;
    };
    reply: (opts: unknown) => Promise<unknown>;
    deferReply: (opts?: unknown) => Promise<unknown>;
    editReply: (opts: unknown) => Promise<unknown>;
    deferred: boolean;
    replied: boolean;
  }): SlashInteraction {
    const options: Record<string, SlashOptionValue> = {};
    let subcommand: string | undefined;
    try {
      const sub = interaction.options.getSubcommand(false);
      if (sub) subcommand = sub;
    } catch {
      /* no subcommand */
    }

    // Flatten top-level and nested (subcommand) options.
    for (const opt of interaction.options.data) {
      if (opt.type === 1 && Array.isArray(opt.options)) {
        // SUB_COMMAND
        subcommand = subcommand ?? opt.name;
        for (const nested of opt.options) {
          options[nested.name] = optionValue(nested.value);
        }
      } else if (opt.value !== undefined) {
        options[opt.name] = optionValue(opt.value);
      }
    }

    const send = async (opts: SlashReplyPayload, mode: "reply" | "edit") => {
      const payload: Record<string, unknown> = {};
      if (opts.content !== undefined) payload.content = opts.content.slice(0, 1900);
      if (opts.embeds?.length) {
        payload.embeds = opts.embeds.map((e) => ({
          description: e.description,
          color: e.color,
          footer: e.footer,
        }));
      }
      if (mode === "reply") {
        if (opts.ephemeral) payload.ephemeral = true;
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(payload);
        } else {
          await interaction.reply(payload);
        }
      } else {
        await interaction.editReply(payload);
      }
    };

    const roleIds: string[] = [];
    const member = interaction.member;
    if (member?.roles) {
      const roles = member.roles;
      if (Array.isArray(roles)) {
        roleIds.push(...roles);
      } else if (roles.cache && typeof roles.cache.keys === "function") {
        roleIds.push(...roles.cache.keys());
      }
    }

    return {
      id: interaction.id,
      commandName: interaction.commandName,
      subcommand,
      channelId: interaction.channelId,
      guildId: interaction.guildId ?? undefined,
      userId: interaction.user.id,
      roleIds,
      options,
      reply: async (opts) => {
        await send(opts, "reply");
      },
      deferReply: async (opts) => {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ ephemeral: opts?.ephemeral ?? false });
        }
      },
      editReply: async (opts) => {
        await send(opts, "edit");
      },
    };
  }

  const gateway: DiscordGateway = {
    get botUserId() {
      return botUserId;
    },
    async start() {
      client.on(Events.ClientReady, (ready) => {
        botUserId = ready.user.id;
        console.log(`[discord] logged in as ${ready.user.tag}`);
        try {
          const activity = buildVersionPresenceActivity(presenceVersion);
          ready.user.setPresence({
            status: "online",
            activities: [
              {
                name: activity.name,
                state: activity.state,
                type: ActivityType.Custom,
              },
            ],
          });
          console.log(`[discord] presence set: ${activity.state}`);
        } catch (err) {
          console.warn("[discord] presence set failed:", err);
        }
        handlers.onReady?.(ready.user.id);
        void registerSlashCommands();
      });

      client.on(Events.MessageCreate, (message) => {
        if (message.author.bot) return;
        const isThread =
          message.channel.type === ChannelType.PublicThread ||
          message.channel.type === ChannelType.PrivateThread;
        const parentId =
          isThread && "parentId" in message.channel
            ? (message.channel.parentId as string | null) ?? message.channelId
            : message.channelId;
        const attachments = [...message.attachments.values()].map((a) => ({
          id: a.id,
          filename: a.name ?? "attachment",
          content_type: a.contentType ?? undefined,
          size: a.size,
          url: a.url,
          proxy_url: a.proxyURL ?? undefined,
          width: a.width ?? undefined,
          height: a.height ?? undefined,
        }));
        const inbound: InboundMessage = {
          id: message.id,
          channelId: parentId,
          threadId: isThread ? message.channelId : undefined,
          guildId: message.guildId ?? undefined,
          authorId: message.author.id,
          authorBot: message.author.bot,
          content: message.content ?? "",
          mentionedBot: botUserId
            ? message.mentions.users.has(botUserId)
            : false,
          referencedMessageId: message.reference?.messageId ?? undefined,
          authorRoleIds: message.member
            ? [...message.member.roles.cache.keys()]
            : [],
          attachments: attachments.length > 0 ? attachments : undefined,
        };
        Promise.resolve(handlers.onMessage(inbound)).catch((err) => {
          console.error("[discord] message handler error:", err);
        });
      });

      client.on(Events.InteractionCreate, (interaction) => {
        if (!interaction.isChatInputCommand()) return;
        if (!handlers.onSlash) return;
        const adapted = adaptChatInput(interaction as never);
        Promise.resolve(handlers.onSlash(adapted)).catch((err) => {
          console.error("[discord] slash handler error:", err);
        });
      });

      client.on(Events.Error, (err) => {
        console.error("[discord] gateway error:", err);
      });

      await client.login(config.token);
    },
    async stop() {
      client.destroy();
    },
  };

  // Attach reply helper for bridge
  handlers.reply = async ({ channelId, content, replyToMessageId, mentionUserIds }) => {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !("send" in channel) || typeof channel.send !== "function") {
        return null;
      }
      const sent = await channel.send({
        content: content.slice(0, 1900),
        reply: replyToMessageId
          ? { messageReference: replyToMessageId, failIfNotExists: false }
          : undefined,
        ...(mentionUserIds
          ? {
              allowedMentions: {
                parse: [],
                users: mentionUserIds,
                repliedUser: true,
              },
            }
          : {}),
      });
      return { messageId: sent.id };
    } catch (err) {
      console.error("[discord] reply failed:", err);
      return null;
    }
  };

  handlers.sendEmbed = async ({ channelId, embed, replyToMessageId }) => {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !("send" in channel) || typeof channel.send !== "function") {
        return null;
      }
      const sent = await channel.send({
        embeds: [
          {
            description: embed.description,
            color: embed.color,
            footer: embed.footer,
          },
        ],
        reply: replyToMessageId
          ? { messageReference: replyToMessageId, failIfNotExists: false }
          : undefined,
      });
      return { messageId: sent.id };
    } catch (err) {
      console.error("[discord] sendEmbed failed:", err);
      return null;
    }
  };

  handlers.editEmbed = async ({ channelId, messageId, embed }) => {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !("messages" in channel)) return false;
      const messages = (channel as { messages: { fetch: (id: string) => Promise<{ edit: (p: unknown) => Promise<unknown> }> } }).messages;
      const msg = await messages.fetch(messageId);
      await msg.edit({
        embeds: [
          {
            description: embed.description,
            color: embed.color,
            footer: embed.footer,
          },
        ],
      });
      return true;
    } catch (err) {
      console.error("[discord] editEmbed failed:", err);
      return false;
    }
  };

  return gateway;
}

/** No-op gateway for dry-run / missing-token paths that still want orchestration tests. */
export function createNullGateway(): DiscordGateway {
  return {
    botUserId: null,
    async start() {
      /* no-op */
    },
    async stop() {
      /* no-op */
    },
  };
}
