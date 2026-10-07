/**
 * Memory plugins (REQ-plugins-010) + ACL hardening (REQ-plugins-011):
 * identity/ADMIN only from bridge env, handler-time ADMIN, and the owner's
 * forget/override by id confirmed on a DM card, not a typed token
 * (SAFE-4 / SAFE-18.a; the card itself: tests/memory.forget-card.test.ts).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalStore } from "../src/approvals/store.ts";
import { setMemoryCardTestHooks } from "../src/memory/index.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry, list } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";

const ENV_KEYS = [
  "CORVIDINHO_DATA_DIR",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_DISCORD_ADMIN_USERS",
  "CORVIDINHO_DISCORD_ADMIN_ROLES",
  "CORVIDINHO_DISCORD_DENY_USERS",
  "DISCORD_MUTED_USER_IDS",
  "CORVIDINHO_MEMORY_INMEM",
  "CORVIDINHO_ACTING_CONFIRM_TOKENS",
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_DISCORD_REPLY_CHANNEL_ID",
  "CORVIDINHO_DISCORD_SESSION_ID",
] as const;

/** Owner snowflakes — ADMIN is owner-only (IDENTITY-2). */
const BOSS = "900000000000000001";
const BOSS2 = "900000000000000002";

let saved: Record<string, string | undefined> = {};
let dir = "";

/** A bridge-started run in a Discord conversation with `userId`. */
function actAs(userId: string | undefined, isAdminBit = false): void {
  if (userId === undefined) delete process.env.CORVIDINHO_ACTING_DISCORD_USER_ID;
  else process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = userId;
  process.env.CORVIDINHO_ACTING_IS_ADMIN = isAdminBit ? "1" : "0";
  process.env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID = "100000000000000001";
}

function run(name: string, args: string[]) {
  return runPlugin({
    name,
    args,
    nonInteractive: true,
    allowlist: ["memory-forget", "memory-override"],
  });
}

async function storeAs(userId: string, key: string, content: string): Promise<string> {
  actAs(userId);
  const r = await run("memory-store", ["--category", "person", "--key", key, content]);
  expect(r.ok).toBe(true);
  return (r.data as { id: string }).id;
}

/** Cards the owner was asked on (SAFE-18.a), with what they show. */
let cards: Array<{ id: string; action: string; target: string; text?: string }> = [];

/** The owner answers every memory card at once (the card engine itself: memory.forget-card.test.ts). */
function ownerAnswers(answer: "approved" | "denied" | "none"): void {
  setMemoryCardTestHooks({
    ttlMs: answer === "none" ? 40 : 2_000,
    pollMs: 5,
    onRequest: (req, db) => {
      cards.push({ id: req.id, action: req.action, target: req.target, ...(req.text !== undefined ? { text: req.text } : {}) });
      if (answer !== "none") new ApprovalStore({ db }).decide(req.id, answer, { by: BOSS });
    },
  });
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  dir = mkdtempSync(join(tmpdir(), "corvidinho-memplug-"));
  process.env.CORVIDINHO_DATA_DIR = dir;
  process.env.CORVIDINHO_ALLOWLIST_FILE = join(dir, "no-allowlist.toml");
  cards = [];
  ownerAnswers("approved");
  clearRegistry();
  loadBuiltins();
});

afterEach(() => {
  setMemoryCardTestHooks({});
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
});

