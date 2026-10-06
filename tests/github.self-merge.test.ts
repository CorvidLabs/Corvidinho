/**
 * GITHUB-7 / GITHUB-7.a (#124, REQ-plugins-099 / REQ-agent-099) —
 * `github-pr-merge`: it merges its own Corvidinho PR when the owner asks and
 * every gate is green; never its gates, never someone else's PR, and outside
 * Corvidinho a human still merges.
 *
 * A fake GitHub client (no network, no token), a temp data dir and allowlist
 * file, the real must-ask gate and card store (the owner's answer comes from
 * the test hook, or the bridge's real card engine), the real SAFE-5 chain.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SELF_MERGE_CHECKS,
  SELF_MERGE_CODE,
  SELF_MERGE_REPO,
  TALK_BRANCH_RE,
  checkSelfMerge,
  makeGithubPrMergeCommand,
  selfMergeCallerRefusal,
  selfMergeGatePath,
  type SelfMergeOctokit,
  type SelfMergePr,
} from "../plugins/github/merge.ts";
import { createTaskExecute, type AgentEvent } from "../src/agent/index.ts";
import { MUST_ASK_WAIT_STATUS, frameFromEvent, progressFromFrame } from "../src/agent/events-ndjson.ts";
import { buildOpenAiTools } from "../src/agent/tools.ts";
import { createApprovalCards, mustAskApprovalKinds } from "../src/discord/approval-cards.ts";
import { parseApproveCardCustomId } from "../src/discord/approve-card.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { MUST_ASK_MERGE_KIND, MUST_ASK_POLICY, setMustAskNotifier, setMustAskTestHooks } from "../src/plugins/must-ask.ts";
import { clearRegistry, get, register, unregister } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import type { PluginCommand } from "../src/plugins/types.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { generateTalkBranchName } from "../src/worktree/manager.ts";
import { approveWithCode, cardInteraction } from "./fixtures/approval-code.ts";
import { FAKE_LLM_ENV } from "./fixtures/fake-llm.ts";
import { answerMustAsk, MUST_ASK_TEST_OWNER, type MustAskAnswer } from "./fixtures/must-ask.ts";

const OWNER = MUST_ASK_TEST_OWNER;
/** The owner's declared GitHub numeric id (`[owner] github_id`, IDENTITY-7.a). */
const OWNER_GH = 8268288;
const TEAM = "200000000000000002";
const ME = { id: 95454608, login: "corvid-agent" };
const LEIF = { id: 8268288, login: "0xLeif" };
const HEAD = "0123456789abcdef0123456789abcdef01234567";
const OTHER = "fedcba9876543210fedcba9876543210fedcba98";
const MERGED = "1111111111111111111111111111111111111111";
const TALK = generateTalkBranchName("sess_selfmerge_test");
const TOOL = "github-pr-merge";
const ARGS = ["12", "--repo", SELF_MERGE_REPO, "--sha", HEAD];

const KEYS = [
  "HOME",
  "CORVIDINHO_DATA_DIR",
  "CORVIDINHO_ALLOWLIST",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_GITHUB_ALLOW_REPOS",
  "CORVIDINHO_GITHUB_ALLOW_ORGS",
  "CORVIDINHO_GITHUB_DENY_REPOS",
  "CORVIDINHO_GITHUB_DRY_RUN",
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ACTING_ROLE",
  "CORVIDINHO_ACTING_SURFACE",
  "CORVIDINHO_ACTING_WORK_TASK",
  "CORVIDINHO_DISCORD_SESSION_ID",
  "CORVIDINHO_WATCH_SESSION_ID",
  "CORVIDINHO_ACTING_GITHUB_ID",
  "CORVIDINHO_ACTING_GITHUB_LOGIN",
  "CORVIDINHO_ACTING_GITHUB_REPO",
  "CORVIDINHO_DELEGATE_DEPTH",
  "CORVIDINHO_PROJECT_ROOT",
  "CORVIDINHO_AUDIT_HMAC_KEY",
  "DISCORD_MUTED_USER_IDS",
  "GITHUB_TOKEN",
  "GH_TOKEN",
] as const;

let saved: Record<string, string | undefined> = {};
let restoreHooks: (() => void) | null = null;
const temps: string[] = [];

function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}

// ------------------------------------------------------------------ fake GitHub

type Run = { name: string; status: string; conclusion: string | null; app: string; head_sha?: string };

