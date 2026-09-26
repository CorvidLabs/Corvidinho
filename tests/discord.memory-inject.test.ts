/**
 * Discord MEMORY auto-recall inject (AGENT-7 / MEMORY-2/4) — fixture tests.
 */
import { describe, expect, test } from "bun:test";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { MemoryStore } from "../src/memory/index.ts";
import {
  enrichPromptWithMemories,
  formatMemoryInjectBlock,
  MEMORY_INJECT_EMPTY,
  MEMORY_INJECT_HEADER,
  MEMORY_INJECT_LIMIT,
} from "../src/discord/memory-inject.ts";
import { MEMORY_AGENT_SYSTEM_INSTRUCTIONS } from "../src/agent/execute.ts";
import { memoryCommands } from "../plugins/memory/commands.ts";
import { buildOpenAiTools } from "../src/agent/tools.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry } from "../src/plugins/registry.ts";

describe("formatMemoryInjectBlock", () => {
  test("empty → header + empty one-liner", () => {
    const block = formatMemoryInjectBlock([]);
    expect(block).toContain(MEMORY_INJECT_HEADER);
    expect(block).toContain(MEMORY_INJECT_EMPTY);
    expect(block).not.toContain("- person/");
  });

  test("rows → category/key bullets", () => {
    const block = formatMemoryInjectBlock([
      {
        category: "person",
        key: "identity",
        content: "Leif is the owner",
      },
      {
        category: "entity",
        key: "project",
        content: "Corvidinho",
      },
    ]);
    expect(block).toContain(MEMORY_INJECT_HEADER);
    expect(block).toContain("- person/identity: Leif is the owner");
    expect(block).toContain("- entity/project: Corvidinho");
    expect(block).not.toContain(MEMORY_INJECT_EMPTY);
  });
});

describe("enrichPromptWithMemories", () => {
  test("no store or blank user → unchanged, not injected", () => {
    const r1 = enrichPromptWithMemories("who am I", undefined, {
      ownerUserId: "181969874455756800",
    });
    expect(r1.injected).toBe(false);
    expect(r1.count).toBe(0);
    expect(r1.prompt).toBe("who am I");

    const db = openCorvidinhoDb({ memory: true });
    try {
      const store = new MemoryStore({ db });
      const r2 = enrichPromptWithMemories("who am I", store, {
        ownerUserId: "  ",
      });
      expect(r2.injected).toBe(false);
      expect(r2.prompt).toBe("who am I");
    } finally {
      db.close();
    }
  });

  test("empty scope still prepends empty one-liner", () => {
    const db = openCorvidinhoDb({ memory: true });
    try {
      const store = new MemoryStore({ db });
      const r = enrichPromptWithMemories("who am I", store, {
        ownerUserId: "181969874455756800",
      });
      expect(r.injected).toBe(true);
      expect(r.count).toBe(0);
      expect(r.prompt.startsWith(MEMORY_INJECT_HEADER)).toBe(true);
      expect(r.prompt).toContain(MEMORY_INJECT_EMPTY);
      expect(r.prompt).toContain("who am I");
      expect(r.prompt.indexOf(MEMORY_INJECT_HEADER)).toBeLessThan(
        r.prompt.indexOf("who am I"),
      );
    } finally {
      db.close();
    }
  });

  test("seeded identity is prepended for that Discord user only", () => {
    const db = openCorvidinhoDb({ memory: true });
    try {
      const store = new MemoryStore({ db });
      store.store({
        ownerUserId: "181969874455756800",
        category: "person",
        key: "identity",
        content: "Leif is the owner (lf.algo)",
      });
      store.store({
        ownerUserId: "999",
        category: "person",
        key: "identity",
        content: "Someone else",
      });

      const r = enrichPromptWithMemories("WHO AM I", store, {
        ownerUserId: "181969874455756800",
        limit: MEMORY_INJECT_LIMIT,
      });
      expect(r.injected).toBe(true);
      expect(r.count).toBe(1);
      expect(r.prompt).toContain("- person/identity: Leif is the owner (lf.algo)");
      expect(r.prompt).not.toContain("Someone else");
      expect(r.prompt).toContain("WHO AM I");
    } finally {
      db.close();
    }
  });
});

describe("MEMORY agent prompt + tool descriptions", () => {
  test("system instructions cover trust / store / recall / never invent", () => {
    expect(MEMORY_AGENT_SYSTEM_INSTRUCTIONS).toContain("Trust any [Corvidinho memory");
    expect(MEMORY_AGENT_SYSTEM_INSTRUCTIONS).toContain("memory-store");
    expect(MEMORY_AGENT_SYSTEM_INSTRUCTIONS).toContain("memory-recall");
    expect(MEMORY_AGENT_SYSTEM_INSTRUCTIONS).toContain("Never invent memories");
    expect(MEMORY_AGENT_SYSTEM_INSTRUCTIONS).toContain("--category");
    expect(MEMORY_AGENT_SYSTEM_INSTRUCTIONS).toContain("person");
  });

  test("memory-store / memory-recall descriptions include argv examples", () => {
    const store = memoryCommands.find((c) => c.name === "memory-store");
    const recall = memoryCommands.find((c) => c.name === "memory-recall");
    expect(store?.description).toContain("--category");
    expect(store?.description).toContain("person");
    expect(store?.description).toContain("identity");
    expect(recall?.description).toContain("BEFORE claiming");
    expect(recall?.description).toContain("--query");
  });

  test("OpenAI tool argv schema for memory-* mentions examples", () => {
    clearRegistry();
    loadBuiltins();
    const tools = buildOpenAiTools({ tier: "tool" });
    const storeTool = tools.find((t) => t.function.name === "memory-store");
    expect(storeTool).toBeTruthy();
    expect(storeTool!.function.parameters.properties.argv.description).toContain(
      "--category",
    );
    expect(storeTool!.function.description).toContain("Leif is the owner");
  });
});
