/**
 * Title and body for a /work draft PR, built from the real diff (GITHUB-2,
 * REQ-discord-088). The description comes from what the branch actually
 * changed (name-status, diffstat, commits) plus the verify result, never from
 * the model's own account of its work.
 *
 * Every piece of repo, model or chat text sits in a code fence, so it cannot
 * @-mention people or link issues. Title and body are secret-scrubbed
 * (SAFE-6) before they leave the machine.
 *
 * GITHUB-9: a body for a reviewed tree says so under "## Verify" and points
 * to the "## Second-model review" section — what each round raised and what
 * changed after it — which `github-pr-create` writes after this body from
 * the review record (src/work/review.ts `reviewSection`), so only Corvidinho
 * writes it and a model's text can never pass for it.
 */

import { scrubSecrets } from "../store/scrub.ts";

export type WorkPrFile = { status: string; path: string; origPath?: string };

/** Where the passing verify lane ran for this tree (AGENT-4). */
export type WorkPrVerifySource = "run" | "pre-push";

export type WorkPrFacts = {
  taskId: string;
  description: string;
  branch: string;
  base: string;
  files: WorkPrFile[];
  diffstat: string;
  /** `<short sha> <subject>` lines, newest first. */
  commits: string[];
  verify: WorkPrVerifySource;
  /** GITHUB-9: a second-model review finished for this exact tree. */
  reviewed?: boolean;
};

/** GITHUB-9: the Verify section's line for a reviewed tree. */
export const WORK_PR_REVIEWED_LINE =
  "A second model reviewed this tree before the PR (GITHUB-9): what it raised and what changed after each round are listed under **Second-model review** below.";

export const WORK_PR_LIMITS = {
  title: 72,
  description: 1_000,
  files: 100,
  diffstat: 6_000,
  commits: 50,
} as const;

export const VERIFY_COMMAND = "fledge lanes run verify --non-interactive";

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

/** A fence longer than any backtick run inside `text` (min 3). */
function fence(text: string, info = "text"): string {
  let longest = 0;
  for (const m of text.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  const f = "`".repeat(Math.max(3, longest + 1));
  return `${f}${info}\n${text}\n${f}`;
}

/**
 * First non-empty line of the task description, whitespace collapsed, capped
 * at 72 chars. Leading `-` is stripped so the title can never read as a flag
 * when it is passed on to the github-pr-create plugin.
 */
export function workPrTitle(description: string): string {
  const first =
    description
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, " ").trim())
      .find((l) => l.length > 0) ?? "";
  const t = first.replace(/^-+\s*/, "").trim();
  return scrubSecrets(clip(t || "Corvidinho work task", WORK_PR_LIMITS.title));
}

/** Commit message for uncommitted worktree changes shipped by /work. */
export function workCommitMessage(description: string, taskId: string): string {
  return scrubSecrets(
    `work: ${workPrTitle(description)}\n\nCorvidinho /work task ${taskId}.`,
  );
}

function fileLine(f: WorkPrFile): string {
  return f.origPath ? `${f.status}  ${f.origPath} -> ${f.path}` : `${f.status}  ${f.path}`;
}

function listBlock(lines: string[], max: number): string {
  const shown = lines.slice(0, max);
  if (lines.length > max) shown.push(`… and ${lines.length - max} more`);
  return fence(shown.join("\n"));
}

/** Markdown PR body; the github-pr-create plugin appends the attribution. */
export function buildWorkPrBody(f: WorkPrFacts): string {
  const verifyLine =
    f.verify === "run"
      ? `\`${VERIFY_COMMAND}\` passed in the work run on this tree.`
      : `\`${VERIFY_COMMAND}\` passed on this tree right before the push.`;
  const desc = clip(f.description.trim(), WORK_PR_LIMITS.description);
  const stat = f.diffstat.trim();
  const parts = [
    `Draft PR from Corvidinho \`/work\` task \`${f.taskId}\` (branch \`${f.branch}\` into \`${f.base}\`).`,
    "",
    "## Task",
    "",
    fence(desc || "(no description)"),
    "",
    "## What changed",
    "",
    `${f.files.length} file(s) changed against \`${f.base}\`:`,
    "",
    listBlock(f.files.map(fileLine), WORK_PR_LIMITS.files),
  ];
  if (stat) {
    parts.push("", fence(clip(stat, WORK_PR_LIMITS.diffstat)));
  }
  parts.push(
    "",
    "## Commits",
    "",
    f.commits.length ? listBlock(f.commits, WORK_PR_LIMITS.commits) : "(none)",
    "",
    "## Verify",
    "",
    verifyLine,
  );
  if (f.reviewed) parts.push("", WORK_PR_REVIEWED_LINE);
  return scrubSecrets(parts.join("\n"));
}
