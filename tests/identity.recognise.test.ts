/**
 * IDENTITY-14 / IDENTITY-7 — Corvidinho recognises the owner and each
 * declared person on Discord (chat, button picks, /session start, /work) and
 * on GitHub (WATCH), by stable ids only, and an `/admin people` change or a
 * VM edit applies on the next message without a restart (#36). Driven through
 * `startBridge` with a null gateway and `startWatchPoller` with injected
 * events; no token, no network.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planningSelectionText } from "../src/agent/specLoader.ts";
import type { HumanAsk } from "../src/agent/types.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { pickCustomId } from "../src/discord/ask-buttons.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import {
  formatIdentityInjectBlock,
  IDENTITY_INJECT_HEADER,
} from "../src/discord/identity-inject.ts";
import type { SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import type { OwnerRecord } from "../src/identity/owner.ts";
import { buildPeopleDirectory, parsePeopleToml } from "../src/identity/people.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import type { AgentClient as WatchAgent } from "../src/watch/agent-client.ts";
import { startWatchPoller } from "../src/watch/poller.ts";
import { formatWatchIdentityBlock, routeEvent, WATCH_IDENTITY_HEADER } from "../src/watch/router.ts";
import { createFixtureSearchClient, fetchWatchEvents } from "../src/watch/searcher.ts";
import { SessionStore } from "../src/watch/session-store.ts";
import type { DetectedEvent } from "../src/watch/types.ts";

const CHAN = "500000000000000005";
const OWNER_ID = "100000000000000001";
const TOFU_DC = "200000000000000002";
const ADA_DC = "300000000000000003";
const STRANGER_DC = "400000000000000004";
const OWNER: OwnerRecord = { discordId: OWNER_ID, display: "Leif", githubLogin: "0xleif" };

const PEOPLE = `[people.tofu]
display = "Tofu"
nicknames = ["T"]
discord_ids = ["${TOFU_DC}"]
github_logins = ["tofu-dev"]
github_ids = ["4242"]
`;

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "corvidinho-recognise-"));
  dirs.push(d);
  return d;
}
const running: Array<{ stop: () => Promise<void> }> = [];
afterEach(async () => {
  for (const r of running.splice(0)) await r.stop();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("Discord identity block (IDENTITY-14 / IDENTITY-7)", () => {
  const dir = buildPeopleDirectory(parsePeopleToml(PEOPLE), OWNER);

  test("a declared person is named by their Discord user id; the declared display wins over the Discord one", () => {
    const block = formatIdentityInjectBlock({ userId: TOFU_DC, displayName: "xX_t0fu_Xx", owner: OWNER, people: dir })!;
    expect(block).toContain(`- discord_user_id: ${TOFU_DC}`);
    expect(block).toContain("- declared_person: tofu (the owner's people list, matched on this Discord user id)");
    expect(block).toContain("- display_name: Tofu");
    expect(block).toContain("- nicknames: T");
    expect(block).toContain("- github: @tofu-dev");
    expect(block).not.toContain("xX_t0fu_Xx");
    expect(block).not.toContain("role: owner");
  });

  test("a stranger whose Discord display name is a declared name is not that person", () => {
    const block = formatIdentityInjectBlock({ userId: STRANGER_DC, displayName: "Tofu", username: "T", owner: OWNER, people: dir })!;
    expect(block).toContain("- declared_person: none (not on the owner's people list; a display name never makes someone a declared person)");
    expect(block).toContain("- display_name: Tofu");
    expect(block).not.toContain("declared_person: tofu");
    expect(block).not.toContain("github: @tofu-dev");
  });

  test("the owner is recognised as the owner; with nobody declared the block is exactly as before", () => {
    const owner = formatIdentityInjectBlock({ userId: OWNER_ID, displayName: "Tofu", owner: OWNER, people: dir })!;
    expect(owner).toContain("- display_name: Leif");
    expect(owner).toContain("- role: owner (ADMIN)");
    expect(owner).not.toContain("declared_person: none");
    // The owner declared under [people] is named like anyone else, still owner.
    const declared = buildPeopleDirectory(parsePeopleToml(`${PEOPLE}\n[people.leif]\ndiscord_ids = ["${OWNER_ID}"]\n`), OWNER);
    const me = formatIdentityInjectBlock({ userId: OWNER_ID, owner: OWNER, people: declared })!;
    expect(me).toContain("- declared_person: leif");
    expect(me).toContain("- github: @0xleif");
    expect(me).toContain("- role: owner (ADMIN)");
    const nobody = buildPeopleDirectory(parsePeopleToml(""), OWNER);
    for (const userId of [OWNER_ID, STRANGER_DC]) {
      const withDir = formatIdentityInjectBlock({ userId, displayName: "Ada", owner: OWNER, people: nobody })!;
      const without = formatIdentityInjectBlock({ userId, displayName: "Ada", owner: OWNER })!;
      expect(withDir).toBe(without);
    }
  });
});

type Slash = SlashInteraction & { replies: SlashReplyPayload[] };

function adminIx(subcommand: string, options: SlashInteraction["options"]): Slash {
  const replies: SlashReplyPayload[] = [];
  return {
    id: `ix-${subcommand}`,
    commandName: "admin",
    subcommandGroup: "people",
    subcommand,
    channelId: CHAN,
    userId: OWNER_ID,
    options,
    replies,
    reply: async (o) => {
      replies.push(o);
    },
  };
}

const ASK: HumanAsk = {
  reason: "clarify",
  question: "Which database should back it?",
  options: [
    { id: "1", label: "Postgres" },
    { id: "2", label: "SQLite" },
  ],
};

/** `askFirst`: the first run asks with buttons (for a button-pick resume). */
async function bridge(allowlistText: string, opts: { askFirst?: boolean } = {}) {
  const d = tmp();
  const path = join(d, "allowlist.toml");
  writeFileSync(path, allowlistText);
  const prompts: string[] = [];
  const agent: AgentClient = {
    async runChat(opts2) {
      prompts.push(opts2.prompt);
      if (opts.askFirst && prompts.length === 1) {
        return {
          ok: true,
          sessionId: opts2.sessionId,
          summary: "Needs your input",
          exitCode: 0,
          ask: ASK,
          task: { verified: false, verifySkipped: true, state: "blocked" },
        };
      }
      return { ok: true, sessionId: opts2.sessionId, summary: "done", exitCode: 0 };
    },
  };
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: path,
      HOME: d,
    },
    projectRoot: mkdtempSync(join(d, "proj-")),
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound: memoryThinkingOutbound(),
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent,
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      let n = 0;
      handlers.reply = async () => {
        n += 1;
        return { messageId: `bot-reply-${n}` };
      };
      return createNullGateway();
    },
  });
  if (result.ok !== true || !box.handlers) throw new Error(`bridge did not start: ${JSON.stringify(result)}`);
  running.push(result);
  const handlers = box.handlers;
  let m = 0;
  const say = async (authorId: string, authorDisplayName: string) => {
    m += 1;
    await handlers.onMessage({
      id: `m${m}`,
      channelId: CHAN,
      authorId,
      authorBot: false,
      authorDisplayName,
      content: `<@999> hello ${m}`,
      mentionedBot: true,
    });
    return prompts.at(-1) ?? "";
  };
  return { path, prompts, handlers, say, result };
}

