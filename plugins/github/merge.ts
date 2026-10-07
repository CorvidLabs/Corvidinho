/**
 * GITHUB-7 / GITHUB-7.a (#124, #99) — `github-pr-merge`: it may merge its own
 * Corvidinho PR when I ask and every gate is green; it never merges a PR that
 * changes its own gates, never someone else's PR, and outside Corvidinho a
 * human still merges.
 *
 * The tool is dangerous (SAFE-1 allowlist, SAFE-5 audit) and mutating, so the
 * role gate keeps it the owner's (IDENTITY-9..12). On top of that
 * {@link selfMergeCallerRefusal} re-checks, at every call, that this is the
 * owner's own interactive run: the owner's Discord chat, `/session start`,
 * `/work` or an ask answer of one, or the local CLI nothing spawned — never
 * team, community, WATCH (the owner's own GitHub-triggered run included,
 * though IDENTITY-12.a gives it the owner's other tools), a schedule (the
 * owner's own included) or a delegate / council worker. The tool catalog
 * offers it only to such a run (src/agent/execute.ts).
 *
 * {@link checkSelfMerge} is the gate. It refuses unless every one holds, read
 * fresh from GitHub:
 * - the repo is Corvidinho itself ({@link SELF_MERGE_REPO}); outside it a
 *   human still merges (GITHUB-7);
 * - the PR is open, its head is a `talk/…` branch of a Corvidinho talk
 *   ({@link TALK_BRANCH_RE}) in the same repo, and its author is the token's
 *   own user (author id and login == the token's user id and login): it
 *   merges only PRs it opened from its own talk branches with its own token;
 * - the PR is not a draft, its own token never marked it ready, and the last
 *   to mark it ready was a person (not its own token, not an app) (it never
 *   marks its own /work draft ready, and this tool has no way to; a PR it
 *   opened ready waits for a person too);
 * - the head is still the sha the caller named (`--sha`), so the card and
 *   the merge are about the same commit;
 * - no changed path (renames' old paths included) is one of its own gates
 *   ({@link selfMergeGatePath}), and the file list is complete;
 * - no reviewer's latest review requests changes;
 * - `smoke` and `spec-sync` ({@link SELF_MERGE_CHECKS}, GitHub Actions) each
 *   ran and passed at exactly that head, and the whole CI verdict there is
 *   green with nothing pending or unread (the CI half of "verify and CI are
 *   green": those two jobs run every verify-lane step — typecheck, smoke,
 *   tests and the SpecSync check);
 * - GitHub says the PR is mergeable and branch protection, reviews and
 *   CODEOWNERS allow it now (`mergeable_state` `clean` or `has_hooks`), so
 *   the merge never leans on an admin bypass.
 *
 * "Only when I ask": the command's must-ask classifier runs the gate and,
 * when it passes, raises the owner's Approve card (`mustask-merge`, class
 * destructive: Approve plus the one-time code, src/plugins/must-ask.ts); a
 * failing gate refuses with no card. After the approval the handler runs the
 * whole gate again and squash-merges through the normal merge API with the
 * expected head sha (`pulls.merge`, never an admin or bypass flag), titled
 * with the PR title; the reply names the merge sha (a run stopped before
 * that call merges nothing). Squash is the only method (`--method squash` is
 * accepted, `merge` / `rebase` are refused), so a self-merge is one commit
 * on main titled `<title> (#N)`. Every attempt leaves a
 * SAFE-5 row: `denied` under `github-pr-merge:<reason>`, or `started` then
 * `ok` / `error` (src/plugins/run.ts).
 */

import { Octokit } from "@octokit/rest";
import { CORVIDINHO_REPO } from "../../src/agent/repo-ways.ts";
import {
  ACTING_SURFACE_ENV,
  SAFE3A_SURFACES,
  TOOL_CHILD_ENV,
  actingSurface,
} from "../../src/agent/shell-gate.ts";
import { delegateDepthFromEnv } from "../../src/autonomous/delegate.ts";
import { checkRepoGateForActingRole } from "../../src/plugins/githubPublic.ts";
import { isScheduleRunEnv, isWatchRunEnv, resolveActingRole, roleSessionActive } from "../../src/plugins/roles.ts";
import type {
  MustAskVerdict,
  PluginCommand,
  PluginHandlerArgs,
  PluginHandlerResult,
} from "../../src/plugins/types.ts";
import { scrubSecrets } from "../../src/store/scrub.ts";
import { createOctokit, splitOwnerRepo, type ApiResult } from "./api.ts";
import { fetchCiStatus, type CiOctokit } from "./ciStatus.ts";

