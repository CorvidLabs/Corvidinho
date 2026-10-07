/**
 * `/session start persona:` (AUTONOMOUS-2 / AUTONOMOUS-5.a, REQ-discord-225):
 * the owner can run a session's run as a named persona from `personas/`;
 * team members and the community can't pick one, and an unknown persona or
 * one whose model is not configured gets one private line. Nothing starts in
 * either case. The spawn client passes the pick as `task run --persona`.
 * Fixtures only: a temp checkout, a recording agent, a fake bin.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyConfig } from "../src/allowlist/types.ts";
import { resultFrame, serializeFrame } from "../src/agent/events-ndjson.ts";
import { PERSONA_OWNER_ONLY_LINE } from "../src/agent/personas.ts";
import { createSpawnAgentClient, type AgentClient, type AgentRunChatOpts } from "../src/discord/agent-client.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import { buildSlashCommandBodies, OPT_STRING } from "../src/discord/slash-commands.ts";
import { handleSlashInteraction } from "../src/discord/slash-dispatch.ts";
import type { SlashContext, SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { declareTeam } from "./fixtures/team-people.ts";

const OWNER = "100000000000000001";
const TEAM = "200000000000000002";
const STRANGER = "300000000000000003";

let base: string;
let savedModel: string | undefined;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "corvidinho-session-persona-"));
  savedModel = process.env.CORVIDINHO_LLM_MODEL;
  process.env.CORVIDINHO_LLM_MODEL = "base-model,openai:persona-model";
});

afterEach(() => {
  if (savedModel === undefined) delete process.env.CORVIDINHO_LLM_MODEL;
  else process.env.CORVIDINHO_LLM_MODEL = savedModel;
  rmSync(base, { recursive: true, force: true });
});

/** A plain checkout root with `personas/` (read from the working tree: no .git). */
function personaRoot(): string {
  const root = join(base, "corvidinho");
  mkdirSync(join(root, "personas"), { recursive: true });
  writeFileSync(
    join(root, "personas", "reviewer.md"),
    "---\nname: reviewer\nmodel: openai:persona-model\nskills: [review]\n---\nREVIEWER-VOICE\n",
  );
  writeFileSync(
    join(root, "personas", "rogue.md"),
    "---\nname: rogue\nmodel: anthropic:not-configured\n---\nROGUE-VOICE\n",
  );
  return root;
}

function recordingAgent(calls: AgentRunChatOpts[]): AgentClient {
  return {
    async runChat(o: AgentRunChatOpts) {
      calls.push(o);
      return { ok: true, sessionId: o.sessionId, summary: "done in voice", exitCode: 0 };
    },
  };
}

function ctx(calls: AgentRunChatOpts[]): SlashContext {
  const allowlist = emptyConfig();
  allowlist.discord.channels = ["chan-ok"];
  declareTeam(allowlist, TEAM);
  return {
    personaRoot: personaRoot(),
    store: new SessionStore({ defaultProjectRoot: mkdtempSync(join(base, "proj-")) }),
    workStore: new WorkStore(),
    allowlist,
    agent: recordingAgent(calls),
    version: "0.0.0",
    protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
    startedAt: Date.now(),
    channelIds: ["chan-ok"],
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    owner: { discordId: OWNER },
    mutedUsers: new Set(),
    openWorkPr: async () => ({ opened: false, reason: "no-changes", line: "PR: none (test)" }),
  } as SlashContext;
}

function start(userId: string, options: Record<string, string>) {
  const replies: SlashReplyPayload[] = [];
  const ix: SlashInteraction = {
    id: `ix_${Math.random()}`,
    commandName: "session",
    subcommand: "start",
    channelId: "chan-ok",
    userId,
    options,
    reply: async (p) => void replies.push(p),
    deferReply: async () => {},
    editReply: async (p) => void replies.push(p),
  };
  return { ix, replies };
}

