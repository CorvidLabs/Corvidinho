/**
 * Prove-before-done task loop (Merlin agent-loop Verifying steal).
 * Planning: SpecSync list/read via spec_loader (SPECSYNC-1/5), and the
 * repo's own ways (AGENT-18, REQ-agent-518).
 * Verifying: fledge lanes run verify (includes spec-check when wired).
 * The gate has no off switch (AGENT-14, REQ-agent-003). In a git work tree
 * the real diff alone decides what changed (AGENT-15, REQ-agent-085), from
 * the talk branch's merge-base when the last run in that talk worktree did
 * not end verified (AGENT-15.a, REQ-agent-015). A passing lane is verified
 * only when its output shows tests ran and no test was deleted or turned off
 * (AGENT-15, REQ-agent-185). In a repo whose SpecSync workflow requires a
 * change, every changed meaningful path must be covered by one first
 * (AGENT-18, REQ-agent-518); on Corvidinho the run then approves and
 * archives the change it opened and verifies again (AGENT-18.a,
 * REQ-agent-519). In a hi repo, any change under hi/ since the session base
 * that approved captures did not make fails verify before the lane
 * (AGENT-18 hi guard, REQ-agent-520 / REQ-agent-522). An idle timeout I set stops a run
 * that went quiet, and the result says when a limit I set stopped it
 * (AGENT-12, REQ-agent-244 / REQ-agent-312; src/agent/limits.ts).
 */

import { relative, resolve } from "node:path";
import {
  blockedTaskResult,
  formatAskSummary,
  stuckAfterVerifyAsk,
} from "./ask.ts";
import { loadBuiltins } from "../plugins/builtins.ts";
import { allowlistFromEnv } from "../plugins/env.ts";
import { runPlugin } from "../plugins/run.ts";
import { loadAgentConfig } from "./config.ts";
import {
  beginSddRun,
  endSddRun,
  formatRepoWaysLine,
  HI_GUARD_UNREADABLE_NOTE,
  hiGuardNote,
  hiRunChanges,
  hiSnapshot,
  mergeScans,
  repoWaysBase,
  scanRepoWays,
  sddRequiresChange,
  sddUncovered,
  sddUncoveredNote,
  settleOwnSddChanges,
  type RepoWaysScan,
  type SddRun,
} from "./repo-ways.ts";
import { loadRelevantSpecs } from "./specLoader.ts";
import {
  defaultVerifyRunner,
  VERIFY_FEEDBACK_MAX_CHARS,
  verifyFeedbackExcerpt,
} from "./verify.ts";
import {
  effectiveIdleTimeoutMs,
  formatIdleDuration,
  IDLE_STOP_GRACE_MS,
  idleTimeoutLine,
  startIdleWatchdog,
  withIdleWatchdog,
} from "./limits.ts";
import { judgeTestEvidence, startTestNameWalk, type TestDropCheck } from "./test-evidence.ts";
import { startWorkspaceDiff, WORKSPACE_DIFF_MAX_FILES } from "./workspace-diff.ts";
import type {
  AgentEvent,
  AgentState,
  RunTaskOptions,
  TaskResult,
  TestDrop,
  WorkspaceDiffTracker,
} from "./types.ts";

/** Changed paths named in the gate's Text note before "…". */
const UNREPORTED_PREVIEW = 5;

/** The one note of a run that changed nothing (AGENT-14, REQ-agent-003). */
export const NOTHING_TO_VERIFY_NOTE = "Verify gate: no changes, nothing to verify.";

/** `a, b, c, …` for a gate note. */
function preview(paths: string[]): string {
  const shown = paths.slice(0, UNREPORTED_PREVIEW).join(", ");
  return paths.length > UNREPORTED_PREVIEW ? `${shown}, …` : shown;
}

/** Start of the feedback a retry gets after a failed verify (AGENT-4.a). */
const VERIFY_FEEDBACK_HEAD =
  "Verification failed. Fix these errors and try again:\n\n";

function emit(
  onEvent: ((e: AgentEvent) => void) | undefined,
  event: AgentEvent,
): void {
  onEvent?.(event);
}

