/**
 * CI state for a PR or ref (GITHUB-4): check runs + legacy commit statuses,
 * reduced to one verdict. Pure helpers take an Octokit-shaped client so tests
 * can pass a fake without network or tokens.
 */

export type CiVerdict = "green" | "red" | "pending" | "none";

/** Per-row bucket; name kept from the original `gh pr checks`-shaped output. */
export type CiBucket = "pass" | "fail" | "pending" | "skipping";

export type CiTarget = { kind: "pr"; number: number } | { kind: "ref"; ref: string };

/** One check run or commit status. `name/state/bucket/link` are the original fields. */
export type CiRow = {
  name: string;
  state: string;
  bucket: CiBucket;
  link: string | null;
  kind: "check" | "status";
  status: string;
  conclusion: string | null;
};

export type CiCounts = {
  total: number;
  pass: number;
  fail: number;
  pending: number;
  skipping: number;
};

export type CiStatusData = {
  target: "pr" | "ref";
  pr: number | null;
  ref: string;
  sha: string | null;
  verdict: CiVerdict;
  counts: CiCounts;
  checks: CiRow[];
  truncated: boolean;
  warnings: string[];
};

type CheckRunLike = {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string | null;
};

type StatusLike = {
  state: string;
  context: string;
  target_url: string | null;
};

/** The slice of Octokit this module calls (real `Octokit` satisfies it). */
export type CiOctokit = {
  rest: {
    pulls: {
      get(params: {
        owner: string;
        repo: string;
        pull_number: number;
      }): Promise<{ data: { head: { sha: string; ref: string } } }>;
    };
    checks: {
      listForRef(params: {
        owner: string;
        repo: string;
        ref: string;
        per_page: number;
        page: number;
      }): Promise<{ data: { total_count: number; check_runs: CheckRunLike[] } }>;
    };
    repos: {
      getCommit(params: {
        owner: string;
        repo: string;
        ref: string;
        per_page: number;
      }): Promise<{ data: { sha: string } }>;
      getCombinedStatusForRef(params: {
        owner: string;
        repo: string;
        ref: string;
        per_page: number;
        page: number;
      }): Promise<{ data: { sha: string; total_count: number; statuses: StatusLike[] } }>;
    };
  };
};

const PER_PAGE = 100;
/** Hard stop on paging (1000 rows per source); `truncated` reports a hit. */
export const CI_MAX_PAGES = 10;
/** Digits-only selectors up to this length are PR numbers; longer ones are refs (short SHAs). */
const MAX_PR_DIGITS = 9;
const MAX_REF_LENGTH = 255;

const FAIL_CONCLUSIONS = new Set(["failure", "cancelled", "timed_out", "action_required"]);
const SKIP_CONCLUSIONS = new Set(["skipped", "neutral"]);

/**
 * Validate a branch / tag / SHA ref using git ref-name rules
 * (`git check-ref-format`). Option-looking values are refused outright.
 * Returns an error message, or null when the ref is acceptable.
 */
