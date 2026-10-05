/**
 * AGENT-18, the hi clause's drafting half (#89): "where it uses hi, it drafts
 * criteria and asks before capturing, never inventing them". The guard half
 * (nothing else may change hi/) is src/agent/repo-ways.ts.
 *
 * - `hi-draft` is an agent-level tool, like `ask-human`: the tool loop
 *   (src/agent/execute.ts) intercepts it. {@link hiDraftGate} offers it only
 *   in a repo that uses hi, to the owner's and the team's own interactive
 *   Discord runs (chat, an ask answer, `/session start`, `/work`; the role
 *   re-resolved from the live config at every attempt and call) in a git
 *   worktree, and to a local CLI run nothing spawned. Community runs, WATCH,
 *   schedules and delegate or council workers never get it.
 * - A call is validated before anything happens ({@link validateHiDrafts}):
 *   1–{@link HI_DRAFT_MAX} drafts, each a new id (`hi export`: not captured,
 *   not retired, its family declared by a hi file, a dotted id's parent
 *   captured or drafted before it) and one line of text that SAFE-6
 *   scrubbing leaves unchanged (a draft scrubbing would change is refused).
 *   A refusal goes back to the model; nothing is recorded.
 * - In a Discord run it records a hi capture request
 *   (src/agent/hi-capture-store.ts) for the configured owner's `hi` card
 *   (src/discord/hi-card.ts) and ends the run blocked with an ask naming the
 *   drafts; in the CLI it records nothing and ends with an ask listing the
 *   drafts as the exact `hi` commands. Nothing is captured by the run.
 * - On the owner's Approve the bridge first makes sure the session worktree
 *   is there ({@link ensureHiCaptureWorktree}: re-created on its branch when
 *   it is gone, else it fails closed), then {@link runHiCapture} runs
 *   `hi <ID> "<text>"` for each draft there, all or nothing, and records what
 *   that changed under hi/ for the guard.
 */

import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { Database } from "bun:sqlite";
import { gitEnv, runGit } from "../../plugins/git/exec.ts";
import { appendAudit, argsDigest, auditKeyFromEnv } from "../audit/log.ts";
import { delegateDepthFromEnv } from "../autonomous/delegate.ts";
import { projectLabel } from "../discord/list-scope.ts";
import { loadOwnerConfig } from "../identity/owner.ts";
import { projectKeyFor } from "../memory/scope.ts";
import { isScheduleRunEnv, resolveActingRole, roleSessionActive } from "../plugins/roles.ts";
import type { PluginHandlerResult } from "../plugins/types.ts";
import { openCorvidinhoDb } from "../store/db.ts";
import { scrubSecrets } from "../store/scrub.ts";
import { ASK_QUESTION_MAX, normalizeQuestion } from "./ask.ts";
import {
  HI_ABSENT,
  HiCaptureStore,
  hiContentKey,
  recordHiCaptureFiles,
  type HiCaptureFileStep,
  type HiCaptureRequest,
  type HiDraft,
  type HiDraftRole,
} from "./hi-capture-store.ts";
import type { RepoWays } from "./repo-ways.ts";
import { ACTING_SURFACE_ENV, actingSurface, SAFE3A_SURFACES, TOOL_CHILD_ENV } from "./shell-gate.ts";
import type { HumanAsk } from "./types.ts";

export const HI_DRAFT_TOOL = "hi-draft";

/** ToolResult detail when `hi-draft` ends the run. */
export const HI_DRAFT_TOOL_RESULT_DETAIL = "drafts recorded; run stopped to ask before anything is captured";

/** Most drafts one call may carry. */
export const HI_DRAFT_MAX = 5;
/** Longest draft text (after whitespace is collapsed). */
export const HI_DRAFT_TEXT_MAX = 400;

/** How the tool ends a run: a card for the owner, or the commands for the CLI user. */
export type HiDraftMode = "card" | "cli";

