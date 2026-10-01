/**
 * MEMORY-7.a (#101) — private notes, profile reads and the owner's view of
 * someone's memory are shown only privately to that person or the owner,
 * never in a shared channel.
 *
 * - REQ-plugins-710: in a Discord conversation a private read (`memory-recall
 *   --category private`, the owner's `--person` view, `memory-profile`)
 *   returns its text in `privateText` only; `data` and `message` — all the
 *   model sees — are a "sent privately" placeholder. With nowhere private to
 *   show it (a schedule, a GitHub thread) it is refused; the local CLI (no
 *   role session) shows it on the operator's terminal as before.
 * - REQ-agent-710: the tool loop hands `privateText` to `onPrivateReply` and
 *   keeps it out of the model's messages and the ToolResult events.
 * - REQ-cli-710: `task run` puts it on the result's `privateReplies`
 *   (ndjson / json), which the Discord agent client reads back (validated).
 * - REQ-discord-710: the bridge sends it to the person who asked by direct
 *   message on chat, a button pick, an Answer form submit, `/session start`
 *   and `/work`; the channel gets only the "sent privately" note (or, when
 *   the DM did not go out, the "couldn't DM" note) and never the text; the
 *   session thread never records it.
 *
 * Every test here fails on main (private reads were returned to the model and
 * posted wherever the model repeated them). Only APIs that exist on main are
 * imported statically, so each test fails there on its own assertions (the
 * delivery-helper test imports `src/discord/private-reply.ts` itself). Temp
 * allowlist file and data dir, fake LLM, fake gateway; no Discord, no network.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createTaskExecute, MEMORY_AGENT_SYSTEM_INSTRUCTIONS } from "../src/agent/execute.ts";
import type { AgentEvent, HumanAsk } from "../src/agent/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import {
  createSpawnAgentClient,
  type AgentClient,
  type AgentRunChatOpts,
} from "../src/discord/agent-client.ts";
import { answerCustomId, ASK_ANSWER_INPUT_ID, pickCustomId } from "../src/discord/ask-buttons.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { handleSessionStart } from "../src/discord/command-handlers/session.ts";
import { handleWorkCommand } from "../src/discord/command-handlers/work.ts";
import { createNullGateway, type ComponentInteraction, type GatewayHandlers } from "../src/discord/gateway.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import type { SlashContext, SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import type { EditMessageOpts, ThinkingOutbound } from "../src/discord/thinking-status.ts";
import type { InboundMessage } from "../src/discord/types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { MemoryStore } from "../src/memory/store.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const OWNER_ID = "181969874455756800";
const TOFU = "200000000000000002"; // declared team; GitHub tofu-dev / 4242
const CHAN = "600000000000000006";
const REPO = "CorvidLabs/Corvidinho";
const CLI = resolve(import.meta.dir, "../src/cli.ts");

const FILE = `[discord]
channels = ["${CHAN}"]
users = []
roles = []
deny_users = []

[github]
repos = ["${REPO}"]
users = ["tofu-dev"]

[owner]
discord_id = "${OWNER_ID}"
display = "Leif"

[people.tofu]
display = "Tofu"
role = "team"
discord_ids = ["${TOFU}"]
github_logins = ["tofu-dev"]
github_ids = ["4242"]
`;

/** The channel notes (`PRIVATE_SENT_NOTE` / `PRIVATE_NOT_SENT_NOTE`), by a phrase each. */
const SENT_NOTE = "The private part was sent to you in a DM";
const NOT_SENT_NOTE = "I couldn't DM it to you";

/** What must never reach the model or a shared channel. */
const SECRETS = ["TOFU-TZ-SECRET", "TOFU-PRIVATE-SECRET"] as const;

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
  "CORVIDINHO_NON_INTERACTIVE",
  "CORVIDINHO_ALLOWLIST",
  "CORVIDINHO_LLM_API_KEY",
  "CORVIDINHO_LLM_BASE_URL",
  "CORVIDINHO_LLM_MODEL",
  "CORVIDINHO_LLM_TIER",
  "OPENAI_API_KEY",
  "DISCORD_MUTED_USER_IDS",
  "WORKTREE_BASE_DIR",
] as const;

let saved: Record<string, string | undefined> = {};
let dir = "";

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  dir = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-private-view-")));
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

