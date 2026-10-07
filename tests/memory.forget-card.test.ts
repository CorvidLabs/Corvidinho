/**
 * SAFE-18.a (Leif's 2026-09-28 interview, round 17; REQ-plugins-183 /
 * REQ-discord-183): "My own memory forget and override by id ask me on a DM
 * card with Approve and a one-time code, and an override shows the new text
 * word for word." The card is SAFE-4's two-phase confirm; there is no typed
 * token any more.
 *
 * The real card engine (`createApprovalCards` with `memoryApprovalKind`) and
 * recording DMs answer the card the memory plugins' run waits on; a fake
 * model provider drives one owner chat through `createTaskExecute`. Temp
 * data dir per test; no token, no network.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskExecute, type AgentEvent } from "../src/agent/index.ts";
import { toolDefForEntry } from "../src/agent/tools.ts";
import { ApprovalStore, type ApprovalRequest } from "../src/approvals/store.ts";
import { createApprovalCards, memoryApprovalKind } from "../src/discord/approval-cards.ts";
import { parseApproveCardCustomId } from "../src/discord/approve-card.ts";
import { MEMORY_CARD_KIND, MemoryStore, setMemoryCardTestHooks } from "../src/memory/index.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { approveWithCode, cardInteraction } from "./fixtures/approval-code.ts";
import { FAKE_LLM_ENV } from "./fixtures/fake-llm.ts";

const OWNER = "900000000000000001";
const MEMBER = "900000000000000003";
const CHANNEL = "100000000000000001";
const SID = "sess_forgetcard0001";

const KEYS = [
  "CORVIDINHO_DATA_DIR",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_ROLE",
  "CORVIDINHO_ACTING_WORK_TASK",
  "CORVIDINHO_ACTING_SURFACE",
  "CORVIDINHO_ACTING_CONFIRM_TOKENS",
  "CORVIDINHO_ACTING_GITHUB_LOGIN",
  "CORVIDINHO_ACTING_GITHUB_ID",
  "CORVIDINHO_ACTING_GITHUB_REPO",
  "CORVIDINHO_DISCORD_SESSION_ID",
  "CORVIDINHO_DISCORD_REPLY_CHANNEL_ID",
  "CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID",
  "CORVIDINHO_DISCORD_DENY_USERS",
  "DISCORD_MUTED_USER_IDS",
  "CORVIDINHO_DELEGATE_DEPTH",
  "CORVIDINHO_MEMORY_INMEM",
] as const;

let saved: Record<string, string | undefined> = {};
let dir = "";

/** A run the bridge started for a Discord conversation with `userId`. */
function chatAs(userId: string, owner: boolean): void {
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = userId;
  process.env.CORVIDINHO_ACTING_IS_ADMIN = owner ? "1" : "0";
  process.env.CORVIDINHO_ACTING_ROLE = owner ? "owner" : "community";
  process.env.CORVIDINHO_ACTING_SURFACE = "chat";
  process.env.CORVIDINHO_DISCORD_SESSION_ID = SID;
  process.env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID = CHANNEL;
}

beforeEach(() => {
  saved = {};
  for (const k of KEYS) saved[k] = process.env[k];
  for (const k of KEYS) delete process.env[k];
  dir = mkdtempSync(join(tmpdir(), "corvidinho-forgetcard-"));
  process.env.CORVIDINHO_DATA_DIR = dir;
  process.env.CORVIDINHO_ALLOWLIST_FILE = join(dir, "no-allowlist.toml");
  process.env.CORVIDINHO_OWNER_DISCORD_ID = OWNER;
  clearRegistry();
  loadBuiltins();
});

afterEach(() => {
  setMemoryCardTestHooks({});
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
});

