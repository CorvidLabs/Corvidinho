/**
 * HEAR bridge orchestrator: gateway → message-router → session stub + agent spawn.
 */

import type { AgentClient } from "./agent-client.ts";
import {
  createEchoAgentClient,
  createSpawnAgentClient,
} from "./agent-client.ts";
import {
  goLiveChecklist,
  loadBridgeConfig,
  type ConfigResult,
} from "./config.ts";
import {
  createLiveGateway,
  createNullGateway,
  type DiscordGateway,
  type GatewayHandlers,
} from "./gateway.ts";
import { routeMessage } from "./message-router.ts";
import { enforceProtocolVersionOrExit } from "./protocol.ts";
import { SessionStore } from "./session-store.ts";
import type { BridgeConfig, InboundMessage } from "./types.ts";

export type StartBridgeResult =
  | { ok: true; config: BridgeConfig; store: SessionStore; stop: () => Promise<void> }
  | { ok: false; exitCode: number; message: string };

export type StartBridgeOptions = {
  env?: NodeJS.ProcessEnv;
  projectRoot?: string;
  /** Inject agent client (tests). */
  agent?: AgentClient;
  /** Inject gateway factory (tests). */
  gatewayFactory?: (
    config: BridgeConfig,
    handlers: GatewayHandlers,
  ) => Promise<DiscordGateway>;
  /** Skip protocol handshake (unit tests). */
  skipProtocolCheck?: boolean;
};

/**
 * Start the Discord HEAR bridge. Clean exit semantics when token/channels missing.
 */
export async function startBridge(
  opts: StartBridgeOptions = {},
): Promise<StartBridgeResult> {
  const loaded: ConfigResult = await loadBridgeConfig({
    env: opts.env,
    projectRoot: opts.projectRoot,
  });

  if (!loaded.ok) {
    const extra =
      loaded.code === "missing_token" || loaded.code === "empty_channels"
        ? `\n\n${goLiveChecklist()}`
        : "";
    return {
      ok: false,
      exitCode: 1,
      message: `${loaded.message}${extra}`,
    };
  }

  const config = loaded.config;
  const store = new SessionStore();
  const agent =
    opts.agent ??
    (config.dryRun
      ? createEchoAgentClient()
      : createSpawnAgentClient({
          bin: config.corvidinhoBin,
          cwd: config.projectRoot,
        }));

  if (!opts.skipProtocolCheck && !config.dryRun) {
    await enforceProtocolVersionOrExit(config.corvidinhoBin);
  }

  const replyRef: {
    fn?: GatewayHandlers["reply"];
  } = {};

  const handlers: GatewayHandlers = {
    onMessage: async (msg: InboundMessage) => {
      const action = routeMessage(msg, {
        store,
        allowlist: config.allowlist,
        channelOnlyGate: true,
      });

      if (action.kind === "ignore") return;

      if (action.kind === "refuse") {
        if (action.reply && replyRef.fn) {
          await replyRef.fn({
            channelId: msg.threadId ?? msg.channelId,
            content: action.reply,
            replyToMessageId: msg.id,
          });
        }
        return;
      }

      const { session, prompt } = action;
      const result = await agent.runChat({
        prompt,
        sessionId: session.id,
        resume: action.kind === "continue_session",
      });

      const body = result.ok
        ? result.summary.slice(0, 1800)
        : `session ${session.id} failed (exit ${result.exitCode})`;

      if (replyRef.fn) {
        const sent = await replyRef.fn({
          channelId: msg.threadId ?? msg.channelId,
          content: body,
          replyToMessageId: msg.id,
        });
        if (sent?.messageId) {
          store.trackBotMessage(sent.messageId, session);
        }
      } else {
        // Dry / test: synthesize bot message id so reply continuity can be tested.
        store.trackBotMessage(`bot_reply_for_${msg.id}`, session);
      }
    },
    onReady: (id) => {
      console.log(`[discord] bot user id ${id}; monitoring ${config.channelIds.length} channel(s)`);
    },
  };

  const factory =
    opts.gatewayFactory ??
    (async (cfg, h) => {
      if (cfg.dryRun) return createNullGateway();
      const gw = await createLiveGateway(cfg, h);
      replyRef.fn = h.reply;
      return gw;
    });

  const gateway = await factory(config, handlers);
  // If factory is createLiveGateway-like, reply is set inside; for custom, allow handlers.reply
  if (handlers.reply) replyRef.fn = handlers.reply;

  await gateway.start();
  console.log("[discord] HEAR bridge ready (session stub; no ProcessManager).");

  return {
    ok: true,
    config,
    store,
    stop: async () => {
      await gateway.stop();
    },
  };
}

export { goLiveChecklist, loadBridgeConfig };
