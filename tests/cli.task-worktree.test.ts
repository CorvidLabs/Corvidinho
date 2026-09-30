/**
 * SESSION-WORKTREE-1.a (REQ-cli-122): "A CLI task run in a git repo works in
 * its own worktree by default; --here runs it in my current checkout."
 *
 * Unit cases drive `enterCliTaskWorkspace` / `finishCliTaskWorkspace`; the
 * subprocess cases run the real CLI against a localhost fake model in temp
 * repos under the test run's temp root (never this checkout), and every test
 * removes the worktrees and branches it made.
 */
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { parseGlobalFlags, parseTaskHere } from "../src/cli.ts";
import { parseNdjsonLine } from "../src/agent/events-ndjson.ts";
import type { AgentEvent, TaskResult } from "../src/agent/types.ts";
import { buildDelegateSpawn } from "../src/autonomous/delegate.ts";
import { createSpawnAgentClient as createDiscordClient } from "../src/discord/agent-client.ts";
import { createSpawnAgentClient as createWatchClient } from "../src/watch/agent-client.ts";
import {
  CLI_HERE_HINT,
  enterCliTaskWorkspace,
  finishCliTaskWorkspace,
  isSpawnedTaskChild,
  type CliTaskWorkspace,
} from "../src/worktree/cli-run.ts";
import { startFakeLlm, type FakeReply } from "./fixtures/fake-llm.ts";
import { LANE_PASS_OUTPUT } from "./fixtures/lane-output.ts";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");
/** Subprocess tests can be slow on a loaded box. */
const T = 60_000;

/** Env keys that would make a spawned CLI a product child (it must be a plain local run here). */
const CHILD_KEYS = [
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_ROLE",
  "CORVIDINHO_ACTING_SURFACE",
  "CORVIDINHO_WATCH_SESSION_ID",
  "CORVIDINHO_DISCORD_SESSION_ID",
  "CORVIDINHO_DELEGATE_DEPTH",
  "WORKTREE_BASE_DIR",
];

function localEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || k.startsWith("GIT_") || CHILD_KEYS.includes(k)) continue;
    env[k] = v;
  }
  return { ...env, ...extra };
}

