/**
 * AUTONOMY-6.a — a schedule run's question can be answered or cancelled on
 * Discord by the schedule's creator or the owner, and the schedule's next
 * runs wait, with one note, until it is (REQ-discord-606).
 *
 * The scheduler (src/scheduler/service.ts) posts a run's ask with these
 * controls, reusing the DISCORD-ASK buttons (src/discord/ask-buttons.ts) with
 * the run id (`srun_…`) as the ask id: **Choose** when its choices fit a
 * short list (the private pick UI), else **Answer** (the private form,
 * DISCORD-ASK-4.a), and **Cancel**; a spend-cap stop gets **Cancel** only
 * (continuing past the cap is not a choice here). The ask lives in SQLite
 * (`schedule_runs`, schema v15), so its controls work across restarts and do
 * not lapse while it is open — DISCORD-ASK-5's ~30-minute expiry stays for
 * session asks. A channel reply does not answer it: schedule posts are not
 * session-tracked. A schedule with no channel sends the ask, its controls and
 * the wait note to the owner by DM.
 *
 * `handleScheduleAskPress` answers a press or form submit on those controls
 * (the bridge routes every `srun_` ask id here): the press counts only in the
 * schedule's still-allowlisted channel (or, for a schedule with no channel,
 * in a DM), from someone who passes the actor gate and the mute / rate gates,
 * and who is the schedule's creator or the live owner. A pick or a typed
 * answer (SAFE-6 scrubbed; SAFE-13 scanned once, here) closes the ask and is
 * handed to the schedule's next run; Cancel (or `cancel` typed in the form)
 * closes it with no answer. Either way the next due run goes ahead.
 */

import type { AllowlistConfig } from "../allowlist/types.ts";
import type { AuditEntryInput } from "../audit/index.ts";
import type { HumanAsk } from "../agent/types.ts";
import { isOwnerDiscord, type OwnerRecord } from "../identity/owner.ts";
import type { PeopleDirectory } from "../identity/people.ts";
import { SCHEDULE_SESSION_PREFIX } from "../plugins/roles.ts";
import type { Schedule, ScheduleStore } from "../scheduler/store.ts";
import {
  ASK_ANSWER_INPUT_ID,
  ASK_ANSWER_LABEL,
  ASK_CANCEL_LABEL,
  ASK_CHOICE_EXPIRED,
  buildAnswerModal,
  buildChoiceComponents,
  cancelCustomId,
  findOptionLabel,
  formatAskEphemeralContent,
  normalizeAskAnswer,
  openCustomId,
  type DiscordActionRow,
  type DiscordButton,
  type ParsedAskCustomId,
} from "./ask-buttons.ts";
import { formatAskReply } from "./ask-ping.ts";
import type { ComponentInteraction } from "./gateway.ts";
import { inboundInjection, refuseInjectedAnswer } from "./injection-guard.ts";
import { componentChannelAllowlisted } from "./message-router.ts";
import {
  gateActor,
  gateRateOrMute,
  PermissionLevel,
  resolveDiscordActingRole,
  resolvePermissionLevel,
  type RateLimitConfig,
  type RateLimitState,
} from "./permissions.ts";
import { isCancelAsk, isThinAck } from "./thin-ack.ts";
import { ALLOWLIST_DENY_TIP, EPHEMERAL_SILENT_ACK } from "./types.ts";

/** Ask ids of schedule asks are their run ids (`srun_<12 hex>`). */
export const SCHEDULE_ASK_ID_PREFIX = "srun_";

/** Hint on a schedule ask whose choices are listed (Choose + Cancel). */
export const SCHEDULE_ASK_CHOOSE_HINT =
  "Press **Choose** to answer privately, or **Cancel** to drop the question. This schedule's next runs wait until then.";

/** Hint on a free-text schedule ask (Answer + Cancel). */
export const SCHEDULE_ASK_ANSWER_HINT =
  "Press **Answer** to answer privately, or **Cancel** to drop the question. This schedule's next runs wait until then.";

/** Private ack once a schedule ask is answered (typed or picked). */
export const SCHEDULE_ASK_ANSWERED_ACK = "Got it — the schedule's next run gets your answer.";

/** Private ack once a schedule ask is cancelled. */
export const SCHEDULE_ASK_CANCELLED_ACK =
  "Cancelled — the schedule's next runs go ahead without an answer.";

