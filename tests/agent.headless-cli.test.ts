/**
 * AGENT-13 / AGENT-13.a (REQ-agent-179, REQ-agent-1301): a headless agent CLI
 * can be one of my models (`cli:<command>`), in my own runs only, with the
 * same tools as my other models, inside that talk's own worktree; other runs
 * skip it and use my next model.
 *
 * A stand-in CLI (a shell script on a temp PATH, never a real agent CLI)
 * records its argv, cwd, the env keys that matter and its stdin to a log
 * outside the worktree, then does what each test needs (answer, edit files,
 * touch protected files, fail). Temp git projects and talk worktrees made by
 * the product's own `ensureTalkWorkspace`, a temp allowlist file, an
 * injected fake chat provider, a temp data dir; no network, no real tokens.
 */
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CLI_ENV_PASS_ENV,
  CLI_SKIP_WHY,
  cliChildEnv,
  cliPassKeys,
  cliTurnGate,
  cliTurnPrompt,
  cliUsage,
  isCliProtectedPath,
  parseCliOutput,
} from "../src/agent/headless-cli.ts";
import { releaseCloudStandIns } from "../src/agent/verify.ts";
import { createTaskExecute, loadLlmEnv } from "../src/agent/execute.ts";
import { runTask } from "../src/agent/loop.ts";
import {
  cliArgv,
  cliProviderId,
  entryLabel,
  modelFallbackFromUnknown,
  modelIdOfLabel,
  parseModelEntry,
  providerId,
  resolveEntry,
} from "../src/agent/providers.ts";
import {
  configuredProviderIds,
  parseSpendCaps,
  PROVIDER_SPEND_CAPS_ENV,
  readSpendSnapshot,
  setSpendCardTestHooks,
  SPEND_CAP_ENV,
} from "../src/agent/spend.ts";
import { modelForTier } from "../src/agent/tier.ts";
import type { AgentEvent, AgentTokenUsage, ExecuteResult, ModelFallback } from "../src/agent/types.ts";
import { DELEGATE_DEPTH_ENV } from "../src/autonomous/delegate.ts";
import { ApprovalStore } from "../src/approvals/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { resolveReviewer } from "../src/work/review.ts";
import { ensureTalkWorkspace } from "../src/worktree/manager.ts";
import { LANE_PASS_OUTPUT } from "./fixtures/lane-output.ts";
import { gitIn, makeProject } from "./fixtures/talk-worktree.ts";

const OWNER = "181969874455756800";
const TEAM = "200000000000000002";
const SID = "sess_agent13a_talk";
const CLI = "cli:fakecli --print";
const LLM = "gpt-x";

const temps: string[] = [];
let savedWorktreeBase: string | undefined;

function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}

afterEach(() => {
  setSpendCardTestHooks({});
});

