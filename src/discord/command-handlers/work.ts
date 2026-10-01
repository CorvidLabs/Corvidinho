import { resolveDiscordActingRole } from "../permissions.ts";
/**
 * /work — drive a work task (DISCORD-4). Thin steal from corvid-agent
 * session-commands handleWorkCommand + work-dispatch (agent ops, not token product).
 * Optional project (SESSION-WORKTREE-4). In-memory WorkStore + AgentClient; no ProcessManager.
 */

import { enrichPromptWithIdentity } from "../identity-inject.ts";
import { enrichPromptWithProjectMemory, MEMORY_INJECT_LIMIT, memoryInjectOptsFor } from "../memory-inject.ts";
import { fenceSpeakerText, inboundInjection, refuseInjectedSlash } from "../injection-guard.ts";
import { loadDeclaredPeople, type PeopleDirectory, type PersonRole } from "../../identity/people.ts";
import { ThinkingStatus } from "../thinking-status.ts";
import { answerModelFor, answerSpendFor } from "../rich-reply.ts";
import { deliverPrivateReplies, withPrivateNote } from "../private-reply.ts";
import { isOwnerDiscord } from "../../identity/owner.ts";
import { NOT_AUTHORIZED } from "../types.ts";
import type { SlashContext, SlashInteraction } from "../slash-types.ts";
import { finishSlashWithThinking, recordSlashStub } from "../slash-finish.ts";
import { formatTaskPlumbing } from "../../agent/task-summary.ts";
import { loadLlmEnv } from "../../agent/execute.ts";
import { SPEND_PAUSED_TEXT } from "../../agent/spend-notice.ts";
import { openWorkPr, type OpenWorkPrInput } from "../../work/pr.ts";
import { scrubSecrets } from "../../store/scrub.ts";
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
import { RUN_STOPPED_TEXT, buildStopComponents, type SessionRunTurn } from "../run-control.ts";
import type { SessionStub } from "../types.ts";

/** AGENT-3.a: the `/work` PR line of a stopped run (nothing verified to ship). */
export const WORK_STOPPED_PR_REASON = "the run was stopped.";

/**
 * IDENTITY-11.a — who may start /work: the owner (IDENTITY-9) and a declared
 * team member (work tasks, IDENTITY-10); never community (IDENTITY-11).
 */
function workAllowedFor(role: PersonRole): boolean {
  return role === "owner" || role === "team";
}

