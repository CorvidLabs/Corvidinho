/**
 * Cooperative scheduler ticker (DISCORD-SCHEDULE-3/4).
 * DISCORD-SCHEDULE-3: each run re-checks its creator (live actor gate) and
 * channel against the current allowlist before it starts and before it posts.
 * Steal ADR-001: ~60s poll, max concurrent 2, no catch-up, auto-pause @ 5 fails.
 * Tick MUST return without awaiting agent work so HEAR/WATCH ingress is not starved.
 * SESSION-WORKTREE: each tick uses the schedule's project worktree/scope.
 * CLI-8 / AUTONOMOUS-4: the same ticker runs inside the Discord bridge and in
 * `corvidinho daemon`; each tick re-reads SQLite and claims a due run
 * atomically, so two tickers on one data dir fire it once.
 * REQ-discord-346: a run never stays "running" forever — an outcome write is
 * retried once, stops abandon in-flight runs and let them park their
 * worktree, and a start recovers runs and worktrees a dead process left.
 * REQ-discord-347 (AUTONOMY-2 / AUTONOMOUS-7): a run's ask is recorded on its
 * run row; a ticker with no Discord (the daemon) leaves it pending, and a
 * bridge tick posts it once without waiting for the post.
 * REQ-discord-353 (AUTONOMY-2): a run that cannot start (project resolve or
 * worktree failure) and a run that auto-pauses its schedule record a stuck
 * ask the same way, so the owner hears about it instead of the schedule
 * dying silently.
 * OPS-1/2 (#68): the nightly backup and weekly restore test (src/store/
 * backup.ts) ride the same tick in the bridge and the daemon; the backup
 * claims its night in SQLite, so two tickers on one data dir back up once.
 * SAFE-12 / SAFE-13 (#71): a schedule's text is its creator's words. On every
 * tick the creator's role is resolved again; for anyone but the owner the
 * stored name / description / prompt are scanned (a hit runs nothing, pauses
 * the schedule and tells the owner once) and the prompt reaches the model
 * inside the untrusted-data fence. The owner's own schedules are unchanged.
 */

import { basename } from "node:path";
import type { AllowlistConfig } from "../allowlist/types.ts";
import { checkChannel } from "../allowlist/discord.ts";
import type { AuditEntryInput } from "../audit/index.ts";
import type { AgentClient } from "../discord/agent-client.ts";
import { projectLabel } from "../discord/list-scope.ts";
import { gateActor, resolveDiscordActingRole } from "../discord/permissions.ts";
import {
  ASK_NO_OWNER_WARNING,
  askPingKey,
  clipPostSummary,
  formatAskReply,
  withSpendWarningPost,
} from "../discord/ask-ping.ts";
import { askPingOwner, takeSpendWarning } from "../discord/spend-post.ts";
import {
  auditInboundInjection,
  fenceSpeakerText,
  inboundInjection,
  withInjectionNotice,
} from "../discord/injection-guard.ts";
import {
  describeInjectionReasons,
  INJECTION_REASONS,
  type InjectionNotice,
  type InjectionReason,
  type InjectionVerdict,
} from "../agent/untrusted.ts";
import type { SpendAlertOutbox } from "../agent/spend-outbox.ts";
import type { HumanAsk, HumanAskReason, SpendWarning } from "../agent/types.ts";
import type { OwnerRecord } from "../identity/owner.ts";
import { loadDeclaredPeople, type PersonRole } from "../identity/people.ts";
import type { BackupTicker } from "../store/backup.ts";
import { scrubSecrets } from "../store/scrub.ts";
import {
  ensureTalkWorkspace,
  isGitRepo,
  parkWorktree,
  resolveProjectDir,
} from "../worktree/index.ts";
import type { Schedule, ScheduleRun, ScheduleStore } from "./store.ts";

export const DEFAULT_POLL_INTERVAL_MS = 60_000;
export const DEFAULT_MAX_CONCURRENT = 2;
export const FAILURE_AUTO_PAUSE = 5;
/**
 * How long a stop waits, after aborting abandoned runs, for them to park
 * their worktree and branch (REQ-discord-346). Short and bounded: the agent
 * tree is already killed; what is left is `git worktree remove`.
 */
export const ABANDONED_SETTLE_MS = 3_000;

/**
 * Stuck-ask questions for a run that could not start (REQ-discord-353,
 * AUTONOMY-2). Fixed text: the resolve / worktree error names host paths,
 * so it stays in the run row's `error` (and the daemon's `run.finished`
 * log), never in a channel post (REQ-discord-418). Fixed text also lets
 * `askPingKey` ping the owner once while the same failure repeats.
 */
export const PROJECT_RESOLVE_FAILED_QUESTION =
  "Could not start this run: the schedule's project could not be resolved.";
export const WORKTREE_FAILED_QUESTION =
  "Could not start this run: its worktree could not be created.";

/**
 * The stuck ask a run records when its failure auto-pauses the schedule
 * (REQ-discord-353, AUTONOMY-2): it says the schedule is paused and how to
 * resume it (the existing ADMIN `/schedule resume`), plus the run's own
 * question when it stopped with one.
 */
export function autoPauseAsk(last?: HumanAsk): HumanAsk {
  const paused = `Paused after ${FAILURE_AUTO_PAUSE} failed runs in a row. Fix the cause, then resume it with /schedule resume.`;
  const lastQuestion = last?.question.trim();
  return {
    reason: "stuck",
    question: lastQuestion ? `${paused}\nLast failure: ${lastQuestion}` : paused,
  };
}