type Gh = {
  me: { id: number; login: string } | Error;
  pr: SelfMergePr;
  files: { filename: string; previous_filename?: string }[];
  reviews: { user: { id: number; login: string }; state: string }[];
  events: { event: string; actor: { id: number; login: string; type?: string } | null }[];
  runs: Run[];
  merge: { sha: string; merged: boolean; message: string } | Error;
  calls: { method: string; params: unknown }[];
};

function greenGh(): Gh {
  return {
    me: ME,
    pr: {
      number: 12,
      title: "feat(x): a small thing",
      state: "open",
      merged: false,
      draft: false,
      html_url: `https://github.com/${SELF_MERGE_REPO}/pull/12`,
      user: ME,
      head: { sha: HEAD, ref: TALK, repo: { full_name: SELF_MERGE_REPO } },
      base: { ref: "main", repo: { full_name: SELF_MERGE_REPO } },
      mergeable: true,
      mergeable_state: "clean",
      changed_files: 3,
    },
    files: [
      { filename: "src/agent/execute.ts" },
      { filename: "specs/agent/requirements.md" },
      { filename: ".specsync/changes/some-change/state.json" },
    ],
    reviews: [],
    // Opened as a draft; Leif marked it ready (GITHUB-7.a: only a person does).
    events: [
      { event: "labeled", actor: LEIF },
      { event: "ready_for_review", actor: LEIF },
    ],
    runs: [
      { name: "smoke", status: "completed", conclusion: "success", app: "github-actions", head_sha: HEAD },
      { name: "spec-sync", status: "completed", conclusion: "success", app: "github-actions", head_sha: HEAD },
      { name: "Analyze (actions)", status: "completed", conclusion: "success", app: "github-actions", head_sha: HEAD },
    ],
    merge: { sha: MERGED, merged: true, message: "Pull Request successfully merged" },
    calls: [],
  };
}

function page<T>(items: T[], p: { per_page: number; page: number }): T[] {
  return items.slice((p.page - 1) * p.per_page, p.page * p.per_page);
}

function fakeClient(gh: Gh): SelfMergeOctokit {
  const call = (method: string, params: unknown = {}) => gh.calls.push({ method, params });
  return {
    rest: {
      users: {
        getAuthenticated: async () => {
          call("users.getAuthenticated");
          if (gh.me instanceof Error) throw gh.me;
          return { data: gh.me };
        },
      },
      pulls: {
        get: async (p) => {
          call("pulls.get", p);
          return { data: structuredClone(gh.pr) };
        },
        listFiles: async (p) => {
          call("pulls.listFiles", p);
          return { data: page(gh.files, p) };
        },
        listReviews: async (p) => {
          call("pulls.listReviews", p);
          return { data: page(gh.reviews, p) };
        },
        merge: async (p) => {
          call("pulls.merge", p);
          if (gh.merge instanceof Error) throw gh.merge;
          return { data: gh.merge };
        },
      },
      issues: {
        listEvents: async (p) => {
          call("issues.listEvents", p);
          return { data: page(gh.events, p) };
        },
      },
      checks: {
        listForRef: async (p) => {
          call("checks.listForRef", p);
          const runs = gh.runs
            .filter((r) => (r.head_sha ?? HEAD) === p.ref && (!p.check_name || r.name === p.check_name))
            .map((r) => ({ name: r.name, status: r.status, conclusion: r.conclusion, html_url: null, head_sha: r.head_sha, app: { slug: r.app } }));
          return { data: { total_count: runs.length, check_runs: page(runs, p) } };
        },
      },
      repos: {
        getCommit: async (p) => {
          call("repos.getCommit", p);
          return { data: { sha: p.ref } };
        },
        getCombinedStatusForRef: async (p) => {
          call("repos.getCombinedStatusForRef", p);
          return { data: { sha: p.ref, total_count: 0, statuses: [] } };
        },
      },
    },
  };
}

// ------------------------------------------------------------------ env

