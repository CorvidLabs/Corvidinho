/**
 * AGENT-18 / AGENT-18.a (#89): it works each repo's own way. This module
 * covers the SpecSync clause and the guard half of the hi clause; hi
 * drafting with the capture card and the Trust clause come later.
 *
 * - {@link detectRepoWays} finds the ways a repo uses: a SpecSync change
 *   workflow (`.specsync/sdd.json` with `enabled: true`), hi criteria (a
 *   `hi/*.md` file with `hi:` front matter) and Trust (`.trust.toml`). Each
 *   flag is the union of the session base tree, HEAD and the working tree,
 *   so deleting or committing away a file during a run can't switch a gate
 *   off. The run names what it found in one Text event
 *   ({@link formatRepoWaysLine}) and the tool loop gets one fixed prompt
 *   block ({@link renderRepoWaysBlock}).
 * - {@link sddUncovered}: in a repo whose SpecSync workflow requires a change
 *   for meaningful files (`require_change_for_meaningful_files`), every
 *   changed path it counts as meaningful (`meaningful_paths` less
 *   `ignored_paths`, the more specific entry winning) must be covered by an
 *   open change's `affected_paths` (or by a change archived in the same
 *   diff). The policy is merged the same fail-closed way: enabled or required
 *   in any tree counts, meaningful paths are the union and ignored paths the
 *   intersection. The verify gate (src/agent/loop.ts) and `/work` before
 *   commit and push (src/work/pr.ts) use it.
 * - The hi clause's guard half ("never inventing them"): in a hi repo the
 *   agent never changes the criteria itself. {@link hiChangesSince} lists
 *   what differs under hi/ between the session base and the working tree
 *   (criteria and retired entries parsed from each changed `hi/*.md`, any
 *   other hi/ file by path; {@link hiChangesFromSnapshot} for a run with no
 *   git base), and {@link hiGuardNote} is the one line that blocks done (the
 *   verify gate, src/agent/loop.ts) and the PR (`/work` before commit and
 *   push, src/work/pr.ts). No run can make an approved capture yet (drafting
 *   and the capture card come later), so any hi/ change blocks. The file
 *   tools refuse writes, edits and deletes under hi/ in hi repos
 *   (plugins/files). Commits made outside a Corvidinho run are never
 *   checked: the guard lives only in the run's gate and the `/work` PR step.
 * - AGENT-18.a: on Corvidinho itself it may approve and archive its own
 *   change once verify is green; elsewhere a human approves, reviews and
 *   finalizes. {@link isCorvidinhoProject} is a fixed fact (the project is
 *   the checkout this code runs from and its origin is
 *   github.com/CorvidLabs/Corvidinho), never a flag a model can set. The run
 *   ledger ({@link beginSddRun}) records the changes this run opened (from
 *   the `specsync-change-new` tool's own before/after listing, never from
 *   model text) and whether the verify lane is green right now;
 *   {@link selfLifecycleRefusal} is the gate the approve and finalize tools
 *   check, and {@link settleOwnSddChanges} is the step `runTask` runs right
 *   after a verified lane.
 */

import { createHash } from "node:crypto";
import {
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
  type Stats,
} from "node:fs";
import { join, resolve } from "node:path";
import { runGit, type GitRun } from "../../plugins/git/exec.ts";
import { delegateDepthFromEnv } from "../autonomous/delegate.ts";
import type { PluginHandlerResult } from "../plugins/types.ts";
import { isScheduleRunEnv, resolveActingRole } from "../plugins/roles.ts";
import { scrubSecrets } from "../store/scrub.ts";
import { resolveBase } from "../worktree/base.ts";
import { actingSurface } from "./shell-gate.ts";

/** The ways a repo works that AGENT-18 follows. */
export type RepoWays = {
  /** SpecSync change workflow on (`.specsync/sdd.json` `enabled: true`). */
  sdd: boolean;
  /** Acceptance criteria kept with hi (`hi/*.md` with `hi:` front matter). */
  hi: boolean;
  /** Trust config (`.trust.toml`). */
  trust: boolean;
};

/** The SpecSync change policy a repo sets in `.specsync/sdd.json`. */
export type SddPolicy = {
  enabled: boolean;
  /** `require_change_for_meaningful_files`: changed meaningful paths need a change. */
  require: boolean;
  meaningful: string[];
  ignored: string[];
};

export type RepoWaysScan = { ways: RepoWays; sdd: SddPolicy };

export const SDD_FILE = ".specsync/sdd.json";
export const TRUST_FILE = ".trust.toml";
export const HI_DIR = "hi";
/** Active SpecSync change folders (`<dir>/<id>/state.json`). */
export const SDD_CHANGES_DIR = ".specsync/changes";
/** Archived SpecSync change folders (`<dir>/<date>-<id>/state.json`). */
export const SDD_ARCHIVE_DIR = ".specsync/archive/changes";

/** SpecSync's own defaults when `sdd.json` leaves a list out (`specsync init`). */
const DEFAULT_MEANINGFUL = [
  "src/",
  "tests/",
  "site/",
  ".github/",
  "Cargo.toml",
  "Cargo.lock",
  "action.yml",
  "package.json",
  "bun.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "Package.swift",
  "Package.resolved",
  "go.mod",
  "go.sum",
  "pyproject.toml",
  "uv.lock",
  "requirements.txt",
  ".specsync/sdd.json",
  ".specsync/config.toml",
  ".specsync/config.json",
  ".specsync/registry.toml",
  ".specsync/version",
];
const DEFAULT_IGNORED = [".specsync/", "specs/"];

/** hi files read per tree before giving up on finding hi front matter. */
const HI_FILES_MAX = 50;
/** Bytes of a file read here (sdd.json, a hi file, a change's state.json). */
const READ_MAX_BYTES = 256 * 1024;