afterAll(() => {
  if (savedWorktreeBase === undefined) delete process.env.WORKTREE_BASE_DIR;
  else process.env.WORKTREE_BASE_DIR = savedWorktreeBase;
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

savedWorktreeBase = process.env.WORKTREE_BASE_DIR;
delete process.env.WORKTREE_BASE_DIR;

type Talk = {
  base: string;
  project: string;
  /** The talk worktree (the run's cwd). */
  work: string;
  bin: string;
  allowlist: string;
  /** The stand-in CLI's log (outside the worktree). */
  log: string;
};

/**
 * A git project with app.ts, fledge.toml and specs/agent/x.md committed, and
 * the owner's talk worktree of it.
 */
async function makeTalk(): Promise<Talk> {
  const base = tempDir("corvidinho-agent13a-");
  const project = makeProject(base);
  writeFileSync(join(project, "fledge.toml"), "[lanes.verify]\nsteps = [\"test\"]\n");
  mkdirSync(join(project, "specs", "agent"), { recursive: true });
  writeFileSync(join(project, "specs", "agent", "x.md"), "# spec x\n");
  gitIn(project, "add", "fledge.toml", "specs");
  gitIn(project, "commit", "-q", "-m", "infra");
  const made = await ensureTalkWorkspace({ projectWorkingDir: project, sessionId: SID });
  if (!made.ok || made.workspace.kind !== "worktree") throw new Error("no talk worktree");
  const allowlist = join(base, "allowlist.toml");
  writeFileSync(
    allowlist,
    `[discord]\nchannels = ["600000000000000006"]\ndeny_users = []\n\n[owner]\ndiscord_id = "${OWNER}"\ndisplay = "Leif"\n\n[people.tofu]\ndisplay = "Tofu"\nrole = "team"\ndiscord_ids = ["${TEAM}"]\n`,
  );
  const bin = join(base, "bin");
  mkdirSync(bin);
  return { base, project, work: made.workspace.workDir, bin, allowlist, log: join(base, "cli.log") };
}

/** Keys the stand-in CLI reports (value or `unset`). */
const REPORTED_KEYS = [
  "GH_TOKEN",
  "ANTHROPIC_API_KEY",
  "CORVIDINHO_LLM_API_KEY",
  "FAKE_CLI_KEY",
  "AWS_SECRET_ACCESS_KEY",
  "DISCORD_TOKEN",
  "CORVIDINHO_AUDIT_HMAC_KEY",
  "CORVIDINHO_PROJECT_ROOT",
  "GIT_CONFIG_GLOBAL",
  "KUBECONFIG",
];

const ANSWER = `printf '%s\\n' '{"type":"result","result":"cli did it","usage":{"input_tokens":12,"cache_read_input_tokens":3,"output_tokens":5}}'`;

/** Write the stand-in `fakecli` into the talk's bin dir: log, then `body`. */
function fakeCli(t: Talk, body: string = ANSWER): void {
  const tool = join(t.bin, "fakecli");
  const report = REPORTED_KEYS.map((k) => `  eval "v=\\\${${k}-unset}"; printf '%s=%s\\n' '${k}' "$v"`).join("\n");
  writeFileSync(
    tool,
    `#!/bin/sh
{
  printf 'argv: %s\\n' "$*"
  printf 'cwd: %s\\n' "$(pwd -P)"
${report}
  printf -- '--- stdin\\n'
  cat
  printf -- '\\n--- end\\n'
} >> '${t.log}'
${body}
`,
  );
  chmodSync(tool, 0o755);
}

function cliLog(t: Talk): string {
  return existsSync(t.log) ? readFileSync(t.log, "utf8") : "";
}

/** The owner's own chat in their talk, as the Discord spawn client stamps it. */
function ownerEnv(t: Talk, extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    HOME: t.base,
    PATH: `${t.bin}:${process.env.PATH ?? ""}`,
    ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
    CORVIDINHO_DATA_DIR: join(t.base, "data"),
    CORVIDINHO_ALLOWLIST_FILE: t.allowlist,
    CORVIDINHO_OWNER_DISCORD_ID: OWNER,
    CORVIDINHO_ACTING_IS_ADMIN: "1",
    CORVIDINHO_ACTING_DISCORD_USER_ID: OWNER,
    CORVIDINHO_ACTING_ROLE: "owner",
    CORVIDINHO_ACTING_WORK_TASK: "0",
    CORVIDINHO_DISCORD_SESSION_ID: SID,
    CORVIDINHO_ACTING_SURFACE: "chat",
    CORVIDINHO_LLM_MODEL: `${CLI},${LLM}`,
    CORVIDINHO_LLM_API_KEY: "llm-key-not-real",
    GH_TOKEN: "gh-token-not-real",
    ANTHROPIC_API_KEY: "anthropic-key-not-real",
    FAKE_CLI_KEY: "pass-through-value",
    AWS_SECRET_ACCESS_KEY: "aws-secret-not-real",
    DISCORD_TOKEN: "discord-token-not-real",
    CORVIDINHO_AUDIT_HMAC_KEY: "audit-key-not-real",
    [CLI_ENV_PASS_ENV]: "FAKE_CLI_KEY, GH_TOKEN, AWS_SECRET_ACCESS_KEY, DISCORD_TOKEN, CORVIDINHO_AUDIT_HMAC_KEY",
  };
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env;
}

/** A team member's chat in the same talk. */
function teamEnv(t: Talk, extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return ownerEnv(t, {
    CORVIDINHO_ACTING_IS_ADMIN: "0",
    CORVIDINHO_ACTING_DISCORD_USER_ID: TEAM,
    CORVIDINHO_ACTING_ROLE: "team",
    ...extra,
  });
}

/** A local `task run` (no role session). */
function localEnv(t: Talk): NodeJS.ProcessEnv {
  return ownerEnv(t, {
    CORVIDINHO_ACTING_IS_ADMIN: undefined,
    CORVIDINHO_ACTING_DISCORD_USER_ID: undefined,
    CORVIDINHO_ACTING_ROLE: undefined,
    CORVIDINHO_ACTING_WORK_TASK: undefined,
    CORVIDINHO_DISCORD_SESSION_ID: undefined,
    CORVIDINHO_ACTING_SURFACE: undefined,
  });
}

type Seen = {
  events: AgentEvent[];
  models: string[];
  usage: { model: string; usage: AgentTokenUsage }[];
  hops: ModelFallback[];
  /** `body.model` of each chat request the fake provider got. */
  llmCalls: string[];
};

/** Fake chat provider: `gpt-bad` answers HTTP 500, anything else a plain reply. */
function fakeChat(seen: Seen) {
  return async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
    seen.llmCalls.push(body.model ?? "");
    if (body.model === "gpt-bad") return new Response("server down", { status: 500 });
    return Response.json({
      choices: [{ message: { role: "assistant", content: `llm answered (${body.model})` } }],
      usage: { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 },
    });
  };
}

function makeExecute(
  t: Talk,
  env: NodeJS.ProcessEnv,
  o: { cwd?: string; tier?: "read" | "tool" | "code"; allowlist?: string[]; talkWorktree?: string } = {},
) {
  const seen: Seen = { events: [], models: [], usage: [], hops: [], llmCalls: [] };
  const exec = createTaskExecute({
    taskText: "fix app.ts",
    cwd: o.cwd ?? t.work,
    env,
    fetchImpl: fakeChat(seen),
    tier: o.tier ?? "code",
    nonInteractive: true,
    allowlist: o.allowlist ?? ["shell-exec"],
    autonomous: false,
    loadPlugins: false,
    projectInstructions: false,
    personaRoot: t.base,
    maxToolRounds: 2,
    citeOpenPrs: false,
    coverageLookup: async () => ({ hiIds: [], prs: [], searched: true }),
    ...(o.talkWorktree ? { talkWorktree: o.talkWorktree } : {}),
    onEvent: (e) => seen.events.push(e),
    onModel: (m) => seen.models.push(m),
    onUsage: (_totals, detail) => {
      const row = detail.byModel.find((r) => r.model === detail.model);
      if (row) {
        const { promptTokens, completionTokens, totalTokens } = row;
        seen.usage.push({ model: detail.model, usage: { promptTokens, completionTokens, totalTokens } });
      }
    },
    onModelFallback: (h) => seen.hops.push(h),
  });
  const attempt = (n = 1, verifyFeedback?: string): Promise<ExecuteResult> =>
    exec({ attempt: n, signal: new AbortController().signal, ...(verifyFeedback ? { verifyFeedback } : {}) });
  return { exec, attempt, seen };
}

