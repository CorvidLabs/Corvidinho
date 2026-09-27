/**
 * HEAR bridge orchestrator: gateway → message-router → session stub + agent spawn.
 * DISCORD-3: edit-in-place thinking status while agent runs (no ProcessManager);
 * a reply a dead process left frozen is marked interrupted on the next start
 * (inflight-replies.ts, REQ-discord-311).
 * DISCORD-4: thin slash /session /status /agents /work.
 * DISCORD-SCHEDULE: /schedule + cooperative ticker (single-project).
 * SESSION-WORKTREE: per-talk/project git worktree isolation.
 * DISCORD-6: per-user rate limits + mutes.
 * DISCORD-9: image attachments → local files for agent.
 * MEMORY: auto-recall inject on spawn (AGENT-7 / MEMORY-2/4).
 * DISCORD-10: Merlin-shaped protocol-version lockstep.
 * DISCORD-12: presence/custom status shows shared package version.
 * DISCORD-ANNOUNCE: /announce + bridge-live note to dedicated channel only.
 * ADMIN-1..4: /admin edits the allowlist file + live allowlist (owner only).
 * AUTONOMY-1/2/4..6: ask replies ping requester (clarify) or owner (stuck);
 * thin acks restate pending asks; cancel clears (ask-ping.ts / thin-ack.ts).
 * A /work or /session start answer is tracked too, so its ask is answered
 * the same way (command-handlers/work.ts, session.ts).
 * DISCORD-ASK: ephemeral button asks; ASK-6/7 collapse; ASK-8 clear ephemeral after pick;
 * SESSION-MULTI: per-user sessions.
 */

import type { AgentClient } from "./agent-client.ts";
import {
  createEchoAgentClient,
  createSpawnAgentClient,
} from "./agent-client.ts";
import {
  ASK_NO_OWNER_WARNING,
  formatAskReply,
  withSpendWarningPost,
} from "./ask-ping.ts";
import {
  ASK_CHOICE_EXPIRED,
  buildChoiceComponents,
  buildOpenStubComponents,
  findOptionLabel,
  formatAskEphemeralContent,
  formatAskStub,
  isAskExpired,
  parseAskCustomId,
  toPendingAsk,
  type PendingAsk,
} from "./ask-buttons.ts";
import { resolveAskOptions } from "../agent/ask-options.ts";
import {
  ASK_CANCELLED_ACK,
  isCancelAsk,
  isThinAck,
} from "./thin-ack.ts";
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
import {
  attachmentCacheDir,
  enrichPromptWithImages,
} from "./image-attachments.ts";
import { enrichPromptWithIdentity } from "./identity-inject.ts";
import { enrichPromptWithMemories } from "./memory-inject.ts";
import { formatTaskPlumbing } from "../agent/task-summary.ts";
import { loadLlmEnv } from "../agent/execute.ts";
import { componentChannelAllowlisted, routeMessage } from "./message-router.ts";
import {
  defaultRateLimitConfig,
  isMonitoredChannel,
  muteUser as muteUserImpl,
  unmuteUser as unmuteUserImpl,
  PermissionLevel,
  resolvePermissionLevel,
  type RateLimitState,
} from "./permissions.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "./protocol-version.ts";
import { enforceProtocolVersionOrExit } from "./protocol-version.ts";
import { SessionStore } from "./session-store.ts";
import { handleSlashInteraction } from "./slash-dispatch.ts";
import type { SlashContext } from "./slash-types.ts";
import {
  ThinkingStatus,
  type ThinkingOutbound,
} from "./thinking-status.ts";
import {
  ALLOWLIST_DENY_TIP,
  EPHEMERAL_SILENT_ACK,
  type BridgeConfig,
  type InboundMessage,
} from "./types.ts";
import { WorkStore } from "./work-store.ts";
import {
  InflightReplyStore,
  recoverInterruptedReplies,
  type InflightReply,
} from "./inflight-replies.ts";
import { openCorvidinhoDb, resolveSessionTtlMs } from "../store/index.ts";
import {
  appendAudit,
  auditKeyFromEnv,
  formatAuditLine,
  verifyAudit,
  type AuditEntryInput,
} from "../audit/index.ts";
import { MemoryStore } from "../memory/index.ts";
import {
  ScheduleStore,
  SchedulerService,
} from "../scheduler/index.ts";
import type { Database } from "bun:sqlite";
import { VERSION as PACKAGE_VERSION, tryGitTipShortSha } from "../version.ts";
import { readSpendSnapshot } from "../agent/spend.ts";
import { formatSpendStatusLine } from "../agent/spend-notice.ts";
import { createSpendAlertOutbox } from "../agent/spend-outbox.ts";
import { askPingOwner } from "./spend-post.ts";
import { AnnounceStore } from "./announce-store.ts";
import {
  formatBridgeLiveAnnouncement,
  postAnnouncement,
} from "./announce.ts";

