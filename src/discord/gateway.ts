/**
 * Thin Discord gateway (discord.js). Live connect only when token present.
 * Tests inject InboundMessage directly into the router — no ProcessManager.
 */

import type { DiscordEmbedPayload } from "./thinking-status.ts";
import type { BridgeConfig, InboundMessage } from "./types.ts";

export type GatewayHandlers = {
  onMessage: (msg: InboundMessage) => void | Promise<void>;
  onReady?: (botUserId: string) => void;
  /** Optional outbound helper used by bridge after agent reply. */
  reply?: (opts: {
    channelId: string;
    content: string;
    replyToMessageId?: string;
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

/**
 * Live gateway via discord.js. Dynamic import so unit tests need not load it
 * when using the null/fake gateway.
 */
export async function createLiveGateway(
  config: BridgeConfig,
  handlers: GatewayHandlers,
): Promise<DiscordGateway> {
  const discord = await import("discord.js");
  const {
    Client,
    GatewayIntentBits,
    Events,
    ChannelType,
  } = discord;

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  let botUserId: string | null = null;

  const gateway: DiscordGateway = {
    get botUserId() {
      return botUserId;
    },
    async start() {
      client.on(Events.ClientReady, (ready) => {
        botUserId = ready.user.id;
        console.log(`[discord] logged in as ${ready.user.tag}`);
        handlers.onReady?.(ready.user.id);
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
        };
        Promise.resolve(handlers.onMessage(inbound)).catch((err) => {
          console.error("[discord] message handler error:", err);
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
  handlers.reply = async ({ channelId, content, replyToMessageId }) => {
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