const texts = (events: AgentEvent[]) =>
  events.filter((e) => e.type === "Text").map((e) => (e as { text: string }).text);

const SKIP_NOTE = (why: string, to = LLM) =>
  `(model fallback: ${CLI} skipped (${why}), fell back to ${to})`;

describe("AGENT-13: the cli kind in the model list", () => {
  test("parse, label, argv, provider id and endpoint-free resolve", () => {
    const e = parseModelEntry("  CLI:fakecli    --print   -x ");
    expect(e).toEqual({ kind: "cli", model: "fakecli --print -x" });
    expect(entryLabel(e!)).toBe("cli:fakecli --print -x");
    expect(cliArgv(e!)).toEqual(["fakecli", "--print", "-x"]);
    expect(cliProviderId(parseModelEntry("cli:/opt/Tools/FakeCLI -p")!)).toBe("cli:fakecli");
    expect(parseModelEntry("cli:")).toBeNull();
    const r = resolveEntry(e!, { OPENAI_API_KEY: "k", ANTHROPIC_API_KEY: "k" });
    expect(r.usable).toBe(true);
    expect(r.apiKey).toBeUndefined();
    expect(r.keyEnv).toBeNull();
    expect(providerId(r)).toBe("cli:fakecli");
  });

  test("never priced: its model id is its whole label (cli:gpt-5 is not gpt-5), and a provider cap may name it", () => {
    expect(modelIdOfLabel("cli:gpt-5")).toBe("cli:gpt-5");
    expect(modelIdOfLabel("anthropic:claude-sonnet-5")).toBe("claude-sonnet-5");
    expect(modelForTier({ CORVIDINHO_LLM_MODEL: "cli:gpt-5 -p,gpt-4.1" }, "code")).toBe("cli:gpt-5 -p");
    const env = { CORVIDINHO_LLM_MODEL: `${CLI},${LLM}`, [PROVIDER_SPEND_CAPS_ENV]: "cli:fakecli=2" };
    expect(configuredProviderIds(env).has("cli:fakecli")).toBe(true);
    expect(parseSpendCaps(env)).toEqual({ kind: "caps", totalMicroUsd: null, providers: new Map([["cli:fakecli", 2_000_000]]) });
  });

  test("--help and .env.example name the cli: kind and CORVIDINHO_LLM_CLI_ENV (REQ-cli-079)", async () => {
    const repo = join(import.meta.dir, "..");
    const help = Bun.spawn(["bun", "--no-env-file", join(repo, "src", "cli.ts"), "--help"], {
      cwd: repo,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}) },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out] = await Promise.all([new Response(help.stdout).text(), help.exited]);
    expect(out).toContain("anthropic:<model> or a\n");
    expect(out).toContain("cli:<program> [args]");
    expect(out).toContain(CLI_ENV_PASS_ENV);
    const example = readFileSync(join(repo, ".env.example"), "utf8");
    expect(example).toContain("kind = openai | ollama | anthropic | cli");
    expect(example).toContain(`# ${CLI_ENV_PASS_ENV}=`);
    expect(example).not.toContain("All kinds use the");
  }, 30_000);

  test("the configured model the bridge shows and doctor / /status price-check is the cli entry's whole label", () => {
    // `cli:gpt-4o` is a program named gpt-4o, never the priced chat model gpt-4o.
    const total = { CORVIDINHO_LLM_MODEL: "cli:gpt-4o", [SPEND_CAP_ENV]: "5", CORVIDINHO_DATA_DIR: tempDir("corvidinho-agent13a-snap-") };
    expect(loadLlmEnv(total, "code").model).toBe("cli:gpt-4o");
    const flagged = readSpendSnapshot({ env: total, model: loadLlmEnv(total).model });
    expect(flagged.kind === "cap" ? { model: flagged.model, priced: flagged.priced } : flagged).toEqual({
      model: "cli:gpt-4o",
      priced: false,
    });
    // A provider cap that does not name the CLI does not cover it: nothing to flag.
    const other = {
      CORVIDINHO_LLM_MODEL: `${CLI},${LLM}`,
      [PROVIDER_SPEND_CAPS_ENV]: "api.openai.com=5",
      CORVIDINHO_DATA_DIR: tempDir("corvidinho-agent13a-snap-"),
    };
    const clear = readSpendSnapshot({ env: other, model: loadLlmEnv(other).model });
    expect(clear.kind === "cap" ? clear.priced : clear).toBe(true);
  });

  test("the GITHUB-9 reviewer is never a cli entry", () => {
    const env = { CORVIDINHO_LLM_MODEL: `${CLI},${LLM}`, CORVIDINHO_LLM_API_KEY: "k" };
    expect(entryLabel(resolveReviewer(env, [])!.entry)).toBe(LLM);
    expect(resolveReviewer({ CORVIDINHO_LLM_MODEL: CLI }, [])).toBeNull();
  });

  test("a skipped hop read back from a child's result keeps `skipped`", () => {
    expect(
      modelFallbackFromUnknown([{ from: CLI, to: LLM, reason: CLI_SKIP_WHY.notOwnerWorktree, skipped: true, via: "delegate" }]),
    ).toEqual([{ from: CLI, to: LLM, reason: CLI_SKIP_WHY.notOwnerWorktree, via: "delegate", skipped: true }]);
  });

  test("output: one JSON object with a string result gives reply and usage; anything else is the reply", () => {
    expect(parseCliOutput('{"result":" ok ","usage":{"prompt_tokens":4,"completion_tokens":1}}')).toEqual({
      reply: "ok",
      usage: { promptTokens: 4, completionTokens: 1, totalTokens: 5 },
    });
    expect(cliUsage({ input_tokens: 10, cache_creation_input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 4 })).toEqual({
      promptTokens: 15,
      completionTokens: 4,
      totalTokens: 19,
    });
    expect(parseCliOutput("plain answer\n")).toEqual({ reply: "plain answer", usage: null });
    expect(parseCliOutput('{"other":1}')).toEqual({ reply: '{"other":1}', usage: null });
  });

  test("env pass-through: only the keys I name, never git / GitHub / cloud / Discord / audit keys", () => {
    expect(
      cliPassKeys({
        [CLI_ENV_PASS_ENV]:
          "ANTHROPIC_API_KEY, OPENAI_API_KEY,GH_TOKEN,GITHUB_TOKEN,SSH_AUTH_SOCK,AWS_SECRET_ACCESS_KEY,KUBECONFIG,DISCORD_TOKEN,CORVIDINHO_AUDIT_HMAC_KEY,CORVIDINHO_ACTING_ROLE,bad-name,ANTHROPIC_API_KEY",
      }),
    ).toEqual(["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]);
    expect(cliPassKeys({})).toEqual([]);
  });

  test("env pass-through only adds a key the scrub dropped: never overrides one it set (CORVIDINHO_PROJECT_ROOT)", () => {
    const env = cliChildEnv(
      {
        PATH: "/usr/bin:/bin",
        CORVIDINHO_PROJECT_ROOT: "/somewhere/else",
        ANTHROPIC_API_KEY: "anthropic-key-not-real",
        [CLI_ENV_PASS_ENV]: "CORVIDINHO_PROJECT_ROOT,ANTHROPIC_API_KEY",
      },
      "/the/talk/worktree",
    );
    try {
      expect(env.CORVIDINHO_PROJECT_ROOT).toBe("/the/talk/worktree");
      expect(env.ANTHROPIC_API_KEY).toBe("anthropic-key-not-real");
    } finally {
      releaseCloudStandIns(env);
    }
  });

  test("the prompt carries the rules every model gets: identity, untrusted content, and this repo's hi / SpecSync ways", () => {
    const prompt = cliTurnPrompt({
      taskText: "fix app.ts",
      attempt: 2,
      specBriefingBlock: "",
      personaBlock: "",
      projectBlock: "",
      identityRules: "Identity (IDENTITY-4): trust the acting block.",
      repoWays: { hi: true, sdd: true },
    });
    expect(prompt).toContain("Identity (IDENTITY-4): trust the acting block.");
    expect(prompt).toContain("Untrusted content (SAFE-12 / SAFE-13)");
    expect(prompt).toContain("never change hi/");
    expect(prompt).toContain("you cannot open or edit a change here");
    expect(prompt.indexOf("Untrusted content")).toBeLessThan(prompt.indexOf("Task:\nfix app.ts"));
    const plain = cliTurnPrompt({ taskText: "x", attempt: 1, specBriefingBlock: "", personaBlock: "", projectBlock: "" });
    expect(plain).toContain("Untrusted content (SAFE-12 / SAFE-13)");
    expect(plain).not.toContain("hi/ (AGENT-18)");
    expect(plain).not.toContain("SpecSync changes (AGENT-18)");
  });

  test("protected paths for a CLI turn: SAFE-2 infra and SpecSync lifecycle records", () => {
    for (const p of ["fledge.toml", ".fledge/lanes/v.toml", "specs/agent/x.md", ".env.local", ".specsync/changes/c1/state.json", "a.spec.md"]) {
      expect({ p, v: isCliProtectedPath(p) }).toEqual({ p, v: true });
    }
    for (const p of ["app.ts", ".specsync/changes/c1/tasks.md", "docs/x.md", "hi/agent.md"]) {
      expect({ p, v: isCliProtectedPath(p) }).toEqual({ p, v: false });
    }
  });
});