describe("memory plugins (REQ-plugins-010)", () => {
  test("plugins list includes memory-* with danger markings", () => {
    const names = list().map((e) => e.name);
    expect(names).toContain("memory-store");
    expect(names).toContain("memory-recall");
    expect(names).toContain("memory-forget");
    expect(names).toContain("memory-override");
    expect(list().find((e) => e.name === "memory-forget")?.dangerous).toBe(true);
    expect(list().find((e) => e.name === "memory-override")?.dangerous).toBe(true);
    expect(list().find((e) => e.name === "memory-store")?.dangerous).toBe(false);
  });

  test("store/recall act only in the env actor's scope", async () => {
    await storeAs("u1", "leif", "likes corvids");
    actAs("u1");
    const mine = await run("memory-recall", []);
    expect(mine.ok).toBe(true);
    expect((mine.data as unknown[]).length).toBe(1);

    actAs("u2");
    const theirs = await run("memory-recall", []);
    expect(theirs.ok).toBe(true);
    expect(theirs.data).toEqual([]);
  });

  test("no acting user env ⇒ refused", async () => {
    actAs(undefined);
    for (const name of ["memory-store", "memory-recall"]) {
      const r = await run(name, ["--category", "person", "--key", "k", "v"]);
      expect(r.ok).toBe(false);
      expect(r.error).toContain("no acting user");
    }
    actAs("");
    const empty = await run("memory-recall", []);
    expect(empty.ok).toBe(false);
  });
});

