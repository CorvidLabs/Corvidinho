/**
 * ROLES-CHAT-7 prove-before-done: non-ADMIN cannot mutate; ADMIN still SAFE-gated
 * (files-write, shell-exec, github-pr-create + GITHUB-6); channel allowlist
 * still required. GitHub runs are dry-run only (no network, no token).
 * ROLES-CHAT-3: a mutating call the model invents in a non-ADMIN session gets
 * the role refusal, and the run summary ends with the short role note.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { frameFromEvent, progressFromFrame } from "../src/agent/events-ndjson.ts";
import { createTaskExecute, UNKNOWN_TOOL_LABEL } from "../src/agent/execute.ts";
import { buildOpenAiTools } from "../src/agent/tools.ts";
import type { AgentEvent } from "../src/agent/types.ts";
import { checkChannel } from "../src/allowlist/index.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry, list } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import {
  ROLE_REFUSED_MESSAGE,
  resolveActingIsAdmin,
} from "../src/plugins/roles.ts";

const OWNER = "181969874455756800";
const NON_OWNER = "999999999999999999";
const CHANNEL = "1408845298629083220";

const ACTING_KEYS = [
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_ALLOWLIST",
  "CORVIDINHO_MEMORY_INMEM",
  "DISCORD_MUTED_USER_IDS",
] as const;

/** GITHUB-6 gate + GitHub write keys: cleared per test so no operator env admits a repo or reaches the network. */
const GITHUB_KEYS = [
  "CORVIDINHO_GITHUB_ALLOW_REPOS",
  "CORVIDINHO_GITHUB_ALLOW_ORGS",
  "CORVIDINHO_GITHUB_ALLOW_USERS",
  "CORVIDINHO_GITHUB_DENY_REPOS",
  "CORVIDINHO_GITHUB_DENY_ORGS",
  "CORVIDINHO_GITHUB_DENY_USERS",
  "CORVIDINHO_GITHUB_DRY_RUN",
  "GITHUB_TOKEN",
  "GH_TOKEN",
] as const;

let prev: Record<string, string | undefined> = {};
let tmpRoot = "";

function snapEnv() {
  prev = {};
  for (const k of ACTING_KEYS) prev[k] = process.env[k];
  for (const k of GITHUB_KEYS) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
}

function restoreEnv() {
  for (const k of [...ACTING_KEYS, ...GITHUB_KEYS]) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
}

function writeAllowlist(opts: {
  owner?: string;
  channels?: string[];
}): string {
  tmpRoot = mkdtempSync(join(tmpdir(), "roles-chat-"));
  const path = join(tmpRoot, "allowlist.toml");
  const channels = opts.channels ?? [CHANNEL];
  const owner = opts.owner ?? OWNER;
  writeFileSync(
    path,
    `[discord]\nchannels = [${channels.map((c) => `"${c}"`).join(", ")}]\nroles = []\nusers = []\ndeny_users = []\n\n[owner]\ndiscord_id = "${owner}"\n`,
    "utf8",
  );
  process.env.CORVIDINHO_ALLOWLIST_FILE = path;
  process.env.CORVIDINHO_OWNER_DISCORD_ID = owner;
  return path;
}

function asNonAdmin() {
  process.env.CORVIDINHO_ACTING_IS_ADMIN = "0";
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = NON_OWNER;
  process.env.CORVIDINHO_MEMORY_INMEM = "1";
  delete process.env.CORVIDINHO_ALLOWLIST;
}

function asAdmin() {
  process.env.CORVIDINHO_ACTING_IS_ADMIN = "1";
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = OWNER;
  process.env.CORVIDINHO_MEMORY_INMEM = "1";
  delete process.env.CORVIDINHO_ALLOWLIST;
}

function setUpRoles() {
  snapEnv();
  clearRegistry();
  loadBuiltins();
  writeAllowlist({});
}

function tearDownRoles() {
  restoreEnv();
  clearRegistry();
  if (tmpRoot) {
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    tmpRoot = "";
  }
}