describe("AGENT-13.a gate: only my own runs, inside that talk's worktree, with the shell mine", () => {
  const gate = (t: Talk, env: NodeJS.ProcessEnv, o: Partial<Parameters<typeof cliTurnGate>[0]> = {}) =>
    cliTurnGate({
      env,
      cwd: t.work,
      tier: "code",
      maxToolRounds: 2,
      allowlist: new Set(["shell-exec"]),
      injectionTripped: false,
      ...o,
    });

  test("granted: my chat, ask answer, /session start and /work in the talk worktree, and a local task run in its own worktree", async () => {
    const t = await makeTalk();
    for (const surface of ["chat", "ask", "session", "work"]) {
      expect({ surface, v: await gate(t, ownerEnv(t, { CORVIDINHO_ACTING_SURFACE: surface })) }).toEqual({
        surface,
        v: { granted: true },
      });
    }
    expect(await gate(t, localEnv(t), { talkWorktree: t.work })).toEqual({ granted: true });
  });

  test("refused for everyone and everywhere else, with one fixed reason", async () => {
    const t = await makeTalk();
    const refusedAs = async (env: NodeJS.ProcessEnv, o: Partial<Parameters<typeof cliTurnGate>[0]> = {}) => {
      const v = await gate(t, env, o);
      expect(v.granted).toBe(false);
      return v.granted ? "" : v.why;
    };
    const notMine = CLI_SKIP_WHY.notOwnerWorktree;
    expect(await refusedAs(teamEnv(t))).toBe(notMine);
    expect(await refusedAs(ownerEnv(t, { CORVIDINHO_ACTING_IS_ADMIN: "0", CORVIDINHO_ACTING_ROLE: "community" }))).toBe(notMine);
    expect(await refusedAs(ownerEnv(t, { CORVIDINHO_WATCH_SESSION_ID: "w1" }))).toBe(notMine);
    expect(await refusedAs(ownerEnv(t, { CORVIDINHO_ACTING_SURFACE: "watch" }))).toBe(notMine);
    expect(await refusedAs(ownerEnv(t, { CORVIDINHO_DISCORD_SESSION_ID: `schedule_${SID}` }))).toBe(notMine);
    expect(await refusedAs(ownerEnv(t, { [DELEGATE_DEPTH_ENV]: "1" }))).toBe(notMine);
    expect(await refusedAs(ownerEnv(t), { cwd: t.project })).toBe(notMine);
    expect(await refusedAs(localEnv(t), { cwd: t.project })).toBe(notMine);
    expect(await refusedAs(localEnv(t))).toBe(notMine);
    expect(await refusedAs(ownerEnv(t), { allowlist: new Set(["files-write"]) })).toBe(CLI_SKIP_WHY.noShell);
    expect(await refusedAs(ownerEnv(t), { tier: "tool" })).toBe(CLI_SKIP_WHY.notCodeTier);
    expect(await refusedAs(ownerEnv(t), { maxToolRounds: 0 })).toBe(CLI_SKIP_WHY.notCodeTier);
    expect(await refusedAs(ownerEnv(t), { injectionTripped: true })).toBe(CLI_SKIP_WHY.injection);
  });
});