export type HiDraftGate = { offered: true; mode: HiDraftMode; role: HiDraftRole | null } | { offered: false; reason: string };

/** A hi id: `FAMILY-N` or `FAMILY-N.a` (a family may be `TWO-PART`). */
const HI_ID_RE = /^([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*)-(\d+)((?:\.[a-z0-9]+)*)$/;

// ------------------------------------------------------------------ gate

async function isGitTop(cwd: string): Promise<boolean> {
  try {
    const root = realpathSync(resolve(cwd));
    const r = await runGit(root, ["rev-parse", "--show-toplevel"]);
    if (r.code !== 0) return false;
    return realpathSync(r.stdout.trim()) === root;
  } catch {
    return false;
  }
}

/**
 * AGENT-18 hi drafts: may this run be offered `hi-draft`, and how does it
 * end? Re-reads the ways, the delegation depth, the run markers, the role
 * session, the surface and the acting role on every call. Never throws; any
 * doubt refuses.
 */
export async function hiDraftGate(opts: {
  env: NodeJS.ProcessEnv;
  cwd: string;
  ways?: RepoWays;
}): Promise<HiDraftGate> {
  const { env, cwd } = opts;
  try {
    if (!opts.ways?.hi) return { offered: false, reason: "this repo does not keep criteria in hi/" };
    if (delegateDepthFromEnv(env) > 0) {
      return { offered: false, reason: "a delegate or council worker never drafts hi criteria" };
    }
    if ((env.CORVIDINHO_WATCH_SESSION_ID ?? "").trim() || actingSurface(env) === "watch") {
      return { offered: false, reason: "WATCH runs never draft hi criteria" };
    }
    if (isScheduleRunEnv(env) || actingSurface(env) === "schedule") {
      return { offered: false, reason: "scheduled runs never draft hi criteria" };
    }
    if (!roleSessionActive(env)) {
      // The local CLI: nothing spawned it (no Discord session or surface
      // stamp, not started from inside a tool).
      if ((env.CORVIDINHO_DISCORD_SESSION_ID ?? "").trim() || (env[ACTING_SURFACE_ENV] ?? "").trim()) {
        return { offered: false, reason: "a run with no role session drafts only as a local CLI run" };
      }
      if (env[TOOL_CHILD_ENV] !== undefined) {
        return { offered: false, reason: "a run started from inside a tool never drafts hi criteria" };
      }
      return { offered: true, mode: "cli", role: null };
    }
    const surface = actingSurface(env);
    if (!surface || !SAFE3A_SURFACES.has(surface)) {
      return { offered: false, reason: "only chat, ask answers, /session start and /work runs draft hi criteria" };
    }
    const role = await resolveActingRole(env);
    if (role !== "owner" && role !== "team") {
      return { offered: false, reason: "only the owner's and the team's runs draft hi criteria" };
    }
    if (!(await isGitTop(cwd))) {
      return { offered: false, reason: "drafts are captured in the session's git worktree, and this run has none" };
    }
    return { offered: true, mode: "card", role };
  } catch {
    return { offered: false, reason: "could not check who may draft hi criteria" };
  }
}

// ------------------------------------------------------------------ tool

export type HiDraftToolDef = {
  type: "function";
  function: {
    name: typeof HI_DRAFT_TOOL;
    description: string;
    parameters: {
      type: "object";
      properties: {
        drafts: {
          type: "array";
          description: string;
          items: {
            type: "object";
            properties: { id: { type: "string"; description: string }; text: { type: "string"; description: string } };
            required: ["id", "text"];
          };
        };
      };
      required: ["drafts"];
    };
  };
};

export function buildHiDraftToolDef(mode: HiDraftMode): HiDraftToolDef {
  const ends =
    mode === "card"
      ? "Calling it ends this run: the owner gets an Approve card, and only their Approve captures the drafts."
      : "Calling it ends this run and captures nothing: the reply lists the exact hi commands for the person at the CLI.";
  return {
    type: "function",
    function: {
      name: HI_DRAFT_TOOL,
      description:
        "Draft acceptance criteria for this repo's hi/ (AGENT-18) when the requester wants a criterion that is not captured yet. " +
        "Draft only what they asked for, in their words — never invent criteria. Each draft is a new id in a family hi/ already has " +
        `(FAMILY-N, or FAMILY-N.a under a captured parent) and one line of text (at most ${HI_DRAFT_TEXT_MAX} characters, no secrets). ` +
        ends,
      parameters: {
        type: "object",
        properties: {
          drafts: {
            type: "array",
            description: `1–${HI_DRAFT_MAX} drafted criteria.`,
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "A new hi id, e.g. AGENT-19 or AGENT-18.b." },
                text: { type: "string", description: "The criterion in one line, in the requester's words." },
              },
              required: ["id", "text"],
            },
          },
        },
        required: ["drafts"],
      },
    },
  };
}