describe("memory ACL hardening (REQ-plugins-011)", () => {
  test("--user/--admin/--db argv refused on every memory command", async () => {
    const id = await storeAs("victim", "secret", "victim private note");
    actAs("attacker");
    const attempts: Array<[string, string[]]> = [
      ["memory-recall", ["--user", "victim"]],
      ["memory-recall", ["--user=victim"]],
      ["memory-store", ["--user", "victim", "--category", "person", "--key", "secret", "pwned"]],
      ["memory-store", ["--db", join(dir, "evil.db"), "--category", "person", "--key", "k", "v"]],
      ["memory-forget", ["--id", id, "--admin"]],
      ["memory-forget", ["--id", id, "--user", "victim", "--admin"]],
      ["memory-override", ["--id", id, "--admin=1", "new"]],
    ];
    for (const [name, args] of attempts) {
      const r = await run(name, args);
      expect(r.ok).toBe(false);
      // Mutating forget/override may hit ROLES-CHAT-3 before argv parse;
      // store/recall still refuse --user/--admin/--db at the handler.
      expect(r.error ?? "").toMatch(/is not accepted|not allowed for your role/);
      expect(JSON.stringify(r)).not.toContain("victim private note");
    }
    actAs("victim");
    const still = await run("memory-recall", []);
    expect((still.data as Array<{ content: string }>)[0]?.content).toBe(
      "victim private note",
    );
  });

  test("empty admin lists ⇒ deny-all even with CORVIDINHO_ACTING_IS_ADMIN=1", async () => {
    const id = await storeAs("u1", "k", "content-u1");
    actAs("u1", true);
    for (const name of ["memory-forget", "memory-override"]) {
      const r = await run(name, ["--id", id, "replacement"]);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/not authorized|not allowed for your role/);
    }
    const deleted = await run("memory-recall", ["--include-deleted"]);
    expect(deleted.ok).toBe(false);
    expect(deleted.error).toMatch(/not authorized|not allowed for your role/);
  });

  test("self-forget by a non-admin is refused opaquely", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    const id = await storeAs("u1", "k", "content-u1");
    actAs("u1");
    const r = await run("memory-forget", ["--id", id]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not authorized|not allowed for your role/);
    expect(JSON.stringify(r)).not.toContain("content-u1");
  });

  test("SAFE-18.a: the owner's forget asks on a DM card and forgets once approved; no token, no content", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    const id = await storeAs("u1", "k", "content-u1");
    actAs(BOSS, true);

    const ok = await run("memory-forget", ["--id", id]);
    expect(ok.ok).toBe(true);
    expect(ok.message).toContain(`forgot memory ${id} (person/k, owner u1) by ${BOSS}`);
    expect(ok.message).toContain(`DM card ${cards[0]!.id}`);
    expect(JSON.stringify(ok)).not.toContain("content-u1");
    expect(JSON.stringify(ok)).not.toContain("confirmToken");
    expect(cards).toHaveLength(1);
    expect(cards[0]!.action).toContain("memory-forget");
    expect(cards[0]!.target).toContain(`memory ${id} — person/k, owner scope u1`);

    // Gone: a second forget finds nothing and raises no card.
    const again = await run("memory-forget", ["--id", id]);
    expect(again.ok).toBe(false);
    expect(cards).toHaveLength(1);

    actAs("u1");
    const after = await run("memory-recall", []);
    expect(after.data).toEqual([]);
  });

  test("SAFE-18.a: --confirm is refused — there are no confirm tokens; no card, nothing forgotten", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    const id = await storeAs("u1", "k", "kept");
    actAs(BOSS, true);
    const token = `mc1.${Date.now() + 60_000}.turn-1.${"a".repeat(64)}`;
    process.env.CORVIDINHO_ACTING_CONFIRM_TOKENS = token;
    for (const args of [["--id", id, "--confirm", token], ["--id", id, `--confirm=${token}`], ["--id", id, "--confirm"]]) {
      const r = await run("memory-forget", args);
      expect(r.ok).toBe(false);
      expect(r.error).toContain("no confirm tokens");
    }
    expect(cards).toHaveLength(0);
    actAs("u1");
    expect(((await run("memory-recall", [])).data as unknown[]).length).toBe(1);
  });

  test("SAFE-18.a: override shows the new text word for word and stores exactly it once approved", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    const id = await storeAs("u1", "k", "old");
    actAs(BOSS, true);
    const ok = await run("memory-override", ["--id", id, "--content", "new value"]);
    expect(ok.ok).toBe(true);
    expect(ok.message).toContain(`overrode memory ${id}`);
    expect(cards[0]!.text).toBe("new value");
    actAs("u1");
    const after = await run("memory-recall", []);
    expect((after.data as Array<{ content: string }>)[0]?.content).toBe("new value");
  });

  test("SAFE-20: denied or unanswered cards change nothing", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    const id = await storeAs("u1", "k", "old");
    actAs(BOSS, true);
    ownerAnswers("denied");
    const denied = await run("memory-override", ["--id", id, "--content", "new"]);
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain("the owner denied");
    ownerAnswers("none");
    const lapsed = await run("memory-forget", ["--id", id]);
    expect(lapsed.ok).toBe(false);
    expect(lapsed.error).toContain("no answer");
    actAs("u1");
    expect((await run("memory-recall", [])).data).toMatchObject([{ content: "old" }]);
  });

  test("deny-listed or muted owner is never ADMIN", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    const id = await storeAs("u1", "k", "v");
    process.env.CORVIDINHO_DISCORD_DENY_USERS = BOSS;
    actAs(BOSS, true);
    expect((await run("memory-forget", ["--id", id])).error).toMatch(/not authorized|not allowed for your role/);
    delete process.env.CORVIDINHO_DISCORD_DENY_USERS;
    process.env.DISCORD_MUTED_USER_IDS = BOSS;
    expect((await run("memory-forget", ["--id", id])).error).toMatch(/not authorized|not allowed for your role/);
  });

  test("admin user/role lists no longer grant memory ADMIN (IDENTITY-2)", async () => {
    const id = await storeAs("u1", "k", "v");
    process.env.CORVIDINHO_DISCORD_ADMIN_USERS = "mod";
    process.env.CORVIDINHO_DISCORD_ADMIN_ROLES = "role-admin";
    actAs("mod", true);
    expect((await run("memory-forget", ["--id", id])).error).toMatch(/not authorized|not allowed for your role/);
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    expect((await run("memory-forget", ["--id", id])).error).toMatch(/not authorized|not allowed for your role/);
    actAs(BOSS, true);
    expect((await run("memory-forget", ["--id", id])).ok).toBe(true);
  });

  test("--include-deleted is ADMIN-only", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    const id = await storeAs(BOSS, "k", "gone soon");
    actAs(BOSS, true);
    expect((await run("memory-forget", ["--id", id])).ok).toBe(true);
    const adminView = await run("memory-recall", ["--include-deleted"]);
    expect(adminView.ok).toBe(true);
    expect((adminView.data as unknown[]).length).toBe(1);

    await storeAs("u1", "k", "mine");
    actAs("u1");
    const nonAdmin = await run("memory-recall", ["--include-deleted"]);
    expect(nonAdmin.ok).toBe(false);
    expect(nonAdmin.error).toMatch(/not authorized|not allowed for your role/);
  });

  test("dangerous forget/override still SAFE-1 denied without allowlist", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    const id = await storeAs("u1", "k", "v");
    actAs(BOSS, true);
    const r = await runPlugin({
      name: "memory-forget",
      args: ["--id", id],
      nonInteractive: true,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("SAFE-1");
  });
});

