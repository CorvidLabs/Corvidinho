/**
 * Git plugins (REQ-plugins-182 / PLUGIN-1/2, SAFE-1/2/3, GITHUB-6).
 * Every repo is `git init` inside mkdtemp; the push remote is a local bare repo;
 * git config is isolated from the machine (GIT_CONFIG_GLOBAL / NOSYSTEM).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry, list } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { gitEnv, scrubGitOutput } from "../plugins/git/exec.ts";
import {
  parseNameStatusZ,
  parsePushPorcelain,
  parseStatusPorcelainZ,
  redactUrlCredentials,
  repoSlugFromRemoteUrl,
} from "../plugins/git/parse.ts";

const ENV_KEYS = [
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_NOSYSTEM",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_GITHUB_ALLOW_REPOS",
  "CORVIDINHO_GITHUB_ALLOW_ORGS",
  "CORVIDINHO_GITHUB_DENY_REPOS",
  "CORVIDINHO_GITHUB_DENY_ORGS",
] as const;
const GATE_KEYS = [
  "CORVIDINHO_GITHUB_ALLOW_REPOS",
  "CORVIDINHO_GITHUB_ALLOW_ORGS",
  "CORVIDINHO_GITHUB_DENY_REPOS",
  "CORVIDINHO_GITHUB_DENY_ORGS",
] as const;

const saved: Record<string, string | undefined> = {};
let base = "";

/** Test-side git (setup / assertions only), same isolation as the plugin. */
function g(cwd: string, ...args: string[]): string {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || k === "GIT_DIR" || k === "GIT_WORK_TREE" || k === "GIT_INDEX_FILE") {
      continue;
    }
    env[k] = v;
  }
  const r = Bun.spawnSync(["git", ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr.toString()}`);
  }
  return r.stdout.toString();
}

function makeRepo(): string {
  const dir = mkdtempSync(join(base, "repo-"));
  g(dir, "init", "-q", "-b", "main");
  g(dir, "config", "user.name", "Fixture Bot");
  g(dir, "config", "user.email", "fixture@example.invalid");
  g(dir, "config", "commit.gpgsign", "false");
  writeFileSync(join(dir, "README.md"), "hello\n");
  g(dir, "add", "README.md");
  g(dir, "commit", "-q", "-m", "init");
  return dir;
}

/** Local bare remote at <tmp>/acme/widget.git → OWNER/REPO "acme/widget". */
function addBareRemote(repo: string): string {
  const bare = join(mkdtempSync(join(base, "remote-")), "acme", "widget.git");
  mkdirSync(bare, { recursive: true });
  g(bare, "init", "-q", "--bare");
  g(repo, "remote", "add", "origin", bare);
  return bare;
}

function remoteRef(bare: string, branch: string): string | null {
  const r = Bun.spawnSync(["git", "rev-parse", "--verify", "-q", `refs/heads/${branch}`], {
    cwd: bare,
    stdout: "pipe",
    stderr: "pipe",
  });
  return r.exitCode === 0 ? r.stdout.toString().trim() : null;
}

async function run(name: string, args: string[], cwd: string, allow = true) {
  return runPlugin({
    name,
    args,
    cwd,
    json: true,
    nonInteractive: true,
    allowlist: allow ? [name] : [],
  });
}

beforeAll(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  base = mkdtempSync(join(tmpdir(), "corvidinho-git-plugins-"));
  const globalCfg = join(base, "gitconfig");
  writeFileSync(globalCfg, "");
  process.env.GIT_CONFIG_GLOBAL = globalCfg;
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  // Never read a developer's real ~/.config/corvidinho/allowlist.toml.
  process.env.CORVIDINHO_ALLOWLIST_FILE = join(base, "no-allowlist.toml");
  delete process.env.GIT_DIR;
  delete process.env.GIT_WORK_TREE;
  delete process.env.GIT_INDEX_FILE;
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(base, { recursive: true, force: true });
});

beforeEach(() => {
  clearRegistry();
  loadBuiltins();
  for (const k of GATE_KEYS) delete process.env[k];
  process.env.CORVIDINHO_ALLOWLIST_FILE = join(base, "no-allowlist.toml");
});

describe("git plugins registry (REQ-plugins-182)", () => {
  test("reads are safe tier 0; mutators dangerous code tier", () => {
    const byName = Object.fromEntries(list().map((e) => [e.name, e]));
    for (const name of ["git-status", "git-diff", "git-log", "git-branch-list"]) {
      expect(byName[name]).toBeTruthy();
      expect(byName[name]!.dangerous).toBe(false);
      expect(byName[name]!.minTier).toBe(0);
    }
    for (const name of ["git-branch-create", "git-commit", "git-push"]) {
      expect(byName[name]).toBeTruthy();
      expect(byName[name]!.dangerous).toBe(true);
      expect(byName[name]!.minTier).toBe(2);
    }
  });

  test("SAFE-1: mutators denied non-interactive without allowlist", async () => {
    const repo = makeRepo();
    writeFileSync(join(repo, "a.ts"), "export const a = 1;\n");
    const before = g(repo, "rev-parse", "HEAD").trim();
    for (const [name, args] of [
      ["git-commit", ["--message", "x", "a.ts"]],
      ["git-branch-create", ["feat/x"]],
      ["git-push", []],
    ] as const) {
      const r = await run(name, [...args], repo, false);
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(2);
      expect(r.error).toContain("SAFE-1");
    }
    expect(g(repo, "rev-parse", "HEAD").trim()).toBe(before);
    expect(g(repo, "branch", "--list", "feat/x").trim()).toBe("");
  });
});

describe("git reads", () => {
  test("git-status parses porcelain v1 into JSON", async () => {
    const repo = makeRepo();
    const clean = await run("git-status", [], repo);
    expect(clean.ok).toBe(true);
    expect((clean.data as { clean: boolean; branch: string }).clean).toBe(true);
    expect((clean.data as { branch: string }).branch).toBe("main");

    writeFileSync(join(repo, "README.md"), "hello world\n");
    writeFileSync(join(repo, "a.ts"), "export const a = 1;\n");
    g(repo, "add", "a.ts");
    writeFileSync(join(repo, "my file.txt"), "spaces\n");
    const r = await run("git-status", [], repo);
    expect(r.ok).toBe(true);
    const s = r.data as {
      branch: string;
      clean: boolean;
      staged: string[];
      unstaged: string[];
      untracked: string[];
      entries: { path: string; index: string; worktree: string }[];
    };
    expect(s.branch).toBe("main");
    expect(s.clean).toBe(false);
    expect(s.staged).toEqual(["a.ts"]);
    expect(s.unstaged).toEqual(["README.md"]);
    expect(s.untracked).toEqual(["my file.txt"]);
    expect(s.entries.find((e) => e.path === "a.ts")?.index).toBe("A");
    expect(r.message).toContain("## main");
  });

  test("git-status lists files in a new directory (not the collapsed dir) so git-commit can take them", async () => {
    const repo = makeRepo();
    mkdirSync(join(repo, "plugins", "newthing"), { recursive: true });
    writeFileSync(join(repo, "plugins", "newthing", "a.ts"), "a\n");
    writeFileSync(join(repo, "plugins", "newthing", "b.ts"), "b\n");
    const r = await run("git-status", [], repo);
    expect(r.ok).toBe(true);
    const untracked = (r.data as { untracked: string[] }).untracked;
    expect(untracked).toEqual(["plugins/newthing/a.ts", "plugins/newthing/b.ts"]);

    const c = await run("git-commit", ["-m", "feat: newthing", ...untracked], repo);
    expect(c.error).toBeUndefined();
    expect(c.ok).toBe(true);
    expect((c.data as { filesChanged: string[] }).filesChanged.sort()).toEqual(untracked);
    expect((await run("git-status", [], repo)).data).toMatchObject({ clean: true });
  });

  test("git-diff: worktree vs --staged, byte cap, path filter, escape refused", async () => {
    const repo = makeRepo();
    writeFileSync(join(repo, "README.md"), "hello world\n");
    writeFileSync(join(repo, "a.ts"), "export const a = 1;\n");
    g(repo, "add", "a.ts");

    const work = await run("git-diff", [], repo);
    expect(work.ok).toBe(true);
    const wd = work.data as { diff: string; files: { status: string; path: string }[]; truncated: boolean };
    expect(wd.diff).toContain("+hello world");
    expect(wd.diff).not.toContain("export const a");
    expect(wd.files).toEqual([{ status: "M", path: "README.md" }]);
    expect(wd.truncated).toBe(false);

    const staged = await run("git-diff", ["--staged"], repo);
    const sd = staged.data as { diff: string; files: { status: string; path: string }[] };
    expect(sd.diff).toContain("+export const a = 1;");
    expect(sd.diff).not.toContain("hello world");
    expect(sd.files).toEqual([{ status: "A", path: "a.ts" }]);

    const capped = await run("git-diff", ["--max-bytes", "10"], repo);
    const cd = capped.data as { diff: string; bytes: number; truncated: boolean };
    expect(capped.ok).toBe(true);
    expect(cd.truncated).toBe(true);
    expect(cd.bytes).toBe(10);
    expect(cd.diff.length).toBe(10);

    const filtered = await run("git-diff", ["--staged", "README.md"], repo);
    expect((filtered.data as { files: unknown[] }).files).toEqual([]);

    const escape = await run("git-diff", ["../outside"], repo);
    expect(escape.ok).toBe(false);
    expect(escape.error).toContain("outside the project");

    const unknownFlag = await run("git-diff", ["--output=/tmp/pwn.txt"], repo);
    expect(unknownFlag.ok).toBe(false);
    expect(unknownFlag.error).toContain("unsupported flag");
  });

  test("git-log returns N oneline commits; option-like refs refused", async () => {
    const repo = makeRepo();
    for (const n of [1, 2, 3]) {
      writeFileSync(join(repo, "n.txt"), `${n}\n`);
      g(repo, "add", "n.txt");
      g(repo, "commit", "-q", "-m", `commit ${n}`);
    }
    const r = await run("git-log", ["-n", "2"], repo);
    expect(r.ok).toBe(true);
    const d = r.data as { count: number; commits: { subject: string; sha: string; short: string }[] };
    expect(d.count).toBe(2);
    expect(d.commits[0]!.subject).toBe("commit 3");
    expect(d.commits[1]!.subject).toBe("commit 2");
    expect(d.commits[0]!.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(r.message?.split("\n")[0]).toBe(`${d.commits[0]!.short} commit 3`);

    const all = await run("git-log", [], repo);
    expect((all.data as { count: number }).count).toBe(4);

    const bad = await run("git-log", ["--output=/tmp/x"], repo);
    expect(bad.ok).toBe(false);
    const badRef = await run("git-log", ["$(id)"], repo);
    expect(badRef.ok).toBe(false);
    expect(badRef.error).toContain("invalid ref");
  });

  test("git-branch-list marks the current branch", async () => {
    const repo = makeRepo();
    g(repo, "branch", "other");
    const r = await run("git-branch-list", [], repo);
    expect(r.ok).toBe(true);
    const d = r.data as { current: string; branches: { name: string; current: boolean }[] };
    expect(d.current).toBe("main");
    expect(d.branches.map((b) => b.name).sort()).toEqual(["main", "other"]);
    expect(d.branches.find((b) => b.name === "main")?.current).toBe(true);
    expect(d.branches.find((b) => b.name === "other")?.current).toBe(false);
  });
});

describe("unborn repository (no commits yet)", () => {
  test("status / log / diff --staged / first commit work before any commit", async () => {
    const repo = mkdtempSync(join(base, "unborn-"));
    g(repo, "init", "-q", "-b", "main");
    g(repo, "config", "user.name", "Fixture Bot");
    g(repo, "config", "user.email", "fixture@example.invalid");
    g(repo, "config", "commit.gpgsign", "false");
    writeFileSync(join(repo, "a.ts"), "a\n");
    writeFileSync(join(repo, "b.ts"), "b\n");

    const st = await run("git-status", [], repo);
    expect(st.ok).toBe(true);
    expect(st.data).toMatchObject({ branch: "main", initial: true, untracked: ["a.ts", "b.ts"] });

    const log = await run("git-log", [], repo);
    expect(log.ok).toBe(true);
    expect((log.data as { count: number }).count).toBe(0);

    g(repo, "add", "b.ts");
    const diff = await run("git-diff", ["--staged"], repo);
    expect(diff.ok).toBe(true);
    expect((diff.data as { files: { path: string }[] }).files.map((f) => f.path)).toEqual(["b.ts"]);

    const c = await run("git-commit", ["-m", "first", "a.ts"], repo);
    expect(c.error).toBeUndefined();
    expect(c.ok).toBe(true);
    expect((c.data as { filesChanged: string[] }).filesChanged).toEqual(["a.ts"]);
    expect(g(repo, "diff", "--cached", "--name-only").trim()).toBe("b.ts");
  });
});

describe("SAFE-3 cwd clamp", () => {
  test("subdirectory of a repo and non-repo dirs are refused", async () => {
    const repo = makeRepo();
    mkdirSync(join(repo, "sub"));
    const sub = await run("git-status", [], join(repo, "sub"));
    expect(sub.ok).toBe(false);
    expect(sub.exitCode).toBe(2);
    expect(sub.error).toContain("SAFE-3");

    const plain = mkdtempSync(join(base, "plain-"));
    const r = await run("git-log", [], plain);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("SAFE-3");
  });

  test("inherited GIT_DIR cannot redirect git to another repository", async () => {
    const repo = makeRepo();
    const other = makeRepo();
    writeFileSync(join(repo, "mine.txt"), "x\n");
    process.env.GIT_DIR = join(other, ".git");
    try {
      const r = await run("git-status", [], repo);
      expect(r.ok).toBe(true);
      expect((r.data as { untracked: string[] }).untracked).toEqual(["mine.txt"]);
    } finally {
      delete process.env.GIT_DIR;
    }
    const env = gitEnv("/tmp/x/repo", { GIT_DIR: "/elsewhere", GIT_WORK_TREE: "/w", PATH: "/bin" });
    expect(env.GIT_DIR).toBeUndefined();
    expect(env.GIT_WORK_TREE).toBeUndefined();
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
    expect(env.GIT_CEILING_DIRECTORIES).toBe("/tmp/x");
    expect(env.PATH).toBe("/bin");
  });
});

describe("git-branch-create", () => {
  test("creates and switches; refuses existing, force and bad names", async () => {
    const repo = makeRepo();
    const r = await run("git-branch-create", ["feat/issue-82"], repo);
    expect(r.ok).toBe(true);
    expect((r.data as { switched: boolean }).switched).toBe(true);
    expect(g(repo, "symbolic-ref", "--short", "HEAD").trim()).toBe("feat/issue-82");

    const noSwitch = await run("git-branch-create", ["side", "--no-switch", "--from", "main"], repo);
    expect(noSwitch.ok).toBe(true);
    expect(g(repo, "symbolic-ref", "--short", "HEAD").trim()).toBe("feat/issue-82");

    const again = await run("git-branch-create", ["side"], repo);
    expect(again.ok).toBe(false);
    expect(again.error).toContain("already exists");

    const force = await run("git-branch-create", ["-f", "main"], repo);
    expect(force.ok).toBe(false);
    expect(force.exitCode).toBe(2);

    for (const bad of ["bad..name", "-x", "@{-1}", "a b"]) {
      const b = await run("git-branch-create", ["--", bad], repo);
      expect(b.ok).toBe(false);
    }
    const unknownFrom = await run("git-branch-create", ["x2", "--from", "nope"], repo);
    expect(unknownFrom.ok).toBe(false);
    expect(unknownFrom.error).toContain("unknown start point");
  });

  test("SAFE-2: --from a ref that tracks ignored .env / keystore never overwrites the local files", async () => {
    const repo = makeRepo();
    // A secrets file committed by accident, later removed and gitignored.
    writeFileSync(join(repo, ".env"), "TOKEN=old-committed\n");
    writeFileSync(join(repo, "keystore.json"), '{"k":"old"}\n');
    g(repo, "add", ".env", "keystore.json");
    g(repo, "commit", "-q", "-m", "oops: secrets");
    const old = g(repo, "rev-parse", "HEAD").trim();
    g(repo, "rm", "-q", "--cached", ".env", "keystore.json");
    writeFileSync(join(repo, ".gitignore"), ".env\nkeystore.json\n");
    g(repo, "add", ".gitignore");
    g(repo, "commit", "-q", "-m", "chore: ignore secrets");
    // The operator's real (ignored, untracked) files.
    writeFileSync(join(repo, ".env"), "TOKEN=operator-real-secret\n");
    writeFileSync(join(repo, "keystore.json"), '{"k":"operator"}\n');
    const head = g(repo, "rev-parse", "HEAD").trim();

    const r = await run("git-branch-create", ["feat/x", "--from", old], repo);
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain("SAFE-2");
    expect(r.error).not.toContain("operator-real-secret");
    expect(g(repo, "branch", "--list", "feat/x").trim()).toBe("");
    expect(readFileSync(join(repo, ".env"), "utf8")).toBe("TOKEN=operator-real-secret\n");
    expect(readFileSync(join(repo, "keystore.json"), "utf8")).toBe('{"k":"operator"}\n');
    expect(g(repo, "symbolic-ref", "--short", "HEAD").trim()).toBe("main");
    expect(g(repo, "rev-parse", "HEAD").trim()).toBe(head);

    // --no-switch never touches the worktree, so it may still create the branch.
    const side = await run("git-branch-create", ["side", "--no-switch", "--from", old], repo);
    expect(side.ok).toBe(true);
    expect(readFileSync(join(repo, ".env"), "utf8")).toBe("TOKEN=operator-real-secret\n");
  });
});

describe("hooks disabled and linked worktrees", () => {
  function writeHook(dir: string, name: string, marker: string): void {
    mkdirSync(dir, { recursive: true });
    const hook = join(dir, name);
    writeFileSync(hook, `#!/bin/sh\ntouch '${marker}'\n`);
    chmodSync(hook, 0o755);
  }

  test("agent-written hooks never run on git-commit / git-push (.git/hooks or core.hooksPath)", async () => {
    const repo = makeRepo();
    const bare = addBareRemote(repo);
    process.env.CORVIDINHO_GITHUB_ALLOW_REPOS = "acme/widget";
    const markers = mkdtempSync(join(base, "markers-"));
    const m = (n: string) => join(markers, n);
    writeHook(join(repo, ".git", "hooks"), "pre-commit", m("pre-commit"));
    writeHook(join(repo, ".git", "hooks"), "commit-msg", m("commit-msg"));
    writeHook(join(repo, ".git", "hooks"), "post-commit", m("post-commit"));
    writeHook(join(repo, ".git", "hooks"), "pre-push", m("pre-push"));

    writeFileSync(join(repo, "a.ts"), "a\n");
    const c = await run("git-commit", ["-m", "feat: a", "a.ts"], repo);
    expect(c.error).toBeUndefined();
    expect(c.ok).toBe(true);
    const p = await run("git-push", [], repo);
    expect(p.error).toBeUndefined();
    expect(p.ok).toBe(true);
    expect(remoteRef(bare, "main")).toBe(g(repo, "rev-parse", "HEAD").trim());

    // A repo-local core.hooksPath is overridden too.
    const alt = join(repo, "alt-hooks");
    writeHook(alt, "pre-commit", m("alt-pre-commit"));
    g(repo, "config", "core.hooksPath", alt);
    writeFileSync(join(repo, "b.ts"), "b\n");
    const c2 = await run("git-commit", ["-m", "feat: b", "b.ts"], repo);
    expect(c2.ok).toBe(true);

    for (const n of ["pre-commit", "commit-msg", "post-commit", "pre-push", "alt-pre-commit"]) {
      expect(existsSync(m(n))).toBe(false);
    }
    // Control: the same hook does run for plain git, so the assertions above are meaningful.
    writeFileSync(join(repo, "c.ts"), "c\n");
    g(repo, "add", "c.ts");
    g(repo, "commit", "-q", "-m", "control");
    expect(existsSync(m("alt-pre-commit"))).toBe(true);
  });

  test("git-status / git-commit work in a linked worktree (.git is a file)", async () => {
    const repo = makeRepo();
    const wt = join(mkdtempSync(join(base, "wt-")), "tree");
    g(repo, "worktree", "add", "-q", "-b", "wt-branch", wt);
    expect(existsSync(join(wt, ".git"))).toBe(true);

    writeFileSync(join(wt, "w.ts"), "w\n");
    const st = await run("git-status", [], wt);
    expect(st.error).toBeUndefined();
    expect(st.ok).toBe(true);
    expect(st.data).toMatchObject({ branch: "wt-branch", untracked: ["w.ts"] });

    const c = await run("git-commit", ["-m", "feat: from worktree", "w.ts"], wt);
    expect(c.error).toBeUndefined();
    expect(c.ok).toBe(true);
    expect(c.data).toMatchObject({ branch: "wt-branch", filesChanged: ["w.ts"] });
    expect(g(wt, "log", "-1", "--format=%s").trim()).toBe("feat: from worktree");
    // The main worktree is untouched.
    expect(g(repo, "symbolic-ref", "--short", "HEAD").trim()).toBe("main");
    expect(existsSync(join(repo, "w.ts"))).toBe(false);

    mkdirSync(join(wt, "sub"));
    const sub = await run("git-status", [], join(wt, "sub"));
    expect(sub.ok).toBe(false);
    expect(sub.error).toContain("SAFE-3");
  });
});