const NO_POLICY: SddPolicy = { enabled: false, require: false, meaningful: [], ignored: [] };

// ------------------------------------------------------------------ policy

function stringList(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((x): x is string => typeof x === "string").map((s) => s.replace(/^\.\//, ""));
}

/**
 * Parse `sdd.json`. A file that is there but can't be parsed fails closed:
 * enabled and required, every path meaningful (`""`), SpecSync's default
 * ignored paths.
 */
export function parseSddPolicy(text: string): SddPolicy {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { enabled: true, require: true, meaningful: [""], ignored: [...DEFAULT_IGNORED] };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { enabled: true, require: true, meaningful: [""], ignored: [...DEFAULT_IGNORED] };
  }
  const o = raw as Record<string, unknown>;
  const enabled = o.enabled === true;
  return {
    enabled,
    require: enabled && o.require_change_for_meaningful_files === true,
    meaningful: stringList(o.meaningful_paths) ?? [...DEFAULT_MEANINGFUL],
    ignored: stringList(o.ignored_paths) ?? [...DEFAULT_IGNORED],
  };
}

/**
 * Merge policies read from several trees, failing closed: enabled or
 * required in any counts, meaningful paths are the union, ignored paths the
 * intersection (of the trees where the workflow is on).
 */
export function mergeSddPolicies(policies: readonly SddPolicy[]): SddPolicy {
  const on = policies.filter((p) => p.enabled);
  if (on.length === 0) return { ...NO_POLICY };
  const meaningful = [...new Set(on.flatMap((p) => p.meaningful))];
  let ignored = on[0]!.ignored;
  for (const p of on.slice(1)) ignored = ignored.filter((x) => p.ignored.includes(x));
  return {
    enabled: true,
    require: on.some((p) => p.require),
    meaningful,
    ignored: [...new Set(ignored)],
  };
}

/** Length of `entry` when it matches `path` (a `/`-ended prefix, or the path or a parent dir); -1 otherwise. */
function matchLength(path: string, entry: string): number {
  if (entry === "") return 0;
  if (entry.endsWith("/")) return path.startsWith(entry) ? entry.length : -1;
  return path === entry || path.startsWith(`${entry}/`) ? entry.length : -1;
}

function bestMatch(path: string, entries: readonly string[]): number {
  let best = -1;
  for (const e of entries) best = Math.max(best, matchLength(path, e));
  return best;
}

/**
 * True when a changed path needs a SpecSync change under `policy`: it
 * matches a meaningful entry and no ignored entry that is more specific.
 */
export function isMeaningfulPath(path: string, policy: SddPolicy): boolean {
  const p = path.replace(/^\.\//, "");
  const m = bestMatch(p, policy.meaningful);
  if (m < 0) return false;
  return m >= bestMatch(p, policy.ignored);
}

/** True when `policy` makes changed meaningful paths need a change. */
export function sddRequiresChange(policy: SddPolicy): boolean {
  return policy.enabled && policy.require;
}

// ------------------------------------------------------------------ trees

type TreeFacts = { sdd: SddPolicy | null; hi: boolean; trust: boolean };

function readSmall(path: string): string | null {
  try {
    const st = statSync(path);
    if (!st.isFile() || st.size > READ_MAX_BYTES) return null;
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** True when `text` opens with `---` front matter holding a `hi:` line. */
export function hasHiFrontMatter(text: string): boolean {
  const m = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return Boolean(m && /^hi:[ \t]*\S/m.test(m[1]!));
}

function worktreeFacts(root: string): TreeFacts {
  const sddText = readSmall(join(root, SDD_FILE));
  let hi = false;
  try {
    const names = readdirSync(join(root, HI_DIR)).filter((n) => n.endsWith(".md")).sort();
    for (const n of names.slice(0, HI_FILES_MAX)) {
      const text = readSmall(join(root, HI_DIR, n));
      if (text !== null && hasHiFrontMatter(text)) {
        hi = true;
        break;
      }
    }
  } catch {
    hi = false;
  }
  let trust = false;
  try {
    trust = statSync(join(root, TRUST_FILE)).isFile();
  } catch {
    trust = false;
  }
  return { sdd: sddText === null ? null : parseSddPolicy(sddText), hi, trust };
}

function ok(r: GitRun): boolean {
  return r.code === 0 && !r.truncated && !r.timedOut;
}

async function blob(root: string, rev: string, path: string): Promise<string | null> {
  const r = await runGit(root, ["cat-file", "-p", `${rev}:${path}`], {
    maxStdoutBytes: READ_MAX_BYTES,
  });
  return ok(r) ? r.stdout : null;
}

async function revFacts(root: string, rev: string): Promise<TreeFacts> {
  const sddText = await blob(root, rev, SDD_FILE);
  let hi = false;
  const ls = await runGit(root, ["ls-tree", "--name-only", "-z", rev, "--", `${HI_DIR}/`]);
  if (ok(ls)) {
    const names = ls.stdout
      .split("\0")
      .filter((n) => n.startsWith(`${HI_DIR}/`) && n.endsWith(".md") && !n.slice(3).includes("/"))
      .sort();
    for (const n of names.slice(0, HI_FILES_MAX)) {
      const text = await blob(root, rev, n);
      if (text !== null && hasHiFrontMatter(text)) {
        hi = true;
        break;
      }
    }
  }
  const trust = ok(await runGit(root, ["cat-file", "-e", `${rev}:${TRUST_FILE}`]));
  return { sdd: sddText === null ? null : parseSddPolicy(sddText), hi, trust };
}

/** True when `root` is itself a git work tree top level (runGit never searches parents). */
async function isGitTop(root: string): Promise<boolean> {
  const r = await runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  return ok(r) && r.stdout.trim() === "true";
}

async function commitOf(root: string, rev: string): Promise<string | null> {
  const r = await runGit(root, ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`]);
  const sha = r.stdout.trim();
  return ok(r) && sha ? sha : null;
}

/**
 * The session base a run's ways are read from as well as HEAD and the
 * working tree: the branch's merge-base with the remote's default branch
 * (`resolveBase`), else HEAD now. Null outside a git work tree.
 */
export async function repoWaysBase(root: string): Promise<string | null> {
  try {
    if (!(await isGitTop(root))) return null;
    const based = await resolveBase((c, a) => runGit(c, a), root);
    if (based) return based.mergeBase;
    return await commitOf(root, "HEAD");
  } catch {
    return null;
  }
}

/**
 * Read the ways and the SpecSync policy from the working tree, HEAD and
 * `base` (when given) and merge them (union; policy per
 * {@link mergeSddPolicies}). Never throws: a tree git can't read adds
 * nothing.
 */
export async function scanRepoWays(root: string, base?: string | null): Promise<RepoWaysScan> {
  const trees: TreeFacts[] = [];
  try {
    trees.push(worktreeFacts(root));
  } catch {
    /* unreadable working tree adds nothing */
  }
  try {
    if (await isGitTop(root)) {
      const seen = new Set<string>();
      for (const rev of ["HEAD", base ?? null]) {
        if (!rev) continue;
        const sha = await commitOf(root, rev);
        if (!sha || seen.has(sha)) continue;
        seen.add(sha);
        trees.push(await revFacts(root, sha));
      }
    }
  } catch {
    /* git trees add nothing */
  }
  return mergeScans(
    trees.map((t) => ({
      ways: { sdd: Boolean(t.sdd?.enabled), hi: t.hi, trust: t.trust },
      sdd: t.sdd ?? { ...NO_POLICY },
    })),
  );
}

/** Union of scans (the way flags OR-ed, the policies merged fail-closed). */
export function mergeScans(scans: readonly RepoWaysScan[]): RepoWaysScan {
  return {
    ways: {
      sdd: scans.some((s) => s.ways.sdd),
      hi: scans.some((s) => s.ways.hi),
      trust: scans.some((s) => s.ways.trust),
    },
    sdd: mergeSddPolicies(scans.map((s) => s.sdd)),
  };
}

/**
 * AGENT-18: the ways `root` works — each flag the union of the session base
 * tree (`base`), HEAD and the working tree. Never throws.
 */
export async function detectRepoWays(root: string, base?: string | null): Promise<RepoWays> {
  return (await scanRepoWays(root, base)).ways;
}

// ------------------------------------------------------------------ changes

type ChangeState = { id: string; dir: string; affected: string[] };

function readChangeState(dir: string): ChangeState | null {
  const text = readSmall(join(dir, "state.json"));
  if (text === null) return null;
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    if (!id) return null;
    return { id, dir, affected: stringList(o.affected_paths) ?? [] };
  } catch {
    return null;
  }
}

function changeDirs(root: string, rel: string): string[] {
  try {
    return readdirSync(join(root, rel))
      .filter((n) => !n.startsWith("."))
      .map((n) => join(root, rel, n))
      .filter((d) => {
        try {
          return statSync(d).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

/** Ids of the open SpecSync changes in the working tree (from each folder's `state.json`). */
export function activeChangeIds(root: string): string[] {
  const ids: string[] = [];
  for (const d of changeDirs(root, SDD_CHANGES_DIR)) {
    const s = readChangeState(d);
    if (s) ids.push(s.id);
  }
  return ids.sort();
}

function covers(path: string, affected: string): boolean {
  const a = affected.replace(/^\.\//, "");
  if (!a) return false;
  if (a.endsWith("/")) return path.startsWith(a);
  return path === a || path.startsWith(`${a}/`);
}

/**
 * AGENT-18: the changed paths (relative to `root`) that `policy` counts as
 * meaningful and no SpecSync change covers: not an open change's
 * `affected_paths`, and not a change archived in this same diff (its archive
 * folder among `changed`). Empty when the policy doesn't require changes.
 */
export function sddUncovered(root: string, changed: readonly string[], policy: SddPolicy): string[] {
  if (!sddRequiresChange(policy)) return [];
  const affected: string[] = [];
  for (const d of changeDirs(root, SDD_CHANGES_DIR)) {
    affected.push(...(readChangeState(d)?.affected ?? []));
  }
  const archivedHere = new Set<string>();
  for (const p of changed) {
    if (!p.startsWith(`${SDD_ARCHIVE_DIR}/`)) continue;
    const name = p.slice(SDD_ARCHIVE_DIR.length + 1).split("/")[0];
    if (name) archivedHere.add(name);
  }
  for (const name of archivedHere) {
    affected.push(...(readChangeState(join(root, SDD_ARCHIVE_DIR, name))?.affected ?? []));
  }
  const out = new Set<string>();
  for (const raw of changed) {
    const p = raw.replace(/^\.\//, "");
    if (!isMeaningfulPath(p, policy)) continue;
    if (affected.some((a) => covers(p, a))) continue;
    out.add(p);
  }
  return [...out].sort();
}

/** Changed paths named in a coverage note before "…". */
const UNCOVERED_PREVIEW = 5;

/** The one line the verify gate and the model get for uncovered paths. */
export function sddUncoveredNote(paths: readonly string[]): string {
  const shown = paths.slice(0, UNCOVERED_PREVIEW).join(", ");
  const list = paths.length > UNCOVERED_PREVIEW ? `${shown}, …` : shown;
  return (
    `SpecSync gate: ${paths.length} changed path(s) this repo's SpecSync workflow needs a change for ` +
    `are not covered by an open SpecSync change (${list}), so the run is not verified. ` +
    `Open one with specsync-change-new "<summary>" --kind <kind> --spec <module> --path <each path>, ` +
    `then answer its interview with specsync-change-answer (AGENT-18).`
  );
}

// ------------------------------------------------------------------ prompt

/** Operator Text naming the ways found (one per run); null when none. */
export function formatRepoWaysLine(ways: RepoWays): string | null {
  const found: string[] = [];
  if (ways.sdd) found.push("SpecSync changes (.specsync/sdd.json)");
  if (ways.hi) found.push("hi criteria (hi/)");
  if (ways.trust) found.push("Trust (.trust.toml; its steps are not followed yet)");
  if (found.length === 0) return null;
  return `Repo ways (AGENT-18): ${found.join(", ")}.`;
}

/** The fixed prompt block the tool loop adds for the ways found ("" when none applies). */
export function renderRepoWaysBlock(ways: RepoWays | undefined): string {
  if (!ways) return "";
  let out = "";
  if (ways.sdd) {
    out +=
      "\n\nThis repo works through SpecSync changes (AGENT-18). Before you change a file, open a change for your edits: " +
      'specsync-change-new "<summary>" --kind <feature|bug-fix|refactor|documentation|operations|migration> --spec <module> --path <each file you will change> ' +
      '(or --no-spec-change --rationale "<why>" when no spec text changes). Answer its interview with specsync-change-answer <id> <question> <answer> ' +
      "and fill the change's artifacts under .specsync/changes/<id>/; specsync-change-status shows what is left. " +
      "A changed file the repo's SpecSync workflow cares about that no open change covers keeps the run from being verified. " +
      "Never approve, review or finalize a change yourself: on Corvidinho the run approves and archives the change it opened once verify is green; in other repos a human does.";
  }
  if (ways.hi) {
    out +=
      "\n\nThis repo keeps its acceptance criteria in hi/ (AGENT-18). Never invent criteria: " +
      "an acceptance_criteria answer cites the captured hi ids it meets (as hi export lists them). " +
      "Never change hi/ yourself: the file tools refuse every write, edit and delete under hi/, and any change there " +
      "since the session base (a criterion, a retired entry, intent prose or any other hi/ file, however it was made) " +
      "keeps the run from being verified and /work from opening a PR. Criteria change only through a capture the owner " +
      "approves, and no run can make one yet; if a criterion seems missing or wrong, say so in your reply.";
  }
  return out ? `${out}\n\n` : "";
}

// ------------------------------------------------------------------ run ledger

/** One run's SpecSync lifecycle facts (AGENT-18.a), kept in process. */
export type SddRun = {
  readonly key: string;
  /** Ways and policy read at planning (merged into every later scan). */
  scan: RepoWaysScan;
  /** The session base the ways are read from with HEAD and the working tree. */
  base: string | null;
  /** Changes this run opened through `specsync-change-new`. */
  opened: string[];
  /** True only while `runTask` settles its own changes right after a verified lane. */
  verified: boolean;
  /**
   * hi/ as it was at planning, for the hi guard of a run with no git session
   * base (`base` null: not a git work tree top, or an unborn HEAD); null
   * otherwise or when hi/ could not be read.
   */
  hiStart: HiSnapshot | null;
};

const runs = new Map<string, SddRun>();

function runKey(cwd: string): string {
  try {
    return realpathSync(resolve(cwd));
  } catch {
    return resolve(cwd);
  }
}

/** Start the ledger of a run in `cwd` (replaces an older one for the same cwd). */
export function beginSddRun(cwd: string): SddRun {
  const run: SddRun = {
    key: runKey(cwd),
    scan: { ways: { sdd: false, hi: false, trust: false }, sdd: { ...NO_POLICY } },
    base: null,
    opened: [],
    verified: false,
    hiStart: null,
  };
  runs.set(run.key, run);
  return run;
}

/** End a run's ledger (only if it is still the current one for its cwd). */
export function endSddRun(run: SddRun): void {
  if (runs.get(run.key) === run) runs.delete(run.key);
}

/** The run in progress in `cwd`, if any. */
export function currentSddRun(cwd: string): SddRun | undefined {
  return runs.get(runKey(cwd));
}

/** Record that the run in `cwd` opened change `id` (called by `specsync-change-new`). */
export function noteOpenedChange(cwd: string, id: string): void {
  const run = currentSddRun(cwd);
  if (run && !run.opened.includes(id)) run.opened.push(id);
}

/**
 * The ways and SpecSync policy for a tool call in `cwd`: a fresh scan
 * (working tree, HEAD and the run's base) merged with the run's own start
 * scan when a run is in progress.
 */
export async function repoWaysNow(cwd: string): Promise<RepoWaysScan> {
  const run = currentSddRun(cwd);
  const now = await scanRepoWays(cwd, run?.base ?? null);
  return run ? mergeScans([run.scan, now]) : now;
}

// ------------------------------------------------------------------ Corvidinho

/** GitHub OWNER/REPO of Corvidinho itself. */
export const CORVIDINHO_REPO = "CorvidLabs/Corvidinho";

/** Actor and reviewer SpecSync records for the agent's own approvals (AGENT-18.a). */
export const SELF_LIFECYCLE_ACTOR = "corvid-agent";

/** The checkout this code runs from (the repo root above `src/agent/`). */
const OWN_CHECKOUT = resolve(import.meta.dir, "..", "..");
let checkoutOverride: string | null = null;

/**
 * Test seam only (code, never env or model input): treat `dir` as the
 * checkout Corvidinho runs from; null restores the real one.
 */
export function setCorvidinhoCheckoutForTests(dir: string | null): void {
  checkoutOverride = dir;
}

/** True when `url` is github.com/CorvidLabs/Corvidinho (https, ssh or scp form; case-insensitive). */
export function isCorvidinhoOriginUrl(url: string): boolean {
  const s = url.trim();
  let host = "";
  let path = "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      host = u.hostname;
      path = u.pathname;
    } catch {
      return false;
    }
  } else {
    const m = s.match(/^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/);
    if (!m) return false;
    host = m[1]!;
    path = m[2]!;
  }
  if (host.toLowerCase() !== "github.com") return false;
  const slug = path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/i, "");
  return slug.toLowerCase() === CORVIDINHO_REPO.toLowerCase();
}

async function commonGitDir(dir: string): Promise<string | null> {
  const r = await runGit(dir, ["rev-parse", "--git-common-dir"]);
  if (!ok(r)) return null;
  const out = r.stdout.trim();
  if (!out) return null;
  try {
    return realpathSync(resolve(dir, out));
  } catch {
    return null;
  }
}

/**
 * AGENT-18.a: true only when `cwd` is a work tree of the repository this
 * code runs from (same git common dir: the checkout itself or one of its
 * worktrees) and that repository's `origin` is
 * github.com/CorvidLabs/Corvidinho. Both are read from disk here; no flag,
 * env var or model input can set it. Never throws.
 */
export async function isCorvidinhoProject(cwd: string): Promise<boolean> {
  try {
    const self = checkoutOverride ?? OWN_CHECKOUT;
    const [mine, theirs] = await Promise.all([commonGitDir(self), commonGitDir(cwd)]);
    if (!mine || !theirs || mine !== theirs) return false;
    const url = await runGit(cwd, ["config", "--get", "remote.origin.url"]);
    return ok(url) && isCorvidinhoOriginUrl(url.stdout.split("\n")[0] ?? "");
  } catch {
    return false;
  }
}

/** The clear line the approve and finalize tools give outside Corvidinho. */
export const HUMAN_LIFECYCLE_LINE =
  "refused: in this repo a human approves, reviews and finalizes SpecSync changes (AGENT-18.a); " +
  "only on Corvidinho itself does the agent approve and archive its own change, once verify is green";

/**
 * AGENT-18.a: why the agent may not approve, review or finalize change `id`
 * in `cwd` now; null when it may. It may only for a change this run opened,
 * on Corvidinho, while `runTask` settles it right after a verified lane, in
 * an owner or team run that is not WATCH, a schedule or a worker. Never
 * throws; any doubt refuses.
 */
export async function selfLifecycleRefusal(
  cwd: string,
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  try {
    if (delegateDepthFromEnv(env) > 0) {
      return "refused: a delegate or council worker never approves or archives a SpecSync change (AGENT-18.a)";
    }
    const surface = actingSurface(env);
    if (
      (env.CORVIDINHO_WATCH_SESSION_ID ?? "").trim() ||
      isScheduleRunEnv(env) ||
      surface === "watch" ||
      surface === "schedule"
    ) {
      return "refused: WATCH runs and schedules never approve or archive a SpecSync change (AGENT-18.a)";
    }
    if ((await resolveActingRole(env)) === "community") {
      return "refused: only the owner's and the team's runs may approve or archive a SpecSync change (AGENT-18.a)";
    }
    if (!(await isCorvidinhoProject(cwd))) return HUMAN_LIFECYCLE_LINE;
    const run = currentSddRun(cwd);
    if (!run || !run.opened.includes(id)) {
      return `refused: ${id} is not a SpecSync change this run opened; a human approves, reviews and finalizes it (AGENT-18.a)`;
    }
    if (!run.verified) {
      return "refused: the agent approves and archives its own SpecSync change only right after the verify lane is green in this run (AGENT-18.a)";
    }
    return null;
  } catch {
    return "refused: could not check who may approve this SpecSync change (AGENT-18.a)";
  }
}

// ------------------------------------------------------------------ settle

/** Tool names the settle step runs (both dangerous: SAFE-1 allowlist, SAFE-5 audit). */
export const SDD_APPROVE_TOOL = "specsync-change-approve";
export const SDD_FINALIZE_TOOL = "specsync-change-finalize";

/** Runs one of the tools above through `runPlugin` (role, SAFE-1, must-ask, SAFE-5). */
export type SddToolCall = (name: string, args: string[]) => Promise<PluginHandlerResult>;

const ERR_MAX = 300;

function errText(r: PluginHandlerResult): string {
  const e = scrubSecrets((r.error ?? r.message ?? `exit ${r.exitCode ?? 1}`).trim());
  const line = e.replace(/\s+/g, " ");
  return line.length > ERR_MAX ? `${line.slice(0, ERR_MAX - 1)}…` : line;
}

/**
 * AGENT-18.a: right after the verify lane is green, settle the SpecSync
 * changes this run opened that are still open. On Corvidinho it approves
 * and archives each through `call` (the approve and finalize tools, so every
 * gate applies); elsewhere it says once that a human does it. `changed` is
 * true when a step ran (the caller re-runs the lane over what it wrote).
 * Never throws.
 */
export async function settleOwnSddChanges(opts: {
  cwd: string;
  run: SddRun;
  call: SddToolCall;
  onText: (text: string) => void;
}): Promise<{ changed: boolean }> {
  const { cwd, run, call, onText } = opts;
  const active = new Set(activeChangeIds(cwd));
  const pending = run.opened.filter((id) => active.has(id));
  if (pending.length === 0) return { changed: false };
  if (!(await isCorvidinhoProject(cwd))) {
    onText(
      `SpecSync: ${pending.join(", ")} stays open for a human to approve, review and finalize; ` +
        "the agent approves and archives its own change only on Corvidinho (AGENT-18.a).",
    );
    return { changed: false };
  }
  let changed = false;
  run.verified = true;
  try {
    for (const id of pending) {
      let approved: PluginHandlerResult;
      try {
        approved = await call(SDD_APPROVE_TOOL, [id]);
      } catch (e) {
        approved = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      if (!approved.ok) {
        onText(`SpecSync: did not approve its own change ${id}: ${errText(approved)} It stays open for a human (AGENT-18.a).`);
        continue;
      }
      changed = true;
      let archived: PluginHandlerResult;
      try {
        archived = await call(SDD_FINALIZE_TOOL, [id]);
      } catch (e) {
        archived = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      if (!archived.ok) {
        onText(
          `SpecSync: approved its own change ${id} but did not archive it: ${errText(archived)} A human reviews and finalizes it (AGENT-18.a).`,
        );
        continue;
      }
      onText(`SpecSync: verify is green, so it approved and archived its own change ${id} (AGENT-18.a).`);
    }
  } finally {
    run.verified = false;
  }
  return { changed };
}

// ------------------------------------------------------------------ hi ids

/** Captured hi ids and families from `hi export` in `cwd`; null when it can't be read. */
export async function capturedHiIds(
  cwd: string,
  signal?: AbortSignal,
): Promise<{ ids: Set<string>; families: Set<string> } | null> {
  const bin = Bun.which("hi", { PATH: process.env.PATH ?? "" });
  if (!bin) return null;
  try {
    const proc = Bun.spawn([bin, "export"], { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore", signal });
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    if (code !== 0) return null;
    const parsed = JSON.parse(out) as { files?: unknown };
    if (!Array.isArray(parsed.files)) return null;
    const ids = new Set<string>();
    const families = new Set<string>();
    for (const f of parsed.files as Record<string, unknown>[]) {
      for (const fam of stringList(f?.families) ?? []) families.add(fam);
      const criteria = Array.isArray(f?.criteria) ? (f.criteria as Record<string, unknown>[]) : [];
      for (const c of criteria) if (typeof c?.id === "string") ids.add(c.id);
    }
    return { ids, families };
  } catch {
    return null;
  }
}

/** hi-shaped ids (`FAMILY-N`, `FAMILY-PART-N.a`) in `text` whose family is one of `families`. */
export function citedHiIds(text: string, families: ReadonlySet<string>): string[] {
  const out = new Set<string>();
  const re = /(?<![A-Za-z0-9-])([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*)-(\d+)((?:\.[a-z0-9]+)*)(?![A-Za-z0-9-])/g;
  for (const m of text.matchAll(re)) {
    if (families.has(m[1]!)) out.add(`${m[1]}-${m[2]}${m[3] ?? ""}`);
  }
  return [...out];
}

// ------------------------------------------------------------------ hi guard

/**
 * AGENT-18, the hi clause's guard half ("never inventing them"): what
 * differs under hi/ between the session base and now. Criteria and retired
 * entries come from a parse of each changed `hi/*.md`
 * ({@link parseHiEntries}); every other changed hi/ path is a file. Any
 * entry in any list blocks done and the PR: no run can make an approved
 * capture yet.
 */
export type HiChanges = {
  /** Criteria added, removed or reworded. */
  criteria: string[];
  /** Retired entries added, removed or changed (retiring a criterion included). */
  retired: string[];
  /** Other hi/ paths changed: intent prose, notes, a non-criteria edit, any non-`.md` file. */
  files: string[];
};

/** A hi/ tree read from the working tree: path → fingerprint (and a `hi/*.md` text). */
export type HiSnapshot = Map<string, { fp: string; text: string | null }>;

/** hi/ entries a snapshot walk records before it gives up (fail closed). */
const HI_SNAPSHOT_MAX_ENTRIES = 2000;
/** Cap on one git listing of hi/ paths; a longer one is unreadable. */
const HI_LIST_MAX_BYTES = 1024 * 1024;
/** Ids or paths a guard note names per kind before "…". */
const HI_PREVIEW = 5;

/** A hi criterion bullet: `- **FAMILY-N**  text` (`FAMILY-PART-N.a` too). */
const HI_ENTRY_RE =
  /^([ \t]*)[-*][ \t]+\*\*([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-\d+(?:\.[a-z0-9]+)*)\*\*(.*)$/;

/**
 * The criteria and retired entries of one hi file: id → its section
 * (`criteria`, or `retired` under a `## Retired` heading) and text, the
 * continuation lines (indented deeper, e.g. `retired: <why>`) included and
 * whitespace collapsed. Front matter is skipped. Never throws.
 */
export function parseHiEntries(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const body = text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
  let section = "criteria";
  let cur: { id: string; indent: number; parts: string[]; section: string } | null = null;
  const flush = () => {
    if (!cur) return;
    const v = `${cur.section}: ${cur.parts.join(" ").replace(/\s+/g, " ").trim()}`;
    const prev = out.get(cur.id);
    out.set(cur.id, prev === undefined ? v : `${prev}\n${v}`);
    cur = null;
  };
  for (const line of body.split(/\r?\n/)) {
    if (/^#{1,6}[ \t]/.test(line)) {
      flush();
      if (/^##[ \t]/.test(line)) section = /^##[ \t]+retired\b/i.test(line) ? "retired" : "criteria";
      continue;
    }
    const m = line.match(HI_ENTRY_RE);
    if (m) {
      flush();
      cur = { id: m[2]!, indent: m[1]!.length, parts: [m[3]!], section };
      continue;
    }
    if (cur) {
      const indent = line.length - line.trimStart().length;
      if (line.trim() !== "" && indent > cur.indent) {
        cur.parts.push(line.trim());
        continue;
      }
      flush();
    }
  }
  flush();
  return out;
}

/** True when `path` is a hi family file (`hi/<name>.md`, not nested). */
function isHiMarkdown(path: string): boolean {
  return path.startsWith(`${HI_DIR}/`) && path.endsWith(".md") && !path.slice(HI_DIR.length + 1).includes("/");
}

/** A regular file's text (no symlink followed, bounded); null otherwise. */
function readHiText(abs: string): string | null {
  try {
    const st = lstatSync(abs);
    if (!st.isFile() || st.size > READ_MAX_BYTES) return null;
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

/**
 * Sort changed hi/ paths into criteria, retired entries and other files.
 * `before` / `after` give a changed `hi/*.md` file's text on each side
 * (null when absent or unreadable: no entries). A changed file whose entries
 * did not change is an other-file change, so every path counts somewhere.
 */
async function classifyHiChanges(
  paths: readonly string[],
  before: (path: string) => Promise<string | null> | string | null,
  after: (path: string) => string | null,
): Promise<HiChanges> {
  const criteria = new Set<string>();
  const retired = new Set<string>();
  const files = new Set<string>();
  for (const path of [...new Set(paths)].sort()) {
    if (!isHiMarkdown(path)) {
      files.add(path);
      continue;
    }
    const a = parseHiEntries((await before(path)) ?? "");
    const b = parseHiEntries(after(path) ?? "");
    let entries = 0;
    for (const id of new Set([...a.keys(), ...b.keys()])) {
      const x = a.get(id);
      const y = b.get(id);
      if (x === y) continue;
      entries += 1;
      if (`${x ?? ""}\n${y ?? ""}`.split("\n").some((s) => s.startsWith("retired:"))) retired.add(id);
      else criteria.add(id);
    }
    if (entries === 0) files.add(path);
  }
  return { criteria: [...criteria].sort(), retired: [...retired].sort(), files: [...files].sort() };
}

function zList(out: string): string[] {
  return out.split("\0").filter(Boolean);
}

/**
 * git never asks a configured fsmonitor here (like the AGENT-15 workspace
 * diff): one could report hi/ edits as unchanged, and it runs a program.
 */
const NO_FSMONITOR = ["-c", "core.fsmonitor=false"];

/**
 * hi/ index entries git is told not to look at — assume-unchanged (a
 * lowercase `ls-files -v` tag) or skip-worktree (`S` / `s`) — whose file on
 * disk is not their index blob: `git diff` trusts the index for them, so a
 * dirty edit there would not show. A skip-worktree entry with no file on
 * disk is a sparse checkout, not a change. Null when unreadable.
 */
async function hiHiddenEdits(root: string): Promise<string[] | null> {
  const r = await runGit(root, [...NO_FSMONITOR, "ls-files", "-v", "-s", "-z", "--", HI_DIR], {
    maxStdoutBytes: HI_LIST_MAX_BYTES,
  });
  if (!ok(r)) return null;
  const out: string[] = [];
  for (const rec of zList(r.stdout)) {
    const m = rec.match(/^(\S) (\d{6}) ([0-9a-f]+) \d\t([\s\S]+)$/);
    if (!m) return null;
    const [, tag, mode, oid, path] = m as unknown as [string, string, string, string, string];
    const assumed = tag !== tag.toUpperCase();
    const skipped = tag === "S" || tag === "s";
    if (!assumed && !skipped) continue;
    const abs = join(root, path);
    let st: Stats;
    try {
      st = lstatSync(abs);
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") return null;
      if (!skipped) out.push(path);
      continue;
    }
    const want = await runGit(root, ["cat-file", "blob", oid], { maxStdoutBytes: READ_MAX_BYTES });
    let have: string | null = null;
    try {
      have = mode === "120000" ? (st.isSymbolicLink() ? readlinkSync(abs) : null) : readHiText(abs);
    } catch {
      have = null;
    }
    if (!ok(want) || have === null || have !== want.stdout) out.push(path);
  }
  return out;
}

/**
 * AGENT-18 hi guard: what changed under hi/ between commit `base` and the
 * working tree of `root` (a git work tree top): tracked paths that differ
 * (`git diff --name-only base -- hi`, committed or not; an assume-unchanged
 * or skip-worktree entry whose file differs from the index, too) and
 * untracked ones, ignored files included (`git ls-files --others -- hi`).
 * Null when git can't tell (the caller fails closed). Never throws.
 */
export async function hiChangesSince(root: string, base: string): Promise<HiChanges | null> {
  try {
    const diff = await runGit(
      root,
      [
        ...NO_FSMONITOR,
        "diff",
        "--name-only",
        "-z",
        "--no-renames",
        "--no-ext-diff",
        "--no-textconv",
        base,
        "--",
        HI_DIR,
      ],
      { maxStdoutBytes: HI_LIST_MAX_BYTES },
    );
    if (!ok(diff)) return null;
    const others = await runGit(root, [...NO_FSMONITOR, "ls-files", "--others", "-z", "--", HI_DIR], {
      maxStdoutBytes: HI_LIST_MAX_BYTES,
    });
    if (!ok(others)) return null;
    const hidden = await hiHiddenEdits(root);
    if (hidden === null) return null;
    const paths = [...zList(diff.stdout), ...zList(others.stdout), ...hidden];
    return await classifyHiChanges(
      paths,
      (p) => blob(root, base, p),
      (p) => readHiText(join(root, p)),
    );
  } catch {
    return null;
  }
}

function hiFingerprint(abs: string, st: Stats): { fp: string; text: string | null } {
  if (st.isSymbolicLink()) {
    try {
      return { fp: `link:${readlinkSync(abs)}`, text: null };
    } catch {
      return { fp: `link?:${st.ino}:${st.mtimeMs}`, text: null };
    }
  }
  if (!st.isFile()) return { fp: `other:${st.mode}:${st.ino}`, text: null };
  if (st.size > READ_MAX_BYTES) return { fp: `stat:${st.size}:${st.mtimeMs}:${st.ino}:${st.mode}`, text: null };
  const bytes = readFileSync(abs);
  return {
    fp: `file:${st.mode & 0o111 ? "x" : "-"}:${createHash("sha256").update(bytes).digest("hex")}`,
    text: bytes.toString("utf8"),
  };
}

/**
 * hi/ in `root`'s working tree as it is now, for a run with no git session
 * base: every entry under hi/ (symlinks not followed; `hi` itself when it is
 * not a directory), fingerprinted by content (by stat past the read cap).
 * Null when it can't be read whole (the guard fails closed). Never throws.
 */
export function hiSnapshot(root: string): HiSnapshot | null {
  const out: HiSnapshot = new Map();
  const walk = (rel: string): boolean => {
    const abs = join(root, rel);
    let st: Stats;
    try {
      st = lstatSync(abs);
    } catch (e) {
      return (e as NodeJS.ErrnoException)?.code === "ENOENT";
    }
    if (st.isDirectory()) {
      let names: string[];
      try {
        names = readdirSync(abs).sort();
      } catch {
        return false;
      }
      return names.every((n) => walk(`${rel}/${n}`));
    }
    if (out.size >= HI_SNAPSHOT_MAX_ENTRIES) return false;
    try {
      out.set(rel, hiFingerprint(abs, st));
    } catch {
      return false;
    }
    return true;
  };
  try {
    return walk(HI_DIR) ? out : null;
  } catch {
    return null;
  }
}

/** AGENT-18 hi guard for a run with no git base: hi/ now vs `start`. Null when unreadable. */
export async function hiChangesFromSnapshot(root: string, start: HiSnapshot): Promise<HiChanges | null> {
  const now = hiSnapshot(root);
  if (!now) return null;
  const changed: string[] = [];
  for (const p of new Set([...start.keys(), ...now.keys()])) {
    if (start.get(p)?.fp !== now.get(p)?.fp) changed.push(p);
  }
  return classifyHiChanges(
    changed,
    (p) => start.get(p)?.text ?? null,
    (p) => now.get(p)?.text ?? null,
  );
}

/** Number of changed criteria, retired entries and other hi/ files. */
export function hiChangeCount(c: HiChanges): number {
  return c.criteria.length + c.retired.length + c.files.length;
}

function previewList(items: readonly string[]): string {
  const shown = items.slice(0, HI_PREVIEW).join(", ");
  return items.length > HI_PREVIEW ? `${shown}, …` : shown;
}

/** `criteria A, B; retired entries C; other hi/ files hi/x.md` for a guard line. */
export function hiChangeSummary(c: HiChanges): string {
  const parts: string[] = [];
  if (c.criteria.length) parts.push(`criteria ${previewList(c.criteria)}`);
  if (c.retired.length) parts.push(`retired entries ${previewList(c.retired)}`);
  if (c.files.length) parts.push(`other hi/ files ${previewList(c.files)}`);
  return parts.join("; ");
}

/** Why any hi/ change blocks today (said by the gate note and the /work line). */
export const HI_NO_CAPTURE_YET =
  "the agent never changes a repo's criteria itself: they change only through a capture the owner approves, " +
  "and no run can make one yet (drafting criteria and the capture card come later)";

/**
 * The one line the verify gate and the model get when hi/ changed since the
 * session base; null when nothing did. The run can't tell who made a change
 * that was already there (an earlier run, or a commit on its branch not yet
 * on the base branch), so it undoes only its own and leaves the rest to the
 * owner.
 */
export function hiGuardNote(c: HiChanges): string | null {
  if (hiChangeCount(c) === 0) return null;
  return (
    `hi guard: this repo's hi/ changed since the session base (${hiChangeSummary(c)}) ` +
    `and no approved capture made the change, so the run is not verified and /work opens no PR; ` +
    `${HI_NO_CAPTURE_YET}. Undo a hi/ change this run made; leave one that was already there ` +
    `for the owner and say so in your reply (AGENT-18).`
  );
}

/** The gate's line when what changed under hi/ can't be read (fail closed). */
export const HI_GUARD_UNREADABLE_NOTE =
  "hi guard: could not read what changed under hi/ since the session base, so the run is not verified (AGENT-18).";

/**
 * AGENT-18 hi guard for the run `run` in `cwd`: what changed under hi/
 * since its git session base, else since hi/ at planning (a run with no git
 * base); null when that can't be read or there is nothing to compare
 * against (the callers fail closed). Never throws.
 */
export async function hiRunChanges(cwd: string, run: SddRun): Promise<HiChanges | null> {
  try {
    if (run.base) return await hiChangesSince(cwd, run.base);
    if (run.hiStart) return await hiChangesFromSnapshot(cwd, run.hiStart);
    return null;
  } catch {
    return null;
  }
}

/**
 * AGENT-18 hi guard (REQ-plugins-521): why `github-pr-create`, called while
 * a Corvidinho run is in progress in `cwd`, may not open a PR — the repo
 * uses hi (`repoWaysNow`) and hi/ changed since the run's session base, or
 * that can't be read. Null when it may, and when no run is in progress
 * there: an operator's own `plugins run`, or the `/work` PR step, which
 * holds hi/ to the merge-base itself (REQ-discord-520). Never throws; any
 * doubt refuses.
 */
export async function hiPrRefusal(cwd: string): Promise<string | null> {
  const run = currentSddRun(cwd);
  if (!run) return null;
  const unreadable =
    "refused (AGENT-18): could not read what changed under hi/ since the session base, so this run opens no PR";
  try {
    if (!(await repoWaysNow(cwd)).ways.hi) return null;
    const changes = await hiRunChanges(cwd, run);
    if (changes === null) return unreadable;
    if (hiChangeCount(changes) === 0) return null;
    return (
      `refused (AGENT-18): this repo's hi/ changed since the session base (${hiChangeSummary(changes)}) ` +
      `and no approved capture made the change, so this run opens no PR; ${HI_NO_CAPTURE_YET}`
    );
  } catch {
    return unreadable;
  }
}
