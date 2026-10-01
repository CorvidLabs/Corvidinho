/**
 * Delegation core for the `delegate` autonomous tool (AUTONOMOUS-5, issue #117).
 *
 * A lead agent hands one skill-tagged subtask to a worker: a child
 * `corvidinho task run --here` (bun --no-env-file, non-interactive, NDJSON) in the
 * lead's cwd. Like every product spawn it never passes --no-verify
 * (REQ-cli-085): the worker proves its own edits through the project's verify
 * lane (AGENT-4), and its filesChanged also join the lead's result, so the
 * lead's gate covers the combined change. The worker's summary, tier, depth,
 * verify outcome and filesChanged come back for the lead to synthesize.
 *
 * Safety defaults (not HI claims — draft AUTONOMOUS-10 is not captured):
 * - a worker never runs above the lead's tier, and an omitted tier means the
 *   lead's tier, never a higher default (the Merlin m#1136 bug class);
 * - depth travels in CORVIDINHO_DELEGATE_DEPTH; a worker at depth 2 cannot
 *   delegate again, and a malformed depth fails closed (treated as the cap);
 * - at most 2 workers at once and 4 per lead process;
 * - workers are forced non-interactive, get the lead's effective SAFE-1
 *   allowlist and nothing more, never inherit ADMIN or human SAFE-4 confirm
 *   tokens, and are killed on abort, timeout or lead exit (AGENT-3) — each
 *   worker runs in its own process group and the whole tree goes (its
 *   plugins and depth-2 workers too), not just the worker pid;
 * - workers do not inherit bridge / GitHub tokens or the audit HMAC key
 *   (SAFE-6), only what a task run needs (LLM provider keys stay);
 * - a lead in a ROLES-CHAT role session gets a non-ADMIN worker (read/chat
 *   tools only, ROLES-CHAT-2/3); a lead outside one (local CLI) gets a worker
 *   outside one too, so the worker never has more power than the lead;
 * - a worker inherits the lead's turn cap and idle timeout
 *   (CORVIDINHO_MAX_TURNS / CORVIDINHO_IDLE_TIMEOUT_MS, AGENT-12), and the
 *   lead's idle watchdog is held while it runs.
 */

import { join } from "node:path";
import { collectTaskRunStream } from "../agent/events-ndjson.ts";
import { pauseIdleWatchdog } from "../agent/limits.ts";
import { modelFallbackFromUnknown } from "../agent/providers.ts";
import { buildCorvidinhoArgv } from "../agent/spawn-argv.ts";
import type { ModelFallback } from "../agent/types.ts";
import { injectionNoticeFromUnknown, type InjectionNotice } from "../agent/untrusted.ts";
import {
  TIER_RANK,
  parseCapabilityTier,
  type CapabilityTier,
} from "../agent/tier.ts";
import {
  collectProcessTree,
  killProcessTree,
  signalProcessTree,
  trackChildProcess,
  type ProcEntry,
} from "../plugins/proc-group.ts";
import { roleSessionActive } from "../plugins/roles.ts";
import { scrubSecrets } from "../store/scrub.ts";

/** Env var carrying how deep in a delegation chain this process runs. */
export const DELEGATE_DEPTH_ENV = "CORVIDINHO_DELEGATE_DEPTH";
/** Workers can be started at most this many levels below the lead. */
export const MAX_DELEGATE_DEPTH = 2;
/** Live workers per lead process. */
export const MAX_CONCURRENT_DELEGATES = 2;
/** Workers one lead process may start in total. */
export const MAX_DELEGATES_PER_RUN = 4;
/** Hard wall-clock cap per worker. */
export const DELEGATE_TIMEOUT_MS = 10 * 60 * 1000;
/** Cap on the worker summary handed back to the lead. */
export const DELEGATE_SUMMARY_MAX = 4000;
/** Cap on worker-reported filesChanged entries passed back to the lead. */
export const DELEGATE_FILES_MAX = 200;
/** Cap on the subtask text handed to a worker. */
export const DELEGATE_TASK_MAX = 8000;
/** Plugin minTier for `delegate`: code tier only, hidden from small models (SAFE-9). */
export const DELEGATE_MIN_TIER = 2;

