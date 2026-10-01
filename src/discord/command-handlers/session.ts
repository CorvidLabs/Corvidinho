import { resolveDiscordActingRole } from "../permissions.ts";
/**
 * /session list|start (DISCORD-4). Thin steal from corvid-agent session-commands.
 * Optional project (SESSION-WORKTREE-4). No ProcessManager, no Discord thread product UI.
 */

import { enrichPromptWithIdentity } from "../identity-inject.ts";
import { fenceSpeakerText, inboundInjection, refuseInjectedSlash } from "../injection-guard.ts";
import { loadDeclaredPeople, type PeopleDirectory, type PersonRole } from "../../identity/people.ts";
import { ThinkingStatus } from "../thinking-status.ts";
import { answerModelFor, answerSpendFor } from "../rich-reply.ts";
import { deliverPrivateReplies, withPrivateNote } from "../private-reply.ts";
import { isOwnerDiscord } from "../../identity/owner.ts";
import { actorIsAdmin, projectLabel } from "../list-scope.ts";
import type { SlashContext, SlashInteraction } from "../slash-types.ts";
import { finishSlashWithThinking, holdSlashReply, recordSlashStub } from "../slash-finish.ts";
import { publicReplyNotPostedText } from "../public-reply-gate.ts";
import { formatTaskPlumbing } from "../../agent/task-summary.ts";
import { loadLlmEnv } from "../../agent/execute.ts";
import { ASK_NO_OWNER_WARNING, formatAskReply } from "../ask-ping.ts";
import { answerAskFor, buttonAskFor, toPendingAsk } from "../ask-buttons.ts";
import { answerTurnText } from "../session-thread.ts";
import {
  askNeedsOwner,
  askPingOwner,
  finishSlashWithOwnerNotice,
  slashOwnerNotice,
} from "../spend-post.ts";
import { spendStopFor } from "../spend-dm.ts";
import { failedRunReply } from "../failure-reason.ts";
import {
  RUN_STOPPED_TEXT,
  buildStopComponents,
  type RunStopReason,
  type SessionRunTurn,
} from "../run-control.ts";
import type { SessionStub } from "../types.ts";

function formatSessionLine(
  s: {
    id: string;
    channelId: string;
    userId: string;
    topic?: string;
    project?: string;
    lastActivityAt: number;
  },
  opts: { fullProjectPath: boolean },
): string {
  const ageSec = Math.max(0, Math.floor((Date.now() - s.lastActivityAt) / 1000));
  const topic = s.topic ? ` — ${s.topic.slice(0, 60)}` : "";
  // REQ-discord-418: only ADMIN sees the absolute host path.
  const shown = opts.fullProjectPath ? s.project : projectLabel(s.project);
  const project = shown ? ` · \`${shown}\`` : "";
  return `• \`${s.id}\` <#${s.channelId}> <@${s.userId}>${topic}${project} (${ageSec}s ago)`;
}

/**
 * REQ-discord-418 (SESSION-MULTI-1, IDENTITY-2/3): ADMIN (owner) lists every
 * session; anyone else lists only sessions they own, without host paths.
 */
export async function handleSessionList(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const isAdmin = actorIsAdmin(ctx, interaction);
  const all = ctx.store.list();
  const sessions = isAdmin
    ? all
    : all.filter((s) => s.userId === interaction.userId);
  if (sessions.length === 0) {
    await interaction.reply({
      content: "No active sessions.",
      ephemeral: true,
    });
    return;
  }
  const lines = sessions
    .slice(0, 20)
    .map((s) => formatSessionLine(s, { fullProjectPath: isAdmin }));
  const more =
    sessions.length > 20 ? `\n…and ${sessions.length - 20} more` : "";
  await interaction.reply({
    content: `Active sessions (${sessions.length}):\n${lines.join("\n")}${more}`,
    ephemeral: true,
  });
}

