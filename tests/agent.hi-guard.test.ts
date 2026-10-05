/**
 * In a repo that uses hi, the agent never changes the criteria itself: any
 * hi/ change no approved capture made blocks done and the PR (AGENT-18, the
 * guard half of its hi clause). REQ-agent-520, REQ-plugins-520,
 * REQ-discord-520.
 *
 * Temp git repos and temp non-git dirs only (never this checkout), stub
 * verify runners, the real file tools through `runPlugin`, and `openWorkPr`
 * with stub plugin calls. Imports come only from modules the base has too
 * (`src/agent/repo-ways.ts` kept for the fail-on-base proof).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTask } from "../src/agent/loop.ts";
import {
  hiChangesFromSnapshot,
  hiChangesSince,
  hiGuardNote,
  hiSnapshot,
  parseHiEntries,
  renderRepoWaysBlock,
} from "../src/agent/repo-ways.ts";
import type { AgentEvent, ExecuteContext, VerifyRunner } from "../src/agent/types.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin, type RunOptions } from "../src/plugins/run.ts";
import type { PluginHandlerResult } from "../src/plugins/types.ts";
import { openWorkPr, type OpenWorkPrDeps } from "../src/work/pr.ts";
import { ensureTalkWorkspace } from "../src/worktree/manager.ts";
import { gitIn } from "./fixtures/talk-worktree.ts";
import { LANE_PASS_OUTPUT } from "./fixtures/lane-output.ts";

const bases: string[] = [];
function tempBase(): string {
  const b = mkdtempSync(join(tmpdir(), "corvidinho-hi-guard-"));
  bases.push(b);
  return b;
}

beforeAll(() => {
  loadBuiltins();
});

afterAll(() => {
  for (const b of bases) rmSync(b, { recursive: true, force: true });
});

/** A hi family file: intent, two criteria (one with a sub-criterion), one retired entry. */
const HI_AGENT = [
  "---",
  "hi: 1",
  "families: [AGENT]",
  "owner: leif",
  "---",
  "",
  "# Agent",
  "",
  "## Intent",
  "",
  "It works each repo's own way.",
  "",
  "## Criteria",
  "",
  "- **AGENT-18**  It works each repo's own way.",
  "  - **AGENT-18.a**  On Corvidinho it may approve its own change.",
  "- **AGENT-19**  It keeps a second promise.",
  "",
  "## Retired",
  "",
  "- **AGENT-2**  old wording",
  "  retired: replaced by AGENT-18.",
  "",
].join("\n");

const REFUSED_HI = "refused (AGENT-18): 'hi/";

function edit(path: string, from: string, to: string): void {
  const text = readFileSync(path, "utf8");
  if (!text.includes(from)) throw new Error(`fixture: ${from} not in ${path}`);
  writeFileSync(path, text.replace(from, to));
}

/** A git repo on `main` with `hi/agent.md` (a hi repo unless `hi` is false) and `src/app.ts`. */
function makeRepo(opts: { hi?: boolean; dir?: string } = {}): string {
  const dir = opts.dir ?? join(tempBase(), "repo");
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "hi"), { recursive: true });
  gitIn(dir, "init", "-q", "-b", "main");
  gitIn(dir, "config", "user.name", "Fixture Bot");
  gitIn(dir, "config", "user.email", "fixture@example.invalid");
  gitIn(dir, "config", "commit.gpgsign", "false");
  writeFileSync(join(dir, "src", "app.ts"), "export const x = 1;\n");
  writeFileSync(join(dir, ".gitignore"), "*.swp\n");
  if (opts.hi === false) writeFileSync(join(dir, "hi", "README.md"), "# Notes\n\nNo front matter: not a hi repo.\n");
  else writeFileSync(join(dir, "hi", "agent.md"), HI_AGENT);
  gitIn(dir, "add", "-A");
  gitIn(dir, "commit", "-q", "-m", "init");
  return dir;
}