export function validateCiRef(ref: string): string | null {
  if (!ref) return "ref must not be empty";
  if (ref.length > MAX_REF_LENGTH) return `ref too long (max ${MAX_REF_LENGTH} chars)`;
  if (ref.startsWith("-")) {
    return `refusing option-looking ref: ${JSON.stringify(ref)}`;
  }
  if (/[\x00-\x20\x7f~^:?*[\\]/.test(ref)) {
    return `invalid ref (whitespace, control or ~^:?*[\\ characters): ${JSON.stringify(ref)}`;
  }
  if (ref === "@" || ref.includes("..") || ref.includes("@{") || ref.includes("//")) {
    return `invalid ref: ${JSON.stringify(ref)}`;
  }
  if (ref.startsWith("/") || ref.endsWith("/") || ref.endsWith(".")) {
    return `invalid ref: ${JSON.stringify(ref)}`;
  }
  for (const part of ref.split("/")) {
    if (part.startsWith(".") || part.endsWith(".lock")) {
      return `invalid ref: ${JSON.stringify(ref)}`;
    }
  }
  return null;
}

/**
 * `<number>` ⇒ PR (1–9 digits, positive); anything else ⇒ ref (branch, tag or SHA).
 * A digits-only branch or tag can be named as `heads/<name>` / `tags/<name>`.
 */
export function parseCiSelector(
  selector: string,
): { ok: true; target: CiTarget } | { ok: false; error: string } {
  if (/^\d+$/.test(selector) && selector.length <= MAX_PR_DIGITS) {
    const n = Number(selector);
    if (n < 1) {
      return {
        ok: false,
        error: "PR number must be positive (use heads/<name> or tags/<name> for a digits-only ref)",
      };
    }
    return { ok: true, target: { kind: "pr", number: n } };
  }
  const err = validateCiRef(selector);
  if (err) return { ok: false, error: err };
  return { ok: true, target: { kind: "ref", ref: selector } };
}

function checkBucket(conclusion: string | null): CiBucket {
  if (!conclusion) return "pending";
  if (conclusion === "success") return "pass";
  if (SKIP_CONCLUSIONS.has(conclusion)) return "skipping";
  if (FAIL_CONCLUSIONS.has(conclusion)) return "fail";
  // e.g. "stale": not finished, never counted as green.
  return "pending";
}

function statusBucket(state: string): CiBucket {
  if (state === "success") return "pass";
  if (state === "failure" || state === "error") return "fail";
  return "pending";
}

export function checkRunRow(c: CheckRunLike): CiRow {
  return {
    name: c.name,
    state: (c.conclusion || c.status || "").toUpperCase(),
    bucket: checkBucket(c.conclusion),
    link: c.html_url,
    kind: "check",
    status: c.status,
    conclusion: c.conclusion,
  };
}

export function commitStatusRow(s: StatusLike): CiRow {
  const pending = s.state === "pending";
  return {
    name: s.context,
    state: (s.state || "").toUpperCase(),
    bucket: statusBucket(s.state),
    link: s.target_url,
    kind: "status",
    status: pending ? "pending" : "completed",
    conclusion: pending ? null : s.state,
  };
}

export function countBuckets(rows: readonly CiRow[]): CiCounts {
  const counts: CiCounts = { total: rows.length, pass: 0, fail: 0, pending: 0, skipping: 0 };
  for (const r of rows) counts[r.bucket]++;
  return counts;
}

/** red > pending > green; no rows at all ⇒ none. */
export function ciVerdict(rows: readonly CiRow[]): CiVerdict {
  if (rows.length === 0) return "none";
  if (rows.some((r) => r.bucket === "fail")) return "red";
  if (rows.some((r) => r.bucket === "pending")) return "pending";
  return "green";
}

function httpStatus(e: unknown): number | undefined {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
}

/**
 * True only for a 403 that means "this token may not read commit statuses".
 * Rate limits (primary: `x-ratelimit-remaining: 0`; secondary: `retry-after`
 * or a rate-limit message) and SSO/SAML enforcement also answer 403, but the
 * statuses are merely unread there, so those errors must propagate.
 */
export function isStatusesPermissionDenied(e: unknown): boolean {
  if (httpStatus(e) !== 403) return false;
  const err = e as { message?: unknown; response?: { headers?: Record<string, unknown> } };
  const headers = err.response?.headers ?? {};
  const header = (k: string): string | undefined => {
    const v = headers[k];
    return v == null ? undefined : String(v);
  };
  if (header("x-ratelimit-remaining") === "0") return false;
  if (header("retry-after") !== undefined) return false;
  if (header("x-github-sso") !== undefined) return false;
  const msg = typeof err.message === "string" ? err.message : "";
  return !/rate limit|abuse|SAML|\bSSO\b/i.test(msg);
}

async function listCheckRuns(
  octokit: CiOctokit,
  owner: string,
  repo: string,
  ref: string,
): Promise<{ runs: CheckRunLike[]; truncated: boolean }> {
  const runs: CheckRunLike[] = [];
  for (let page = 1; page <= CI_MAX_PAGES; page++) {
    const res = await octokit.rest.checks.listForRef({ owner, repo, ref, per_page: PER_PAGE, page });
    runs.push(...res.data.check_runs);
    if (res.data.check_runs.length < PER_PAGE || runs.length >= res.data.total_count) {
      return { runs, truncated: false };
    }
  }
  return { runs, truncated: true };
}

async function listCommitStatuses(
  octokit: CiOctokit,
  owner: string,
  repo: string,
  ref: string,
): Promise<{ statuses: StatusLike[]; truncated: boolean }> {
  const statuses: StatusLike[] = [];
  for (let page = 1; page <= CI_MAX_PAGES; page++) {
    const res = await octokit.rest.repos.getCombinedStatusForRef({
      owner,
      repo,
      ref,
      per_page: PER_PAGE,
      page,
    });
    statuses.push(...res.data.statuses);
    if (res.data.statuses.length < PER_PAGE || statuses.length >= res.data.total_count) {
      return { statuses, truncated: false };
    }
  }
  return { statuses, truncated: true };
}

/**
 * Pin the target to one commit (PR head SHA, or the ref resolved through
 * `repos.getCommit`), read check runs and the combined commit status for that
 * SHA, and reduce them to one verdict. Check-run errors propagate; a
 * permission 403 on commit statuses (token without that scope) degrades to
 * check runs only with a warning, while rate-limit / SSO 403s propagate. A
 * truncated listing never reports `green` (unseen rows may fail): it is
 * reported as `pending`.
 */
export async function fetchCiStatus(
  octokit: CiOctokit,
  opts: { owner: string; repo: string; target: CiTarget },
): Promise<CiStatusData> {
  const { owner, repo, target } = opts;
  let sha: string;
  let label: string;
  if (target.kind === "pr") {
    const pr = await octokit.rest.pulls.get({ owner, repo, pull_number: target.number });
    sha = pr.data.head.sha;
    label = pr.data.head.ref;
  } else {
    // A branch name moves: resolve it once so every page reads the same commit.
    const commit = await octokit.rest.repos.getCommit({ owner, repo, ref: target.ref, per_page: 1 });
    sha = commit.data.sha;
    label = target.ref;
  }

  const warnings: string[] = [];
  const [checks, statuses] = await Promise.all([
    listCheckRuns(octokit, owner, repo, sha),
    listCommitStatuses(octokit, owner, repo, sha).catch((e: unknown) => {
      if (!isStatusesPermissionDenied(e)) throw e;
      warnings.push("commit statuses not readable (403); verdict covers check runs only");
      return { statuses: [] as StatusLike[], truncated: false };
    }),
  ]);

  const rows = [...checks.runs.map(checkRunRow), ...statuses.statuses.map(commitStatusRow)];
  const truncated = checks.truncated || statuses.truncated;
  let verdict = ciVerdict(rows);
  if (truncated) {
    let w = `more than ${CI_MAX_PAGES * PER_PAGE} rows; list truncated`;
    // Unseen rows may fail, so a truncated listing is never reported green.
    if (verdict === "green") {
      verdict = "pending";
      w += " (verdict pending: unlisted rows not seen)";
    }
    warnings.push(w);
  }

  return {
    target: target.kind,
    pr: target.kind === "pr" ? target.number : null,
    ref: label,
    sha,
    verdict,
    counts: countBuckets(rows),
    checks: rows,
    truncated,
    warnings,
  };
}

/**
 * One-line human summary, e.g. `CI red for PR #12 (feat/x) @ abc1234: 3 checks ...`.
 * Warnings are appended for every verdict (including `none`) so human CLI
 * output never drops them.
 */
export function ciStatusMessage(d: CiStatusData): string {
  const what = d.pr != null ? `PR #${d.pr} (${d.ref})` : d.ref;
  const at = d.sha ? ` @ ${d.sha.slice(0, 7)}` : "";
  let msg: string;
  if (d.verdict === "none") {
    msg = `CI none for ${what}${at}: no check runs or commit statuses reported`;
  } else {
    const c = d.counts;
    msg =
      `CI ${d.verdict} for ${what}${at}: ${c.total} check${c.total === 1 ? "" : "s"}` +
      ` (pass ${c.pass}, fail ${c.fail}, pending ${c.pending}, skipping ${c.skipping})`;
    const failing = d.checks.filter((r) => r.bucket === "fail").map((r) => r.name);
    if (failing.length) {
      const shown = failing.slice(0, 5).join(", ");
      msg += `; failing: ${shown}${failing.length > 5 ? `, +${failing.length - 5} more` : ""}`;
    }
  }
  if (d.warnings.length) msg += `; warning: ${d.warnings.join("; ")}`;
  return msg;
}