let allowFile = "";

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  const base = tempDir("corvidinho-self-merge-");
  allowFile = join(base, "allowlist.toml");
  writeFileSync(
    allowFile,
    `[github]\nrepos = ["${SELF_MERGE_REPO}"]\n\n[discord]\nchannels = ["600000000000000006"]\n\n[owner]\ndiscord_id = "${OWNER}"\ngithub_id = "${OWNER_GH}"\n\n[people.tofu]\ndisplay = "Tofu"\nrole = "team"\ndiscord_ids = ["${TEAM}"]\n`,
  );
  Object.assign(process.env, {
    HOME: base,
    CORVIDINHO_DATA_DIR: join(base, "data"),
    CORVIDINHO_ALLOWLIST_FILE: allowFile,
  });
  setMustAskNotifier(() => {});
});

afterEach(() => {
  restoreHooks?.();
  restoreHooks = null;
  setMustAskTestHooks({});
  setMustAskNotifier(null);
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

/** The owner's own Discord chat, as the spawn client stamps it. */
function ownerChat(surface = "chat"): void {
  Object.assign(process.env, {
    CORVIDINHO_OWNER_DISCORD_ID: OWNER,
    CORVIDINHO_ACTING_IS_ADMIN: "1",
    CORVIDINHO_ACTING_DISCORD_USER_ID: OWNER,
    CORVIDINHO_ACTING_ROLE: "owner",
    CORVIDINHO_ACTING_SURFACE: surface,
    CORVIDINHO_DISCORD_SESSION_ID: "sess_selfmerge_test",
  });
}

/**
 * A WATCH run the owner's own GitHub comment triggered, as the WATCH spawn
 * stamps it (IDENTITY-12.a, #374): the owner's other tools, behind must-ask.
 */
function ownerWatch(): void {
  Object.assign(process.env, {
    CORVIDINHO_OWNER_DISCORD_ID: OWNER,
    CORVIDINHO_ACTING_IS_ADMIN: "1",
    CORVIDINHO_ACTING_ROLE: "owner",
    CORVIDINHO_ACTING_SURFACE: "watch",
    CORVIDINHO_ACTING_GITHUB_ID: String(OWNER_GH),
    CORVIDINHO_ACTING_GITHUB_LOGIN: "0xleif",
    CORVIDINHO_ACTING_GITHUB_REPO: SELF_MERGE_REPO,
    CORVIDINHO_WATCH_SESSION_ID: "watch_w1",
  });
}

function teamChat(): void {
  Object.assign(process.env, {
    CORVIDINHO_OWNER_DISCORD_ID: OWNER,
    CORVIDINHO_ACTING_IS_ADMIN: "0",
    CORVIDINHO_ACTING_DISCORD_USER_ID: TEAM,
    CORVIDINHO_ACTING_ROLE: "team",
    CORVIDINHO_ACTING_SURFACE: "chat",
    CORVIDINHO_DISCORD_SESSION_ID: "sess_selfmerge_team",
  });
}

/** Swap the builtin for one on `gh`'s fake client. */
function useFake(gh: Gh): PluginCommand {
  const builtin = get(TOOL);
  if (builtin) unregister(TOOL, builtin);
  const cmd = makeGithubPrMergeCommand({ client: () => fakeClient(gh) });
  register(cmd);
  return cmd;
}

function answer(a: MustAskAnswer | ((req: Parameters<NonNullable<Parameters<typeof setMustAskTestHooks>[0]["onRequest"]>>[0]) => MustAskAnswer)) {
  const h = answerMustAsk(a as never);
  restoreHooks = h.restore;
  return h.requests;
}

function auditRows(): { action: string; outcome: string }[] {
  const db = openCorvidinhoDb({ env: process.env });
  try {
    return db.query("SELECT action, outcome FROM audit_log ORDER BY seq").all() as { action: string; outcome: string }[];
  } finally {
    db.close();
  }
}

const merges = (gh: Gh) => gh.calls.filter((c) => c.method === "pulls.merge");

async function verdictFor(gh: Gh, args: string[] = ARGS) {
  return checkSelfMerge(args, process.env, { client: () => fakeClient(gh) });
}

function reasonOf(v: Awaited<ReturnType<typeof checkSelfMerge>>): string | undefined {
  return v.ok ? undefined : v.result.auditDenied;
}

// ------------------------------------------------------------------ tests

describe("GITHUB-7.a: a passing merge, only after the owner's Approve card", () => {
  test("every gate green + Approve: one squash merge at the named head, titled with the PR title; the reply names the merge sha; started + ok rows", async () => {
    const gh = greenGh();
    useFake(gh);
    const asked = answer("approved");
    const r = await runPlugin({ name: TOOL, args: ARGS, nonInteractive: true, allowlist: [TOOL], json: true });
    expect(r.ok).toBe(true);
    expect(r.message).toContain(MERGED);
    expect((r.data as { sha: string }).sha).toBe(MERGED);
    expect(merges(gh)).toHaveLength(1);
    expect(merges(gh)[0]!.params).toEqual({
      owner: "CorvidLabs",
      repo: "Corvidinho",
      pull_number: 12,
      sha: HEAD,
      merge_method: "squash",
      commit_title: "feat(x): a small thing (#12)",
    });
    // One card: the merge kind, destructive (Approve + one-time code), naming the PR and head.
    expect(asked).toHaveLength(1);
    expect(asked[0]!.kind).toBe(MUST_ASK_MERGE_KIND);
    expect(asked[0]!.class).toBe("destructive");
    expect(asked[0]!.target).toBe(`${SELF_MERGE_REPO}#12 at ${HEAD}`);
    expect(asked[0]!.text).toBe("feat(x): a small thing (#12)");
    expect(asked[0]!.title).toContain("GITHUB-7.a");
    expect(auditRows()).toEqual([
      { action: TOOL, outcome: "started" },
      { action: TOOL, outcome: "ok" },
    ]);
  });

  test("while the card waits, the live status says so (the wait line maps to the Discord thinking status)", async () => {
    const gh = greenGh();
    useFake(gh);
    const lines: string[] = [];
    setMustAskNotifier((l) => lines.push(l));
    answer("denied");
    await runPlugin({ name: TOOL, args: ARGS, nonInteractive: true, allowlist: [TOOL] });
    const wait = lines.find((l) => l.includes("waiting for the owner's OK"))!;
    expect(wait).toStartWith("[operator] GITHUB-7.a: waiting for the owner's OK on an Approve card with the one-time code");
    expect(progressFromFrame(frameFromEvent({ type: "Text", text: wait }))).toEqual({ message: MUST_ASK_WAIT_STATUS });
  });

  test("the owner's chat, /session start, /work and an ask answer may merge", async () => {
    for (const surface of ["chat", "session", "work", "ask"]) {
      ownerChat(surface);
      expect(await selfMergeCallerRefusal(process.env)).toBeNull();
      expect((await verdictFor(greenGh())).ok).toBe(true);
    }
  });

  test("the owner denies the card: nothing is merged; one `github-pr-merge:card-denied` row", async () => {
    const gh = greenGh();
    useFake(gh);
    answer("denied");
    const r = await runPlugin({ name: TOOL, args: ARGS, nonInteractive: true, allowlist: [TOOL] });
    expect(r.ok).toBe(false);
    expect(merges(gh)).toEqual([]);
    expect(auditRows()).toEqual([{ action: `${TOOL}:card-denied`, outcome: "denied" }]);
  });

  test("re-checked after the card: a PR turned back into a draft while the card waited is refused, nothing merged", async () => {
    const gh = greenGh();
    useFake(gh);
    answer(() => {
      gh.pr.draft = true;
      return "approved";
    });
    const r = await runPlugin({ name: TOOL, args: ARGS, nonInteractive: true, allowlist: [TOOL] });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("draft");
    expect(merges(gh)).toEqual([]);
    expect(auditRows()).toEqual([
      { action: TOOL, outcome: "started" },
      { action: `${TOOL}:draft`, outcome: "denied" },
    ]);
  });

  test("GitHub itself refuses the merge (405): nothing claimed; a `github-refused` denied row", async () => {
    const gh = greenGh();
    gh.merge = Object.assign(new Error("Required status check is expected"), { status: 405 });
    useFake(gh);
    answer("approved");
    const r = await runPlugin({ name: TOOL, args: ARGS, nonInteractive: true, allowlist: [TOOL] });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("nothing was merged");
    expect(auditRows().at(-1)).toEqual({ action: `${TOOL}:github-refused`, outcome: "denied" });
  });

  test("dry run: every check, no card and no merge", async () => {
    const gh = greenGh();
    useFake(gh);
    process.env.CORVIDINHO_GITHUB_DRY_RUN = "1";
    const asked = answer("approved");
    const r = await runPlugin({ name: TOOL, args: ARGS, nonInteractive: true, allowlist: [TOOL] });
    expect(r.ok).toBe(true);
    expect((r.data as { dryRun: boolean }).dryRun).toBe(true);
    expect(asked).toEqual([]);
    expect(merges(gh)).toEqual([]);
  });
});

describe("GITHUB-7.a: each refusal raises no card, merges nothing and leaves a `github-pr-merge:<reason>` denied row", () => {
  const cases: [string, (gh: Gh) => void, string][] = [
    ["draft (it never marks its own draft ready)", (gh) => (gh.pr.draft = true), "draft"],
    ["someone else's PR", (gh) => (gh.pr.user = LEIF), "foreign-author"],
    ["not one of its talk branches", (gh) => (gh.pr.head.ref = "claude/m5-github7a-self-merge"), "not-own-branch"],
    ["a talk-named branch on a fork", (gh) => (gh.pr.head.repo = { full_name: "someone/Corvidinho" }), "not-own-branch"],
    ["closed", (gh) => (gh.pr.state = "closed"), "not-open"],
    ["the head moved past the sha it was asked about", (gh) => (gh.pr.head.sha = OTHER), "head-moved"],
    ["its own token marked it ready", (gh) => gh.events.push({ event: "ready_for_review", actor: ME }), "self-marked-ready"],
    ["it opened the PR ready: no person marked it ready", (gh) => (gh.events = [{ event: "labeled", actor: LEIF }]), "not-marked-ready"],
    ["only an app marked it ready", (gh) => (gh.events = [{ event: "ready_for_review", actor: { id: 41898282, login: "some-app[bot]", type: "Bot" } }]), "not-marked-ready"],
    ["changes a gate file", (gh) => gh.files.push({ filename: ".github/workflows/ci.yml" }), "gate-path"],
    ["renames a gate file away", (gh) => gh.files.push({ filename: "docs/old-hi.md", previous_filename: "hi/github.md" }), "gate-path"],
    ["changed-file list not read whole", (gh) => (gh.pr.changed_files = 4), "files-truncated"],
    ["a reviewer requested changes", (gh) => gh.reviews.push({ user: LEIF, state: "CHANGES_REQUESTED" }), "changes-requested"],
    ["smoke missing", (gh) => (gh.runs = gh.runs.filter((r) => r.name !== "smoke")), "ci-smoke-missing"],
    ["spec-sync missing", (gh) => (gh.runs = gh.runs.filter((r) => r.name !== "spec-sync")), "ci-spec-sync-missing"],
    ["smoke failed", (gh) => (gh.runs[0]!.conclusion = "failure"), "ci-smoke-failed"],
    ["spec-sync failed", (gh) => (gh.runs[1]!.conclusion = "failure"), "ci-spec-sync-failed"],
    ["smoke still running", (gh) => Object.assign(gh.runs[0]!, { status: "in_progress", conclusion: null }), "ci-smoke-pending"],
    ["smoke passed only at another commit", (gh) => (gh.runs[0]!.head_sha = OTHER), "ci-smoke-missing"],
    ["a `smoke` from another app", (gh) => (gh.runs[0]!.app = "some-other-app"), "ci-smoke-missing"],
    ["another check failed at the head", (gh) => (gh.runs[2]!.conclusion = "failure"), "ci-red"],
    ["branch protection blocks it", (gh) => (gh.pr.mergeable_state = "blocked"), "not-mergeable"],
    ["mergeability not worked out yet", (gh) => (gh.pr.mergeable = null), "not-mergeable"],
    ["conflicts", (gh) => Object.assign(gh.pr, { mergeable: false, mergeable_state: "dirty" }), "not-mergeable"],
    ["whose token this is can't be read", (gh) => (gh.me = new Error("Resource not accessible by integration")), "token-unknown"],
  ];

  test.each(cases)("%s", async (_label, change, reason) => {
    const gh = greenGh();
    change(gh);
    useFake(gh);
    const asked = answer("approved");
    const r = await runPlugin({ name: TOOL, args: ARGS, nonInteractive: true, allowlist: [TOOL] });
    expect(r.ok).toBe(false);
    expect(r.auditDenied).toBe(reason);
    expect(r.error).toStartWith("refused (GITHUB-7.a)");
    expect(asked).toEqual([]);
    expect(merges(gh)).toEqual([]);
    expect(auditRows()).toEqual([{ action: `${TOOL}:${reason}`, outcome: "denied" }]);
  });

  test("a later approval from the same reviewer settles a change request", async () => {
    const gh = greenGh();
    gh.reviews.push({ user: LEIF, state: "CHANGES_REQUESTED" }, { user: LEIF, state: "COMMENTED" }, { user: LEIF, state: "APPROVED" });
    expect((await verdictFor(gh)).ok).toBe(true);
  });

  test("a non-Corvidinho repo: outside Corvidinho a human still merges — refused before any GitHub call", async () => {
    const gh = greenGh();
    const v = await verdictFor(gh, ["12", "--repo", "CorvidLabs/spec-sync", "--sha", HEAD]);
    expect(reasonOf(v)).toBe("not-corvidinho");
    expect(v.ok ? "" : v.result.error).toContain("a human still merges");
    expect(gh.calls).toEqual([]);
  });

  test("a PR whose base repo is not Corvidinho is refused", async () => {
    const gh = greenGh();
    gh.pr.base.repo = { full_name: "someone/elsewhere" };
    expect(reasonOf(await verdictFor(gh))).toBe("not-corvidinho");
  });

  test("usage: the head sha must be named in full", async () => {
    const gh = greenGh();
    expect(reasonOf(await verdictFor(gh, ["12", "--repo", SELF_MERGE_REPO]))).toBe("usage");
    expect(reasonOf(await verdictFor(gh, ["12", "--repo", SELF_MERGE_REPO, "--sha", HEAD.slice(0, 7)]))).toBe("usage");
    expect(reasonOf(await verdictFor(gh, ["12", "--repo", SELF_MERGE_REPO, "--sha", HEAD, "--admin"]))).toBe("usage");
    expect(gh.calls).toEqual([]);
  });

  test("the required checks are the repo's actual workflow jobs", () => {
    expect([...SELF_MERGE_CHECKS]).toEqual(["smoke", "spec-sync"]);
    const ci = Bun.file(join(import.meta.dir, "..", ".github", "workflows", "ci.yml")).text();
    const sync = Bun.file(join(import.meta.dir, "..", ".github", "workflows", "spec-sync.yml")).text();
    return Promise.all([ci, sync]).then(([a, b]) => {
      expect(a).toMatch(/^ {2}smoke:$/m);
      expect(b).toMatch(/^ {2}spec-sync:$/m);
    });
  });
});

describe("GITHUB-7.a: its own gates", () => {
  test.each([
    ".github/workflows/ci.yml",
    ".github/CODEOWNERS",
    "CODEOWNERS",
    "docs/CODEOWNERS",
    "fledge.toml",
    ".fledge/lanes/verify.toml",
    "hi/github.md",
    "HI/github.md",
    "AGENTS.md",
    "hi/AGENTS.md",
    ".trust.toml",
    "sub/.TRUST.toml",
    "bunfig.toml",
    ".specsync/config.toml",
    ".specsync/sdd.json",
    ...SELF_MERGE_CODE,
  ])("%s is a gate", (path) => {
    expect(selfMergeGatePath(path)).not.toBeNull();
  });

  test.each([
    "src/agent/execute.ts",
    "plugins/github/commands.ts",
    "specs/plugins/requirements.md",
    ".specsync/changes/x/state.json",
    ".specsync/archive/changes/x/state.json",
    "docs/hi-drafts/x.md",
    "tests/github.self-merge.test.ts",
    "README.md",
    "trust.toml",
    "docs/trust.md",
  ])("%s is not a gate", (path) => {
    expect(selfMergeGatePath(path)).toBeNull();
  });

  test("talk branches are the names Corvidinho gives its own talks", () => {
    for (const id of ["sess_09a289bc034", "work_abc123", "schedule_sched_1_run_2", "cli_0123456789abcdef0123456789abcdef"]) {
      expect(generateTalkBranchName(id)).toMatch(TALK_BRANCH_RE);
    }
    for (const ref of ["claude/x", "talk/x", "main", "talk/sess-zzzzzzzzzzzzzzzz", "chore/talk/sess-0123456789abcdef"]) {
      expect(ref).not.toMatch(TALK_BRANCH_RE);
    }
  });
});

describe("GITHUB-7.a: only the owner's own interactive runs (role re-checked in the tool layer)", () => {
  const refusals: [string, () => void, string][] = [
    ["WATCH", () => {
      ownerChat();
      process.env.CORVIDINHO_WATCH_SESSION_ID = "watch_1";
    }, "watch"],
    ["a schedule, the owner's own", () => {
      ownerChat("schedule");
      process.env.CORVIDINHO_DISCORD_SESSION_ID = "schedule_sched_1";
    }, "schedule"],
    ["a delegate worker", () => {
      ownerChat();
      process.env.CORVIDINHO_DELEGATE_DEPTH = "1";
    }, "worker"],
    ["a watch surface stamp", () => ownerChat("watch"), "watch"],
    ["the owner's own GitHub-triggered WATCH run (IDENTITY-12.a gives it the owner's other tools)", ownerWatch, "watch"],
    ["no surface stamp", () => {
      ownerChat();
      delete process.env.CORVIDINHO_ACTING_SURFACE;
    }, "surface"],
    ["a muted owner", () => {
      ownerChat();
      process.env.DISCORD_MUTED_USER_IDS = OWNER;
    }, "not-owner"],
    ["team", teamChat, "not-owner"],
    ["a local run started from inside a tool", () => {
      process.env.CORVIDINHO_PROJECT_ROOT = "/tmp/x";
    }, "spawned"],
    ["a Discord session with no role session", () => {
      process.env.CORVIDINHO_DISCORD_SESSION_ID = "sess_x";
    }, "spawned"],
  ];

  test.each(refusals)("%s is refused", async (_label, setup, code) => {
    setup();
    expect((await selfMergeCallerRefusal(process.env))?.code).toBe(code);
    const gh = greenGh();
    expect(reasonOf(await verdictFor(gh))).toBe(code);
    expect(gh.calls).toEqual([]);
  });

  test("the local CLI nothing spawned may merge", async () => {
    expect(await selfMergeCallerRefusal(process.env)).toBeNull();
  });

  test("the owner's own WATCH run passes the role gate (IDENTITY-12.a) but the tool still refuses: no GitHub call, no card, one `github-pr-merge:watch` row", async () => {
    const gh = greenGh();
    useFake(gh);
    ownerWatch();
    const asked = answer("approved");
    const r = await runPlugin({ name: TOOL, args: ARGS, nonInteractive: true, allowlist: [TOOL] });
    expect(r.ok).toBe(false);
    expect(r.auditDenied).toBe("watch");
    expect(r.error).toContain("WATCH");
    expect(gh.calls).toEqual([]);
    expect(asked).toEqual([]);
    expect(merges(gh)).toEqual([]);
    expect(auditRows()).toEqual([{ action: `${TOOL}:watch`, outcome: "denied" }]);
  });

  test("a team call stops at the role gate before the tool: no GitHub call, no card", async () => {
    const gh = greenGh();
    useFake(gh);
    teamChat();
    const asked = answer("approved");
    const r = await runPlugin({ name: TOOL, args: ARGS, nonInteractive: true, allowlist: [TOOL] });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("not allowed for your role");
    expect(gh.calls).toEqual([]);
    expect(asked).toEqual([]);
  });

  test("the catalog offers it only with the owner's self-merge grant, never to team or community", () => {
    const allowlist = new Set([TOOL]);
    const names = (o: Parameters<typeof buildOpenAiTools>[0]) => buildOpenAiTools(o).map((t) => t.function.name);
    expect(names({ tier: "code", allowlist, actingRole: "owner" })).not.toContain(TOOL);
    expect(names({ tier: "code", allowlist, actingRole: "owner", selfMerge: true })).toContain(TOOL);
    expect(names({ tier: "code", allowlist, actingRole: null, selfMerge: true })).toContain(TOOL);
    expect(names({ tier: "code", allowlist, actingRole: "team", selfMerge: true, workTask: true })).not.toContain(TOOL);
    expect(names({ tier: "code", allowlist, actingRole: "community", selfMerge: true })).not.toContain(TOOL);
    expect(names({ tier: "code", allowlist: new Set(), actingRole: "owner", selfMerge: true })).not.toContain(TOOL);
    expect(names({ tier: "read", allowlist, actingRole: "owner", selfMerge: true })).not.toContain(TOOL);
  });
});

describe("GITHUB-7.a end to end through the tool loop: offered in the owner's chat only", () => {
  function offeredIn(): Promise<{ offered: string[]; texts: string[] }> {
    const offered: string[][] = [];
    const events: AgentEvent[] = [];
    const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { tools?: { function: { name: string } }[] };
      offered.push((body.tools ?? []).map((t) => t.function.name));
      return Response.json({ choices: [{ message: { role: "assistant", content: "ok" } }] });
    };
    const exec = createTaskExecute({
      taskText: "merge my PR",
      cwd: tempDir("corvidinho-self-merge-run-"),
      env: { ...process.env, ...FAKE_LLM_ENV },
      fetchImpl,
      tier: "code",
      nonInteractive: true,
      allowlist: [TOOL],
      autonomous: false,
      projectInstructions: false,
      onEvent: (e) => events.push(e),
      maxToolRounds: 1,
    });
    return exec({ attempt: 1, signal: new AbortController().signal }).then(() => ({
      offered: offered[0] ?? [],
      texts: events.filter((e): e is Extract<AgentEvent, { type: "Text" }> => e.type === "Text").map((e) => e.text),
    }));
  }

  test("the owner's chat: offered", async () => {
    ownerChat();
    expect((await offeredIn()).offered).toContain(TOOL);
  });

  test("WATCH (the owner's own GitHub-triggered run included), the owner's schedule and team: not offered, one operator line says why", async () => {
    for (const setup of [
      () => {
        ownerChat();
        process.env.CORVIDINHO_WATCH_SESSION_ID = "watch_1";
      },
      ownerWatch,
      () => {
        ownerChat("schedule");
        process.env.CORVIDINHO_DISCORD_SESSION_ID = "schedule_sched_1";
      },
      teamChat,
    ]) {
      for (const k of KEYS) if (k.startsWith("CORVIDINHO_ACTING") || k.endsWith("SESSION_ID")) delete process.env[k];
      setup();
      const r = await offeredIn();
      expect(r.offered).not.toContain(TOOL);
      expect(r.texts.filter((t) => t.startsWith("[operator] GITHUB-7.a:"))).toHaveLength(1);
    }
  });
});

describe("GITHUB-7.a: the merge card on the bridge's card engine needs Approve + the one-time code", () => {
  test("the policy row and card kind", () => {
    expect(MUST_ASK_POLICY.merge.criterion).toBe("GITHUB-7.a");
    expect(MUST_ASK_POLICY.merge.card).toEqual({ kind: MUST_ASK_MERGE_KIND, class: "destructive" });
  });

  test("Approve alone merges nothing; Approve + the code merges once", async () => {
    const gh = greenGh();
    useFake(gh);
    process.env.CORVIDINHO_OWNER_DISCORD_ID = OWNER;
    const db = openCorvidinhoDb({ env: process.env });
    const dms: { userId: string; content: string; components?: unknown[] }[] = [];
    const cards = createApprovalCards({
      db,
      env: {},
      owner: () => ({ discordId: OWNER }),
      sendDm: async (o) => {
        dms.push(o);
        return { channelId: `dm-${o.userId}`, messageId: `m${dms.length}` };
      },
      editMessage: async () => true,
      kinds: mustAskApprovalKinds({ db }),
    });
    const handlers = {
      onComponent: async (ix: Parameters<typeof cards.press>[0]) => {
        await cards.press(ix, parseApproveCardCustomId(ix.customId)!, ix.userId === OWNER);
      },
    };
    let pressed: Promise<unknown> | null = null;
    setMustAskTestHooks({
      ttlMs: 60_000,
      pollMs: 5,
      onRequest: () => {
        pressed = (async () => {
          await cards.deliver();
          const card = dms.find((d) => d.components)!;
          const ids = ((card.components ?? []) as { components: { custom_id: string }[] }[]).flatMap((r) =>
            r.components.map((c) => c.custom_id),
          );
          const approve = ids.find((id) => id.includes(":approve:"))!;
          expect(approve).toStartWith(`cvok:${MUST_ASK_MERGE_KIND}:approve:`);
          await cardInteraction(handlers, OWNER, approve);
          await Bun.sleep(30);
          expect(merges(gh)).toEqual([]);
          await approveWithCode(handlers, dms, OWNER, approve);
        })();
      },
    });
    const r = await runPlugin({ name: TOOL, args: ARGS, nonInteractive: true, allowlist: [TOOL] });
    await pressed;
    expect(r.ok).toBe(true);
    expect(merges(gh)).toHaveLength(1);
    const card = dms.find((d) => d.components)!.content;
    expect(card).toContain("Merge its own PR — only when you ask (GITHUB-7.a)");
    expect(card).toContain(`${SELF_MERGE_REPO}#12 at ${HEAD}`);
    db.close();
  });
});