describe("/session start persona (REQ-discord-225)", () => {
  test("the command offers an optional persona option", () => {
    const session = buildSlashCommandBodies().find((b) => b.name === "session");
    const startCmd = session?.options?.find((o) => o.name === "start");
    const persona = startCmd?.options?.find((o) => o.name === "persona");
    expect(persona?.type).toBe(OPT_STRING);
    expect(persona?.required).toBe(false);
    expect(startCmd?.options?.map((o) => o.name)).toEqual(["topic", "project", "persona"]);
  });

  test("team and community can't pick a persona: one private line, nothing starts", async () => {
    for (const who of [TEAM, STRANGER]) {
      const calls: AgentRunChatOpts[] = [];
      const c = ctx(calls);
      const { ix, replies } = start(who, { topic: "review this", persona: "reviewer" });
      await handleSlashInteraction(c, ix);
      expect(replies).toEqual([{ content: PERSONA_OWNER_ONLY_LINE, ephemeral: true }]);
      expect(calls).toEqual([]);
      expect(c.store.list()).toHaveLength(0);
    }
  });

  test("the owner: an unknown persona or an unconfigured model gets one private line, nothing starts", async () => {
    const calls: AgentRunChatOpts[] = [];
    const c = ctx(calls);
    const ghost = start(OWNER, { topic: "review this", persona: "ghost" });
    await handleSlashInteraction(c, ghost.ix);
    expect(ghost.replies).toEqual([
      {
        content: 'Persona "ghost" not found in personas/ (named personas: reviewer, rogue); nothing was run (AUTONOMOUS-2.a).',
        ephemeral: true,
      },
    ]);
    const rogue = start(OWNER, { topic: "review this", persona: "rogue" });
    await handleSlashInteraction(c, rogue.ix);
    expect(rogue.replies).toHaveLength(1);
    expect(rogue.replies[0]!.ephemeral).toBe(true);
    expect(rogue.replies[0]!.content).toContain('Persona "rogue" (personas/rogue.md) names model anthropic:not-configured');
    expect(calls).toEqual([]);
    expect(c.store.list()).toHaveLength(0);
  });

  test("the owner's pick reaches the run, and the answer says which persona", async () => {
    const calls: AgentRunChatOpts[] = [];
    const c = ctx(calls);
    const { ix, replies } = start(OWNER, { topic: "review this", persona: "Reviewer" });
    await handleSlashInteraction(c, ix);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.persona).toBe("reviewer");
    const body = replies.map((r) => r.content).join("\n");
    expect(body).toContain("Persona: reviewer");
    expect(body).toContain("done in voice");

    // No persona: the run is as before (persona.md).
    const plain = start(OWNER, { topic: "plain" });
    await handleSlashInteraction(c, plain.ix);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.persona).toBeUndefined();
    expect(plain.replies.map((r) => r.content).join("\n")).not.toContain("Persona:");
  });
});

describe("spawn client passes the pick as task run --persona (REQ-discord-225)", () => {
  const DONE = serializeFrame(
    resultFrame({
      summary: "ok",
      filesChanged: [],
      verified: false,
      verifySkipped: true,
      cancelled: false,
      state: "done",
      attempts: 1,
    }),
  );

  test("--persona NAME before --task when set; absent otherwise", async () => {
    const dir = mkdtempSync(join(base, "bin-"));
    const bin = join(dir, "corvidinho");
    writeFileSync(bin, `#!/bin/sh\nprintf '%s\\0' "$@" > "${dir}/argv.bin"\ncat <<'EOF'\n${DONE}\nEOF\n`, { mode: 0o755 });
    const client = createSpawnAgentClient({ bin, cwd: dir, env: { PATH: process.env.PATH ?? "" } });
    const argv = () => readFileSync(join(dir, "argv.bin"), "utf8").split("\0").slice(0, -1);

    await client.runChat({ prompt: "p", sessionId: "s1", actingIsAdmin: true, persona: "reviewer" } as AgentRunChatOpts);
    const a = argv();
    const at = a.indexOf("--persona");
    expect(at).toBeGreaterThan(-1);
    expect(a[at + 1]).toBe("reviewer");
    expect(at).toBeLessThan(a.indexOf("--task"));

    await client.runChat({ prompt: "p", sessionId: "s2", actingIsAdmin: true });
    expect(argv()).not.toContain("--persona");
  });
});
