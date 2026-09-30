/**
 * MEMORY-8 / MEMORY-9 (#67) — memory on Discord and GitHub, filed by person
 * or project, and a memory search before "I don't know".
 *
 * - MEMORY-8: a GitHub (WATCH) run saves and recalls for the commenter's
 *   declared person (their GitHub numeric id / login in the owner's people
 *   list; the same profile as on Discord), with MEMORY-7 privacy; an
 *   undeclared commenter gets community scope — the thread repo's project
 *   memory read-only, nothing saved. The WATCH spawn passes the commenter
 *   (REQ-watch-008 changed), a Discord spawn never does.
 * - MEMORY-9: a recall with a query is a ranked search (relevance, then
 *   recency); the Discord and WATCH injects search memory for the message;
 *   the tool loop searches memory itself when the model is about to say it
 *   doesn't know and nothing searched yet — only a hit costs a model call.
 *
 * Only APIs that exist on the stacked base (#101) are used here, so each
 * test fails there on its assertions. Temp allowlist file and data dir, fake
 * LLM fetch; no Discord, no GitHub, no network.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskExecute } from "../src/agent/execute.ts";
import type { AgentEvent } from "../src/agent/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import {
  createSpawnAgentClient as createDiscordClient,
  type AgentClient as DiscordAgent,
  type AgentRunChatOpts as DiscordRunOpts,
} from "../src/discord/agent-client.ts";
import { handleWorkCommand } from "../src/discord/command-handlers/work.ts";
import { enrichPromptWithMemories, enrichPromptWithProjectMemory } from "../src/discord/memory-inject.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import type { SlashContext, SlashInteraction } from "../src/discord/slash-types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { MemoryStore } from "../src/memory/store.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { createSpawnAgentClient as createWatchClient, type AgentClient as WatchAgent } from "../src/watch/agent-client.ts";
import { startWatchPoller } from "../src/watch/poller.ts";
import type { DetectedEvent } from "../src/watch/types.ts";

const OWNER_ID = "181969874455756800";
const TOFU = "200000000000000002"; // team, GitHub tofu-dev / 4242
const KYN = "300000000000000003"; // community, GitHub kyn-gh
const CHAN = "600000000000000006";
const REPO = "CorvidLabs/Corvidinho";
const PROJECT_SCOPE = "project:corvidlabs/corvidinho";

const FILE = `[discord]
channels = ["${CHAN}"]
users = []
roles = []
deny_users = []

[github]
repos = ["${REPO}"]
users = ["tofu-dev", "kyn-gh", "stranger-gh", "0xleif"]

[owner]
discord_id = "${OWNER_ID}"
display = "Leif"
github_login = "0xleif"
github_id = "8268288"

[people.tofu]
display = "Tofu"
role = "team"
discord_ids = ["${TOFU}"]
github_logins = ["tofu-dev"]
github_ids = ["4242"]

[people.kyn]
display = "Kyn"
role = "community"
discord_ids = ["${KYN}"]
github_logins = ["kyn-gh"]
github_ids = ["6060"]
`;

const KEYS = [
  "CORVIDINHO_DATA_DIR",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_ROLE",
  "CORVIDINHO_ACTING_WORK_TASK",
  "CORVIDINHO_ACTING_CONFIRM_TOKENS",
  "CORVIDINHO_ACTING_GITHUB_LOGIN",
  "CORVIDINHO_ACTING_GITHUB_ID",
  "CORVIDINHO_ACTING_GITHUB_REPO",
  "CORVIDINHO_DISCORD_REPLY_CHANNEL_ID",
  "CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID",
  "CORVIDINHO_MEMORY_INMEM",
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_OWNER_GITHUB_LOGIN",
  "CORVIDINHO_NON_INTERACTIVE",
  "CORVIDINHO_ALLOWLIST",
  "CORVIDINHO_LLM_API_KEY",
  "CORVIDINHO_LLM_BASE_URL",
  "CORVIDINHO_LLM_MODEL",
  "CORVIDINHO_LLM_TIER",
  "OPENAI_API_KEY",
  "DISCORD_MUTED_USER_IDS",
] as const;

let saved: Record<string, string | undefined> = {};
let dir = "";

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  dir = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-mem-recall67-")));
  writeFileSync(join(dir, "allowlist.toml"), FILE);
  process.env.CORVIDINHO_ALLOWLIST_FILE = join(dir, "allowlist.toml");
  process.env.CORVIDINHO_DATA_DIR = join(dir, "data");
  clearRegistry();
  loadBuiltins();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  clearRegistry();
  rmSync(dir, { recursive: true, force: true });
});

/** A Discord conversation as the bridge stamps it. */
function discord(actor: string, role: "owner" | "team" | "community" = "community"): void {
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = actor;
  process.env.CORVIDINHO_ACTING_IS_ADMIN = role === "owner" ? "1" : "0";
  process.env.CORVIDINHO_ACTING_ROLE = role;
  process.env.CORVIDINHO_ACTING_WORK_TASK = "0";
  process.env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID = CHAN;
  process.env.CORVIDINHO_ACTING_GITHUB_LOGIN = "";
  process.env.CORVIDINHO_ACTING_GITHUB_ID = "";
  process.env.CORVIDINHO_ACTING_GITHUB_REPO = "";
}

