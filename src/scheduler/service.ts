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
 * AUTONOMY-6.a (REQ-discord-606): every ask a run records blocks the
 * schedule. Its post carries Choose / Answer and Cancel controls (for a
 * spend-cap stop, the owner's Continue — its next run asks on a spend card
 * before any call past a cap, AUTONOMY-8 — and Cancel;
 * src/discord/schedule-ask.ts), a schedule with no
 * channel sends it to the owner by DM, and until the creator or the owner
 * answers or cancels it each due run is skipped (no catch-up) and one wait
 * note goes out, pinging nobody. The answer reaches the next run once.
 * DISCORD-SCHEDULE-1.a: a schedule runs as its creator's role, read live at
 * each run after the creator/channel gate: the owner as configured now
 * (`loadOwner`; the bridge and the daemon re-read the owner config) who
 * created it, not muted or deny-listed, gets the owner stamp — their tools
 * per their allowlist, still never the shell, runners or Fledge runs
 * (SAFE-3.a, the `schedule` surface) nor discovered Fledge plugin commands,
 * and the must-ask list's Approve cards; a card they deny or let lapse ends
 * the run with a blocking ask naming the refused action. Anyone else's
 * schedule stays read-only (community); a schedule is never stamped team.
 * The schedule's own posts to its channel (result, ask, wait note) are not
 * announcements it starts (AUTONOMY-10): they go out without a card.
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
} from "../discord/ask-ping.ts";
import { askPingOwner } from "../discord/spend-post.ts";
import { spendStopFor, type SpendDm } from "../discord/spend-dm.ts";
import {
  failedRunOutcome,
  failureReasonFor,
  formatFailureLog,
  type FailureOwnerDm,
} from "../discord/failure-reason.ts";
import {
  formatScheduleWaitNote,
  scheduleAskComponents,
  scheduleAskHint,
} from "../discord/schedule-ask.ts";
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
import { isOwnerDiscord, type OwnerRecord } from "../identity/owner.ts";
import { loadDeclaredPeople, type PersonRole } from "../identity/people.ts";
import { SCHEDULE_SESSION_PREFIX } from "../plugins/roles.ts";
import type { BackupTicker } from "../store/backup.ts";
import { scrubSecrets } from "../store/scrub.ts";
import {
  ensureTalkWorkspace,
  isGitRepo,
  parkWorktree,
  resolveProjectDir,
} from "../worktree/index.ts";
import type {
  AnsweredScheduleAsk,
  Schedule,
  ScheduleRun,
  ScheduleStore,
} from "./store.ts";

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
 * prompt keeps the stored project. `withName: false` leaves the name out (an
 * ask about a non-owner's schedule whose name tripped SAFE-13).
 */
function scheduleTitle(schedule: Schedule, opts: { withName?: boolean } = {}): string {
  const project = projectLabel(schedule.project) ?? "";
  const id = `(\`${schedule.id.slice(0, 12)}\`)`;
  // SAFE-13 (#71): a non-owner's name that trips the detector is never
  // quoted back into the channel; the id still says which schedule it is.
  if (opts.withName === false) return `Schedule ${id} on \`${project}\``;
  return `Schedule **${schedule.name}** ${id} on \`${project}\``;
}

/**
 * AGENT-12 (REQ-agent-312): the scheduler's log line for a run whose last
 * attempt hit the turn cap I set — its post is only its best prose, with no
 * footer to carry `stopped=turn-cap` (AGENT-9 keeps the stop out of the post).
 */
export function scheduleTurnCapLog(scheduleId: string): string {
  return `[scheduler] schedule ${scheduleId}: run stopped=turn-cap (CORVIDINHO_MAX_TURNS); its post is its best answer so far (AGENT-12)`;
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
function logSchedulerError(
  where: "tick" | "tick hook" | "run" | "recovery" | "ask" | "owner",
  err: unknown,
): void {
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
    /** A run ask's Choose / Answer and Cancel buttons (AUTONOMY-6.a). */
    components?: unknown[];
  }) => Promise<void | boolean>;
  /**
   * AUTONOMY-6.a — DM one user (the owner): the ask, its controls and the
   * wait note of a schedule with no channel. Resolves true when it went out.
   */
  dm?: (opts: { userId: string; content: string; components?: unknown[] }) => Promise<boolean>;
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
   * DISCORD-SCHEDULE-1.a — the owner as configured now, read at every run
   * (the bridge and the daemon re-read the owner config). Only the live
   * owner's own schedule gets the owner stamp. Without it, `owner` is used;
   * a read that throws is no owner (fail closed: the run is community).
   */
  loadOwner?: () => Promise<OwnerRecord | null> | OwnerRecord | null;
  /**
   * SAFE-8 — the once-per-episode spend-cap ping (the bridge wires its shared
   * DB). Without it a spend-cap ask pings per the schedule's ping key.
   */
  spendAlerts?: SpendAlertOutbox;
  /**
   * SAFE-14.a — the owner's spend DMs (the bridge's `createSpendDm`): every
   * tick retries them, a run's 80% warning and a cap stop's details go there
   * (never into the schedule's post). Without it (the daemon) the warning
   * stays pending in the shared DB for a bridge.
   */
  spendDm?: Pick<SpendDm, "deliver">;
  /**
   * DISCORD-3.b — a failed run of a schedule the owner did not create DMs the
   * owner its reason (the bridge's `createFailureOwnerDm`), so its post can
   * say the owner has been told. Without it (the daemon) the post says only
   * "That didn't work." and the reason is logged.
   */
  failureDm?: FailureOwnerDm;
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
   * `denied`; best effort). The bridge wires its trail; without it (the
   * daemon) the refusal still happens and the run row records why.
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
  private readonly loadOwner?: () => Promise<OwnerRecord | null> | OwnerRecord | null;
  private readonly spendAlerts?: SpendAlertOutbox;
  private readonly spendDm?: Pick<SpendDm, "deliver">;
  private readonly failureDm?: FailureOwnerDm;
  /**
   * SAFE-14.a: per schedule, the run whose spend-cap details were last handed
   * to the owner's DM, so an ask retried every tick (its post failed and
   * handed the cap ping back) is DMed once, not on every tick.
   */
  private readonly spendStopDmRun = new Map<string, string>();
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
    this.loadOwner = opts.loadOwner;
    this.spendAlerts = opts.spendAlerts;
    this.spendDm = opts.spendDm;
    this.failureDm = opts.failureDm;
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
        // AUTONOMY-6.a: while a run's question is open the schedule waits —
        // this due run is skipped, not made up later, and the open ask is
        // marked so the delivery pass posts the one wait note.
        const open = this.store.openAsk(schedule.id);
        if (open) {
          this.store.skipForOpenAsk(schedule, open, now);
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
      // SAFE-14.a: retry the owner's spend DMs (pending 80% warning, a held
      // cap stop). Fire-and-forget; it never rejects.
      void this.spendDm?.deliver();
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
   * rules; a spend-cap ask only "Work is paused for budget.", its details
   * to the owner by DM once per run, SAFE-14.a). A schedule whose creator or channel the
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
        if (!schedule || !this.canSend(schedule)) continue;
        // DISCORD-SCHEDULE-3: creator and channel re-checked live before posting.
        if (!this.gateTick(schedule).ok) continue;
        if (!this.store.claimRunAsk(pending.runId, this.nowFn())) continue;
        let posted = false;
        try {
          posted = await this.postRunAsk(
            schedule,
            pending.ask,
            pending.summary,
            undefined,
            pending.runId,
          );
        } catch (err) {
          logSchedulerError("ask", err);
        } finally {
          if (!posted) this.store.releaseRunAsk(pending.runId);
        }
      }
      // AUTONOMY-6.a: the one wait note of each open ask a due run waited
      // on (after its ask went out), pinging nobody; taken with a
      // compare-and-set and handed back when it does not go out. It carries
      // the ask's controls too, so an ask whose post was lost (a crash
      // between its claim and its post, a deleted message) still has a way
      // to be answered or cancelled.
      for (const open of this.store.pendingWaitNotes()) {
        if (this.stopped) break;
        const schedule = this.store.get(open.scheduleId);
        if (!schedule || !this.canSend(schedule)) continue;
        if (!this.gateTick(schedule).ok) continue;
        if (!this.store.claimWaitNote(open.runId, this.nowFn())) continue;
        let sent = false;
        try {
          sent = await this.sendToSchedule(schedule, {
            content: formatScheduleWaitNote(scheduleTitle(schedule, {
              withName: !scheduleInjection({ name: schedule.name }, this.creatorRole(schedule)),
            })),
            components: scheduleAskComponents(open.runId, open.ask),
          });
        } catch (err) {
          logSchedulerError("ask", err);
        } finally {
          if (!sent) this.store.releaseWaitNote(open.runId);
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

      // DISCORD-SCHEDULE-1.a: who the owner is now (not who it was at start).
      const liveOwner = await this.liveOwner();

      // SAFE-12 / SAFE-13 (#71): the creator's role, resolved now (a schedule
      // stored before this check, or by someone who is no longer the owner,
      // is judged by who they are today). Text by anyone but the owner that
      // trips the detector runs nothing — before any worktree is made.
      const creatorRole = this.roleOf(schedule.createdByUserId, liveOwner);
      const suspected = scheduleInjection(schedule, creatorRole);
      if (suspected) {
        await this.refuseInjectedRun(schedule, run, suspected);
        return;
      }

      // SESSION-WORKTREE: resolve schedule.project → isolated cwd.
      if (this.useWorktrees) {
        // REQ-discord-202: same project scope as /work (DISCORD-SCHEDULE-3),
        // plus an allowlisted origin for a checkout nested inside the root
        // (DISCORD-SCHEDULE-3.a). A step that throws (EACCES, ENOSPC) fails
        // the run the same way as one that returns an error (REQ-discord-353).
        let resolved: ReturnType<typeof resolveProjectDir>;
        try {
          resolved = resolveProjectDir(schedule.project, {
            defaultProjectRoot: this.defaultProjectRoot,
            github: this.allowlist.github,
            schedule: true,
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

      // AUTONOMY-6.a: the answer to the question the last run asked (typed
      // or picked on Discord by the creator or the owner), once.
      const answered = this.store.answeredAsk(schedule.id);

      // SAFE-12: the owner's schedule reads as before; anyone else's name and
      // prompt reach the model only inside the untrusted-data fence (header
      // naming the creator's role), like their chat would.
      // DISCORD-SCHEDULE-1.a: the same test decides the stamp — only the live
      // owner's own schedule (not muted or deny-listed) runs as the owner.
      const byOwner =
        creatorRole === "owner" && isOwnerDiscord(liveOwner, schedule.createdByUserId);
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
        ...(answered ? ["", this.answerBlock(answered, liveOwner)] : []),
        "",
        "Stay within existing allowlists and SAFE gates. Linux host only.",
      ]
        .filter((l) => l !== undefined)
        .join("\n");

      // MEMORY scope to schedule creator; forget/override stay deny without live ADMIN re-check.
      const result = await this.agent.runChat({
        prompt,
        // The schedule-run marker (DISCORD-SCHEDULE-3.a, `isScheduleRunEnv`).
        sessionId: `${SCHEDULE_SESSION_PREFIX}${schedule.id}`,
        resume: false,
        actingUserId: schedule.createdByUserId,
        // DISCORD-SCHEDULE-1.a: the owner's own schedule runs as the owner
        // (the tool layer re-checks it at every call); anyone else's is
        // community (no `actingRole`: a schedule is never stamped team).
        actingIsAdmin: byOwner,
        // SAFE-3.a: schedules never get the shell, runners or Fledge runs.
        surface: "schedule",
        cwd: workDir,
        signal,
      });

      // AGENT-12 (REQ-agent-312): a schedule's post has no footer to carry
      // `stopped=turn-cap`, and AGENT-9 keeps the stop out of the post, so
      // the scheduler log says the run stopped at the turn cap. (An idle
      // timeout is a failed run: its reason is logged below, DISCORD-3.b.)
      if (result.task?.stopReason === "turn-cap" && !signal.aborted) {
        console.warn(scheduleTurnCapLog(schedule.id));
      }

      // DISCORD-3.b: a failed run without an ask of its own says why on the
      // owner's own schedule; anyone else's says the owner was told (DMed).
      // The reason is logged and kept as the row's error either way. A run
      // abandoned at shutdown posts nothing, so it tells nobody either.
      const failed =
        result.ok || result.ask || signal.aborted
          ? null
          : await failedRunOutcome({
              run: result,
              ownerRun: byOwner,
              surface: `schedule ${schedule.id}`,
              ...(schedule.channelId ? { channelId: schedule.channelId } : {}),
              ownerDm: this.failureDm,
              logPrefix: "[scheduler]",
            });
      // ROLES-CHAT-3 (REQ-discord-734): the run row's summary and the post
      // keep a closing role note when they cap a long summary.
      const summary = result.ok
        ? clipPostSummary(result.summary)
        : failed?.body ?? `failed (exit ${result.exitCode})`;

      const done = this.finish(schedule, run, {
        ok: result.ok,
        summary,
        error: result.ok
          ? undefined
          : failed
          ? `failed (exit ${result.exitCode}): ${failed.reason}`
          : summary,
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
          // SAFE-13: a run that ends with an ask still tells the owner.
          injection: result.injection,
        });
      } else if (schedule.channelId && this.outbound?.post) {
        // Re-checked at post time: the allowlist can change mid-run.
        const gate = this.gateTick(schedule);
        if (gate.ok) {
          const status = result.ok ? "✅" : "❌";
          const head = `${status} ${scheduleTitle(schedule)}:\n`;
          await this.outbound.post(
            // SAFE-13: a tool result that looked like an injection tells the owner.
            withInjectionNotice(
              {
                channelId: schedule.channelId,
                content: `${head}${clipPostSummary(summary, head.length)}`,
              },
              result.injection,
              this.owner,
            ),
          );
        }
      }
      // SAFE-14.a: this run's 80% warning (or one another run recorded)
      // reaches the owner by DM, never in the schedule's post.
      await this.spendDm?.deliver({ warning: result.spendWarning });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const done = this.finish(schedule, run, { ok: false, error: msg });
      if (!done) {
        // Already recorded (a post failed after the outcome was written, or
        // the run was abandoned): log it instead of swallowing it.
        logSchedulerError("run", err);
      } else {
        // DISCORD-3.b: the reason is always logged (scrubbed, one line).
        console.warn(
          formatFailureLog(
            "[scheduler]",
            `schedule ${schedule.id}`,
            undefined,
            failureReasonFor({ failureReason: msg }),
          ),
        );
      }
      if (done?.ask) {
        // This failure auto-paused the schedule (REQ-discord-353): post the
        // pause ask now, with no context (the error may name host paths).
        try {
          await this.postOwnRunAsk(schedule, run, done.ask);
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
      await this.postOwnRunAsk(schedule, run, done.ask);
    }
  }

  /**
   * Post the ask this ticker's own run ended with (REQ-discord-347). The
   * channel and creator are re-checked at post time (DISCORD-SCHEDULE-3:
   * the allowlist can change mid-run); a refused one leaves the ask pending,
   * like a daemon run's. The recorded ask is taken first (no await since
   * `finish`), so no other ticker's delivery pass posts it too; an outcome
   * that could not be recorded has no row to claim (nor controls). A post
   * that does not go out here (resolves false or throws) is handed back for
   * the next delivery pass: the ask blocks the schedule (AUTONOMY-6.a), so
   * there is no next run to post it (as for an auto-pause, REQ-discord-353).
   * A schedule with no channel sends it to the owner by DM.
   */
  private async postOwnRunAsk(
    schedule: Schedule,
    run: ScheduleRun,
    ask: HumanAsk,
    opts: {
      context?: string;
      /** SAFE-13: a tool result in this run looked like an injection. */
      injection?: InjectionNotice;
    } = {},
  ): Promise<void> {
    if (!this.canSend(schedule)) return;
    if (!this.gateTick(schedule).ok) return;
    const recorded = run.ask !== undefined;
    if (recorded && !this.store.claimRunAsk(run.id, this.nowFn())) return;
    let posted = false;
    try {
      posted = await this.postRunAsk(
        schedule,
        // The recorded ask carries its listed choices (the Choose button).
        recorded ? run.ask! : ask,
        opts.context,
        opts.injection,
        recorded ? run.id : undefined,
      );
    } finally {
      if (!posted && recorded) this.store.releaseRunAsk(run.id);
    }
  }

  /**
   * AUTONOMY-6.a: where a schedule's posts go — its channel, or with no
   * channel the owner's DM — and whether this ticker can send there.
   */
  private canSend(schedule: Schedule): boolean {
    if (schedule.channelId) return Boolean(this.outbound?.post);
    return Boolean(this.outbound?.dm && this.owner?.discordId?.trim());
  }

  /**
   * Send one schedule post (a run's ask or its wait note) to the schedule's
   * channel, or with no channel to the owner by DM (AUTONOMY-6.a; mentions
   * do not apply there). Resolves true when it went out (a channel poster
   * returning void counts as sent).
   */
  private async sendToSchedule(
    schedule: Schedule,
    msg: { content: string; mentionUserIds?: string[]; components?: unknown[] },
  ): Promise<boolean> {
    if (schedule.channelId) {
      if (!this.outbound?.post) return false;
      const sent = await this.outbound.post({
        channelId: schedule.channelId,
        content: msg.content,
        ...(msg.mentionUserIds ? { mentionUserIds: msg.mentionUserIds } : {}),
        ...(msg.components ? { components: msg.components } : {}),
      });
      return sent !== false;
    }
    const ownerId = this.owner?.discordId?.trim();
    if (!ownerId || !this.outbound?.dm) return false;
    return await this.outbound.dm({
      userId: ownerId,
      content: msg.content,
      ...(msg.components ? { components: msg.components } : {}),
    });
  }

  /**
   * Post a schedule run's ask to its channel (AUTONOMY-1/2/4, SAFE-8): the
   * question with the schedule prefix; stuck and spend-cap ping the owner,
   * clarify pings the schedule creator. The owner is pinged once per
   * question per schedule (`askPingKey`) and a spend-cap ask once per cap
   * episode; a repeat still posts, without a ping. A spend-cap post says
   * only that work is paused for budget (SAFE-14.a); when it claims the
   * episode's ping, the stop's details go to the owner by DM, once per run
   * (`runId`: a post retried every tick after it failed DMs them once).
   * AUTONOMY-6.a: a recorded ask (`runId`) carries its controls — Choose or
   * Answer, and Cancel (Continue and Cancel for a spend-cap stop) — and the hint
   * says a reply does not answer it; a schedule with no channel sends it to
   * the owner by DM.
   * Resolves true when the post went out (a poster returning void counts as
   * sent); when it did not, the cap ping is handed back and no ping key is
   * kept. The caller has already checked the channel against the allowlist.
   */
  private async postRunAsk(
    schedule: Schedule,
    ask: HumanAsk,
    context: string | undefined,
    injection?: InjectionNotice,
    runId?: string,
  ): Promise<boolean> {
    if (!this.canSend(schedule)) return false;
    const channelId = schedule.channelId;
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
      // SAFE-13: an ask about a non-owner's schedule whose name trips the
      // detector (the tick refused it) does not quote that name.
      prefix: `${scheduleTitle(schedule, {
        withName: !scheduleInjection({ name: schedule.name }, this.creatorRole(schedule)),
      })}:`,
      // AUTONOMY-6.a: its own controls answer it (a reply does not).
      ...(runId ? { hint: scheduleAskHint(ask) } : {}),
    });
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
      // SAFE-13: a tool result that looked like an injection tells the owner.
      const withNotice = withInjectionNotice(
        { content: reply.content, mentionUserIds: reply.mentionUserIds },
        injection,
        this.owner,
      );
      posted = await this.sendToSchedule(schedule, {
        content: withNotice.content,
        ...(withNotice.mentionUserIds ? { mentionUserIds: withNotice.mentionUserIds } : {}),
        ...(runId ? { components: scheduleAskComponents(runId, ask) } : {}),
      });
      // A ping that never went out is not remembered (AUTONOMY-2).
      if (posted !== false && reply.pinged) {
        this.store.setAskPingKey(schedule.id, pingKey);
      }
    } finally {
      // Not posted: the next post carries the cap ping.
      if (posted === false) askOwner.release();
      // SAFE-14.a: the stop's details (amounts, cap, setting) to the owner by
      // DM when this post claimed the episode's ping — once per run, so an
      // ask whose post keeps failing (retried every tick with its ping
      // handed back) does not DM the owner every tick. Never throws.
      const stop = spendStopFor(ask, askOwner, channelId);
      if (stop && this.spendDm) {
        const handed = runId !== undefined && this.spendStopDmRun.get(schedule.id) === runId;
        if (!handed) {
          if (runId !== undefined) this.spendStopDmRun.set(schedule.id, runId);
          await this.spendDm.deliver({ stop });
        }
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
    return this.roleOf(schedule.createdByUserId);
  }

  /**
   * A Discord user's role at this tick (see `creatorRole`), against `owner`
   * (a run passes the live owner, DISCORD-SCHEDULE-1.a; default the one
   * given at start); community on any failure.
   */
  private roleOf(userId: string, owner: OwnerRecord | null = this.owner): PersonRole {
    try {
      return resolveDiscordActingRole({
        userId,
        allowlist: this.allowlist,
        owner,
        mutedUsers: this.mutedUsers,
        people: loadDeclaredPeople({ allowlist: this.allowlist, owner }),
      });
    } catch {
      return "community";
    }
  }

  /**
   * DISCORD-SCHEDULE-1.a: the owner as configured now (`loadOwner`, read at
   * every run), else the one given at start. A read that throws is logged
   * and is no owner, so the run gets the community stamp (fail closed).
   */
  private async liveOwner(): Promise<OwnerRecord | null> {
    if (!this.loadOwner) return this.owner;
    try {
      return (await this.loadOwner()) ?? null;
    } catch (err) {
      logSchedulerError("owner", err);
      return null;
    }
  }

  /**
   * AUTONOMY-6.a — the answered question as the next run gets it: the
   * question the last run asked, then the answer. SAFE-12 / SAFE-12.a: the
   * owner's answer reads as given; the creator's (anyone but the owner) is
   * fenced as their words, a typed answer (`ask-answer`, SAFE-13 scanned
   * when it was submitted) or a picked choice (`ask-pick`) alike.
   */
  private answerBlock(answered: AnsweredScheduleAsk, owner: OwnerRecord | null = this.owner): string {
    const role = this.roleOf(answered.closedBy, owner);
    const how = answered.outcome === "picked" ? "picked on a Discord button" : "typed privately on Discord";
    return [
      `[Prior question this schedule's last run asked (the human answered it, ${how}):`,
      `${answered.question}]`,
      "",
      "Human answer:",
      fenceSpeakerText(
        answered.answer,
        role,
        answered.outcome === "picked" ? "ask-pick" : "ask-answer",
      ),
    ].join("\n");
  }

  /**
   * SAFE-13 (#71): a tick whose schedule text (by anyone but the owner)
   * looks like an injection attempt. Nothing runs: one
   * `[scheduler] SAFE-13` log line, one `injection-suspected` / `denied`
   * SAFE-5 row (actor the creator, surface `scheduler:<id>`, never the
   * text), the run recorded failed with a stuck ask
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
    // Operator log too: a schedule without a channel has no post to carry it.
    console.warn(
      `[scheduler] SAFE-13: schedule ${schedule.id} not run: its text looks like a prompt-injection attempt (${verdict.reasons.join(", ")}); pausing it`,
    );
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
    if (done.ask) await this.postOwnRunAsk(schedule, run, done.ask);
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
