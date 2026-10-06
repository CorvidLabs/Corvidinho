/**
 * AGENT-3 / AGENT-3.a / AGENT-3.b — one run at a time per Discord session,
 * and 'stop' / 'cancel' (#122, REQ-discord-301 / REQ-discord-302).
 *
 * Every Discord run path (a chat message, an ask pick or Answer form submit,
 * `/session start`, `/work`) takes a turn on its session's queue before it
 * starts: a message sent while a run of that session is going waits for it,
 * first in first out, instead of starting a second run; runs of different
 * sessions still go in parallel. A waiting message gets no new indicator: it
 * waits silently and gets its normal progress message when its turn starts.
 *
 * Each turn has an AbortController whose signal the run passes to the spawn
 * client (`AgentRunChatOpts.signal`), which kills the run's whole process
 * tree (src/plugins/proc-group.ts), so a stopped run actually stops (AGENT-3).
 * The run's progress message is mapped to its turn, so a reply of 'stop' or
 * 'cancel' to that message reaches it (message-router.ts, `stop_run`).
 * `stop` is idempotent. A stop never drops waiting turns: they still run
 * after it, in order (AGENT-3.b). `close` (bridge stop) aborts every run in
 * flight and lets no waiting turn start. In-memory only: nothing is stored.
 *
 * AGENT-3.a Stop button (REQ-discord-303): each run's progress message
 * carries one danger-style **Stop** button (`buildStopComponents`, custom id
 * `cvstop:<runId>`) while the run goes; a press takes the same `stop` as the
 * stop words, from the requester or the owner only (bridge.ts `onComponent`).
 *
 * AGENT-3.c (REQ-discord-304): a schedule run the bridge's ticker starts
 * takes a turn here too (session `schedule_<id>`, the schedule's creator as
 * the requester, src/discord/schedule-stop.ts), so the owner or the creator
 * stops it with the same button and words.
 */

import type { DiscordActionRow } from "./ask-buttons.ts";

/** The final post of a run that was stopped (with the DISCORD-15/15.a footer). */
export const RUN_STOPPED_TEXT = "⏹ Stopped";

/** The one short ack to a 'stop' / 'cancel' that reached a run in flight. */
export const RUN_STOP_ACK = "⏹ Stopping the run.";

/** custom_id prefix of a run's Stop button (Discord custom_id ≤ 100). */
export const RUN_STOP_PREFIX = "cvstop";

/** The Stop button's label. */
export const RUN_STOP_LABEL = "Stop";

/** Ephemeral reply to a Stop press from anyone but the requester or the owner. */
export const RUN_STOP_NOT_YOURS = "This Stop button isn't for you.";

/** Ephemeral reply to a Stop press whose run is no longer going (a stale button). */
export const RUN_STOP_NOTHING_RUNNING = "Nothing is running.";

/** A run id as `enqueue` makes it (`run_<n>`). */
const RUN_ID_RE = /^run_[0-9]{1,15}$/;

/** `cvstop:<runId>`. Throws on a run id the parser would refuse. */
export function stopRunCustomId(runId: string): string {
  if (!RUN_ID_RE.test(runId)) throw new Error("run id is not a safe custom_id part");
  return `${RUN_STOP_PREFIX}:${runId}`;
}

/**
 * The run id of a Stop button's custom id (`cvstop:<runId>`); null for
 * anything else (an ask or card id, another prefix such as `cvstop-…`).
 */
export function parseStopRunCustomId(raw: string): string | null {
  const parts = raw.split(":");
  if (parts.length !== 2 || parts[0] !== RUN_STOP_PREFIX) return null;
  const runId = parts[1]!;
  return RUN_ID_RE.test(runId) ? runId : null;
}

/**
 * AGENT-3.a (REQ-discord-303): the progress message's one row — a single
 * danger-style (red, style 4) **Stop** button for run `runId`.
 */
export function buildStopComponents(runId: string): DiscordActionRow[] {
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 4, label: RUN_STOP_LABEL, custom_id: stopRunCustomId(runId) },
      ],
    },
  ];
}