/** A GitHub WATCH run as the WATCH spawn stamps it (REQ-watch-008 / REQ-watch-067). */
function github(login: string, id = "", repo = REPO): void {
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = "";
  process.env.CORVIDINHO_ACTING_IS_ADMIN = "0";
  process.env.CORVIDINHO_ACTING_CONFIRM_TOKENS = "";
  process.env.CORVIDINHO_NON_INTERACTIVE = "1";
  delete process.env.CORVIDINHO_ACTING_ROLE;
  process.env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID = "";
  process.env.CORVIDINHO_ACTING_GITHUB_LOGIN = login;
  process.env.CORVIDINHO_ACTING_GITHUB_ID = id;
  process.env.CORVIDINHO_ACTING_GITHUB_REPO = repo;
}

type Row = { id: string; ownerUserId: string; category: string; key: string; content: string };

async function run(name: string, args: string[]) {
  return runPlugin({ name, args, nonInteractive: true, allowlist: [], cwd: dir, json: true });
}

function contents(r: { data?: unknown }): string[] {
  return ((r.data as Row[] | undefined) ?? []).map((x) => x.content);
}

/** Rows straight from the shared DB (the store the plugins write). */
function withStore<T>(fn: (store: MemoryStore) => T): T {
  const db = openCorvidinhoDb({ env: process.env });
  try {
    return fn(new MemoryStore({ db }));
  } finally {
    db.close();
  }
}

describe("MEMORY-9 ranked recall (relevance, then recency)", () => {
  test("a question in plain words finds the fact it is about, most relevant first", () => {
    const db = openCorvidinhoDb({ memory: true });
    let t = 1_000_000;
    const store = new MemoryStore({ db, now: () => t });
    store.store({ ownerUserId: "u1", category: "preference", key: "timezone", content: "Tofu works from Europe/Oslo" });
    t += 1000;
    store.store({ ownerUserId: "u1", category: "entity", key: "release", content: "the release train leaves on Fridays" });
    t += 1000;
    store.store({ ownerUserId: "u1", category: "person", key: "pet", content: "has a cat named Miso" });
    t += 1000;
    const rows = store.recall({ ownerUserId: "u1", query: "What is Tofu's timezone?" });
    expect(rows.map((r) => r.key)).toEqual(["timezone"]);
    const two = store.recall({ ownerUserId: "u1", query: "when does the release leave, and what is the timezone" });
    expect(two.map((r) => r.key).sort()).toEqual(["release", "timezone"]);
    db.close();
  });

  test("a key hit outranks a newer passing mention; equal relevance goes to the newer row", () => {
    const db = openCorvidinhoDb({ memory: true });
    let t = 1_000_000;
    const store = new MemoryStore({ db, now: () => t });
    store.store({ ownerUserId: "u1", category: "entity", key: "deploy", content: "deploys go through the VPS runbook" });
    t += 60_000;
    store.store({ ownerUserId: "u1", category: "conversation", key: "chat-1", content: "we talked about lunch and a deploy" });
    t += 60_000;
    expect(store.recall({ ownerUserId: "u1", query: "deploy" }).map((r) => r.key)).toEqual(["deploy", "chat-1"]);
    store.store({ ownerUserId: "u1", category: "conversation", key: "chat-2", content: "we talked about lunch and a deploy" });
    t += 60_000;
    expect(store.recall({ ownerUserId: "u1", query: "deploy" }).map((r) => r.key)).toEqual(["deploy", "chat-2", "chat-1"]);
    db.close();
  });
});