/** A Discord conversation as the bridge stamps it (chat, slash, button). */
function discord(actor: string, owner = false): void {
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = actor;
  process.env.CORVIDINHO_ACTING_IS_ADMIN = owner ? "1" : "0";
  process.env.CORVIDINHO_ACTING_ROLE = owner ? "owner" : "team";
  process.env.CORVIDINHO_ACTING_WORK_TASK = "0";
  process.env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID = CHAN;
  process.env.CORVIDINHO_ACTING_GITHUB_LOGIN = "";
  process.env.CORVIDINHO_ACTING_GITHUB_ID = "";
  process.env.CORVIDINHO_ACTING_GITHUB_REPO = "";
}

/** A schedule run: the creator is the actor, no conversation. */
function schedule(actor: string, owner = false): void {
  discord(actor, owner);
  process.env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID = "";
}

/** A GitHub WATCH run as the WATCH spawn stamps it. */
function github(login: string, id: string): void {
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = "";
  process.env.CORVIDINHO_ACTING_IS_ADMIN = "0";
  delete process.env.CORVIDINHO_ACTING_ROLE;
  process.env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID = "";
  process.env.CORVIDINHO_ACTING_GITHUB_LOGIN = login;
  process.env.CORVIDINHO_ACTING_GITHUB_ID = id;
  process.env.CORVIDINHO_ACTING_GITHUB_REPO = REPO;
}

async function run(name: string, args: string[], json = true) {
  return runPlugin({ name, args, nonInteractive: true, allowlist: [], cwd: dir, json });
}

/** Tofu's profile: a timezone preference and a private note. */
function seedTofu(dataDir = join(dir, "data")): void {
  const db = openCorvidinhoDb({ env: { CORVIDINHO_DATA_DIR: dataDir } });
  try {
    const m = new MemoryStore({ db });
    m.store({ ownerUserId: "person:tofu", category: "preference", key: "timezone", content: "TOFU-TZ-SECRET" });
    m.store({ ownerUserId: "person:tofu", category: "private", key: "health", content: "TOFU-PRIVATE-SECRET" });
    m.store({ ownerUserId: "person:tofu", category: "person", key: "editor", content: "uses helix" });
  } finally {
    db.close();
  }
}

function expectNoSecret(value: unknown): void {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  for (const s of SECRETS) expect(text).not.toContain(s);
}

describe("memory plugins: a private read rides privateText; the model gets a placeholder (REQ-plugins-710)", () => {
  test("in a Discord conversation: own private notes, own profile, the owner's --person view and profile", async () => {
    seedTofu();
    discord(TOFU);
    const notes = await run("memory-recall", ["--category", "private"]);
    expect(notes.ok).toBe(true);
    expect(notes.privateText).toContain("TOFU-PRIVATE-SECRET");
    expect(notes.privateText).toContain("Private notes of Tofu (tofu)");
    expect(notes.data).toEqual({ sentPrivately: true, what: "private-notes" });
    expect(notes.message).toContain("sent privately (MEMORY-7.a)");
    expectNoSecret([notes.data, notes.message, notes.error]);

    const profile = await run("memory-profile", []);
    expect(profile.ok).toBe(true);
    expect(profile.privateText).toContain("Profile: Tofu (tofu)");
    expect(profile.privateText).toContain("TOFU-TZ-SECRET");
    expect(profile.privateText).not.toContain("TOFU-PRIVATE-SECRET"); // private notes counted only
    expect(profile.data).toEqual({ sentPrivately: true, what: "profile" });
    expectNoSecret([profile.data, profile.message]);

    // The person's own everyday recall still reaches the model (MEMORY-8/9).
    const own = await run("memory-recall", ["--query", "editor"]);
    expect(own.privateText).toBeUndefined();
    expect(JSON.stringify(own.data)).toContain("uses helix");

    discord(OWNER_ID, true);
    const view = await run("memory-recall", ["--person", "tofu"]);
    expect(view.ok).toBe(true);
    expect(view.privateText).toContain("Memory of Tofu (tofu) — owner view");
    expect(view.privateText).toContain("TOFU-TZ-SECRET");
    expect(view.data).toEqual({ sentPrivately: true, what: "person-view" });
    expectNoSecret([view.data, view.message]);
    const theirs = await run("memory-profile", ["--person", TOFU], false);
    expect(theirs.privateText).toContain("TOFU-TZ-SECRET");
    expectNoSecret([theirs.data, theirs.message]);
    const theirNotes = await run("memory-recall", ["--person", "tofu", "--category", "private"]);
    expect(theirNotes.privateText).toContain("TOFU-PRIVATE-SECRET");
    expectNoSecret([theirNotes.data, theirNotes.message]);
  });

  test("nowhere private to show it: a schedule and a GitHub thread refuse, and say nothing of it", async () => {
    seedTofu();
    schedule(OWNER_ID, true);
    for (const [name, args] of [
      ["memory-recall", ["--person", "tofu"]],
      ["memory-profile", ["--person", "tofu"]],
    ] as const) {
      const r = await run(name, [...args]);
      expect(r.ok).toBe(false);
      expect(r.error).toContain("MEMORY-7.a");
      expect(r.privateText).toBeUndefined();
      expectNoSecret(r);
    }
    schedule(TOFU);
    const own = await run("memory-profile", []);
    expect(own.ok).toBe(false);
    expect(own.error).toContain("never in a schedule");
    expectNoSecret(own);

    github("tofu-dev", "4242");
    const gh = await run("memory-profile", []);
    expect(gh.ok).toBe(false);
    expect(gh.error).toContain("never in a GitHub thread");
    expect(gh.privateText).toBeUndefined();
    expectNoSecret(gh);
    // Everyday recall on GitHub is unchanged (MEMORY-8).
    expect(JSON.stringify((await run("memory-recall", ["--query", "editor"])).data)).toContain("uses helix");
  });

  test("the local CLI (no role session) shows a profile on the operator's own terminal, as before", async () => {
    seedTofu();
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = TOFU;
    const r = await run("memory-profile", [], false);
    expect(r.ok).toBe(true);
    expect(r.privateText).toBeUndefined();
    expect(r.message).toContain("TOFU-TZ-SECRET");
  });
});