const SKILL_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/**
 * Current delegation depth. Unset / empty ⇒ 0 (a top-level run). Anything that
 * is not a plain non-negative integer fails closed to the cap so a garbled
 * value can never reopen delegation.
 */
export function delegateDepthFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env[DELEGATE_DEPTH_ENV];
  if (raw == null || raw.trim() === "") return 0;
  const s = raw.trim();
  if (!/^\d{1,3}$/.test(s)) return MAX_DELEGATE_DEPTH;
  return Number.parseInt(s, 10);
}

/** True while this process may still start workers. */
export function canDelegateAtDepth(depth: number): boolean {
  return Number.isInteger(depth) && depth >= 0 && depth < MAX_DELEGATE_DEPTH;
}

export type TierClamp =
  | { ok: true; tier: CapabilityTier; clamped: boolean }
  | { ok: false; error: string };

/**
 * Worker tier: requested tier, but never above the lead's. Omitted ⇒ the
 * lead's tier (not the global `tool` default). Unknown names are refused.
 */
export function clampChildTier(
  parent: CapabilityTier,
  requested?: string,
): TierClamp {
  if (requested == null || requested.trim() === "") {
    return { ok: true, tier: parent, clamped: false };
  }
  const s = requested.trim().toLowerCase();
  if (s !== "read" && s !== "tool" && s !== "code") {
    return {
      ok: false,
      error: `unknown tier "${requested.trim().slice(0, 32)}" (read|tool|code)`,
    };
  }
  const want = parseCapabilityTier(s, parent);
  if (TIER_RANK[want] > TIER_RANK[parent]) {
    return { ok: true, tier: parent, clamped: true };
  }
  return { ok: true, tier: want, clamped: false };
}

export type DelegateArgs = {
  task: string;
  skill?: string;
  tier?: string;
};

/**
 * Parse `delegate` argv: `--skill NAME`, `--tier read|tool|code`,
 * `--task TEXT` (always the next item, even when it starts with `-`), and any
 * remaining positionals joined as the task text.
 */
export function parseDelegateArgs(
  args: readonly string[],
): { ok: true; value: DelegateArgs } | { ok: false; error: string } {
  let task: string | undefined;
  let skill: string | undefined;
  let tier: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i]);
    const eq = a.match(/^--(task|skill|tier)=(.*)$/s);
    if (eq) {
      if (eq[1] === "task") task = eq[2];
      else if (eq[1] === "skill") skill = eq[2];
      else tier = eq[2];
      continue;
    }
    if (a === "--task" || a === "--skill" || a === "--tier") {
      if (i + 1 >= args.length) {
        return { ok: false, error: `${a} needs a value` };
      }
      const v = String(args[i + 1]);
      i++;
      if (a === "--task") task = v;
      else if (a === "--skill") skill = v;
      else tier = v;
      continue;
    }
    if (a.startsWith("--")) {
      return { ok: false, error: `unknown flag ${a.slice(0, 40)}` };
    }
    positional.push(a);
  }
  const text = (task ?? positional.join(" ")).trim();
  if (!text) {
    return { ok: false, error: "missing subtask text (--task TEXT)" };
  }
  if (text.length > DELEGATE_TASK_MAX) {
    return {
      ok: false,
      error: `subtask text too long (${text.length} > ${DELEGATE_TASK_MAX} chars)`,
    };
  }
  let skillNorm: string | undefined;
  if (skill != null && skill.trim() !== "") {
    skillNorm = skill.trim().toLowerCase();
    if (!SKILL_RE.test(skillNorm)) {
      return {
        ok: false,
        error: "skill must be a short label: letters, digits, - or _ (max 32)",
      };
    }
  }
  return {
    ok: true,
    value: {
      task: text,
      ...(skillNorm ? { skill: skillNorm } : {}),
      ...(tier != null && tier.trim() !== "" ? { tier } : {}),
    },
  };
}

