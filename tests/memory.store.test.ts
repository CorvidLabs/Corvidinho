import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openCorvidinhoDb, SCHEMA_VERSION } from "../src/store/db.ts";
import {
  MemoryAclError,
  MemoryNotFoundError,
  MemoryStore,
} from "../src/memory/index.ts";

describe("MemoryStore (MEMORY-1..4 / MEMORY-ACL-1..5)", () => {
  test("schema migrates to v3", () => {
    const db = openCorvidinhoDb({ memory: true });
    const row = db
      .query("SELECT value FROM schema_meta WHERE key = 'version'")
      .get() as { value: string };
    expect(row.value).toBe(String(SCHEMA_VERSION));
    expect(SCHEMA_VERSION).toBe(4);
    const tables = db
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='memories'",
      )
      .get() as { name: string } | null;
    expect(tables?.name).toBe("memories");
    db.close();
  });

  test("store + recall by owner/category; four HI categories", () => {
    const db = openCorvidinhoDb({ memory: true });
    const store = new MemoryStore({ db });
    const cats = ["conversation", "entity", "person", "personality"] as const;
    for (const c of cats) {
      store.store({
        ownerUserId: "user-a",
        category: c,
        key: `k-${c}`,
        content: `note about ${c}`,
      });
    }
    const all = store.recall({ ownerUserId: "user-a" });
    expect(all.length).toBe(4);
    const persons = store.recall({ ownerUserId: "user-a", category: "person" });
    expect(persons.length).toBe(1);
    expect(persons[0]!.content).toContain("person");
    // Other owner sees nothing (ACL-1)
    expect(store.recall({ ownerUserId: "user-b" }).length).toBe(0);
    db.close();
  });

  test("MEMORY-4 reload after reopen DB", () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-mem-"));
    try {
      const path = join(dir, "corvidinho.db");
      const db1 = openCorvidinhoDb({ path });
      const s1 = new MemoryStore({ db: db1 });
      const rec = s1.store({
        ownerUserId: "u1",
        category: "conversation",
        key: "chat-1",
        content: "hello from before restart",
      });
      db1.close();

      const db2 = openCorvidinhoDb({ path });
      const s2 = new MemoryStore({ db: db2 });
      const rows = s2.recall({ ownerUserId: "u1" });
      expect(rows.map((r) => r.id)).toEqual([rec.id]);
      expect(rows[0]!.content).toBe("hello from before restart");
      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("non-admin cannot forget own or others (ACL-2/4); empty admin deny-all", () => {
    const db = openCorvidinhoDb({ memory: true });
    const store = new MemoryStore({ db });
    const mine = store.store({
      ownerUserId: "alice",
      category: "entity",
      key: "repo",
      content: "secret-alice",
    });
    const theirs = store.store({
      ownerUserId: "bob",
      category: "entity",
      key: "repo",
      content: "secret-bob",
    });

    expect(() =>
      store.forget({ actorUserId: "alice", id: mine.id, isAdmin: false }),
    ).toThrow(MemoryAclError);

    let threw: unknown;
    try {
      store.forget({ actorUserId: "alice", id: theirs.id, isAdmin: false });
    } catch (e) {
      threw = e;
    }
    expect(threw).toBeInstanceOf(MemoryAclError);
    expect(String(threw)).not.toContain("secret-bob");
    expect(String(threw)).not.toContain("secret-alice");

    // Still present
    expect(store.recall({ ownerUserId: "alice" })[0]!.content).toBe(
      "secret-alice",
    );
    expect(store.recall({ ownerUserId: "bob" })[0]!.content).toBe("secret-bob");
    db.close();
  });

  test("ADMIN forget soft-deletes with audit; override updates", () => {
    const db = openCorvidinhoDb({ memory: true });
    const store = new MemoryStore({ db, now: () => 1_700_000_000_000 });
    const theirs = store.store({
      ownerUserId: "bob",
      category: "personality",
      key: "tone",
      content: "old tone",
    });
    const overridden = store.override({
      actorUserId: "admin",
      id: theirs.id,
      content: "new tone",
      isAdmin: true,
    });
    expect(overridden.content).toBe("new tone");

    const forgotten = store.forget({
      actorUserId: "admin",
      id: theirs.id,
      isAdmin: true,
    });
    expect(forgotten.deletedAt).toBe(1_700_000_000_000);
    expect(forgotten.deletedByUserId).toBe("admin");
    expect(store.recall({ ownerUserId: "bob" }).length).toBe(0);
    expect(
      store.recall({ ownerUserId: "bob", includeDeleted: true }).length,
    ).toBe(1);

    // Missing id after delete → not found (opaque)
    expect(() =>
      store.forget({ actorUserId: "admin", id: theirs.id, isAdmin: true }),
    ).toThrow(MemoryNotFoundError);
    db.close();
  });

  test("own re-store keeps prior content as soft-deleted history (no non-admin forget)", () => {
    const db = openCorvidinhoDb({ memory: true });
    const store = new MemoryStore({ db });
    const a = store.store({
      ownerUserId: "alice",
      category: "person",
      key: "leif",
      content: "owner",
    });
    const b = store.store({
      ownerUserId: "alice",
      category: "person",
      key: "leif",
      content: "owner updated",
    });
    // Prior content is kept as a soft-deleted row, not overwritten (MEMORY-ACL-4).
    expect(b.id).not.toBe(a.id);
    expect(b.content).toBe("owner updated");
    const live = store.recall({ ownerUserId: "alice" });
    expect(live.map((r) => r.content)).toEqual(["owner updated"]);
    const all = store.recall({ ownerUserId: "alice", includeDeleted: true });
    expect(all.map((r) => r.content).sort()).toEqual(["owner", "owner updated"]);
    expect(all.find((r) => r.id === a.id)?.deletedByUserId).toBe("alice");
    db.close();
  });
});