/** Tool catalog plus `hi-draft` (a plugin sharing the name is dropped). */
export function withHiDraftTool<T extends { function: { name: string } }>(
  tools: readonly T[],
  mode: HiDraftMode | undefined,
): Array<T | HiDraftToolDef> {
  if (!mode) return [...tools];
  return [...tools.filter((t) => t.function.name !== HI_DRAFT_TOOL), buildHiDraftToolDef(mode)];
}

/** Trim and collapse whitespace; null when control characters remain. */
function oneLine(raw: string): string | null {
  const s = raw.replace(/[\t\r\n ]+/g, " ").trim();
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(s) ? null : s;
}

/** Parse `{"drafts":[{"id","text"}]}`; an error line for the model otherwise. */
export function parseHiDraftArgs(raw: string | undefined): { ok: true; drafts: HiDraft[] } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? "");
  } catch {
    return { ok: false, error: `${HI_DRAFT_TOOL} needs JSON arguments: {"drafts":[{"id":"FAMILY-N","text":"..."}]}` };
  }
  const list = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as { drafts?: unknown }).drafts : undefined;
  if (!Array.isArray(list) || list.length === 0) {
    return { ok: false, error: `${HI_DRAFT_TOOL} needs a non-empty "drafts" array of {"id","text"}` };
  }
  if (list.length > HI_DRAFT_MAX) {
    return { ok: false, error: `${HI_DRAFT_TOOL} takes at most ${HI_DRAFT_MAX} drafts at a time` };
  }
  const drafts: HiDraft[] = [];
  for (const d of list) {
    const o = d && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, unknown>) : null;
    if (!o || typeof o.id !== "string" || typeof o.text !== "string") {
      return { ok: false, error: `each ${HI_DRAFT_TOOL} draft needs a string "id" and "text"` };
    }
    const text = oneLine(o.text);
    if (text === null) return { ok: false, error: `draft ${o.id.trim()}: the text must be one line with no control characters` };
    drafts.push({ id: o.id.trim(), text });
  }
  return { ok: true, drafts };
}

// ------------------------------------------------------------------ hi export

/** What `hi export` says is captured: declared families, criteria (id → text) and retired ids. */
export type HiExport = { families: Set<string>; criteria: Map<string, string>; retired: Set<string> };

/** Parse `hi export` JSON; null when it is not that shape. */
export function parseHiExport(json: string): HiExport | null {
  try {
    const v = JSON.parse(json) as { files?: unknown };
    if (!v || !Array.isArray(v.files)) return null;
    const out: HiExport = { families: new Set(), criteria: new Map(), retired: new Set() };
    for (const f of v.files as Record<string, unknown>[]) {
      if (!f || typeof f !== "object") return null;
      for (const fam of Array.isArray(f.families) ? f.families : []) if (typeof fam === "string") out.families.add(fam);
      for (const c of Array.isArray(f.criteria) ? (f.criteria as Record<string, unknown>[]) : []) {
        if (c && typeof c.id === "string") out.criteria.set(c.id, typeof c.text === "string" ? c.text : "");
      }
      for (const r of Array.isArray(f.retired) ? (f.retired as unknown[]) : []) {
        const id = typeof r === "string" ? r : r && typeof r === "object" ? (r as { id?: unknown }).id : undefined;
        if (typeof id === "string") out.retired.add(id);
      }
    }
    return out;
  } catch {
    return null;
  }
}