function setState(
  onEvent: ((e: AgentEvent) => void) | undefined,
  state: AgentState,
): void {
  emit(onEvent, { type: "StateChanged", state });
}

/**
 * DISCORD-3.b: a failed verify's plain reason on the result (`error`); the
 * lane's output stays in the summary, never in this line.
 */
export const VERIFY_RERUN_FAILED_REASON =
  "Verification failed when re-run over what approving and archiving its own SpecSync change wrote";

/** DISCORD-3.b: the plain reason of a run that gave up after its verify retries. */
export function verifyGaveUpReason(maxRetries: number): string {
  return `Verification failed after ${maxRetries} retries`;
}

function isAborted(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted);
}

function cancelledResult(
  summary: string,
  filesChanged: string[],
  attempts: number,
): TaskResult {
  return {
    summary,
    filesChanged,
    verified: false,
    verifySkipped: false,
    cancelled: true,
    state: "failed",
    attempts,
  };
}

/**
 * One verify-lane run and its AGENT-15 evidence verdict (REQ-agent-185): a
 * passing lane counts only when its output shows tests ran and no test was
 * deleted or turned off since the baseline; otherwise it is a failed verify
 * whose note leads. Null when the run was aborted (a cancel, not a failed
 * verify — AGENT-3).
 */
async function runLane(
  cwd: string,
  verifyRunner: NonNullable<RunTaskOptions["verifyRunner"]>,
  signal: AbortSignal,
  testCheck: TestDropCheck | null,
  onEvent: ((e: AgentEvent) => void) | undefined,
): Promise<{ result: { success: boolean; output: string }; laneOutput: string; evidenceNote?: string } | null> {
  let result;
  try {
    result = await verifyRunner(cwd, signal);
  } catch (err) {
    if (isAborted(signal)) return null;
    result = {
      success: false,
      output: err instanceof Error ? err.message : String(err),
    };
  }
  // An aborted lane exits non-zero: that is a cancel, not a failed verify
  // (no retry, no stuck ask) — AGENT-3.
  if (isAborted(signal)) return null;

  // AGENT-15 (REQ-agent-185): a passing lane counts as verified only when
  // its output shows tests ran and no test was deleted or turned off since
  // the baseline. Otherwise it is a failed verify like any other (retry
  // with the note first, then failed), with no opt-out (AGENT-14).
  const laneOutput = result.output;
  let evidenceNote: string | undefined;
  if (result.success) {
    let drops: TestDrop[] | null;
    try {
      drops = testCheck ? await testCheck.testDrops() : null;
    } catch {
      drops = null;
    }
    if (isAborted(signal)) return null;
    const verdict = judgeTestEvidence(laneOutput, drops);
    emit(onEvent, { type: "Text", text: verdict.note });
    if (!verdict.ok) {
      evidenceNote = verdict.note;
      result = { success: false, output: `${laneOutput}\n\n${verdict.note}` };
    }
  }
  return { result, laneOutput, ...(evidenceNote ? { evidenceNote } : {}) };
}

/**
 * Run one task through planning → executing → verifying → done|failed.
 * Verifying is skipped only when the run changed nothing (AGENT-14).
 * Does not invent Trust/attest. Injectable execute + verifyRunner for tests.
 */
