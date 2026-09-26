/**
 * Memory plugins (REQ-plugins-010) + ACL hardening (REQ-plugins-011):
 * identity/ADMIN only from bridge env, handler-time ADMIN, two-phase confirm.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setConfirmTurnForTests } from "../src/memory/index.ts";
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
] as const;

/** Owner snowflakes — ADMIN is owner-only (IDENTITY-2). */
const BOSS = "900000000000000001";
const BOSS2 = "900000000000000002";

let saved: Record<string, string | undefined> = {};
let dir = "";

function actAs(userId: string | undefined, isAdminBit = false): void {
  if (userId === undefined) delete process.env.CORVIDINHO_ACTING_DISCORD_USER_ID;
  else process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = userId;
  process.env.CORVIDINHO_ACTING_IS_ADMIN = isAdminBit ? "1" : "0";
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

/** The human replies with the token in a new message (bridge-extracted). */
function humanSays(token: string): void {
  process.env.CORVIDINHO_ACTING_CONFIRM_TOKENS = token;
}

let turn = 0;
function newTurn(): void {
  turn += 1;
  const t = `turn-${turn}`;
  setConfirmTurnForTests(() => t);
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  dir = mkdtempSync(join(tmpdir(), "corvidinho-memplug-"));
  process.env.CORVIDINHO_DATA_DIR = dir;
  process.env.CORVIDINHO_ALLOWLIST_FILE = join(dir, "no-allowlist.toml");
  newTurn();
  clearRegistry();
  loadBuiltins();
});

