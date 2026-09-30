/**
 * MEMORY-5 / MEMORY-6 / MEMORY-7 (#101) — person profiles keyed by the
 * declared person, per-project memory, and privacy on every surface.
 *
 * - MEMORY-5: a declared person's memory is one profile (`person:<id>`)
 *   whichever of their Discord ids they use, holding their projects,
 *   preferences and a history of decisions, asks and approvals; their role
 *   comes from the owner's people list; undeclared users keep their Discord
 *   id scope (MEMORY-ACL-1 unchanged).
 * - MEMORY-6: a project's memory is keyed by its repo (origin `owner/repo`,
 *   else the main checkout), shared by every worktree, for the owner and
 *   team (and the local CLI); community never reads or writes it.
 * - MEMORY-7: a person's memory is theirs and the owner's only (`--person`
 *   is owner-only, opaque refusal otherwise); private notes are never
 *   injected or returned unless asked for by name by that person or the
 *   owner, in a conversation.
 *
 * Temp allowlist files, a temp data dir, temp git repos; no Discord, no
 * network.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const OWNER_ID = "181969874455756800";
const TOFU = "200000000000000002"; // team
const TOFU_ALT = "200000000000000022"; // Tofu's second Discord account
const KYN = "300000000000000003"; // declared community
const STRANGER = "500000000000000005"; // undeclared
const CHAN = "600000000000000006";

const PEOPLE = `[people.tofu]
display = "Tofu"
role = "team"
discord_ids = ["${TOFU}", "${TOFU_ALT}"]

[people.kyn]
display = "Kyn"
role = "community"
discord_ids = ["${KYN}"]
`;

function fileText(people = PEOPLE): string {
  return `[discord]
channels = ["${CHAN}"]
users = []
roles = []
deny_users = []

[owner]
discord_id = "${OWNER_ID}"
display = "Leif"

${people}`;
}

const KEYS = [
  "CORVIDINHO_DATA_DIR",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_ROLE",
  "CORVIDINHO_ACTING_WORK_TASK",
  "CORVIDINHO_DISCORD_REPLY_CHANNEL_ID",
  "CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID",
  "CORVIDINHO_MEMORY_INMEM",
  "CORVIDINHO_OWNER_DISCORD_ID",
  "DISCORD_MUTED_USER_IDS",
] as const;

let saved: Record<string, string | undefined> = {};
let dir = "";
let path = "";

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  dir = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-mem-profiles-")));
  path = join(dir, "allowlist.toml");
  writeFileSync(path, fileText());
  process.env.CORVIDINHO_ALLOWLIST_FILE = path;
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

/** A Discord conversation as the bridge stamps it (chat, slash, button). */
function chat(actor: string, opts: { owner?: boolean; role?: "owner" | "team" | "community"; conversation?: boolean } = {}): void {
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = actor;
  process.env.CORVIDINHO_ACTING_IS_ADMIN = opts.owner ? "1" : "0";
  process.env.CORVIDINHO_ACTING_ROLE = opts.role ?? (opts.owner ? "owner" : "community");
  process.env.CORVIDINHO_ACTING_WORK_TASK = "0";
  process.env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID = opts.conversation === false ? "" : CHAN;
}

/** A schedule run: the creator is the actor, no conversation. */
function schedule(actor: string): void {
  chat(actor, { conversation: false });
}

/**
 * The local operator CLI with an actor set by hand: no role session, so a
 * private read shows on the operator's own terminal (MEMORY-7.a).
 */
function terminal(actor: string): void {
  for (const k of ["CORVIDINHO_ACTING_IS_ADMIN", "CORVIDINHO_ACTING_ROLE", "CORVIDINHO_DISCORD_REPLY_CHANNEL_ID"]) {
    delete process.env[k];
  }
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = actor;
}

/** The local operator CLI: no role session, no actor. */
function localCli(): void {
  for (const k of ["CORVIDINHO_ACTING_DISCORD_USER_ID", "CORVIDINHO_ACTING_IS_ADMIN", "CORVIDINHO_ACTING_ROLE", "CORVIDINHO_DISCORD_REPLY_CHANNEL_ID"]) {
    delete process.env[k];
  }
}