type Reply = { content?: string | null; tool?: { name: string; argv: string[] } };

function fakeLlm(replies: Reply[]) {
  const bodies: string[] = [];
  const answer = (n: number) => {
    const r = replies[Math.min(n - 1, replies.length - 1)]!;
    const message = r.tool
      ? {
          role: "assistant",
          content: r.content ?? null,
          tool_calls: [{ id: `c${n}`, type: "function", function: { name: r.tool.name, arguments: JSON.stringify({ argv: r.tool.argv }) } }],
        }
      : { role: "assistant", content: r.content ?? "" };
    return Response.json({ choices: [{ message }] });
  };
  const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ""));
    return answer(bodies.length);
  };
  return { fetchImpl, bodies, answer };
}

/** The model reads the profile and the private notes, then tries to repeat them. */
const READS: Reply[] = [
  { tool: { name: "memory-profile", argv: [] } },
  { tool: { name: "memory-recall", argv: ["--category", "private"] } },
  { content: "Sent your profile and notes to you privately — check your DMs." },
];

describe("the tool loop keeps private text from the model (REQ-agent-710)", () => {
  test("privateText goes to onPrivateReply, never into a model request, a tool message or a ToolResult event", async () => {
    seedTofu();
    discord(TOFU);
    process.env.CORVIDINHO_LLM_API_KEY = "test-key";
    process.env.CORVIDINHO_LLM_BASE_URL = "https://llm.test/v1";
    process.env.CORVIDINHO_LLM_MODEL = "test-model";
    process.env.CORVIDINHO_LLM_TIER = "tool";
    const { fetchImpl, bodies } = fakeLlm(READS);
    const events: AgentEvent[] = [];
    const privateReplies: string[] = [];
    const exec = createTaskExecute({
      taskText: "show me my profile and my private notes",
      env: process.env,
      fetchImpl,
      tier: "tool",
      cwd: dir,
      projectInstructions: false,
      onEvent: (e) => events.push(e),
      onPrivateReply: (t) => privateReplies.push(t),
      maxToolRounds: 4,
    });
    const result = await exec({ attempt: 1, signal: new AbortController().signal });
    expect(bodies).toHaveLength(3);
    expect(privateReplies).toHaveLength(2);
    expect(privateReplies[0]).toContain("TOFU-TZ-SECRET");
    expect(privateReplies[1]).toContain("TOFU-PRIVATE-SECRET");
    for (const b of bodies) expectNoSecret(b);
    expect(bodies[2]).toContain("sent privately (MEMORY-7.a)");
    expectNoSecret(events);
    expectNoSecret(result);
    expect(events.filter((e) => e.type === "ToolResult" && e.success)).toHaveLength(2);
  });

  test("the prompt tells the model it never sees them and to point to the DM", () => {
    expect(MEMORY_AGENT_SYSTEM_INSTRUCTIONS).toContain("Shown only privately (MEMORY-7.a)");
    expect(MEMORY_AGENT_SYSTEM_INSTRUCTIONS).toContain("you get only a \"sent privately\" result");
    expect(MEMORY_AGENT_SYSTEM_INSTRUCTIONS).toContain("profiles (memory-profile) are never read on GitHub");
  });
});