afterEach(() => {
  setConfirmTurnForTests(null);
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
      expect(r.error).toContain("is not accepted");
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
      expect(r.error).toBe("not authorized");
    }
    const deleted = await run("memory-recall", ["--include-deleted"]);
    expect(deleted.ok).toBe(false);
    expect(deleted.error).toBe("not authorized");
  });

  test("self-forget by a non-admin is refused opaquely", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    const id = await storeAs("u1", "k", "content-u1");
    actAs("u1");
    const r = await run("memory-forget", ["--id", id]);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("not authorized");
    expect(JSON.stringify(r)).not.toContain("content-u1");
  });

  test("admin forget is two-phase: token, same-turn refused, new turn ok, replay refused", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    const id = await storeAs("u1", "k", "content-u1");
    actAs(BOSS, true);

    const phase1 = await run("memory-forget", ["--id", id]);
    expect(phase1.ok).toBe(true);
    const pending = phase1.data as { pending: boolean; confirmToken: string; ownerUserId: string };
    expect(pending.pending).toBe(true);
    expect(pending.ownerUserId).toBe("u1");
    expect(JSON.stringify(phase1)).not.toContain("content-u1");

    const bare = await run("memory-forget", ["--id", id, "--confirm"]);
    expect(bare.ok).toBe(false);
    expect(bare.error).toContain("token from phase 1");

    const sameTurn = await run("memory-forget", ["--id", id, "--confirm", pending.confirmToken]);
    expect(sameTurn.ok).toBe(false);
    expect(sameTurn.error).toContain("new message/turn");

    newTurn();
    const notHuman = await run("memory-forget", ["--id", id, "--confirm", pending.confirmToken]);
    expect(notHuman.ok).toBe(false);
    expect(notHuman.error).toContain("must come from the human");
    humanSays(pending.confirmToken);
    const ok = await run("memory-forget", ["--id", id, "--confirm", pending.confirmToken]);
    expect(ok.ok).toBe(true);
    expect(ok.message).toContain(`by ${BOSS}`);
    expect(JSON.stringify(ok)).not.toContain("content-u1");

    newTurn();
    const replay = await run("memory-forget", ["--id", id, "--confirm", pending.confirmToken]);
    expect(replay.ok).toBe(false);

    actAs("u1");
    const after = await run("memory-recall", []);
    expect(after.data).toEqual([]);
  });

  test("confirm token is bound to the memory id and actor", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    const a = await storeAs("u1", "a", "A");
    const b = await storeAs("u1", "b", "B");
    actAs(BOSS, true);
    const p1 = await run("memory-forget", ["--id", a]);
    const token = (p1.data as { confirmToken: string }).confirmToken;
    newTurn();
    const wrongId = await run("memory-forget", ["--id", b, "--confirm", token]);
    expect(wrongId.ok).toBe(false);
    expect(wrongId.error).toContain("does not match");
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS2;
    actAs(BOSS2, true);
    const wrongActor = await run("memory-forget", ["--id", a, "--confirm", token]);
    expect(wrongActor.ok).toBe(false);
    expect(wrongActor.error).toContain("does not match");
  });

  test("override binds content across phases", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    const id = await storeAs("u1", "k", "old");
    actAs(BOSS, true);
    const p1 = await run("memory-override", ["--id", id, "--content", "new value"]);
    expect(p1.ok).toBe(true);
    const token = (p1.data as { confirmToken: string }).confirmToken;
    newTurn();
    humanSays(token);
    const swapped = await run("memory-override", ["--id", id, "--confirm", token, "--content", "evil value"]);
    expect(swapped.ok).toBe(false);
    const ok = await run("memory-override", ["--id", id, "--confirm", token, "--content", "new value"]);
    expect(ok.ok).toBe(true);
    actAs("u1");
    const after = await run("memory-recall", []);
    expect((after.data as Array<{ content: string }>)[0]?.content).toBe("new value");
  });

  test("deny-listed or muted owner is never ADMIN", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    const id = await storeAs("u1", "k", "v");
    process.env.CORVIDINHO_DISCORD_DENY_USERS = BOSS;
    actAs(BOSS, true);
    expect((await run("memory-forget", ["--id", id])).error).toBe("not authorized");
    delete process.env.CORVIDINHO_DISCORD_DENY_USERS;
    process.env.DISCORD_MUTED_USER_IDS = BOSS;
    expect((await run("memory-forget", ["--id", id])).error).toBe("not authorized");
  });

  test("admin user/role lists no longer grant memory ADMIN (IDENTITY-2)", async () => {
    const id = await storeAs("u1", "k", "v");
    process.env.CORVIDINHO_DISCORD_ADMIN_USERS = "mod";
    process.env.CORVIDINHO_DISCORD_ADMIN_ROLES = "role-admin";
    actAs("mod", true);
    expect((await run("memory-forget", ["--id", id])).error).toBe("not authorized");
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    expect((await run("memory-forget", ["--id", id])).error).toBe("not authorized");
    actAs(BOSS, true);
    expect((await run("memory-forget", ["--id", id])).ok).toBe(true);
  });

  test("--include-deleted is ADMIN-only", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    const id = await storeAs(BOSS, "k", "gone soon");
    actAs(BOSS, true);
    const p1 = await run("memory-forget", ["--id", id]);
    newTurn();
    humanSays((p1.data as { confirmToken: string }).confirmToken);
    await run("memory-forget", ["--id", id, "--confirm", (p1.data as { confirmToken: string }).confirmToken]);
    const adminView = await run("memory-recall", ["--include-deleted"]);
    expect(adminView.ok).toBe(true);
    expect((adminView.data as unknown[]).length).toBe(1);

    await storeAs("u1", "k", "mine");
    actAs("u1");
    const nonAdmin = await run("memory-recall", ["--include-deleted"]);
    expect(nonAdmin.ok).toBe(false);
    expect(nonAdmin.error).toBe("not authorized");
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
    expect((await run("memory-forget", ["--id", id])).error).toBe("not authorized");
    actAs(BOSS, true);
    expect((await run("memory-forget", ["--id", id])).ok).toBe(true);
  });

  test("override phase-1 hint names the content requirement", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    const id = await storeAs("u1", "k", "old");
    actAs(BOSS, true);
    const p1 = await run("memory-override", ["--id", id, "--content", "new"]);
    expect(p1.message).toContain("--content");
  });

  test("--include-deleted=false stays off; =true needs ADMIN", async () => {
    await storeAs("u1", "k", "v");
    actAs("u1");
    const off = await run("memory-recall", ["--include-deleted=false"]);
    expect(off.ok).toBe(true);
    const on = await run("memory-recall", ["--include-deleted=true"]);
    expect(on.error).toBe("not authorized");
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

  test("--confirm=TOKEN form works", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = BOSS;
    const id = await storeAs("u1", "k", "v");
    actAs(BOSS, true);
    const p1 = await run("memory-forget", ["--id", id]);
    newTurn();
    humanSays((p1.data as { confirmToken: string }).confirmToken);
    const ok = await run("memory-forget", ["--id", id, `--confirm=${(p1.data as { confirmToken: string }).confirmToken}`]);
    expect(ok.ok).toBe(true);
  });
});

describe("configured owner is ADMIN for memory (IDENTITY-1 / REQ-plugins-042)", () => {
  test("owner with the bridge bit may forget; without the bit may not; owner id alone never grants", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = "111111111111111111";
    const id = await storeAs("u1", "k", "v");
    actAs("111111111111111111", false);
    expect((await run("memory-forget", ["--id", id])).error).toBe("not authorized");
    actAs("111111111111111111", true);
    const p1 = await run("memory-forget", ["--id", id]);
    expect(p1.ok).toBe(true);
    actAs("222222222222222222", true);
    expect((await run("memory-forget", ["--id", id])).error).toBe("not authorized");
  });

  test("muted or deny-listed owner is not ADMIN", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = "111111111111111111";
    const id = await storeAs("u1", "k", "v");
    process.env.DISCORD_MUTED_USER_IDS = "111111111111111111";
    actAs("111111111111111111", true);
    expect((await run("memory-forget", ["--id", id])).error).toBe("not authorized");
  });
});
