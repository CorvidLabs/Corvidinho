/**
 * Plain verification status for every task result (AGENT-4, #85).
 *
 * AGENT-4: the agent does not say a job is done until the project's verify
 * lane passed, or it says plainly that verification failed. `runTask` puts one
 * of these fixed lines into `TaskResult.summary`, so the CLI, `--json`, and
 * every bridge reply carry it without parsing flags:
 *
 * - changed + lane passed  → leading "Verified: …"
 * - changed + lane failed  → leading "Verification FAILED: … — not done."
 * - changed + gate off     → leading "NOT verified: …" (operator --no-verify /
 *                            verify_before_complete=false; bridges never skip)
 * - no real change         → trailing "No files changed — nothing to verify."
 *
 * The text is fixed templates plus a retry count — never model or lane output —
 * so bridges may surface it on failure without leaking anything (SAFE-6).
 */

export type VerificationOutcome =
  | { kind: "passed" }
  | { kind: "failed"; retries: number }
  | { kind: "gate-off" }
  | { kind: "no-changes" };

export const NO_CHANGES_NOTE = "No files changed — nothing to verify.";

function retriesText(n: number): string {
  return `${n} ${n === 1 ? "retry" : "retries"}`;
}

export function verificationNote(outcome: VerificationOutcome): string {
  switch (outcome.kind) {
    case "passed":
      return "Verified: the project verify lane passed (fledge lanes run verify).";
    case "failed":
      return `Verification FAILED: the project verify lane did not pass after ${retriesText(outcome.retries)} — not done.`;
    case "gate-off":
      return "NOT verified: the verify gate is off (--no-verify or verify_before_complete=false), so the changed files were not checked.";
    case "no-changes":
      return NO_CHANGES_NOTE;
  }
}

/**
 * Put the note into a result summary. Runs that changed files lead with it so
 * truncated chat replies still show it; a no-change reply keeps the answer
 * first and ends with the one-line note.
 */
export function withVerificationNote(
  summary: string,
  outcome: VerificationOutcome,
): string {
  const note = verificationNote(outcome);
  const body = summary.trim();
  if (!body) return note;
  return outcome.kind === "no-changes"
    ? `${body}\n\n${note}`
    : `${note}\n\n${body}`;
}

const FAILED_RE =
  /^Verification FAILED: the project verify lane did not pass after (\d+) retr(?:y|ies) — not done\.$/m;

/**
 * Caller text for a failed agent run (`failed (exit N)`), plus the plain
 * verification-failure line when the run's summary carries one, so a chat or
 * schedule reply says the verify lane failed instead of only an exit code
 * (AGENT-4). The line is rebuilt from the template, never copied from the
 * summary, so model or lane text cannot ride along.
 */
export function describeFailedRun(run: {
  exitCode: number;
  summary: string;
}): string {
  const base = `failed (exit ${run.exitCode})`;
  const m = FAILED_RE.exec(run.summary ?? "");
  if (!m) return base;
  const retries = Number.parseInt(m[1], 10);
  return `${base}\n${verificationNote({ kind: "failed", retries })}`;
}