describe("task run → result frame → the Discord agent client (REQ-cli-710 / REQ-discord-710)", () => {
  test("end to end: the child's privateReplies reach the bridge; the model and the summary never had them", async () => {
    const dataDir = join(dir, "data");
    seedTofu(dataDir);
    const { bodies, answer } = fakeLlm(READS);
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: async (req) => {
        bodies.push(await req.text());
        return answer(bodies.length);
      },
    });
    try {
      const work = join(dir, "work");
      mkdirSync(work);
      const client = createSpawnAgentClient({
        bin: CLI,
        cwd: work,
        env: {
          CORVIDINHO_LLM_API_KEY: "test-key-not-real",
          OPENAI_API_KEY: "",
          CORVIDINHO_LLM_BASE_URL: `http://127.0.0.1:${server.port}/v1`,
          CORVIDINHO_LLM_MODEL: "test-model",
          CORVIDINHO_LLM_TIER: "tool",
          CORVIDINHO_DATA_DIR: dataDir,
          CORVIDINHO_ALLOWLIST_FILE: join(dir, "allowlist.toml"),
          CORVIDINHO_ALLOWLIST: "",
          HOME: dir,
        },
      });
      const r = await client.runChat({
        prompt: "show me my profile and my private notes",
        humanText: "show me my profile and my private notes",
        sessionId: "s-private",
        actingUserId: TOFU,
        actingIsAdmin: false,
        actingRole: "team",
        replyChannelId: CHAN,
      });
      expect(r.privateReplies).toHaveLength(2);
      expect(r.privateReplies![0]).toContain("TOFU-TZ-SECRET");
      expect(r.privateReplies![1]).toContain("TOFU-PRIVATE-SECRET");
      expect(r.summary).toContain("privately");
      expectNoSecret(r.summary);
      expect(bodies.length).toBeGreaterThanOrEqual(3);
      for (const b of bodies) expectNoSecret(b);
    } finally {
      server.stop(true);
    }
  }, 30_000);

  test("privateRepliesFromUnknown keeps non-empty strings only, capped", async () => {
    const { PRIVATE_REPLIES_MAX, privateRepliesFromUnknown } = await import("../src/discord/private-reply.ts");
    expect(privateRepliesFromUnknown(undefined)).toBeUndefined();
    expect(privateRepliesFromUnknown("text")).toBeUndefined();
    expect(privateRepliesFromUnknown([1, "", "  ", null])).toBeUndefined();
    expect(privateRepliesFromUnknown(["a", 2, "b"])).toEqual(["a", "b"]);
    expect(privateRepliesFromUnknown(Array.from({ length: 9 }, (_, i) => `r${i}`))).toHaveLength(PRIVATE_REPLIES_MAX);
    expect(privateRepliesFromUnknown(["x".repeat(20_000)])![0]!.length).toBe(6000);
  });

  test("task run bounds privateReplies in its own result frame: at most 5, the last says how many more were not sent", async () => {
    const dataDir = join(dir, "data");
    const db = openCorvidinhoDb({ env: { CORVIDINHO_DATA_DIR: dataDir } });
    try {
      const m = new MemoryStore({ db });
      for (let i = 1; i <= 7; i += 1) {
        m.store({ ownerUserId: "person:tofu", category: "private", key: `note${i}`, content: `PRIVATE-NOTE-${i}` });
      }
    } finally {
      db.close();
    }
    // Seven private reads, each of a different note, then a plain answer.
    const reads: Reply[] = [
      ...Array.from({ length: 7 }, (_, i) => ({
        tool: { name: "memory-recall", argv: ["--category", "private", "--query", `note${i + 1}`] },
      })),
      { content: "Sent to you privately — check your DMs." },
    ];
    const { bodies, answer } = fakeLlm(reads);
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: async (req) => {
        bodies.push(await req.text());
        return answer(bodies.length);
      },
    });
    try {
      const work = join(dir, "work");
      mkdirSync(work);
      // The child's own frame, read straight off its stdout (no client re-check).
      const { buildCorvidinhoArgv } = await import("../src/agent/spawn-argv.ts");
      const proc = Bun.spawn(
        buildCorvidinhoArgv(CLI, ["task", "run", "--here", "--task", "show all my private notes", "--output", "ndjson"]),
        {
          cwd: work,
          stdout: "pipe",
          stderr: "pipe",
          env: {
            PATH: process.env.PATH ?? "",
            HOME: dir,
            CORVIDINHO_LLM_API_KEY: "test-key-not-real",
            OPENAI_API_KEY: "",
            CORVIDINHO_LLM_BASE_URL: `http://127.0.0.1:${server.port}/v1`,
            CORVIDINHO_LLM_MODEL: "test-model",
            CORVIDINHO_LLM_TIER: "tool",
            CORVIDINHO_DATA_DIR: dataDir,
            CORVIDINHO_ALLOWLIST_FILE: join(dir, "allowlist.toml"),
            CORVIDINHO_ALLOWLIST: "",
            CORVIDINHO_NON_INTERACTIVE: "1",
            CORVIDINHO_ACTING_DISCORD_USER_ID: TOFU,
            CORVIDINHO_ACTING_IS_ADMIN: "0",
            CORVIDINHO_ACTING_ROLE: "team",
            CORVIDINHO_ACTING_WORK_TASK: "0",
            CORVIDINHO_DISCORD_REPLY_CHANNEL_ID: CHAN,
          },
        },
      );
      const [stdout] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
      const frame = stdout
        .split("\n")
        .filter((l) => l.startsWith("{"))
        .map((l) => JSON.parse(l) as { type?: string; result?: { privateReplies?: string[] } })
        .find((f) => f.type === "result");
      const replies = frame?.result?.privateReplies ?? [];
      expect(replies).toHaveLength(5);
      for (let i = 1; i <= 5; i += 1) expect(replies[i - 1]).toContain(`PRIVATE-NOTE-${i}`);
      expect(replies.join("\n")).not.toContain("PRIVATE-NOTE-6");
      expect(replies[4]).toContain("2 more private results were not sent");
      for (const b of bodies) expect(b).not.toContain("PRIVATE-NOTE-");
    } finally {
      server.stop(true);
    }
  }, 30_000);
});