describe("AGENT-13.a: in my own run the CLI is the model, with the shell's tools and env, in the talk worktree", () => {
  test("it runs in the worktree with the task on stdin and the scrubbed env; its reply, usage and label are the run's", async () => {
    const t = await makeTalk();
    fakeCli(t);
    const { attempt, seen } = makeExecute(t, ownerEnv(t));
    const r = await attempt();
    expect(r.error).toBeUndefined();
    expect(r.summary).toBe("cli did it");
    expect(seen.llmCalls).toEqual([]);
    expect(seen.models).toEqual([CLI]);
    expect(seen.usage).toEqual([{ model: CLI, usage: { promptTokens: 15, completionTokens: 5, totalTokens: 20 } }]);
    expect(seen.hops).toEqual([]);
    const log = cliLog(t);
    expect(log).toContain("argv: --print\n");
    expect(log).toContain(`cwd: ${t.work}\n`);
    // The shell's env (SAFE-21.a / .b, the verify-lane scrub) plus only the pass-through key I named.
    expect(log).toContain("FAKE_CLI_KEY=pass-through-value\n");
    for (const k of ["GH_TOKEN", "ANTHROPIC_API_KEY", "CORVIDINHO_LLM_API_KEY", "AWS_SECRET_ACCESS_KEY", "DISCORD_TOKEN", "CORVIDINHO_AUDIT_HMAC_KEY"]) {
      expect(log).toContain(`${k}=unset\n`);
    }
    expect(log).toContain(`CORVIDINHO_PROJECT_ROOT=${t.work}\n`);
    expect(log).toContain("GIT_CONFIG_GLOBAL=/dev/null\n");
    expect(log).toContain("KUBECONFIG=/dev/null\n");
    // The prompt: the rules, the task, the attempt.
    expect(log).toContain("headless agent CLI working in the current directory");
    expect(log).toContain("Corvidinho puts back any change to them (SAFE-2)");
    expect(log).toContain("Task:\nfix app.ts");
    expect(log).toContain("Attempt 1.");
    // SAFE-11 / SAFE-12 / SAFE-13: the identity and untrusted-content rules every model gets.
    expect(log).toContain("Identity (IDENTITY-4)");
    expect(log).toContain("Untrusted content (SAFE-12 / SAFE-13)");
    expect(texts(seen.events)).toContain(`[operator] AGENT-13.a: ${CLI} is working in this talk's worktree`);
  });

  test("protected files it changed are put back (SAFE-2 / SAFE-2.a); its other edits stay for the verify gate", async () => {
    const t = await makeTalk();
    fakeCli(
      t,
      [
        "printf 'export const x = 2;\\n' > app.ts",
        "printf 'tampered\\n' > fledge.toml",
        "rm -f specs/agent/x.md",
        "printf 'planted\\n' > specs/agent/new.md",
        "mkdir -p .fledge/lanes && printf 'weak\\n' > .fledge/lanes/verify.toml",
        "printf 'edited the app\\n'",
      ].join("\n"),
    );
    const { attempt, seen } = makeExecute(t, ownerEnv(t));
    const r = await attempt();
    expect(r.error).toBeUndefined();
    expect(readFileSync(join(t.work, "app.ts"), "utf8")).toBe("export const x = 2;\n");
    expect(readFileSync(join(t.work, "fledge.toml"), "utf8")).toBe("[lanes.verify]\nsteps = [\"test\"]\n");
    expect(readFileSync(join(t.work, "specs", "agent", "x.md"), "utf8")).toBe("# spec x\n");
    expect(existsSync(join(t.work, "specs", "agent", "new.md"))).toBe(false);
    expect(existsSync(join(t.work, ".fledge", "lanes", "verify.toml"))).toBe(false);
    expect(gitIn(t.work, "status", "--porcelain")).toBe(" M app.ts\n");
    expect(r.summary).toStartWith("edited the app\n\n(Protected files the headless agent CLI changed were put back, SAFE-2: ");
    for (const p of [".fledge/lanes/verify.toml", "fledge.toml", "specs/agent/new.md", "specs/agent/x.md"]) {
      expect(r.summary).toContain(p);
    }
    expect(texts(seen.events).some((l) => l.startsWith(`[operator] SAFE-2: ${CLI} changed protected files; put back:`))).toBe(true);
    expect(r.unreportedEditTools).toEqual([CLI]);
  });

  test("a protected file already dirty before the turn goes back to that state, not to HEAD", async () => {
    const t = await makeTalk();
    writeFileSync(join(t.work, "fledge.toml"), "owner's own edit\n");
    fakeCli(t, "printf 'cli edit\\n' > fledge.toml\nprintf 'ok\\n'");
    const { attempt } = makeExecute(t, ownerEnv(t));
    await attempt();
    expect(readFileSync(join(t.work, "fledge.toml"), "utf8")).toBe("owner's own edit\n");
  });

  test("whole runTask: the verify gate checks what the CLI changed, and a failed verify's output reaches its next turn", async () => {
    const t = await makeTalk();
    fakeCli(t, "printf 'export const x = 3;\\n' > app.ts\nprintf 'changed app\\n'");
    const { exec } = makeExecute(t, ownerEnv(t));
    const lanes: string[] = [];
    const result = await runTask({
      cwd: t.work,
      maxRetries: 1,
      execute: exec,
      verifyRunner: async (cwd) => {
        lanes.push(cwd);
        return lanes.length === 1
          ? { success: false, output: "app.ts: lane failed on purpose" }
          : { success: true, output: LANE_PASS_OUTPUT };
      },
    });
    expect(lanes).toEqual([t.work, t.work]);
    expect(result.filesChanged).toContain("app.ts");
    expect(result.verified).toBe(true);
    expect(result.attempts).toBe(2);
    const log = cliLog(t);
    expect(log).toContain("Attempt 2.");
    expect(log).toContain("app.ts: lane failed on purpose");
  });

  test("a CLI that fails falls back to my next model and says so (AGENT-11)", async () => {
    const t = await makeTalk();
    fakeCli(t, "echo 'it broke' >&2\nexit 3");
    const { attempt, seen } = makeExecute(t, ownerEnv(t));
    const r = await attempt();
    expect(r.error).toBeUndefined();
    expect(seen.llmCalls).toEqual([LLM]);
    expect(seen.hops).toEqual([{ from: CLI, to: LLM, reason: "exited 3" }]);
    expect(r.summary).toBe(`llm answered (${LLM})\n\n(model fallback: ${CLI} failed (exited 3), fell back to ${LLM})`);
    expect(texts(seen.events)).toContain(`[operator] ${CLI} failed (exited 3); falling back to ${LLM}`);
  });

  test("my next model being the CLI: a chat model that fails mid-attempt hands the attempt to it", async () => {
    const t = await makeTalk();
    fakeCli(t);
    const { attempt, seen } = makeExecute(t, ownerEnv(t, { CORVIDINHO_LLM_MODEL: `gpt-bad,${CLI}` }));
    const r = await attempt();
    expect(seen.llmCalls).toEqual(["gpt-bad"]);
    expect(cliLog(t)).toContain("Task:\nfix app.ts");
    expect(r.summary).toBe(`cli did it\n\n(model fallback: gpt-bad failed (HTTP 500), fell back to ${CLI})`);
    expect(seen.models).toEqual([CLI]);
  });

  test("spend: an unknown price under a cap asks on the unknown-price card first (SAFE-16.a); a no runs nothing", async () => {
    const t = await makeTalk();
    fakeCli(t);
    const cards: { action: string; amount: string }[] = [];
    setSpendCardTestHooks({
      ttlMs: 2_000,
      pollMs: 5,
      onRequest: (req, db) => {
        cards.push({ action: req.action, amount: req.amount ?? "" });
        new ApprovalStore({ db }).decide(req.id, "denied", { by: OWNER });
      },
    });
    const { attempt, seen } = makeExecute(t, ownerEnv(t, { [SPEND_CAP_ENV]: "5" }));
    const r = await attempt();
    expect(cards).toEqual([
      {
        action: `send one model call to ${CLI} via cli:fakecli`,
        amount: "unknown (no known price for this model; never counted as free)",
      },
    ]);
    expect(r.ask?.reason).toBe("spend-cap");
    expect(cliLog(t)).toBe("");
    expect(seen.llmCalls).toEqual([]);
  });

  test("spend: approved, exactly that turn runs and is recorded at an unknown price with its tokens", async () => {
    const t = await makeTalk();
    fakeCli(t);
    setSpendCardTestHooks({
      ttlMs: 2_000,
      pollMs: 5,
      onRequest: (req, db) => {
        new ApprovalStore({ db }).decide(req.id, "approved", { by: OWNER });
      },
    });
    const env = ownerEnv(t, { [SPEND_CAP_ENV]: "5" });
    const { attempt } = makeExecute(t, env);
    const r = await attempt();
    expect(r.summary).toBe("cli did it");
    const db = openCorvidinhoDb({ env });
    try {
      const rows = db
        .query("SELECT provider, model, status, cost_micro_usd, prompt_tokens, completion_tokens FROM spend_ledger")
        .all();
      expect(rows).toEqual([
        { provider: "cli:fakecli", model: CLI, status: "unknown", cost_micro_usd: 0, prompt_tokens: 15, completion_tokens: 5 },
      ]);
    } finally {
      db.close();
    }
  });
});