/** The `hi` CLI on `env`'s PATH; null when it is not installed. */
export function hiBin(env: NodeJS.ProcessEnv = process.env): string | null {
  return Bun.which("hi", { PATH: env.PATH ?? "" }) ?? null;
}

/** The only env a `hi` child gets. */
function hiChildEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = { PATH: env.PATH ?? "" };
  if (env.HOME) out.HOME = env.HOME;
  return out;
}

/** `hi export` in `cwd` (async); null when it can't be read. */
export async function readHiExport(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<HiExport | null> {
  const bin = hiBin(env);
  if (!bin) return null;
  try {
    const proc = Bun.spawn([bin, "export"], { cwd, env: hiChildEnv(env), stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    const [out, , code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return code === 0 ? parseHiExport(out) : null;
  } catch {
    return null;
  }
}

function readHiExportSync(cwd: string, bin: string, env: NodeJS.ProcessEnv): HiExport | null {
  try {
    const p = Bun.spawnSync([bin, "export"], { cwd, env: hiChildEnv(env), stdout: "pipe", stderr: "pipe", stdin: "ignore", timeout: 30_000 });
    return p.exitCode === 0 ? parseHiExport(p.stdout.toString()) : null;
  } catch {
    return null;
  }
}

/**
 * Why `drafts` can't be drafted against `exp`; null when they can. Each id
 * is new (not captured, not retired, not twice), its family is declared by a
 * hi file, a dotted id's parent is captured (not retired) or drafted before
 * it; each text is non-empty, does not start with `-` (it would read as a
 * flag), is at most {@link HI_DRAFT_TEXT_MAX} characters, and is unchanged
 * by SAFE-6 scrubbing.
 */
export function validateHiDrafts(drafts: readonly HiDraft[], exp: HiExport): string | null {
  if (drafts.length === 0) return "no drafts";
  if (drafts.length > HI_DRAFT_MAX) return `at most ${HI_DRAFT_MAX} drafts at a time`;
  const seen = new Set<string>();
  for (const d of drafts) {
    const m = d.id.match(HI_ID_RE);
    if (!m) return `${d.id || "(empty id)"} is not a hi id (FAMILY-N or FAMILY-N.a)`;
    const family = m[1]!;
    if (!exp.families.has(family)) {
      return `${d.id}: no hi file declares the family ${family}; draft into a family hi/ already has`;
    }
    if (exp.criteria.has(d.id)) return `${d.id} is already captured; draft a new id`;
    if (exp.retired.has(d.id)) return `${d.id} is retired and stays reserved; draft a new id`;
    if (seen.has(d.id)) return `${d.id} is drafted twice`;
    if (m[3]) {
      const parent = d.id.slice(0, d.id.lastIndexOf("."));
      if (!exp.criteria.has(parent) && !seen.has(parent)) {
        return `${d.id} needs its parent ${parent} captured (or drafted before it)`;
      }
    }
    if (!d.text) return `${d.id}: the text is empty`;
    // A leading dash could read as a flag to the hi CLI.
    if (d.text.startsWith("-")) return `${d.id}: the text must not start with "-"`;
    if (d.text.length > HI_DRAFT_TEXT_MAX) return `${d.id}: the text is over ${HI_DRAFT_TEXT_MAX} characters`;
    if (scrubSecrets(d.text) !== d.text) {
      return `${d.id}: the text looks like it holds a secret, and a draft that scrubbing would change is refused (SAFE-6)`;
    }
    seen.add(d.id);
  }
  return null;
}

// ------------------------------------------------------------------ asks

/** `text` as one POSIX shell word (single-quoted). */
function shellWord(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

/** The exact command that captures `d`: `hi <ID> '<text>'`. */
export function hiCaptureCommand(d: HiDraft): string {
  return `hi ${d.id} ${shellWord(d.text)}`;
}

/** The ask a Discord run ends with: the drafts, and that only the owner's Approve captures them. */
export function hiDraftCardQuestion(drafts: readonly HiDraft[], requestId: string): string {
  return [
    `I drafted ${drafts.length === 1 ? "a hi criterion" : `${drafts.length} hi criteria`} for this repo and captured nothing (AGENT-18):`,
    ...drafts.map((d) => `• ${d.id} — ${d.text}`),
    `The owner gets an Approve card (request ${requestId}); only their Approve captures ${drafts.length === 1 ? "it" : "them"}, and a reply here doesn't.`,
  ].join("\n");
}

/** The ask the CLI ends with: the drafts as the exact `hi` commands, run by the person at the CLI. */
export function hiDraftCliQuestion(drafts: readonly HiDraft[]): string {
  return [
    `I drafted ${drafts.length === 1 ? "a hi criterion" : `${drafts.length} hi criteria`} for this repo and captured nothing (AGENT-18). ` +
      `To capture ${drafts.length === 1 ? "it" : "them"}, run in the repo:`,
    ...drafts.map(hiCaptureCommand),
  ].join("\n");
}

function asAsk(question: string): HumanAsk | null {
  const q = normalizeQuestion(question);
  // Never cut: a list that would not fit is refused back to the model.
  return q && q === question.trim() && q.length <= ASK_QUESTION_MAX ? { reason: "clarify", question: q } : null;
}

// ------------------------------------------------------------------ the call

export type HiDraftOutcome = { ok: true; ask: HumanAsk; requestId?: string } | { ok: false; refusal: PluginHandlerResult };

function refuse(error: string): HiDraftOutcome {
  return { ok: false, refusal: { ok: false, error: `refused (AGENT-18): ${error}`, exitCode: 2 } };
}

async function gitOut(cwd: string, args: string[]): Promise<string | null> {
  const r = await runGit(cwd, args);
  return r.code === 0 && !r.truncated && !r.timedOut ? r.stdout.trim() : null;
}

/**
 * Handle one `hi-draft` call in `cwd`: the gate again (role re-resolved
 * now), the arguments, `hi export` and the scrub check; then, in a Discord
 * run, the capture request for the owner's card, or in the CLI the
 * commands. Either way the run ends blocked with the returned ask. Never
 * throws; any failure is a refusal back to the model and records nothing.
 */
export async function handleHiDraftCall(opts: {
  rawArgs: string | undefined;
  cwd: string;
  env: NodeJS.ProcessEnv;
  ways?: RepoWays;
  now?: () => number;
}): Promise<HiDraftOutcome> {
  const { cwd, env } = opts;
  try {
    const gate = await hiDraftGate({ env, cwd, ways: opts.ways });
    if (!gate.offered) return refuse(gate.reason);
    const args = parseHiDraftArgs(opts.rawArgs);
    if (!args.ok) return refuse(args.error);
    const exp = await readHiExport(cwd, env);
    if (!exp) return refuse("could not read the captured criteria with `hi export` (is the hi CLI installed?), so nothing was drafted");
    const invalid = validateHiDrafts(args.drafts, exp);
    if (invalid) return refuse(invalid);

    if (gate.mode === "cli") {
      const ask = asAsk(hiDraftCliQuestion(args.drafts));
      if (!ask) return refuse("the drafts are too long for one ask; draft fewer or shorter criteria");
      return { ok: true, ask };
    }

    const owner = (await loadOwnerConfig({ env })).owner;
    if (!owner?.discordId) return refuse("no owner is configured, so nobody could approve a capture");
    const requester = (env.CORVIDINHO_ACTING_DISCORD_USER_ID ?? "").trim();
    if (!requester) return refuse("this run names nobody who asked");
    const top = realpathSync(resolve(cwd));
    const common = await gitOut(top, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    const branch = await gitOut(top, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    const head = await gitOut(top, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
    if (!common || !head) return refuse("could not read this worktree's git state, so nothing was drafted");
    if (!branch) return refuse("this worktree is not on a branch, so a capture could not be put back here later");
    // Check the ask fits before anything is recorded (the id is fixed-length).
    const sample = hiDraftCardQuestion(args.drafts, "hc_0000000000000000");
    if (!asAsk(sample)) return refuse("the drafts are too long for one ask; draft fewer or shorter criteria");

    const db = openCorvidinhoDb({ env });
    let req: HiCaptureRequest;
    try {
      const store = new HiCaptureStore({ db, ...(opts.now ? { now: opts.now } : {}) });
      req = store.request({
        repo: realpathSync(common),
        project: projectLabel(projectKeyFor(top)) ?? "this repo",
        worktree: top,
        branch,
        head,
        drafts: args.drafts,
        requester,
        role: gate.role ?? "team",
        surface: actingSurface(env) ?? "chat",
        sessionId: (env.CORVIDINHO_DISCORD_SESSION_ID ?? "").trim(),
        originChannelId: env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID,
        originParentChannelId: env.CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID,
      });
    } finally {
      db.close();
    }
    const ask = asAsk(hiDraftCardQuestion(args.drafts, req.id));
    if (!ask) return refuse("the drafts are too long for one ask; draft fewer or shorter criteria");
    return { ok: true, ask, requestId: req.id };
  } catch (err) {
    return refuse(`could not record the drafts (${scrubSecrets(err instanceof Error ? err.message : String(err)).slice(0, 200)}), so nothing was drafted`);
  }
}

// ------------------------------------------------------------------ capture

function gitSync(cwd: string, args: string[]): string | null {
  try {
    const p = Bun.spawnSync(["git", "-c", "core.hooksPath=/dev/null", ...args], {
      cwd,
      env: gitEnv(cwd),
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      timeout: 30_000,
    });
    return p.exitCode === 0 ? p.stdout.toString().trim() : null;
  } catch {
    return null;
  }
}

/**
 * Why the request's session worktree is not the one the drafts were made in
 * (gone, not a git top, another repository, another branch); null when it
 * is. Never throws.
 */
export function hiCaptureWorktreeProblem(req: HiCaptureRequest): string | null {
  let top: string;
  try {
    top = realpathSync(req.worktree);
    if (!statSync(top).isDirectory()) return "is not a directory";
  } catch {
    return "is gone";
  }
  const shown = gitSync(top, ["rev-parse", "--show-toplevel"]);
  try {
    if (!shown || realpathSync(shown) !== top) return "is not a git worktree top";
  } catch {
    return "is not a git worktree top";
  }
  const common = gitSync(top, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  try {
    if (!common || realpathSync(common) !== req.repo) return "belongs to another repository";
  } catch {
    return "belongs to another repository";
  }
  const branch = gitSync(top, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (branch !== req.branch) return `is not on branch ${req.branch} any more`;
  return null;
}

/**
 * Before Approve captures anything: the session worktree must be the one
 * the drafts were made in. When its directory is gone (the talk was parked),
 * it is re-created at the same path on the same branch from the main
 * checkout; when that can't be done — the branch is gone, the path is taken
 * by something else, a bare repository — it throws and nothing is captured
 * (fail closed). Resolves whether it was re-created.
 */
export async function ensureHiCaptureWorktree(req: HiCaptureRequest): Promise<{ recreated: boolean }> {
  if (existsSync(req.worktree)) {
    const problem = hiCaptureWorktreeProblem(req);
    if (problem) throw new Error(`the session worktree ${problem}, so nothing was captured`);
    return { recreated: false };
  }
  if (basename(req.repo) !== ".git") {
    throw new Error("the session worktree is gone and its repository has no main checkout to re-create it from, so nothing was captured");
  }
  const main = dirname(req.repo);
  await runGit(main, ["worktree", "prune"]);
  const has = await runGit(main, ["rev-parse", "--verify", "--quiet", `refs/heads/${req.branch}`]);
  if (has.code !== 0) {
    throw new Error(`the session worktree is gone and so is its branch ${req.branch}, so nothing was captured`);
  }
  mkdirSync(dirname(req.worktree), { recursive: true });
  const add = await runGit(main, ["worktree", "add", req.worktree, req.branch]);
  if (add.code !== 0) {
    throw new Error(`could not re-create the session worktree on ${req.branch}, so nothing was captured`);
  }
  const problem = hiCaptureWorktreeProblem(req);
  if (problem) throw new Error(`the re-created session worktree ${problem}, so nothing was captured`);
  return { recreated: true };
}

/** A file under hi/ (or the root INTENT.md the hi CLI may create), as bytes and mode. */
type RawEntry = { bytes: Buffer; mode: number } | { link: string };
type RawTree = Map<string, RawEntry>;

/** Bytes one capture step reads per file before it gives up (fail closed). */
const RAW_MAX_BYTES = 1024 * 1024;
const RAW_MAX_ENTRIES = 2000;
/** Paths outside hi/ the hi CLI may create on a first capture. */
const HI_SIDE_FILES = ["INTENT.md"];

function readRaw(top: string): RawTree {
  // hi/ itself must be a real directory: a capture through a link would
  // write somewhere the undo below can't reach.
  if (!lstatSync(join(top, "hi")).isDirectory()) throw new Error("hi/ is not a plain directory a capture can put back");
  const out: RawTree = new Map();
  const add = (rel: string): void => {
    const abs = join(top, rel);
    let st;
    try {
      st = lstatSync(abs);
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return;
      throw e;
    }
    if (st.isDirectory()) {
      for (const n of readdirSync(abs).sort()) add(`${rel}/${n}`);
      return;
    }
    if (out.size >= RAW_MAX_ENTRIES) throw new Error("hi/ has too many files to capture safely");
    if (st.isSymbolicLink()) {
      out.set(rel, { link: readlinkSync(abs) });
      return;
    }
    if (!st.isFile() || st.size > RAW_MAX_BYTES) throw new Error(`${rel} is not a plain file a capture can put back`);
    out.set(rel, { bytes: readFileSync(abs), mode: st.mode & 0o777 });
  };
  add("hi");
  for (const f of HI_SIDE_FILES) add(f);
  return out;
}

function sameEntry(a: RawEntry | undefined, b: RawEntry | undefined): boolean {
  if (!a || !b) return a === b;
  if ("link" in a || "link" in b) return "link" in a && "link" in b && a.link === b.link;
  return a.mode === b.mode && a.bytes.equals(b.bytes);
}

/** Put hi/ (and the side files) back as `before` was. Best effort; never throws. */
function restoreRaw(top: string, before: RawTree): void {
  let after: RawTree;
  try {
    after = readRaw(top);
  } catch {
    after = new Map();
  }
  for (const p of after.keys()) {
    if (before.has(p)) continue;
    try {
      rmSync(join(top, p), { force: true });
    } catch {
      /* best effort */
    }
  }
  for (const [p, e] of before) {
    if (sameEntry(e, after.get(p)) || "link" in e) continue;
    try {
      mkdirSync(dirname(join(top, p)), { recursive: true });
      writeFileSync(join(top, p), e.bytes);
      chmodSync(join(top, p), e.mode);
    } catch {
      /* best effort */
    }
  }
}

function rawKey(e: RawEntry | undefined): string | null {
  if (!e) return HI_ABSENT;
  if ("link" in e) return null;
  return hiContentKey(e.bytes.toString("utf8"), (e.mode & 0o111) !== 0);
}

export type HiCaptureResult = { captured: string[]; steps: HiCaptureFileStep[] };

function oneLineError(text: string): string {
  const line = scrubSecrets(text).replace(/\s+/g, " ").trim();
  return line.length > 300 ? `${line.slice(0, 299)}…` : line;
}

/**
 * The owner approved: run `hi <ID> "<text>"` for each draft of `req` in its
 * session worktree (already made sure of by {@link ensureHiCaptureWorktree}),
 * synchronously, inside the card engine's transaction on `db`. All or
 * nothing: before anything runs the worktree, the drafts (`hi export` again,
 * the scrub check again) and the hi CLI are checked; after, `hi export` must
 * show each id with exactly its text and `hi check` must pass. On any
 * failure hi/ (and a root INTENT.md the hi CLI made) are put back and it
 * throws, so the transaction rolls back and nothing counts as captured.
 * Then each capture writes a SAFE-5 `hi-capture-criterion` row, and every
 * hi/ path it changed goes in the ledger the hi guard reads.
 */
export function runHiCapture(opts: {
  db: Database;
  req: HiCaptureRequest;
  actor: string;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}): HiCaptureResult {
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now;
  const { req } = opts;
  const bin = hiBin(env);
  if (!bin) throw new Error("the hi CLI is not installed where the bridge runs, so nothing was captured");
  const problem = hiCaptureWorktreeProblem(req);
  if (problem) throw new Error(`the session worktree ${problem}, so nothing was captured`);
  const top = realpathSync(req.worktree);
  const exp = readHiExportSync(top, bin, env);
  if (!exp) throw new Error("could not read the captured criteria with `hi export`, so nothing was captured");
  const invalid = validateHiDrafts(req.drafts, exp);
  if (invalid) throw new Error(`${invalid}, so nothing was captured`);

  const before = readRaw(top);
  try {
    for (const d of req.drafts) {
      const p = Bun.spawnSync([bin, d.id, d.text], {
        cwd: top,
        env: hiChildEnv(env),
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
        timeout: 30_000,
      });
      if (p.exitCode !== 0) {
        throw new Error(`hi ${d.id} failed: ${oneLineError(p.stderr.toString() || `exit ${p.exitCode}`)}`);
      }
    }
    const after = readHiExportSync(top, bin, env);
    if (!after) throw new Error("could not read `hi export` after the capture");
    for (const d of req.drafts) {
      if (after.criteria.get(d.id) !== d.text) throw new Error(`${d.id} did not come out as drafted`);
    }
    const check = Bun.spawnSync([bin, "check"], { cwd: top, env: hiChildEnv(env), stdout: "pipe", stderr: "pipe", stdin: "ignore", timeout: 30_000 });
    if (check.exitCode !== 0) throw new Error(`hi check failed after the capture: ${oneLineError(check.stderr.toString() || check.stdout.toString())}`);

    const now2 = readRaw(top);
    const steps: HiCaptureFileStep[] = [];
    for (const p of [...new Set([...before.keys(), ...now2.keys()])].sort()) {
      if (!p.startsWith("hi/") || sameEntry(before.get(p), now2.get(p))) continue;
      const b = rawKey(before.get(p));
      const a = rawKey(now2.get(p));
      if (b === null || a === null) throw new Error(`${p} is not a plain text file the hi guard can recognise`);
      steps.push({ path: p, before: b, after: a });
    }
    const at = now();
    recordHiCaptureFiles(opts.db, req.id, req.repo, steps, at);
    const key = auditKeyFromEnv(env);
    for (const d of req.drafts) {
      appendAudit(
        opts.db,
        {
          action: "hi-capture-criterion",
          actor: opts.actor,
          surface: "discord:hi-card",
          argsDigest: argsDigest([req.id, d.id, d.text]),
          outcome: "ok",
        },
        { key, now: at },
      );
    }
    new HiCaptureStore({ db: opts.db, now }).markCaptured(req.id, req.drafts.map((d) => d.id));
    return { captured: req.drafts.map((d) => d.id), steps };
  } catch (err) {
    restoreRaw(top, before);
    throw err;
  }
}