describe("delivery helpers (REQ-discord-710)", () => {
  test("DM only, scrubbed, split under the DM cap; any part that does not go out is a failure, never a channel post", async () => {
    const { PRIVATE_DM_HEADER, PRIVATE_NOT_SENT_NOTE, PRIVATE_SENT_NOTE, deliverPrivateReplies, withPrivateNote } = await import(
      "../src/discord/private-reply.ts"
    );
    expect(PRIVATE_SENT_NOTE).toContain(SENT_NOTE);
    expect(PRIVATE_NOT_SENT_NOTE).toContain(NOT_SENT_NOTE);
    const dms: Array<{ userId: string; content: string }> = [];
    const sendDm = async (o: { userId: string; content: string }) => {
      dms.push(o);
      return { channelId: "dm", messageId: `d${dms.length}` };
    };
    expect(await deliverPrivateReplies({ replies: undefined, userId: TOFU, sendDm })).toBeNull();
    const secret = `token ghp_${"a".repeat(36)} and ${"long line\n".repeat(400)}`;
    expect(await deliverPrivateReplies({ replies: [secret], userId: TOFU, sendDm })).toBe("sent");
    expect(dms.length).toBeGreaterThan(1);
    for (const d of dms) {
      expect(d.userId).toBe(TOFU);
      expect(d.content.length).toBeLessThanOrEqual(1900);
      expect(d.content).not.toContain(`ghp_${"a".repeat(36)}`);
    }
    expect(dms[0]!.content.startsWith(PRIVATE_DM_HEADER)).toBe(true);
    expect(await deliverPrivateReplies({ replies: ["x"], userId: TOFU })).toBe("failed");
    expect(await deliverPrivateReplies({ replies: ["x"], userId: TOFU, sendDm: async () => null })).toBe("failed");
    expect(
      await deliverPrivateReplies({
        replies: ["x"],
        userId: TOFU,
        sendDm: async () => {
          throw new Error("DMs closed");
        },
      }),
    ).toBe("failed");
    expect(withPrivateNote("answer", null)).toBe("answer");
    expect(withPrivateNote("answer", "sent")).toBe(`${PRIVATE_SENT_NOTE}\n\nanswer`);
    expect(withPrivateNote("", "failed")).toBe(PRIVATE_NOT_SENT_NOTE);
  });

  test("a long reply is scrubbed before it is cut, shows the cut, never splits a surrogate pair; mass mentions never push a DM part past the gateway's cap", async () => {
    const { deliverPrivateReplies, privateRepliesFromUnknown, PRIVATE_REPLY_TEXT_MAX } = await import(
      "../src/discord/private-reply.ts"
    );
    const { defangMassMentions } = await import("../src/discord/allowed-mentions.ts");
    const dms: Array<{ userId: string; content: string }> = [];
    const sendDm = async (o: { userId: string; content: string }) => {
      dms.push(o);
      return { channelId: "dm", messageId: `d${dms.length}` };
    };
    const deliver = async (raw: unknown[]) => {
      dms.length = 0;
      expect(
        await deliverPrivateReplies({ replies: privateRepliesFromUnknown(raw), userId: TOFU, sendDm }),
      ).toBe("sent");
      return dms.map((d) => d.content).join("");
    };

    // A token that straddles the cut is redacted, never left as a prefix a
    // later scrub misses (SAFE-6).
    const straddling = `${"x".repeat(PRIVATE_REPLY_TEXT_MAX - 20)}ghp_${"a".repeat(36)}`;
    const cut = privateRepliesFromUnknown([straddling])![0]!;
    expect(cut.length).toBeLessThanOrEqual(PRIVATE_REPLY_TEXT_MAX);
    expect(cut).toContain("cut here");
    expect(cut).not.toContain("ghp_a");
    expect(await deliver([straddling])).not.toContain("ghp_a");

    // Never half a surrogate pair at the cut.
    const emoji = privateRepliesFromUnknown(["😀".repeat(PRIVATE_REPLY_TEXT_MAX)])![0]!;
    expect(emoji).toContain("cut here");
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(emoji)).toBe(false);

    // More than five: the last one kept says how many were not sent.
    const many = privateRepliesFromUnknown(Array.from({ length: 8 }, (_, i) => `reply ${i}`))!;
    expect(many).toHaveLength(5);
    expect(many[4]).toContain("3 more private results were not sent");
    // Bounded twice is bounded once (the child bounds, the client re-checks).
    expect(privateRepliesFromUnknown(many)).toEqual(many);

    // Mass mentions are defanged before the split, so the gateway's own
    // defang and 1900 cap never cut a part.
    await deliver(["@everyone ".repeat(600)]);
    expect(dms.length).toBeGreaterThan(1);
    for (const d of dms) expect(defangMassMentions(d.content).length).toBeLessThanOrEqual(1900);
  });
});