/** The tool's name. */
export const SELF_MERGE_TOOL = "github-pr-merge";

/** The only repo it merges in (GITHUB-7: outside Corvidinho a human still merges). */
export const SELF_MERGE_REPO = CORVIDINHO_REPO;

/** True when OWNER/REPO is Corvidinho itself ({@link SELF_MERGE_REPO}), compared without case. */
export function isCorvidinhoRepoSlug(owner: string, repo: string): boolean {
  return `${owner}/${repo}`.toLowerCase() === SELF_MERGE_REPO.toLowerCase();
}

/** True when a `full_name` (`OWNER/REPO`) is Corvidinho itself. */
function isCorvidinhoFullName(fullName: string | undefined | null): boolean {
  const parts = splitOwnerRepo(fullName ?? "");
  return parts !== null && isCorvidinhoRepoSlug(parts.owner, parts.name);
}

/** The only merge method it uses: one commit on main per PR, titled `<title> (#N)`. */
export const SELF_MERGE_METHOD = "squash" as const;

/** The check runs that make CI green at the head (GITHUB-7.a), as the repo's workflows name them. */
export const SELF_MERGE_CHECKS = ["smoke", "spec-sync"] as const;

/** The app those check runs must come from (`.github/workflows/ci.yml`, `spec-sync.yml`). */
export const SELF_MERGE_CHECK_APP = "github-actions";

/**
 * A Corvidinho talk branch, as `generateTalkBranchName`
 * (src/worktree/manager.ts) names it for a chat, `/session`, `/work`,
 * schedule or local CLI talk: `talk/<up to 16 id chars>-<16 hex digest>`.
 */
export const TALK_BRANCH_RE = /^talk\/[A-Za-z0-9_-]{1,16}-[0-9a-f]{16}$/;

/**
 * The files that hold the self-merge gate (a PR changing one waits for a
 * human): this tool, its registration (`plugins/github/index.ts` registers
 * it before every other GitHub command, so nothing else can take the name),
 * the CI verdict it reads, its GitHub client and owner/repo split, the repo
 * it merges in (`CORVIDINHO_REPO`), the repo gate, the caller and role
 * checks (roles, surfaces, worker depth), the must-ask gate and its audit
 * rows, and the Approve card's store, one-time code and engine.
 */
export const SELF_MERGE_CODE: readonly string[] = [
  "plugins/github/merge.ts",
  "plugins/github/index.ts",
  "plugins/github/ciStatus.ts",
  "plugins/github/api.ts",
  "src/agent/repo-ways.ts",
  "src/autonomous/delegate.ts",
  "src/plugins/githubPublic.ts",
  "src/plugins/must-ask.ts",
  "src/plugins/run.ts",
  "src/plugins/roles.ts",
  "src/agent/shell-gate.ts",
  "src/approvals/code.ts",
  "src/approvals/store.ts",
  "src/discord/approval-cards.ts",
];

/** `mergeable_state` values that mean nothing in branch protection is unmet. */
const MERGEABLE_STATES: ReadonlySet<string> = new Set(["clean", "has_hooks"]);

const SHA_RE = /^[0-9a-f]{40}$/;
const PER_PAGE = 100;
/** GitHub lists at most 3000 files for a PR. */
const FILE_PAGES = 30;
const LIST_PAGES = 10;

const RULE = "GITHUB-7.a";
const LEAVE = "leave it for a human merge";

// ------------------------------------------------------------------ gates

/**
 * Why a changed path is one of its own gates (GITHUB-7.a), else null:
 * CI (`.github/`), the verify lane (`fledge.toml`, `.fledge/`), the
 * criteria (`hi/`), `AGENTS.md` (and `CLAUDE.md`, the other project
 * instructions file every run loads, AGENT-1), `CODEOWNERS`, the gate files
 * it already protects (SAFE-2): the Trust step of the verify gate
 * (`.trust.toml`), the test runtime config (`bunfig.toml`), SpecSync's own
 * config (`.specsync/` outside `changes/` and `archive/`), the verify lane's
 * typecheck config (`tsconfig.json`, read by `bunx tsc --noEmit` in the lane
 * and in CI), and the self-merge gate itself ({@link SELF_MERGE_CODE}). Names
 * compare without case, and `fledge.toml`, `.trust.toml`, `AGENTS.md`,
 * `CLAUDE.md`, `CODEOWNERS`, `bunfig.toml` and `tsconfig.json` count in any
 * folder.
 */