type Row = { id: string; ownerUserId: string; category: string; key: string; content: string };

async function run(name: string, args: string[], cwd = dir) {
  return runPlugin({ name, args, nonInteractive: true, allowlist: [], cwd, json: true });
}

async function store(category: string, key: string, content: string, extra: string[] = [], cwd = dir): Promise<Row> {
  const r = await run("memory-store", [...extra, "--category", category, "--key", key, "--content", content], cwd);
  expect(r.error).toBeUndefined();
  expect(r.ok).toBe(true);
  return r.data as Row;
}

async function recall(args: string[] = [], cwd = dir) {
  return run("memory-recall", args, cwd);
}

function rowsOf(r: { data?: unknown }): Row[] {
  return (r.data as Row[] | undefined) ?? [];
}

function contents(r: { data?: unknown }): string[] {
  return rowsOf(r).map((x) => x.content);
}

/** Seed rows straight into the store (rows from before someone was declared). */
function seed(scope: string, category: string, key: string, content: string): void {
  const db = openCorvidinhoDb({ env: process.env });
  try {
    const ts = Date.now();
    db.run(
      `INSERT INTO memories (id, owner_user_id, category, key, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), scope, category, key, content, ts, ts],
    );
  } finally {
    db.close();
  }
}

function git(cwd: string, args: string[]): string {
  const r = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${new TextDecoder().decode(r.stderr)}`);
  return new TextDecoder().decode(r.stdout).trim();
}

/** A repo with an origin remote holding credentials, one commit, and a worktree. */
function repoWithWorktree(): { repo: string; worktree: string } {
  const repo = join(dir, "demo");
  mkdirSync(repo);
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "init"]);
  git(repo, ["remote", "add", "origin", "https://x-token:ghp_secretsecretsecret@github.com/CorvidLabs/Demo.git"]);
  const worktree = join(dir, "talk-1");
  git(repo, ["worktree", "add", "-q", "-b", "talk-1", worktree]);
  return { repo, worktree };
}