export async function runTask(opts: RunTaskOptions): Promise<TaskResult> {
  let workspace: WorkspaceDiffTracker | null = null;
  // AGENT-18.a: this run's SpecSync ledger (the changes it opened, and
  // whether its lane is green right now), for the approve and finalize tools.
  const sdd = beginSddRun(opts.cwd);
  // AGENT-12 (REQ-agent-244): the run's idle watchdog. Every event the run
  // emits, tool output and verify-lane output reset it (model calls, workers
  // and Approve-card waits hold it); with no output for that long it aborts
  // the run's signal, so tool and verify-lane process trees are killed.
  // An unusable value (0, negative, NaN) is the default, never an instant stop.
  const watchdog = startIdleWatchdog(effectiveIdleTimeoutMs(opts.idleTimeoutMs));
  const signal = opts.signal
    ? AbortSignal.any([opts.signal, watchdog.signal])
    : watchdog.signal;
  // Once the run stopped waiting for a step that ignored the abort, that
  // step's later events are dropped (the result is already out).
  let abandoned = false;
  const onEvent = (e: AgentEvent) => {
    if (abandoned) return;
    watchdog.touch();
    opts.onEvent?.(e);
  };
  // AGENT-12 (REQ-agent-312): whether the last attempt used up its turn cap.
  let finalTurnCap = false;
  // For a run that stopped waiting on a stuck step: the attempts started and
  // the files the finished attempts reported.
  let attemptsStarted = 0;
  const reported = new Set<string>();
  const execute: RunTaskOptions["execute"] = async (ctx) => {
    attemptsStarted = ctx.attempt;
    finalTurnCap = false;
    const r = await opts.execute(ctx);
    for (const f of r.filesChanged) reported.add(f);
    finalTurnCap = r.stopReason === "turn-cap";
    return r;
  };
  let result: TaskResult;
  try {
    // AGENT-12 (REQ-agent-244): after the watchdog fires, the step the run is
    // on gets IDLE_STOP_GRACE_MS to see the abort and return; one that
    // ignores it (an in-process call with no timeout) is not waited for.
    result = await settleWithinGrace(
      withIdleWatchdog(watchdog, () =>
        gate(
          { ...opts, signal, onEvent, execute },
          (w) => {
            workspace = w;
          },
          sdd,
        ),
      ),
      watchdog.signal,
      IDLE_STOP_GRACE_MS,
      () => {
        abandoned = true;
        return {
          summary: "",
          filesChanged: [...reported],
          verified: false,
          verifySkipped: false,
          cancelled: true,
          state: "failed",
          attempts: attemptsStarted,
        };
      },
    );
  } finally {
    watchdog.stop();
    endSddRun(sdd);
  }
  if (watchdog.fired && !opts.signal?.aborted && !(result.state === "done" && !result.cancelled)) {
    // AGENT-12: stopped for no output — failed, never cancelled, and it says so.
    result = idleTimeoutResult(result, watchdog.timeoutMs, abandoned);
    if (abandoned) {
      opts.onEvent?.({
        type: "Text",
        text: `[operator] AGENT-12: the step the run was on did not stop within ${formatIdleDuration(IDLE_STOP_GRACE_MS)} of the idle timeout, so the run stopped waiting for it.`,
      });
    }
    opts.onEvent?.({ type: "Text", text: result.error ?? idleTimeoutLine(watchdog.timeoutMs) });
    opts.onEvent?.({ type: "StateChanged", state: "failed" });
  } else if (finalTurnCap && !result.cancelled) {
    result = { ...result, stopReason: "turn-cap" };
  }
  // AGENT-15.a (REQ-agent-015): only a `done` run (verified, or nothing to
  // verify) lets the next run in this talk worktree start from its own
  // snapshot; blocked, failed and cancelled runs carry the baseline.
  (workspace as WorkspaceDiffTracker | null)?.settle?.(
    result.state === "done" && !result.cancelled,
  );
  return result;
}

/**
 * AGENT-12 (REQ-agent-244): `work`'s outcome — or, once `fired` has aborted
 * and `work` has not settled `graceMs` later, `abandoned()`, so a step that
 * ignores the abort cannot keep a stopped run from ending.
 */
function settleWithinGrace<T>(
  work: Promise<T>,
  fired: AbortSignal,
  graceMs: number,
  abandoned: () => T,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      timer = setTimeout(() => resolve(abandoned()), graceMs);
    };
    if (fired.aborted) arm();
    else fired.addEventListener("abort", arm, { once: true });
    const settle = () => {
      if (timer) clearTimeout(timer);
      fired.removeEventListener("abort", arm);
    };
    work.then(
      (v) => {
        settle();
        resolve(v);
      },
      (err) => {
        settle();
        reject(err);
      },
    );
  });
}