export function selfMergeGatePath(path: string): string | null {
  const norm = path.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
  const lower = norm
    .split("/")
    .filter((p) => p.length > 0 && p !== ".")
    .map((p) => p.toLowerCase());
  const first = lower[0] ?? "";
  const base = lower[lower.length - 1] ?? "";
  if (first === ".github") return "CI (.github/)";
  if (first === "hi") return "the criteria (hi/)";
  if (base === "fledge.toml") return "the verify lane (fledge.toml)";
  if (lower.includes(".fledge")) return "the verify lane (.fledge/)";
  if (base === ".trust.toml") return "the verify gate's Trust step (.trust.toml)";
  if (base === "agents.md") return "AGENTS.md";
  if (base === "claude.md") return "the project instructions (CLAUDE.md)";
  if (base === "codeowners") return "CODEOWNERS";
  if (base === "bunfig.toml" || base === ".bunfig.toml") return "the test runtime config (bunfig.toml)";
  if (base === "tsconfig.json") return "the verify lane's typecheck config (tsconfig.json)";
  if (first === ".specsync" && lower[1] !== "changes" && lower[1] !== "archive") {
    return "the SpecSync check's config (.specsync/)";
  }
  const joined = lower.join("/");
  if (SELF_MERGE_CODE.some((f) => f.toLowerCase() === joined)) return "the self-merge gate itself";
  return null;
}

/** A refusal: a fixed reason code (the audit row's) and one plain line. */
export type SelfMergeRefusal = { code: string; why: string };

/**
 * GITHUB-7.a "only when I ask": why this run may not merge, else null. Only
 * the owner's own interactive runs may: a role session started from the
 * owner's Discord chat, `/session start`, `/work` or an ask answer of one
 * (the role re-resolved now, IDENTITY-12), or the local CLI nothing spawned
 * (no role session, no Discord session or surface stamp, not started from
 * inside a tool). Never throws; any doubt refuses.
 */
export async function selfMergeCallerRefusal(
  env: NodeJS.ProcessEnv = process.env,
): Promise<SelfMergeRefusal | null> {
  try {
    if (delegateDepthFromEnv(env) > 0) {
      return { code: "worker", why: "a delegate or council worker never merges" };
    }
    // A WATCH run never merges, the owner's own GitHub-triggered one included
    // (IDENTITY-12.a gives that run the owner's other tools): it is not the
    // owner's own interactive run.
    if ((env.CORVIDINHO_WATCH_SESSION_ID ?? "").trim() || isWatchRunEnv(env)) {
      return { code: "watch", why: "a WATCH (GitHub) run never merges, the owner's own included" };
    }
    if (isScheduleRunEnv(env)) {
      return { code: "schedule", why: "a scheduled run never merges, the owner's own included" };
    }
    if (!roleSessionActive(env)) {
      if ((env.CORVIDINHO_DISCORD_SESSION_ID ?? "").trim() || (env[ACTING_SURFACE_ENV] ?? "").trim()) {
        return {
          code: "spawned",
          why: "a run with no role session merges only as the owner's local CLI, and this one carries a Discord session or surface stamp",
        };
      }
      if (env[TOOL_CHILD_ENV] !== undefined) {
        return { code: "spawned", why: "a run started from inside a tool never merges" };
      }
      return null;
    }
    const surface = actingSurface(env);
    if (!surface || !SAFE3A_SURFACES.has(surface)) {
      return {
        code: "surface",
        why: `only the owner's own chat, /session start, /work and their ask answers can merge (this run: ${surface ?? "no surface"})`,
      };
    }
    let role;
    try {
      role = await resolveActingRole(env);
    } catch {
      role = null;
    }
    if (role !== "owner") return { code: "not-owner", why: "only the owner's own runs merge" };
    return null;
  } catch {
    return { code: "caller-unknown", why: "could not tell who is asking" };
  }
}

// ------------------------------------------------------------------ client

type GhUser = { id: number; login?: string; type?: string } | null;