function withDb<T>(fn: (db: ReturnType<typeof openCorvidinhoDb>) => T): T {
  const db = openCorvidinhoDb({ env: process.env });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/** A memory of `owner` scope, written as the bridge would store it. */
function remember(owner: string, key: string, content: string): string {
  return withDb((db) => new MemoryStore({ db }).store({ ownerUserId: owner, category: "person", key, content }).id);
}

function memory(id: string) {
  return withDb((db) => new MemoryStore({ db }).getById(id));
}

function requests(): ApprovalRequest[] {
  return withDb((db) => {
    const ids = db.query("SELECT id FROM approval_requests ORDER BY created_at, rowid").all() as { id: string }[];
    const store = new ApprovalStore({ db });
    return ids.map((r) => store.get(r.id)!);
  });
}

function auditActions(): string[] {
  return withDb((db) =>
    (db.query("SELECT action, outcome FROM audit_log ORDER BY seq").all() as { action: string; outcome: string }[]).map(
      (r) => `${r.action}:${r.outcome}`,
    ),
  );
}

type Dm = { userId: string; content: string; components?: unknown[] };

/** The bridge's card engine with the memory kind and recording DMs. */
function engine() {
  const db = openCorvidinhoDb({ env: process.env });
  const dms: Dm[] = [];
  const cards = createApprovalCards({
    db,
    env: {},
    owner: () => ({ discordId: OWNER }),
    sendDm: async (o) => {
      dms.push(o);
      return { channelId: `dm-${o.userId}`, messageId: `m${dms.length}` };
    },
    editMessage: async () => true,
    kinds: [memoryApprovalKind({ db })],
  });
  const handlers = {
    onComponent: async (ix: Parameters<typeof cards.press>[0]) => {
      await cards.press(ix, parseApproveCardCustomId(ix.customId)!, ix.userId === OWNER);
    },
  };
  return { db, dms, cards, handlers };
}

type Engine = ReturnType<typeof engine>;

function button(dms: Dm[], decision: "approve" | "deny"): string {
  const card = dms.find((d) => d.components);
  const ids = ((card?.components ?? []) as { components: { custom_id: string }[] }[]).flatMap((r) =>
    r.components.map((c) => c.custom_id),
  );
  return ids.find((id) => id.includes(`:${decision}:`))!;
}

const cardOf = (dms: Dm[]) => dms.find((d) => d.components)!.content;

/**
 * Run `name` as the model would (non-interactive, allowlisted) while the
 * owner answers its card on the engine with `answer` once it is DMed.
 */
async function runAnswered(
  name: string,
  args: string[],
  answer: (e: Engine) => Promise<void>,
  opts: { ttlMs?: number; signal?: AbortSignal } = {},
) {
  const e = engine();
  let answering: Promise<void> | null = null;
  setMemoryCardTestHooks({
    ttlMs: opts.ttlMs ?? 60_000,
    pollMs: 5,
    onRequest: () => {
      answering = (async () => {
        await e.cards.deliver();
        await answer(e);
      })();
    },
  });
  try {
    const r = await runPlugin({
      name,
      args,
      nonInteractive: true,
      allowlist: ["memory-forget", "memory-override"],
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
    await answering;
    return { r, e };
  } catch (err) {
    e.db.close();
    throw err;
  }
}

describe("SAFE-18.a: my forget by id asks me on a DM card with Approve and a one-time code", () => {
  test("the card shows the exact action, target and amount; Approve alone forgets nothing; Approve + the code forgets it once", async () => {
    const id = remember("u1", "home", "lives in Oslo");
    chatAs(OWNER, true);
    let afterPress: ReturnType<typeof memory>;
    const { r, e } = await runAnswered("memory-forget", ["--id", id], async (en) => {
      // Approve alone: the code step, nothing forgotten yet.
      await cardInteraction(en.handlers, OWNER, button(en.dms, "approve"));
      await Bun.sleep(30);
      afterPress = memory(id);
      await approveWithCode(en.handlers, en.dms, OWNER, button(en.dms, "approve"));
    });
    try {
      expect(afterPress!.deletedAt).toBeUndefined();
      expect(r.ok).toBe(true);
      expect(r.message).toContain(`forgot memory ${id} (person/home, owner u1) by ${OWNER}`);
      expect(JSON.stringify(r)).not.toContain("lives in Oslo");
      expect(memory(id)!.deletedAt).toBeNumber();

      // The card: to the owner, by DM, with the exact action, target and amount.
      const card = cardOf(e.dms);
      expect(e.dms.find((d) => d.components)!.userId).toBe(OWNER);
      expect(card).toContain(`Forget a memory by id (SAFE-18.a) · from discord:${SID}`);
      expect(card).toContain("Action: memory-forget: forget this memory");
      expect(card).toContain(`Target: memory ${id} — person/home, owner scope u1, last changed `);
      expect(card).toContain("Amount: 1 memory (no money)");
      expect(card).toContain("Approve also needs a one-time code");
      expect(card).not.toContain("lives in Oslo");
      expect(button(e.dms, "approve")).toStartWith(`cvok:${MEMORY_CARD_KIND}:approve:`);

      const [req] = requests();
      expect(req!.kind).toBe(MEMORY_CARD_KIND);
      expect(req!.class).toBe("destructive");
      expect(req!.requester).toBe(OWNER);
      expect(req!.status).toBe("used");
      // SAFE-5: the card, the code and the approval are on the audit trail with the tool run.
      const audit = auditActions();
      for (const row of ["memory-card:ok", "approval-code-issue:ok", "memory-approve:started", "memory-approve:ok", "memory-forget:started", "memory-forget:ok"]) {
        expect(audit).toContain(row);
      }
    } finally {
      e.db.close();
    }
  });

  test("Deny is a no: the memory stays and the refusal says so (SAFE-20)", async () => {
    const id = remember("u1", "home", "lives in Oslo");
    chatAs(OWNER, true);
    const { r, e } = await runAnswered("memory-forget", ["--id", id], async (en) => {
      await cardInteraction(en.handlers, OWNER, button(en.dms, "deny"));
    });
    try {
      expect(r.ok).toBe(false);
      expect(r.error).toContain("the owner denied memory-forget of memory");
      expect((r.data as { outcome: string }).outcome).toBe("denied");
      expect(memory(id)!.deletedAt).toBeUndefined();
      expect(memory(id)!.content).toBe("lives in Oslo");
      expect(requests()[0]!.status).toBe("denied");
    } finally {
      e.db.close();
    }
  });

  test("no answer before the card lapses is a no; a late Approve does nothing (SAFE-20)", async () => {
    const id = remember("u1", "home", "lives in Oslo");
    chatAs(OWNER, true);
    const { r, e } = await runAnswered("memory-forget", ["--id", id], async () => {}, { ttlMs: 60 });
    try {
      expect(r.ok).toBe(false);
      expect(r.error).toContain("no answer on the owner's DM card");
      expect((r.data as { outcome: string }).outcome).toBe("expired");
      const late = await cardInteraction(e.handlers, OWNER, button(e.dms, "approve"));
      expect(JSON.stringify(late.replies)).toMatch(/Already closed|Expired/);
      expect(memory(id)!.deletedAt).toBeUndefined();
      expect(requests()[0]!.status).toBe("expired");
    } finally {
      e.db.close();
    }
  });

  test("a stopped run changes nothing (exit 130) and the card closes as a no", async () => {
    const id = remember("u1", "home", "lives in Oslo");
    chatAs(OWNER, true);
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 40);
    const { r, e } = await runAnswered("memory-forget", ["--id", id], async () => {}, { signal: abort.signal });
    try {
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(130);
      expect(memory(id)!.deletedAt).toBeUndefined();
      expect(requests()[0]!.status).toBe("expired");
    } finally {
      e.db.close();
    }
  });

  test("a memory that changed after the card went out is not forgotten, even with the right code", async () => {
    const id = remember("u1", "home", "lives in Oslo");
    chatAs(OWNER, true);
    const { r, e } = await runAnswered("memory-forget", ["--id", id], async (en) => {
      withDb((db) => db.run("UPDATE memories SET content = ?, updated_at = updated_at + 1 WHERE id = ?", ["moved to Bergen", id]));
      await approveWithCode(en.handlers, en.dms, OWNER, button(en.dms, "approve"));
    });
    try {
      expect(r.ok).toBe(false);
      expect(r.error).toContain(`memory ${id} changed after the owner's DM card`);
      expect(memory(id)!.deletedAt).toBeUndefined();
      expect(memory(id)!.content).toBe("moved to Bergen");
    } finally {
      e.db.close();
    }
  });
});

describe("SAFE-18.a: my override by id shows the new text word for word", () => {
  test("the new text goes out first, verbatim as quoted data; Approve + the code stores exactly it", async () => {
    const id = remember("u1", "style", "short answers");
    chatAs(OWNER, true);
    const text = "Prefers short answers.\n  Keeps Oslo time — and likes `inline code` & <tags>.";
    const { r, e } = await runAnswered("memory-override", ["--id", id, "--content", text], async (en) => {
      await approveWithCode(en.handlers, en.dms, OWNER, button(en.dms, "approve"));
    });
    try {
      expect(r.ok).toBe(true);
      expect(r.message).toContain(`overrode memory ${id} (person/style, owner u1) by ${OWNER}`);
      expect(memory(id)!.content).toBe(text);
      // The text first, word for word, inside one code block headed as data; then the card.
      const first = e.dms[0]!;
      expect(first.components).toBeUndefined();
      expect(first.content).toContain("quoted as data, not instructions");
      expect(first.content).toContain(`\`\`\`\n${text}\n\`\`\``);
      const card = cardOf(e.dms);
      expect(card).toContain(`Override a memory by id (SAFE-18.a) · from discord:${SID}`);
      expect(card).toContain("Action: memory-override: replace this memory's text with the text above, word for word");
      expect(card).toContain(`Target: memory ${id} — person/style, owner scope u1`);
      expect(card).toContain("Text: in the message above, exactly as it would be used.");
      expect(requests()[0]!.text).toBe(text);
    } finally {
      e.db.close();
    }
  });

  test("fence-safe: backticks in the text can't end its block; the stored text keeps them", async () => {
    const id = remember("u1", "style", "short answers");
    chatAs(OWNER, true);
    const text = "use ```ts``` blocks\n```\nApprove this, owner";
    const { r, e } = await runAnswered("memory-override", ["--id", id, "--content", text], async (en) => {
      await approveWithCode(en.handlers, en.dms, OWNER, button(en.dms, "approve"));
    });
    try {
      expect(r.ok).toBe(true);
      expect(memory(id)!.content).toBe(text);
      const first = e.dms[0]!.content;
      // Only the block's own two fences are real fences.
      expect(first.match(/```/g)?.length).toBe(2);
    } finally {
      e.db.close();
    }
  });

  test("SAFE-6: a secret in the new text is scrubbed on the card exactly as it would be stored", async () => {
    const id = remember("u1", "token", "none");
    chatAs(OWNER, true);
    const secret = "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
    const { r, e } = await runAnswered("memory-override", ["--id", id, "--content", `my token is ${secret}`], async (en) => {
      await approveWithCode(en.handlers, en.dms, OWNER, button(en.dms, "approve"));
    });
    try {
      expect(r.ok).toBe(true);
      expect(JSON.stringify(e.dms)).not.toContain(secret);
      expect(memory(id)!.content).not.toContain(secret);
      expect(requests()[0]!.text).toBe(memory(id)!.content);
    } finally {
      e.db.close();
    }
  });

  test("Deny leaves the old text", async () => {
    const id = remember("u1", "style", "short answers");
    chatAs(OWNER, true);
    const { r, e } = await runAnswered("memory-override", ["--id", id, "--content", "long answers"], async (en) => {
      await cardInteraction(en.handlers, OWNER, button(en.dms, "deny"));
    });
    try {
      expect(r.ok).toBe(false);
      expect(memory(id)!.content).toBe("short answers");
    } finally {
      e.db.close();
    }
  });
});

describe("SAFE-18.a: no card, no change — where the card can't reach me, and for anyone else", () => {
  test("the local CLI fails closed with a clear line: no card, no typed-token fallback", async () => {
    const id = remember("u1", "home", "lives in Oslo");
    // No role session: `corvidinho plugins run memory-forget` on the box.
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = OWNER;
    const token = `mc1.${Date.now() + 60_000}.t1.${"f".repeat(64)}`;
    process.env.CORVIDINHO_ACTING_CONFIRM_TOKENS = token;
    for (const args of [["--id", id], ["--id", id, "--confirm", token]]) {
      const r = await runPlugin({ name: "memory-forget", args, nonInteractive: true, allowlist: ["memory-forget"] });
      expect(r.ok).toBe(false);
      expect(r.error).toContain("only the running Discord bridge delivers it");
      expect(r.error).toContain("no typed-token fallback");
    }
    const ov = await runPlugin({
      name: "memory-override",
      args: ["--id", id, "--content", "x"],
      nonInteractive: true,
      allowlist: ["memory-override"],
    });
    expect(ov.error).toContain("only the running Discord bridge delivers it");
    expect(requests()).toHaveLength(0);
    expect(memory(id)!.deletedAt).toBeUndefined();
  });

  test("my schedule run (no conversation) fails closed too; no card", async () => {
    const id = remember("u1", "home", "lives in Oslo");
    chatAs(OWNER, true);
    process.env.CORVIDINHO_ACTING_SURFACE = "schedule";
    process.env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID = "";
    const r = await runPlugin({ name: "memory-forget", args: ["--id", id], nonInteractive: true, allowlist: ["memory-forget"] });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("only the running Discord bridge delivers it");
    expect(requests()).toHaveLength(0);
    expect(memory(id)!.deletedAt).toBeUndefined();
  });

  test("a typed token is refused in my chat as well: no card, nothing forgotten", async () => {
    const id = remember("u1", "home", "lives in Oslo");
    chatAs(OWNER, true);
    const r = await runPlugin({
      name: "memory-forget",
      args: ["--id", id, "--confirm", `mc1.1.t.${"0".repeat(64)}`],
      nonInteractive: true,
      allowlist: ["memory-forget"],
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("there are no confirm tokens any more");
    expect(requests()).toHaveLength(0);
  });

  test("anyone else is unchanged: refused as before, no card raised; their own forget-me still asks me on its own card", async () => {
    const id = remember("u1", "home", "lives in Oslo");
    chatAs(MEMBER, false);
    const r = await runPlugin({ name: "memory-forget", args: ["--id", id], nonInteractive: true, allowlist: ["memory-forget"] });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not allowed for your role|not authorized/);
    // Even with a forged ADMIN bit and owner stamp: the live owner check refuses.
    process.env.CORVIDINHO_ACTING_IS_ADMIN = "1";
    process.env.CORVIDINHO_ACTING_ROLE = "owner";
    const forged = await runPlugin({
      name: "memory-override",
      args: ["--id", id, "--content", "pwned"],
      nonInteractive: true,
      allowlist: ["memory-override"],
    });
    expect(forged.ok).toBe(false);
    expect(forged.error).toMatch(/not allowed for your role|not authorized/);
    expect(requests()).toHaveLength(0);
    expect(memory(id)!.content).toBe("lives in Oslo");

    chatAs(MEMBER, false);
    const me = await runPlugin({ name: "memory-forget-me", args: [] });
    expect(me.ok).toBe(true);
    expect(me.message).toContain("Asked the owner to approve forgetting");
    expect(requests()).toHaveLength(0);
    expect(withDb((db) => (db.query("SELECT COUNT(*) AS n FROM forget_requests").get() as { n: number }).n)).toBe(1);
  });

  test("a card whose waiting run is gone closes as a no on the engine's next pass", async () => {
    const id = remember("u1", "home", "lives in Oslo");
    const e = engine();
    try {
      const req = new ApprovalStore({ db: e.db }).request({
        kind: MEMORY_CARD_KIND,
        class: "destructive",
        title: "Forget a memory by id (SAFE-18.a) · from discord:x",
        action: "memory-forget: forget this memory",
        target: `memory ${id}`,
        amount: "1 memory (no money)",
        requester: OWNER,
        waiter: "999999:0",
        ttlMs: 60_000,
      });
      await e.cards.deliver();
      expect(new ApprovalStore({ db: e.db }).get(req.id)!.status).toBe("expired");
      expect(memory(id)!.deletedAt).toBeUndefined();
    } finally {
      e.db.close();
    }
  });
});

describe("SAFE-18.a end to end: the model's memory-forget call in my chat waits for my card", () => {
  test("fake model calls memory-forget; I approve with the code; the tool result says it was forgotten", async () => {
    const id = remember("u1", "home", "lives in Oslo");
    chatAs(OWNER, true);
    const e = engine();
    setMemoryCardTestHooks({
      ttlMs: 60_000,
      pollMs: 5,
      onRequest: () => {
        void (async () => {
          await e.cards.deliver();
          await approveWithCode(e.handlers, e.dms, OWNER, button(e.dms, "approve"));
        })();
      },
    });
    const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: { role: string }[] };
      const first = !(body.messages ?? []).some((m) => m.role === "tool");
      const message = first
        ? {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "c0", type: "function", function: { name: "memory-forget", arguments: JSON.stringify({ argv: ["--id", id] }) } },
            ],
          }
        : { role: "assistant", content: "Forgotten, as you approved." };
      return Response.json({ choices: [{ message }] });
    };
    const events: AgentEvent[] = [];
    try {
      const exec = createTaskExecute({
        taskText: "forget that memory",
        cwd: dir,
        env: { ...process.env, ...FAKE_LLM_ENV },
        fetchImpl,
        tier: "code",
        nonInteractive: true,
        allowlist: ["memory-forget"],
        autonomous: false,
        projectInstructions: false,
        onEvent: (ev) => events.push(ev),
        maxToolRounds: 2,
      });
      await exec({ attempt: 1, signal: new AbortController().signal });
      const result = events.find(
        (ev): ev is Extract<AgentEvent, { type: "ToolResult" }> => ev.type === "ToolResult" && ev.name === "memory-forget",
      );
      expect(result?.success).toBe(true);
      expect(result?.detail ?? "").toContain(`forgot memory ${id}`);
      expect(memory(id)!.deletedAt).toBeNumber();
      expect(requests()[0]!.status).toBe("used");
    } finally {
      e.db.close();
    }
  });
});

describe("SAFE-18.a: what the model is told", () => {
  test("the memory tools' argv hint and descriptions name the card and no confirm token", async () => {
    const hint = (toolDefForEntry({ name: "memory-forget", description: "" }).function.parameters as {
      properties: { argv: { description: string } };
    }).properties.argv.description;
    expect(hint).toContain("DM card");
    expect(hint).not.toContain("--confirm");
    const { get } = await import("../src/plugins/registry.ts");
    for (const name of ["memory-forget", "memory-override"]) {
      const d = get(name)!.description;
      expect(d).toContain("DM Approve/Deny card");
      expect(d).toContain("one-time code");
      expect(d).not.toContain("--confirm");
    }
    expect(get("memory-override")!.description).toContain("new text word for word");
  });
});