describe("MEMORY-9 the Discord inject searches memory for the message", () => {
  test("an older fact the message is about is injected even when newer rows fill the block", () => {
    const db = openCorvidinhoDb({ memory: true });
    let t = 1_000_000;
    const store = new MemoryStore({ db, now: () => t });
    store.store({ ownerUserId: TOFU, category: "preference", key: "timezone", content: "Europe/Oslo" });
    for (let i = 0; i < 25; i++) {
      t += 1000;
      store.store({ ownerUserId: TOFU, category: "conversation", key: `chat-${i}`, content: `small talk ${i}` });
    }
    const out = enrichPromptWithMemories("what timezone am I in?", store, {
      ownerUserId: TOFU,
      query: "what timezone am I in?",
    } as Parameters<typeof enrichPromptWithMemories>[2]);
    expect(out.prompt).toContain("- preference/timezone: Europe/Oslo");
    expect(out.count).toBe(20);
    db.close();
  });
});

describe("MEMORY-8 memory in GitHub (WATCH) runs, by the commenter's declared person", () => {
  test("a declared commenter saves and recalls their own profile — the same one as on Discord", async () => {
    github("tofu-dev", "4242");
    const saved = await run("memory-store", ["--category", "preference", "--key", "editor", "--content", "uses helix"]);
    expect(saved.error).toBeUndefined();
    expect((saved.data as Row).ownerUserId).toBe("person:tofu");
    expect(contents(await run("memory-recall", ["--query", "which editor"]))).toEqual(["uses helix"]);
    // MEMORY-7.a: a profile is shown only privately — never in a GitHub thread.
    const profile = await run("memory-profile", []);
    expect(profile.ok).toBe(false);
    expect(profile.error).toContain("MEMORY-7.a");
    expect(JSON.stringify(profile)).not.toContain("uses helix");

    discord(TOFU, "team");
    expect(contents(await run("memory-recall", []))).toEqual(["uses helix"]);
    await run("memory-store", ["--category", "preference", "--key", "timezone", "--content", "Europe/Oslo"]);
    // A renamed login with the same numeric id is still Tofu (IDENTITY-7.a).
    github("Tofu-Renamed", "4242");
    expect(contents(await run("memory-recall", ["--query", "timezone"]))).toEqual(["Europe/Oslo"]);
  });

  test("the owner (declared by [owner] github_id) keeps their Discord-id memory on GitHub; the [owner] login alone does not", async () => {
    discord(OWNER_ID, "owner");
    await run("memory-store", ["--category", "person", "--key", "identity", "--content", "Leif is the owner"]);
    github("0xleif", "8268288");
    const r = await run("memory-recall", []);
    expect(r.error).toBeUndefined();
    expect(contents(r)).toEqual(["Leif is the owner"]);
    github("0xleif");
    expect((await run("memory-recall", [])).ok).toBe(false);
  });

  test("privacy on GitHub (MEMORY-7): no --person, no private notes, no forget-me, never another person's rows", async () => {
    discord(KYN);
    await run("memory-store", ["--category", "person", "--key", "kyn-fact", "--content", "KYN-SECRET-ISH"]);
    await run("memory-store", ["--category", "private", "--key", "note", "--content", "KYN-PRIVATE"]);
    github("kyn-gh", "6060");
    expect(contents(await run("memory-recall", []))).toEqual(["KYN-SECRET-ISH"]);
    const priv = await run("memory-recall", ["--category", "private"]);
    expect(priv.ok).toBe(false);
    expect(JSON.stringify(priv)).not.toContain("KYN-PRIVATE");
    expect((await run("memory-forget-me", [])).ok).toBe(false);

    github("tofu-dev", "4242");
    expect(JSON.stringify((await run("memory-recall", [])).data ?? [])).not.toContain("KYN-");
    for (const ref of ["kyn", KYN, "nobody-here"]) {
      const r = await run("memory-recall", ["--person", ref]);
      expect(r.ok).toBe(false);
      expect(r.error).toBe("not authorized");
    }
  });

  test("a renamed or re-used login whose numeric id differs, or with no id, is not the declared person (IDENTITY-7.a)", async () => {
    github("tofu-dev", "9999");
    const r = await run("memory-store", ["--category", "person", "--key", "x", "--content", "impostor"]);
    expect(r.ok).toBe(false);
    github("tofu-dev");
    const noId = await run("memory-store", ["--category", "person", "--key", "y", "--content", "impostor"]);
    expect(noId.ok).toBe(false);
    expect(noId.error).toContain("not on the owner's people list");
    expect(withStore((s) => s.recall({ ownerUserId: "person:tofu" }))).toEqual([]);
  });

  test("an undeclared commenter: community scope — the thread repo's project memory read-only, nothing saved", async () => {
    withStore((s) => s.store({ ownerUserId: PROJECT_SCOPE, category: "entity", key: "test-cmd", content: "bun test" }));
    withStore((s) => s.store({ ownerUserId: "project:someone/else", category: "entity", key: "other", content: "OTHER-REPO" }));
    github("stranger-gh", "777");
    const own = await run("memory-store", ["--category", "person", "--key", "me", "--content", "I am a stranger"]);
    expect(own.ok).toBe(false);
    expect(own.error).toContain("not on the owner's people list");
    expect((await run("memory-store", ["--project", "--category", "entity", "--key", "k", "--content", "v"])).ok).toBe(false);
    expect((await run("memory-recall", [])).ok).toBe(false);
    const project = await run("memory-recall", ["--project", "--query", "how do I run the tests"]);
    expect(project.error).toBeUndefined();
    expect(contents(project)).toEqual(["bun test"]);
    expect(withStore((s) => s.recall({ ownerUserId: "stranger-gh" }))).toEqual([]);
  });

  test("a Discord actor always wins over stale GitHub keys", async () => {
    discord(KYN);
    process.env.CORVIDINHO_ACTING_GITHUB_LOGIN = "tofu-dev";
    process.env.CORVIDINHO_ACTING_GITHUB_ID = "4242";
    const r = await run("memory-store", ["--category", "person", "--key", "k", "--content", "from kyn"]);
    expect((r.data as Row).ownerUserId).toBe("person:kyn");
  });
});

