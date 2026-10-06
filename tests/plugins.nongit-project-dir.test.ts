/**
 * AGENT-1.a / AGENT-1.b (#84, captured from Leif's 2026-09-28 interview) in
 * the tool layer:
 * - AGENT-1.b "In a project folder that isn't a git repo, its file tools
 *   can't change the root AGENTS.md or CLAUDE.md; I edit those myself."
 *   files-write / files-edit / files-delete refuse the root instruction files
 *   of a non-git folder (the names, anything under them, the file a symlink
 *   of that name leads to, a hard link to one) for every caller; other files,
 *   a nested AGENTS.md and a git project's root copy are unchanged.
 * - AGENT-1.a "other people's runs only read there": `actingWorkTask` needs a
 *   git work tree, so a team member's /work run gets the role refusal for the
 *   work tools in a non-git folder and keeps them in a git one; the owner's
 *   writes there still go through SAFE-2.
 *
 * Temp folders and a temp allowlist file; no token, no network.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isNonGitRootInstructionPath } from "../plugins/files/protectedPaths.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import {
  ACTING_ROLE_ENV,
  ACTING_WORK_TASK_ENV,
  actingWorkTask,
  ROLE_REFUSED_MESSAGE,
} from "../src/plugins/roles.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { makeProject } from "./fixtures/talk-worktree.ts";

const OWNER_ID = "181969874455756800";
const TOFU = "200000000000000002"; // team

const KEYS = [
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  ACTING_ROLE_ENV,
  ACTING_WORK_TASK_ENV,
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_ALLOWLIST",
  "DISCORD_MUTED_USER_IDS",
] as const;

const temps: string[] = [];
let saved: Record<string, string | undefined> = {};
let allowlistPath = "";

function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  const dir = tempDir("corvidinho-nongit-plugins-allow-");
  allowlistPath = join(dir, "allowlist.toml");
  writeFileSync(
    allowlistPath,
    `[discord]\nchannels = ["600000000000000006"]\ndeny_users = []\n\n[owner]\ndiscord_id = "${OWNER_ID}"\ndisplay = "Leif"\n\n[people.tofu]\ndisplay = "Tofu"\nrole = "team"\ndiscord_ids = ["${TOFU}"]\n`,
  );
  process.env.CORVIDINHO_ALLOWLIST_FILE = allowlistPath;
  clearRegistry();
  loadBuiltins();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  clearRegistry();
  loadBuiltins();
});

afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

/** A Discord role session as the bridge stamps it. */
function roleSession(actor: string, opts: { owner?: boolean; role: string; work?: boolean }): void {
  process.env.CORVIDINHO_ACTING_IS_ADMIN = opts.owner ? "1" : "0";
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = actor;
  process.env[ACTING_ROLE_ENV] = opts.role;
  process.env[ACTING_WORK_TASK_ENV] = opts.work ? "1" : "0";
}

function plainProject(): string {
  const project = join(tempDir("corvidinho-nongit-plugins-"), "plain");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "AGENTS.md"), "# rules\n");
  writeFileSync(join(project, "CLAUDE.md"), "# claude\n");
  writeFileSync(join(project, "notes.txt"), "live\n");
  return project;
}

const write = (cwd: string, path: string, content = "x") =>
  runPlugin({ name: "files-write", args: [path, content], cwd, nonInteractive: true, allowlist: ["files-delete"] });
const edit = (cwd: string, path: string) =>
  runPlugin({ name: "files-edit", args: [path, "--old", "#", "--new", "##"], cwd, nonInteractive: true, allowlist: [] });
const del = (cwd: string, path: string) =>
  runPlugin({ name: "files-delete", args: [path], cwd, nonInteractive: true, allowlist: ["files-delete"] });

