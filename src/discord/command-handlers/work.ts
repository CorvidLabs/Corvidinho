import {
  PermissionLevel,
  resolvePermissionLevel,
} from "../permissions.ts";
/**
 * /work — drive a work task (DISCORD-4). Thin steal from corvid-agent
 * session-commands handleWorkCommand + work-dispatch (agent ops, not token product).
 * Optional project (SESSION-WORKTREE-4). In-memory WorkStore + AgentClient; no ProcessManager.
 */

import { enrichPromptWithIdentity } from "../identity-inject.ts";
import { loadDeclaredPeople } from "../../identity/people.ts";
import { ThinkingStatus } from "../thinking-status.ts";
import type { SlashContext, SlashInteraction } from "../slash-types.ts";
import { finishSlashWithThinking, recordSlashStub } from "../slash-finish.ts";
import { formatTaskPlumbing } from "../../agent/task-summary.ts";
import { loadLlmEnv } from "../../agent/execute.ts";
import { openWorkPr, type OpenWorkPrInput } from "../../work/pr.ts";
import { scrubSecrets } from "../../store/scrub.ts";
import { ASK_NO_OWNER_WARNING, formatAskReply } from "../ask-ping.ts";
import { buttonAskFor, toPendingAsk } from "../ask-buttons.ts";
import { answerTurnText } from "../session-thread.ts";
import {
  askNeedsOwner,
  askPingOwner,
  finishSlashWithOwnerNotice,
  slashOwnerNotice,
} from "../spend-post.ts";

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

  const task = ctx.workStore.create({
    description,
    userId: interaction.userId,
    channelId: interaction.channelId,
    sessionId: session.id,
  });
  ctx.workStore.setStatus(task, "running");

  const llmModel = loadLlmEnv(process.env).model;
  const outbound = ctx.thinkingOutbound;
  const thinking = outbound
    ? new ThinkingStatus({
        outbound,
        channelId: interaction.channelId,
        sessionId: session.id,
        model: llmModel,
        debounceMs: ctx.thinkingDebounceMs,
        tickMs: ctx.thinkingTickMs,
      })
    : null;

  if (thinking) {
    await thinking.start({
      description: `Work: ${description.slice(0, 80)}`,
    });
  }

  const actingIsAdmin =
    resolvePermissionLevel({
      userId: interaction.userId,
      roleIds: interaction.roleIds,
      allowlist: ctx.allowlist,
      adminUserIds: ctx.adminUserIds,
      adminRoleIds: ctx.adminRoleIds,
      owner: ctx.owner,
      mutedUsers: ctx.mutedUsers,
    }) >= PermissionLevel.ADMIN;
  const idInject = enrichPromptWithIdentity(description, {
    userId: interaction.userId,
    displayName: interaction.userDisplayName,
    username: interaction.userUsername,
    owner: ctx.owner,
    people: loadDeclaredPeople({ allowlist: ctx.allowlist, owner: ctx.owner }),
  });
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
        prompt: idInject.prompt,
        humanText: description,
        sessionId: session.id,
        resume: false,
        actingUserId: interaction.userId,
        actingIsAdmin,
        cwd: ctx.store.cwdFor(session),
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
    const body = `Work \`${task.id}\` failed: ${msg}`;
    ctx.store.recordTurn(session, "agent", body);
    // DISCORD-ASK-7 — one message when practical (no Done/fail embed + reply).
    await finishSlashWithThinking({
      thinking,
      body,
      interaction,
      sessionId: session.id,
      trackBotMessage: ctx.trackBotMessage,
      thinkExtras: { model: llmModel },
      ok: false,
      failStatus: `❌ ${msg}`,
    });
    return;
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
  // AUTONOMY-1/2 + SAFE-8: a run that stopped to ask (e.g. at the spend cap)
  // is blocked, not done; the owner is pinged (once per cap episode).
  const askOwner = result.ask ? askPingOwner(result.ask, ctx.owner, ctx.spendAlerts) : null;
  // DISCORD-ASK-1/4 (REQ-discord-044): choices that fit a short list get the
  // chat's public Choose stub (the question and options open ephemerally for
  // the requester); free text only when they cannot be listed.
  const choice = result.ask
    ? buttonAskFor({ ask: result.ask, requesterDiscordId: interaction.userId })
    : null;
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
          toPendingAsk({ reason: result.ask.reason, question: result.ask.question }),
      );
    }
    if (askNeedsOwner(result.ask) && !askOwner?.owner && !askOwner?.deduped) {
      console.warn(ASK_NO_OWNER_WARNING);
    }
  } else if (result.ok) {
    ctx.workStore.setStatus(task, "completed", result.summary.slice(0, 500));
  } else {
    ctx.workStore.setStatus(
      task,
      "failed",
      `exit ${result.exitCode}`,
    );
  }

  const summary = ask
    ? ask.content
    : result.ok
      ? result.summary.slice(0, 1500)
      : `failed (exit ${result.exitCode})`;
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
  // ROLES-CHAT-3: commit/push/PR are mutating — only ADMIN (the owner) may
  // ship /work as a PR; everyone else keeps the changes on the work branch.
  const prLine = result.ask?.reason === "spend-cap"
    ? "PR: not opened — the work run paused at the daily spend cap (SAFE-8)."
    : !actingIsAdmin
    ? "PR: not opened — only the owner (ADMIN) can ship /work as a PR (ROLES-CHAT-3). The changes stay on the work branch."
    : await shipWorkPr(ctx, {
    worktreePath:
      session.worktreeState === "active" ? session.worktreePath : undefined,
    branch: session.worktreeBranch,
    taskId: task.id,
    description,
    run: { ok: result.ok, exitCode: result.exitCode, task: result.task },
  });
  const body = [
    `Work task \`${task.id}\` (${task.status}).`,
    `Session: \`${session.id}\`${wt}`,
    `Description: ${description.slice(0, 200)}`,
    prLine,
    "",
    summary,
  ].join("\n");

  // DISCORD-ASK-7 — collapse thinking into the final body (drop the deferred
  // reply); the owner ping for the ask and the pending SAFE-8 80% warning go
  // out as a fresh post (an edit does not notify), claims handed back when
  // nothing carried them.
  const notice = slashOwnerNotice({
    owner: ctx.owner,
    outbox: ctx.spendAlerts,
    ask: result.ask,
    askOwner,
    spendWarning: result.spendWarning,
    label: `/work \`${task.id}\``,
  });
  await finishSlashWithOwnerNotice({
    thinking,
    body,
    interaction,
    sessionId: session.id,
    trackBotMessage: ctx.trackBotMessage,
    thinkExtras,
    ok: result.ok,
    failStatus: `❌ exit ${result.exitCode}`,
    ...(ask ? { askStatus: { status: ask.status, failed: ask.failed }, mentionUserIds: ask.mentionUserIds } : {}),
    ...(choice
      ? {
          components: choice.components,
          onDelivered: (_mode: "collapsed" | "fallback", messageId?: string) =>
            recordSlashStub(ctx.store, session, choice.pending, messageId),
        }
      : {}),
    notice,
    post: ctx.post,
  });
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
