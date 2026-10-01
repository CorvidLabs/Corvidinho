/**
 * AGENT-12 — an idle timeout and a turn cap that I set stop stalled or
 * endless runs, and it says so (REQ-agent-244, REQ-agent-312).
 *
 * Turn cap — `CORVIDINHO_MAX_TURNS`: model↔tool rounds per execute attempt
 * (today's `maxToolRounds`, default 8). It is per attempt, so the AGENT-4.a
 * verify retries are kept; a run's `stopReason` is `turn-cap` only when its
 * final attempt hit the cap. The attempt ends with its best prose so far
 * (AGENT-9).
 *
 * Idle timeout — `CORVIDINHO_IDLE_TIMEOUT_MS`: one watchdog per run
 * (default 600000, 10 minutes). The run's output resets it: every event the
 * run emits (what the CLI prints or streams), tool process output and the
 * verify lane's output. It pauses while a model call is in flight (that call
 * has its own per-request cap), while a `delegate` or `council` worker runs
 * (the worker carries the same limits itself) and while the run waits on an
 * Approve card. After that long with no output the run's abort signal fires
 * (tool and verify-lane process trees are killed, REQ-agent-244) and the run
 * ends failed with `stopReason` `idle-timeout` and a one-line `error`.
 *
 * The watchdog is bound to its run with AsyncLocalStorage, so tool output,
 * model calls and card waits deep inside the run reach it without plumbing;
 * outside a run every hook here does nothing.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { TaskStopReason } from "./types.ts";

/** The turn cap I set: model↔tool rounds per execute attempt (AGENT-12). */
export const MAX_TURNS_ENV = "CORVIDINHO_MAX_TURNS";

/** The idle timeout I set, in milliseconds (AGENT-12). */
export const IDLE_TIMEOUT_ENV = "CORVIDINHO_IDLE_TIMEOUT_MS";

/** Rounds per attempt when `CORVIDINHO_MAX_TURNS` is unset (today's cap). */
export const DEFAULT_MAX_TURNS = 8;

/** No output for this long stops a run when `CORVIDINHO_IDLE_TIMEOUT_MS` is unset (10 min). */
export const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * The longest delay a timer keeps (2^31 − 1 ms, about 24.8 days); a larger
 * setting is clamped to it, never wrapped into an instant stop.
 */
export const MAX_IDLE_TIMEOUT_MS = 2_147_483_647;

/** One limit read from the env: the value in force, and whether the setting was ignored. */
export type LimitSetting = {
  value: number;
  /** The env key was set but is not a positive whole number, so the default is used. */
  invalid: boolean;
};