/** A hi project that is not a git repo. */
function makeNonGit(): string {
  const dir = join(tempBase(), "plain");
  mkdirSync(join(dir, "hi"), { recursive: true });
  writeFileSync(join(dir, "hi", "agent.md"), HI_AGENT);
  writeFileSync(join(dir, "app.txt"), "hello\n");
  return dir;
}

function head(repo: string): string {
  return gitIn(repo, "rev-parse", "HEAD").trim();
}

function lane(outcomes: boolean[] = [true]) {
  const calls: string[] = [];
  const runner: VerifyRunner = async (cwd) => {
    calls.push(cwd);
    const ok = outcomes[Math.min(calls.length - 1, outcomes.length - 1)]!;
    return { success: ok, output: ok ? LANE_PASS_OUTPUT : "test: 1 fail" };
  };
  return { calls, runner };
}

function texts(events: AgentEvent[]): string[] {
  return events.filter((e) => e.type === "Text").map((e) => (e as { text: string }).text);
}

function tool(name: string, args: string[], cwd: string, extra: Partial<RunOptions> = {}): Promise<PluginHandlerResult> {
  return runPlugin({ name, args, cwd, nonInteractive: true, ...extra });
}

// ------------------------------------------------------------------ what changed

describe("what changed under hi/ since the session base (AGENT-18 hi guard, REQ-agent-520)", () => {
  test("a hi file's criteria and retired entries are read from its bullets; front matter and prose are not entries", () => {
    const entries = parseHiEntries(HI_AGENT);
    expect([...entries.keys()].sort()).toEqual(["AGENT-18", "AGENT-18.a", "AGENT-19", "AGENT-2"]);
    expect(entries.get("AGENT-19")).toBe("criteria: It keeps a second promise.");
    expect(entries.get("AGENT-2")).toBe("retired: old wording retired: replaced by AGENT-18.");
    expect(parseHiEntries("---\nhi: 1\n---\n\n# X\n\nJust prose.\n").size).toBe(0);
  });

  test("criteria, retired entries and other hi/ files, committed, dirty, untracked or ignored, all count", async () => {
    const repo = makeRepo();
    const base = head(repo);
    expect(await hiChangesSince(repo, base)).toEqual({ criteria: [], retired: [], files: [] });

    // A reworded criterion, left dirty.
    const agent = join(repo, "hi", "agent.md");
    edit(agent, "a second promise", "a different promise");
    expect(await hiChangesSince(repo, base)).toEqual({ criteria: ["AGENT-19"], retired: [], files: [] });

    // Retiring it is a retired-entry change.
    writeFileSync(agent, HI_AGENT.replace("- **AGENT-19**  It keeps a second promise.\n", "").replace(
      "## Retired\n\n",
      "## Retired\n\n- **AGENT-19**  It keeps a second promise.\n  retired: dropped.\n",
    ));
    expect(await hiChangesSince(repo, base)).toEqual({ criteria: [], retired: ["AGENT-19"], files: [] });

    // Intent prose only: an other-file change.
    writeFileSync(agent, HI_AGENT.replace("It works each repo's own way.\n\n## Criteria", "It works its own way.\n\n## Criteria"));
    expect(await hiChangesSince(repo, base)).toEqual({ criteria: [], retired: [], files: ["hi/agent.md"] });

    // A new criterion committed on top, plus an untracked note and an ignored swap file.
    writeFileSync(agent, `${HI_AGENT.replace("## Retired", "- **AGENT-20**  An invented one.\n\n## Retired")}`);
    gitIn(repo, "commit", "-q", "-am", "add a criterion");
    writeFileSync(join(repo, "hi", "notes.txt"), "draft\n");
    writeFileSync(join(repo, "hi", ".agent.md.swp"), "x");
    expect(await hiChangesSince(repo, base)).toEqual({
      criteria: ["AGENT-20"],
      retired: [],
      files: ["hi/.agent.md.swp", "hi/notes.txt"],
    });

    // Deleting the file changes every entry in it.
    rmSync(agent);
    const gone = await hiChangesSince(repo, base);
    expect(gone?.criteria).toEqual(["AGENT-18", "AGENT-18.a", "AGENT-19"]);
    expect(gone?.retired).toEqual(["AGENT-2"]);
  });

  test("an edit git is told not to look at (assume-unchanged, skip-worktree) still counts; a sparse-checkout gap does not", async () => {
    const repo = makeRepo();
    const base = head(repo);
    const agent = join(repo, "hi", "agent.md");
    writeFileSync(join(repo, "hi", "extra.md"), "# Extra\n");
    gitIn(repo, "add", "-A");
    gitIn(repo, "commit", "-q", "-m", "extra");
    const base2 = head(repo);
    expect(await hiChangesSince(repo, base2)).toEqual({ criteria: [], retired: [], files: [] });

    // assume-unchanged: git diff no longer shows the dirty edit.
    gitIn(repo, "update-index", "--assume-unchanged", "hi/agent.md");
    edit(agent, "a second promise", "a hidden promise");
    expect(gitIn(repo, "diff", "--name-only", base2, "--", "hi").trim()).toBe("");
    expect(await hiChangesSince(repo, base2)).toEqual({ criteria: ["AGENT-19"], retired: [], files: [] });
    writeFileSync(agent, HI_AGENT);
    expect(await hiChangesSince(repo, base2)).toEqual({ criteria: [], retired: [], files: [] });
    gitIn(repo, "update-index", "--no-assume-unchanged", "hi/agent.md");

    // skip-worktree: the same; a skip-worktree file missing from disk (sparse) is no change.
    gitIn(repo, "update-index", "--skip-worktree", "hi/agent.md", "hi/extra.md");
    edit(agent, "## Retired", "- **AGENT-22**  Hidden.\n\n## Retired");
    rmSync(join(repo, "hi", "extra.md"));
    expect(gitIn(repo, "diff", "--name-only", base2, "--", "hi").trim()).toBe("");
    expect(await hiChangesSince(repo, base2)).toEqual({ criteria: ["AGENT-22"], retired: [], files: [] });
    // Against the first base, the committed extra.md is a change too.
    expect((await hiChangesSince(repo, base))?.files).toEqual(["hi/extra.md"]);
  });

  test("a run with no git base compares hi/ with the snapshot taken at planning", async () => {
    const dir = makeNonGit();
    const start = hiSnapshot(dir)!;
    expect(start).not.toBeNull();
    expect(await hiChangesFromSnapshot(dir, start)).toEqual({ criteria: [], retired: [], files: [] });
    edit(join(dir, "hi", "agent.md"), "**AGENT-18**  It works", "**AGENT-18**  It always works");
    writeFileSync(join(dir, "hi", "extra.md"), "notes\n");
    expect(await hiChangesFromSnapshot(dir, start)).toEqual({
      criteria: ["AGENT-18"],
      retired: [],
      files: ["hi/extra.md"],
    });
  });

  test("the guard line names what changed and says no run can make an approved capture yet", () => {
    expect(hiGuardNote({ criteria: [], retired: [], files: [] })).toBeNull();
    const note = hiGuardNote({ criteria: ["AGENT-19"], retired: ["AGENT-2"], files: ["hi/notes.txt"] })!;
    expect(note.startsWith("hi guard:")).toBe(true);
    expect(note).toContain("criteria AGENT-19; retired entries AGENT-2; other hi/ files hi/notes.txt");
    expect(note).toContain("no approved capture made the change");
    expect(note).toContain("no run can make one yet");
    // It can't tell who made a change that was already there, so it undoes only its own.
    expect(note).toContain("Undo a hi/ change this run made; leave one that was already there for the owner");
    expect(note).toContain("(AGENT-18)");
  });
});