describe("REQ-watch-008 / REQ-watch-067 spawn env: the commenter on GitHub, never on Discord", () => {
  let bin = "";
  beforeEach(() => {
    bin = join(dir, "fake-cli.ts");
    writeFileSync(
      bin,
      'const e = process.env; console.log(`gh=[${e.CORVIDINHO_ACTING_GITHUB_LOGIN ?? "unset"}] id=[${e.CORVIDINHO_ACTING_GITHUB_ID ?? "unset"}] repo=[${e.CORVIDINHO_ACTING_GITHUB_REPO ?? "unset"}] actor=[${e.CORVIDINHO_ACTING_DISCORD_USER_ID ?? "unset"}] admin=[${e.CORVIDINHO_ACTING_IS_ADMIN ?? "unset"}]`);\n',
    );
    process.env.CORVIDINHO_ACTING_GITHUB_LOGIN = "stale-login";
    process.env.CORVIDINHO_ACTING_GITHUB_ID = "1";
    process.env.CORVIDINHO_ACTING_GITHUB_REPO = "stale/repo";
  });

  test("WATCH spawn passes the commenter's login, numeric id and the thread's repo", async () => {
    const client = createWatchClient({ bin, cwd: dir });
    const r = await client.runChat({
      prompt: "hi",
      sessionId: "w1",
      actingGithubLogin: "tofu-dev",
      actingGithubId: 4242,
      repo: REPO,
    } as Parameters<WatchAgent["runChat"]>[0]);
    expect(r.summary).toContain(`gh=[tofu-dev] id=[4242] repo=[${REPO}] actor=[] admin=[0]`);
  });

  test("Discord spawn clears inherited GitHub commenter keys", async () => {
    const client = createDiscordClient({ bin, cwd: dir });
    const r = await client.runChat({ prompt: "tick", sessionId: "schedule_x" });
    expect(r.summary).toContain("gh=[] id=[] repo=[]");
  });
});

