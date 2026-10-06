/**
 * AGENT-3.c — I or the schedule's creator can stop a scheduled run in
 * progress from Discord, the same way as a chat run (REQ-discord-304;
 * captured in `hi/agent.md` from Leif's 2026-09-28 interview, round 13).
 *
 * The bridge hands its scheduler this stop control
 * (`SchedulerServiceOpts.runStop`). Each run the bridge's ticker starts takes
 * a turn on the bridge's own `SessionRunControl` (session `schedule_<id>`,
 * the schedule's creator as the requester), so it is stopped through the one
 * AGENT-3.a stop path — `SessionRunControl.stop`: its signal aborted once,
 * the agent's process tree killed — and nothing new:
 *
 * - With a channel, the run's progress message (a `ThinkingStatus` embed,
 *   `⏳ <schedule title>: running.`) goes to that channel with the run's red
 *   **Stop** button (`cvstop:<runId>`). A press, or a reply 'stop' / 'cancel'
 *   to it, from the creator or the owner stops it; anyone else's press gets
 *   "This Stop button isn't for you." (bridge.ts `pressStopButton`,
 *   message-router.ts `stop_run`).
 * - With no channel (the schedule runs silently), the owner gets the same
 *   line and Stop button by DM, where the schedule's asks go (AUTONOMY-6.a).
 *   There only the button stops it: the bridge reads no DM text.
 *
 * When the run is over its turn is released first, so a later press finds
 * nothing running; then a stopped run's message becomes `⏹ Stopped` (its
 * button cleared) and any other run's is deleted, so the schedule's result
 * post reads as before. In memory only: nothing is stored here.
 */

import type { OwnerRecord } from "../identity/owner.ts";
import { SCHEDULE_SESSION_PREFIX } from "../plugins/roles.ts";
import type { ScheduleRunStop, ScheduleRunStopHandle } from "../scheduler/service.ts";
import { formatErrorLine } from "../store/scrub.ts";
import type { GatewayHandlers } from "./gateway.ts";
import {
  RUN_STOPPED_TEXT,
  buildStopComponents,
  type SessionRunControl,
  type SessionRunTurn,
} from "./run-control.ts";
import { ThinkingStatus, type ThinkingOutbound } from "./thinking-status.ts";

/** A schedule run's progress line while it goes (AGENT-3.c). */
export function scheduleRunProgressText(title: string): string {
  return `⏳ ${title}: running.`;
}

export type ScheduleRunStopDeps = {
  /** The bridge's run control (the chat runs' queue and stop path). */
  runControl: Pick<SessionRunControl, "enqueue">;
  /** The progress embeds' outbound (the bridge's `resolveOutbound`), read per run. */
  outbound: () => ThinkingOutbound;
  /** The gateway's DM, edit and delete, read per run (they are set at start). */
  sendDm: () => GatewayHandlers["sendDm"] | undefined;
  editMessage: () => GatewayHandlers["editMessage"] | undefined;
  deleteMessage: () => GatewayHandlers["deleteMessage"] | undefined;
  /** The configured owner (a schedule with no channel DMs them). */
  owner: () => OwnerRecord | null;
  /** The model the progress footer names (DISCORD-3.a), as on a chat run. */
  model?: () => string | undefined;
  debounceMs?: number;
  tickMs?: number;
};

/** What a run's progress message shows once the run is over. */
type ProgressEnd = {
  /** A person stopped it: `⏹ Stopped`, its button cleared. */
  stopped: () => Promise<unknown>;
  /** Any other end: the progress message is removed. */
  over: () => Promise<unknown>;
};

/** The scheduler's stop control, and which running turns show their button in the owner's DM. */
export type ScheduleRunStopControl = ScheduleRunStop & {
  /**
   * True while run `runId` is a schedule run whose Stop button is in the
   * owner's DM (a schedule with no channel): a press on it has no channel to
   * allowlist (bridge.ts `pressStopButton`).
   */
  inOwnerDm(runId: string): boolean;
};

/**
 * AGENT-3.c (REQ-discord-304): the scheduler's stop control on the bridge's
 * `SessionRunControl`. `begin` resolves null when no Stop control went out
 * (no owner or DM for a schedule with no channel, the progress message or
 * the DM's button not sent, the bridge closing); the run then goes on
 * without one.
 */