const PRIVATE_TEXT = "Profile: Tofu (tofu)\n- preferences:\n  - timezone: TOFU-TZ-SECRET";

/** The bridge with a fake gateway; the agent reads Tofu's profile privately. */
async function privateBridge(opts: { dmFails?: boolean; ask?: HumanAsk } = {}) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const posts: Array<{ channelId: string; content: string }> = [];
  const dms: Array<{ userId: string; content: string }> = [];
  const calls: AgentRunChatOpts[] = [];
  const agent: AgentClient = {
    async runChat(o) {
      calls.push(o);
      if (calls.length === 1 && opts.ask) {
        return { ok: true, sessionId: o.sessionId, summary: "need input", exitCode: 0, ask: opts.ask };
      }
      return {
        ok: true,
        sessionId: o.sessionId,
        summary: "Sent your profile to you privately.",
        exitCode: 0,
        privateReplies: [PRIVATE_TEXT],
      };
    },
  };
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: CHAN,
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: join(dir, "missing.toml"),
      CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
    },
    projectRoot: mkdtempSync(join(dir, "proj-")),
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound: outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent,
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      handlers.reply = async (o) => {
        posts.push(o);
        return { messageId: `bot_${posts.length}` };
      };
      handlers.sendDm = async (o) => {
        if (opts.dmFails) return null;
        dms.push(o);
        return { channelId: `dm-${o.userId}`, messageId: `dm_${dms.length}` };
      };
      return createNullGateway();
    },
  });
  if (!result.ok || !box.handlers) throw new Error("bridge did not start");
  /** Everything that went to the shared channel. */
  const channelText = () =>
    JSON.stringify([posts, outbound.sends, outbound.edits, outbound.contentEdits, outbound.posts]);
  const turns = () => JSON.stringify(result.store.list().map((s) => result.store.threadPrompt(s, "next")));
  return { result, handlers: box.handlers, posts, dms, calls, outbound, channelText, turns };
}