function git(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(["git", ...args], { cwd, env: localEnv(), stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
  return r.stdout.toString();
}

const made: string[] = [];

/** `<base>/repo`: a git repo on `main` with `app.ts` and `sub/keep.txt` committed. */
function makeRepo(opts: { commit?: boolean } = {}): { base: string; repo: string } {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-cli-worktree-")));
  const repo = join(base, "repo");
  mkdirSync(join(repo, "sub"), { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.name", "Fixture Bot");
  git(repo, "config", "user.email", "fixture@example.invalid");
  git(repo, "config", "commit.gpgsign", "false");
  made.push(repo);
  if (opts.commit === false) return { base, repo };
  writeFileSync(join(repo, "app.ts"), "export const x = 1;\n");
  writeFileSync(join(repo, "sub", "keep.txt"), "kept\n");
  writeFileSync(join(repo, "fledge.toml"), "[corvidinho]\nmax_retries = 0\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "init");
  return { base, repo };
}

/** Linked worktrees of `repo` other than the checkout itself. */
function linked(repo: string): string[] {
  return git(repo, "worktree", "list", "--porcelain")
    .split("\n")
    .filter((l) => l.startsWith("worktree "))
    .map((l) => l.slice("worktree ".length))
    .filter((p) => p !== realpathSync(repo));
}

function cliBranches(repo: string): string[] {
  return git(repo, "branch", "--list", "talk/cli_*", "--format=%(refname:short)")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Remove every worktree and talk/cli_* branch a test left (kept-worktree cases). */
function cleanRepo(repo: string): void {
  if (!existsSync(repo)) return;
  try {
    for (const w of linked(repo)) git(repo, "worktree", "remove", "--force", w);
    for (const b of cliBranches(repo)) git(repo, "branch", "-D", b);
  } catch {
    // Unborn or broken fixture repo: nothing linked.
  }
}

afterEach(() => {
  while (made.length > 0) cleanRepo(made.pop()!);
});

/**
 * A post-checkout hook that fails, as git-lfs's does when git-lfs is not
 * installed: `git worktree add -b` then exits non-zero after it has made the
 * branch and the whole worktree.
 */
function failingCheckoutHook(base: string, repo: string): void {
  const hooks = join(base, "hooks");
  mkdirSync(hooks, { recursive: true });
  writeFileSync(join(hooks, "post-checkout"), "#!/bin/sh\necho 'git-lfs was not found on your path' >&2\nexit 2\n");
  chmodSync(join(hooks, "post-checkout"), 0o755);
  git(repo, "config", "core.hooksPath", hooks);
}

/** A fake `fledge` whose verify lane passes with a test summary. */
function fakeFledgeBin(base: string): string {
  const bin = join(base, "bin");
  mkdirSync(bin, { recursive: true });
  const out = join(base, "lane-output.txt");
  writeFileSync(out, LANE_PASS_OUTPUT);
  writeFileSync(join(bin, "fledge"), `#!/bin/sh\ncat '${out}'\nexit 0\n`);
  chmodSync(join(bin, "fledge"), 0o755);
  return bin;
}

/** First model turn writes `note.txt` in the run cwd; later turns just answer. */
function writesNote(): (body: unknown) => FakeReply {
  let n = 0;
  return () =>
    n++ === 0
      ? { toolCalls: [{ name: "files-write", args: JSON.stringify({ argv: ["note.txt", "from the run"] }) }] }
      : "Wrote note.txt.";
}

type Run = { code: number; out: string; err: string };

async function cli(cwd: string, args: string[], env: Record<string, string>): Promise<Run> {
  const proc = Bun.spawn(["bun", CLI, ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
  const [code, out, err] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code, out, err };
}

function parsedJson(out: string): { result: TaskResult; events: AgentEvent[] } {
  return JSON.parse(out) as { result: TaskResult; events: AgentEvent[] };
}

const fakes: ReturnType<typeof startFakeLlm>[] = [];
function fakeLlm(reply?: (body: unknown) => FakeReply) {
  const f = startFakeLlm(reply ? { reply } : {});
  fakes.push(f);
  return f;
}
afterAll(() => {
  for (const f of fakes) f.stop();
});

describe("--here is read only from task run's own args (REQ-cli-122)", () => {
  test("before the first --, never as --task text or after --", () => {
    expect(parseTaskHere(["--here"])).toBe(true);
    expect(parseTaskHere(["--output", "ndjson", "--here"])).toBe(true);
    expect(parseTaskHere([])).toBe(false);
    expect(parseTaskHere(["--", "--here"])).toBe(false);
    expect(parseTaskHere(["--here=1"])).toBe(false);
    for (const argv of [
      ["task", "run", "--task", "--here"],
      ["task", "run", "--task=--here"],
      ["task", "run", "--task", "fix it", "--", "--here"],
    ]) {
      expect(parseTaskHere(parseGlobalFlags(argv).rest.slice(2))).toBe(false);
    }
    expect(parseTaskHere(parseGlobalFlags(["task", "run", "--here", "--task", "x"]).rest.slice(2))).toBe(true);
    expect(parseTaskHere(parseGlobalFlags(["task", "run", "--task", "x", "--here"]).rest.slice(2))).toBe(true);
  });
});

describe("enterCliTaskWorkspace (REQ-cli-122)", () => {
  test("a git repo gets its own worktree from the realpath repo top, in the same subdir", async () => {
    const { base, repo } = makeRepo();
    // Uncommitted and untracked files in the checkout stay out of the worktree.
    writeFileSync(join(repo, "app.ts"), "export const x = 2;\n");
    writeFileSync(join(repo, "sub", "untracked.txt"), "local\n");
    const link = join(base, "link");
    symlinkSync(join(repo, "sub"), link);
    const entered = await enterCliTaskWorkspace({ cwd: link, here: false, env: {} });
    expect(entered.ok).toBe(true);
    if (!entered.ok) return;
    const ws = entered.workspace as Extract<CliTaskWorkspace, { kind: "worktree" }>;
    expect(ws.kind).toBe("worktree");
    expect(ws.repoTop).toBe(repo);
    expect(dirname(ws.dir)).toBe(join(base, ".corvid-worktrees"));
    expect(basename(ws.dir)).toMatch(/^talk-cli_[0-9a-f]{12}-[0-9a-f]{16}$/);
    expect(ws.branch).toBe(`talk/${basename(ws.dir).slice("talk-".length)}`);
    expect(ws.cwd).toBe(join(ws.dir, "sub"));
    expect(readFileSync(join(ws.dir, "app.ts"), "utf8")).toBe("export const x = 1;\n");
    expect(existsSync(join(ws.cwd, "keep.txt"))).toBe(true);
    expect(existsSync(join(ws.cwd, "untracked.txt"))).toBe(false);
    expect(linked(repo)).toEqual([ws.dir]);
    expect(cliBranches(repo)).toEqual([ws.branch]);
    const done = await finishCliTaskWorkspace(ws);
    expect(done.report).toEqual({ dir: ws.dir, branch: ws.branch, kept: false, branchKept: false });
    expect(done.note).toBeNull();
    expect(linked(repo)).toEqual([]);
    expect(cliBranches(repo)).toEqual([]);
  });

  test("WORKTREE_BASE_DIR is the base when set", async () => {
    const { base, repo } = makeRepo();
    const prev = process.env.WORKTREE_BASE_DIR;
    process.env.WORKTREE_BASE_DIR = join(base, "elsewhere");
    try {
      const entered = await enterCliTaskWorkspace({ cwd: repo, here: false, env: {} });
      expect(entered.ok).toBe(true);
      if (!entered.ok || entered.workspace.kind !== "worktree") throw new Error("no worktree");
      expect(dirname(entered.workspace.dir)).toBe(join(base, "elsewhere"));
      await finishCliTaskWorkspace(entered.workspace);
    } finally {
      if (prev === undefined) delete process.env.WORKTREE_BASE_DIR;
      else process.env.WORKTREE_BASE_DIR = prev;
    }
  });

  test("--here, a non-git dir and a product child stay in place and make nothing", async () => {
    const { repo } = makeRepo();
    expect(await enterCliTaskWorkspace({ cwd: repo, here: true, env: {} })).toEqual({
      ok: true,
      workspace: { kind: "here", cwd: repo, reason: "here" },
    });
    const plain = mkdtempSync(join(tmpdir(), "corvidinho-cli-worktree-plain-"));
    expect(await enterCliTaskWorkspace({ cwd: plain, here: false, env: {} })).toEqual({
      ok: true,
      workspace: { kind: "here", cwd: plain, reason: "not-git" },
    });
    for (const env of [
      { CORVIDINHO_ACTING_IS_ADMIN: "0" },
      { CORVIDINHO_ACTING_IS_ADMIN: "1" },
      { CORVIDINHO_WATCH_SESSION_ID: "watch_1" },
      { CORVIDINHO_DISCORD_SESSION_ID: "sess_1" },
      { CORVIDINHO_DELEGATE_DEPTH: "1" },
    ]) {
      expect(isSpawnedTaskChild(env)).toBe(true);
      expect(await enterCliTaskWorkspace({ cwd: repo, here: false, env })).toEqual({
        ok: true,
        workspace: { kind: "here", cwd: repo, reason: "child" },
      });
    }
    expect(isSpawnedTaskChild({})).toBe(false);
    expect(isSpawnedTaskChild({ CORVIDINHO_DELEGATE_DEPTH: "" })).toBe(false);
    expect(linked(repo)).toEqual([]);
    expect(cliBranches(repo)).toEqual([]);
  });

  test("a subdir the worktree does not have fails closed and leaves nothing", async () => {
    const { repo } = makeRepo();
    const scratch = join(repo, "scratch");
    mkdirSync(scratch);
    writeFileSync(join(scratch, "wip.txt"), "untracked\n");
    const entered = await enterCliTaskWorkspace({ cwd: scratch, here: false, env: {} });
    expect(entered.ok).toBe(false);
    if (entered.ok) return;
    expect(entered.cancelled).toBe(false);
    expect(entered.error).toContain("has no scratch");
    expect(linked(repo)).toEqual([]);
    expect(cliBranches(repo)).toEqual([]);
  });

  test("a failing post-checkout hook fails closed and removes the worktree and branch git left", async () => {
    const { base, repo } = makeRepo();
    failingCheckoutHook(base, repo);
    const entered = await enterCliTaskWorkspace({ cwd: repo, here: false, env: {} });
    expect(entered.ok).toBe(false);
    if (entered.ok) return;
    expect(entered.cancelled).toBe(false);
    expect(entered.error).toBe("task run could not make its worktree: git-lfs was not found on your path");
    expect(linked(repo)).toEqual([]);
    expect(cliBranches(repo)).toEqual([]);
    expect(readdirSync(join(base, ".corvid-worktrees"))).toEqual([]);
  });

  test("a repo with no commit yet fails closed", async () => {
    const { repo } = makeRepo({ commit: false });
    const entered = await enterCliTaskWorkspace({ cwd: repo, here: false, env: {} });
    expect(entered.ok).toBe(false);
    if (entered.ok) return;
    expect(entered.cancelled).toBe(false);
    expect(entered.error).toBe("task run could not make its worktree: this repo has no commit yet (HEAD is unborn)");
    expect(linked(repo)).toEqual([]);
    expect(existsSync(join(dirname(repo), ".corvid-worktrees"))).toBe(false);
  });

  test("an aborted signal is cancelled: before creation nothing is made", async () => {
    const { repo } = makeRepo();
    const abort = new AbortController();
    abort.abort();
    const entered = await enterCliTaskWorkspace({ cwd: repo, here: false, env: {}, signal: abort.signal });
    expect(entered).toEqual({ ok: false, error: "cancelled while making the task worktree", cancelled: true });
    expect(linked(repo)).toEqual([]);
  });
});

describe("finishCliTaskWorkspace: only clean worktrees and empty branches go (REQ-cli-122)", () => {
  async function enter(repo: string) {
    const entered = await enterCliTaskWorkspace({ cwd: repo, here: false, env: {} });
    if (!entered.ok || entered.workspace.kind !== "worktree") throw new Error("no worktree");
    return entered.workspace;
  }

  test("uncommitted changes keep the worktree and its branch", async () => {
    const { repo } = makeRepo();
    const ws = await enter(repo);
    writeFileSync(join(ws.dir, "new.txt"), "work\n");
    const done = await finishCliTaskWorkspace(ws);
    expect(done.report).toEqual({ dir: ws.dir, branch: ws.branch, kept: true, branchKept: true });
    expect(done.note).toBe(`Kept worktree ${ws.dir} (branch ${ws.branch}): it has uncommitted changes.`);
    expect(readFileSync(join(ws.dir, "new.txt"), "utf8")).toBe("work\n");
    expect(cliBranches(repo)).toEqual([ws.branch]);
  });

  test("a branch the run made and switched to is the one named and kept; the talk branch goes", async () => {
    const { repo } = makeRepo();
    const ws = await enter(repo);
    git(ws.dir, "switch", "-q", "-c", "feat/note");
    writeFileSync(join(ws.dir, "new.txt"), "work\n");
    git(ws.dir, "add", "new.txt");
    git(ws.dir, "commit", "-q", "-m", "work");
    const done = await finishCliTaskWorkspace(ws);
    expect(done.report).toEqual({ dir: ws.dir, branch: "feat/note", kept: false, branchKept: true });
    expect(done.note).toBe(`Removed worktree ${ws.dir}; kept branch feat/note: it has commits of its own.`);
    expect(existsSync(ws.dir)).toBe(false);
    expect(cliBranches(repo)).toEqual([]);
    expect(git(repo, "log", "-1", "--format=%s", "feat/note").trim()).toBe("work");
  });

  test("a dirty worktree on a branch the run made is kept under that branch's name", async () => {
    const { repo } = makeRepo();
    const ws = await enter(repo);
    git(ws.dir, "switch", "-q", "-c", "feat/wip");
    writeFileSync(join(ws.dir, "new.txt"), "work\n");
    const done = await finishCliTaskWorkspace(ws);
    expect(done.report).toEqual({ dir: ws.dir, branch: "feat/wip", kept: true, branchKept: true });
    expect(done.note).toBe(`Kept worktree ${ws.dir} (branch feat/wip): it has uncommitted changes.`);
    expect(cliBranches(repo)).toEqual([]);
  });

  test("a talk branch with commits only on it stays when the run switched off it", async () => {
    const { repo } = makeRepo();
    const ws = await enter(repo);
    writeFileSync(join(ws.dir, "one.txt"), "1\n");
    git(ws.dir, "add", "one.txt");
    git(ws.dir, "commit", "-q", "-m", "on talk");
    git(ws.dir, "switch", "-q", "-c", "feat/other", "main");
    const done = await finishCliTaskWorkspace(ws);
    expect(done.report).toEqual({ dir: ws.dir, branch: ws.branch, kept: false, branchKept: true });
    expect(done.note).toBe(`Removed worktree ${ws.dir}; kept branch ${ws.branch}: it has commits of its own.`);
    expect(cliBranches(repo)).toEqual([ws.branch]);
  });

  test("both branches with commits of their own are kept and named", async () => {
    const { repo } = makeRepo();
    const ws = await enter(repo);
    writeFileSync(join(ws.dir, "one.txt"), "1\n");
    git(ws.dir, "add", "one.txt");
    git(ws.dir, "commit", "-q", "-m", "on talk");
    git(ws.dir, "switch", "-q", "-c", "feat/two", "main");
    writeFileSync(join(ws.dir, "two.txt"), "2\n");
    git(ws.dir, "add", "two.txt");
    git(ws.dir, "commit", "-q", "-m", "on feat");
    const done = await finishCliTaskWorkspace(ws);
    expect(done.report).toEqual({ dir: ws.dir, branch: "feat/two", kept: false, branchKept: true });
    expect(done.note).toBe(
      `Removed worktree ${ws.dir}; kept branch feat/two: it has commits of its own. ` +
        `Also kept branch ${ws.branch}: it has commits of its own.`,
    );
    expect(cliBranches(repo)).toEqual([ws.branch]);
  });

  test("a clean worktree whose branch has commits goes; the branch stays", async () => {
    const { repo } = makeRepo();
    const ws = await enter(repo);
    writeFileSync(join(ws.dir, "new.txt"), "work\n");
    git(ws.dir, "add", "new.txt");
    git(ws.dir, "commit", "-q", "-m", "work");
    const done = await finishCliTaskWorkspace(ws);
    expect(done.report).toEqual({ dir: ws.dir, branch: ws.branch, kept: false, branchKept: true });
    expect(done.note).toBe(`Removed worktree ${ws.dir}; kept branch ${ws.branch}: it has commits of its own.`);
    expect(existsSync(ws.dir)).toBe(false);
    expect(cliBranches(repo)).toEqual([ws.branch]);
  });
});

describe("task run CLI in a git repo (SESSION-WORKTREE-1.a, REQ-cli-122)", () => {
  test("by default it works in its own worktree: the edit lands there, the checkout is untouched, the worktree is kept and named", async () => {
    const { base, repo } = makeRepo();
    writeFileSync(join(repo, "sub", "local.txt"), "mine\n");
    const fake = fakeLlm(writesNote());
    const r = await cli(
      join(repo, "sub"),
      ["task", "run", "--task", "write a note", "--json"],
      localEnv({ ...fake.env, CORVIDINHO_LLM_TIER: "code", PATH: `${fakeFledgeBin(base)}:${process.env.PATH ?? ""}` }),
    );
    const { result, events } = parsedJson(r.out);
    expect(r.code).toBe(0);
    expect(result.state).toBe("done");
    expect(result.filesChanged).toEqual(["note.txt"]);
    const ws = result.workspace;
    expect(ws).toBeDefined();
    if (!ws) return;
    expect(dirname(ws.dir)).toBe(join(base, ".corvid-worktrees"));
    expect(ws.branch).toStartWith("talk/cli_");
    expect(ws.kept).toBe(true);
    expect(ws.branchKept).toBe(true);
    expect(readFileSync(join(ws.dir, "sub", "note.txt"), "utf8")).toBe("from the run");
    expect(existsSync(join(ws.dir, "sub", "local.txt"))).toBe(false);
    expect(existsSync(join(repo, "sub", "note.txt"))).toBe(false);
    expect(git(repo, "status", "--porcelain")).toBe("?? sub/local.txt\n");
    const first = events[0];
    expect(first?.type).toBe("Text");
    if (first?.type === "Text") {
      expect(first.text).toContain(`Working in a new worktree ${ws.dir} (branch ${ws.branch}) made from HEAD`);
      expect(first.text).toContain("uncommitted and untracked files in this checkout are not included");
      expect(first.text).toContain("nothing is installed there");
      expect(first.text).toContain("Pass --here to run in this checkout.");
    }
    expect(linked(repo)).toEqual([ws.dir]);
  }, T);

  test("text output names the kept worktree on stderr", async () => {
    const { base, repo } = makeRepo();
    const fake = fakeLlm(writesNote());
    const r = await cli(
      repo,
      ["task", "run", "--task", "write a note"],
      localEnv({ ...fake.env, CORVIDINHO_LLM_TIER: "code", PATH: `${fakeFledgeBin(base)}:${process.env.PATH ?? ""}` }),
    );
    const [dir] = linked(repo);
    expect(dir).toBeDefined();
    const branch = `talk/${basename(dir!).slice("talk-".length)}`;
    expect(r.err).toContain(`Working in a new worktree ${dir} (branch ${branch}) made from HEAD`);
    expect(r.err).toContain(`Kept worktree ${dir} (branch ${branch}): it has uncommitted changes.`);
    expect(existsSync(join(dir!, "note.txt"))).toBe(true);
    expect(existsSync(join(repo, "note.txt"))).toBe(false);
  }, T);

  test("--here runs it in this checkout and makes no worktree or branch", async () => {
    const { base, repo } = makeRepo();
    const fake = fakeLlm(writesNote());
    const r = await cli(
      repo,
      ["task", "run", "--here", "--task", "write a note", "--json"],
      localEnv({ ...fake.env, CORVIDINHO_LLM_TIER: "code", PATH: `${fakeFledgeBin(base)}:${process.env.PATH ?? ""}` }),
    );
    const { result, events } = parsedJson(r.out);
    expect(result.workspace).toBeUndefined();
    expect(readFileSync(join(repo, "note.txt"), "utf8")).toBe("from the run");
    expect(events.some((e) => e.type === "Text" && e.text.includes("Working in a new worktree"))).toBe(false);
    expect(linked(repo)).toEqual([]);
    expect(cliBranches(repo)).toEqual([]);
    expect(existsSync(join(base, ".corvid-worktrees"))).toBe(false);
  }, T);

  test("a run that changes nothing removes its worktree and branch; --here as task text or after -- is not the flag", async () => {
    const { repo } = makeRepo();
    const fake = fakeLlm();
    for (const args of [
      ["task", "run", "--task", "--here", "--output", "ndjson"],
      ["task", "run", "--task", "look", "--output", "ndjson", "--", "--here"],
    ]) {
      const r = await cli(repo, args, localEnv(fake.env));
      expect(r.code).toBe(0);
      const result = r.out
        .split("\n")
        .map((l) => parseNdjsonLine(l))
        .find((f) => f?.type === "result");
      expect(result?.type).toBe("result");
      if (result?.type !== "result") return;
      expect(result.result.state).toBe("done");
      const ws = result.result.workspace;
      expect(ws?.kept).toBe(false);
      expect(ws?.branchKept).toBe(false);
      expect(ws?.branch).toStartWith("talk/cli_");
      expect(existsSync(ws!.dir)).toBe(false);
      expect(linked(repo)).toEqual([]);
      expect(cliBranches(repo)).toEqual([]);
    }
  }, T);

  test("a product child (old bridge, no --here) never makes a nested worktree", async () => {
    const { repo } = makeRepo();
    const fake = fakeLlm();
    const r = await cli(
      repo,
      ["task", "run", "--task", "look", "--json"],
      localEnv({ ...fake.env, CORVIDINHO_ACTING_IS_ADMIN: "0", CORVIDINHO_ACTING_ROLE: "community" }),
    );
    expect(r.code).toBe(0);
    expect(parsedJson(r.out).result.workspace).toBeUndefined();
    expect(linked(repo)).toEqual([]);
    expect(cliBranches(repo)).toEqual([]);
  }, T);

  test("when the worktree can't be made it fails closed: exit 1, one line, the --here hint, no model call", async () => {
    const { base, repo } = makeRepo();
    const fake = fakeLlm();
    mkdirSync(join(repo, "scratch"));
    const missing = await cli(join(repo, "scratch"), ["task", "run", "--task", "look"], localEnv(fake.env));
    expect(missing.code).toBe(1);
    expect(missing.err.trim().split("\n")).toEqual([
      "corvidinho: task run's worktree has no scratch: the worktree is made from HEAD, so an untracked, ignored or uncommitted directory is not in it",
      `hint: ${CLI_HERE_HINT}`,
    ]);
    // An unusable base dir (a file), in --json: the error object on stdout.
    writeFileSync(join(base, "not-a-dir"), "x");
    const blocked = await cli(
      repo,
      ["task", "run", "--task", "look", "--json"],
      localEnv({ ...fake.env, WORKTREE_BASE_DIR: join(base, "not-a-dir") }),
    );
    expect(blocked.code).toBe(1);
    const err = JSON.parse(blocked.out) as { ok: boolean; error: string };
    expect(err.ok).toBe(false);
    expect(err.error).toStartWith("task run could not make its worktree: ");
    expect(blocked.err.trim()).toBe(`hint: ${CLI_HERE_HINT}`);
    // No commit yet (unborn HEAD).
    const unborn = makeRepo({ commit: false }).repo;
    const u = await cli(unborn, ["task", "run", "--task", "look"], localEnv(fake.env));
    expect(u.code).toBe(1);
    expect(u.err).toContain("corvidinho: task run could not make its worktree: ");
    expect(u.err).toContain(`hint: ${CLI_HERE_HINT}`);
    expect(fake.requests).toHaveLength(0);
    expect(linked(repo)).toEqual([]);
    expect(cliBranches(repo)).toEqual([]);
  }, T);

  test("a failed git worktree add leaves no worktree or branch behind: exit 1, git's line, the --here hint", async () => {
    const { base, repo } = makeRepo();
    failingCheckoutHook(base, repo);
    const fake = fakeLlm();
    const r = await cli(repo, ["task", "run", "--task", "look"], localEnv(fake.env));
    expect(r.code).toBe(1);
    expect(r.err.trim().split("\n")).toEqual([
      "corvidinho: task run could not make its worktree: git-lfs was not found on your path",
      `hint: ${CLI_HERE_HINT}`,
    ]);
    expect(fake.requests).toHaveLength(0);
    expect(linked(repo)).toEqual([]);
    expect(cliBranches(repo)).toEqual([]);
    expect(readdirSync(join(base, ".corvid-worktrees"))).toEqual([]);
  }, T);

  test("SIGINT while the worktree is made: exit 130, nothing left, no model call", async () => {
    const { base, repo } = makeRepo();
    const fake = fakeLlm();
    // A `git` that pauses in `worktree add` after saying so, then runs the real git.
    const realGit = Bun.which("git");
    expect(realGit).toBeTruthy();
    const bin = join(base, "slowgit");
    mkdirSync(bin);
    const marker = join(base, "adding");
    writeFileSync(
      join(bin, "git"),
      `#!/bin/sh\ncase "$*" in *"worktree add"*) : > '${marker}'; sleep 2;; esac\nexec '${realGit}' "$@"\n`,
    );
    chmodSync(join(bin, "git"), 0o755);
    const proc = Bun.spawn(["bun", CLI, "task", "run", "--task", "look"], {
      cwd: repo,
      env: localEnv({ ...fake.env, PATH: `${bin}:${process.env.PATH ?? ""}` }),
      stdout: "pipe",
      stderr: "pipe",
    });
    const deadline = Date.now() + 30_000;
    while (!existsSync(marker) && Date.now() < deadline) await Bun.sleep(25);
    expect(existsSync(marker)).toBe(true);
    proc.kill("SIGINT");
    const [code, err] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
    expect(code).toBe(130);
    expect(err).toContain("corvidinho: cancelled while making the task worktree");
    expect(fake.requests).toHaveLength(0);
    expect(linked(repo)).toEqual([]);
    expect(cliBranches(repo)).toEqual([]);
  }, T);
});

describe("Ctrl-C at a terminal while the worktree is made (REQ-cli-122)", () => {
  test("SIGINT to the whole process group mid-checkout: exit 130 and git's branch and worktree are removed", async () => {
    const { base, repo } = makeRepo();
    const fake = fakeLlm();
    // A post-checkout hook that says it runs and then waits: by then git has
    // made the branch and the worktree, and the group's SIGINT kills git too.
    const hooks = join(base, "hooks");
    mkdirSync(hooks);
    const marker = join(base, "hooking");
    writeFileSync(join(hooks, "post-checkout"), `#!/bin/sh\n: > '${marker}'\nsleep 10\n`);
    chmodSync(join(hooks, "post-checkout"), 0o755);
    git(repo, "config", "core.hooksPath", hooks);
    const proc = Bun.spawn(["bun", CLI, "task", "run", "--task", "look"], {
      cwd: repo,
      env: localEnv(fake.env),
      stdout: "pipe",
      stderr: "pipe",
      detached: true,
    });
    const deadline = Date.now() + 30_000;
    while (!existsSync(marker) && Date.now() < deadline) await Bun.sleep(25);
    expect(existsSync(marker)).toBe(true);
    process.kill(-proc.pid, "SIGINT");
    const [code, err] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
    expect(code).toBe(130);
    expect(err).toContain("corvidinho: cancelled while making the task worktree");
    expect(fake.requests).toHaveLength(0);
    expect(linked(repo)).toEqual([]);
    expect(cliBranches(repo)).toEqual([]);
    expect(readdirSync(join(base, ".corvid-worktrees"))).toEqual([]);
  }, T);
});

describe("product spawners pass --here (REQ-discord-014 / REQ-watch-006 / REQ-agent-117)", () => {
  /** A fake bin that records its argv and prints one result frame. */
  function recordingBin(): { bin: string; argvFile: string } {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-cli-worktree-bin-"));
    const argvFile = join(dir, "argv.txt");
    const bin = join(dir, "corvidinho");
    writeFileSync(
      bin,
      `#!/bin/sh\nfor a in "$@"; do printf '%s\\n' "$a"; done > '${argvFile}'\n` +
        `echo '{"protocol":2,"type":"result","result":{"summary":"ok","filesChanged":[],"verified":true,"verifySkipped":true,"cancelled":false,"state":"done","attempts":1}}'\n`,
    );
    chmodSync(bin, 0o755);
    return { bin, argvFile };
  }

  test("Discord and WATCH clients spawn task run --here", async () => {
    for (const make of [createDiscordClient, createWatchClient]) {
      const { bin, argvFile } = recordingBin();
      const client = make({ bin, cwd: tmpdir() });
      await client.runChat({ prompt: "--tier=code hi", sessionId: "sess_x" } as never);
      expect(readFileSync(argvFile, "utf8").split("\n").filter(Boolean)).toEqual([
        "task",
        "run",
        "--here",
        "--task",
        "--tier=code hi",
        "--output",
        "ndjson",
      ]);
    }
  });

  test("delegate and council workers spawn task run --here, --task last", () => {
    const { cmd } = buildDelegateSpawn({
      bin: "/usr/local/bin/corvidinho",
      taskText: "sub",
      tier: "tool",
      childDepth: 1,
      allowlist: [],
      baseEnv: {},
    });
    expect(cmd).toEqual([
      "/usr/local/bin/corvidinho",
      "task",
      "run",
      "--here",
      "--non-interactive",
      "--tier",
      "tool",
      "--output",
      "ndjson",
      "--task",
      "sub",
    ]);
  });
});