describe("AGENT-13.a: other runs skip it and use my next model, with the AGENT-11 notice", () => {
  const cases: [string, (t: Talk) => NodeJS.ProcessEnv, (t: Talk) => { cwd?: string; allowlist?: string[]; tier?: "tool" | "code" }, string][] = [
    ["a team member's chat", (t) => teamEnv(t), () => ({}), CLI_SKIP_WHY.notOwnerWorktree],
    ["my own WATCH run", (t) => ownerEnv(t, { CORVIDINHO_WATCH_SESSION_ID: "w1", CORVIDINHO_ACTING_SURFACE: "watch" }), () => ({}), CLI_SKIP_WHY.notOwnerWorktree],
    ["my schedule", (t) => ownerEnv(t, { CORVIDINHO_DISCORD_SESSION_ID: `schedule_${SID}`, CORVIDINHO_ACTING_SURFACE: "schedule" }), () => ({}), CLI_SKIP_WHY.notOwnerWorktree],
    ["a delegate worker", (t) => ownerEnv(t, { [DELEGATE_DEPTH_ENV]: "1" }), () => ({}), CLI_SKIP_WHY.notOwnerWorktree],
    ["my chat outside the talk worktree", (t) => ownerEnv(t), (t) => ({ cwd: t.project }), CLI_SKIP_WHY.notOwnerWorktree],
    ["a local task run with --here", (t) => localEnv(t), (t) => ({ cwd: t.project }), CLI_SKIP_WHY.notOwnerWorktree],
    ["my run without the shell allowlisted", (t) => ownerEnv(t), () => ({ allowlist: ["files-write"] }), CLI_SKIP_WHY.noShell],
    ["my run on the tool tier", (t) => ownerEnv(t), () => ({ tier: "tool" }), CLI_SKIP_WHY.notCodeTier],
  ];
  for (const [name, envOf, optsOf, why] of cases) {
    test(`${name}: the CLI never starts; ${LLM} answers and the reply says it was skipped`, async () => {
      const t = await makeTalk();
      fakeCli(t);
      const { attempt, seen } = makeExecute(t, envOf(t), optsOf(t));
      const r = await attempt();
      expect(cliLog(t)).toBe("");
      expect(seen.llmCalls).toEqual([LLM]);
      expect(seen.hops).toEqual([{ from: CLI, to: LLM, reason: why, skipped: true }]);
      expect(r.summary).toBe(`llm answered (${LLM})\n\n${SKIP_NOTE(why)}`);
      const lines = texts(seen.events);
      expect(lines).toContain(`[operator] ${CLI} skipped (${why}); falling back to ${LLM}`);
      expect(lines.filter((l) => l.startsWith(`[operator] AGENT-13.a: ${CLI} not run here: `))).toHaveLength(1);
      // A second attempt (a verify retry) stays on the next model; no second note.
      await attempt(2);
      expect(cliLog(t)).toBe("");
      expect(seen.llmCalls).toEqual([LLM, LLM]);
      expect(texts(seen.events).filter((l) => l.startsWith("[operator] AGENT-13.a:"))).toHaveLength(1);
    });
  }

  test("with no model after it, a skipped CLI fails the run and says why", async () => {
    const t = await makeTalk();
    fakeCli(t);
    const { attempt, seen } = makeExecute(t, teamEnv(t, { CORVIDINHO_LLM_MODEL: CLI }));
    const r = await attempt();
    expect(cliLog(t)).toBe("");
    expect(seen.llmCalls).toEqual([]);
    expect(r.error).toBe(true);
    expect(r.summary).toBe(`${CLI} was not run: ${CLI_SKIP_WHY.notOwnerWorktree} (AGENT-13.a), and no model is configured after it.`);
    expect(r.failureReason).toBe(`The model call failed (${CLI} was skipped: ${CLI_SKIP_WHY.notOwnerWorktree})`);
  });

  test("a chat model failing mid-attempt in someone else's run skips past the CLI", async () => {
    const t = await makeTalk();
    fakeCli(t);
    const { attempt, seen } = makeExecute(t, teamEnv(t, { CORVIDINHO_LLM_MODEL: `gpt-bad,${CLI},${LLM}` }));
    const r = await attempt();
    expect(cliLog(t)).toBe("");
    expect(seen.llmCalls).toEqual(["gpt-bad", LLM]);
    expect(seen.hops).toEqual([
      { from: "gpt-bad", to: CLI, reason: "HTTP 500" },
      { from: CLI, to: LLM, reason: CLI_SKIP_WHY.notOwnerWorktree, skipped: true },
    ]);
    expect(r.summary).toBe(
      `llm answered (${LLM})\n\n(model fallback: gpt-bad failed (HTTP 500), fell back to ${CLI}; ${CLI} skipped (${CLI_SKIP_WHY.notOwnerWorktree}), fell back to ${LLM})`,
    );
  });
});