describe("ROLES-CHAT-7 role tool gates", () => {
  beforeEach(setUpRoles);
  afterEach(tearDownRoles);

  test("(a) non-admin catalog omits mutating tools including files-write/edit", () => {
    asNonAdmin();
    const tools = buildOpenAiTools({ tier: "code", actingIsAdmin: false });
    const names = new Set(tools.map((t) => t.function.name));
    expect(names.has("files-read")).toBe(true);
    expect(names.has("files-list")).toBe(true);
    expect(names.has("memory-recall")).toBe(true);
    expect(names.has("files-write")).toBe(false);
    expect(names.has("files-edit")).toBe(false);
    expect(names.has("files-delete")).toBe(false);
    expect(names.has("shell-exec")).toBe(false);
    expect(names.has("github-pr-create")).toBe(false);
    expect(names.has("memory-forget")).toBe(false);
  });

  test("(a) non-admin runPlugin refuses files-write / shell / github-pr-create / memory-forget", async () => {
    asNonAdmin();
    const cases = [
      "files-write",
      "shell-exec",
      "github-pr-create",
      "memory-forget",
    ] as const;
    for (const name of cases) {
      const result = await runPlugin({
        name,
        args: name === "files-write" ? ["scratch.txt", "nope"] : [],
        nonInteractive: true,
        allowlist: [],
        cwd: tmpRoot,
      });
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.error ?? "").toContain(ROLE_REFUSED_MESSAGE);
    }
  });

  test("(b) admin can run files-write (mutating, not dangerous); shell still SAFE-1 without allowlist", async () => {
    asAdmin();
    mkdirSync(tmpRoot, { recursive: true });
    const write = await runPlugin({
      name: "files-write",
      args: ["ok.txt", "hello-admin"],
      nonInteractive: true,
      allowlist: [],
      cwd: tmpRoot,
    });
    expect(write.ok).toBe(true);

    const shellDenied = await runPlugin({
      name: "shell-exec",
      args: ["echo hi"],
      nonInteractive: true,
      allowlist: [],
      cwd: tmpRoot,
    });
    expect(shellDenied.ok).toBe(false);
    expect(shellDenied.error ?? "").toContain("SAFE-1");

    const shellOk = await runPlugin({
      name: "shell-exec",
      args: ["echo hi"],
      nonInteractive: true,
      allowlist: ["shell-exec"],
      cwd: tmpRoot,
    });
    expect(shellOk.ok).toBe(true);
  });

  test("(b) admin github-pr-create: SAFE-1 denies without an allowlist entry; dry-run ok with the allowlist + GITHUB-6 repo allowlist", async () => {
    asAdmin();
    process.env.CORVIDINHO_GITHUB_DRY_RUN = "1";
    expect(await resolveActingIsAdmin()).toBe(true);
    const args = [
      "--repo",
      "CorvidLabs/Corvidinho",
      "--title",
      "admin role session",
      "--head",
      "corvidinho/roles-chat-7",
      "--base",
      "main",
    ];
    const run = (allowlist: string[]) =>
      runPlugin({
        name: "github-pr-create",
        args,
        nonInteractive: true,
        allowlist,
        cwd: tmpRoot,
      });

    // ADMIN passes the role gate but not SAFE-1: no allowlist entry, no PR.
    const denied = await run([]);
    expect(denied.ok).toBe(false);
    expect(denied.exitCode).toBe(2);
    expect(denied.error ?? "").toContain("SAFE-1");
    expect(denied.error ?? "").not.toContain(ROLE_REFUSED_MESSAGE);

    // Allowlisted, but the GITHUB-6 repo allowlist is empty: still refused.
    const noRepo = await run(["github-pr-create"]);
    expect(noRepo.ok).toBe(false);
    expect(noRepo.exitCode).toBe(3);
    expect(noRepo.error ?? "").toContain("GITHUB-6");

    // Allowlist entry + GITHUB-6 repo allowlist: the dry-run PR goes through.
    process.env.CORVIDINHO_GITHUB_ALLOW_REPOS = "CorvidLabs/Corvidinho";
    const ok = await run(["github-pr-create"]);
    expect(ok.ok).toBe(true);
    expect(ok.exitCode).toBe(0);
    expect(ok.data).toMatchObject({
      dryRun: true,
      owner: "CorvidLabs",
      repo: "Corvidinho",
      title: "admin role session",
      head: "corvidinho/roles-chat-7",
      base: "main",
    });
  });

  test("(b) admin catalog includes files-write at code tier (still omits dangerous unless includeDangerous)", () => {
    asAdmin();
    const tools = buildOpenAiTools({ tier: "code", actingIsAdmin: true });
    const names = new Set(tools.map((t) => t.function.name));
    expect(names.has("files-write")).toBe(true);
    expect(names.has("files-edit")).toBe(true);
    expect(names.has("shell-exec")).toBe(false); // dangerous omitted
  });

  test("files-write/edit are listed as mutating", () => {
    const byName = Object.fromEntries(list().map((e) => [e.name, e]));
    expect(byName["files-write"]!.mutating).toBe(true);
    expect(byName["files-write"]!.dangerous).toBe(false);
    expect(byName["files-edit"]!.mutating).toBe(true);
    expect(byName["files-delete"]!.mutating).toBe(true); // via dangerous
    expect(byName["files-read"]!.mutating).toBe(false);
  });

  test("(c) channel allowlist still required — empty channels refuse", () => {
    const cfg = emptyConfig();
    expect(checkChannel(CHANNEL, cfg).ok).toBe(false);
    cfg.discord.channels = [CHANNEL];
    expect(checkChannel(CHANNEL, cfg).ok).toBe(true);
  });
});