export async function handleSessionStart(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const topicRaw = interaction.options.topic;
  const topic = typeof topicRaw === "string" ? topicRaw.trim() : "";
  if (!topic) {
    await interaction.reply({
      content: "Please provide a topic.",
      ephemeral: true,
    });
    return;
  }

  const projectRaw = interaction.options.project;
  const project =
    typeof projectRaw === "string" && projectRaw.trim()
      ? projectRaw.trim()
      : undefined;

  const people = loadDeclaredPeople({ allowlist: ctx.allowlist, owner: ctx.owner });
  // IDENTITY-8..12: owner (ADMIN), a declared team member, or community;
  // the tool layer re-resolves it on every call.
  const actingRole = resolveDiscordActingRole({
    userId: interaction.userId,
    roleIds: interaction.roleIds,
    allowlist: ctx.allowlist,
    adminUserIds: ctx.adminUserIds,
    adminRoleIds: ctx.adminRoleIds,
    owner: ctx.owner,
    mutedUsers: ctx.mutedUsers,
    people,
  });
  const actingIsAdmin = actingRole === "owner";

  // SAFE-13: a non-owner topic that looks like an injection attempt starts no
  // session: a short reply, the owner pinged, an audit row.
  const suspected = inboundInjection(topic, actingRole);
  if (suspected) {
    await refuseInjectedSlash(ctx, interaction, suspected, "session-topic");
    return;
  }

  await interaction.deferReply?.({ ephemeral: false });

  const created = await ctx.store.createWithWorktree({
    channelId: interaction.channelId,
    userId: interaction.userId,
    topic,
    project,
  });
  const session = created.session;
  if (!created.ok) {
    const body = `Session \`${session.id}\` failed to isolate worktree: ${created.error}`;
    if (interaction.editReply) {
      await interaction.editReply({ content: body });
    } else {
      await interaction.reply({ content: body });
    }
    await ctx.store.endSession(session);
    return;
  }

  // AGENT-3.a (REQ-discord-301/302): the run takes its new session's turn
  // (nothing is queued on a new session), so 'stop' / 'cancel' reaches it.
  const turn = ctx.runControl?.enqueue({
    sessionId: session.id,
    requesterId: interaction.userId,
    channelId: interaction.channelId,
  });
  try {
    // The bridge is stopping: nothing starts.
    if (turn && !(await turn.ready)) return;
    await runSessionStart(ctx, interaction, {
      session,
      topic,
      people,
      actingRole,
      actingIsAdmin,
      turn,
    });
  } finally {
    turn?.done();
  }
}