export async function handleWorkCommand(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const descRaw = interaction.options.description;
  const description = typeof descRaw === "string" ? descRaw.trim() : "";
  if (!description) {
    await interaction.reply({
      content: "Please provide a task description.",
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
  // IDENTITY-8..12: owner (ADMIN), a declared team member (work tasks,
  // IDENTITY-10), or community; the tool layer re-resolves it on every call.
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

  // SAFE-13: a non-owner task that looks like an injection attempt starts no
  // session or work task: a short reply, the owner pinged, an audit row.
  const suspected = inboundInjection(description, actingRole);
  if (suspected) {
    await refuseInjectedSlash(ctx, interaction, suspected, "work-task");
    return;
  }

  // IDENTITY-11.a: community (declared community, anyone undeclared, and a
  // muted or deny-listed caller, IDENTITY-12) can't start /work. The role was
  // just resolved from the live owner config and people list; the refusal is
  // the quiet ephemeral "not authorized" of the owner-only commands
  // (/announce channel, /schedule create, /admin), before any worktree,
  // branch, work task or run exists. Owner and team keep /work unchanged.
  if (!workAllowedFor(actingRole)) {
    await interaction.reply({ content: NOT_AUTHORIZED, ephemeral: true });
    return;
  }

  await interaction.deferReply?.({ ephemeral: false });

  const created = await ctx.store.createWithWorktree({
    channelId: interaction.channelId,
    userId: interaction.userId,
    topic: description.slice(0, 120),
    project,
  });
  const session = created.session;
  if (!created.ok) {
    const body = `Work failed to isolate worktree: ${created.error}`;
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
    await runWork(ctx, interaction, {
      session,
      description,
      people,
      actingRole,
      actingIsAdmin,
      turn,
    });
  } finally {
    turn?.done();
  }
}

/** The `/work` run, its PR step and answer, holding the session's turn (AGENT-3.a). */
async function runWork(
  ctx: SlashContext,
  interaction: SlashInteraction,
  input: {
    session: SessionStub;
    description: string;
    people: PeopleDirectory;
    actingRole: PersonRole;
    actingIsAdmin: boolean;
    turn: SessionRunTurn | undefined;
  },
): Promise<void> {
  const { session, description, people, actingRole, actingIsAdmin, turn } = input;
  const task = ctx.workStore.create({
    description,
    userId: interaction.userId,
    channelId: interaction.channelId,
    sessionId: session.id,
  });
  ctx.workStore.setStatus(task, "running");

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
    await thinking.start({
      description: `Work: ${description.slice(0, 80)}`,
    });
    // AGENT-3.a: a reply 'stop' / 'cancel' to this progress message, or its
    // Stop button, stops the run.
    turn?.setProgressMessage(thinking.progressMessageId);
  }

  // SAFE-12: a non-owner's task goes to the model fenced as untrusted data.
  const idInject = enrichPromptWithIdentity(fenceSpeakerText(description, actingRole, "work-task"), {
    userId: interaction.userId,
    displayName: interaction.userDisplayName,
    username: interaction.userUsername,
    owner: ctx.owner,
    people,
  });
  // MEMORY-6 (#101): the owner's and team's work starts from what earlier
  // work learned about this repo (never for community; nothing when empty),
  // searched for the description (MEMORY-9, #67).
  const workCwd = ctx.store.cwdFor(session);
  const projectInject =
    actingRole === "owner" || actingRole === "team"
      ? enrichPromptWithProjectMemory(
          idInject.prompt,
          ctx.memoryStore,
          memoryInjectOptsFor({ userId: interaction.userId, people, role: actingRole, projectDir: workCwd }).project,
          MEMORY_INJECT_LIMIT,
          description,
        )
      : { prompt: idInject.prompt };
  // AGENT-6 (REQ-discord-072): the description opens the session's thread as
  // the run starts, so a reply to this answer carries it (even after a
  // failure).
  ctx.store.recordTurn(session, "human", description);
  let result;
  try {
    // Busy while the agent runs: the soft-TTL purge must not park this
    // worktree mid-run (REQ-discord-204).
    result = await ctx.store.runActive(session, () =>
      ctx.agent.runChat({
        prompt: projectInject.prompt,
        humanText: description,
        sessionId: session.id,
        resume: false,
        actingUserId: interaction.userId,
        actingIsAdmin,
        actingRole,
        // IDENTITY-10: a /work run — team work tools apply in its worktree.
        workTask: true,
        // SAFE-3.a: /work (the shell gate re-checks the owner and the talk's
        // own worktree in the run).
        surface: "work",
        cwd: workCwd,
        // AGENT-3.a: a stop (or the bridge stopping) kills its process tree.
        ...(turn ? { signal: turn.signal } : {}),
        // DISCORD-17: files attach in the channel the command ran in.
        replyChannelId: interaction.channelId,
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
    const msg = err instanceof Error ? err.message : "agent error";
    ctx.workStore.setStatus(task, "failed", msg);
    // DISCORD-3.b: the owner sees why in one plain line; anyone else only
    // that it didn't work (and whether the owner was told).
    const line = await failedRunReply({
      run: { failureReason: err instanceof Error ? err.message : undefined },
      ownerRun,
      surface: "work",
      channelId: interaction.channelId,
      ownerDm: ctx.failureDm,
    });
    const body = `Work \`${task.id}\` failed: ${line}`;
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

  // AGENT-3: the bridge is stopping and the run was killed: nothing is
  // posted; the task stays `running` and the next start marks it failed
  // (SESSION-WORKTREE-3).
  if (turn?.stopReason === "closed") {
    thinking?.dispose();
    return;
  }
  // AGENT-3.a (REQ-discord-302): a stopped run is `failed` ("stopped"), opens
  // no PR, and its answer is "⏹ Stopped" with the DISCORD-15/15.a footer;
  // any question it raised is dropped.
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
  // is blocked, not done; the owner is pinged (once per cap episode).
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
  if (ask && result.ask) {
    // The status (ask, not "✅ Done") is set when the answer goes out below.
    ctx.workStore.setStatus(task, ask.failed ? "failed" : "blocked", result.summary.slice(0, 500));
    // AUTONOMY-5/6 (REQ-discord-044): the session waits on this ask like a
    // chat ask — a button ask with its options, else free text, as the
    // answer shows it. A SAFE-8 spend-cap stop is never pending: a reply
    // cannot lift the cap.
    if (result.ask.reason !== "spend-cap") {
      ctx.store.setPendingAsk(
        session,
        choice?.pending ??
          answerAsk?.pending ??
          toPendingAsk({ reason: result.ask.reason, question: result.ask.question }),
      );
    }
    if (askNeedsOwner(result.ask) && !askOwner?.owner && !askOwner?.deduped) {
      console.warn(ASK_NO_OWNER_WARNING);
    }
  } else if (stopped) {
    ctx.workStore.setStatus(task, "failed", "stopped");
  } else if (result.ok) {
    ctx.workStore.setStatus(task, "completed", result.summary.slice(0, 500));
  } else {
    ctx.workStore.setStatus(
      task,
      "failed",
      `exit ${result.exitCode}`,
    );
  }

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
            surface: "work",
            channelId: interaction.channelId,
            ownerDm: ctx.failureDm,
          }),
    privateOutcome,
  );
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
  const wt = session.worktreePath
    ? `\nWorktree: \`${session.worktreePath}\``
    : "";
  // AUTONOMOUS-3 / GITHUB-2/5 (REQ-discord-088): ship a verified worktree as
  // a draft PR only when the PR path is allowlisted; else one plain line why.
  // ROLES-CHAT-3 / IDENTITY-10: commit/push/PR are mutating — only the owner
  // (ADMIN) or a team member (work tasks, the role re-resolved from the live
  // people list now) may ship /work as a PR; a team member demoted to
  // community during the run keeps the changes on the work branch (community
  // never starts /work, IDENTITY-11.a). The PR path's own gates (allowlist,
  // GITHUB-6) still apply.
  const shipRole = actingIsAdmin
    ? "owner"
    : actingRole === "team"
    ? resolveDiscordActingRole({
        userId: interaction.userId,
        roleIds: interaction.roleIds,
        allowlist: ctx.allowlist,
        owner: ctx.owner,
        mutedUsers: ctx.mutedUsers,
        people: loadDeclaredPeople({ allowlist: ctx.allowlist, owner: ctx.owner }),
      })
    : "community";
  // AGENT-3: a stop that lands after the agent exited but before this PR
  // step still opens no PR — nothing ships once a stop was acked; a run that
  // had finished cleanly is then recorded `failed` / `stopped` too.
  const stoppedBeforePr = stopped || turn?.stopReason === "stopped";
  if (!stopped && stoppedBeforePr && task.status === "completed") {
    ctx.workStore.setStatus(task, "failed", "stopped");
  }
  // SAFE-14.a: the public line says only that work is paused for budget.
  const prLine = stoppedBeforePr
    ? `PR: not opened — ${WORK_STOPPED_PR_REASON}`
    : result.ask?.reason === "spend-cap"
    ? `PR: not opened — ${SPEND_PAUSED_TEXT}`
    : shipRole !== "owner" && shipRole !== "team"
    ? "PR: not opened — only the owner (ADMIN) can ship /work as a PR, or a declared team member (IDENTITY-10); community runs cannot (ROLES-CHAT-3). The changes stay on the work branch."
    : await shipWorkPr(ctx, {
    worktreePath:
      session.worktreeState === "active" ? session.worktreePath : undefined,
    branch: session.worktreeBranch,
    taskId: task.id,
    description,
    run: { ok: result.ok, exitCode: result.exitCode, task: result.task },
  });
  const head = [
    `Work task \`${task.id}\` (${task.status}).`,
    `Session: \`${session.id}\`${wt}`,
    `Description: ${description.slice(0, 200)}`,
    prLine,
    "",
    "",
  ].join("\n");
  // DISCORD-16: post the whole answer; the gateway splits at 2000.
  const body = `${head}${summary}`;

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
    label: `/work \`${task.id}\``,
  });
  try {
    await finishSlashWithOwnerNotice({
      thinking,
      body,
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

/** One reply line for the /work PR step; never throws (REQ-discord-088). */
async function shipWorkPr(
  ctx: SlashContext,
  input: OpenWorkPrInput,
): Promise<string> {
  try {
    const pr = await (ctx.openWorkPr ?? openWorkPr)(input);
    return pr.line.slice(0, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return scrubSecrets(`PR: not opened — ${msg.slice(0, 200)}`);
  }
}