/**
 * SAFE-13 (#71) — the detector's verdict on a schedule's own text (its name,
 * description and prompt: what its creator wrote), or null when the creator
 * is the owner (their words are the principal's) or nothing tripped. Used at
 * `/schedule create` and again on every tick.
 */
export function scheduleInjection(
  text: { name?: string; description?: string; prompt?: string },
  role: PersonRole,
): InjectionVerdict | null {
  const hit = new Set<InjectionReason>();
  for (const part of [text.name, text.description, text.prompt]) {
    if (!part) continue;
    for (const reason of inboundInjection(part, role)?.reasons ?? []) hit.add(reason);
  }
  if (hit.size === 0) return null;
  return { suspected: true, reasons: INJECTION_REASONS.filter((r) => hit.has(r)) };
}

/**
 * SAFE-13 (#71) — the stuck question a tick records when a schedule's stored
 * text trips the detector: what happened and why in plain words, never the
 * text. Fixed wording, so `askPingKey` pings the owner once for it.
 */
export function injectedScheduleQuestion(reasons: readonly InjectionReason[]): string {
  return (
    `🛡️ I didn't run this schedule: its text looks like a prompt-injection attempt (it ${describeInjectionReasons(reasons)}). ` +
    "I paused it; /schedule delete removes it. (SAFE-13)"
  );
}

/** Worktree dir of a schedule run: `talk-schedule_<schedule id>_<run id>`. */
const RUN_WORKTREE_RE = /^talk-(schedule_[A-Za-z0-9_-]+_(srun_[A-Za-z0-9]+))$/;

/** Name part of a run's worktree (`talk-<key>`) and branch (`talk/<key>`). */
function runWorktreeKey(scheduleId: string, runId: string): string {
  return `schedule_${scheduleId}_${runId}`.replace(/[^a-zA-Z0-9_-]/g, "");
}

/**
 * Leading line of a schedule's Discord post (result and ask posts). The whole
 * channel reads it, so the project is shown by name (`projectLabel`: the last
 * segment of an absolute path, a relative name as given), never as an
 * absolute host path (REQ-discord-353, REQ-discord-418, SAFE-6). The model's
 * prompt keeps the stored project.
 */
function scheduleTitle(schedule: Schedule): string {
  const project = projectLabel(schedule.project) ?? "";
  return `Schedule **${schedule.name}** (\`${schedule.id.slice(0, 12)}\`) on \`${project}\``;
}

/** One scrubbed line (SAFE-6), capped, never a stack. Never throws. */
function errorLine(err: unknown): string {
  try {
    const msg = String(err instanceof Error ? err.message : err);
    return scrubSecrets(msg).replace(/\s+/g, " ").trim().slice(0, 500);
  } catch {
    return "(unprintable error)";
  }
}

/**
 * Log a tick or run error that nothing else would catch (REQ-discord-331).
 * Only the scrubbed message is logged (SAFE-6), on one line, never a stack.
 * Never throws: it runs in the `.catch` that keeps these promises from
 * rejecting.
 */
function logSchedulerError(where: "tick" | "tick hook" | "run" | "recovery" | "ask", err: unknown): void {
  console.error(`[scheduler] ${where} failed: ${errorLine(err)}`);
}