/** Task text a worker receives: provenance header + the lead's subtask. */
export function buildDelegateTaskText(opts: {
  task: string;
  skill?: string;
  childDepth: number;
}): string {
  const head =
    `[Delegated subtask from a lead Corvidinho agent` +
    (opts.skill ? ` — skill: ${opts.skill}` : "") +
    ` — worker depth ${opts.childDepth}/${MAX_DELEGATE_DEPTH}]`;
  return (
    `${head}\n${opts.task}\n\n` +
    "Do only this subtask. Finish with a concise plain-text summary the lead can synthesize."
  );
}

/** Entrypoint a worker runs: the operator's CORVIDINHO_BIN, else this checkout's CLI. */
export function resolveDelegateBin(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.CORVIDINHO_BIN?.trim();
  if (fromEnv) return fromEnv;
  // Never the project cwd's src/cli.ts: the cwd is an arbitrary worktree.
  return join(import.meta.dir, "..", "cli.ts");
}

/** Inherited env keys a worker never gets (SAFE-6): bridge / GitHub tokens, audit key. */
const WORKER_ENV_DROP = new Set([
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "CORVIDINHO_AUDIT_HMAC_KEY",
]);
/** Inherited env key prefixes a worker never gets: Discord bot config, acting identity. */
const WORKER_ENV_DROP_PREFIXES = ["DISCORD_", "CORVIDINHO_ACTING_"];

/** True when an inherited env key must not reach a worker. */
export function isWorkerEnvDropped(key: string): boolean {
  if (WORKER_ENV_DROP.has(key)) return true;
  return WORKER_ENV_DROP_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * argv + env for one worker spawn. The worker env is the lead's minus
 * {@link isWorkerEnvDropped} keys; forced keys always win over inherited env.
 */
export function buildDelegateSpawn(opts: {
  bin: string;
  taskText: string;
  tier: CapabilityTier;
  childDepth: number;
  allowlist: ReadonlySet<string> | readonly string[];
  baseEnv?: NodeJS.ProcessEnv;
}): { cmd: string[]; env: Record<string, string> } {
  const cmd = buildCorvidinhoArgv(opts.bin, [
    "task",
    "run",
    // SESSION-WORKTREE-1.a (REQ-cli-122): the worker works in its lead's cwd,
    // never in a nested worktree of its own.
    "--here",
    "--non-interactive",
    "--tier",
    opts.tier,
    "--output",
    "ndjson",
    // Last, so the (model-written) subtask is always task text, never a flag.
    "--task",
    opts.taskText,
  ]);
  const baseEnv = opts.baseEnv ?? process.env;
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(baseEnv)) {
    if (typeof v === "string" && !isWorkerEnvDropped(k)) env[k] = v;
  }
  Object.assign(env, {
    [DELEGATE_DEPTH_ENV]: String(opts.childDepth),
    CORVIDINHO_LLM_TIER: opts.tier,
    CORVIDINHO_NON_INTERACTIVE: "1",
    // The lead's effective SAFE-1 allowlist — never a wider env one.
    CORVIDINHO_ALLOWLIST: [...opts.allowlist].join(","),
  });
  // Workers never act as ADMIN or complete a human SAFE-4 confirm (the
  // CORVIDINHO_ACTING_* keys were dropped above). A lead in a role session
  // gets a non-ADMIN worker: read/chat tools only (ROLES-CHAT-2/3).
  if (roleSessionActive(baseEnv)) env.CORVIDINHO_ACTING_IS_ADMIN = "0";
  return { cmd, env };
}

export type DelegateSlot = { release: () => void };

export type DelegateLimiter = {
  tryAcquire(): { ok: true; slot: DelegateSlot } | { ok: false; error: string };
  readonly active: number;
  readonly started: number;
};