describe("memory ACL hardening — review follow-ups", () => {
  test("owner id without the bridge bit (e.g. scheduled run) is not ADMIN", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    const id = await storeAs("u1", "k", "v");
    actAs(BOSS, false);
    expect((await run("memory-forget", ["--id", id])).error).toMatch(/not authorized|not allowed for your role/);
    actAs(BOSS, true);
    expect((await run("memory-forget", ["--id", id])).ok).toBe(true);
  });

  test("override with no new text is a usage error naming the content; no card", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    const id = await storeAs("u1", "k", "old");
    actAs(BOSS, true);
    const r = await run("memory-override", ["--id", id]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("<content>");
    expect(cards).toHaveLength(0);
  });

  test("--include-deleted=false stays off; =true needs ADMIN", async () => {
    await storeAs("u1", "k", "v");
    actAs("u1");
    const off = await run("memory-recall", ["--include-deleted=false"]);
    expect(off.ok).toBe(true);
    const on = await run("memory-recall", ["--include-deleted=true"]);
    expect(on.error).toMatch(/not authorized|not allowed for your role/);
  });

  test("identity-looking words in content are fine after `--` or in --content=", async () => {
    actAs("u1");
    const viaSep = await run("memory-store", ["person", "tip", "--", "always", "pass", "--admin", "to", "sudo"]);
    expect(viaSep.ok).toBe(true);
    expect((viaSep.data as { content: string }).content).toBe("always pass --admin to sudo");
    const viaEq = await run("memory-store", ["--category", "person", "--key", "tip2", "--content=use --user flag"]);
    expect(viaEq.ok).toBe(true);
    const bare = await run("memory-store", ["person", "tip3", "pass", "--admin"]);
    expect(bare.ok).toBe(false);
    expect(bare.error).toContain("after `--`");
  });

  test("the override's text may hold the word --confirm after `--`; it is data, not a token", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    const id = await storeAs("u1", "k", "v");
    actAs(BOSS, true);
    const ok = await run("memory-override", ["--id", id, "--", "always", "--confirm", "first"]);
    expect(ok.ok).toBe(true);
    expect(cards[0]!.text).toBe("always --confirm first");
  });
});

describe("configured owner is ADMIN for memory (IDENTITY-1 / REQ-plugins-042)", () => {
  test("owner with the bridge bit may forget; without the bit may not; owner id alone never grants", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = "111111111111111111";
    const id = await storeAs("u1", "k", "v");
    actAs("111111111111111111", false);
    expect((await run("memory-forget", ["--id", id])).error).toMatch(/not authorized|not allowed for your role/);
    actAs("111111111111111111", true);
    const done = await run("memory-forget", ["--id", id]);
    expect(done.ok).toBe(true);
    actAs("222222222222222222", true);
    expect((await run("memory-forget", ["--id", id])).error).toMatch(/not authorized|not allowed for your role/);
  });

  test("muted or deny-listed owner is not ADMIN", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = "111111111111111111";
    const id = await storeAs("u1", "k", "v");
    process.env.DISCORD_MUTED_USER_IDS = "111111111111111111";
    actAs("111111111111111111", true);
    expect((await run("memory-forget", ["--id", id])).error).toMatch(/not authorized|not allowed for your role/);
  });
});