/** Schedule-run worktrees (and their branch) registered in `projectDir`'s repo. */
async function listScheduleRunWorktrees(
  projectDir: string,
): Promise<Array<{ path: string; key: string; runId: string; branchName: string }>> {
  const proc = Bun.spawn(["git", "worktree", "list", "--porcelain"], {
    cwd: projectDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if ((await proc.exited) !== 0) return [];
  const found: Array<{ path: string; key: string; runId: string; branchName: string }> = [];
  for (const block of out.split("\n\n")) {
    const lines = block.split("\n");
    const path = lines.find((l) => l.startsWith("worktree "))?.slice(9);
    const branch = lines
      .find((l) => l.startsWith("branch refs/heads/"))
      ?.slice("branch refs/heads/".length);
    const m = path ? RUN_WORKTREE_RE.exec(basename(path)) : null;
    // Only the exact names runOne gives a run's worktree and branch.
    if (!path || !m || branch !== `talk/${m[1]}`) continue;
    found.push({ path, key: m[1]!, runId: m[2]!, branchName: branch });
  }
  return found;
}

export type SchedulerOutbound = {
  /**
   * Post schedule result to a Discord channel (optional). Resolving `false`
   * means the post did not go out (a claimed spend warning is handed back).
   */
  post?: (opts: {
    channelId: string;
    content: string;
    /** Only these users may be pinged (AUTONOMY-2 owner ping). */
    mentionUserIds?: string[];
  }) => Promise<void | boolean>;
};

/** One finished (or abandoned) schedule run, for operator logs. */
export type ScheduleRunFinished = {
  scheduleId: string;
  runId: string;
  ok: boolean;
  /** Failure reason (already scrubbed when persisted; callers scrub logs). */
  error?: string;
  /** Schedule was auto-paused after this run (FAILURE_AUTO_PAUSE). */
  autoPaused: boolean;
  /**
   * The run stopped to ask a human (AUTONOMY-1/2; `spend-cap` = SAFE-8),
   * including the stuck ask of a run that could not start or that
   * auto-paused its schedule (REQ-discord-353).
   */
  askReason?: HumanAskReason;
  /** This run crossed 80% of the daily spend cap (SAFE-8). */
  spendWarning?: SpendWarning;
};

export type SchedulerServiceOpts = {
  store: ScheduleStore;
  agent: AgentClient;
  allowlist: AllowlistConfig;
  outbound?: SchedulerOutbound;
  pollIntervalMs?: number;
  maxConcurrent?: number;
  /** Injectable clock (tests). */
  now?: () => number;
  /** When true, do not start the interval (tests call tick() manually). */
  manual?: boolean;
  /**
   * Default project root used when resolving relative schedule.project
   * (usually bridge projectRoot).
   */
  defaultProjectRoot?: string;
  /**
   * When false, skip worktree isolation (tests that only check tick timing).
   * Default true.
   */
  useWorktrees?: boolean;
  /** Configured owner pinged when a tick needs a human (AUTONOMY-2). */
  owner?: OwnerRecord | null;
  /**
   * SAFE-8 — pending 80% warnings and the once-per-episode spend-cap ping
   * (the bridge wires its shared DB). Without it a post carries the run's
   * own warning and a spend-cap ask pings per the schedule's ping key.
   */
  spendAlerts?: SpendAlertOutbox;
  /** Called once per run when it finishes or is abandoned (daemon logs). */
  onRunFinished?: (event: ScheduleRunFinished) => void;
  /**
   * Called at the start of every tick, fire-and-forget (the bridge's forget
   * cards, MEMORY-ACL-6). A throw is logged; the tick goes on.
   */
  onTick?: () => void;
  /**
   * OPS-1/2: nightly backup + restore test, run from each tick after the due
   * runs are claimed (it claims its own night; never throws).
   */
  backup?: Pick<BackupTicker, "tick">;
  /**
   * SAFE-5 trail for a tick's SAFE-13 refusal (`injection-suspected` /
   * `denied`; best effort). The bridge wires its trail; without it the
   * refusal still happens and the run row records why.
   */
  recordAudit?: (entry: AuditEntryInput) => unknown;
  /**
   * The bridge's live mute set (DISCORD-6): a muted creator's schedule text
   * is fenced as community, as their chat would be (SAFE-12).
   */
  mutedUsers?: Set<string>;
};

/** What a start-up `recoverAbandoned()` fixed (REQ-discord-346). */
export type ScheduleRecovery = {
  /** Runs a dead process left "running", now failed. */
  runs: ScheduleRun[];
  /** Leftover schedule-run worktrees removed (branch kept when it has commits). */
  worktrees: string[];
};

type InFlight = {
  schedule: Schedule;
  run: ScheduleRun;
  settled: Promise<void>;
  /** Aborted when the run is abandoned: stops the spawned agent's process tree. */
  stop: AbortController;
};

export class SchedulerService {
  private readonly store: ScheduleStore;
  private readonly agent: AgentClient;
  private readonly allowlist: AllowlistConfig;
  private readonly outbound?: SchedulerOutbound;
  private readonly pollIntervalMs: number;
  private readonly maxConcurrent: number;
  private readonly nowFn: () => number;
  private readonly defaultProjectRoot: string;
  private readonly useWorktrees: boolean;
  private readonly owner: OwnerRecord | null;
  private readonly spendAlerts?: SpendAlertOutbox;
  private readonly onRunFinished?: (event: ScheduleRunFinished) => void;
  private readonly onTick?: () => void;
  private readonly backup?: Pick<BackupTicker, "tick">;
  private readonly recordAudit?: (entry: AuditEntryInput) => unknown;
  private readonly mutedUsers?: Set<string>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly running = new Map<string, InFlight>();
  /** Runs already finished/abandoned — a run is recorded once. */
  private readonly finishedRuns = new WeakSet<ScheduleRun>();
  /** Abandoned runs still cleaning up (parking their worktree). */
  private readonly abandoned = new Set<Promise<void>>();
  private tickInFlight = false;
  /** The pending-ask delivery pass in flight (REQ-discord-347), if any. */
  private askDelivery: Promise<void> | null = null;
  /** Set by `stop()`: no delivery pass takes another ask (REQ-discord-347). */
  private stopped = false;

  constructor(opts: SchedulerServiceOpts) {
    this.store = opts.store;
    this.agent = opts.agent;
    this.allowlist = opts.allowlist;
    this.outbound = opts.outbound;
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxConcurrent = opts.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    this.nowFn = opts.now ?? (() => Date.now());
    this.defaultProjectRoot = opts.defaultProjectRoot ?? process.cwd();
    this.useWorktrees = opts.useWorktrees !== false;
    this.owner = opts.owner ?? null;
    this.spendAlerts = opts.spendAlerts;
    this.onRunFinished = opts.onRunFinished;
    this.onTick = opts.onTick;
    this.backup = opts.backup;
    this.recordAudit = opts.recordAudit;
    this.mutedUsers = opts.mutedUsers;
    if (!opts.manual) {
      this.start();
    }
  }

  start(): void {
    this.stopped = false;
    if (this.timer) return;
    this.timer = setInterval(() => {
      // REQ-discord-331: a tick that throws (e.g. SQLITE_BUSY from another
      // process on the data dir) is logged; the next tick still runs. Left
      // uncaught it is an unhandled rejection, which exits the bridge.
      this.tick().catch((err) => logSchedulerError("tick", err));
    }, this.pollIntervalMs);
    // Unref so the timer alone does not keep the process alive in tests/CLI.
    if (typeof this.timer === "object" && "unref" in this.timer) {
      (this.timer as NodeJS.Timeout).unref?.();
    }
  }

  /**
   * Stop ticking. A pending-ask delivery pass in flight takes no further
   * ask; `settleAskDelivery` waits for the post it is making.
   */
  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Running schedule ids (for tests / status). */
  runningIds(): string[] {
    return [...this.running.keys()];
  }

  /**
   * Scan due schedules and fire async work without awaiting agents.
   * Returns immediately after scheduling starts (DISCORD-SCHEDULE-4).
   * `skipped` includes due runs another ticker on the same data dir claimed.
   * Rejects when the store throws (the `start()` interval and the daemon
   * catch it); the tick lock is released either way, so the next tick runs,
   * and runs already claimed by this tick keep going.
   */
  async tick(): Promise<{ started: string[]; skipped: string[] }> {
    if (this.tickInFlight) return { started: [], skipped: [] };
    this.tickInFlight = true;
    if (this.onTick) {
      try {
        this.onTick();
      } catch (err) {
        logSchedulerError("tick hook", err);
      }
    }
    const started: string[] = [];
    const skipped: string[] = [];
    try {
      const now = this.nowFn();
      // Another process may have created/paused/run schedules since last tick.
      this.store.refresh();
      const due = this.store.listDue(now);
      for (const schedule of due) {
        if (this.running.size >= this.maxConcurrent) {
          skipped.push(schedule.id);
          continue;
        }
        if (this.running.has(schedule.id)) {
          skipped.push(schedule.id);
          continue;
        }
        const run = this.store.claimRun(schedule, now);
        if (!run) {
          skipped.push(schedule.id);
          continue;
        }
        started.push(schedule.id);
        const entry: InFlight = {
          schedule,
          run,
          settled: Promise.resolve(),
          stop: new AbortController(),
        };
        this.running.set(schedule.id, entry);
        // Fire-and-forget — do not await (ingress must not wait). Only a
        // shutdown drain() ever handles this promise, so it must never reject
        // (REQ-discord-331).
        entry.settled = this.runOne(schedule, run, entry.stop.signal).catch(
          (err) => logSchedulerError("run", err),
        );
      }
      // REQ-discord-347: post asks another ticker (the daemon) left pending.
      // Fire-and-forget like the runs: a slow post never delays a tick.
      this.deliverPendingAsks();
      // OPS-1/2: the nightly backup / restore test when due, after the runs
      // are claimed; its owner notice post is fire-and-forget too.
      this.backup?.tick(now);
    } finally {
      this.tickInFlight = false;
    }
    return { started, skipped };
  }

  /**
   * Wait for the pending-ask delivery pass in flight (if any), up to
   * `timeoutMs` when given. Resolves true when none is left in flight. A
   * stop waits on it so a post in flight either goes out or hands its ask
   * back before the gateway closes (REQ-discord-347).
   */
  async settleAskDelivery(timeoutMs?: number): Promise<boolean> {
    const pass = this.askDelivery;
    if (!pass) return true;
    if (timeoutMs === undefined) {
      await pass;
      return true;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, Math.max(0, timeoutMs));
    });
    try {
      await Promise.race([pass, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    return this.askDelivery === null;
  }

  /**
   * Needs-human outbox (REQ-discord-347, AUTONOMY-2 / AUTONOMOUS-7): only a
   * ticker that can post (the bridge) delivers. For each schedule whose
   * newest finished run stopped with an ask nobody posted — a run the
   * daemon claimed — post it to the schedule's channel like an in-process
   * run would (owner / creator ping, once-per-question and once-per-episode
   * rules, pending 80% warning). A schedule whose creator or channel the
   * live allowlist refuses (DISCORD-SCHEDULE-3) is skipped and its ask stays
   * pending; the ask is claimed atomically first and handed back when its
   * post does not go out, so the next tick retries it. The claim re-checks that the
   * ask is still its schedule's newest, so one a later run made moot while
   * this pass was posting is skipped; after `stop()` no further ask is
   * taken. One pass at a time; never rejects.
   */
  private deliverPendingAsks(): void {
    if (!this.outbound?.post || this.askDelivery || this.stopped) return;
    const pass = (async () => {
      for (const pending of this.store.pendingAsks()) {
        if (this.stopped) break;
        const schedule = this.store.get(pending.scheduleId);
        if (!schedule?.channelId) continue;
        // DISCORD-SCHEDULE-3: creator and channel re-checked live before posting.
        if (!this.gateTick(schedule).ok) continue;
        if (!this.store.claimRunAsk(pending.runId, this.nowFn())) continue;
        let posted = false;
        try {
          posted = await this.postRunAsk(schedule, schedule.channelId, pending.ask, pending.summary);
        } catch (err) {
          logSchedulerError("ask", err);
        } finally {
          if (!posted) this.store.releaseRunAsk(pending.runId);
        }
      }
    })();
    this.askDelivery = pass
      .catch((err) => logSchedulerError("ask", err))
      .finally(() => {
        this.askDelivery = null;
      });
  }

  /**
   * Wait until in-flight runs settle, up to `timeoutMs`.
   * Resolves true when none are left running.
   */
  async drain(timeoutMs: number): Promise<boolean> {
    if (this.running.size === 0) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, Math.max(0, timeoutMs));
    });
    const settled = Promise.allSettled(
      [...this.running.values()].map((e) => e.settled),
    ).then(() => undefined);
    try {
      await Promise.race([settled, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    return this.running.size === 0;
  }

  /**
   * Record every still-running run as failed with `reason` (shutdown after
   * the grace period) so history never shows a run stuck at "running", and
   * stop its spawned agent's whole process tree so nothing keeps working
   * after the shutdown (AGENT-3). Returns the abandoned schedule ids.
   */
  abandonInFlight(reason: string): string[] {
    const ids: string[] = [];
    for (const [id, entry] of this.running) {
      try {
        this.finish(entry.schedule, entry.run, { ok: false, error: reason });
      } catch (err) {
        // Never skip the abort: an unrecorded run is recovered at next start.
        logSchedulerError("run", err);
      }
      entry.stop.abort(new Error(reason));
      // Its runOne still parks the worktree once the agent is gone.
      const settled = entry.settled;
      this.abandoned.add(settled);
      void settled.finally(() => this.abandoned.delete(settled));
      ids.push(id);
    }
    this.running.clear();
    return ids;
  }

  /**
   * After `abandonInFlight`, wait up to `timeoutMs` for the aborted runs to
   * finish cleaning up (park their worktree / empty branch), so a stop that
   * exits right after leaves nothing behind (REQ-discord-346). Resolves true
   * when all are done; what is still pending is recovered at next start.
   */
  async settleAbandoned(timeoutMs: number): Promise<boolean> {
    if (this.abandoned.size === 0) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, Math.max(0, timeoutMs));
    });
    try {
      await Promise.race([
        Promise.allSettled([...this.abandoned]).then(() => undefined),
        timeout,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    return this.abandoned.size === 0;
  }

  /**
   * Restart recovery (REQ-discord-346 / SESSION-WORKTREE-3), run once at
   * start before ticking: fail runs a dead process left "running"
   * (`interrupted: process restarted`), then remove every schedule-run
   * worktree whose run this data dir recorded as ended — a crash, or a stop
   * whose bounded grace ran out — with the usual safe cleanup: the `talk/`
   * branch is deleted only when it has no commits of its own, else kept.
   * Runs a live process owns (another bridge or daemon on this data dir)
   * and their worktrees are left alone, and so is a worktree whose run this
   * data dir does not know: it belongs to another data dir sharing the repo
   * (another bridge or daemon, or a `bun test` / verify lane run inside a
   * live schedule worktree). Never throws: errors are logged.
   */
  async recoverAbandoned(): Promise<ScheduleRecovery> {
    const recovery: ScheduleRecovery = { runs: [], worktrees: [] };
    try {
      recovery.runs = this.store.recoverAbandonedRuns(this.nowFn());
    } catch (err) {
      // Without the run rows we cannot tell leftovers from live runs.
      logSchedulerError("recovery", err);
      return recovery;
    }
    // Memory-only stores (tests) know no other process's runs.
    if (!this.useWorktrees || !this.store.durable) return recovery;
    const projectDirs = new Set<string>([this.defaultProjectRoot]);
    try {
      for (const schedule of this.store.list()) {
        const resolved = resolveProjectDir(schedule.project, {
          defaultProjectRoot: this.defaultProjectRoot,
          github: this.allowlist.github,
        });
        if (resolved.ok) projectDirs.add(resolved.dir);
      }
    } catch (err) {
      logSchedulerError("recovery", err);
    }
    const seen = new Set<string>();
    for (const projectDir of projectDirs) {
      try {
        if (!isGitRepo(projectDir)) continue;
        for (const wt of await listScheduleRunWorktrees(projectDir)) {
          if (seen.has(wt.path)) continue;
          seen.add(wt.path);
          // Only an ended run this data dir recorded, under the schedule its
          // worktree name says. Unknown ⇒ another data dir's: never touch.
          const known = this.store.runRecord(wt.runId);
          if (!known || known.status === "running") continue;
          if (runWorktreeKey(known.scheduleId, wt.runId) !== wt.key) continue;
          await parkWorktree(projectDir, wt.path, {
            kind: "worktree",
            branchName: wt.branchName,
          });
          recovery.worktrees.push(wt.path);
        }
      } catch (err) {
        logSchedulerError("recovery", err);
      }
    }
    return recovery;
  }

  private async runOne(
    schedule: Schedule,
    run: ScheduleRun,
    signal: AbortSignal,
  ): Promise<void> {
    let workDir: string | undefined;
    let projectDir: string | undefined;
    let workspaceKind: "worktree" | "scoped_dir" | undefined;
    let branchName: string | undefined;
    try {
      // Creator + channel allowlist re-check before any work (DISCORD-SCHEDULE-3).
      const allowed = this.gateTick(schedule);
      if (!allowed.ok) {
        this.finish(schedule, run, { ok: false, error: allowed.error });
        return;
      }

      // SAFE-12 / SAFE-13 (#71): the creator's role, resolved now (a schedule
      // stored before this check, or by someone who is no longer the owner,
      // is judged by who they are today). Text by anyone but the owner that
      // trips the detector runs nothing — before any worktree is made.
      const creatorRole = this.creatorRole(schedule);
      const suspected = scheduleInjection(schedule, creatorRole);
      if (suspected) {
        await this.refuseInjectedRun(schedule, run, suspected);
        return;
      }

      // SESSION-WORKTREE: resolve schedule.project → isolated cwd.
      if (this.useWorktrees) {
        // REQ-discord-202: same project scope as /work (DISCORD-SCHEDULE-3).
        // A step that throws (EACCES, ENOSPC) fails the run the same way as
        // one that returns an error (REQ-discord-353).
        let resolved: ReturnType<typeof resolveProjectDir>;
        try {
          resolved = resolveProjectDir(schedule.project, {
            defaultProjectRoot: this.defaultProjectRoot,
            github: this.allowlist.github,
          });
        } catch (err) {
          resolved = { ok: false, error: errorLine(err) };
        }
        if (!resolved.ok) {
          await this.failBeforeRun(
            schedule,
            run,
            `project resolve failed: ${resolved.error}`,
            PROJECT_RESOLVE_FAILED_QUESTION,
          );
          return;
        }
        projectDir = resolved.dir;
        // Name the worktree/branch from the full schedule + run ids. The
        // default 16-char prefix gave every run of a schedule (and schedules
        // sharing a first id char) one dir/branch, so a new run wiped the last.
        const runKey = runWorktreeKey(schedule.id, run.id);
        const ensured = await ensureTalkWorkspace({
          projectWorkingDir: resolved.dir,
          sessionId: runKey,
          worktreeId: `talk-${runKey}`,
          branchName: `talk/${runKey}`,
        }).catch((err: unknown) => ({ ok: false as const, error: errorLine(err) }));
        if (!ensured.ok) {
          await this.failBeforeRun(
            schedule,
            run,
            `worktree failed: ${ensured.error}`,
            WORKTREE_FAILED_QUESTION,
          );
          return;
        }
        workDir = ensured.workspace.workDir;
        workspaceKind = ensured.workspace.kind;
        branchName = ensured.workspace.branchName;
      }

      // SAFE-12: the owner's schedule reads as before; anyone else's name and
      // prompt reach the model only inside the untrusted-data fence (header
      // naming the creator's role), like their chat would.
      const byOwner = creatorRole === "owner";
      const prompt = [
        byOwner
          ? `Scheduled work "${schedule.name}" on project: ${schedule.project}`
          : `Scheduled work on project: ${schedule.project}`,
        workDir ? `Worktree: ${workDir}` : "",
        "",
        byOwner
          ? schedule.prompt
          : fenceSpeakerText(
              `Schedule "${schedule.name}":\n${schedule.prompt}`,
              creatorRole,
              "schedule-prompt",
            ),
        "",
        "Stay within existing allowlists and SAFE gates. Linux host only.",
      ]
        .filter((l) => l !== undefined)
        .join("\n");

      // MEMORY scope to schedule creator; forget/override stay deny without live ADMIN re-check.
      const result = await this.agent.runChat({
        prompt,
        sessionId: `schedule_${schedule.id}`,
        resume: false,
        actingUserId: schedule.createdByUserId,
        actingIsAdmin: false,
        cwd: workDir,
        signal,
      });

      // ROLES-CHAT-3 (REQ-discord-734): the run row's summary and the post
      // keep a closing role note when they cap a long summary.
      const summary = result.ok
        ? clipPostSummary(result.summary)
        : `failed (exit ${result.exitCode})`;

      const done = this.finish(schedule, run, {
        ok: result.ok,
        summary,
        error: result.ok ? undefined : summary,
        ...(result.ask ? { ask: result.ask } : {}),
        ...(result.spendWarning ? { spendWarning: result.spendWarning } : {}),
      });
      // Abandoned at shutdown meanwhile: already recorded, post nothing.
      if (!done) return;

      // A clean run re-arms the owner ping for the next question (AUTONOMY-2).
      if (result.ok && !result.ask && schedule.askPingKey) {
        this.store.setAskPingKey(schedule.id, null);
      }

      if (done.ask) {
        // The run's ask, or the stuck ask about the auto-pause this failure
        // caused (REQ-discord-353), which replaces the plain ❌ post and, for
        // a run without an ask of its own, shows only what that line showed
        // (and what the delivery pass shows from the row): the exit code.
        await this.postOwnRunAsk(schedule, run, done.ask, {
          context: result.ask ? result.summary : summary,
          spendWarning: result.spendWarning,
          // SAFE-13: a run that ends with an ask still tells the owner.
          injection: result.injection,
          handBack: done.autoPaused,
        });
      } else if (schedule.channelId && this.outbound?.post) {
        // Re-checked at post time: the allowlist can change mid-run.
        const gate = this.gateTick(schedule);
        if (gate.ok) {
          // SAFE-8: a pending 80% spend warning (this run's or one recorded
          // by any other run on the data dir) rides the post and pings the owner.
          const pending = takeSpendWarning(this.spendAlerts, result.spendWarning);
          // `false` until a post resolves (a poster returning void counts as sent).
          let posted: void | boolean = false;
          try {
            const status = result.ok ? "✅" : "❌";
            const head = `${status} ${scheduleTitle(schedule)}:\n`;
            posted = await this.outbound.post(
              // SAFE-13: a tool result that looked like an injection tells the owner.
              withInjectionNotice(
                withSpendWarningPost(
                  {
                    channelId: schedule.channelId,
                    content: `${head}${clipPostSummary(summary, head.length)}`,
                  },
                  pending?.warning,
                  this.owner,
                ),
                result.injection,
                this.owner,
              ),
            );
          } finally {
            // Not posted: the next post carries the warning.
            if (posted === false) pending?.release();
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const done = this.finish(schedule, run, { ok: false, error: msg });
      if (!done) {
        // Already recorded (a post failed after the outcome was written, or
        // the run was abandoned): log it instead of swallowing it.
        logSchedulerError("run", err);
      } else if (done.ask) {
        // This failure auto-paused the schedule (REQ-discord-353): post the
        // pause ask now, with no context (the error may name host paths).
        try {
          await this.postOwnRunAsk(schedule, run, done.ask, {
            handBack: done.autoPaused,
          });
        } catch (postErr) {
          logSchedulerError("ask", postErr);
        }
      }
    } finally {
      try {
        // Park/remove so another talk never silently reuses this cwd.
        if (workDir && projectDir) {
          await parkWorktree(projectDir, workDir, {
            kind: workspaceKind,
            branchName,
          });
        }
      } finally {
        // Always free the slot, or a failed park wedges this schedule.
        if (this.running.get(schedule.id)?.run.id === run.id) {
          this.running.delete(schedule.id);
        }
      }
    }
  }

  /**
   * A run that could not start (REQ-discord-353, AUTONOMY-2): recorded
   * failed with the full error and a stuck ask carrying only `question`
   * (no host path), then posted like any run's ask — or, when this failure
   * auto-pauses the schedule, the ask about the pause.
   */
  private async failBeforeRun(
    schedule: Schedule,
    run: ScheduleRun,
    error: string,
    question: string,
  ): Promise<void> {
    const done = this.finish(schedule, run, {
      ok: false,
      error,
      ask: { reason: "stuck", question },
    });
    if (done?.ask) {
      await this.postOwnRunAsk(schedule, run, done.ask, { handBack: done.autoPaused });
    }
  }

  /**
   * Post the ask this ticker's own run ended with (REQ-discord-347). The
   * channel and creator are re-checked at post time (DISCORD-SCHEDULE-3:
   * the allowlist can change mid-run); a refused one leaves the ask pending,
   * like a daemon run's. The recorded ask is taken first (no await since
   * `finish`), so no other ticker's delivery pass posts it too; an outcome
   * that could not be recorded has no row to claim. A post that does not go
   * out here (resolves false or throws) is not retried — the next run posts —
   * unless `handBack`: the ask about an auto-pause is handed back for the
   * next delivery pass, because a paused schedule has no next run
   * (REQ-discord-353).
   */
  private async postOwnRunAsk(
    schedule: Schedule,
    run: ScheduleRun,
    ask: HumanAsk,
    opts: {
      context?: string;
      spendWarning?: SpendWarning;
      /** SAFE-13: a tool result in this run looked like an injection. */
      injection?: InjectionNotice;
      handBack?: boolean;
    } = {},
  ): Promise<void> {
    if (!schedule.channelId || !this.outbound?.post) return;
    if (!this.gateTick(schedule).ok) return;
    const recorded = run.ask !== undefined;
    if (recorded && !this.store.claimRunAsk(run.id, this.nowFn())) return;
    let posted = false;
    try {
      posted = await this.postRunAsk(
        schedule,
        schedule.channelId,
        ask,
        opts.context,
        opts.spendWarning,
        opts.injection,
      );
    } finally {
      if (!posted && recorded && opts.handBack) this.store.releaseRunAsk(run.id);
    }
  }

  /**
   * Post a schedule run's ask to its channel (AUTONOMY-1/2/4, SAFE-8): the
   * question with the schedule prefix; stuck and spend-cap ping the owner,
   * clarify pings the schedule creator. The owner is pinged once per
   * question per schedule (`askPingKey`) and a spend-cap ask once per cap
   * episode; a repeat still posts, without a ping. A pending 80% warning
   * rides the post. Resolves true when the post went out (a poster
   * returning void counts as sent); when it did not, the warning and the
   * cap ping are handed back and no ping key is kept. The caller has
   * already checked the channel against the allowlist.
   */
  private async postRunAsk(
    schedule: Schedule,
    channelId: string,
    ask: HumanAsk,
    context: string | undefined,
    spendWarning?: SpendWarning,
    injection?: InjectionNotice,
  ): Promise<boolean> {
    const outbound = this.outbound;
    if (!outbound?.post) return false;
    const pingKey = askPingKey(ask);
    const alreadyPinged = schedule.askPingKey === pingKey;
    // SAFE-8: a spend-cap ask also pings once per cap episode across
    // every bridge surface (only consulted when this post would ping).
    const askOwner = !alreadyPinged
      ? askPingOwner(ask, this.owner, this.spendAlerts)
      : { owner: null, deduped: true, release: () => {} };
    const reply = formatAskReply({
      ask,
      // Stuck / spend-cap: owner (skip when already pinged). Clarify:
      // schedule creator.
      owner: askOwner.owner,
      requesterDiscordId: alreadyPinged ? undefined : schedule.createdByUserId,
      context,
      prefix: `${scheduleTitle(schedule)}:`,
    });
    // SAFE-8: a pending 80% spend warning (this run's or one recorded by
    // any other run on the data dir) rides the post and pings the owner.
    const pending = takeSpendWarning(this.spendAlerts, spendWarning);
    // `false` until a post resolves (a poster returning void counts as sent).
    let posted: void | boolean = false;
    try {
      if (
        (ask.reason === "stuck" || ask.reason === "spend-cap") &&
        !reply.ownerPinged &&
        !askOwner.deduped
      ) {
        console.warn(ASK_NO_OWNER_WARNING);
      }
      posted = await outbound.post(
        // SAFE-13: a tool result that looked like an injection tells the owner.
        withInjectionNotice(
          withSpendWarningPost(
            { channelId, content: reply.content, mentionUserIds: reply.mentionUserIds },
            pending?.warning,
            this.owner,
          ),
          injection,
          this.owner,
        ),
      );
      // A ping that never went out is not remembered (AUTONOMY-2).
      if (posted !== false && reply.pinged) {
        this.store.setAskPingKey(schedule.id, pingKey);
      }
    } finally {
      // Not posted: the next post carries the warning and the cap ping.
      if (posted === false) {
        pending?.release();
        askOwner.release();
      }
    }
    return posted !== false;
  }

  /**
   * SAFE-12 (#71): the schedule creator's role, resolved at this tick the way
   * a Discord speaker's is (`resolveDiscordActingRole`: owner only for the
   * configured owner, not muted or deny-listed; team when the live people
   * list declares them team; else community). A tick has no Discord role
   * ids, so someone who is team only through a Discord role reads as
   * community here. Never throws: any failure reads as community.
   */
  private creatorRole(schedule: Schedule): PersonRole {
    try {
      return resolveDiscordActingRole({
        userId: schedule.createdByUserId,
        allowlist: this.allowlist,
        owner: this.owner,
        mutedUsers: this.mutedUsers,
        people: loadDeclaredPeople({ allowlist: this.allowlist, owner: this.owner }),
      });
    } catch {
      return "community";
    }
  }

  /**
   * SAFE-13 (#71): a tick whose schedule text (by anyone but the owner)
   * looks like an injection attempt. Nothing runs: one `injection-suspected`
   * / `denied` SAFE-5 row (actor the creator, surface `scheduler:<id>`,
   * never the text), the run recorded failed with a stuck ask
   * (`injectedScheduleQuestion`), the schedule paused so no later tick runs
   * it or posts again, and that ask posted through the usual ask path — the
   * owner pinged once, handed back for the next delivery pass when the post
   * does not go out (a daemon's run leaves it pending for a bridge).
   */
  private async refuseInjectedRun(
    schedule: Schedule,
    run: ScheduleRun,
    verdict: InjectionVerdict,
  ): Promise<void> {
    auditInboundInjection(this.recordAudit, {
      actor: schedule.createdByUserId,
      surface: `scheduler:${schedule.id}`,
      source: "schedule-prompt",
      reasons: verdict.reasons,
    });
    const done = this.finish(schedule, run, {
      ok: false,
      error: `not run: the schedule's text looks like a prompt-injection attempt (${verdict.reasons.join(", ")}) (SAFE-13)`,
      ask: { reason: "stuck", question: injectedScheduleQuestion(verdict.reasons) },
    });
    if (!done) return;
    if (!done.autoPaused) this.store.setStatus(schedule.id, "paused", this.nowFn());
    if (done.ask) await this.postOwnRunAsk(schedule, run, done.ask, { handBack: true });
  }

  /**
   * DISCORD-SCHEDULE-3 tick gate, read live on every call: the schedule's
   * creator must pass the same actor gate as live Discord ingress
   * (REQ-discord-201: deny list wins; a non-empty user/role list must list
   * the creator unless they are the configured owner), and its channel, when
   * set, must be allowlisted. The bridge's `/admin` edits the shared
   * allowlist in place and the daemon reloads it before each tick, so a run
   * checks before it starts and again before it posts.
   */
  private gateTick(schedule: Schedule): { ok: true } | { ok: false; error: string } {
    const actor = gateActor({
      userId: schedule.createdByUserId,
      allowlist: this.allowlist,
      owner: this.owner,
    });
    if (!actor.ok) {
      return { ok: false, error: `creator not allowlisted: ${errorLine(actor.error)}` };
    }
    if (schedule.channelId && !checkChannel(schedule.channelId, this.allowlist).ok) {
      return { ok: false, error: `channel not allowlisted: ${schedule.channelId}` };
    }
    return { ok: true };
  }

  /**
   * Record a run outcome once, then auto-pause after repeated failures.
   * Returns null when the run was already recorded (e.g. abandoned), else
   * whether it auto-paused the schedule and the ask the run ended with: its
   * own, or — when this failure auto-paused the schedule — the stuck
   * `autoPauseAsk` (REQ-discord-353), which the store records in place of
   * the run's own ask in the same write.
   * REQ-discord-346: the run counts as recorded only once the store write
   * succeeds. A write that throws (SQLITE_BUSY) is logged and retried once;
   * if that fails too it is logged as `[scheduler] run failed: …` and the
   * run counts as failed here (its row is recovered at the next start).
   */
  private finish(
    schedule: Schedule,
    run: ScheduleRun,
    result: {
      ok: boolean;
      summary?: string;
      error?: string;
      /** Recorded on the run row until a bridge posts it (REQ-discord-347). */
      ask?: HumanAsk;
      spendWarning?: SpendWarning;
    },
  ): { ask?: HumanAsk; autoPaused: boolean } | null {
    if (this.finishedRuns.has(run)) return null;
    // AUTONOMY-2: a failure that pauses the schedule asks about the pause.
    const pauseAsk = result.ok ? undefined : autoPauseAsk(result.ask);
    const record = {
      ok: result.ok,
      summary: result.summary,
      error: result.error,
      ...(result.ask ? { ask: result.ask } : {}),
      ...(pauseAsk ? { autoPause: { at: FAILURE_AUTO_PAUSE, ask: pauseAsk } } : {}),
    };
    let outcome: { ok: boolean; error?: string } = record;
    try {
      this.store.markRunFinished(schedule, run, record);
    } catch (first) {
      console.error(
        `[scheduler] run ${run.id} of schedule ${schedule.id}: recording its outcome failed, retrying once: ${errorLine(first)}`,
      );
      try {
        this.store.markRunFinished(schedule, run, record);
      } catch (second) {
        const why = errorLine(second);
        console.error(
          `[scheduler] run failed: could not record run ${run.id} of schedule ${schedule.id} (${result.ok ? "completed" : "failed"}); counted as failed: ${why}`,
        );
        outcome = { ok: false, error: `run outcome not recorded: ${why}` };
        run.status = "failed";
        run.error = outcome.error;
        run.completedAt = this.nowFn();
        schedule.consecutiveFailures += 1;
      }
    }
    this.finishedRuns.add(run);
    const autoPaused = this.maybeAutoPause(schedule);
    const ask = autoPaused ? (pauseAsk ?? autoPauseAsk()) : result.ask;
    this.onRunFinished?.({
      scheduleId: schedule.id,
      runId: run.id,
      ok: outcome.ok,
      error: outcome.error,
      autoPaused,
      ...(ask ? { askReason: ask.reason } : {}),
      ...(result.spendWarning ? { spendWarning: result.spendWarning } : {}),
    });
    return { ...(ask ? { ask } : {}), autoPaused };
  }

  private maybeAutoPause(schedule: Schedule): boolean {
    if (schedule.consecutiveFailures >= FAILURE_AUTO_PAUSE) {
      this.store.setStatus(schedule.id, "paused", this.nowFn());
      return true;
    }
    return false;
  }
}