// ------------------------------------------------------------------ file tools

describe("file tools refuse writes, edits and deletes under hi/ in hi repos (REQ-plugins-520)", () => {
  test("write, edit and delete under hi/ are refused with the AGENT-18 line; the file is untouched; reads work", async () => {
    const repo = makeRepo();
    const agent = join(repo, "hi", "agent.md");
    const write = await tool("files-write", ["hi/agent.md", "--content", "- **AGENT-99**  invented\n"], repo);
    expect(write.ok).toBe(false);
    expect(write.error).toContain(REFUSED_HI);
    expect(write.error).toContain("no run can make yet");
    const create = await tool("files-write", ["./hi/new.md", "--content", "x"], repo);
    expect(create.ok).toBe(false);
    expect(create.error).toContain("refused (AGENT-18)");
    const abs = await tool("files-write", [join(repo, "hi", "abs.md"), "--content", "x"], repo);
    expect(abs.ok).toBe(false);
    expect(abs.error).toContain("refused (AGENT-18)");
    const editR = await tool("files-edit", ["hi/agent.md", "--old", "second promise", "--new", "third promise"], repo);
    expect(editR.ok).toBe(false);
    expect(editR.error).toContain(REFUSED_HI);
    const del = await tool("files-delete", ["hi/agent.md"], repo, { allowlist: new Set(["files-delete"]) });
    expect(del.ok).toBe(false);
    expect(del.error).toContain(REFUSED_HI);
    expect(readFileSync(agent, "utf8")).toBe(HI_AGENT);
    expect(await hiChangesSince(repo, head(repo))).toEqual({ criteria: [], retired: [], files: [] });

    const read = await tool("files-read", ["hi/agent.md"], repo);
    expect(read.ok).toBe(true);
    const src = await tool("files-write", ["src/app.ts", "--content", "export const x = 2;\n"], repo);
    expect(src.ok).toBe(true);
  });

  test("a symlink into hi/ is judged where the write lands", async () => {
    const repo = makeRepo();
    mkdirSync(join(repo, "docs"), { recursive: true });
    symlinkSync(join("..", "hi"), join(repo, "docs", "criteria"));
    const r = await tool("files-write", ["docs/criteria/agent.md", "--content", "x"], repo);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("refused (AGENT-18)");
    expect(readFileSync(join(repo, "hi", "agent.md"), "utf8")).toBe(HI_AGENT);
  });

  test("a repo that does not use hi keeps hi/ writable; a non-git hi project refuses too", async () => {
    const plain = makeRepo({ hi: false });
    const ok = await tool("files-write", ["hi/README.md", "--content", "# Notes\n\nedited\n"], plain);
    expect(ok.ok).toBe(true);
    const nonGit = makeNonGit();
    const r = await tool("files-edit", ["hi/agent.md", "--old", "second", "--new", "third"], nonGit);
    expect(r.ok).toBe(false);
    expect(r.error).toContain(REFUSED_HI);
  });
});