export type StartBridgeResult =
  | {
      ok: true;
      config: BridgeConfig;
      store: SessionStore;
      workStore: WorkStore;
      scheduleStore: ScheduleStore;
      memoryStore?: MemoryStore;
      announceStore?: AnnounceStore;
      mutedUsers: Set<string>;
      rateLimitState: RateLimitState;
      muteUser: (userId: string) => void;
      unmuteUser: (userId: string) => void;
      stop: () => Promise<void>;
    }
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
  /**
   * Override thinking outbound (tests). When omitted, uses gateway
   * sendEmbed/editEmbed; if those are missing, uses a memory outbound.
   */
  thinkingOutbound?: ThinkingOutbound;
  /** ThinkingStatus debounce/tick (tests may shrink). */
  thinkingDebounceMs?: number;
  thinkingTickMs?: number;
  /** Override bridge startedAt (tests). */
  startedAt?: number;
  version?: string;
  /**
   * Shared SQLite DB for SessionStore/WorkStore/MemoryStore (REQ-discord-019/021).
   * When omitted, opens the default Corvidinho DB (or :memory: when dryRun
   * and CORVIDINHO_SESSION_MEMORY=1 for tests).
   */
  db?: Database;
  /** Soft TTL override (tests). */
  sessionTtlMs?: number;
  /** Inject stores (tests); when set, skips DB open. */
  sessionStore?: SessionStore;
  workStore?: WorkStore;
  scheduleStore?: ScheduleStore;
  /** MEMORY store (REQ-discord-021); default opens from shared db. */
  memoryStore?: MemoryStore;
  /** DISCORD-ANNOUNCE store; default opens from shared db. */
  announceStore?: AnnounceStore;
  /** Disable cooperative scheduler ticker (tests). */
  disableScheduler?: boolean;
  /** Scheduler poll interval override (tests). */
  schedulerPollIntervalMs?: number;
};