// ------------------------------------------------------------ the real `task run`

const CLI_ENTRY = join(import.meta.dir, "..", "src", "cli.ts");
/** Subprocess tests can be slow on a loaded box. */
const SPAWN_T = 60_000;

/** Env keys that make a run a product child; a local `task run` has none of them. */
const CHILD_KEYS = new Set([
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ACTING_ROLE",
  "CORVIDINHO_ACTING_WORK_TASK",
  "CORVIDINHO_ACTING_SURFACE",
  "CORVIDINHO_WATCH_SESSION_ID",
  "CORVIDINHO_DISCORD_SESSION_ID",
  DELEGATE_DEPTH_ENV,
  "CORVIDINHO_PROJECT_ROOT",
  "WORKTREE_BASE_DIR",
]);

/** The spawned CLI's env, with a stand-in `fledge` whose verify lane passes and the stand-in agent CLI. */
function spawnEnv(t: Talk, extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || k.startsWith("GIT_") || CHILD_KEYS.has(k)) continue;
    env[k] = v;
  }
  const out = join(t.base, "lane-output.txt");
  writeFileSync(out, LANE_PASS_OUTPUT);
  writeFileSync(join(t.bin, "fledge"), `#!/bin/sh\ncat '${out}'\nexit 0\n`);
  chmodSync(join(t.bin, "fledge"), 0o755);
  return {
    ...env,
    HOME: t.base,
    PATH: `${t.bin}:${process.env.PATH ?? ""}`,
    CORVIDINHO_DATA_DIR: join(t.base, "data"),
    CORVIDINHO_ALLOWLIST: "shell-exec",
    CORVIDINHO_LLM_TIER: "code",
    ...extra,
  };
}

