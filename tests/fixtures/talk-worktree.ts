/**
 * Temp git projects and Corvidinho talk worktrees for the verify gate tests
 * (AGENT-15.a, REQ-agent-015). The talk worktree is made by the product's
 * own `ensureTalkWorkspace`, so it carries the verified marker a new talk
 * starts with.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { settleTalkVerified, talkWorktreeGitDir } from "../../src/worktree/base.ts";
import { ensureTalkWorkspace } from "../../src/worktree/manager.ts";

/** Test-side git (setup / assertions), repo-locating env stripped. */
export function gitIn(cwd: string, ...args: string[]): string {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || k.startsWith("GIT_")) continue;
    env[k] = v;
  }
  const r = Bun.spawnSync(["git", ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
  return r.stdout.toString();
}

/** `<base>/project`: a git repo on `main` with `app.ts` committed. */
export function makeProject(base: string): string {
  const dir = join(base, "project");
  mkdirSync(dir, { recursive: true });
  gitIn(dir, "init", "-q", "-b", "main");
  gitIn(dir, "config", "user.name", "Fixture Bot");
  gitIn(dir, "config", "user.email", "fixture@example.invalid");
  gitIn(dir, "config", "commit.gpgsign", "false");
  writeFileSync(join(dir, "app.ts"), "export const x = 1;\n");
  gitIn(dir, "add", "app.ts");
  gitIn(dir, "commit", "-q", "-m", "init");
  return dir;
}

export type TalkFixture = {
  project: string;
  /** The talk worktree (a run's cwd). */
  work: string;
  /** The talk worktree's own git dir (holds the verified marker). */
  gitDir: string;
};

/** A talk worktree of `<base>/project`, as the bridge makes one. */
export async function makeTalk(base: string, sessionId = "verify-gate-talk"): Promise<TalkFixture> {
  const project = makeProject(base);
  const made = await ensureTalkWorkspace({ projectWorkingDir: project, sessionId });
  if (!made.ok) throw new Error(made.error);
  const work = made.workspace.workDir;
  const gitDir = talkWorktreeGitDir(work);
  if (!gitDir) throw new Error(`not a talk worktree: ${work}`);
  return { project, work, gitDir };
}

/**
 * A talk whose last run ended blocked with an edit it never verified: the
 * edit is on disk and the verified marker is gone, as `runTask` leaves it.
 */
export async function makeCarriedTalk(base: string): Promise<TalkFixture> {
  const talk = await makeTalk(base);
  writeFileSync(join(talk.work, "app.ts"), "export const x = ;\n");
  settleTalkVerified(talk.gitDir, false);
  return talk;
}