/** Concurrency + per-run fan-out cap. Refuses instead of queueing. */
export function createDelegateLimiter(
  opts: { maxConcurrent?: number; maxTotal?: number } = {},
): DelegateLimiter {
  const maxConcurrent = opts.maxConcurrent ?? MAX_CONCURRENT_DELEGATES;
  const maxTotal = opts.maxTotal ?? MAX_DELEGATES_PER_RUN;
  let active = 0;
  let started = 0;
  return {
    tryAcquire() {
      if (started >= maxTotal) {
        return {
          ok: false,
          error: `delegation budget used: ${maxTotal} workers per run`,
        };
      }
      if (active >= maxConcurrent) {
        return {
          ok: false,
          error: `too many workers running (max ${maxConcurrent} at once)`,
        };
      }
      active += 1;
      started += 1;
      let released = false;
      return {
        ok: true,
        slot: {
          release() {
            if (released) return;
            released = true;
            active -= 1;
          },
        },
      };
    },
    get active() {
      return active;
    },
    get started() {
      return started;
    },
  };
}

export type DelegateChildOutcome = {
  exitCode: number;
  state: string;
  summary: string;
  filesChanged: string[];
  /** Worker's prove-before-done outcome, when it reported a result. */
  verified?: boolean;
  verifySkipped?: boolean;
  /**
   * The worker's own result `summary` (SAFE-6 scrubbed, capped at
   * DELEGATE_SUMMARY_MAX rather than the 1800-char chat body), when it
   * reported a result. Councils quote this.
   */
  resultText?: string;
  totalTokens?: number;
  timedOut: boolean;
  aborted: boolean;
  /**
   * SAFE-13: one of the worker's own tool results looked like a
   * prompt-injection attempt (validated tool name + reason ids from its
   * result frame). The lead treats it as its own hit.
   */
  injection?: InjectionNotice;
  /**
   * AGENT-11: the worker's own model failovers (validated from its result
   * frame). The lead reports them as its own run's, marked `via`.
   */
  modelFallback?: ModelFallback[];
};

/** After a worker exits (or is killed), how long its pipes may still drain. */
export const DELEGATE_DRAIN_MS = 1000;
/** After SIGTERM, how long before SIGKILL. */
export const DELEGATE_KILL_GRACE_MS = 2000;

/**
 * Wrap a child pipe so we can end it ourselves: a grandchild that inherited
 * the pipe must not keep the lead waiting after the worker is gone.
 */
function endable(src: ReadableStream<Uint8Array> | null | undefined): {
  stream: ReadableStream<Uint8Array> | null;
  end: () => void;
} {
  if (!src) return { stream: null, end: () => {} };
  const reader = src.getReader();
  let ended = false;
  let ctrl: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
    async pull(c) {
      if (ended) return;
      let r: { done: boolean; value?: Uint8Array };
      try {
        r = await reader.read();
      } catch {
        r = { done: true };
      }
      if (ended) return;
      if (r.done || !r.value) {
        ended = true;
        c.close();
        return;
      }
      c.enqueue(r.value);
    },
    cancel(reason) {
      ended = true;
      return reader.cancel(reason).catch(() => {});
    },
  });
  const end = () => {
    if (ended) return;
    ended = true;
    try {
      ctrl?.close();
    } catch {
      /* already closed */
    }
    reader.cancel().catch(() => {});
  };
  return { stream, end };
}

function spawnWorker(cmd: string[], cwd: string, env: Record<string, string>) {
  return Bun.spawn(cmd, {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    // Own process group: stopping the worker stops everything it started.
    detached: true,
  });
}