/** The tool loop's own placeholder for an attempt stopped mid-way (execute.ts). */
const ABORTED_PLACEHOLDER_RE = /^tool loop aborted[^\n]*(?:\n\n|$)/;

/**
 * AGENT-12 (REQ-agent-244): the result of a run the idle watchdog stopped —
 * failed (not cancelled, not verified) with `stopReason` `idle-timeout`, the
 * one-line `error`, and a summary that leads with that line, then the best
 * prose so far (closing notes kept last), and says when its changes were not
 * verified. A run that stopped waiting for a stuck step (`abandoned`) cannot
 * know what that step changed, so it always says its changes were not
 * verified.
 */
function idleTimeoutResult(r: TaskResult, timeoutMs: number, abandoned = false): TaskResult {
  const line = idleTimeoutLine(timeoutMs);
  const unverified =
    r.filesChanged.length > 0
      ? " Its changes so far were not verified."
      : abandoned
      ? " Any changes so far were not verified."
      : "";
  const prose = r.summary.trim().replace(ABORTED_PLACEHOLDER_RE, "").trim();
  const { ask: _ask, ...rest } = r;
  return {
    ...rest,
    summary: prose ? `${line}${unverified}\n\n${prose}` : `${line}${unverified}`,
    verified: false,
    verifySkipped: false,
    cancelled: false,
    state: "failed",
    stopReason: "idle-timeout",
    error: line,
  };
}

/**
 * AGENT-18 (REQ-agent-518): the coverage note when the SpecSync workflow
 * (read now and at the start, merged) requires a change and a changed path
 * has none; null when covered or not required. `paths` null (the diff could
 * not be read) fails closed.
 */
function sddGateNote(cwd: string, scan: RepoWaysScan, paths: string[] | null): string | null {
  if (!sddRequiresChange(scan.sdd)) return null;
  if (paths === null) {
    return "SpecSync gate: could not read what changed, so SpecSync change coverage can't be checked and the run is not verified (AGENT-18).";
  }
  const root = resolve(cwd);
  const rel = paths.map((p) => relative(root, resolve(root, p)));
  const uncovered = sddUncovered(cwd, rel, scan.sdd);
  return uncovered.length > 0 ? sddUncoveredNote(uncovered) : null;
}

/**
 * AGENT-18 hi guard (REQ-agent-520): in a hi repo (`scan`: read at the start
 * and now, merged), the note when anything under hi/ differs from the
 * session base — a criterion, a retired entry or any other file, made by this
 * run or left by an earlier one — or from hi/ at planning when the run has no
 * git base; null when hi/ is unchanged or the repo does not use hi. Only a
 * change approved captures alone explain is left out (REQ-agent-522); every
 * other change blocks, and what can't be read fails closed.
 */
async function hiGateNote(cwd: string, sdd: SddRun, scan: RepoWaysScan): Promise<string | null> {
  if (!scan.ways.hi) return null;
  const changes = await hiRunChanges(cwd, sdd);
  return changes === null ? HI_GUARD_UNREADABLE_NOTE : hiGuardNote(changes);
}