describe("AGENT-1.b: a non-git folder's root AGENTS.md / CLAUDE.md are not changed by the file tools", () => {
  test("write, edit and delete of the root files are refused for the owner and the local CLI alike; the files stay as they were", async () => {
    const project = plainProject();
    for (const who of ["cli", "owner"] as const) {
      if (who === "owner") roleSession(OWNER_ID, { owner: true, role: "owner" });
      for (const path of ["AGENTS.md", "./CLAUDE.md", join(project, "AGENTS.md"), "AGENTS.md/inner.md"]) {
        const w = await write(project, path, "planted");
        expect(w.ok).toBe(false);
        expect(w.exitCode).toBe(2);
        expect(w.error ?? "").toContain("refused (AGENT-1.b)");
      }
      for (const run of [edit, del]) {
        for (const path of ["AGENTS.md", "CLAUDE.md"]) {
          const r = await run(project, path);
          expect(r.ok).toBe(false);
          expect(r.error ?? "").toContain("refused (AGENT-1.b)");
        }
      }
      expect(readFileSync(join(project, "AGENTS.md"), "utf8")).toBe("# rules\n");
      expect(readFileSync(join(project, "CLAUDE.md"), "utf8")).toBe("# claude\n");
    }
  });

  test("a missing root file can't be created; a symlink's target and a hard link are covered; other files and a nested AGENTS.md are not", async () => {
    const project = plainProject();
    rmSync(join(project, "CLAUDE.md"));
    const created = await write(project, "CLAUDE.md", "planted");
    expect(created.error ?? "").toContain("refused (AGENT-1.b)");
    expect(existsSync(join(project, "CLAUDE.md"))).toBe(false);

    // CLAUDE.md -> docs/rules.md: the loader reads through the link.
    mkdirSync(join(project, "docs"));
    writeFileSync(join(project, "docs", "rules.md"), "# linked\n");
    symlinkSync("docs/rules.md", join(project, "CLAUDE.md"));
    const viaTarget = await write(project, "docs/rules.md", "planted");
    expect(viaTarget.error ?? "").toContain("refused (AGENT-1.b)");
    expect(readFileSync(join(project, "docs", "rules.md"), "utf8")).toBe("# linked\n");

    // A hard link to AGENTS.md shares its contents.
    linkSync(join(project, "AGENTS.md"), join(project, "agents-copy.md"));
    const viaLink = await write(project, "agents-copy.md", "planted");
    expect(viaLink.error ?? "").toContain("refused (AGENT-1.b)");
    expect(readFileSync(join(project, "AGENTS.md"), "utf8")).toBe("# rules\n");

    for (const path of ["notes.txt", "src/app.ts", "sub/AGENTS.md", "docs/other.md"]) {
      const ok = await write(project, path, "work");
      expect(ok.error).toBeUndefined();
      expect(ok.ok).toBe(true);
      expect(readFileSync(join(project, path), "utf8")).toBe("work");
    }
    expect(isNonGitRootInstructionPath(join(project, "notes.txt"), project)).toBe(false);
    expect(isNonGitRootInstructionPath(join(project, "AGENTS.md"), project)).toBe(true);
  });

  test("SAFE-2 protected files are still refused in the folder", async () => {
    const project = plainProject();
    roleSession(OWNER_ID, { owner: true, role: "owner" });
    for (const path of ["fledge.toml", ".env", "specs/x/requirements.md", ".fledge/lanes/verify.toml"]) {
      const r = await write(project, path, "weaken");
      expect(r.ok).toBe(false);
      expect(r.error ?? "").toContain("refused (SAFE-2)");
      expect(existsSync(join(project, path))).toBe(false);
    }
  });

  test("a git project's root AGENTS.md is unchanged (only its committed copy is loaded)", async () => {
    const git = makeProject(tempDir("corvidinho-nongit-plugins-git-"));
    const w = await write(git, "AGENTS.md", "# repo rules\n");
    expect(w.error).toBeUndefined();
    expect(w.ok).toBe(true);
    expect(isNonGitRootInstructionPath(join(git, "AGENTS.md"), git)).toBe(false);
  });
});

describe("AGENT-1.a: other people's runs only read in a non-git folder", () => {
  test("actingWorkTask needs the /work stamp and a git work tree", () => {
    const project = plainProject();
    const git = makeProject(tempDir("corvidinho-nongit-plugins-wt-"));
    const on = { [ACTING_WORK_TASK_ENV]: "1" };
    expect(actingWorkTask(on, git)).toBe(true);
    expect(actingWorkTask(on, join(git))).toBe(true);
    expect(actingWorkTask(on, project)).toBe(false);
    expect(actingWorkTask({ [ACTING_WORK_TASK_ENV]: "0" }, git)).toBe(false);
  });

  test("a team member's /work run gets the role refusal for file writes in a non-git folder and keeps them in a git one; the owner writes there", async () => {
    const project = plainProject();
    const git = makeProject(tempDir("corvidinho-nongit-plugins-team-"));
    roleSession(TOFU, { role: "team", work: true });
    for (const run of [
      () => write(project, "notes.txt", "from tofu"),
      () => runPlugin({ name: "files-edit", args: ["notes.txt", "--old", "live", "--new", "x"], cwd: project, nonInteractive: true, allowlist: [] }),
    ]) {
      const r = await run();
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(2);
      expect(r.error ?? "").toContain(ROLE_REFUSED_MESSAGE);
    }
    expect(readFileSync(join(project, "notes.txt"), "utf8")).toBe("live\n");
    const read = await runPlugin({ name: "files-read", args: ["notes.txt"], cwd: project, nonInteractive: true, allowlist: [] });
    expect(read.ok).toBe(true);

    const inGit = await write(git, "notes.txt", "from tofu");
    expect(inGit.error).toBeUndefined();
    expect(inGit.ok).toBe(true);

    roleSession(OWNER_ID, { owner: true, role: "owner" });
    const owner = await write(project, "notes.txt", "from the owner");
    expect(owner.ok).toBe(true);
    expect(readFileSync(join(project, "notes.txt"), "utf8")).toBe("from the owner");
  });
});