/** The `/session start` run and its answer, holding the session's turn (AGENT-3.a). */
async function runSessionStart(
  ctx: SlashContext,
  interaction: SlashInteraction,
  input: {
    session: SessionStub;
    topic: string;
    people: PeopleDirectory;
    actingRole: PersonRole;
    actingIsAdmin: boolean;
    turn: SessionRunTurn | undefined;
  },
): Promise<void> {
  const { session, topic, people, actingRole, actingIsAdmin, turn } = input;
  const llmModel = loadLlmEnv(process.env).model;
  // DISCORD-15.a: tokens and cost show on the owner's own runs only.
  const ownerRun = isOwnerDiscord(ctx.owner, interaction.userId);
  const outbound = ctx.thinkingOutbound;
  const thinking = outbound
    ? new ThinkingStatus({
        outbound,
        channelId: interaction.channelId,
        sessionId: session.id,
        model: llmModel,
        showUsage: ownerRun,
        // AGENT-3.a (REQ-discord-303): the run's Stop button.
        ...(turn ? { components: buildStopComponents(turn.runId) } : {}),
        debounceMs: ctx.thinkingDebounceMs,
        tickMs: ctx.thinkingTickMs,
      })
    : null;

  if (thinking) {
    await thinking.start({ description: `Session: ${topic.slice(0, 80)}` });
    // AGENT-3.a: a reply 'stop' / 'cancel' to this progress message, or its
    // Stop button, stops the run.
    turn?.setProgressMessage(thinking.progressMessageId);
  }

  // SAFE-12: a non-owner's topic goes to the model fenced as untrusted data.
  const idInject = enrichPromptWithIdentity(fenceSpeakerText(topic, actingRole, "session-topic"), {
    userId: interaction.userId,
    displayName: interaction.userDisplayName,
    username: interaction.userUsername,
    owner: ctx.owner,
    people,
  });
  const prompt = idInject.prompt;
  // AGENT-6 (REQ-discord-072): the topic opens the session's thread as the
  // run starts, so a reply to this answer carries it (even after a failure).
  ctx.store.recordTurn(session, "human", topic);

  let result;
  try {
    // AUTONOMY-10.a: replies in a public thread still wait for the owner's OK.
    const replyPublicThread = (await ctx.publicReplies?.mustHold(interaction.channelId)) ?? false;
    // Busy while the agent runs: the soft-TTL purge must not park this
    // worktree mid-run (REQ-discord-204).
    result = await ctx.store.runActive(session, () =>
      ctx.agent.runChat({
        prompt,
        humanText: topic,
        sessionId: session.id,
        resume: false,
        actingUserId: interaction.userId,
        actingIsAdmin,
        actingRole,
        // SAFE-3.a: /session start (the shell gate re-checks the owner and
        // the talk's own worktree in the run).
        surface: "session",
        cwd: ctx.store.cwdFor(session),
        // AGENT-3.a: a stop (or the bridge stopping) kills its process tree.
        ...(turn ? { signal: turn.signal } : {}),
        // DISCORD-17: files attach in the channel the command ran in.
        replyChannelId: interaction.channelId,
        // AUTONOMY-10.a (REQ-discord-099): `discord-send-file` asks while
        // replies in this public thread wait for the owner's OK.
        replyPublicThread,
        onStatus: (u) => {
          void thinking?.update({
            tool: u.tool,
            tokens: u.tokens,
            description: u.message ? `⏳ ${u.message}` : undefined,
          });
        },
      }),
    );
  } catch (err) {
    // DISCORD-3.b: the owner sees why in one plain line; anyone else only
    // that it didn't work (and whether the owner was told).
    const line = await failedRunReply({
      run: { failureReason: err instanceof Error ? err.message : undefined },
      ownerRun,
      surface: "session",
      channelId: interaction.channelId,
      ownerDm: ctx.failureDm,
    });
    const body = `Session \`${session.id}\` failed: ${line}`;
    ctx.store.recordTurn(session, "agent", body);
    // DISCORD-ASK-7 — one message when practical (no Done/fail embed + reply).
    await finishSlashWithThinking({
      thinking,
      body,
      interaction,
      sessionId: session.id,
      trackBotMessage: ctx.trackBotMessage,
      thinkExtras: { model: llmModel, ...(ownerRun ? { spend: {} } : {}) },
      ok: false,
      failStatus: `❌ ${line}`,
      post: ctx.post,
    });
    return;
  }

  // AGENT-3: the bridge is stopping and the run was killed: nothing is posted.
  if (turn?.stopReason === "closed") {
    thinking?.dispose();
    return;
  }
  // AGENT-3.a (REQ-discord-302): a stopped run's answer is "⏹ Stopped" with
  // the DISCORD-15/15.a footer; any question it raised is dropped.
  const stopped = turn?.stopReason === "stopped";
  if (stopped) {
    const { ask: _dropped, ...rest } = result;
    result = { ...rest, ok: false };
  }

  const plumbing = result.task
    ? formatTaskPlumbing({
        state: result.task.state,
        verified: result.task.verified,
        verifySkipped: result.task.verifySkipped,
        attempts: result.task.attempts,
        cancelled: result.task.cancelled,
        // AGENT-12: `stopped=turn-cap|idle-timeout`, plumbing only (AGENT-9).
        stopReason: result.task.stopReason,
      })
    : undefined;
  // DISCORD-15/15.a: the answer footer adds tokens and cost on owner runs.
  // AGENT-11: the model that answered ("b (fell back from a)"), each model
  // priced at its own price.
  const thinkExtras = {
    plumbing,
    model: answerModelFor(result, llmModel),
    ...(ownerRun ? { spend: answerSpendFor(result.usage, llmModel, result.usageByModel) } : {}),
  };
  // AUTONOMY-1/2 + SAFE-8: a run that stopped to ask (e.g. at the spend cap)
  // is not "Done"; the owner is pinged (once per cap episode).
  const askOwner = result.ask ? askPingOwner(result.ask, ctx.owner, ctx.spendAlerts) : null;
  // DISCORD-ASK-1/4 (REQ-discord-044): choices that fit a short list get the
  // chat's public Choose stub (the question and options open ephemerally for
  // the requester); free text only when they cannot be listed.
  const choice = result.ask
    ? buttonAskFor({ ask: result.ask, requesterDiscordId: interaction.userId })
    : null;
  // DISCORD-ASK-4.a: otherwise a clarify or stuck ask keeps its question in
  // the answer and gets the Answer button (a private form), as in chat; a
  // reply still answers it. Never on a spend-cap stop.
  const answerAsk = result.ask && !choice ? answerAskFor({ ask: result.ask }) : null;
  // The reply addresses the requester on clarify (AUTONOMY-4); the owner is
  // pinged in a separate post (below) for stuck and spend-cap.
  const ask = choice
    ? choice.stub
    : result.ask
    ? formatAskReply({
        ask: result.ask,
        owner: null,
        requesterDiscordId: interaction.userId,
        context: result.summary,
        answerButton: Boolean(answerAsk),
      })
    : null;
  // The status (ask, not "✅ Done") is set when the answer goes out below.
  if (ask && result.ask && askNeedsOwner(result.ask) && !askOwner?.owner && !askOwner?.deduped) {
    console.warn(ASK_NO_OWNER_WARNING);
  }
  // AUTONOMY-5/6 (REQ-discord-044): the session waits on this ask like a
  // chat ask — a button ask with its options, else free text, as the answer
  // shows it. A SAFE-8 spend-cap stop is never pending: a reply cannot lift
  // the cap. Set once the answer goes out (a held one, AUTONOMY-10.a).
  const pendingToSet =
    result.ask && result.ask.reason !== "spend-cap"
      ? choice?.pending ??
        answerAsk?.pending ??
        toPendingAsk({ reason: result.ask.reason, question: result.ask.question })
      : null;

  // MEMORY-7.a (REQ-discord-710): the run's private replies go to the
  // invoker by DM only; the channel gets the "sent privately" note.
  const privateOutcome = await deliverPrivateReplies({
    replies: result.privateReplies,
    userId: interaction.userId,
    sendDm: ctx.sendDm,
  });
  // DISCORD-16: the whole answer; it is split into messages when long.
  // ROLES-CHAT-3: splits keep a closing role note instead of clipping it.
  const summary = withPrivateNote(
    stopped
      ? RUN_STOPPED_TEXT
      : ask
      ? ask.content
      : result.ok
        ? result.summary
        : // DISCORD-3.b: why (the owner's run), else "the owner has been told".
          await failedRunReply({
            run: result,
            ownerRun,
            surface: "session",
            channelId: interaction.channelId,
            ownerDm: ctx.failureDm,
          }),
    privateOutcome,
  );
  const wt = session.worktreePath
    ? `\nWorktree: \`${session.worktreePath}\``
    : "";
  const head = `Session \`${session.id}\` started.\nTopic: ${topic.slice(0, 200)}${wt}\n\n`;
  // DISCORD-16: post the whole answer; the gateway splits at 2000.
  const body = `${head}${summary}`;

  // AUTONOMY-10 / 10.a (REQ-discord-099): the answer or question (model
  // text, the topic I typed included) waits for the owner's OK in a public
  // thread while fewer than 20 replies were approved. A no posts none of it.
  const held = await holdSlashReply({
    gate: ctx.publicReplies,
    thinking,
    interaction,
    body,
    modelText: !stopped && (result.ask ? result.ask.reason !== "spend-cap" : result.ok),
    surface: "session",
    ...(turn ? { signal: turn.signal } : {}),
  });
  if (!held.post) {
    // The bridge stopped while it waited: nothing is posted.
    if ((turn?.stopReason as RunStopReason | undefined) === "closed") {
      thinking?.dispose();
      return;
    }
    const line = turn?.stopReason === "stopped" ? RUN_STOPPED_TEXT : publicReplyNotPostedText(held.outcome);
    ctx.store.recordTurn(session, "agent", line);
    try {
      await finishSlashWithThinking({
        thinking,
        body: line,
        interaction,
        sessionId: session.id,
        trackBotMessage: ctx.trackBotMessage,
        thinkExtras,
        ok: false,
        failStatus: line,
        post: ctx.post,
      });
    } finally {
      await ctx.spendDm?.deliver({ warning: result.spendWarning });
    }
    return;
  }
  if (pendingToSet) ctx.store.setPendingAsk(session, pendingToSet);
  // AGENT-6 (REQ-discord-072): the answer joins the thread (a button ask as
  // its question and choices); a spend-cap stop records no answer
  // (REQ-discord-098).
  ctx.store.recordTurn(
    session,
    "agent",
    answerTurnText(
      summary,
      choice?.pending ??
        (result.ask ? { reason: result.ask.reason, question: result.ask.question } : null),
    ),
  );

  // DISCORD-ASK-7 — collapse thinking into the final body (drop the deferred
  // reply); the owner ping for the ask goes out as a fresh post (an edit does
  // not notify), its claim handed back when nothing carried it. SAFE-14.a:
  // the 80% warning and a cap stop's details go to the owner by DM instead.
  const notice = slashOwnerNotice({
    owner: ctx.owner,
    ask: result.ask,
    askOwner,
    // SAFE-13: a tool result that looked like an injection tells the owner.
    injection: result.injection,
    label: `/session \`${session.id}\``,
  });
  try {
    await finishSlashWithOwnerNotice({
      thinking,
      body: held.text,
      interaction,
      sessionId: session.id,
      trackBotMessage: ctx.trackBotMessage,
      thinkExtras,
      ok: result.ok,
      failStatus: stopped ? RUN_STOPPED_TEXT : `❌ exit ${result.exitCode}`,
      ...(ask ? { askStatus: { status: ask.status, failed: ask.failed }, mentionUserIds: ask.mentionUserIds } : {}),
      ...(choice
        ? {
            components: choice.components,
            onDelivered: (_mode: "collapsed" | "fallback", messageId?: string) =>
              recordSlashStub(ctx.store, session, choice.pending, messageId),
          }
        : answerAsk
        ? {
            components: answerAsk.components,
            keepFooter: true,
            onDelivered: (_mode: "collapsed" | "fallback", messageId?: string) =>
              recordSlashStub(ctx.store, session, answerAsk.pending, messageId),
          }
        : {}),
      notice,
      post: ctx.post,
    });
  } finally {
    // SAFE-14.a: the owner's DM — the stop's details when this run claimed
    // the episode's ping, and the pending 80% warning. Never throws.
    await ctx.spendDm?.deliver({
      stop: spendStopFor(result.ask, askOwner, interaction.channelId),
      warning: result.spendWarning,
    });
  }
}

export async function handleSessionCommand(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const sub = interaction.subcommand ?? "list";
  if (sub === "start") {
    await handleSessionStart(ctx, interaction);
    return;
  }
  if (sub === "list") {
    await handleSessionList(ctx, interaction);
    return;
  }
  await interaction.reply({
    content: `Unknown /session subcommand: ${sub}. Use list or start.`,
    ephemeral: true,
  });
}