async function gate(
  opts: RunTaskOptions,
  started: (w: WorkspaceDiffTracker | null) => void,
  sdd: SddRun,
): Promise<TaskResult> {
  const onEvent = opts.onEvent;
  const signal = opts.signal ?? new AbortController().signal;
  const fileConfig = opts.config ?? loadAgentConfig(opts.cwd);
  const maxRetries = opts.maxRetries ?? fileConfig.maxRetries;
  const verifyRunner = opts.verifyRunner ?? defaultVerifyRunner;

  let summary = "";
  let filesChanged: string[] = [];
  let attempts = 0;
  let verifyFeedback: string | undefined;
  let specBriefing: string | undefined;
  // Output of the last failed verify, kept for the human-facing summary.
  let lastVerifyFailure: string | undefined;
  let retries = 0;
  // Real-diff paths added to filesChanged so far (capped per run).
  let realDiffAdded = 0;
  // AGENT-15 (REQ-agent-085): tool-claimed paths git has not shown, so far.
  const ghostClaims = new Set<string>();
  // AGENT-4 (REQ-agent-502): tools run so far whose edits no result reports.
  const unreportedEditTools = new Set<string>();

  setState(onEvent, "planning");
  if (isAborted(signal)) {
    return cancelledResult(summary, filesChanged, attempts);
  }

  // Merlin Planning: list → select → read → constraint extract (+ companions)
  const taskText = opts.task?.trim() ?? "";
  if (taskText) {
    try {
      const briefing = loadRelevantSpecs({ cwd: opts.cwd, task: taskText });
      if (briefing) {
        // AGENT-2: the constraints must reach the model, not only the event.
        specBriefing = briefing;
        emit(onEvent, {
          type: "Text",
          text: `Planning: SpecSync briefing\n\n${briefing}`,
        });
      } else {
        emit(onEvent, {
          type: "Text",
          text: "Planning: no SpecSync modules matched task tokens (or registry empty).",
        });
      }
    } catch (err) {
      emit(onEvent, {
        type: "Text",
        text: `Planning: SpecSync briefing skipped (${err instanceof Error ? err.message : String(err)}).`,
      });
    }
  } else {
    emit(onEvent, {
      type: "Text",
      text: "Planning: ready to execute (pass task text for SpecSync briefing).",
    });
  }

  // AGENT-18 (REQ-agent-518): the repo's own ways, read from the session
  // base, HEAD and the working tree; named once, and passed to every attempt.
  try {
    sdd.base = await repoWaysBase(opts.cwd);
    sdd.scan = await scanRepoWays(opts.cwd, sdd.base);
  } catch {
    /* no ways found: the run works as before */
  }
  // AGENT-18 hi guard (REQ-agent-520): with no git session base, hi/ as it
  // is now is what the gate compares against.
  if (!sdd.base) sdd.hiStart = hiSnapshot(opts.cwd);
  const repoWays = sdd.scan.ways;
  const waysLine = formatRepoWaysLine(repoWays);
  if (waysLine) emit(onEvent, { type: "Text", text: waysLine });

  // AGENT-15 (REQ-agent-085): snapshot the git working tree before the first
  // attempt, always; the real diff decides what changed. No git work tree
  // (or an unreadable one) ⇒ null: tool-reported files only, as before.
  let workspace: WorkspaceDiffTracker | null = null;
  try {
    workspace = await (opts.workspaceDiff ?? startWorkspaceDiff)(opts.cwd);
  } catch {
    workspace = null;
  }
  started(workspace);
  const tracker = workspace;
  // AGENT-15 (REQ-agent-185): with no git snapshot, the none-deleted check
  // compares a walk of the project's test files taken now with one taken
  // after the lane passes; a walk that could not finish fails closed.
  let testCheck: TestDropCheck | null = workspace;
  if (!workspace) {
    try {
      testCheck = startTestNameWalk(opts.cwd);
    } catch {
      testCheck = null;
    }
  }
  if (workspace?.carried) {
    emit(onEvent, {
      type: "Text",
      text: "Verify gate: the last run in this talk did not end verified, so every edit since the talk started is checked (from the talk branch's merge-base).",
    });
  }

  for (;;) {
    if (isAborted(signal)) {
      return cancelledResult(summary, filesChanged, attempts);
    }

    setState(onEvent, "executing");
    attempts += 1;
    const exec = await opts.execute({
      attempt: attempts,
      verifyFeedback,
      signal,
      specBriefing,
      ...(repoWays.sdd || repoWays.hi || repoWays.trust ? { repoWays } : {}),
      // AGENT-17 (REQ-agent-087): the real diff decides "nothing changed" for
      // the tool loop's one nudge, as it does for this gate.
      ...(tracker ? { workspaceChanged: () => tracker.changed() } : {}),
    });
    summary = exec.summary;
    // AGENT-4: union across attempts. Files from an attempt whose verify
    // failed stay in the gate, so a retry that changes nothing is verified
    // again and can never be reported done. With a git snapshot only the
    // real diff joins (below); tool claims are checked against it.
    if (!workspace) {
      filesChanged = [...new Set([...filesChanged, ...exec.filesChanged])];
    }
    for (const name of exec.unreportedEditTools ?? []) unreportedEditTools.add(name);

    if (isAborted(signal)) {
      return cancelledResult(summary, filesChanged, attempts);
    }

    // AUTONOMY-1: the agent asked the human — blocked, not done, no verify.
    if (exec.ask) {
      setState(onEvent, "blocked");
      return blockedTaskResult({ ...exec, filesChanged, ask: exec.ask }, attempts);
    }

    // AGENT-4/8: a provider / HTTP failure is a failed run, never done.
    if (exec.error) {
      setState(onEvent, "failed");
      // AGENT-4: a verify that already failed is still said plainly, so the
      // provider error does not hide failing files left on disk.
      const verifyNote =
        lastVerifyFailure === undefined
          ? ""
          : `\n\nVerification failed on an earlier attempt and was not re-run:\n${lastVerifyFailure}`;
      return {
        summary: `${summary}${verifyNote}`,
        filesChanged,
        verified: false,
        verifySkipped: false,
        cancelled: false,
        state: "failed",
        attempts,
        // DISCORD-3.b: the attempt's plain harness reason (no provider, or
        // which model call failed and how), never the model's text.
        ...(exec.failureReason ? { error: exec.failureReason } : {}),
      };
    }

    // AGENT-15 (REQ-agent-085): the run's real git diff decides what
    // changed, so an edit made outside the file tools (code-tier shell-exec,
    // a delegate worker, a commit through a shell) is verified too, and a
    // path a tool claims but git does not show (gitignored, a nested repo, a
    // write that changed nothing) is not listed yet still runs the lane
    // (fail closed). A diff git cannot read after a good snapshot fails
    // closed: verify runs.
    let diffUnreadable = false;
    // AGENT-18: the real diff since the baseline, for SpecSync coverage.
    let sddPaths: string[] | null = workspace ? null : filesChanged;
    if (workspace) {
      let real: string[] | null;
      try {
        real = await workspace.changed();
      } catch {
        real = null;
      }
      if (isAborted(signal)) {
        return cancelledResult(summary, filesChanged, attempts);
      }
      const root = resolve(opts.cwd);
      const claimed = [
        ...new Set(exec.filesChanged.map((f) => relative(root, resolve(root, f)))),
      ];
      if (real === null) {
        diffUnreadable = true;
        emit(onEvent, {
          type: "Text",
          text: "Verify gate: could not read the git working-tree diff, so verifying anyway.",
        });
      } else {
        sddPaths = real;
        const inDiff = new Set(real);
        const claimedSet = new Set(claimed);
        const listed = new Set(filesChanged);
        const fresh = real.filter((p) => !listed.has(p));
        const unreported = fresh.filter((p) => !claimedSet.has(p));
        // Bounded so a huge diff (an install, a branch switch) cannot push
        // the NDJSON result line past the parser cap and lose the reply.
        // The gate is unaffected: filesChanged is non-empty either way.
        const added = fresh.slice(0, Math.max(0, WORKSPACE_DIFF_MAX_FILES - realDiffAdded));
        const capped =
          added.length < fresh.length
            ? `; ${added.length} of the ${fresh.length} changed path(s) listed in filesChanged`
            : "";
        if (unreported.length > 0) {
          emit(onEvent, {
            type: "Text",
            text: `Verify gate: the git working tree has ${unreported.length} changed path(s) no tool reported (${preview(unreported)})${capped}.`,
          });
        } else if (capped) {
          emit(onEvent, {
            type: "Text",
            text: `Verify gate: the git working tree has ${fresh.length} changed path(s)${capped}.`,
          });
        }
        filesChanged = [...filesChanged, ...added];
        realDiffAdded += added.length;
        const ghosts = claimed.filter((p) => !inDiff.has(p) && !ghostClaims.has(p));
        if (ghosts.length > 0) {
          for (const p of ghosts) ghostClaims.add(p);
          emit(onEvent, {
            type: "Text",
            text: `Verify gate: ${ghosts.length} path(s) a tool reported changing are not in the git diff (${preview(ghosts)}), so they are not listed as changed, but verifying anyway.`,
          });
        }
      }
    }

    // AGENT-4 (REQ-agent-502): no git snapshot to diff, and a tool ran that
    // can change files without reporting them (a Fledge command, or a
    // delegate worker that may have run one): fail closed, verify runs.
    let noDiffForUnreported = false;
    if (!workspace && filesChanged.length === 0 && unreportedEditTools.size > 0) {
      noDiffForUnreported = true;
      emit(onEvent, {
        type: "Text",
        text: `Verify gate: no git working tree to diff, and ${[...unreportedEditTools].join(", ")} may have changed files no tool reported, so verifying anyway.`,
      });
    }

    // AGENT-14: no switch turns this off. Once a verify failed, every later
    // attempt is verified again (REQ-agent-242).
    const wantVerify =
      filesChanged.length > 0 ||
      ghostClaims.size > 0 ||
      diffUnreadable ||
      noDiffForUnreported ||
      lastVerifyFailure !== undefined;

    if (!wantVerify) {
      emit(onEvent, { type: "Text", text: NOTHING_TO_VERIFY_NOTE });
      setState(onEvent, "done");
      return {
        summary,
        filesChanged,
        verified: false,
        verifySkipped: true,
        cancelled: false,
        state: "done",
        attempts,
      };
    }

    setState(onEvent, "verifying");

    // AGENT-18 (REQ-agent-518): in a repo whose SpecSync workflow requires a
    // change for meaningful files, a changed one no open change covers fails
    // this verify before the lane runs (retry with the note, then failed).
    // AGENT-18 hi guard (REQ-agent-520): in a hi repo, so does any change
    // under hi/ since the session base. Both read the ways from the start
    // and now, merged (the start alone if a scan now fails), and each fails
    // closed when its way is on.
    let scanNow: RepoWaysScan = sdd.scan;
    try {
      scanNow = mergeScans([sdd.scan, await scanRepoWays(opts.cwd, sdd.base)]);
    } catch {
      /* the start scan still decides */
    }
    const gateNotes: string[] = [];
    try {
      const note = sddGateNote(opts.cwd, scanNow, sddPaths);
      if (note) gateNotes.push(note);
    } catch {
      if (sddRequiresChange(scanNow.sdd)) {
        gateNotes.push("SpecSync gate: could not check SpecSync change coverage, so the run is not verified (AGENT-18).");
      }
    }
    try {
      const note = await hiGateNote(opts.cwd, sdd, scanNow);
      if (note) gateNotes.push(note);
    } catch {
      if (scanNow.ways.hi) gateNotes.push(HI_GUARD_UNREADABLE_NOTE);
    }
    if (isAborted(signal)) {
      return cancelledResult(summary, filesChanged, attempts);
    }

    let result: { success: boolean; output: string };
    let laneOutput: string;
    let evidenceNote: string | undefined;
    if (gateNotes.length > 0) {
      for (const text of gateNotes) emit(onEvent, { type: "Text", text });
      const gateNote = gateNotes.join("\n\n");
      evidenceNote = gateNote;
      laneOutput = "";
      result = { success: false, output: gateNote };
    } else {
      emit(onEvent, {
        type: "Text",
        text: "Running fledge lanes run verify --non-interactive (includes spec-check)…",
      });

      if (isAborted(signal)) {
        return cancelledResult(summary, filesChanged, attempts);
      }

      const lane = await runLane(opts.cwd, verifyRunner, signal, testCheck, onEvent);
      if (lane === null) return cancelledResult(summary, filesChanged, attempts);
      ({ result, laneOutput, evidenceNote } = lane);
    }

    emit(onEvent, {
      type: "VerifyResult",
      success: result.success,
      output: result.output,
    });

    if (result.success) {
      // AGENT-18.a (REQ-agent-519): right after the green lane, settle the
      // SpecSync changes this run opened — on Corvidinho approve and archive
      // them through the approve and finalize tools (every tool gate
      // applies), elsewhere say a human does. What that wrote is verified
      // again before the run is done.
      if (sdd.opened.length > 0) {
        const settled = await settleOwnSddChanges({
          cwd: opts.cwd,
          run: sdd,
          call: (name, args) => {
            loadBuiltins();
            return runPlugin({
              name,
              args,
              cwd: opts.cwd,
              nonInteractive: true,
              allowlist: allowlistFromEnv(),
              signal,
            });
          },
          onText: (text) => emit(onEvent, { type: "Text", text }),
        });
        if (isAborted(signal)) {
          return cancelledResult(summary, filesChanged, attempts);
        }
        if (settled.changed) {
          emit(onEvent, {
            type: "Text",
            text: "Running fledge lanes run verify --non-interactive again over the SpecSync records it wrote…",
          });
          const again = await runLane(opts.cwd, verifyRunner, signal, testCheck, onEvent);
          if (again === null) return cancelledResult(summary, filesChanged, attempts);
          emit(onEvent, {
            type: "VerifyResult",
            success: again.result.success,
            output: again.result.output,
          });
          if (!again.result.success) {
            const failure = again.evidenceNote
              ? `${again.evidenceNote}\n\n${again.laneOutput}`
              : again.result.output;
            setState(onEvent, "failed");
            return {
              summary: `${summary}\n\nVerification failed when re-run over what approving and archiving its own SpecSync change wrote:\n${failure}`,
              filesChanged,
              verified: false,
              verifySkipped: false,
              cancelled: false,
              state: "failed",
              attempts,
              error: VERIFY_RERUN_FAILED_REASON,
            };
          }
        }
      }
      setState(onEvent, "done");
      return {
        summary,
        filesChanged,
        verified: true,
        verifySkipped: false,
        cancelled: false,
        state: "done",
        attempts,
      };
    }

    // The note leads, so a summary or feedback cut to its head keeps it.
    const failure = evidenceNote
      ? laneOutput
        ? `${evidenceNote}\n\n${laneOutput}`
        : evidenceNote
      : result.output;
    lastVerifyFailure = failure;
    retries += 1;
    if (retries > maxRetries) {
      emit(onEvent, {
        type: "Text",
        text: `Verification failed after ${maxRetries} retries — giving up.`,
      });
      setState(onEvent, "failed");
      // AUTONOMY-2: stuck — still failed (AGENT-4), plus a question for a human.
      const ask = stuckAfterVerifyAsk(maxRetries);
      return {
        summary: `${summary}\n\nVerification failed after ${maxRetries} retries:\n${failure}\n\n${formatAskSummary(ask)}`,
        filesChanged,
        verified: false,
        verifySkipped: false,
        cancelled: false,
        state: "failed",
        attempts,
        ask,
        error: verifyGaveUpReason(maxRetries),
      };
    }

    emit(onEvent, {
      type: "Text",
      text: `Verify retry ${retries}/${maxRetries}…`,
    });
    // AGENT-4.a: the retry gets the failing step's output. Passing steps
    // (typecheck, a --help smoke) can fill the cap before a failing test, so
    // a long log keeps the failing step and the end, never its first chars.
    if (evidenceNote) {
      // AGENT-15: the lane passed; the note says what is missing, and the
      // rest of the cap carries the lane's output. AGENT-18: an uncovered
      // SpecSync path or a hi/ change ran no lane, so the note is the whole
      // feedback.
      const head = `${VERIFY_FEEDBACK_HEAD}${evidenceNote}`;
      const room = VERIFY_FEEDBACK_MAX_CHARS - head.length - 2;
      verifyFeedback =
        room > 0 && laneOutput ? `${head}\n\n${verifyFeedbackExcerpt(laneOutput, room)}` : head;
    } else {
      verifyFeedback = `${VERIFY_FEEDBACK_HEAD}${verifyFeedbackExcerpt(
        result.output,
        VERIFY_FEEDBACK_MAX_CHARS - VERIFY_FEEDBACK_HEAD.length,
      )}`;
    }
    // loop → Executing
  }
}