/**
 * A person, not its own token and not an app: what "a human marked it
 * ready" needs (GitHub's `Bot` actors and `…[bot]` logins are apps).
 */
function isHumanActor(actor: GhUser | undefined, me: { id: number }): boolean {
  if (!actor || typeof actor.id !== "number" || actor.id === me.id) return false;
  if ((actor.type ?? "").toLowerCase() === "bot") return false;
  return !(actor.login ?? "").toLowerCase().endsWith("[bot]");
}

/** The PR fields the gate reads (`pulls.get`). */
export type SelfMergePr = {
  number: number;
  title: string;
  state: string;
  merged?: boolean | null;
  draft?: boolean | null;
  html_url?: string;
  user: GhUser;
  head: { sha: string; ref: string; repo: { full_name: string } | null };
  base: { ref: string; repo: { full_name: string } };
  mergeable?: boolean | null;
  mergeable_state?: string;
  changed_files?: number;
};

type CheckRun = {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string | null;
  head_sha?: string;
  app?: { slug?: string } | null;
};

/** The slice of Octokit this module calls (tests pass a fake). */
export type SelfMergeOctokit = {
  rest: {
    users: { getAuthenticated(): Promise<{ data: { id: number; login: string } }> };
    pulls: {
      get(p: { owner: string; repo: string; pull_number: number }): Promise<{ data: SelfMergePr }>;
      listFiles(p: {
        owner: string;
        repo: string;
        pull_number: number;
        per_page: number;
        page: number;
      }): Promise<{ data: { filename: string; previous_filename?: string }[] }>;
      listReviews(p: {
        owner: string;
        repo: string;
        pull_number: number;
        per_page: number;
        page: number;
      }): Promise<{ data: { user: GhUser; state: string }[] }>;
      merge(p: {
        owner: string;
        repo: string;
        pull_number: number;
        sha: string;
        merge_method: "squash";
        commit_title: string;
      }): Promise<{ data: { sha: string; merged: boolean; message: string } }>;
    };
    issues: {
      listEvents(p: {
        owner: string;
        repo: string;
        issue_number: number;
        per_page: number;
        page: number;
      }): Promise<{ data: { event: string; actor: GhUser }[] }>;
    };
    checks: {
      listForRef(p: {
        owner: string;
        repo: string;
        ref: string;
        per_page: number;
        page: number;
        check_name?: string;
      }): Promise<{ data: { total_count: number; check_runs: CheckRun[] } }>;
    };
    repos: CiOctokit["rest"]["repos"];
  };
};

export type SelfMergeDeps = {
  /** GitHub client factory (tests inject a fake; default Octokit from GITHUB_TOKEN / GH_TOKEN). */
  client?: () => SelfMergeOctokit | ApiResult;
};

function defaultClient(): SelfMergeOctokit | ApiResult {
  const c = createOctokit();
  // The real client is a superset of the slice above.
  return c instanceof Octokit ? (c as unknown as SelfMergeOctokit) : c;
}

function isApiResult(c: SelfMergeOctokit | ApiResult): c is ApiResult {
  return (c as ApiResult).ok === false && !("rest" in c);
}

// ------------------------------------------------------------------ gate

/** Parsed `<number> --repo OWNER/REPO --sha <head sha> [--method squash]`. */
type MergeArgs = { number: number; repo: string; sha: string };

const USAGE =
  "usage: github-pr-merge <number> --repo OWNER/REPO --sha <the PR's 40-hex head sha> [--method squash]";

function parseArgs(args: readonly string[]): MergeArgs | string {
  let repo: string | undefined;
  let sha: string | undefined;
  let method: string | undefined;
  const pos: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--repo" || a === "-R") repo = args[++i];
    else if (a.startsWith("--repo=")) repo = a.slice("--repo=".length);
    else if (a === "--sha") sha = args[++i];
    else if (a.startsWith("--sha=")) sha = a.slice("--sha=".length);
    else if (a === "--method") method = args[++i] ?? "";
    else if (a.startsWith("--method=")) method = a.slice("--method=".length);
    else if (a.startsWith("-")) return `unexpected option ${JSON.stringify(a)} (${USAGE})`;
    else pos.push(a);
  }
  if (pos.length !== 1 || !/^[1-9]\d{0,8}$/.test(pos[0]!)) return USAGE;
  if (!repo?.trim()) return USAGE;
  if (method !== undefined && method.trim().toLowerCase() !== SELF_MERGE_METHOD) {
    return `it only squash-merges (one commit on main titled "<title> (#N)"); --method ${JSON.stringify(method)} is not offered (${USAGE})`;
  }
  const s = sha?.trim().toLowerCase() ?? "";
  if (!SHA_RE.test(s)) {
    return `name the head sha you mean, all 40 hex characters (github-ci-status <number> --repo OWNER/REPO prints it) (${USAGE})`;
  }
  return { number: Number(pos[0]), repo: repo.trim(), sha: s };
}