describe("git-commit", () => {
  test("requires a message and explicit file paths", async () => {
    const repo = makeRepo();
    writeFileSync(join(repo, "a.ts"), "a\n");
    const noMsg = await run("git-commit", ["a.ts"], repo);
    expect(noMsg.ok).toBe(false);
    expect(noMsg.error).toContain("message is required");

    const noPath = await run("git-commit", ["--message", "x"], repo);
    expect(noPath.ok).toBe(false);

    mkdirSync(join(repo, "src"));
    writeFileSync(join(repo, "src", "b.ts"), "b\n");
    const dir = await run("git-commit", ["--message", "x", "src"], repo);
    expect(dir.ok).toBe(false);
    expect(dir.error).toContain("directory");

    const root = await run("git-commit", ["--message", "x", "."], repo);
    expect(root.ok).toBe(false);

    const all = await run("git-commit", ["--message", "x", "--all"], repo);
    expect(all.ok).toBe(false);
    expect(all.exitCode).toBe(2);

    const amend = await run("git-commit", ["--amend", "--message", "x", "a.ts"], repo);
    expect(amend.ok).toBe(false);
    expect(amend.exitCode).toBe(2);
    expect(amend.error).toContain("never amends");
  });

  test("commits only the named paths and reports filesChanged", async () => {
    const repo = makeRepo();
    writeFileSync(join(repo, "a.ts"), "a\n");
    writeFileSync(join(repo, "other.ts"), "other\n");
    g(repo, "add", "other.ts"); // pre-staged, not named → must stay out of the commit
    writeFileSync(join(repo, "README.md"), "changed\n");
    const r = await run("git-commit", ["--message", "feat: add a", "a.ts", "README.md"], repo);
    expect(r.error).toBeUndefined(); expect(r.ok).toBe(true);
    const d = r.data as { commit: string; branch: string; filesChanged: string[]; subject: string };
    expect(d.branch).toBe("main");
    expect(d.subject).toBe("feat: add a");
    expect(d.filesChanged.sort()).toEqual(["README.md", "a.ts"]);
    expect(g(repo, "rev-parse", "HEAD").trim()).toBe(d.commit);
    expect(g(repo, "log", "-1", "--format=%s").trim()).toBe("feat: add a");
    expect(g(repo, "diff", "--cached", "--name-only").trim()).toBe("other.ts");
  });

  test("tracked deletes stage; protected deletes, .env, escapes and symlink escapes refused", async () => {
    const repo = makeRepo();
    mkdirSync(join(repo, "specs"));
    writeFileSync(join(repo, "fledge.toml"), "[tasks]\n");
    writeFileSync(join(repo, "notes.txt"), "n\n");
    writeFileSync(join(repo, "specs", "x.spec.md"), "# spec\n");
    g(repo, "add", "fledge.toml", "notes.txt", "specs/x.spec.md");
    g(repo, "commit", "-q", "-m", "infra");

    unlinkSync(join(repo, "notes.txt"));
    const del = await run("git-commit", ["-m", "chore: drop notes", "notes.txt"], repo);
    expect(del.error).toBeUndefined(); expect(del.ok).toBe(true);
    expect((del.data as { filesChanged: string[] }).filesChanged).toEqual(["notes.txt"]);
    expect(g(repo, "ls-files", "notes.txt").trim()).toBe("");

    unlinkSync(join(repo, "fledge.toml"));
    const prot = await run("git-commit", ["-m", "drop fledge", "fledge.toml"], repo);
    expect(prot.ok).toBe(false);
    expect(prot.exitCode).toBe(2);
    expect(prot.error).toContain("SAFE-2");
    expect(g(repo, "ls-files", "fledge.toml").trim()).toBe("fledge.toml");

    // Modifying protected infra made elsewhere (e.g. SpecSync) may be committed.
    writeFileSync(join(repo, "specs", "x.spec.md"), "# spec v2\n");
    const specEdit = await run("git-commit", ["-m", "docs: spec", "specs/x.spec.md"], repo);
    expect(specEdit.ok).toBe(true);

    writeFileSync(join(repo, ".env"), "TOKEN=secret\n");
    const env = await run("git-commit", ["-m", "oops", ".env"], repo);
    expect(env.ok).toBe(false);
    expect(env.exitCode).toBe(2);
    expect(g(repo, "ls-files", ".env").trim()).toBe("");

    const escape = await run("git-commit", ["-m", "x", "../outside.txt"], repo);
    expect(escape.ok).toBe(false);
    expect(escape.error).toContain("outside the project");

    const outside = join(mkdtempSync(join(base, "outside-")), "secret.txt");
    writeFileSync(outside, "s\n");
    symlinkSync(outside, join(repo, "link.txt"));
    const link = await run("git-commit", ["-m", "x", "link.txt"], repo);
    expect(link.ok).toBe(false);
    expect(link.error).toContain("Symlink escape");

    writeFileSync(join(repo, ".gitignore"), "build.log\n");
    writeFileSync(join(repo, "build.log"), "log\n");
    const ignored = await run("git-commit", ["-m", "x", "build.log"], repo);
    expect(ignored.ok).toBe(false);
    expect(ignored.error).toContain("ignored");
  });
});