// ------------------------------------------------------------------ the gate

describe("the verify gate blocks done on any hi/ change since the session base (REQ-agent-520)", () => {
  test("a hi/ change fails verify before the lane; once undone, the lane runs and the run is verified", async () => {
    const repo = makeRepo();
    const agent = join(repo, "hi", "agent.md");
    const v = lane();
    const events: AgentEvent[] = [];
    const seen: ExecuteContext[] = [];
    const result = await runTask({
      cwd: repo,
      maxRetries: 1,
      verifyRunner: v.runner,
      onEvent: (e) => events.push(e),
      execute: async (ctx) => {
        seen.push(ctx);
        writeFileSync(join(repo, "src", "app.ts"), `export const x = ${ctx.attempt + 1};\n`);
        // A shell edit no file tool reports.
        if (ctx.attempt === 1) edit(agent, "a second promise", "an invented promise");
        else writeFileSync(agent, HI_AGENT);
        return { summary: `attempt ${ctx.attempt}`, filesChanged: ["src/app.ts"] };
      },
    });
    expect(result.state).toBe("done");
    expect(result.verified).toBe(true);
    expect(result.attempts).toBe(2);
    expect(v.calls).toEqual([repo]);
    const note = texts(events).find((t) => t.startsWith("hi guard:"))!;
    expect(note).toContain("criteria AGENT-19");
    expect(seen[0]!.repoWays).toEqual({ sdd: false, hi: true, trust: false });
    expect(seen[1]!.verifyFeedback).toContain("hi guard:");
    const verdicts = events.filter((e) => e.type === "VerifyResult") as { success: boolean }[];
    expect(verdicts.map((e) => e.success)).toEqual([false, true]);
  });

  test("a hi/ change that stays fails the run with the stuck ask and no lane run", async () => {
    const repo = makeRepo();
    const v = lane();
    const result = await runTask({
      cwd: repo,
      maxRetries: 0,
      verifyRunner: v.runner,
      execute: async () => {
        writeFileSync(join(repo, "hi", "notes.md"), "# Notes\n\nan aside\n");
        return { summary: "done", filesChanged: [] };
      },
    });
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
    expect(result.ask?.reason).toBe("stuck");
    expect(result.summary).toContain("hi guard:");
    expect(result.summary).toContain("other hi/ files hi/notes.md");
    expect(v.calls).toEqual([]);
  });

  test("leftover dirty: a hi/ edit an earlier run left keeps a run that only touched src/ from being verified", async () => {
    const repo = makeRepo();
    edit(join(repo, "hi", "agent.md"), "a second promise", "a leftover promise");
    const v = lane();
    const events: AgentEvent[] = [];
    const result = await runTask({
      cwd: repo,
      maxRetries: 0,
      verifyRunner: v.runner,
      onEvent: (e) => events.push(e),
      execute: async () => {
        writeFileSync(join(repo, "src", "app.ts"), "export const x = 5;\n");
        return { summary: "edited src", filesChanged: ["src/app.ts"] };
      },
    });
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
    expect(v.calls).toEqual([]);
    expect(texts(events).find((t) => t.startsWith("hi guard:"))).toContain("criteria AGENT-19");
  });

  test("committing a hi/ change mid-run does not hide it", async () => {
    const repo = makeRepo();
    const v = lane();
    const result = await runTask({
      cwd: repo,
      maxRetries: 0,
      verifyRunner: v.runner,
      execute: async () => {
        edit(join(repo, "hi", "agent.md"), "## Retired", "- **AGENT-21**  Made up.\n\n## Retired");
        gitIn(repo, "commit", "-q", "-am", "sneak a criterion in");
        return { summary: "done", filesChanged: [] };
      },
    });
    expect(result.state).toBe("failed");
    expect(result.summary).toContain("criteria AGENT-21");
    expect(v.calls).toEqual([]);
  });

  test("no false block: hi/ untouched, a repo without hi, and hi captures already on the base", async () => {
    // hi untouched.
    const repo = makeRepo();
    const v = lane();
    const events: AgentEvent[] = [];
    const ok = await runTask({
      cwd: repo,
      maxRetries: 0,
      verifyRunner: v.runner,
      onEvent: (e) => events.push(e),
      execute: async () => {
        writeFileSync(join(repo, "src", "app.ts"), "export const x = 3;\n");
        return { summary: "edited", filesChanged: ["src/app.ts"] };
      },
    });
    expect(ok.verified).toBe(true);
    expect(texts(events).some((t) => t.startsWith("hi guard"))).toBe(false);

    // hi/ without front matter is not a hi repo.
    const plain = makeRepo({ hi: false });
    const v2 = lane();
    const r2 = await runTask({
      cwd: plain,
      maxRetries: 0,
      verifyRunner: v2.runner,
      execute: async () => {
        writeFileSync(join(plain, "hi", "README.md"), "# Notes\n\nedited\n");
        return { summary: "edited", filesChanged: ["hi/README.md"] };
      },
    });
    expect(r2.verified).toBe(true);
    expect(v2.calls).toEqual([plain]);

    // A capture committed on main outside any run (as the coordinator does
    // with the `hi` CLI) is part of the base a later talk starts from.
    const project = makeRepo();
    const bare = join(tempBase(), "origin.git");
    mkdirSync(bare, { recursive: true });
    gitIn(bare, "init", "-q", "--bare");
    gitIn(project, "remote", "add", "origin", bare);
    edit(join(project, "hi", "agent.md"), "## Retired", "- **AGENT-20**  Captured by a human.\n\n## Retired");
    gitIn(project, "commit", "-q", "-am", "hi: capture AGENT-20");
    gitIn(project, "push", "-q", "origin", "main");
    gitIn(project, "fetch", "-q", "origin");
    gitIn(project, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
    const talk = join(tempBase(), "talk");
    gitIn(project, "worktree", "add", "-q", "-b", "talk/sess_captured", talk);
    const v3 = lane();
    const r3 = await runTask({
      cwd: talk,
      maxRetries: 0,
      verifyRunner: v3.runner,
      execute: async () => {
        writeFileSync(join(talk, "src", "app.ts"), "export const x = 4;\n");
        return { summary: "edited", filesChanged: ["src/app.ts"] };
      },
    });
    expect(r3.verified).toBe(true);
  });

  test("a non-git hi project: a hi/ change fails verify, an unrelated one is verified", async () => {
    const dir = makeNonGit();
    const v = lane();
    const blocked = await runTask({
      cwd: dir,
      maxRetries: 0,
      verifyRunner: v.runner,
      execute: async () => {
        edit(join(dir, "hi", "agent.md"), "a second promise", "another promise");
        writeFileSync(join(dir, "app.txt"), "changed\n");
        return { summary: "edited", filesChanged: ["app.txt"] };
      },
    });
    expect(blocked.state).toBe("failed");
    expect(blocked.summary).toContain("criteria AGENT-19");
    expect(v.calls).toEqual([]);

    const clean = makeNonGit();
    const v2 = lane();
    const fine = await runTask({
      cwd: clean,
      maxRetries: 0,
      verifyRunner: v2.runner,
      execute: async () => {
        writeFileSync(join(clean, "app.txt"), "changed\n");
        return { summary: "edited", filesChanged: ["app.txt"] };
      },
    });
    expect(fine.verified).toBe(true);
  });

  test("the tool loop's hi block says the file tools refuse hi/ and any hi/ change blocks done and the PR", () => {
    const block = renderRepoWaysBlock({ sdd: false, hi: true, trust: false });
    expect(block).toContain("Never invent criteria");
    expect(block).toContain("the file tools refuse every write, edit and delete under hi/");
    expect(block).toContain("keeps the run from being verified and /work from opening a PR");
    expect(block).toContain("no run can make one yet");
    expect(renderRepoWaysBlock({ sdd: true, hi: false, trust: false })).not.toContain("under hi/");
  });
});

// ------------------------------------------------------------------ github-pr-create

describe("github-pr-create inside a run opens no PR while hi/ differs from the session base (REQ-plugins-521)", () => {
  /** Missing allowlist file: the gate never reads an operator's real file (ALLOW-4). */
  const ghEnv = {
    CORVIDINHO_GITHUB_DRY_RUN: "1",
    CORVIDINHO_GITHUB_ALLOW_REPOS: "acme/widget",
    CORVIDINHO_ALLOWLIST_FILE: join(tempBase(), "no-allowlist.toml"),
  };

  async function withGhEnv<T>(fn: () => Promise<T>): Promise<T> {
    const prev: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(ghEnv)) {
      prev[k] = process.env[k];
      process.env[k] = v;
    }
    try {
      return await fn();
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  function prCreate(cwd: string): Promise<PluginHandlerResult> {
    return tool(
      "github-pr-create",
      ["--repo", "acme/widget", "--title", "bump x", "--head", "main", "--base", "main"],
      cwd,
      { allowlist: new Set(["github-pr-create"]) },
    );
  }

  test("a hi/ change since the session base refuses it with the AGENT-18 line before any review; untouched hi/ is not refused", async () => {
    await withGhEnv(async () => {
      const repo = makeRepo();
      const tries: PluginHandlerResult[] = [];
      const blocked = await runTask({
        cwd: repo,
        maxRetries: 0,
        verifyRunner: lane().runner,
        execute: async () => {
          // A shell edit the file tools would refuse, committed as a PR would carry it.
          edit(join(repo, "hi", "agent.md"), "## Retired", "- **AGENT-23**  Made up for a PR.\n\n## Retired");
          gitIn(repo, "commit", "-q", "-am", "criteria");
          tries.push(await prCreate(repo));
          return { summary: "opened?", filesChanged: [] };
        },
      });
      expect(tries[0]!.ok).toBe(false);
      expect(tries[0]!.exitCode).toBe(2);
      expect(tries[0]!.error).toContain("refused (AGENT-18)");
      expect(tries[0]!.error).toContain("criteria AGENT-23");
      expect(tries[0]!.error).toContain("this run opens no PR");
      expect(blocked.state).toBe("failed");

      // hi/ untouched in a run: the hi guard lets it through to the next gate (GITHUB-9 here).
      const clean = makeRepo();
      const ok: PluginHandlerResult[] = [];
      await runTask({
        cwd: clean,
        maxRetries: 0,
        verifyRunner: lane().runner,
        execute: async () => {
          writeFileSync(join(clean, "src", "app.ts"), "export const x = 6;\n");
          ok.push(await prCreate(clean));
          return { summary: "edited", filesChanged: ["src/app.ts"] };
        },
      });
      expect(ok[0]!.error ?? "").not.toContain("AGENT-18");
    });
  });

  test("no run in progress (an operator's own call, the /work step): the hi guard does not apply here", async () => {
    await withGhEnv(async () => {
      const repo = makeRepo();
      edit(join(repo, "hi", "agent.md"), "a second promise", "an operator's promise");
      const r = await prCreate(repo);
      expect(r.error ?? "").not.toContain("AGENT-18");
    });
  });
});

// ------------------------------------------------------------------ /work

describe("/work opens no PR while hi/ differs from the merge-base (REQ-discord-520)", () => {
  async function workFixture(): Promise<{ wt: string; branch: string }> {
    const project = makeRepo({ dir: join(tempBase(), "widget") });
    const bare = join(tempBase(), "acme", "widget.git");
    mkdirSync(bare, { recursive: true });
    gitIn(bare, "init", "-q", "--bare");
    gitIn(project, "remote", "add", "origin", bare);
    gitIn(project, "push", "-q", "origin", "main");
    gitIn(project, "fetch", "-q", "origin");
    gitIn(project, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
    const made = await ensureTalkWorkspace({ projectWorkingDir: project, sessionId: `sess_hi_${bases.length}` });
    if (!made.ok) throw new Error(made.error);
    const wt = made.workspace.workDir;
    const branch = gitIn(wt, "symbolic-ref", "--short", "HEAD").trim();
    return { wt, branch };
  }

  function deps(calls: string[], verifyCalls: string[] = []): OpenWorkPrDeps {
    return {
      allowlist: new Set(["git-commit", "git-push", "github-pr-create"]),
      repoGate: () => ({ ok: true as const, repo: "acme/widget" }),
      verify: async (cwd) => {
        verifyCalls.push(cwd);
        return { success: true, output: LANE_PASS_OUTPUT };
      },
      runPlugin: async (o: RunOptions): Promise<PluginHandlerResult> => {
        calls.push(o.name);
        return { ok: true, data: { url: "https://github.com/acme/widget/pull/1", number: 1 } };
      },
    };
  }

  const verified = { ok: true, exitCode: 0, task: { verified: true, verifySkipped: false, state: "done" } };

  test("leftover dirty hi/ with a verified run: refused before anything is committed or pushed", async () => {
    const { wt, branch } = await workFixture();
    writeFileSync(join(wt, "src", "app.ts"), "export const x = 7;\n");
    edit(join(wt, "hi", "agent.md"), "a second promise", "a leftover promise");
    const calls: string[] = [];
    const out = await openWorkPr({ worktreePath: wt, branch, taskId: "work_1", description: "bump x", run: verified }, deps(calls));
    expect(out.opened).toBe(false);
    expect(out.opened ? "" : out.reason).toBe("hi-changed");
    expect(out.line).toContain("criteria AGENT-19");
    expect(out.line).toContain("no approved capture made the change");
    expect(out.line).toContain("(AGENT-18)");
    expect(calls).toEqual([]);
  });

  test("a hi/ change committed on the branch is refused; the fallback re-verify path never runs the lane for it", async () => {
    const { wt, branch } = await workFixture();
    writeFileSync(join(wt, "hi", "notes.md"), "# Notes\n");
    gitIn(wt, "add", "-A");
    gitIn(wt, "commit", "-q", "-m", "notes");
    const calls: string[] = [];
    const verifyCalls: string[] = [];
    // No result frame parsed: the PR step would re-run verify itself.
    const out = await openWorkPr(
      { worktreePath: wt, branch, taskId: "work_2", description: "notes", run: { ok: true, exitCode: 0 } },
      deps(calls, verifyCalls),
    );
    expect(out.opened ? "" : out.reason).toBe("hi-changed");
    expect(out.line).toContain("other hi/ files hi/notes.md");
    expect(verifyCalls).toEqual([]);
    expect(calls).toEqual([]);
  });

  test("a /work run that touches hi/ ends failed and opens no PR; one that leaves hi/ alone ships", async () => {
    const { wt, branch } = await workFixture();
    const v = lane();
    const blocked = await runTask({
      cwd: wt,
      maxRetries: 0,
      verifyRunner: v.runner,
      execute: async () => {
        // The file tool refuses; a shell edit gets through to the gate.
        const tried = await tool("files-edit", ["hi/agent.md", "--old", "second", "--new", "third"], wt);
        expect(tried.error).toContain("refused (AGENT-18)");
        edit(join(wt, "hi", "agent.md"), "a second promise", "a third promise");
        writeFileSync(join(wt, "src", "app.ts"), "export const x = 8;\n");
        return { summary: "edited", filesChanged: ["src/app.ts"] };
      },
    });
    expect(blocked.state).toBe("failed");
    expect(v.calls).toEqual([]);
    const calls: string[] = [];
    const run = {
      ok: false,
      exitCode: 1,
      task: { verified: blocked.verified, verifySkipped: blocked.verifySkipped, state: blocked.state },
    };
    const none = await openWorkPr({ worktreePath: wt, branch, taskId: "work_3", description: "x", run }, deps(calls));
    expect(none.opened).toBe(false);
    expect(calls).toEqual([]);

    // Even if the run's result were trusted, the tree it left is refused.
    const again = await openWorkPr({ worktreePath: wt, branch, taskId: "work_3", description: "x", run: verified }, deps(calls));
    expect(again.opened ? "" : again.reason).toBe("hi-changed");
    expect(calls).toEqual([]);

    // Put hi/ back: the run is verified and the PR opens.
    gitIn(wt, "checkout", "--", "hi");
    const v2 = lane();
    const fine = await runTask({
      cwd: wt,
      maxRetries: 0,
      verifyRunner: v2.runner,
      execute: async () => {
        writeFileSync(join(wt, "src", "app.ts"), "export const x = 9;\n");
        return { summary: "edited", filesChanged: ["src/app.ts"] };
      },
    });
    expect(fine.verified).toBe(true);
    const shipped = await openWorkPr(
      {
        worktreePath: wt,
        branch,
        taskId: "work_4",
        description: "bump x",
        run: { ok: true, exitCode: 0, task: { verified: true, verifySkipped: false, state: "done" } },
      },
      deps(calls),
    );
    expect(shipped.opened).toBe(true);
    expect(calls).toEqual(["git-commit", "git-push", "github-pr-create"]);
  });
});