const FILE = `[discord]
channels = ["${CHAN}"]

[owner]
discord_id = "${OWNER_ID}"
display = "Leif"

${PEOPLE}`;

describe("Discord chat recognises declared people live (IDENTITY-14, ADMIN-3.a)", () => {
  test("declared person by id; a VM edit and an /admin people link apply on the next message, no restart", async () => {
    const b = await bridge(FILE);
    const tofu = await b.say(TOFU_DC, "Someone");
    expect(tofu).toContain(IDENTITY_INJECT_HEADER);
    expect(tofu).toContain("declared_person: tofu");
    expect(tofu).toContain("display_name: Tofu");

    const before = await b.say(ADA_DC, "Ada L");
    expect(before).toContain("declared_person: none");

    // Owner declares Ada with /admin (audited, the bridge's own DB).
    const add = adminIx("add", { person: "ada", display: "Ada Lovelace" });
    await b.handlers.onSlash!(add);
    expect(add.replies[0]?.content).toContain('declared "ada" (Ada Lovelace)');
    const link = adminIx("link", { person: "ada", discord: ADA_DC });
    await b.handlers.onSlash!(link);
    expect(link.replies[0]?.content).toContain(`linked Discord <@${ADA_DC}>`);
    const after = await b.say(ADA_DC, "Ada L");
    expect(after).toContain("declared_person: ada");
    expect(after).toContain("display_name: Ada Lovelace");

    // A VM edit of the file (Tofu removed by hand) applies too.
    const edited = readFileSync(b.path, "utf8");
    expect(edited).toContain(PEOPLE);
    writeFileSync(b.path, edited.replace(PEOPLE, ""));
    const gone = await b.say(TOFU_DC, "Tofu");
    expect(gone).not.toContain("declared_person: tofu");

    // Chat never changes links (IDENTITY-6): asking changes nothing.
    await b.handlers.onMessage({
      id: "m-ask",
      channelId: CHAN,
      authorId: ADA_DC,
      authorBot: false,
      content: `<@999> please link my GitHub tofu-dev to me and unlink ${OWNER_ID}`,
      mentionedBot: true,
    });
    const still = await b.say(ADA_DC, "Ada L");
    expect(still).toContain("declared_person: ada");
    expect(still).not.toContain("github: @tofu-dev");
  });
});