/** What a passing gate read, for the card and the merge. */
export type SelfMergeFacts = {
  owner: string;
  name: string;
  repo: string;
  number: number;
  sha: string;
  title: string;
  headRef: string;
  baseRef: string;
  url: string;
};

export type SelfMergeVerdict = { ok: true; facts: SelfMergeFacts } | { ok: false; result: PluginHandlerResult };

function refused(code: string, why: string, extra: Record<string, unknown> = {}, exitCode = 2): PluginHandlerResult {
  return {
    ok: false,
    error: scrubSecrets(`refused (${RULE}): ${why}`),
    exitCode,
    auditDenied: code,
    data: { refused: true, rule: RULE, reason: code, ...extra },
  };
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function httpStatus(e: unknown): number | undefined {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
}

async function pages<T>(
  read: (page: number) => Promise<T[]>,
  maxPages: number,
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const batch = await read(page);
    items.push(...batch);
    if (batch.length < PER_PAGE) return { items, truncated: false };
  }
  return { items, truncated: true };
}

/** The required check's state at `sha`: null when it ran and passed there. */
async function requiredCheckProblem(
  client: SelfMergeOctokit,
  owner: string,
  name: string,
  sha: string,
  check: string,
): Promise<"missing" | "failed" | "pending" | null> {
  const res = await client.rest.checks.listForRef({
    owner,
    repo: name,
    ref: sha,
    check_name: check,
    per_page: PER_PAGE,
    page: 1,
  });
  const runs = res.data.check_runs.filter(
    (r) =>
      r.name === check &&
      r.app?.slug === SELF_MERGE_CHECK_APP &&
      (r.head_sha === undefined || r.head_sha === sha),
  );
  if (runs.length === 0) return "missing";
  if (res.data.total_count > res.data.check_runs.length) return "pending";
  if (runs.some((r) => r.status !== "completed" || r.conclusion === null)) return "pending";
  if (runs.some((r) => r.conclusion !== "success")) return "failed";
  return null;
}

/**
 * GITHUB-7 / GITHUB-7.a: may it merge PR `args` now? Re-reads the caller,
 * the repo gate and every PR fact from GitHub on each call. Never throws: a
 * GitHub error, or any other error while checking (the repo gate, the
 * client), refuses (`github-error`, exit 1) — so the must-ask classifier
 * never falls back to raising a card for a merge it could not check.
 */
export async function checkSelfMerge(
  rawArgs: readonly string[],
  env: NodeJS.ProcessEnv,
  deps: SelfMergeDeps = {},
): Promise<SelfMergeVerdict> {
  try {
    return await checkSelfMergeOnce(rawArgs, env, deps);
  } catch (e) {
    return {
      ok: false,
      result: refused("github-error", `could not run the self-merge checks (${errText(e)}); nothing was merged`, {}, 1),
    };
  }
}