/**
 * Added to the private ack when the schedule is paused (the auto-pause, a
 * SAFE-13 refusal, or `/schedule pause`): closing its question does not
 * resume it (REQ-discord-353), so its next run waits for `/schedule resume`.
 */
export const SCHEDULE_ASK_PAUSED_NOTE =
  "The schedule is paused, so its next run waits for `/schedule resume`.";

/** Someone else's press, or a press on an ask that is no longer open. */
export const SCHEDULE_ASK_NOT_YOURS = "This choice isn’t for you (or it was already answered).";

/** The Answer form could not open (a surface without modals). */
export const SCHEDULE_ASK_NO_FORM = "The private form can't open here.";

/** True for a schedule ask's id (a run id), which the bridge routes here. */
export function isScheduleAskId(askId: string): boolean {
  return askId.startsWith(SCHEDULE_ASK_ID_PREFIX);
}

/**
 * The hint line of a schedule ask post: how its own controls answer it.
 * None for a spend-cap stop (only Cancel; its post stays "Work is paused for
 * budget.", SAFE-14.a).
 */
export function scheduleAskHint(ask: HumanAsk): string | undefined {
  if (ask.reason === "spend-cap") return undefined;
  return ask.options?.length ? SCHEDULE_ASK_CHOOSE_HINT : SCHEDULE_ASK_ANSWER_HINT;
}

/**
 * The controls of a schedule ask post, one row: Choose (listed choices) or
 * Answer (free text), then Cancel; a spend-cap stop gets Cancel only.
 */
export function scheduleAskComponents(runId: string, ask: HumanAsk): DiscordActionRow[] {
  const buttons: DiscordButton[] = [];
  if (ask.reason !== "spend-cap") {
    buttons.push({
      type: 2,
      style: 1,
      label: ask.options?.length ? "Choose" : ASK_ANSWER_LABEL,
      custom_id: openCustomId(runId),
    });
  }
  buttons.push({ type: 2, style: 2, label: ASK_CANCEL_LABEL, custom_id: cancelCustomId(runId) });
  return [{ type: 1, components: buttons }];
}

/**
 * The one wait note (AUTONOMY-6.a) a schedule gets when a due run waits on
 * its open question. It pings nobody and names no amount (a spend-cap stop's
 * note reads the same). The scheduler sends it with the ask's own controls
 * (`scheduleAskComponents`), so a question whose post was lost (a crash
 * between its claim and its post, or a deleted message) can still be
 * answered or cancelled instead of blocking the schedule for good.
 */
export function formatScheduleWaitNote(title: string): string {
  return (
    `⏸️ ${title}: its next runs are waiting until its last question is answered or cancelled. ` +
    "Runs that come due meanwhile are skipped, not made up."
  );
}

export type ScheduleAskPressDeps = {
  store: Pick<ScheduleStore, "get" | "refresh" | "openRunAsk" | "closeRunAsk">;
  /** The live allowlist (the object `/admin` edits in place). */
  allowlist: AllowlistConfig;
  owner: OwnerRecord | null;
  adminUserIds?: string[];
  adminRoleIds?: string[];
  mutedUsers?: Set<string>;
  rateLimit?: { state: RateLimitState; config: RateLimitConfig };
  /** Declared people (IDENTITY-8..12), for the presser's role (SAFE-12/13). */
  people?: () => PeopleDirectory | null;
  /** Fresh channel post (the SAFE-13 owner ping for a refused answer). */
  post?: (p: {
    channelId: string;
    content: string;
    mentionUserIds?: string[];
    replyToMessageId?: string;
  }) => Promise<{ messageId: string } | null>;
  /** SAFE-5 trail for a refused answer (best effort). */
  recordAudit?: (entry: AuditEntryInput) => { seq: number };
  now?: () => number;
};

/**
 * The channel gate of a schedule ask press (DISCORD-5 / REQ-discord-212): a
 * schedule with a channel needs that channel, where its next runs post, and
 * the press channel still allowlisted; a schedule with no channel is
 * answered only in a DM (the owner's, where its ask went). An ask that is no
 * longer open (or unknown) checks the press channel only, so a DM press on it
 * still gets the plain "already answered" reply.
 */