function memoryThinkingOutbound(): ThinkingOutbound & {
  sends: Array<{ channelId: string; embed: unknown; replyToMessageId?: string; messageId: string }>;
  edits: Array<{ channelId: string; messageId: string; embed: unknown }>;
  contentEdits: Array<{
    channelId: string;
    messageId: string;
    content?: string | null;
    embed?: unknown;
    components?: unknown[] | null;
  }>;
  deletes: Array<{ channelId: string; messageId: string }>;
} {
  let n = 0;
  const sends: Array<{
    channelId: string;
    embed: unknown;
    replyToMessageId?: string;
    messageId: string;
  }> = [];
  const edits: Array<{ channelId: string; messageId: string; embed: unknown }> =
    [];
  const contentEdits: Array<{
    channelId: string;
    messageId: string;
    content?: string | null;
    embed?: unknown;
    components?: unknown[] | null;
  }> = [];
  const deletes: Array<{ channelId: string; messageId: string }> = [];
  return {
    sends,
    edits,
    contentEdits,
    deletes,
    async sendEmbed({ channelId, embed, replyToMessageId }) {
      n += 1;
      const messageId = `progress_${n}`;
      sends.push({ channelId, embed, replyToMessageId, messageId });
      return { messageId };
    },
    async editEmbed({ channelId, messageId, embed }) {
      edits.push({ channelId, messageId, embed });
      return true;
    },
    async editMessage(opts) {
      contentEdits.push({
        channelId: opts.channelId,
        messageId: opts.messageId,
        content: opts.content,
        embed: opts.embed,
        components: opts.components,
      });
      // Also mirror embed-only edits into `edits` for older assertions.
      if (opts.embed && opts.embed !== null) {
        edits.push({
          channelId: opts.channelId,
          messageId: opts.messageId,
          embed: opts.embed,
        });
      }
      return true;
    },
    async deleteMessage({ channelId, messageId }) {
      deletes.push({ channelId, messageId });
      return true;
    },
  };
}

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
  if (config.adminUserIds.length > 0 || config.adminRoleIds.length > 0) {
    // IDENTITY-2 (Leif decision on #42): ADMIN is owner-only.
    console.warn(
      "[discord] CORVIDINHO_DISCORD_ADMIN_USERS/_ROLES are ignored — ADMIN is owner-only (IDENTITY-2). Set CORVIDINHO_OWNER_DISCORD_ID or [owner] in the allowlist file.",
    );
  }
  if (!config.owner) {
    console.warn("[discord] no owner configured — nobody is ADMIN (IDENTITY-3).");
  }
  const env = opts.env ?? process.env;
  const db =
    opts.db ??
    (opts.sessionStore || opts.workStore
      ? undefined
      : openCorvidinhoDb(
          // dry-run without explicit data dir stays in-memory so tests do not
          // touch ~/.local/share/corvidinho; set CORVIDINHO_DATA_DIR to exercise file DB.
          config.dryRun && !env.CORVIDINHO_DATA_DIR?.trim()
            ? { memory: true }
            : { env },
        ));
  const ttlMs = opts.sessionTtlMs ?? resolveSessionTtlMs(env);
  const store =
    opts.sessionStore ??
    new SessionStore({
      db,
      ttlMs,
      defaultProjectRoot: config.projectRoot,
      allowlist: config.allowlist,
    });
  const workStore = opts.workStore ?? new WorkStore({ db });
  if (!opts.workStore && db) {
    // SESSION-WORKTREE-3: work left running by a dead process is failed
    // honestly and its abandoned talk ended (worktree parked, session
    // dropped) so no later talk reuses it as cwd.
    const abandoned = workStore.recoverAbandoned();
    for (const task of abandoned) {
      const session = task.sessionId ? store.get(task.sessionId) : undefined;
      if (session) await store.endSession(session);
    }
    if (abandoned.length > 0) {
      console.log(
        `[discord] restart recovery: ${abandoned.length} abandoned work task(s) marked failed`,
      );
    }
  }
  // REQ-discord-311: replies a dead process left mid-flight. Snapshot before
  // any new reply starts; the embeds are fixed once the gateway is up.
  const inflightReplies = db ? new InflightReplyStore(db) : undefined;
  const inflightBestEffort = <T>(
    what: string,
    fn: (s: InflightReplyStore) => T,
  ): T | undefined => {
    if (!inflightReplies) return undefined;
    try {
      return fn(inflightReplies);
    } catch (err) {
      console.warn(`[discord] in-flight reply ${what} failed:`, err);
      return undefined;
    }
  };
  const interruptedReplies: InflightReply[] =
    inflightBestEffort("read", (s) => s.list()) ?? [];
  /**
   * REQ-discord-311: one row per reply while it is in flight. `end()` is
   * idempotent: it runs the moment the reply lands (thinking message collapsed
   * into the answer — DISCORD-ASK-6/7 — fallback reply posted, or thinking
   * disposed on the dry path) and again from `finally` on every other exit, so
   * a row still present at the next start always means an unfinished reply.
   */
  const trackInflight = (input: {
    sessionId: string;
    channelId: string;
    parentChannelId: string | null;
    requestMessageId: string;
  }) => {
    const id = inflightBestEffort("record", (s) => s.begin(input).id);
    let open = id !== undefined;
    return {
      /** Remember the progress message once ThinkingStatus has one. */
      progress(messageId: string | null): void {
        if (!open || !id || !messageId) return;
        inflightBestEffort("update", (s) => s.setProgressMessage(id, messageId));
      },
      end(): void {
        if (!open || !id) return;
        open = false;
        inflightBestEffort("clear", (s) => s.end(id));
      },
    };
  };
  const scheduleStore =
    opts.scheduleStore ?? new ScheduleStore({ db });
  const memoryStore =
    opts.memoryStore ?? (db ? new MemoryStore({ db }) : undefined);
  const announceStore =
    opts.announceStore ?? (db ? new AnnounceStore(db) : undefined);
  // SAFE-5: verify the tamper-evident audit chain at start; /status repeats it.
  const auditLine = db
    ? () => formatAuditLine(verifyAudit(db, auditKeyFromEnv(env)))
    : undefined;
  if (auditLine) console.log(`[discord] ${auditLine()}`);
  // AUTONOMOUS-8: /status shows rolling 24 h spend against the daily cap.
  const spendLine = () =>
    formatSpendStatusLine(
      readSpendSnapshot({ env, db, model: loadLlmEnv(env).model }),
    );
  // SAFE-8: every bridge post delivers pending 80% warnings (recorded by any
  // run on this data dir) and pings the owner once per spend-cap episode.
  const spendAlerts = createSpendAlertOutbox({ db, env });
  // SAFE-5: /admin mutations append to the same chain (fail closed on error).
  const recordAudit = db
    ? (entry: AuditEntryInput) =>
        appendAudit(db, entry, { key: auditKeyFromEnv(env) })
    : undefined;
  const mutedUsers = new Set<string>(config.mutedUserIds);
  const rateLimitState: RateLimitState = { userMessageTimestamps: new Map() };
  const rateLimitConfig = defaultRateLimitConfig({
    windowMs: config.rateLimitWindowMs,
    maxMessages: config.rateLimitMaxMessages,
    rateLimitByLevel: config.rateLimitByLevel,
  });
  const startedAt = opts.startedAt ?? Date.now();
  const version = opts.version ?? PACKAGE_VERSION;
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
  const embedRef: {
    send?: GatewayHandlers["sendEmbed"];
    edit?: GatewayHandlers["editEmbed"];
    editMessage?: GatewayHandlers["editMessage"];
    deleteMessage?: GatewayHandlers["deleteMessage"];
  } = {};

  const fallbackOutbound = memoryThinkingOutbound();

  function resolveOutbound(): ThinkingOutbound {
    if (opts.thinkingOutbound) return opts.thinkingOutbound;
    if (embedRef.send && embedRef.edit) {
      return {
        sendEmbed: embedRef.send,
        editEmbed: embedRef.edit,
        editMessage: embedRef.editMessage,
        deleteMessage: embedRef.deleteMessage,
      };
    }
    return fallbackOutbound;
  }

  const gitTipSha = tryGitTipShortSha(config.projectRoot);

  function buildSlashCtx(): SlashContext {
    return {
      store,
      workStore,
      scheduleStore,
      memoryStore,
      announceStore,
      auditLine,
      spendLine,
      spendAlerts,
      ...(replyRef.fn ? { post: replyRef.fn } : {}),
      recordAudit,
      // Same object/arrays as the router + scheduler: /admin splices in place.
      allowlist: config.allowlist,
      agent,
      version,
      protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
      startedAt,
      channelIds: config.channelIds,
      thinkingOutbound: resolveOutbound(),
      thinkingDebounceMs: opts.thinkingDebounceMs,
      thinkingTickMs: opts.thinkingTickMs,
      // DISCORD-2 / AUTONOMY-5/6: a reply to a /work or /session start
      // answer continues that session (and answers its pending ask).
      trackBotMessage: (messageId, sessionId) => {
        const session = store.get(sessionId);
        if (session) store.trackBotMessage(messageId, session);
      },
      mutedUsers,
      rateLimitState,
      rateLimitConfig,
      adminUserIds: config.adminUserIds,
      adminRoleIds: config.adminRoleIds,
      owner: config.owner ?? null,
      env: opts.env,
      gitTipSha,
    };
  }

  const handlers: GatewayHandlers = {
    onMessage: async (msg: InboundMessage) => {
      const action = routeMessage(msg, {
        store,
        allowlist: config.allowlist,
        channelOnlyGate: true,
        // REQ-discord-201 — owner passes the actor gate even when unlisted.
        owner: config.owner ?? null,
        mutedUsers,
        rateLimit: { state: rateLimitState, config: rateLimitConfig },
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
      const channelId = msg.threadId ?? msg.channelId;

      // AUTONOMY-5/6: while waiting on an ask, thin acks restate; cancel clears.
      if (
        action.kind === "continue_session" &&
        session.pendingAsk &&
        (isThinAck(prompt) || isCancelAsk(prompt))
      ) {
        if (isCancelAsk(prompt)) {
          store.setPendingAsk(session, null);
          if (replyRef.fn) {
            const sent = await replyRef.fn({
              channelId,
              content: ASK_CANCELLED_ACK,
              replyToMessageId: msg.id,
            });
            if (sent?.messageId) store.trackBotMessage(sent.messageId, session);
          } else {
            store.trackBotMessage(`bot_reply_for_${msg.id}`, session);
          }
          return;
        }
        // Thin ack: restate once; do not spawn agent.
        const hasButtons = Boolean(session.pendingAsk.options?.length);
        const restated = hasButtons
          ? formatAskStub({
              ask: session.pendingAsk,
              ownerDiscordId: config.owner?.discordId,
              requesterDiscordId: msg.authorId,
            })
          : formatAskReply({
              ask: session.pendingAsk,
              owner: config.owner,
              requesterDiscordId: msg.authorId,
              replyHint: true,
            });
        if (replyRef.fn) {
          const sent = await replyRef.fn({
            channelId,
            content: restated.content,
            replyToMessageId: msg.id,
            mentionUserIds: restated.mentionUserIds,
            ...(hasButtons
              ? { components: buildOpenStubComponents(session.pendingAsk.askId) }
              : {}),
          });
          if (sent?.messageId) store.trackBotMessage(sent.messageId, session);
        } else {
          store.trackBotMessage(`bot_reply_for_${msg.id}`, session);
        }
        return;
      }

      // AUTONOMY-6 / SESSION-MULTI-3 / DISCORD-ASK:
      // - free-text pending (no options): substantive continue answers and clears.
      // - button pending (has options): chat continues; buttons stay until pick/timeout.
      let agentPrompt = prompt;
      if (action.kind === "continue_session" && session.pendingAsk) {
        const pending = session.pendingAsk;
        if (pending.options?.length) {
          agentPrompt = prompt;
        } else {
          const prior = pending.question;
          agentPrompt =
            `[Prior clarifying question you asked (the human is answering it now):\n${prior}]\n\n` +
            `Human answer:\n${prompt}`;
          store.setPendingAsk(session, null);
        }
      }

      const outbound = resolveOutbound();
      const llmModel = loadLlmEnv(process.env).model;

      const thinking = new ThinkingStatus({
        outbound,
        channelId,
        replyToMessageId: msg.id,
        sessionId: session.id,
        model: llmModel,
        debounceMs: opts.thinkingDebounceMs,
        tickMs: opts.thinkingTickMs,
      });

      // REQ-discord-311: record the reply while it is in flight so the next
      // bridge start can mark it interrupted if this process dies mid-reply.
      // Cleared on every exit path (collapsed, fallback reply, dry, failed,
      // refused, thrown).
      const inflight = trackInflight({
        sessionId: session.id,
        channelId,
        parentChannelId: msg.threadId ? msg.channelId : null,
        requestMessageId: msg.id,
      });
      try {
        await thinking.start({ description: "Working on your request..." });
        inflight.progress(thinking.progressMessageId);

        // SESSION-WORKTREE: bind isolated cwd on start; on continue reuse the
        // live worktree (no silent switch), or re-create it when its directory
        // is gone (crash mid-park) — never a dead or parked cwd.
        const bound = await store.bindWorktree(session);
        if (!bound.ok) {
          await thinking.fail(`❌ worktree: ${bound.error}`);
          if (replyRef.fn) {
            await replyRef.fn({
              channelId,
              content: `Could not isolate worktree for session \`${session.id}\`: ${bound.error}`,
              replyToMessageId: msg.id,
            });
          }
          await store.endSession(session);
          return;
        }

        const sessionCwd = store.cwdFor(session);

        let result;
        try {
          // DISCORD-9 — download attachments into the session workspace (bound
          // above): the agent's file tools only open paths under its cwd
          // (REQ-discord-013).
          let enrichedPrompt = await enrichPromptWithImages(
            agentPrompt,
            msg.attachments,
            {
              messageId: msg.id,
              cacheDir: attachmentCacheDir(sessionCwd ?? config.projectRoot),
            },
          );

          // IDENTITY-4 — inject Discord user id + display / owner map (never invent names).
          const idInject = enrichPromptWithIdentity(enrichedPrompt, {
            userId: msg.authorId,
            displayName: msg.authorDisplayName,
            username: msg.authorUsername,
            owner: config.owner ?? null,
          });
          if (idInject.injected) {
            console.log(
              `[discord] identity inject: user ${msg.authorId}` +
                (idInject.displayLabel ? ` as ${idInject.displayLabel}` : ""),
            );
            enrichedPrompt = idInject.prompt;
          }

          // AGENT-7 / MEMORY-2/4 — auto-recall inject for acting Discord user.
          const memInject = enrichPromptWithMemories(enrichedPrompt, memoryStore, {
            ownerUserId: msg.authorId,
          });
          if (memInject.injected) {
            console.log(
              `[discord] memory inject: ${memInject.count} recalled for user ${msg.authorId}`,
            );
            enrichedPrompt = memInject.prompt;
          }

          const actingIsAdmin =
            resolvePermissionLevel({
              userId: msg.authorId,
              roleIds: msg.authorRoleIds,
              allowlist: config.allowlist,
              adminUserIds: config.adminUserIds,
              adminRoleIds: config.adminRoleIds,
              owner: config.owner ?? null,
              mutedUsers,
            }) >= PermissionLevel.ADMIN;
          // Busy while the agent runs: the soft-TTL purge must not park this
          // worktree mid-run (REQ-discord-204).
          result = await store.runActive(session, () =>
            agent.runChat({
              prompt: enrichedPrompt,
              // Raw human text (before memory/image enrichment) — the only
              // source of SAFE-4 confirm tokens.
              humanText: prompt,
              sessionId: session.id,
              resume: action.kind === "continue_session",
              actingUserId: msg.authorId,
              actingIsAdmin,
              cwd: sessionCwd,
              onStatus: (u) => {
                void thinking.update({
                  tool: u.tool,
                  tokens: u.tokens,
                  description: u.message ? `⏳ ${u.message}` : undefined,
                });
              },
            }),
          );
        } catch (err) {
          await thinking.fail(
            `❌ ${err instanceof Error ? err.message : "agent error"}`,
          );
          throw err;
        }

        const plumbing = result.task
          ? formatTaskPlumbing({
              state: result.task.state,
              verified: result.task.verified,
              verifySkipped: result.task.verifySkipped,
              attempts: result.task.attempts,
              cancelled: result.task.cancelled,
            })
          : undefined;
        const thinkExtras = { plumbing, model: llmModel };
        // AUTONOMY-1/2/4 / DISCORD-ASK: needs a human → buttons when options, else free-text.
        // SAFE-8: a spend-cap stop is always free text (no choice can lift the
        // cap), pings the owner once per cap episode and is never the pending ask.
        const askRaw = result.ask;
        const spendCap = askRaw?.reason === "spend-cap";
        const askOwner = askRaw ? askPingOwner(askRaw, config.owner, spendAlerts) : null;
        const resolvedOptions =
          askRaw && !spendCap
            ? resolveAskOptions({
                options: askRaw.options,
                question: askRaw.question,
              })
            : undefined;
        const useButtons = Boolean(resolvedOptions?.length);
        let askBody: {
          content: string;
          mentionUserIds: string[];
          status: string;
          failed: boolean;
          ownerPinged?: boolean;
          components?: unknown[];
        } | null = null;
        let pendingToStore: PendingAsk | null = null;

        if (askRaw && useButtons && resolvedOptions) {
          const pending = toPendingAsk({ ...askRaw, options: resolvedOptions });
          const stub = formatAskStub({
            ask: pending,
            ownerDiscordId: config.owner?.discordId,
            requesterDiscordId: msg.authorId,
          });
          askBody = {
            content: stub.content,
            mentionUserIds: stub.mentionUserIds,
            status: stub.status,
            failed: stub.failed,
            ownerPinged: Boolean(
              config.owner?.discordId &&
                stub.mentionUserIds.includes(config.owner.discordId),
            ),
            components: buildOpenStubComponents(pending.askId),
          };
          pendingToStore = pending;
        } else if (askRaw) {
          const formatted = formatAskReply({
            ask: askRaw,
            owner: askOwner?.owner,
            requesterDiscordId: msg.authorId,
            context: result.summary,
            replyHint: true,
          });
          askBody = {
            content: formatted.content,
            mentionUserIds: formatted.mentionUserIds,
            status: formatted.status,
            failed: formatted.failed,
            ownerPinged: formatted.ownerPinged,
          };
          // AUTONOMY-5/6: a clarify or stuck ask waits for the requester's
          // answer. A spend-cap stop is not answerable by a reply, so a later
          // "ok" runs normally and a substantive reply carries no cap text.
          pendingToStore = spendCap ? null : toPendingAsk(askRaw);
        }

        // Pending ask (AUTONOMY-5/6, SESSION-MULTI-3): a new ask is stored; a
        // turn that leaves none (a finished turn, or a SAFE-8 spend-cap stop,
        // which a reply cannot answer) clears a free-text pending ask while a
        // button ask survives until it is picked or times out.
        if (pendingToStore) {
          store.setPendingAsk(session, pendingToStore);
        } else if (session.pendingAsk && !session.pendingAsk.options?.length) {
          store.setPendingAsk(session, null);
        }
        if (
          askRaw &&
          askBody &&
          (askRaw.reason === "stuck" || askRaw.reason === "spend-cap") &&
          !askBody.ownerPinged &&
          !askOwner?.deduped
        ) {
          console.warn(ASK_NO_OWNER_WARNING);
        }

        // DISCORD-3.a — final chat reply is human text only (no plumbing lines).
        const body = askBody
          ? askBody.content
          : result.ok
            ? result.summary.slice(0, 1800)
            : `session ${session.id} failed (exit ${result.exitCode})`;

        // SAFE-8: the pending 80% spend warning and its owner mention ride
        // whichever message goes out (the collapsed edit or the fallback
        // reply); when neither does, the warning and the cap ping go back.
        const spend = spendAlerts.takeWarning(result.spendWarning);
        const out = withSpendWarningPost(
          {
            content: body,
            ...(askBody ? { mentionUserIds: askBody.mentionUserIds } : {}),
          },
          spend?.warning,
          config.owner,
        );
        let delivered = false;
        try {
          // DISCORD-ASK-6/7 — prefer one public message: edit thinking into stub/answer.
          const collapsed = await thinking.finalizeContent({
            content: out.content,
            components: askBody?.components,
            mentionUserIds: out.mentionUserIds,
          });
          if (collapsed) {
            delivered = true;
            // The thinking message is now the answer: nothing left to recover.
            inflight.end();
            store.trackBotMessage(collapsed.messageId, session);
            if (pendingToStore && askBody?.components) {
              pendingToStore.stubMessageId = collapsed.messageId;
              store.setPendingAsk(session, pendingToStore);
            }
          } else if (replyRef.fn) {
            // Fallback when editMessage unavailable: status embed + separate reply.
            if (askBody) {
              await (askBody.failed
                ? thinking.fail(askBody.status, thinkExtras)
                : thinking.done(askBody.status, thinkExtras));
            } else if (result.ok) {
              await thinking.done("✅ Done", thinkExtras);
            } else {
              await thinking.fail(`❌ exit ${result.exitCode}`, thinkExtras);
            }
            const sent = await replyRef.fn({
              channelId,
              content: out.content,
              replyToMessageId: msg.id,
              ...(out.mentionUserIds ? { mentionUserIds: out.mentionUserIds } : {}),
              ...(askBody?.components ? { components: askBody.components } : {}),
            });
            inflight.end();
            delivered = sent !== null;
            if (sent?.messageId) {
              store.trackBotMessage(sent.messageId, session);
              if (pendingToStore && askBody?.components) {
                pendingToStore.stubMessageId = sent.messageId;
                store.setPendingAsk(session, pendingToStore);
              }
            }
          } else {
            thinking.dispose();
            inflight.end();
            // Dry / test: synthesize bot message id so reply continuity can be tested.
            store.trackBotMessage(`bot_reply_for_${msg.id}`, session);
          }
        } finally {
          // Nothing went out: the next post carries the warning and the cap ping.
          if (!delivered) {
            spend?.release();
            askOwner?.release();
          }
        }
      } finally {
        inflight.end();
      }
    },
    onComponent: async (interaction) => {
      const parsed = parseAskCustomId(interaction.customId);
      if (!parsed) return;

      const session = store.list().find(
        (s) => s.pendingAsk?.askId === parsed.askId,
      );

      // DISCORD-5 / DISCORD-DENY-2/3 / REQ-discord-212 — a press counts only in
      // an allowlisted channel (inside the session's thread, its allowlisted
      // parent counts, DISCORD-2.a), and only while the session's own channel
      // is still allowlisted, since the resumed run posts there. Otherwise the
      // ack is ephemeral only: the tip for an admin, zero-width for anyone else.
      if (!componentChannelAllowlisted(interaction.channelId, session, config.allowlist)) {
        const admin =
          resolvePermissionLevel({
            userId: interaction.userId,
            allowlist: config.allowlist,
            adminUserIds: config.adminUserIds,
            adminRoleIds: config.adminRoleIds,
            owner: config.owner ?? null,
            mutedUsers,
          }) >= PermissionLevel.ADMIN;
        await interaction.reply({
          content: admin ? ALLOWLIST_DENY_TIP : EPHEMERAL_SILENT_ACK,
          ephemeral: true,
        });
        return;
      }

      const pending = session?.pendingAsk ?? null;

      // Wrong user or unknown ask → short ephemeral, do not leak.
      if (!session || !pending || session.userId !== interaction.userId) {
        await interaction.reply({
          content: "This choice isn’t for you (or it was already answered).",
          ephemeral: true,
        });
        return;
      }

      if (isAskExpired(pending)) {
        store.setPendingAsk(session, null);
        await interaction.reply({
          content: ASK_CHOICE_EXPIRED,
          ephemeral: true,
        });
        return;
      }

      if (parsed.kind === "open") {
        const options = pending.options;
        if (!options?.length) {
          await interaction.reply({
            content: "No choices available — reply in the channel instead.",
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({
          content: formatAskEphemeralContent(pending),
          ephemeral: true,
          components: buildChoiceComponents(pending.askId, options),
        });
        return;
      }

      // pick — claim immediately so a concurrent re-press cannot double-resume.
      const label =
        findOptionLabel(pending.options, parsed.optionId) ?? parsed.optionId;
      const prior = pending.question;
      store.setPendingAsk(session, null);
      // DISCORD-ASK-8 — strip option buttons on the ephemeral right away.
      await interaction.reply({
        content: `Got it — **${label}**. Working on it…`,
        ephemeral: true,
        update: true,
        components: [],
      });

      const channelId = session.threadId ?? session.channelId;
      const agentPrompt =
        `[Prior clarifying question you asked (the human answered via Discord button):\n${prior}]\n\n` +
        `Human answer:\n${label}`;

      const outbound = resolveOutbound();
      const llmModel = loadLlmEnv(process.env).model;
      const stubId = pending.stubMessageId ?? interaction.messageId;
      const thinking = new ThinkingStatus({
        outbound,
        channelId,
        replyToMessageId: stubId,
        existingMessageId: stubId,
        sessionId: session.id,
        model: llmModel,
        debounceMs: opts.thinkingDebounceMs,
        tickMs: opts.thinkingTickMs,
      });
      // REQ-discord-311: a button pick runs the agent like a message reply, so
      // it is recorded while in flight too and cleared on every exit path. The
      // Choose stub is reused as the progress surface (DISCORD-ASK-7), so the
      // row's progress message is usually the stub itself.
      const inflight = stubId
        ? trackInflight({
            sessionId: session.id,
            channelId,
            parentChannelId: session.threadId ? session.channelId : null,
            requestMessageId: stubId,
          })
        : undefined;
      try {
        await thinking.start({ description: "Working on your request..." });
        inflight?.progress(thinking.progressMessageId);

        // SESSION-WORKTREE-3 / REQ-discord-357: bind on every turn, as the chat
        // path does, so a parked or missing worktree is re-created, never the
        // repo root or a dead directory.
        const bound = await store.bindWorktree(session);
        if (!bound.ok) {
          await thinking.fail(`❌ worktree: ${bound.error}`);
          try {
            await interaction.deleteReply?.();
          } catch {
            /* ignore */
          }
          return;
        }
        const sessionCwd = store.cwdFor(session);

        let result;
        try {
          let enrichedPrompt = agentPrompt;
          const idInject = enrichPromptWithIdentity(enrichedPrompt, {
            userId: interaction.userId,
            owner: config.owner ?? null,
          });
          if (idInject.injected) enrichedPrompt = idInject.prompt;
          const memInject = enrichPromptWithMemories(enrichedPrompt, memoryStore, {
            ownerUserId: interaction.userId,
          });
          if (memInject.injected) enrichedPrompt = memInject.prompt;

          const actingIsAdmin =
            resolvePermissionLevel({
              userId: interaction.userId,
              allowlist: config.allowlist,
              adminUserIds: config.adminUserIds,
              adminRoleIds: config.adminRoleIds,
              owner: config.owner ?? null,
              mutedUsers,
            }) >= PermissionLevel.ADMIN;

          result = await store.runActive(session, () =>
            agent.runChat({
              prompt: enrichedPrompt,
              humanText: label,
              sessionId: session.id,
              resume: true,
              actingUserId: interaction.userId,
              actingIsAdmin,
              cwd: sessionCwd,
              onStatus: (u) => {
                void thinking.update({
                  tool: u.tool,
                  tokens: u.tokens,
                  description: u.message ? `⏳ ${u.message}` : undefined,
                });
              },
            }),
          );
        } catch (err) {
          await thinking.fail(
            `❌ ${err instanceof Error ? err.message : "agent error"}`,
          );
          try {
            await interaction.deleteReply?.();
          } catch {
            /* ignore */
          }
          throw err;
        }

        const plumbing = result.task
          ? formatTaskPlumbing({
              state: result.task.state,
              verified: result.task.verified,
              verifySkipped: result.task.verifySkipped,
              attempts: result.task.attempts,
              cancelled: result.task.cancelled,
            })
          : undefined;
        const thinkExtras = { plumbing, model: llmModel };

        // SAFE-8: as on a chat reply — a spend-cap stop is free text, pings the
        // owner once per cap episode and is never the pending ask.
        const askRaw = result.ask;
        const spendCap = askRaw?.reason === "spend-cap";
        const askOwner = askRaw ? askPingOwner(askRaw, config.owner, spendAlerts) : null;
        const resolvedOptions =
          askRaw && !spendCap
            ? resolveAskOptions({
                options: askRaw.options,
                question: askRaw.question,
              })
            : undefined;
        const useButtons = Boolean(resolvedOptions?.length);
        let askBody: {
          content: string;
          mentionUserIds: string[];
          status: string;
          failed: boolean;
          ownerPinged?: boolean;
          components?: unknown[];
        } | null = null;
        let pendingToStore: PendingAsk | null = null;

        if (askRaw && useButtons && resolvedOptions) {
          const next = toPendingAsk({ ...askRaw, options: resolvedOptions });
          const stub = formatAskStub({
            ask: next,
            ownerDiscordId: config.owner?.discordId,
            requesterDiscordId: interaction.userId,
          });
          askBody = {
            content: stub.content,
            mentionUserIds: stub.mentionUserIds,
            status: stub.status,
            failed: stub.failed,
            ownerPinged: Boolean(
              config.owner?.discordId &&
                stub.mentionUserIds.includes(config.owner.discordId),
            ),
            components: buildOpenStubComponents(next.askId),
          };
          pendingToStore = next;
        } else if (askRaw) {
          const formatted = formatAskReply({
            ask: askRaw,
            owner: askOwner?.owner,
            requesterDiscordId: interaction.userId,
            context: result.summary,
            replyHint: true,
          });
          askBody = {
            content: formatted.content,
            mentionUserIds: formatted.mentionUserIds,
            status: formatted.status,
            failed: formatted.failed,
            ownerPinged: formatted.ownerPinged,
          };
          pendingToStore = spendCap ? null : toPendingAsk(askRaw);
        }

        // The pick already cleared the answered ask; store a follow-up ask
        // (never a SAFE-8 spend-cap stop, which a reply cannot answer).
        if (pendingToStore) {
          store.setPendingAsk(session, pendingToStore);
        }

        const body = askBody
          ? askBody.content
          : result.ok
            ? result.summary.slice(0, 1800)
            : `session ${session.id} failed (exit ${result.exitCode})`;

        // SAFE-8: the pending 80% warning and its owner mention ride whichever
        // message goes out; when neither does, it and the cap ping go back.
        const spend = spendAlerts.takeWarning(result.spendWarning);
        const out = withSpendWarningPost(
          {
            content: body,
            ...(askBody ? { mentionUserIds: askBody.mentionUserIds } : {}),
          },
          spend?.warning,
          config.owner,
        );
        let delivered = false;
        try {
          // DISCORD-ASK-7 — edit stub/thinking into the final answer (no Done+extra).
          const collapsed = await thinking.finalizeContent({
            content: out.content,
            components: askBody?.components,
            mentionUserIds: out.mentionUserIds,
          });
          if (collapsed) {
            delivered = true;
            // The stub/thinking message is now the answer: nothing to recover.
            inflight?.end();
            store.trackBotMessage(collapsed.messageId, session);
            if (pendingToStore && askBody?.components) {
              pendingToStore.stubMessageId = collapsed.messageId;
              store.setPendingAsk(session, pendingToStore);
            }
          } else if (replyRef.fn) {
            if (askBody) {
              await (askBody.failed
                ? thinking.fail(askBody.status, thinkExtras)
                : thinking.done(askBody.status, thinkExtras));
            } else if (result.ok) {
              await thinking.done("✅ Done", thinkExtras);
            } else {
              await thinking.fail(`❌ exit ${result.exitCode}`, thinkExtras);
            }
            const sent = await replyRef.fn({
              channelId,
              content: out.content,
              replyToMessageId: pending.stubMessageId ?? interaction.messageId,
              ...(out.mentionUserIds ? { mentionUserIds: out.mentionUserIds } : {}),
              ...(askBody?.components ? { components: askBody.components } : {}),
            });
            inflight?.end();
            delivered = sent !== null;
            if (sent?.messageId) {
              store.trackBotMessage(sent.messageId, session);
              if (pendingToStore && askBody?.components) {
                pendingToStore.stubMessageId = sent.messageId;
                store.setPendingAsk(session, pendingToStore);
              }
            }
          } else {
            thinking.dispose();
            inflight?.end();
          }
        } finally {
          // Nothing went out: the next post carries the warning and the cap ping.
          if (!delivered) {
            spend?.release();
            askOwner?.release();
          }
        }

        // DISCORD-ASK-8 — drop the ephemeral "Got it… Working…" once resume finishes
        // so buttons cannot linger and the dismissible half-done UI goes away.
        try {
          await interaction.deleteReply?.();
        } catch {
          /* already gone or gateway lacks deleteReply */
        }
      } finally {
        inflight?.end();
      }
    },
    onSlash: async (interaction) => {
      await handleSlashInteraction(buildSlashCtx(), interaction);
    },
    getAllowlistedChannelIds: () => config.channelIds,
    onReady: (id) => {
      console.log(`[discord] bot user id ${id}; monitoring ${config.channelIds.length} channel(s)`);
      // DISCORD-ANNOUNCE-4 — post bridge-live note only to configured announce channel.
      if (announceStore && replyRef.fn) {
        const note = formatBridgeLiveAnnouncement(version);
        void postAnnouncement(announceStore, replyRef.fn, note).then((r) => {
          if (r.ok) {
            console.log(`[discord] announce posted to ${r.channelId}: ${note}`);
          } else if (r.reason === "not_configured") {
            console.log("[discord] announce channel not set — skipping bridge-live note");
          } else {
            console.warn(`[discord] announce post skipped: ${r.reason}`);
          }
        });
      }
    },
  };

  const factory =
    opts.gatewayFactory ??
    (async (cfg, h) => {
      if (cfg.dryRun) return createNullGateway();
      const gw = await createLiveGateway(cfg, h, { version });
      replyRef.fn = h.reply;
      embedRef.send = h.sendEmbed;
      embedRef.edit = h.editEmbed;
      embedRef.editMessage = h.editMessage;
      embedRef.deleteMessage = h.deleteMessage;
      return gw;
    });

  let scheduler: SchedulerService | null = null;
  if (!opts.disableScheduler) {
    scheduler = new SchedulerService({
      store: scheduleStore,
      agent,
      allowlist: config.allowlist,
      pollIntervalMs: opts.schedulerPollIntervalMs,
      defaultProjectRoot: config.projectRoot,
      owner: config.owner ?? null,
      spendAlerts,
      outbound: {
        post: async ({ channelId, content, mentionUserIds }) => {
          if (!replyRef.fn) return false;
          return (await replyRef.fn({ channelId, content, mentionUserIds })) !== null;
        },
      },
      // Start after gateway is up; construct with manual then start below.
      manual: true,
    });
  }

  const gateway = await factory(config, handlers);
  // If factory is createLiveGateway-like, reply is set inside; for custom, allow handlers.reply
  if (handlers.reply) replyRef.fn = handlers.reply;
  if (handlers.sendEmbed) embedRef.send = handlers.sendEmbed;
  if (handlers.editEmbed) embedRef.edit = handlers.editEmbed;
  if (handlers.editMessage) embedRef.editMessage = handlers.editMessage;
  if (handlers.deleteMessage) embedRef.deleteMessage = handlers.deleteMessage;

  await gateway.start();
  if (inflightReplies && interruptedReplies.length > 0) {
    // After login: the REST calls need the token. Sequential, never throws.
    // Only rows still present are unfinished: a reply whose thinking message
    // was collapsed into the answer (DISCORD-ASK-6/7) deleted its row then.
    const outbound = resolveOutbound();
    const r = await recoverInterruptedReplies({
      store: inflightReplies,
      rows: interruptedReplies,
      // DISCORD-5: only channels (or a thread's parent) still allowlisted now.
      mayPost: (row) =>
        isMonitoredChannel(row.channelId, config.allowlist) ||
        (row.parentChannelId != null &&
          isMonitoredChannel(row.parentChannelId, config.allowlist)),
      editEmbed: (o) => outbound.editEmbed(o),
      reply: replyRef.fn,
    });
    console.log(
      `[discord] restart recovery: ${interruptedReplies.length} interrupted reply(ies) — ${r.edited} embed(s) marked interrupted, ${r.replied} replied, ${r.failed} unreachable, ${r.skipped} skipped (channel not allowlisted)`,
    );
  }
  scheduler?.start();
  console.log(
    "[discord] HEAR bridge ready (session stub + thinking status + slash + schedule ticker + announce + rate/mute; no ProcessManager).",
  );

  return {
    ok: true,
    config,
    store,
    workStore,
    scheduleStore,
    memoryStore,
    announceStore,
    mutedUsers,
    rateLimitState,
    muteUser: (userId: string) => muteUserImpl(mutedUsers, userId),
    unmuteUser: (userId: string) => unmuteUserImpl(mutedUsers, userId),
    stop: async () => {
      scheduler?.stop();
      await gateway.stop();
    },
  };
}

export { goLiveChecklist, loadBridgeConfig, memoryThinkingOutbound };