async function checkSelfMergeOnce(
  rawArgs: readonly string[],
  env: NodeJS.ProcessEnv,
  deps: SelfMergeDeps,
): Promise<SelfMergeVerdict> {
  const parsed = parseArgs(rawArgs);
  if (typeof parsed === "string") {
    return { ok: false, result: refused("usage", parsed, {}, 1) };
  }
  const caller = await selfMergeCallerRefusal(env);
  if (caller) {
    return { ok: false, result: refused(caller.code, `${caller.why}; it merges only when the owner asks in their own run`) };
  }
  if (!isCorvidinhoFullName(parsed.repo)) {
    return {
      ok: false,
      result: refused(
        "not-corvidinho",
        `it merges only its own PRs on ${SELF_MERGE_REPO}; outside Corvidinho a human still merges (GITHUB-7)`,
      ),
    };
  }
  const gate = await checkRepoGateForActingRole(parsed.repo, { env, write: true });
  if (!gate.ok) return { ok: false, result: refused("repo-gate", gate.error) };
  const parts = splitOwnerRepo(gate.repo);
  if (!parts) return { ok: false, result: refused("usage", USAGE, {}, 1) };
  const { owner, name } = parts;
  const n = parsed.number;
  const at = { pr: n, sha: parsed.sha };

  const c = (deps.client ?? defaultClient)();
  if (isApiResult(c)) return { ok: false, result: refused("no-token", c.error ?? "no GitHub token") };

  try {
    let me: { id: number; login: string };
    try {
      me = (await c.rest.users.getAuthenticated()).data;
    } catch (e) {
      return {
        ok: false,
        result: refused("token-unknown", `could not tell whose token this is (${errText(e)}), so it can't tell its own PRs; ${LEAVE}`, at),
      };
    }
    if (typeof me?.id !== "number" || !(me.login ?? "").trim()) {
      return { ok: false, result: refused("token-unknown", `could not tell whose token this is; ${LEAVE}`, at) };
    }
    const pr = (await c.rest.pulls.get({ owner, repo: name, pull_number: n })).data;
    const where = `PR #${n}`;
    if (pr.state !== "open" || pr.merged) {
      return { ok: false, result: refused("not-open", `${where} is not open`, at) };
    }
    if (!isCorvidinhoFullName(pr.base?.repo?.full_name)) {
      return { ok: false, result: refused("not-corvidinho", `${where} is not a ${SELF_MERGE_REPO} PR; outside Corvidinho a human still merges (GITHUB-7)`, at) };
    }
    // GITHUB-7: its own PR only — the author's id and login are the token's.
    if (pr.user?.id !== me.id || (pr.user?.login ?? "").toLowerCase() !== me.login.trim().toLowerCase()) {
      return {
        ok: false,
        result: refused("foreign-author", `${where} was opened by ${pr.user?.login ?? "someone else"}, not by its own token (${me.login}); it never merges someone else's PR (GITHUB-7)`, at),
      };
    }
    const headRepo = pr.head?.repo?.full_name ?? "";
    if (headRepo.toLowerCase() !== pr.base.repo.full_name.toLowerCase() || !TALK_BRANCH_RE.test(pr.head.ref)) {
      return {
        ok: false,
        result: refused(
          "not-own-branch",
          `${where} comes from ${headRepo || "a deleted repo"}:${pr.head?.ref ?? "?"}, not one of its own talk/… branches in ${SELF_MERGE_REPO}; ${LEAVE}`,
          at,
        ),
      };
    }
    if (pr.draft) {
      return {
        ok: false,
        result: refused("draft", `${where} is a draft; it never marks its own draft ready — a human marks it ready, then ask again`, at),
      };
    }
    if (pr.head.sha.toLowerCase() !== parsed.sha) {
      return {
        ok: false,
        result: refused("head-moved", `${where}'s head is now ${pr.head.sha.slice(0, 12)}, not ${parsed.sha.slice(0, 12)} you named; check the new head, then ask again`, at),
      };
    }
    const events = await pages(
      async (page) => (await c.rest.issues.listEvents({ owner, repo: name, issue_number: n, per_page: PER_PAGE, page })).data,
      LIST_PAGES,
    );
    if (events.truncated) {
      return { ok: false, result: refused("events-truncated", `${where}'s event list is too long to read whole; ${LEAVE}`, at) };
    }
    // Issue events come oldest first.
    const readied = events.items.filter((e) => e.event === "ready_for_review");
    if (readied.some((e) => e.actor?.id === me.id)) {
      return {
        ok: false,
        result: refused("self-marked-ready", `${where} was marked ready for review by its own token, and it never marks its own draft ready; ${LEAVE}`, at),
      };
    }
    // GITHUB-7.a "it never marks its own /work draft ready" (round 13: only
    // PRs a human has marked ready): a PR it opened ready, or one an app
    // marked ready last (a person's earlier ready, then a draft again, does
    // not count), waits until a person marks it ready.
    const lastReady = readied[readied.length - 1];
    if (!lastReady || !isHumanActor(lastReady.actor, me)) {
      return {
        ok: false,
        result: refused(
          "not-marked-ready",
          `no person has marked ${where} ready for review; it merges only a PR it opened as a draft that a human then marked ready — convert it to a draft and mark it ready yourself, then ask again`,
          at,
        ),
      };
    }
    const files = await pages(
      async (page) => (await c.rest.pulls.listFiles({ owner, repo: name, pull_number: n, per_page: PER_PAGE, page })).data,
      FILE_PAGES,
    );
    if (files.truncated || (typeof pr.changed_files === "number" && files.items.length < pr.changed_files)) {
      return { ok: false, result: refused("files-truncated", `${where}'s changed-file list could not be read whole; ${LEAVE}`, at) };
    }
    for (const f of files.items) {
      for (const p of [f.filename, f.previous_filename]) {
        if (!p) continue;
        const gatePath = selfMergeGatePath(p);
        if (gatePath) {
          return {
            ok: false,
            result: refused("gate-path", `${where} changes ${p} — ${gatePath}, one of its own gates; a PR that changes its gates always waits for a human merge`, { ...at, path: p }),
          };
        }
      }
    }
    const reviews = await pages(
      async (page) => (await c.rest.pulls.listReviews({ owner, repo: name, pull_number: n, per_page: PER_PAGE, page })).data,
      LIST_PAGES,
    );
    if (reviews.truncated) {
      return { ok: false, result: refused("reviews-truncated", `${where}'s review list is too long to read whole; ${LEAVE}`, at) };
    }
    const latest = new Map<number, string>();
    for (const r of reviews.items) {
      if (r.user?.id === undefined) continue;
      if (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED" || r.state === "DISMISSED") latest.set(r.user.id, r.state);
    }
    if ([...latest.values()].includes("CHANGES_REQUESTED")) {
      return { ok: false, result: refused("changes-requested", `a reviewer requested changes on ${where}; ${LEAVE} or ask after the review is settled`, at) };
    }
    for (const check of SELF_MERGE_CHECKS) {
      const problem = await requiredCheckProblem(c, owner, name, parsed.sha, check);
      if (problem) {
        const how =
          problem === "missing"
            ? `has no \`${check}\` run`
            : problem === "pending"
              ? `\`${check}\` is still running`
              : `\`${check}\` did not pass`;
        return {
          ok: false,
          result: refused(`ci-${check}-${problem}`, `CI is not green at ${where}'s head ${parsed.sha.slice(0, 12)}: it ${how} there (CI counts green only when smoke and spec-sync pass at the head)`, at),
        };
      }
    }
    const ci = await fetchCiStatus(c as unknown as CiOctokit, { owner, repo: name, target: { kind: "ref", ref: parsed.sha } });
    if (ci.sha !== parsed.sha || ci.verdict !== "green" || ci.warnings.length > 0) {
      return {
        ok: false,
        result: refused(
          `ci-${ci.verdict === "green" ? "unread" : ci.verdict}`,
          `CI is not green at ${where}'s head ${parsed.sha.slice(0, 12)} (${ci.verdict}${ci.warnings.length ? `; ${ci.warnings.join("; ")}` : ""})`,
          at,
        ),
      };
    }
    if (pr.mergeable !== true || !MERGEABLE_STATES.has(pr.mergeable_state ?? "")) {
      const state = pr.mergeable == null ? "not worked out yet" : (pr.mergeable_state ?? "unknown");
      return {
        ok: false,
        result: refused(
          "not-mergeable",
          `GitHub does not say ${where} may merge now (mergeable: ${state}); branch protection, reviews and CODEOWNERS have to allow it, and it never bypasses them`,
          at,
        ),
      };
    }
    return {
      ok: true,
      facts: {
        owner,
        name,
        repo: gate.repo,
        number: n,
        sha: parsed.sha,
        title: pr.title,
        headRef: pr.head.ref,
        baseRef: pr.base.ref,
        url: pr.html_url ?? `https://github.com/${gate.repo}/pull/${n}`,
      },
    };
  } catch (e) {
    return {
      ok: false,
      result: refused("github-error", `could not read PR #${n} from GitHub (${errText(e)}); nothing was merged`, at, 1),
    };
  }
}

/** The squash commit's title: the PR title, as GitHub's own squash names it. */
export function selfMergeCommitTitle(facts: Pick<SelfMergeFacts, "title" | "number">): string {
  return `${facts.title.trim()} (#${facts.number})`;
}

function githubDryRun(env: NodeJS.ProcessEnv): boolean {
  return env.CORVIDINHO_GITHUB_DRY_RUN === "1";
}

/** Build `github-pr-merge` (tests pass a fake GitHub client). */
export function makeGithubPrMergeCommand(deps: SelfMergeDeps = {}): PluginCommand {
  return {
    name: SELF_MERGE_TOOL,
    description:
      "Squash-merge its own Corvidinho PR when the owner asks (GITHUB-7 / GITHUB-7.a): " +
      "`<number> --repo CorvidLabs/Corvidinho --sha <head sha>`. Only its own talk/… PR a person marked ready, " +
      "no gate file changed (.github, fledge.toml, hi/, AGENTS.md …), smoke and spec-sync green at that head and " +
      "GitHub allows it; then the owner's Approve card with the one-time code. Never marks a draft ready",
    dangerous: true,
    mutating: true,
    minTier: 1,
    // GITHUB-7.a "only when I ask": the gate first (a failing PR raises no
    // card), then the owner's Approve card for exactly this PR and head.
    mustAsk: async ({ args, env }): Promise<MustAskVerdict> => {
      const v = await checkSelfMerge(args, env, deps);
      if (!v.ok) return { refuse: v.result };
      const f = v.facts;
      // A dry run merges nothing, so it asks nothing.
      if (githubDryRun(env)) return null;
      return {
        ask: {
          class: "merge",
          why: `squash-merges its own PR #${f.number} (${f.headRef}) into ${f.baseRef} — every self-merge check passed`,
          target: `${f.repo}#${f.number} at ${f.sha}`,
          text: selfMergeCommitTitle(f),
        },
      };
    },
    async handler(ctx: PluginHandlerArgs): Promise<PluginHandlerResult> {
      const env = process.env;
      // After the card: every check again, fresh (the PR may have changed
      // while the card waited); the merge is pinned to the head sha named.
      const v = await checkSelfMerge(ctx.args, env, deps);
      if (!v.ok) return v.result;
      const f = v.facts;
      const commitTitle = selfMergeCommitTitle(f);
      if (githubDryRun(env)) {
        return {
          ok: true,
          data: { dryRun: true, repo: f.repo, number: f.number, sha: f.sha, commitTitle, mergeMethod: SELF_MERGE_METHOD },
          message: scrubSecrets(`dry run: would squash-merge PR #${f.number} at ${f.sha} as "${commitTitle}"`),
          exitCode: 0,
        };
      }
      const c = (deps.client ?? defaultClient)();
      if (isApiResult(c)) return refused("no-token", c.error ?? "no GitHub token");
      // A run stopped after the owner's Approve (while the gate re-ran)
      // merges nothing: the stop wins, as it does while the card waits.
      if (ctx.signal?.aborted) {
        return refused("aborted", `the run was stopped before the merge of PR #${f.number}; nothing was merged`, { pr: f.number }, 130);
      }
      try {
        const res = await c.rest.pulls.merge({
          owner: f.owner,
          repo: f.name,
          pull_number: f.number,
          sha: f.sha,
          merge_method: SELF_MERGE_METHOD,
          commit_title: commitTitle,
        });
        if (!res.data.merged || !SHA_RE.test(res.data.sha ?? "")) {
          return refused("github-refused", `GitHub did not merge PR #${f.number}: ${res.data.message || "no reason given"}`, { pr: f.number });
        }
        const data = {
          merged: true,
          repo: f.repo,
          number: f.number,
          head: f.sha,
          sha: res.data.sha,
          base: f.baseRef,
          title: f.title,
          url: f.url,
        };
        return {
          ok: true,
          data,
          message: scrubSecrets(
            `Merged PR #${f.number} "${f.title}" into ${f.baseRef} as ${res.data.sha} (squash, ${RULE}).`,
          ),
          exitCode: 0,
        };
      } catch (e) {
        const status = httpStatus(e);
        if (status === 405 || status === 409 || status === 422) {
          return refused("github-refused", `GitHub refused to merge PR #${f.number} (${status}: ${errText(e)}); nothing was merged`, { pr: f.number });
        }
        return { ok: false, error: scrubSecrets(`github-pr-merge: ${errText(e)}`), exitCode: 1 };
      }
    },
  };
}

/** The registered command (GitHub client from GITHUB_TOKEN / GH_TOKEN). */
export const githubPrMerge: PluginCommand = makeGithubPrMergeCommand();