function pressChannelOk(
  interaction: Pick<ComponentInteraction, "channelId" | "guildId">,
  schedule: Schedule | undefined,
  allowlist: AllowlistConfig,
): boolean {
  if (schedule?.channelId) {
    return componentChannelAllowlisted(
      interaction.channelId,
      { channelId: schedule.channelId, threadId: undefined },
      allowlist,
    );
  }
  if (!interaction.guildId) return true;
  if (schedule) return false;
  return componentChannelAllowlisted(interaction.channelId, undefined, allowlist);
}

/**
 * AUTONOMY-6.a — a press or form submit on a schedule ask's controls
 * (`cvask:open|pick|answer|cancel:srun_<id>`). Gates, in order, each refusal
 * ephemeral and leaving the ask open: the channel (zero-width ack, the tip
 * for an admin), the actor gate (zero-width ack), mute / rate (`MUTED` /
 * `RATE_LIMITED`), then open ask + presser is the creator or the live owner
 * ("isn't for you"). Never expires while the ask is open.
 */
export async function handleScheduleAskPress(
  interaction: ComponentInteraction,
  parsed: ParsedAskCustomId,
  deps: ScheduleAskPressDeps,
): Promise<void> {
  const runId = parsed.askId;
  const open = deps.store.openRunAsk(runId);
  let schedule = open ? deps.store.get(open.scheduleId) : undefined;
  if (open && !schedule) {
    // Created by another process on this data dir since the last tick.
    deps.store.refresh();
    schedule = deps.store.get(open.scheduleId);
  }

  if (!pressChannelOk(interaction, schedule, deps.allowlist)) {
    const admin =
      resolvePermissionLevel({
        userId: interaction.userId,
        allowlist: deps.allowlist,
        adminUserIds: deps.adminUserIds,
        adminRoleIds: deps.adminRoleIds,
        owner: deps.owner,
        mutedUsers: deps.mutedUsers,
      }) >= PermissionLevel.ADMIN;
    await interaction.reply({
      content: admin ? ALLOWLIST_DENY_TIP : EPHEMERAL_SILENT_ACK,
      ephemeral: true,
    });
    return;
  }

  // REQ-discord-201 / REQ-discord-010: the actor and mute / rate gates chat,
  // slash and session ask presses pass.
  const actorGate = gateActor({
    userId: interaction.userId,
    roleIds: interaction.roleIds,
    allowlist: deps.allowlist,
    owner: deps.owner,
  });
  if (!actorGate.ok) {
    await interaction.reply({ content: EPHEMERAL_SILENT_ACK, ephemeral: true });
    return;
  }
  const rateGate = gateRateOrMute({
    userId: interaction.userId,
    mutedUsers: deps.mutedUsers,
    ...(deps.rateLimit
      ? {
          rateLimit: {
            ...deps.rateLimit,
            permLevel: resolvePermissionLevel({
              userId: interaction.userId,
              roleIds: interaction.roleIds,
              allowlist: deps.allowlist,
              owner: deps.owner,
            }),
          },
        }
      : {}),
  });
  if (!rateGate.ok) {
    await interaction.reply({ content: rateGate.reply, ephemeral: true });
    return;
  }

  // The schedule's creator or the live owner, on an ask that is still open.
  const mayAnswer =
    open !== undefined &&
    schedule !== undefined &&
    (interaction.userId === schedule.createdByUserId ||
      isOwnerDiscord(deps.owner, interaction.userId));
  if (!mayAnswer || !open || !schedule) {
    await notYours(interaction);
    return;
  }

  const now = deps.now?.() ?? Date.now();
  const closedBy = interaction.userId;
  const spendCap = open.ask.reason === "spend-cap";

  if (parsed.kind === "cancel") {
    if (!deps.store.closeRunAsk(runId, { outcome: "cancelled", closedBy }, now)) {
      await notYours(interaction);
      return;
    }
    await interaction.reply({
      content: withPausedNote(SCHEDULE_ASK_CANCELLED_ACK, schedule),
      ephemeral: true,
    });
    return;
  }

  // A spend-cap stop is answered by Cancel only (continuing past the cap is
  // not a choice here); a forged Choose / Answer press or submit on it is
  // refused like someone else's.
  if (spendCap) {
    await notYours(interaction);
    return;
  }

  if (parsed.kind === "open") {
    const options = open.ask.options;
    if (options?.length) {
      await interaction.reply({
        content: formatAskEphemeralContent(open.ask),
        ephemeral: true,
        components: buildChoiceComponents(runId, options),
      });
      return;
    }
    // DISCORD-ASK-4.a: the private Answer form.
    if (interaction.showModal) {
      await interaction.showModal(buildAnswerModal({ askId: runId, question: open.ask.question }));
      return;
    }
    await interaction.reply({ content: SCHEDULE_ASK_NO_FORM, ephemeral: true });
    return;
  }

  if (parsed.kind === "pick") {
    // SAFE-12.a: only one of the ask's own choices answers it.
    const label = findOptionLabel(open.ask.options, parsed.optionId);
    if (label === undefined) {
      await interaction.reply({ content: ASK_CHOICE_EXPIRED, ephemeral: true });
      return;
    }
    if (!deps.store.closeRunAsk(runId, { outcome: "picked", answer: label, closedBy }, now)) {
      await notYours(interaction);
      return;
    }
    // DISCORD-ASK-8: the private choice buttons go away with the ack.
    await interaction.reply({
      content: withPausedNote(
        `Got it — **${label}**. The schedule's next run goes ahead with it.`,
        schedule,
      ),
      ephemeral: true,
      update: true,
      components: [],
    });
    return;
  }

  // parsed.kind === "answer": the private Answer form's submit.
  if (open.ask.options?.length) {
    await notYours(interaction);
    return;
  }
  const answer = normalizeAskAnswer(interaction.modalValues?.[ASK_ANSWER_INPUT_ID]);
  if (isCancelAsk(answer)) {
    if (!deps.store.closeRunAsk(runId, { outcome: "cancelled", closedBy }, now)) {
      await notYours(interaction);
      return;
    }
    await interaction.reply({
      content: withPausedNote(SCHEDULE_ASK_CANCELLED_ACK, schedule),
      ephemeral: true,
    });
    return;
  }
  // AUTONOMY-5: a thin answer is no answer — restated privately, still open.
  if (isThinAck(answer)) {
    await interaction.reply({
      content: formatAskReply({
        ask: open.ask,
        owner: null,
        hint: scheduleAskHint(open.ask),
      }).content,
      ephemeral: true,
      components: scheduleAskComponents(runId, open.ask),
    });
    return;
  }
  // SAFE-13, once: a non-owner's typed answer that looks like an injection
  // attempt closes nothing and reaches no run; the owner is told.
  const role = resolveDiscordActingRole({
    userId: interaction.userId,
    roleIds: interaction.roleIds,
    allowlist: deps.allowlist,
    adminUserIds: deps.adminUserIds,
    adminRoleIds: deps.adminRoleIds,
    owner: deps.owner,
    mutedUsers: deps.mutedUsers,
    people: deps.people?.() ?? null,
  });
  const suspected = inboundInjection(answer, role);
  if (suspected) {
    await refuseInjectedAnswer(
      { owner: deps.owner, ...(deps.post ? { post: deps.post } : {}), recordAudit: deps.recordAudit },
      interaction,
      suspected,
      {
        sessionId: `${SCHEDULE_SESSION_PREFIX}${schedule.id}`,
        channelId: schedule.channelId ?? interaction.channelId,
        ...(interaction.messageId ? { stubMessageId: interaction.messageId } : {}),
      },
    );
    return;
  }
  if (!deps.store.closeRunAsk(runId, { outcome: "answered", answer, closedBy }, now)) {
    await notYours(interaction);
    return;
  }
  await interaction.reply({
    content: withPausedNote(SCHEDULE_ASK_ANSWERED_ACK, schedule),
    ephemeral: true,
  });
}

/** An ack, plus SCHEDULE_ASK_PAUSED_NOTE when the schedule is paused. */
function withPausedNote(ack: string, schedule: Pick<Schedule, "status">): string {
  return schedule.status === "paused" ? `${ack}\n${SCHEDULE_ASK_PAUSED_NOTE}` : ack;
}

async function notYours(interaction: Pick<ComponentInteraction, "reply">): Promise<void> {
  await interaction.reply({ content: SCHEDULE_ASK_NOT_YOURS, ephemeral: true });
}