let seq = 0;
function mention(authorId: string): InboundMessage {
  seq += 1;
  return { id: `m_${seq}`, channelId: CHAN, authorId, authorBot: false, content: "<@bot> show my profile", mentionedBot: true };
}

describe("the bridge shows it only privately, by DM (REQ-discord-710)", () => {
  test("chat: DM to the person who asked; the channel gets the note, never the text; the thread never records it", async () => {
    const b = await privateBridge();
    await b.handlers.onMessage(mention(TOFU));
    expect(b.dms).toHaveLength(1);
    expect(b.dms[0]!.userId).toBe(TOFU);
    expect(b.dms[0]!.content).toContain("TOFU-TZ-SECRET");
    expect(b.channelText()).toContain(SENT_NOTE);
    expect(b.channelText()).toContain("Sent your profile to you privately.");
    expectNoSecret(b.channelText());
    expectNoSecret(b.turns());
    await b.result.stop();
  });

  test("chat: when the DM does not go out, the channel says so and still never shows it", async () => {
    const b = await privateBridge({ dmFails: true });
    await b.handlers.onMessage(mention(TOFU));
    expect(b.dms).toHaveLength(0);
    expect(b.channelText()).toContain(NOT_SENT_NOTE);
    expectNoSecret(b.channelText());
    await b.result.stop();
  });

  test("a button pick resume: DM to the presser, the note in the channel", async () => {
    const b = await privateBridge({
      ask: { reason: "clarify", question: "Which part?", options: [{ id: "1", label: "Profile" }, { id: "2", label: "Notes" }] },
    });
    await b.handlers.onMessage(mention(TOFU));
    const pending = b.result.store.list()[0]!.pendingAsk!;
    expect(pending.options?.length).toBe(2);
    const ix: ComponentInteraction = {
      id: "ix_pick",
      customId: pickCustomId(pending.askId, "1"),
      channelId: CHAN,
      userId: TOFU,
      messageId: pending.stubMessageId,
      reply: async () => {},
      deleteReply: async () => {},
    };
    await b.handlers.onComponent!(ix);
    expect(b.calls).toHaveLength(2);
    expect(b.dms).toHaveLength(1);
    expect(b.dms[0]!.userId).toBe(TOFU);
    expect(b.dms[0]!.content).toContain("TOFU-TZ-SECRET");
    expect(b.channelText()).toContain(SENT_NOTE);
    expectNoSecret(b.channelText());
    expectNoSecret(b.turns());
    await b.result.stop();
  });

  test("an Answer form submit resume: DM to the submitter, the note in the channel", async () => {
    const b = await privateBridge({ ask: { reason: "clarify", question: "What exactly should I look up for you?" } });
    await b.handlers.onMessage(mention(TOFU));
    const pending = b.result.store.list()[0]!.pendingAsk!;
    expect(pending.options).toBeUndefined();
    const ix: ComponentInteraction = {
      id: "ix_submit",
      customId: answerCustomId(pending.askId),
      channelId: CHAN,
      userId: TOFU,
      modalValues: { [ASK_ANSWER_INPUT_ID]: "my profile please" },
      reply: async () => {},
      deleteReply: async () => {},
    };
    await b.handlers.onComponent!(ix);
    expect(b.calls).toHaveLength(2);
    expect(b.dms).toHaveLength(1);
    expect(b.dms[0]!.content).toContain("TOFU-TZ-SECRET");
    expect(b.channelText()).toContain(SENT_NOTE);
    expectNoSecret(b.channelText());
    await b.result.stop();
  });
});