describe("git-push (GITHUB-6, never force)", () => {
  function setup() {
    const repo = makeRepo();
    const bare = addBareRemote(repo);
    g(repo, "switch", "-q", "-c", "feat/push");
    writeFileSync(join(repo, "f.txt"), "1\n");
    g(repo, "add", "f.txt");
    g(repo, "commit", "-q", "-m", "feat 1");
    return { repo, bare };
  }

  test("default-deny and deny list refuse (exit 3); allowlisted push succeeds", async () => {
    const { repo, bare } = setup();

    const denied = await run("git-push", [], repo);
    expect(denied.ok).toBe(false);
    expect(denied.exitCode).toBe(3);
    expect(denied.error).toContain("GITHUB-6");
    expect(remoteRef(bare, "feat/push")).toBeNull();

    process.env.CORVIDINHO_GITHUB_ALLOW_REPOS = "acme/widget";
    process.env.CORVIDINHO_GITHUB_DENY_REPOS = "acme/widget";
    const denyWins = await run("git-push", [], repo);
    expect(denyWins.exitCode).toBe(3);
    expect(denyWins.error).toContain("denied");
    delete process.env.CORVIDINHO_GITHUB_DENY_REPOS;

    const allowFile = join(base, `allow-${Date.now()}.toml`);
    writeFileSync(allowFile, '[github]\ndeny_repos = ["acme/widget"]\n');
    process.env.CORVIDINHO_ALLOWLIST_FILE = allowFile;
    const fileDeny = await run("git-push", [], repo);
    expect(fileDeny.exitCode).toBe(3);
    process.env.CORVIDINHO_ALLOWLIST_FILE = join(base, "no-allowlist.toml");

    const mismatch = await run("git-push", ["--repo", "acme/other"], repo);
    expect(mismatch.exitCode).toBe(3);

    const ok = await run("git-push", [], repo);
    expect(ok.ok).toBe(true);
    const d = ok.data as { repo: string; branch: string; status: string; remote: string };
    expect(d.repo).toBe("acme/widget");
    expect(d.branch).toBe("feat/push");
    expect(d.remote).toBe("origin");
    expect(d.status).toBe("created");
    expect(remoteRef(bare, "feat/push")).toBe(g(repo, "rev-parse", "HEAD").trim());
    expect(g(repo, "config", "branch.feat/push.remote").trim()).toBe("origin");

    const again = await run("git-push", ["origin", "feat/push"], repo);
    expect(again.ok).toBe(true);
    expect((again.data as { status: string }).status).toBe("up-to-date");
  });

  test("force, refspecs, other branches, URL remotes and detached HEAD refused", async () => {
    const { repo, bare } = setup();
    process.env.CORVIDINHO_GITHUB_ALLOW_REPOS = "acme/widget";
    for (const args of [
      ["--force"],
      ["-f"],
      ["--force-with-lease"],
      ["--force-with-lease=feat/push"],
      ["--delete"],
      ["--mirror"],
      ["--tags"],
      ["origin", "+feat/push"],
      ["origin", "feat/push:main"],
      ["origin", "main"],
      ["--remote", "https://user:ghp_abcdefghijklmnopqrstuvwxyz0123@example.com/acme/widget.git"],
    ]) {
      const r = await run("git-push", args, repo);
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(2);
      expect(r.error ?? "").not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123");
    }
    expect(remoteRef(bare, "feat/push")).toBeNull();
    expect(remoteRef(bare, "main")).toBeNull();

    g(repo, "checkout", "-q", "--detach");
    const detached = await run("git-push", [], repo);
    expect(detached.ok).toBe(false);
    expect(detached.exitCode).toBe(2);
    expect(detached.error).toContain("detached");
  });

  test("non-fast-forward push is rejected without force; remote unchanged", async () => {
    const { repo, bare } = setup();
    process.env.CORVIDINHO_GITHUB_ALLOW_REPOS = "acme/widget";
    expect((await run("git-push", [], repo)).ok).toBe(true);
    const pushed = remoteRef(bare, "feat/push");

    g(repo, "reset", "-q", "--hard", "HEAD~1");
    writeFileSync(join(repo, "g.txt"), "diverged\n");
    g(repo, "add", "g.txt");
    g(repo, "commit", "-q", "-m", "diverged");
    const r = await run("git-push", [], repo);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("force is never used");
    expect(remoteRef(bare, "feat/push")).toBe(pushed);
  });
});