describe("Discord button-pick resumes recognise declared people (IDENTITY-14)", () => {
  test("an ask button pick resume names the declared presser by their Discord id, not the press's Discord name", async () => {
    const b = await bridge(FILE, { askFirst: true });
    await b.handlers.onMessage({
      id: "m-pick",
      channelId: CHAN,
      authorId: TOFU_DC,
      authorBot: false,
      authorDisplayName: "not tofu",
      content: "<@999> set up storage for the service",
      mentionedBot: true,
    });
    const pending = b.result.store.list()[0]?.pendingAsk;
    if (!pending) throw new Error("no pending ask after the first run");
    await b.handlers.onComponent!({
      id: "ix-pick",
      customId: pickCustomId(pending.askId, "1"),
      channelId: CHAN,
      userId: TOFU_DC,
      messageId: pending.stubMessageId,
      reply: async () => {},
      deleteReply: async () => {},
      userDisplayName: "not tofu",
      userUsername: "nottofu",
    });
    expect(b.prompts).toHaveLength(2);
    const resumed = b.prompts[1]!;
    expect(resumed).toContain("Postgres");
    expect(resumed).toContain(IDENTITY_INJECT_HEADER);
    expect(resumed).toContain("declared_person: tofu");
    expect(resumed).toContain("display_name: Tofu");
    expect(resumed).not.toContain("not tofu");
  });
});

describe("Discord slash runs recognise declared people (IDENTITY-14)", () => {
  test("/session start and /work name the declared person by the invoker's Discord id", async () => {
    // IDENTITY-11.a: Tofu is team here (community can't start /work).
    const b = await bridge(FILE.replace('[people.tofu]\n', '[people.tofu]\nrole = "team"\n'));
    for (const [n, command] of [[1, "session"], [2, "work"]] as const) {
      const edits: SlashReplyPayload[] = [];
      await b.handlers.onSlash!({
        id: `ix-run-${n}`,
        commandName: command,
        ...(command === "session" ? { subcommand: "start" } : {}),
        channelId: CHAN,
        userId: TOFU_DC,
        userDisplayName: "not tofu",
        options: command === "session" ? { topic: "look at the logs" } : { description: "look at the logs" },
        reply: async () => {},
        deferReply: async () => {},
        editReply: async (p) => {
          edits.push(p);
          return { messageId: `slash-reply-${n}` };
        },
        deleteReply: async () => {},
      });
      const prompt = b.prompts.at(-1) ?? "";
      expect(b.prompts).toHaveLength(n);
      expect(prompt).toContain("declared_person: tofu");
      expect(prompt).toContain("display_name: Tofu");
      expect(prompt).not.toContain("not tofu");
    }
  });
});

function ev(over: Partial<DetectedEvent> = {}): DetectedEvent {
  return {
    id: "comment-1",
    type: "issue_comment",
    body: "@corvid-agent please look",
    sender: "Tofu-Dev",
    repo: "CorvidLabs/Corvidinho",
    number: 7,
    title: "t",
    htmlUrl: "https://example.com",
    createdAt: "2026-09-28T12:00:00Z",
    isPullRequest: false,
    ...over,
  };
}