/** Spawn one worker and collect its NDJSON result. Never throws on child failure. */
export async function runDelegateChild(opts: {
  bin: string;
  cwd: string;
  taskText: string;
  tier: CapabilityTier;
  childDepth: number;
  allowlist: ReadonlySet<string> | readonly string[];
  baseEnv?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<DelegateChildOutcome> {
  if (opts.signal?.aborted) {
    return {
      exitCode: 130,
      state: "cancelled",
      summary: "worker not started: lead run was interrupted",
      filesChanged: [],
      timedOut: false,
      aborted: true,
    };
  }
  const { cmd, env } = buildDelegateSpawn(opts);
  let proc: ReturnType<typeof spawnWorker>;
  try {
    proc = spawnWorker(cmd, opts.cwd, env);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      exitCode: 127,
      state: "failed",
      summary: scrubSecrets(`worker failed to start: ${msg}`).slice(0, DELEGATE_SUMMARY_MAX),
      filesChanged: [],
      timedOut: false,
      aborted: false,
    };
  }
  // Tree seen at SIGTERM, or left in the worker's group as it exited:
  // grandchildren orphaned by the worker's exit are still found by a later
  // stop (SIGKILL sweep, abort during the drain, lead exit).
  let seen: ProcEntry[] = [];
  // Killed with its whole tree if the lead exits or is interrupted.
  const untrack = trackChildProcess(proc.pid, () => seen);
  const stdout = endable(proc.stdout);
  const stderr = endable(proc.stderr);
  let timedOut = false;
  let aborted = false;
  let stopping = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const hardKill = () => {
    seen = killProcessTree(proc.pid, { known: seen });
  };
  const kill = () => {
    if (stopping) return;
    stopping = true;
    seen = signalProcessTree(proc.pid, "SIGTERM", { known: seen });
    timers.push(setTimeout(hardKill, DELEGATE_KILL_GRACE_MS));
  };
  timers.push(
    setTimeout(() => {
      timedOut = true;
      kill();
    }, opts.timeoutMs ?? DELEGATE_TIMEOUT_MS),
  );
  const onAbort = () => {
    aborted = true;
    kill();
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  const exitedP = proc.exited.then((code) => {
    seen = collectProcessTree(proc.pid, { rootJustExited: true, known: seen });
    // Stopped by timeout / abort: nothing of the tree outlives the limit.
    if (stopping) hardKill();
    timers.push(
      setTimeout(() => {
        stdout.end();
        stderr.end();
      }, DELEGATE_DRAIN_MS),
    );
    return code;
  });
  // AGENT-12: the lead's idle watchdog is held while its worker runs — the
  // worker inherits CORVIDINHO_IDLE_TIMEOUT_MS / CORVIDINHO_MAX_TURNS and
  // stops itself, and the worker timeout above bounds the wait.
  const resumeIdle = pauseIdleWatchdog();
  try {
    const out = await collectTaskRunStream({
      stdout: stdout.stream,
      stderr: stderr.stream,
      exited: exitedP,
    });
    const r = out.result;
    const filesChanged = Array.isArray(r?.filesChanged)
      ? r.filesChanged
          .filter((f): f is string => typeof f === "string" && f.length > 0 && f.length <= 1024)
          .slice(0, DELEGATE_FILES_MAX)
      : [];
    let summary = scrubSecrets(out.summary).slice(0, DELEGATE_SUMMARY_MAX);
    if (timedOut) summary = `worker timed out and was stopped\n${summary}`;
    else if (aborted) summary = `worker stopped: lead run was interrupted\n${summary}`;
    const outcome: DelegateChildOutcome = {
      exitCode: out.exitCode,
      state: timedOut || aborted ? "cancelled" : (r?.state ?? "failed"),
      summary,
      filesChanged,
      timedOut,
      aborted,
    };
    if (typeof r?.verified === "boolean") outcome.verified = r.verified;
    const injection = injectionNoticeFromUnknown(r?.injection);
    if (injection) outcome.injection = injection;
    const modelFallback = modelFallbackFromUnknown(r?.modelFallback);
    if (modelFallback) outcome.modelFallback = modelFallback;
    if (typeof r?.verifySkipped === "boolean") outcome.verifySkipped = r.verifySkipped;
    if (typeof r?.summary === "string") {
      outcome.resultText = scrubSecrets(r.summary).trim().slice(0, DELEGATE_SUMMARY_MAX);
    }
    if (out.totalTokens !== undefined) outcome.totalTokens = out.totalTokens;
    return outcome;
  } finally {
    resumeIdle();
    for (const t of timers) clearTimeout(t);
    opts.signal?.removeEventListener("abort", onAbort);
    if (stopping) hardKill();
    untrack();
  }
}