describe("git parsers", () => {
  test("porcelain header variants and renames", () => {
    const s = parseStatusPorcelainZ(
      "## feat...origin/feat [ahead 2, behind 1]\0R  new.ts\0old.ts\0 M a.ts\0UU c.ts\0?? d e.ts\0",
    );
    expect(s.branch).toBe("feat");
    expect(s.upstream).toBe("origin/feat");
    expect(s.ahead).toBe(2);
    expect(s.behind).toBe(1);
    expect(s.entries[0]).toMatchObject({ index: "R", path: "new.ts", origPath: "old.ts", staged: true });
    expect(s.unstaged).toEqual(["a.ts"]);
    expect(s.conflicted).toEqual(["c.ts"]);
    expect(s.untracked).toEqual(["d e.ts"]);

    expect(parseStatusPorcelainZ("## No commits yet on main\0")).toMatchObject({
      branch: "main",
      initial: true,
      clean: true,
    });
    expect(parseStatusPorcelainZ("## HEAD (no branch)\0")).toMatchObject({
      branch: null,
      detached: true,
    });
    expect(parseStatusPorcelainZ("## main...origin/main [gone]\0").upstreamGone).toBe(true);
  });

  test("name-status, push porcelain, remote slugs, credential redaction", () => {
    expect(parseNameStatusZ("M\0a.ts\0R087\0old.ts\0new.ts\0")).toEqual([
      { status: "M", path: "a.ts" },
      { status: "R", path: "new.ts", origPath: "old.ts" },
    ]);
    expect(
      parsePushPorcelain("To /tmp/x\n*\trefs/heads/f:refs/heads/f\t[new branch]\nDone\n"),
    ).toEqual([{ flag: "*", from: "refs/heads/f", to: "refs/heads/f", summary: "[new branch]" }]);

    expect(repoSlugFromRemoteUrl("https://github.com/CorvidLabs/Corvidinho.git")).toBe(
      "CorvidLabs/Corvidinho",
    );
    expect(repoSlugFromRemoteUrl("git@github.com:CorvidLabs/Corvidinho.git")).toBe(
      "CorvidLabs/Corvidinho",
    );
    expect(repoSlugFromRemoteUrl("ssh://git@github.com:22/acme/widget")).toBe("acme/widget");
    expect(repoSlugFromRemoteUrl("/tmp/abc/acme/widget.git")).toBe("acme/widget");
    expect(repoSlugFromRemoteUrl("file:///srv/acme/widget.git/")).toBe("acme/widget");
    expect(repoSlugFromRemoteUrl("widget")).toBeNull();

    const url = "https://x-access-token:ghp_abcdefghijklmnopqrstuvwxyz0123@github.com/a/b.git";
    expect(redactUrlCredentials(url)).toBe("https://***@github.com/a/b.git");
    expect(scrubGitOutput(`remote: token ghp_abcdefghijklmnopqrstuvwxyz0123 ${url}`)).not.toContain(
      "ghp_abcdefghijklmnopqrstuvwxyz0123",
    );
  });
});

test("fixture dirs live under the temp base only", () => {
  expect(base.startsWith(tmpdir())).toBe(true);
  expect(existsSync(base)).toBe(true);
});