describe("MEMORY-8/9 WATCH poller searches memory for the comment and names the commenter", () => {
  function ev(over: Partial<DetectedEvent> = {}): DetectedEvent {
    return {
      id: "comment-1",
      type: "issue_comment",
      body: "@corvid-agent what editor do I use?",
      sender: "tofu-dev",
      senderId: 4242,
      repo: REPO,
      number: 7,
      title: "setup question",
      htmlUrl: "https://example.com",
      createdAt: "2026-09-28T12:00:00Z",
      isPullRequest: false,
      ...over,
    };
  }

  test("declared commenter: their profile (searched for the comment) and the repo's project memory; undeclared: project only", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const store = new MemoryStore({ db });
    store.store({ ownerUserId: "person:tofu", category: "preference", key: "editor", content: "TOFU-HELIX" });
    store.store({ ownerUserId: "person:kyn", category: "preference", key: "editor", content: "KYN-VIM" });
    store.store({ ownerUserId: PROJECT_SCOPE, category: "entity", key: "editor-config", content: "PROJECT-EDITORCONFIG" });
    const calls: Array<Record<string, unknown>> = [];
    const agent: WatchAgent = {
      async runChat(opts) {
        calls.push(opts as unknown as Record<string, unknown>);
        return { ok: true, sessionId: opts.sessionId, summary: "ok", exitCode: 0 };
      },
    };
    let round = 0;
    const result = await startWatchPoller({
      env: {
        GITHUB_TOKEN: "fake",
        CORVIDINHO_WATCH_USERNAME: "corvid-agent",
        CORVIDINHO_WATCH_DRY_RUN: "1",
        HOME: dir,
      },
      filePath: join(dir, "allowlist.toml"),
      runLoop: false,
      agent,
      db,
      log: () => {},
      fetchEvents: async () => {
        round += 1;
        return round === 1
          ? [ev()]
          : [ev({ id: "comment-2", sender: "stranger-gh", senderId: 777, number: 8 })];
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    try {
      await result.pollOnce();
      await result.pollOnce();
    } finally {
      await result.stop();
    }
    expect(calls).toHaveLength(2);
    const tofu = calls[0]!;
    expect(tofu.prompt).toContain("TOFU-HELIX");
    expect(tofu.prompt).toContain("PROJECT-EDITORCONFIG");
    expect(tofu.prompt).not.toContain("KYN-VIM");
    expect(tofu).toMatchObject({ actingGithubLogin: "tofu-dev", actingGithubId: 4242, repo: REPO });
    const stranger = calls[1]!;
    expect(stranger.prompt).toContain("PROJECT-EDITORCONFIG");
    expect(stranger.prompt).not.toContain("TOFU-HELIX");
    expect(stranger.prompt).not.toContain("KYN-VIM");
    expect(stranger).toMatchObject({ actingGithubLogin: "stranger-gh", repo: REPO });
    db.close();
  });
});

describe("MEMORY-9 /work: the project block is searched for the description", () => {
  function git(cwd: string, args: string[]): void {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  }

  test("an older project fact the description is about reaches the /work run although newer rows fill the block", async () => {
    const repo = join(dir, "demo");
    mkdirSync(repo);
    git(repo, ["init", "-q", "-b", "main"]);
    git(repo, ["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "init"]);
    git(repo, ["remote", "add", "origin", "https://github.com/CorvidLabs/Demo.git"]);
    const db = openCorvidinhoDb({ memory: true });
    let t = 1_000_000;
    const memoryStore = new MemoryStore({ db, now: () => t });
    memoryStore.store({ ownerUserId: "project:corvidlabs/demo", category: "entity", key: "deploy-script", content: "DEPLOY-FACT: scripts/deploy.sh needs --dry-run first" });
    for (let i = 0; i < 25; i++) {
      t += 1000;
      memoryStore.store({ ownerUserId: "project:corvidlabs/demo", category: "entity", key: `note-${i}`, content: `unrelated note ${i}` });
    }
    // The helper the handler uses, directly …
    const direct = enrichPromptWithProjectMemory("go", memoryStore, { scope: "project:corvidlabs/demo", key: "corvidlabs/demo" }, 20, "fix the flaky deploy script");
    expect(direct.prompt).toContain("DEPLOY-FACT");
    expect(direct.count).toBe(20);

    // … and through the owner's /work.
    const seen: DiscordRunOpts[] = [];
    const agent: DiscordAgent = {
      runChat: async (o) => {
        seen.push(o);
        return { ok: true, sessionId: o.sessionId, summary: "did it", exitCode: 0, task: { verified: true, verifySkipped: false, state: "done" } };
      },
    };
    const allow = emptyConfig();
    allow.discord.channels = [CHAN];
    allow.sourcePath = join(dir, "allowlist.toml");
    const ctx: SlashContext = {
      store: new SessionStore({ defaultProjectRoot: repo }),
      workStore: new WorkStore(),
      allowlist: allow,
      agent,
      version: "0.0.0",
      protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
      startedAt: Date.now(),
      channelIds: [CHAN],
      openWorkPr: async () => ({ opened: false, reason: "not-allowed", line: "PR: fixture line" }),
      owner: { discordId: OWNER_ID, display: "Leif" },
      memoryStore,
    };
    const interaction: SlashInteraction = {
      id: "ix",
      commandName: "work",
      channelId: CHAN,
      userId: OWNER_ID,
      options: { description: "fix the flaky deploy script" },
      reply: async () => {},
      deferReply: async () => {},
      editReply: async () => {},
    };
    try {
      await handleWorkCommand(ctx, interaction);
      expect(seen).toHaveLength(1);
      expect(seen[0]!.prompt).toContain("DEPLOY-FACT");
    } finally {
      db.close();
    }
  });
});

describe("MEMORY-9 the tool loop searches memory before \"I don't know\"", () => {
  type Reply = { content?: string | null; tool?: { name: string; argv: string[] } };

  function fakeLlm(replies: Reply[]) {
    const bodies: Array<{ messages: Array<{ role: string; content: unknown }> }> = [];
    const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")));
      const r = replies[Math.min(bodies.length - 1, replies.length - 1)]!;
      const message = r.tool
        ? {
            role: "assistant",
            content: r.content ?? null,
            tool_calls: [{ id: `c${bodies.length}`, type: "function", function: { name: r.tool.name, arguments: JSON.stringify({ argv: r.tool.argv }) } }],
          }
        : { role: "assistant", content: r.content ?? "" };
      return new Response(JSON.stringify({ choices: [{ message }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    return { fetchImpl, bodies };
  }

  function llmEnv(): void {
    process.env.CORVIDINHO_LLM_API_KEY = "test-key";
    process.env.CORVIDINHO_LLM_BASE_URL = "https://llm.test/v1";
    process.env.CORVIDINHO_LLM_MODEL = "test-model";
    process.env.CORVIDINHO_LLM_TIER = "tool";
  }

  async function execute(taskText: string, replies: Reply[]) {
    llmEnv();
    const { fetchImpl, bodies } = fakeLlm(replies);
    const events: AgentEvent[] = [];
    const exec = createTaskExecute({
      taskText,
      env: process.env,
      fetchImpl,
      tier: "tool",
      cwd: dir,
      projectInstructions: false,
      onEvent: (e) => events.push(e),
      maxToolRounds: 4,
    });
    const result = await exec({ attempt: 1, signal: new AbortController().signal });
    return { result, bodies, events };
  }

  test("about to say it doesn't know: memory is searched, and the fact found goes back to the model once", async () => {
    discord(KYN);
    await run("memory-store", ["--category", "person", "--key", "tofu", "--content", "Tofu is the release captain"]);
    const { result, bodies, events } = await execute("who is Tofu?", [
      { content: "I don't know who Tofu is." },
      { content: "Tofu is the release captain." },
    ]);
    expect(bodies).toHaveLength(2);
    expect(JSON.stringify(bodies[1]!.messages)).toContain("Tofu is the release captain");
    expect(result.summary).toBe("Tofu is the release captain.");
    expect(events.some((e) => e.type === "ToolCall" && e.name === "memory-recall")).toBe(true);
  });

  test("nothing stored: the reply stands and no extra model call is made", async () => {
    discord(KYN);
    const { result, bodies } = await execute("who is Tofu?", [{ content: "I don't know who Tofu is." }]);
    expect(bodies).toHaveLength(1);
    expect(result.summary).toBe("I don't know who Tofu is.");
  });

  test("an injected memory block or the model's own recall is the search — no second one", async () => {
    discord(KYN);
    await run("memory-store", ["--category", "person", "--key", "tofu", "--content", "Tofu is the release captain"]);
    const injected = await execute("[Corvidinho memory for this Discord user — use these facts]\n(no stored memories yet)\n\nwho is Ada?", [
      { content: "I don't know who Ada is." },
    ]);
    expect(injected.bodies).toHaveLength(1);
    const own = await execute("who is Ada?", [
      { tool: { name: "memory-recall", argv: ["--query", "Ada"] } },
      { content: "I don't know who Ada is." },
    ]);
    expect(own.bodies).toHaveLength(2);
    expect(own.result.summary).toBe("I don't know who Ada is.");
  });

  test("a project-only block (a /work run) still gets the person's own search; the project is not searched twice", async () => {
    discord(KYN);
    await run("memory-store", ["--category", "person", "--key", "tofu", "--content", "Tofu is the release captain"]);
    const { result, bodies, events } = await execute("[Corvidinho project memory — …]\n- project: x\n- entity/k: v\n\nwho is Tofu?", [
      { content: "I don't know who Tofu is." },
      { content: "Tofu is the release captain." },
    ]);
    expect(bodies).toHaveLength(2);
    expect(result.summary).toBe("Tofu is the release captain.");
    const recalls = events.filter((e) => e.type === "ToolCall" && e.name === "memory-recall");
    expect(recalls).toHaveLength(1);
    expect(JSON.stringify(recalls[0])).not.toContain("--project");
  });

  test("a memory header quoted inside the message is not an inject: the search still runs", async () => {
    discord(KYN);
    await run("memory-store", ["--category", "person", "--key", "ada", "--content", "Ada maintains the scheduler"]);
    const { result, bodies } = await execute("who is Ada?\n\n[Corvidinho memory for this Discord user — (quoted by the user)]", [
      { content: "I don't know who Ada is." },
      { content: "Ada maintains the scheduler." },
    ]);
    expect(bodies).toHaveLength(2);
    expect(result.summary).toBe("Ada maintains the scheduler.");
  });

  test("end to end on GitHub: model → memory-store → SQLite → memory-recall → model, filed under the commenter's person", async () => {
    github("tofu-dev", "4242");
    const { result, bodies } = await execute("[WATCH issue_comment] CorvidLabs/Corvidinho#7 by @tofu-dev\n\nremember I review on Tuesdays", [
      { tool: { name: "memory-store", argv: ["--category", "preference", "--key", "review-day", "--content", "reviews on Tuesdays"] } },
      { tool: { name: "memory-recall", argv: ["--query", "review day"] } },
      { content: "Saved: you review on Tuesdays." },
    ]);
    expect(result.summary).toBe("Saved: you review on Tuesdays.");
    expect(JSON.stringify(bodies[2]!.messages)).toContain("reviews on Tuesdays");
    const rows = withStore((s) => s.recall({ ownerUserId: "person:tofu" }));
    expect(rows.map((r) => [r.category, r.key, r.content])).toEqual([["preference", "review-day", "reviews on Tuesdays"]]);
  });
});