describe("MEMORY-5: one profile per declared person, keyed by the person id", () => {
  test("a declared person's rows live in person:<id> and every linked Discord id reaches them", async () => {
    chat(TOFU, { role: "team" });
    const pref = await store("preference", "timezone", "Europe/Oslo, mornings");
    expect(pref.ownerUserId).toBe("person:tofu");
    await store("project", "corvidinho", "works on the Discord bridge");
    chat(TOFU_ALT, { role: "team" });
    const again = await recall(["--category", "preference"]);
    expect(contents(again)).toEqual(["Europe/Oslo, mornings"]);
    expect(contents(await recall())).toEqual(
      expect.arrayContaining(["Europe/Oslo, mornings", "works on the Discord bridge"]),
    );
  });

  test("rows stored under a Discord id before the person was declared stay theirs", async () => {
    seed(TOFU, "person", "nickname", "goes by T");
    chat(TOFU, { role: "team" });
    expect(contents(await recall())).toContain("goes by T");
    // A newer write of the same key in the profile wins; the old row is not repeated.
    await store("person", "nickname", "goes by Tofu");
    const r = rowsOf(await recall(["--category", "person"]));
    expect(r.map((x) => x.content)).toEqual(["goes by Tofu"]);
  });

  test("a Discord id declared for two people is nobody's: its rows join neither profile", async () => {
    const SHARED = "700000000000000007";
    writeFileSync(
      path,
      fileText(PEOPLE.replace(`"${TOFU_ALT}"]`, `"${TOFU_ALT}", "${SHARED}"]`).replace(`["${KYN}"]`, `["${KYN}", "${SHARED}"]`)),
    );
    seed(SHARED, "person", "x", "SHARED-ID-ROW");
    for (const who of [TOFU, KYN]) {
      chat(who, { role: who === TOFU ? "team" : "community" });
      expect(contents(await recall())).not.toContain("SHARED-ID-ROW");
    }
  });

  test("undeclared users keep their Discord-id scope (MEMORY-ACL-1)", async () => {
    chat(STRANGER);
    const row = await store("person", "name", "Stranger Danger");
    expect(row.ownerUserId).toBe(STRANGER);
    chat(KYN);
    expect(contents(await recall())).not.toContain("Stranger Danger");
  });

  test("memory-profile: role from the people list, projects, preferences, history newest first, private notes counted only", async () => {
    chat(TOFU, { role: "team" });
    await store("preference", "style", "short answers, no emoji");
    await store("project", "corvidinho", "maintains the bridge");
    await store("decision", "2026-09-01-weekly", "ship weekly");
    await Bun.sleep(3);
    await store("ask", "2026-09-02-review", "asked for a review of #65");
    await Bun.sleep(3);
    await store("approval", "2026-09-03-merge", "approved merging #36");
    await store("private", "health", "PRIVATE-TOFU-NOTE");
    // MEMORY-7.a: in a conversation the profile goes only to the asker, privately.
    const r = await runPlugin({ name: "memory-profile", args: [], nonInteractive: true, allowlist: [], cwd: dir });
    expect(r.ok).toBe(true);
    expect(JSON.stringify([r.data, r.message])).not.toContain("short answers");
    const text = r.privateText ?? "";
    expect(text).toContain("Profile: Tofu (tofu)");
    expect(text).toContain("- role: team");
    expect(text).toContain("maintains the bridge");
    expect(text).toContain("short answers, no emoji");
    expect(text.indexOf("approved merging #36")).toBeLessThan(text.indexOf("asked for a review of #65"));
    expect(text.indexOf("asked for a review of #65")).toBeLessThan(text.indexOf("ship weekly"));
    expect(text).toContain("private notes: 1");
    expect(text).not.toContain("PRIVATE-TOFU-NOTE");
    // The local CLI (no role session) shows it on the operator's own terminal.
    terminal(TOFU);
    const t = await run("memory-profile", []);
    expect(t.privateText).toBeUndefined();
    const data = t.data as { role: string; history: Row[]; privateNotes: number };
    expect(data.role).toBe("team");
    expect(data.history.map((h) => h.category)).toEqual(["approval", "ask", "decision"]);
    expect(JSON.stringify(data)).not.toContain("PRIVATE-TOFU-NOTE");
  });

  test("the role in a profile is the people list's, changed only there", async () => {
    chat(KYN);
    const r1 = await run("memory-profile", []);
    expect(r1.privateText).toContain("- role: community");
    writeFileSync(path, fileText(PEOPLE.replace('role = "community"', 'role = "team"')));
    const r2 = await run("memory-profile", []);
    expect(r2.privateText).toContain("- role: team");
    chat(STRANGER);
    const r3 = await runPlugin({ name: "memory-profile", args: [], nonInteractive: true, allowlist: [], cwd: dir });
    expect(r3.privateText).toContain("not on the owner's people list");
  });
});