async function taskRun(cwd: string, args: string[], env: Record<string, string>) {
  const proc = Bun.spawn(["bun", CLI_ENTRY, "task", "run", ...args, "--json"], { cwd, env, stdout: "pipe", stderr: "pipe" });
  const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
  return { code, ...(JSON.parse(out) as { result: { summary: string; verified: boolean; state: string; filesChanged: string[]; workspace?: { dir: string }; model?: string; modelFallback?: ModelFallback[] }; events: AgentEvent[] }) };
}

describe("task run: my local run uses the CLI in the worktree it made; --here skips it", () => {
  test("by default the CLI works in the run's own worktree and the verify lane checks its edit", async () => {
    const t = await makeTalk();
    fakeCli(t, "printf 'export const x = 9;\\n' > app.ts\nprintf 'edited by the cli\\n'");
    const r = await taskRun(t.project, ["--task", "fix app.ts"], spawnEnv(t, { CORVIDINHO_LLM_MODEL: `${CLI},ollama:never-called`, OLLAMA_HOST: "127.0.0.1:9" }));
    const ws = r.result.workspace?.dir;
    expect(ws).toBeTruthy();
    expect(cliLog(t)).toContain(`cwd: ${ws}\n`);
    expect(r.result.summary).toBe("edited by the cli");
    expect(r.result.model).toBe(CLI);
    expect(r.result.filesChanged).toContain("app.ts");
    expect(r.result.verified).toBe(true);
    expect(r.result.state).toBe("done");
    expect(readFileSync(join(ws!, "app.ts"), "utf8")).toBe("export const x = 9;\n");
    expect(readFileSync(join(t.project, "app.ts"), "utf8")).toBe("export const x = 1;\n");
    expect(r.code).toBe(0);
  }, SPAWN_T);

  test("--here: the CLI is skipped and my next model answers", async () => {
    const t = await makeTalk();
    fakeCli(t);
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => Response.json({ choices: [{ message: { role: "assistant", content: "the next model answered" } }] }),
    });
    try {
      const r = await taskRun(
        t.project,
        ["--here", "--task", "say hi"],
        spawnEnv(t, { CORVIDINHO_LLM_MODEL: `${CLI},ollama:fake-model`, OLLAMA_HOST: `127.0.0.1:${server.port}` }),
      );
      expect(cliLog(t)).toBe("");
      expect(r.result.summary).toBe(
        `the next model answered\n\n(model fallback: ${CLI} skipped (${CLI_SKIP_WHY.notOwnerWorktree}), fell back to ollama:fake-model)`,
      );
      expect(r.result.modelFallback).toEqual([
        { from: CLI, to: "ollama:fake-model", reason: CLI_SKIP_WHY.notOwnerWorktree, skipped: true },
      ]);
    } finally {
      server.stop(true);
    }
  }, SPAWN_T);
});