/** The short note a run's summary ends with after a role refusal (ROLES-CHAT-3). */
const ROLE_NOTE = `(${ROLE_REFUSED_MESSAGE})`;

type ScriptedMessage = Record<string, unknown>;

function toolCalls(calls: Array<[string, string[]]>): ScriptedMessage {
  return {
    role: "assistant",
    content: null,
    tool_calls: calls.map(([name, argv], i) => ({
      id: `c${i + 1}`,
      type: "function",
      function: { name, arguments: JSON.stringify({ argv }) },
    })),
  };
}

function say(content: string): ScriptedMessage {
  return { role: "assistant", content };
}

/**
 * A fake OpenAI-compatible provider: replies with `script` in order, the last
 * reply repeating. No network.
 */
function scriptedLlm(
  script: ScriptedMessage[],
  opts: { bodies?: unknown[]; onCall?: (n: number) => void } = {},
) {
  let call = 0;
  return async (_input: string | URL | Request, init?: RequestInit) => {
    call += 1;
    opts.onCall?.(call);
    opts.bodies?.push(JSON.parse(String(init?.body ?? "{}")));
    const message = script[Math.min(call, script.length) - 1];
    return new Response(JSON.stringify({ choices: [{ message }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

/** Provider settings plus the session keys only: no spend cap, no real key. */
function llmEnv(session: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return {
    CORVIDINHO_LLM_API_KEY: "test-key-not-real",
    CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
    CORVIDINHO_LLM_MODEL: "test-model",
    ...session,
  };
}

const NON_ADMIN_SESSION = {
  CORVIDINHO_ACTING_IS_ADMIN: "0",
  CORVIDINHO_ACTING_DISCORD_USER_ID: NON_OWNER,
};

function adminSession(): Record<string, string | undefined> {
  return {
    CORVIDINHO_ACTING_IS_ADMIN: "1",
    CORVIDINHO_ACTING_DISCORD_USER_ID: OWNER,
    CORVIDINHO_OWNER_DISCORD_ID: OWNER,
    CORVIDINHO_ALLOWLIST_FILE: process.env.CORVIDINHO_ALLOWLIST_FILE,
  };
}

function toolResults(events: AgentEvent[]) {
  return events.filter(
    (e): e is Extract<AgentEvent, { type: "ToolResult" }> => e.type === "ToolResult",
  );
}

function offeredNames(body: unknown): string[] {
  const tools = (body as { tools?: { function: { name: string } }[] }).tools ?? [];
  return tools.map((t) => t.function.name);
}

const attempt = (n: number) => ({ attempt: n, signal: new AbortController().signal });

describe("ROLES-CHAT-3 invented mutating calls in the tool loop", () => {
  beforeEach(() => {
    setUpRoles();
    delete process.env.DISCORD_MUTED_USER_IDS;
  });
  afterEach(tearDownRoles);

  test("a non-ADMIN session's invented call to every mutating plugin gets the role refusal, never runs, and the summary ends with the role note", async () => {
    asNonAdmin();
    const mutating = list()
      .filter((e) => e.mutating)
      .map((e) => e.name);
    expect(mutating).toEqual(
      expect.arrayContaining([
        "files-write",
        "files-edit",
        "files-delete",
        "shell-exec",
        "github-pr-create",
        "discord-post-message",
        "memory-forget",
        "memory-override",
      ]),
    );
    const bodies: unknown[] = [];
    const events: AgentEvent[] = [];
    const exec = createTaskExecute({
      taskText: "delete this project",
      cwd: tmpRoot,
      env: llmEnv(NON_ADMIN_SESSION),
      tier: "code",
      fetchImpl: scriptedLlm(
        [
          toolCalls(
            mutating.map((name): [string, string[]] => [
              name,
              name === "files-write" ? ["pwned.txt", "x"] : [],
            ]),
          ),
          say("I can only help with reading and chat here."),
        ],
        { bodies },
      ),
      onEvent: (e) => events.push(e),
      projectInstructions: false,
      maxToolRounds: 3,
    });
    const r = await exec(attempt(1));

    // None was offered (ROLES-CHAT-2): every call is one the model invented.
    const offered = offeredNames(bodies[0]);
    for (const name of mutating) expect(offered).not.toContain(name);

    // Each gets the same role refusal runPlugin gives this caller; none runs.
    const results = toolResults(events);
    expect(results).toHaveLength(mutating.length);
    for (const [i, name] of mutating.entries()) {
      const direct = await runPlugin({
        name,
        args: [],
        nonInteractive: true,
        allowlist: [],
        cwd: tmpRoot,
      });
      expect(direct.error ?? "").toContain(ROLE_REFUSED_MESSAGE);
      expect(results[i]).toMatchObject({
        name: UNKNOWN_TOOL_LABEL,
        success: false,
        detail: direct.error,
      });
    }
    const toolMessages = (
      bodies[1] as { messages: { role: string; content: string }[] }
    ).messages.filter((m) => m.role === "tool");
    expect(toolMessages).toHaveLength(mutating.length);
    for (const m of toolMessages) expect(m.content).toContain(ROLE_REFUSED_MESSAGE);
    expect(readdirSync(tmpRoot)).toEqual(["allowlist.toml"]);
    expect(r.filesChanged).toEqual([]);

    // Silent to the channel: live status shows neither the refusal nor the names...
    for (const e of events) {
      const shown = JSON.stringify(progressFromFrame(frameFromEvent(e)) ?? {});
      expect(shown).not.toContain(ROLE_REFUSED_MESSAGE);
      for (const name of mutating) expect(shown).not.toContain(`"${name}"`);
    }
    // ...except the short in-session note in the agent summary.
    expect(r.summary).toBe(`I can only help with reading and chat here.\n\n${ROLE_NOTE}`);

    // A later attempt of the same run keeps the note.
    const again = await exec(attempt(2));
    expect(again.summary).toBe(`I can only help with reading and chat here.\n\n${ROLE_NOTE}`);
  });

  test("an offered tool that runPlugin refuses for the role mid-run (owner muted, ROLES-CHAT-6) also ends the summary with the role note", async () => {
    asAdmin();
    const bodies: unknown[] = [];
    const events: AgentEvent[] = [];
    const exec = createTaskExecute({
      taskText: "write a note",
      cwd: tmpRoot,
      env: llmEnv(adminSession()),
      tier: "code",
      fetchImpl: scriptedLlm(
        [toolCalls([["files-write", ["mid.txt", "x"]]]), say("Stopped.")],
        {
          bodies,
          // The owner is muted after the catalog was built.
          onCall: (n) => {
            if (n === 1) process.env.DISCORD_MUTED_USER_IDS = OWNER;
          },
        },
      ),
      onEvent: (e) => events.push(e),
      projectInstructions: false,
      maxToolRounds: 3,
    });
    const r = await exec(attempt(1));

    expect(offeredNames(bodies[0])).toContain("files-write");
    const [result] = toolResults(events);
    expect(result).toMatchObject({ name: "files-write", success: false });
    expect(result!.detail).toContain(ROLE_REFUSED_MESSAGE);
    expect(readdirSync(tmpRoot)).toEqual(["allowlist.toml"]);
    expect(r.summary).toBe(`Stopped.\n\n${ROLE_NOTE}`);
  });

  test("a non-ADMIN session naming an unregistered tool keeps the catalog refusal and gets no role note", async () => {
    asNonAdmin();
    const events: AgentEvent[] = [];
    const exec = createTaskExecute({
      taskText: "x",
      cwd: tmpRoot,
      env: llmEnv(NON_ADMIN_SESSION),
      tier: "code",
      fetchImpl: scriptedLlm([toolCalls([["made-up-eraser", []]]), say("done")]),
      onEvent: (e) => events.push(e),
      projectInstructions: false,
      maxToolRounds: 3,
    });
    const r = await exec(attempt(1));
    const [result] = toolResults(events);
    expect(result).toMatchObject({ name: UNKNOWN_TOOL_LABEL, success: false });
    expect(result!.detail).toContain("not offered");
    expect(result!.detail).not.toContain(ROLE_REFUSED_MESSAGE);
    expect(r.summary).toBe("done");
  });

  test("ADMIN and the local CLI keep the catalog refusal for a tool they were not offered, with no role note", async () => {
    asAdmin();
    for (const session of [adminSession(), {}]) {
      const events: AgentEvent[] = [];
      const bodies: unknown[] = [];
      const exec = createTaskExecute({
        taskText: "x",
        cwd: tmpRoot,
        env: llmEnv(session),
        // Tool tier: shell-exec and files-write (min tier code) are not offered.
        tier: "tool",
        fetchImpl: scriptedLlm(
          [
            toolCalls([
              ["shell-exec", ["echo hi"]],
              ["files-write", ["x.txt", "x"]],
            ]),
            say("done"),
          ],
          { bodies },
        ),
        onEvent: (e) => events.push(e),
        projectInstructions: false,
        maxToolRounds: 3,
      });
      const r = await exec(attempt(1));
      expect(offeredNames(bodies[0])).not.toContain("files-write");
      const results = toolResults(events);
      expect(results).toHaveLength(2);
      for (const result of results) {
        expect(result.success).toBe(false);
        expect(result.detail).toContain("not offered");
        expect(result.detail).not.toContain(ROLE_REFUSED_MESSAGE);
      }
      expect(r.summary).toBe("done");
    }
    expect(readdirSync(tmpRoot)).toEqual(["allowlist.toml"]);
  });

  test("a summary that already says it is not allowed for your role gets no second note", async () => {
    asNonAdmin();
    const exec = createTaskExecute({
      taskText: "x",
      cwd: tmpRoot,
      env: llmEnv(NON_ADMIN_SESSION),
      tier: "code",
      fetchImpl: scriptedLlm([
        toolCalls([["files-write", ["x.txt", "x"]]]),
        say("Writing files is Not Allowed For Your Role here."),
      ]),
      projectInstructions: false,
      maxToolRounds: 3,
    });
    const r = await exec(attempt(1));
    expect(r.summary).toBe("Writing files is Not Allowed For Your Role here.");
  });
});