function initGitRepo(repo: string): void {
  mkdirSync(repo, { recursive: true });
  const git = (args: string[]) => {
    const p = Bun.spawnSync(["git", ...args], { cwd: repo, stdout: "pipe", stderr: "pipe" });
    if (p.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${new TextDecoder().decode(p.stderr)}`);
  };
  git(["init", "-q", "-b", "main"]);
  git(["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "init"]);
}

describe("/session start and /work show it only privately, by DM (REQ-discord-710)", () => {
  function outboundRecorder() {
    const contentEdits: EditMessageOpts[] = [];
    let n = 0;
    const outbound: ThinkingOutbound = {
      async sendEmbed() {
        n += 1;
        return { messageId: `msg_${n}` };
      },
      async editEmbed() {
        return true;
      },
      async editMessage(o: EditMessageOpts) {
        contentEdits.push(o);
        return true;
      },
    };
    return { outbound, contentEdits };
  }

  function ctxFor(store: SessionStore, outbound: ThinkingOutbound, sendDm?: SlashContext["sendDm"]): SlashContext {
    const agent: AgentClient = {
      async runChat(o) {
        return {
          ok: true,
          sessionId: o.sessionId,
          summary: "Sent your profile to you privately.",
          exitCode: 0,
          privateReplies: [PRIVATE_TEXT],
        };
      },
    };
    return {
      store,
      workStore: new WorkStore(),
      allowlist: emptyConfig(),
      agent,
      version: "0.0.0",
      protocolVersion: 2,
      startedAt: Date.now(),
      channelIds: [CHAN],
      owner: { discordId: OWNER_ID },
      thinkingOutbound: outbound,
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      ...(sendDm ? { sendDm } : {}),
      openWorkPr: async () => ({ opened: false as const, reason: "verify-failed" as const, line: "PR: not opened — test stub" }),
    };
  }

  function slashIx(commandName: string, options: Record<string, string>, subcommand?: string) {
    const edits: SlashReplyPayload[] = [];
    const ix: SlashInteraction = {
      id: "ix",
      commandName,
      subcommand,
      channelId: CHAN,
      userId: OWNER_ID,
      options,
      reply: async (p) => {
        edits.push(p);
      },
      deferReply: async () => {},
      editReply: async (p) => {
        edits.push(p);
      },
      deleteReply: async () => {},
    };
    return { ix, edits };
  }

  async function withStore(fn: (store: SessionStore) => Promise<void>): Promise<void> {
    const project = join(dir, "proj");
    initGitRepo(project);
    process.env.WORKTREE_BASE_DIR = join(dir, "wts");
    const store = new SessionStore({ db: openCorvidinhoDb({ memory: true }), ttlMs: 45 * 60 * 1000, defaultProjectRoot: project });
    try {
      await fn(store);
    } finally {
      for (const s of store.list()) await store.endSession(s);
    }
  }

  for (const [label, command, options, subcommand, handle] of [
    ["/session start", "session", { topic: "show my profile" }, "start", handleSessionStart],
    ["/work", "work", { description: "look up my profile" }, undefined, handleWorkCommand],
  ] as const) {
    test(`${label}: DM to the invoker; the channel gets the note, never the text`, async () => {
      await withStore(async (store) => {
        const dms: Array<{ userId: string; content: string }> = [];
        const { outbound, contentEdits } = outboundRecorder();
        const { ix, edits } = slashIx(command, { ...options }, subcommand);
        await handle(
          ctxFor(store, outbound, async (o) => {
            dms.push(o);
            return { channelId: "dm", messageId: `dm_${dms.length}` };
          }),
          ix,
        );
        expect(dms).toHaveLength(1);
        expect(dms[0]!.userId).toBe(OWNER_ID);
        expect(dms[0]!.content).toContain("TOFU-TZ-SECRET");
        const channel = JSON.stringify([contentEdits, edits]);
        expect(channel).toContain(SENT_NOTE);
        expectNoSecret(channel);
        expectNoSecret(store.list().map((s) => store.threadPrompt(s, "next")));
      });
    });

    test(`${label}: with no DM path the channel says it couldn't be sent and never shows it`, async () => {
      await withStore(async (store) => {
        const { outbound, contentEdits } = outboundRecorder();
        const { ix, edits } = slashIx(command, { ...options }, subcommand);
        await handle(ctxFor(store, outbound), ix);
        const channel = JSON.stringify([contentEdits, edits]);
        expect(channel).toContain(NOT_SENT_NOTE);
        expectNoSecret(channel);
      });
    });
  }
});
