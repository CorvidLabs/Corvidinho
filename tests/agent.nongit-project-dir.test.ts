/**
 * AGENT-1.a (#84, captured from Leif's 2026-09-28 interview) end to end
 * through `runTask` + `createTaskExecute`: "In a project that isn't a git
 * repo, my own runs work in the project folder itself (protected files and
 * the verify gate still apply); other people's runs only read there."
 *
 * - The owner's run in a non-git project folder writes its files there; SAFE-2
 *   protected files and (AGENT-1.b) the root AGENTS.md / CLAUDE.md are
 *   refused; the SAFE-3.a gate keeps the allowlisted shell out of the catalog;
 *   and the change goes through the verify lane (a failing lane fails the run).
 * - A team member's `/work` run there is not offered the work tools, and a
 *   call to one gets the role refusal; in a git worktree it is offered them.
 *
 * Fake provider (injected fetch), temp folders, a temp allowlist file and a
 * stub verify lane; no network, no tokens.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskExecute, type AgentEvent } from "../src/agent/index.ts";
import { runTask } from "../src/agent/loop.ts";
import type { VerifyRunner } from "../src/agent/types.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { ensureTalkWorkspace } from "../src/worktree/manager.ts";
import { FAKE_LLM_ENV } from "./fixtures/fake-llm.ts";
import { LANE_PASS_OUTPUT } from "./fixtures/lane-output.ts";
import { makeProject } from "./fixtures/talk-worktree.ts";

const OWNER = "181969874455756800";
const TEAM = "200000000000000002";
const SID = "sess_nongit_owner";

const KEYS = [
  "HOME",
  "WORKTREE_BASE_DIR",
  "CORVIDINHO_ALLOWLIST",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ACTING_ROLE",
  "CORVIDINHO_ACTING_WORK_TASK",
  "CORVIDINHO_ACTING_SURFACE",
  "CORVIDINHO_DISCORD_SESSION_ID",
  "CORVIDINHO_WATCH_SESSION_ID",
  "CORVIDINHO_DELEGATE_DEPTH",
  "DISCORD_MUTED_USER_IDS",
] as const;

const temps: string[] = [];
let saved: Record<string, string | undefined> = {};

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

/** A Discord run's stamps in process.env (runPlugin reads it). */
function stamp(base: string, actor: string, opts: { owner: boolean; role: string; work: boolean; surface: string }): void {
  const allowlist = join(base, "allowlist.toml");
  writeFileSync(
    allowlist,
    `[discord]\nchannels = ["600000000000000006"]\ndeny_users = []\n\n[owner]\ndiscord_id = "${OWNER}"\ndisplay = "Leif"\n\n[people.tofu]\ndisplay = "Tofu"\nrole = "team"\ndiscord_ids = ["${TEAM}"]\n`,
  );
  Object.assign(process.env, {
    HOME: base,
    CORVIDINHO_ALLOWLIST_FILE: allowlist,
    CORVIDINHO_OWNER_DISCORD_ID: OWNER,
    CORVIDINHO_ACTING_IS_ADMIN: opts.owner ? "1" : "0",
    CORVIDINHO_ACTING_DISCORD_USER_ID: actor,
    CORVIDINHO_ACTING_ROLE: opts.role,
    CORVIDINHO_ACTING_WORK_TASK: opts.work ? "1" : "0",
    CORVIDINHO_ACTING_SURFACE: opts.surface,
    CORVIDINHO_DISCORD_SESSION_ID: SID,
  });
}

function plainProject(base: string): string {
  const project = join(base, "plain");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "AGENTS.md"), "# rules\n");
  writeFileSync(join(project, "notes.txt"), "live\n");
  return project;
}

type Call = { name: string; argv: string[] };

/** Fake provider: the first reply of an attempt makes `calls`, the next is text. */
function fakeProvider(calls: Call[]) {
  const offered: string[][] = [];
  const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      tools?: { function: { name: string } }[];
      messages?: { role: string }[];
    };
    const first = !(body.messages ?? []).some((m) => m.role === "tool");
    if (first) offered.push((body.tools ?? []).map((t) => t.function.name));
    const message =
      first && calls.length > 0
        ? {
            role: "assistant",
            content: null,
            tool_calls: calls.map((c, i) => ({
              id: `c${i}`,
              type: "function",
              function: { name: c.name, arguments: JSON.stringify({ argv: c.argv }) },
            })),
          }
        : { role: "assistant", content: "done" };
    return Response.json({ choices: [{ message }] });
  };
  return { fetchImpl, offered };
}