/** A positive whole number (digits only), else null. */
function positiveWhole(raw: string | undefined): number | null | "unset" {
  const text = raw?.trim() ?? "";
  if (!text) return "unset";
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * The turn cap in force: `CORVIDINHO_MAX_TURNS` when it is a positive whole
 * number, else {@link DEFAULT_MAX_TURNS} (blank = unset; anything else is
 * ignored and reported as `invalid`).
 */
export function maxTurnsFromEnv(env: NodeJS.ProcessEnv = process.env): LimitSetting {
  const n = positiveWhole(env[MAX_TURNS_ENV]);
  if (n === "unset") return { value: DEFAULT_MAX_TURNS, invalid: false };
  if (n === null) return { value: DEFAULT_MAX_TURNS, invalid: true };
  return { value: n, invalid: false };
}

/**
 * The idle timeout in force: `CORVIDINHO_IDLE_TIMEOUT_MS` when it is a
 * positive whole number (clamped to {@link MAX_IDLE_TIMEOUT_MS}), else
 * {@link DEFAULT_IDLE_TIMEOUT_MS} (blank = unset; anything else is ignored
 * and reported as `invalid`). There is no value that turns it off.
 */
export function idleTimeoutFromEnv(env: NodeJS.ProcessEnv = process.env): LimitSetting {
  const n = positiveWhole(env[IDLE_TIMEOUT_ENV]);
  if (n === "unset") return { value: DEFAULT_IDLE_TIMEOUT_MS, invalid: false };
  if (n === null) return { value: DEFAULT_IDLE_TIMEOUT_MS, invalid: true };
  return { value: Math.min(n, MAX_IDLE_TIMEOUT_MS), invalid: false };
}

/** The operator line for an ignored setting (no value echoed). */
export function invalidLimitNote(key: string, fallback: number): string {
  return `[operator] AGENT-12: ${key} is not a positive whole number, so the default ${fallback} is used.`;
}

/** `10 minutes`, `90 seconds`, `1500 ms`. */
export function formatIdleDuration(ms: number): string {
  if (ms >= 60_000 && ms % 60_000 === 0) {
    const m = ms / 60_000;
    return `${m} minute${m === 1 ? "" : "s"}`;
  }
  if (ms >= 1000 && ms % 1000 === 0) {
    const s = ms / 1000;
    return `${s} second${s === 1 ? "" : "s"}`;
  }
  return `${ms} ms`;
}

/**
 * The one line an idle-timed-out run says (its `error`, and the head of its
 * summary), e.g. `Stopped: no output for 10 minutes (idle timeout).`
 */
export function idleTimeoutLine(timeoutMs: number): string {
  return `Stopped: no output for ${formatIdleDuration(timeoutMs)} (idle timeout).`;
}

/**
 * The plain note a turn-capped run carries on a WATCH comment and the CLI's
 * human output; on Discord the cap shows only as `stopped=turn-cap` in the
 * footer plumbing (AGENT-9, DISCORD-3.a). An idle-timed-out run needs no
 * note there: its summary starts with {@link idleTimeoutLine}.
 */
export const TURN_CAP_NOTE =
  "Stopped: it reached the turn cap before it finished, so this is its best answer so far.";

/** A result frame's `stopReason`, when it is one this build knows. */
export function stopReasonFromUnknown(v: unknown): TaskStopReason | undefined {
  return v === "turn-cap" || v === "idle-timeout" ? v : undefined;
}

/** One run's idle watchdog (AGENT-12). */
export type IdleWatchdog = {
  readonly timeoutMs: number;
  /** Aborts once the run had no output for `timeoutMs` while not paused. */
  readonly signal: AbortSignal;
  /** The watchdog stopped the run. */
  readonly fired: boolean;
  /** Output happened: start the wait again (ignored while paused). */
  touch(): void;
  /**
   * Hold the watchdog (a model call, a worker, an Approve card); pauses
   * nest. The returned resume (idempotent) starts the full wait again once
   * nothing holds it.
   */
  pause(): () => void;
  /** The run ended: never fire. */
  stop(): void;
};

export type IdleWatchdogTimers = {
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
};

const realTimers: IdleWatchdogTimers = {
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Start a run's watchdog; it fires after `timeoutMs` with no output. */
export function startIdleWatchdog(
  timeoutMs: number,
  timers: IdleWatchdogTimers = realTimers,
): IdleWatchdog {
  const ms = Math.min(Math.max(1, Math.floor(timeoutMs)), MAX_IDLE_TIMEOUT_MS);
  const ctrl = new AbortController();
  let handle: unknown;
  let paused = 0;
  let stopped = false;
  const disarm = () => {
    if (handle !== undefined) timers.clearTimer(handle);
    handle = undefined;
  };
  const arm = () => {
    disarm();
    if (stopped || paused > 0 || ctrl.signal.aborted) return;
    handle = timers.setTimer(() => {
      handle = undefined;
      if (stopped || paused > 0) return;
      ctrl.abort(new Error(idleTimeoutLine(ms)));
    }, ms);
  };
  arm();
  return {
    timeoutMs: ms,
    signal: ctrl.signal,
    get fired() {
      return ctrl.signal.aborted;
    },
    touch() {
      if (paused === 0) arm();
    },
    pause() {
      paused += 1;
      disarm();
      let resumed = false;
      return () => {
        if (resumed) return;
        resumed = true;
        paused -= 1;
        if (paused === 0) arm();
      };
    },
    stop() {
      stopped = true;
      disarm();
    },
  };
}

const current = new AsyncLocalStorage<IdleWatchdog>();

/** Run `fn` with `watchdog` as the current run's watchdog. */
export function withIdleWatchdog<T>(watchdog: IdleWatchdog, fn: () => T): T {
  return current.run(watchdog, fn);
}

/** Output happened in the current run (none: nothing to do). */
export function noteIdleActivity(): void {
  current.getStore()?.touch();
}

/** Hold the current run's watchdog; call the result to resume (none: a no-op). */
export function pauseIdleWatchdog(): () => void {
  return current.getStore()?.pause() ?? (() => {});
}

/** `fn` with the current run's watchdog held (a model call, a worker, a card wait). */
export async function whileIdlePaused<T>(fn: () => Promise<T>): Promise<T> {
  const resume = pauseIdleWatchdog();
  try {
    return await fn();
  } finally {
    resume();
  }
}