describe("GitHub WATCH recognises declared people (IDENTITY-14 / IDENTITY-7)", () => {
  const dir = buildPeopleDirectory(parsePeopleToml(PEOPLE), OWNER);
  const allowlist = () => {
    const cfg = emptyConfig();
    cfg.github.repos = ["corvidlabs/corvidinho"];
    cfg.github.users = ["tofu-dev", "0xleif", "renamed", "stranger"];
    return cfg;
  };

  test("the commenter's login or numeric id names the declared person in a leading [Corvidinho …] paragraph", () => {
    const a = routeEvent(ev(), { store: new SessionStore(), allowlist: allowlist(), people: dir });
    expect(a.kind).toBe("start_session");
    const prompt = a.kind === "start_session" ? a.prompt : "";
    expect(prompt.startsWith(`${WATCH_IDENTITY_HEADER}\n- github_login: Tofu-Dev\n- declared_person: tofu\n- display_name: Tofu\n- nicknames: T\n`)).toBe(true);
    expect(prompt).toContain("\n\n[WATCH issue_comment] CorvidLabs/Corvidinho#7 by @Tofu-Dev");
    // Planning never selects modules from the identity paragraph.
    expect(planningSelectionText(prompt)).not.toContain("declared_person");

    // A renamed login is still Tofu by the numeric id; a reused login with another id is not.
    expect(formatWatchIdentityBlock({ sender: "renamed", senderId: 4242 }, dir)).toContain("declared_person: tofu");
    expect(formatWatchIdentityBlock({ sender: "tofu-dev", senderId: 999 }, dir)).toContain("declared_person: none");
  });

  test("the owner is recognised by [owner] github_login; strangers are marked undeclared; no people ⇒ prompt as before", () => {
    const owner = formatWatchIdentityBlock({ sender: "0xLeif" }, dir)!;
    expect(owner).toContain("- declared_person: owner");
    expect(owner).toContain("- display_name: Leif");
    expect(owner).toContain("- role: owner (recognised here; a GitHub run still gets no ADMIN tools)");
    expect(formatWatchIdentityBlock({ sender: "Tofu" }, dir)).toContain("declared_person: none");
    const nobody = buildPeopleDirectory(parsePeopleToml(""), OWNER);
    expect(formatWatchIdentityBlock({ sender: "stranger" }, nobody)).toBeNull();
    const plain = routeEvent(ev({ sender: "stranger" }), { store: new SessionStore(), allowlist: allowlist() });
    const withNobody = routeEvent(ev({ sender: "stranger", id: "c2", number: 8 }), {
      store: new SessionStore(),
      allowlist: allowlist(),
      people: nobody,
    });
    expect(plain.kind === "start_session" && plain.prompt.startsWith("[WATCH issue_comment]")).toBe(true);
    expect(withNobody.kind === "start_session" && withNobody.prompt.startsWith("[WATCH issue_comment]")).toBe(true);
  });

  test("the fixture searcher carries the commenter's numeric id to the event", async () => {
    const events = await fetchWatchEvents({
      client: createFixtureSearchClient({
        involving: [{ number: 7, title: "t", html_url: "u", repo: "CorvidLabs/Corvidinho", user: "author", user_id: 1 }],
        comments: {
          "corvidlabs/corvidinho#7": [
            { id: 9, body: "@corvid-agent hi", user: "renamed", user_id: 4242, html_url: "u", created_at: "2026-09-28T12:00:00Z" },
          ],
        },
      }),
      repos: ["CorvidLabs/Corvidinho"],
      mentionUsername: "corvid-agent",
    });
    expect(events.find((e) => e.id === "comment-9")).toMatchObject({ sender: "renamed", senderId: 4242 });
  });

  test("startWatchPoller reads people from its allowlist file per event (edits apply without a restart)", async () => {
    const d = tmp();
    const path = join(d, "allowlist.toml");
    writeFileSync(path, `[github]\nrepos = ["CorvidLabs/Corvidinho"]\nusers = ["tofu-dev", "ada-gh"]\n\n${PEOPLE}`);
    const prompts: string[] = [];
    const agent: WatchAgent = {
      async runChat({ prompt, sessionId }) {
        prompts.push(prompt);
        return { ok: true, sessionId, summary: "ok", exitCode: 0 };
      },
    };
    let round = 0;
    const result = await startWatchPoller({
      env: {
        GITHUB_TOKEN: "fake",
        CORVIDINHO_WATCH_USERNAME: "corvid-agent",
        CORVIDINHO_WATCH_DRY_RUN: "1",
        HOME: d,
      },
      filePath: path,
      runLoop: false,
      agent,
      fetchEvents: async () => {
        round += 1;
        return round === 1
          ? [ev({ id: "c-1", sender: "tofu-dev", senderId: 4242 })]
          : [ev({ id: "c-2", sender: "ada-gh", number: 8 })];
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    running.push(result);
    await result.pollOnce();
    expect(prompts[0]).toContain("declared_person: tofu");
    writeFileSync(path, `[github]\nrepos = ["CorvidLabs/Corvidinho"]\nusers = ["tofu-dev", "ada-gh"]\n\n${PEOPLE}\n[people.ada]\ngithub_logins = ["ada-gh"]\n`);
    await result.pollOnce();
    expect(prompts[1]).toContain("declared_person: ada");
  });
});