/** 'stop' or 'cancel' as the whole message (any case, trailing `.` / `!` allowed). */
const STOP_RE = /^(stop|cancel)\s*[.!]*$/i;

/**
 * True when `text` (the message body without mentions, see
 * `promptBodyForAskGate`) is exactly 'stop' or 'cancel' (AGENT-3.a).
 */
export function isStopRunText(text: string): boolean {
  return STOP_RE.test(text.replace(/\s+/g, " ").trim());
}

/** Why a turn's signal was aborted: a person's stop, or the bridge closing. */
export type RunStopReason = "stopped" | "closed";

export type RunTurnInput = {
  sessionId: string;
  /** The Discord user whose message, pick or command this turn runs. */
  requesterId: string;
  /** Where the run posts its progress (the thread when the talk is in one). */
  channelId: string;
};

/** One turn on a session's queue. */
export type SessionRunTurn = {
  readonly runId: string;
  readonly sessionId: string;
  readonly requesterId: string;
  readonly channelId: string;
  /** Another turn of the session was running or waiting when this one was queued. */
  readonly waited: boolean;
  /**
   * Resolves true when it is this turn's go (at once when the session was
   * free), false when the control closed first or the turn was released.
   */
  readonly ready: Promise<boolean>;
  /** Aborted by `stop` or `close`; pass it to the run (kills its process tree). */
  readonly signal: AbortSignal;
  /** Set once the signal was aborted. */
  readonly stopReason: RunStopReason | undefined;
  /** The Discord user who stopped it. */
  readonly stoppedBy: string | undefined;
  /** The requester was forgotten (MEMORY-ACL-6) after this turn was queued. */
  readonly requesterForgotten: boolean;
  /** Map a progress message to this running turn (a reply 'stop' to it stops it). */
  setProgressMessage(messageId: string | null | undefined): void;
  /** Release the session's queue (idempotent; also before the turn started). */
  done(): void;
};

/** What `stop` did: stopped it now, it was already stopping, or nothing ran. */
export type RunStopOutcome = "stopped" | "already" | "none";

type TurnState = {
  turn: SessionRunTurn;
  controller: AbortController;
  running: boolean;
  released: boolean;
  stopReason?: RunStopReason;
  stoppedBy?: string;
  progressIds: string[];
  forgetEpoch: number;
};

export type SessionRunControlOptions = {
  /**
   * Called once a turn a person stopped has finished, e.g. to run an
   * Approve/Deny card pass so a card its killed run waited on closes as a no
   * at once (SAFE-20) instead of on the engine's next poll.
   */
  onStopped?: (turn: SessionRunTurn) => void;
};

export class SessionRunControl {
  /** session id → the end of its queue (resolves when its last turn is done). */
  private readonly tails = new Map<string, Promise<void>>();
  /** session id → the turn running now. */
  private readonly running = new Map<string, TurnState>();
  /** progress message id → the running turn it shows. */
  private readonly byProgress = new Map<string, TurnState>();
  /** run id → queued or running turn. */
  private readonly byRunId = new Map<string, TurnState>();
  /** Discord user id → how often they were forgotten (MEMORY-ACL-6). */
  private readonly forgetEpochs = new Map<string, number>();
  private closed = false;
  private seq = 0;
  private readonly onStopped?: (turn: SessionRunTurn) => void;

  constructor(opts: SessionRunControlOptions = {}) {
    this.onStopped = opts.onStopped;
  }