export function createScheduleRunStop(deps: ScheduleRunStopDeps): ScheduleRunStopControl {
  const dmRuns = new Set<string>();
  return {
    async begin(input) {
      const sessionId = `${SCHEDULE_SESSION_PREFIX}${input.scheduleId}`;
      const content = scheduleRunProgressText(input.title);
      if (input.channelId) {
        return beginInChannel(deps, {
          sessionId,
          creatorId: input.creatorId,
          channelId: input.channelId,
          content,
        });
      }
      return beginInOwnerDm(deps, { sessionId, creatorId: input.creatorId, content }, dmRuns);
    },
    inOwnerDm: (runId) => dmRuns.has(runId),
  };
}

async function beginInChannel(
  deps: ScheduleRunStopDeps,
  input: { sessionId: string; creatorId: string; channelId: string; content: string },
): Promise<ScheduleRunStopHandle | null> {
  const turn = deps.runControl.enqueue({
    sessionId: input.sessionId,
    requesterId: input.creatorId,
    channelId: input.channelId,
  });
  if (!(await turn.ready)) {
    turn.done();
    return null;
  }
  const thinking = new ThinkingStatus({
    outbound: deps.outbound(),
    channelId: input.channelId,
    sessionId: input.sessionId,
    model: deps.model?.(),
    // AGENT-3.a (REQ-discord-303): the run's Stop button, as on a chat run.
    components: buildStopComponents(turn.runId),
    debounceMs: deps.debounceMs,
    tickMs: deps.tickMs,
  });
  try {
    await thinking.start({ description: input.content });
  } catch (err) {
    thinking.dispose();
    turn.done();
    throw err;
  }
  const messageId = thinking.progressMessageId;
  if (!messageId) {
    thinking.dispose();
    turn.done();
    return null;
  }
  // A reply 'stop' / 'cancel' to it, or its Stop button, stops the run.
  turn.setProgressMessage(messageId);
  return handleFor(turn, {
    stopped: () => thinking.fail(RUN_STOPPED_TEXT),
    over: () => thinking.discard(),
  });
}

async function beginInOwnerDm(
  deps: ScheduleRunStopDeps,
  input: { sessionId: string; creatorId: string; content: string },
  dmRuns: Set<string>,
): Promise<ScheduleRunStopHandle | null> {
  const ownerId = deps.owner()?.discordId?.trim();
  const send = deps.sendDm();
  const edit = deps.editMessage();
  if (!ownerId || !send || !edit) return null;
  // The DM channel is known only once the DM is out, and the button needs the
  // turn's run id: send the line, take the turn there, then add the button.
  const sent = await send({ userId: ownerId, content: input.content });
  if (!sent) return null;
  const at = { channelId: sent.channelId, messageId: sent.messageId };
  const remove = async () => {
    await deps.deleteMessage()?.(at);
  };
  const turn = deps.runControl.enqueue({
    sessionId: input.sessionId,
    requesterId: input.creatorId,
    channelId: sent.channelId,
  });
  if (!(await turn.ready)) {
    turn.done();
    await remove();
    return null;
  }
  const shown = await edit({
    ...at,
    content: input.content,
    components: buildStopComponents(turn.runId),
  });
  if (!shown) {
    turn.done();
    await remove();
    return null;
  }
  turn.setProgressMessage(sent.messageId);
  dmRuns.add(turn.runId);
  return handleFor(
    turn,
    {
      stopped: () => edit({ ...at, content: RUN_STOPPED_TEXT, components: null }),
      over: remove,
    },
    () => dmRuns.delete(turn.runId),
  );
}

/**
 * The run's handle: its turn's signal, and `finish`, which reads who stopped
 * it and releases the turn at once (so the window for a stop closes with the
 * run), then updates the progress message. Idempotent; never rejects.
 */
function handleFor(
  turn: SessionRunTurn,
  end: ProgressEnd,
  released?: () => void,
): ScheduleRunStopHandle {
  let finished: Promise<string | undefined> | undefined;
  return {
    signal: turn.signal,
    finish() {
      finished ??= (async () => {
        const stoppedBy = turn.stopReason === "stopped" ? turn.stoppedBy : undefined;
        turn.done();
        released?.();
        try {
          await (stoppedBy !== undefined ? end.stopped() : end.over());
        } catch (err) {
          console.warn(
            `[discord] schedule run ${turn.runId} (${turn.sessionId}): progress message not updated: ${formatErrorLine(err)}`,
          );
        }
        return stoppedBy;
      })();
      return finished;
    },
  };
}