describe("MEMORY-7: a person's memory is theirs and the owner's only; private notes never shown to others", () => {
  async function seedTofu(): Promise<void> {
    chat(TOFU, { role: "team" });
    await store("preference", "timezone", "TOFU-TZ");
    await store("private", "note", "TOFU-PRIVATE");
  }

  test("another person never sees it: default recall, --person by id or Discord id, profile — opaque refusal", async () => {
    await seedTofu();
    for (const who of [KYN, STRANGER]) {
      chat(who);
      expect(JSON.stringify((await recall()).data)).not.toContain("TOFU-");
      for (const ref of ["tofu", TOFU, `<@${TOFU}>`, "nobody-here"]) {
        for (const args of [["--person", ref], ["--person", ref, "--category", "private"]]) {
          const r = await recall(args);
          expect(r.ok).toBe(false);
          expect(r.error).toBe("not authorized");
        }
        const p = await run("memory-profile", ["--person", ref]);
        expect(p.ok).toBe(false);
        expect(p.error).toBe("not authorized");
      }
    }
    // Team is no different (IDENTITY-10: only their own memory).
    chat(TOFU, { role: "team" });
    expect((await recall(["--person", "kyn"])).error).toBe("not authorized");
  });

  test("the owner reads a person's memory and private notes with --person; a muted owner or no bridge bit cannot", async () => {
    await seedTofu();
    chat(OWNER_ID, { owner: true });
    // MEMORY-7.a: the owner's view goes to the owner privately, never to the model.
    const r = await recall(["--person", "tofu"]);
    expect(r.ok).toBe(true);
    expect(r.privateText).toContain("TOFU-TZ");
    expect(r.privateText).not.toContain("TOFU-PRIVATE");
    expect(JSON.stringify([r.data, r.message])).not.toContain("TOFU-");
    const text = await runPlugin({ name: "memory-recall", args: ["--person", TOFU], nonInteractive: true, allowlist: [], cwd: dir });
    expect(text.privateText).toContain("Memory of Tofu (tofu) — owner view");
    expect((await recall(["--person", "tofu", "--category", "private"])).privateText).toContain("TOFU-PRIVATE");
    const p = await run("memory-profile", ["--person", "tofu"]);
    expect(p.privateText).toContain("private notes: 1");
    expect((await recall(["--person", "nobody-here"])).error).toContain("no such person");

    process.env.CORVIDINHO_ACTING_IS_ADMIN = "0";
    expect((await recall(["--person", "tofu"])).error).toBe("not authorized");
    process.env.CORVIDINHO_ACTING_IS_ADMIN = "1";
    process.env.DISCORD_MUTED_USER_IDS = OWNER_ID;
    expect((await recall(["--person", "tofu"])).error).toBe("not authorized");
  });

  test("private notes: left out of every recall unless asked for by name, only in a conversation", async () => {
    await seedTofu();
    chat(TOFU, { role: "team" });
    expect(contents(await recall())).toEqual(["TOFU-TZ"]);
    expect(contents(await recall(["--query", "TOFU"]))).toEqual(["TOFU-TZ"]);
    const mine = await runPlugin({ name: "memory-recall", args: ["--category", "private"], nonInteractive: true, allowlist: [], cwd: dir });
    expect(mine.ok).toBe(true);
    // MEMORY-7.a: shown only privately — the model gets the placeholder.
    expect(mine.privateText).toContain("TOFU-PRIVATE");
    expect(mine.message).toContain("sent privately");
    expect(mine.message).not.toContain("TOFU-PRIVATE");
    // Naming yourself with --person is your own memory.
    expect((await recall(["--person", "tofu", "--category", "private"])).privateText).toContain("TOFU-PRIVATE");
    // A schedule run (no conversation) never gets them.
    schedule(TOFU);
    const s = await recall(["--category", "private"]);
    expect(s.ok).toBe(false);
    expect(s.error).toContain("MEMORY-7");
    expect(contents(await recall())).toEqual(["TOFU-TZ"]);
  });

  test("memory-store writes only the acting person's memory (--person refused)", async () => {
    chat(OWNER_ID, { owner: true });
    const r = await run("memory-store", ["--person", "tofu", "--category", "person", "--key", "k", "v"]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("--person");
  });
});

describe("MEMORY-6: project memory keyed by the repo, for whoever works on it next", () => {
  test("keyed by origin owner/repo (no credentials kept), shared by worktrees; a plain folder by its real path", async () => {
    const { projectKeyFor, projectScopeFor } = await import("../src/memory/scope.ts");
    const { repo, worktree } = repoWithWorktree();
    expect(projectKeyFor(repo)).toBe("corvidlabs/demo");
    expect(projectKeyFor(worktree)).toBe("corvidlabs/demo");
    expect(projectScopeFor(worktree).scope).toBe("project:corvidlabs/demo");
    git(repo, ["remote", "remove", "origin"]);
    expect(projectKeyFor(worktree)).toBe(repo);
    const plain = join(dir, "plain");
    mkdirSync(plain);
    expect(projectKeyFor(plain)).toBe(plain);
  });

  test("the owner stores it, team recalls it from a worktree; community and undeclared cannot; the local CLI can", async () => {
    const { repo, worktree } = repoWithWorktree();
    chat(OWNER_ID, { owner: true });
    const row = await store("entity", "test-cmd", "run bun test before pushing", ["--project"], repo);
    expect(row.ownerUserId).toBe("project:corvidlabs/demo");
    expect(JSON.stringify(row)).not.toContain("ghp_");

    chat(TOFU, { role: "team" });
    expect(contents(await recall(["--project"], worktree))).toEqual(["run bun test before pushing"]);
    await store("entity", "gotcha", "the bridge needs a channel allowlist", ["--project"], worktree);
    // Project rows are not the person's memory, and the person's are not the project's.
    expect(contents(await recall([], worktree))).not.toContain("run bun test before pushing");

    for (const who of [KYN, STRANGER]) {
      chat(who);
      for (const r of [await recall(["--project"], repo), await run("memory-store", ["--project", "--category", "entity", "--key", "x", "y"], repo)]) {
        expect(r.ok).toBe(false);
        expect(r.error).toContain("not allowed for your role");
      }
    }
    // A declared team member on a community surface (WATCH / schedule stamp) is community.
    chat(TOFU, { role: "community" });
    expect((await recall(["--project"], repo)).ok).toBe(false);

    localCli();
    expect(contents(await recall(["--project"], repo))).toEqual(
      expect.arrayContaining(["run bun test before pushing", "the bridge needs a channel allowlist"]),
    );
  });

  test("a project has no private notes; --project and --person do not mix", async () => {
    const { repo } = repoWithWorktree();
    chat(OWNER_ID, { owner: true });
    const s = await run("memory-store", ["--project", "--category", "private", "--key", "k", "v"], repo);
    expect(s.ok).toBe(false);
    expect(s.error).toContain("MEMORY-7");
    expect((await recall(["--project", "--category", "private"], repo)).ok).toBe(false);
    expect((await recall(["--project", "--person", "tofu"], repo)).error).toContain("not both");
  });
});

describe("Discord inject: the acting person's profile, never private notes, the project for owner / team", () => {
  test("memoryInjectOptsFor + enrichPromptWithMemories", async () => {
    const { buildPeopleDirectory, parsePeopleToml } = await import("../src/identity/people.ts");
    const { MemoryStore } = await import("../src/memory/index.ts");
    const { enrichPromptWithMemories, enrichPromptWithProjectMemory, memoryInjectOptsFor, PROJECT_MEMORY_INJECT_HEADER } = await import(
      "../src/discord/memory-inject.ts"
    );
    const { repo, worktree } = repoWithWorktree();
    const people = buildPeopleDirectory(parsePeopleToml(PEOPLE), { discordId: OWNER_ID, display: "Leif" });
    const db = openCorvidinhoDb({ memory: true });
    try {
      const mem = new MemoryStore({ db });
      mem.store({ ownerUserId: "person:tofu", category: "preference", key: "tz", content: "TOFU-TZ" });
      mem.store({ ownerUserId: "person:tofu", category: "private", key: "n", content: "TOFU-PRIVATE" });
      mem.store({ ownerUserId: TOFU, category: "person", key: "old", content: "TOFU-LEGACY" });
      mem.store({ ownerUserId: "person:kyn", category: "preference", key: "tz", content: "KYN-TZ" });
      mem.store({ ownerUserId: "project:corvidlabs/demo", category: "entity", key: "cmd", content: "PROJECT-FACT" });

      const tofu = enrichPromptWithMemories("hi", mem, memoryInjectOptsFor({ userId: TOFU_ALT, people, role: "team", projectDir: worktree }));
      expect(tofu.prompt).toContain("TOFU-TZ");
      expect(tofu.prompt).toContain("TOFU-LEGACY");
      expect(tofu.prompt).not.toContain("TOFU-PRIVATE");
      expect(tofu.prompt).not.toContain("KYN-TZ");
      expect(tofu.prompt).toContain(PROJECT_MEMORY_INJECT_HEADER);
      expect(tofu.prompt).toContain("PROJECT-FACT");

      const kyn = enrichPromptWithMemories("hi", mem, memoryInjectOptsFor({ userId: KYN, people, role: "community", projectDir: repo }));
      expect(kyn.prompt).toContain("KYN-TZ");
      expect(kyn.prompt).not.toContain("TOFU-");
      expect(kyn.prompt).not.toContain("PROJECT-FACT");

      const owner = enrichPromptWithMemories("hi", mem, memoryInjectOptsFor({ userId: OWNER_ID, people, role: "owner", projectDir: repo }));
      expect(owner.prompt).toContain("PROJECT-FACT");
      expect(owner.prompt).not.toContain("TOFU-");

      // /work: only the project block, and nothing when the project has none.
      const plain = join(dir, "plain");
      mkdirSync(plain);
      const { projectScopeFor } = await import("../src/memory/scope.ts");
      expect(enrichPromptWithProjectMemory("do it", mem, projectScopeFor(repo)).prompt).toContain("PROJECT-FACT");
      const empty = enrichPromptWithProjectMemory("do it", mem, projectScopeFor(plain));
      expect(empty).toEqual({ prompt: "do it", count: 0, injected: false });
    } finally {
      db.close();
    }
  });

  test("through the bridge: each speaker's prompt holds their own profile only, no private notes, project for owner / team", async () => {
    const { startBridge, memoryThinkingOutbound } = await import("../src/discord/bridge.ts");
    const { createNullGateway } = await import("../src/discord/gateway.ts");
    const { MemoryStore } = await import("../src/memory/index.ts");
    type Handlers = import("../src/discord/gateway.ts").GatewayHandlers;
    const { repo } = repoWithWorktree();
    const db = openCorvidinhoDb({ memory: true });
    const mem = new MemoryStore({ db });
    mem.store({ ownerUserId: "person:tofu", category: "preference", key: "tz", content: "TOFU-TZ" });
    mem.store({ ownerUserId: "person:tofu", category: "private", key: "n", content: "TOFU-PRIVATE" });
    mem.store({ ownerUserId: "person:kyn", category: "preference", key: "tz", content: "KYN-TZ" });
    mem.store({ ownerUserId: "project:corvidlabs/demo", category: "entity", key: "cmd", content: "PROJECT-FACT" });
    const prompts = new Map<string, string>();
    const box: { handlers: Handlers | null } = { handlers: null };
    const result = await startBridge({
      env: { DISCORD_BOT_TOKEN: "fake", CORVIDINHO_DISCORD_DRY_RUN: "1", CORVIDINHO_ALLOWLIST_FILE: path, HOME: dir },
      projectRoot: repo,
      db,
      skipProtocolCheck: true,
      disableScheduler: true,
      thinkingOutbound: memoryThinkingOutbound(),
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent: {
        async runChat(o) {
          prompts.set(o.actingUserId ?? "", o.prompt);
          return { ok: true, sessionId: o.sessionId, summary: "done", exitCode: 0 };
        },
      },
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        handlers.reply = async () => ({ messageId: `r-${Math.random()}` });
        return createNullGateway();
      },
    });
    if (result.ok !== true || !box.handlers) throw new Error("bridge did not start");
    try {
      let n = 0;
      for (const who of [TOFU, KYN, OWNER_ID]) {
        n += 1;
        await box.handlers.onMessage({ id: `m${n}`, channelId: CHAN, authorId: who, authorBot: false, content: `<@999> hi ${n}`, mentionedBot: true });
      }
      expect(prompts.get(TOFU)).toContain("TOFU-TZ");
      expect(prompts.get(TOFU)).toContain("PROJECT-FACT");
      expect(prompts.get(TOFU)).not.toContain("TOFU-PRIVATE");
      expect(prompts.get(TOFU)).not.toContain("KYN-TZ");
      expect(prompts.get(KYN)).toContain("KYN-TZ");
      expect(prompts.get(KYN)).not.toContain("TOFU-");
      expect(prompts.get(KYN)).not.toContain("PROJECT-FACT");
      expect(prompts.get(OWNER_ID)).toContain("PROJECT-FACT");
      expect(prompts.get(OWNER_ID)).not.toContain("TOFU-");
    } finally {
      await result.stop();
      db.close();
    }
  });
});

describe("the tool-loop prompt names the rules (REQ-agent-101)", () => {
  test("profiles, project memory, privacy and forget-me", async () => {
    const { MEMORY_AGENT_SYSTEM_INSTRUCTIONS } = await import("../src/agent/execute.ts");
    for (const s of [
      "MEMORY-5",
      "project|preference|decision|ask|approval",
      "memory-profile",
      "memory-recall --project",
      "memory-store --project",
      "never tell one person what is stored about another",
      "private notes (--category private) are never injected",
      "memory-forget-me",
      "until the owner approves it on a card",
    ]) {
      expect(MEMORY_AGENT_SYSTEM_INSTRUCTIONS).toContain(s);
    }
  });
});