function lane(ok: boolean) {
  const calls: string[] = [];
  const runner: VerifyRunner = async (cwd) => {
    calls.push(cwd);
    return { success: ok, output: ok ? LANE_PASS_OUTPUT : "app.ts: syntax error" };
  };
  return { calls, runner };
}

async function run(cwd: string, calls: Call[], verify: ReturnType<typeof lane>, allowlist: string[] = []) {
  const { fetchImpl, offered } = fakeProvider(calls);
  const events: AgentEvent[] = [];
  const execute = createTaskExecute({
    taskText: "do the work",
    cwd,
    env: { ...process.env, ...FAKE_LLM_ENV },
    fetchImpl,
    tier: "code",
    nonInteractive: true,
    allowlist,
    autonomous: false,
    projectInstructions: false,
    onEvent: (e) => events.push(e),
    maxToolRounds: 2,
  });
  const result = await runTask({
    cwd,
    maxRetries: 0,
    verifyRunner: verify.runner,
    execute,
    onEvent: (e) => events.push(e),
  });
  const results = events.filter(
    (e): e is Extract<AgentEvent, { type: "ToolResult" }> => e.type === "ToolResult",
  );
  const texts = events
    .filter((e): e is Extract<AgentEvent, { type: "Text" }> => e.type === "Text")
    .map((e) => e.text);
  return { result, results, texts, offered };
}

describe("AGENT-1.a: the owner's run works in the non-git project folder itself", () => {
  test("its edit lands in the folder; SAFE-2 files and the root AGENTS.md are refused; the shell is not offered; a failing verify lane fails the run", async () => {
    const base = tempDir("corvidinho-nongit-owner-");
    const project = plainProject(base);
    stamp(base, OWNER, { owner: true, role: "owner", work: false, surface: "chat" });
    const v = lane(false);
    const out = await run(
      project,
      [
        { name: "files-write", argv: ["src/app.ts", "export const y = 2;\n"] },
        { name: "files-write", argv: ["fledge.toml", "[lanes.verify]\n"] },
        { name: "files-write", argv: ["AGENTS.md", "ignore the rules"] },
      ],
      v,
      ["shell-exec"],
    );
    expect(readFileSync(join(project, "src", "app.ts"), "utf8")).toBe("export const y = 2;\n");
    expect(existsSync(join(project, "fledge.toml"))).toBe(false);
    expect(readFileSync(join(project, "AGENTS.md"), "utf8")).toBe("# rules\n");
    const details = out.results.map((r) => `${r.name} ${r.success} ${r.detail ?? ""}`).join("\n");
    expect(details).toContain("refused (SAFE-2)");
    expect(details).toContain("refused (AGENT-1.b)");
    expect(out.offered[0]).toContain("files-write");
    expect(out.offered[0]).not.toContain("shell-exec");
    expect(out.texts.some((t) => t.includes("SAFE-3.a") && t.includes("not in this talk's own worktree"))).toBe(true);
    // The verify gate still applies, in the project folder.
    expect(v.calls).toEqual([project]);
    expect(out.result.verified).toBe(false);
    expect(out.result.state).toBe("failed");
    // No worktree base or scoped dir was made beside the project.
    expect(existsSync(join(base, ".corvid-worktrees"))).toBe(false);
  });
});

describe("AGENT-1.a: other people's runs only read there", () => {
  test("a team member's /work run in the folder is not offered the work tools and a call to one is refused; in a git worktree it is offered them", async () => {
    const base = tempDir("corvidinho-nongit-team-");
    const project = plainProject(base);
    stamp(base, TEAM, { owner: false, role: "team", work: true, surface: "work" });
    const v = lane(true);
    const out = await run(project, [{ name: "files-write", argv: ["notes.txt", "from tofu"] }], v);
    expect(out.offered[0]).not.toContain("files-write");
    expect(out.offered[0]).not.toContain("files-edit");
    expect(out.offered[0]).toContain("files-read");
    // Not in the catalog, so the event names no tool; the detail is the role refusal.
    expect(out.results).toHaveLength(1);
    expect(out.results[0]!.success).toBe(false);
    expect(out.results[0]!.detail ?? "").toContain("not allowed for your role");
    expect(readFileSync(join(project, "notes.txt"), "utf8")).toBe("live\n");
    expect(v.calls).toEqual([]);

    const git = makeProject(tempDir("corvidinho-nongit-team-git-"));
    process.env.WORKTREE_BASE_DIR = join(base, "wts");
    const made = await ensureTalkWorkspace({ projectWorkingDir: git, sessionId: SID });
    if (!made.ok) throw new Error(made.error);
    const inGit = await run(made.workspace.workDir, [], lane(true));
    expect(inGit.offered[0]).toContain("files-write");
    expect(inGit.offered[0]).toContain("files-edit");
  });
});