  /**
   * Queue a turn on the session. It starts at once when nothing of that
   * session is running or waiting; otherwise `ready` resolves when every
   * earlier turn of the session is done. Always call `done()` when finished.
   */
  enqueue(input: RunTurnInput): SessionRunTurn {
    const { sessionId } = input;
    const prev = this.tails.get(sessionId);
    let release!: () => void;
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prev ? prev.then(() => mine) : mine;
    this.tails.set(sessionId, tail);
    void tail.then(() => {
      if (this.tails.get(sessionId) === tail) this.tails.delete(sessionId);
    });

    this.seq += 1;
    const runId = `run_${this.seq}`;
    const controller = new AbortController();
    const self = this;
    const state: TurnState = {
      controller,
      running: false,
      released: false,
      progressIds: [],
      forgetEpoch: this.forgetEpochs.get(input.requesterId) ?? 0,
      turn: undefined as unknown as SessionRunTurn,
    };
    const start = (): boolean => {
      if (state.released || self.closed) return false;
      state.running = true;
      self.running.set(sessionId, state);
      return true;
    };
    const ready = prev ? prev.then(start) : Promise.resolve(start());
    state.turn = {
      runId,
      sessionId,
      requesterId: input.requesterId,
      channelId: input.channelId,
      waited: prev !== undefined,
      ready,
      signal: controller.signal,
      get stopReason() {
        return state.stopReason;
      },
      get stoppedBy() {
        return state.stoppedBy;
      },
      get requesterForgotten() {
        return (self.forgetEpochs.get(input.requesterId) ?? 0) !== state.forgetEpoch;
      },
      setProgressMessage(messageId) {
        if (!messageId || !state.running || state.released) return;
        state.progressIds.push(messageId);
        self.byProgress.set(messageId, state);
      },
      done() {
        if (state.released) return;
        state.released = true;
        const wasRunning = state.running;
        state.running = false;
        if (self.running.get(sessionId) === state) self.running.delete(sessionId);
        for (const id of state.progressIds) {
          if (self.byProgress.get(id) === state) self.byProgress.delete(id);
        }
        self.byRunId.delete(runId);
        release();
        if (wasRunning && state.stopReason === "stopped") {
          try {
            self.onStopped?.(state.turn);
          } catch (err) {
            console.warn(`[discord] after-stop hook for ${runId} failed:`, err);
          }
        }
      },
    };
    this.byRunId.set(runId, state);
    return state.turn;
  }

  /** The session's turn running now, if any. */
  current(sessionId: string): SessionRunTurn | undefined {
    return this.running.get(sessionId)?.turn;
  }

  /** The running turn whose progress message this is, if any. */
  byProgressMessage(messageId: string): SessionRunTurn | undefined {
    return this.byProgress.get(messageId)?.turn;
  }

  /** True while a turn of the session runs or waits. */
  busy(sessionId: string): boolean {
    return this.tails.has(sessionId);
  }

  /**
   * Stop the running turn `runId` (AGENT-3.a): abort its signal once, which
   * kills its process tree. Idempotent. A waiting turn is never stopped or
   * dropped (AGENT-3.b).
   */
  stop(runId: string, byUserId: string): RunStopOutcome {
    const state = this.byRunId.get(runId);
    if (!state || !state.running || state.released) return "none";
    if (state.stopReason) return "already";
    state.stopReason = "stopped";
    state.stoppedBy = byUserId;
    state.controller.abort();
    return "stopped";
  }

  /**
   * MEMORY-ACL-6: these users were forgotten; a turn of theirs still waiting
   * then does not run (`requesterForgotten`).
   */
  noteForgotten(userIds: readonly string[]): void {
    for (const raw of userIds) {
      const id = raw.trim();
      if (!id) continue;
      this.forgetEpochs.set(id, (this.forgetEpochs.get(id) ?? 0) + 1);
    }
  }

  /**
   * Bridge stop: abort every run in flight (its process tree is killed) and
   * let no waiting or later turn start. Idempotent.
   */
  close(): void {
    this.closed = true;
    for (const state of this.running.values()) {
      if (state.stopReason) continue;
      state.stopReason = "closed";
      state.controller.abort();
    }
  }

  /** Wait (at most `ms`) until every queued or running turn is done. */
  async settle(ms: number): Promise<void> {
    const end = Date.now() + ms;
    while (this.byRunId.size > 0 && Date.now() < end) {
      await Bun.sleep(10);
    }
  }
}
