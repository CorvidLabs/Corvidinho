/**
 * MEMORY-8 / MEMORY-9 (#67) helpers: ranked recall terms and scoring
 * (src/memory/rank.ts), the GitHub subject and repo project scope
 * (src/memory/scope.ts), the WATCH memory inject (src/watch/memory-inject.ts)
 * and the recall-before-"I don't know" guard (src/agent/recall-guard.ts).
 * Pure or in-memory; no network.
 */
import { describe, expect, test } from "bun:test";
import {
  claimsIgnorance,
  injectedMemorySearches,
  memoryRecallSearchKind,
  memorySearchQuery,
  RECALL_BEFORE_IGNORANCE_HEADER,
  searchMemoryBeforeIgnorance,
  taskHasMemorySearch,
} from "../src/agent/recall-guard.ts";
import { buildPeopleDirectory, parsePeopleToml } from "../src/identity/people.ts";
import {
  memorySubjectForGithub,
  MemoryStore,
  projectScopeForRepo,
  rankMemories,
  recallRelevantThenRecent,
  recallTerms,
  type MemoryRecord,
} from "../src/memory/index.ts";
import { stemTerm } from "../src/memory/rank.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import {
  enrichWatchPromptWithMemories,
  WATCH_MEMORY_INJECT_EMPTY,
  WATCH_MEMORY_INJECT_HEADER,
  WATCH_MEMORY_ROW_MAX_CHARS,
  WATCH_PROJECT_MEMORY_INJECT_HEADER,
} from "../src/watch/memory-inject.ts";

const OWNER = { discordId: "100000000000000001", display: "Leif", githubLogin: "0xleif", githubId: "8268288" };
const PEOPLE = `[people.tofu]
display = "Tofu"
discord_ids = ["200000000000000002"]
github_logins = ["tofu-dev"]
github_ids = ["4242"]
`;
const dir = buildPeopleDirectory(parsePeopleToml(PEOPLE), OWNER);

function rec(over: Partial<MemoryRecord>): MemoryRecord {
  return {
    id: over.key ?? "id",
    ownerUserId: "u1",
    category: "entity",
    key: "k",
    content: "",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe("recallTerms / stemTerm", () => {
  test("question words and short words drop out; terms are lowercased, stemmed and unique", () => {
    expect(recallTerms("What is Tofu's timezone? Who knows TOFU")).toEqual(["tofu", "timezone", "know"]);
    expect(recallTerms("who are you?")).toEqual([]);
    expect(recallTerms(undefined)).toEqual([]);
  });
  test("light stem: plural s, ing, ed; ss and short words kept", () => {
    expect(["tests", "deployed", "running", "class", "is", "uses"].map(stemTerm)).toEqual([
      "test",
      "deploy",
      "runn",
      "class",
      "is",
      "use",
    ]);
  });
});

describe("rankMemories", () => {
  test("rarer terms weigh more; key hits count double; rows with no hit are dropped", () => {
    const rows = [
      rec({ key: "a", content: "tofu likes tea", updatedAt: 3 }),
      rec({ key: "b", content: "tofu uses helix", updatedAt: 2 }),
      rec({ key: "helix", content: "editor notes", updatedAt: 1 }),
      rec({ key: "c", content: "unrelated", updatedAt: 4 }),
    ];
    const ranked = rankMemories(rows, "tofu helix", 10).map((r) => r.record.key);
    expect(ranked).toEqual(["b", "helix", "a"]);
  });
  test("recency lowers the score of old rows but never below 3/4 of relevance", () => {
    const day = 24 * 60 * 60 * 1000;
    const now = 400 * day;
    const [fresh, old] = rankMemories(
      [rec({ key: "old", content: "deploy", updatedAt: 0 }), rec({ key: "fresh", content: "deploy", updatedAt: now })],
      "deploy",
      now,
    );
    expect(fresh!.record.key).toBe("fresh");
    expect(old!.score).toBeGreaterThanOrEqual(fresh!.score * 0.75);
  });
});

describe("MemoryStore.recall with a query and recallRelevantThenRecent", () => {
  test("multi-scope search keeps the newest of a key once; private notes stay out", () => {
    const db = openCorvidinhoDb({ memory: true });
    let t = 1000;
    const store = new MemoryStore({ db, now: () => t });
    store.store({ ownerUserId: "d1", category: "preference", key: "timezone", content: "old tz Europe/Paris" });
    t += 10;
    store.store({ ownerUserId: "person:p", category: "preference", key: "timezone", content: "tz Europe/Oslo" });
    store.store({ ownerUserId: "person:p", category: "private", key: "timezone-note", content: "private tz" });
    const rows = store.recall({ ownerUserId: "person:p", scopes: ["person:p", "d1"], query: "timezone" });
    expect(rows.map((r) => r.content)).toEqual(["tz Europe/Oslo"]);
    db.close();
  });
  test("a query of only question words matches as one substring, newest first (as before)", () => {
    const db = openCorvidinhoDb({ memory: true });
    let t = 1000;
    const store = new MemoryStore({ db, now: () => t });
    store.store({ ownerUserId: "u", category: "entity", key: "a", content: "who am i" });
    t += 10;
    store.store({ ownerUserId: "u", category: "entity", key: "b", content: "nothing" });
    expect(store.recall({ ownerUserId: "u", query: "who am" }).map((r) => r.key)).toEqual(["a"]);
    db.close();
  });
  test("relevant rows first, then the newest to fill; no query ⇒ newest only", () => {
    const db = openCorvidinhoDb({ memory: true });
    let t = 1000;
    const store = new MemoryStore({ db, now: () => t });
    store.store({ ownerUserId: "u", category: "entity", key: "release", content: "Fridays" });
    for (let i = 0; i < 5; i++) {
      t += 10;
      store.store({ ownerUserId: "u", category: "conversation", key: `c${i}`, content: `chat ${i}` });
    }
    expect(recallRelevantThenRecent(store, { ownerUserId: "u", query: "when is the release", limit: 3 }).map((r) => r.key)).toEqual([
      "release",
      "c4",
      "c3",
    ]);
    expect(recallRelevantThenRecent(store, { ownerUserId: "u", limit: 2 }).map((r) => r.key)).toEqual(["c4", "c3"]);
    db.close();
  });
});

describe("memorySubjectForGithub / projectScopeForRepo", () => {
  test("declared by numeric id only; a login alone, or with an id that differs, is nobody (IDENTITY-7.a)", () => {
    expect(memorySubjectForGithub(dir, { id: 4242 })?.writeScope).toBe("person:tofu");
    expect(memorySubjectForGithub(dir, { login: "renamed", id: "4242" })?.writeScope).toBe("person:tofu");
    expect(memorySubjectForGithub(dir, { login: "Tofu-Dev" })).toBeNull();
    expect(memorySubjectForGithub(dir, { login: "tofu-dev", id: "9" })).toBeNull();
    expect(memorySubjectForGithub(dir, { login: "stranger" })).toBeNull();
    expect(memorySubjectForGithub(null, { id: 4242 })).toBeNull();
  });
  test("the undeclared-under-[people] owner maps to their Discord-id scope by [owner] github_id", () => {
    const s = memorySubjectForGithub(dir, { login: "0xleif", id: 8268288 });
    expect(s?.writeScope).toBe(OWNER.discordId);
    expect(s?.role).toBe("owner");
    expect(memorySubjectForGithub(dir, { login: "0xleif" })).toBeNull();
    expect(memorySubjectForGithub(dir, { login: "0xleif", id: 1 })).toBeNull();
  });
  test("owner/repo only, lowercased", () => {
    expect(projectScopeForRepo("CorvidLabs/Corvidinho")).toEqual({
      scope: "project:corvidlabs/corvidinho",
      key: "corvidlabs/corvidinho",
    });
    for (const bad of ["", "nope", "a/b/c", "../x", "a/..", undefined]) {
      expect(projectScopeForRepo(bad)).toBeNull();
    }
  });
});

describe("enrichWatchPromptWithMemories", () => {
  const event = { sender: "tofu-dev", senderId: 4242, repo: "CorvidLabs/Corvidinho", title: "editor", body: "which editor do I use?" };

  test("declared: own block (empty one-liner when nothing stored); undeclared with no project rows: unchanged", () => {
    const db = openCorvidinhoDb({ memory: true });
    const store = new MemoryStore({ db });
    const mine = enrichWatchPromptWithMemories("PROMPT", store, { event, people: dir });
    expect(mine.prompt).toBe(`${WATCH_MEMORY_INJECT_HEADER}\n${WATCH_MEMORY_INJECT_EMPTY}\n\nPROMPT`);
    expect(mine.declared).toBe(true);
    const stranger = enrichWatchPromptWithMemories("PROMPT", store, { event: { ...event, sender: "x", senderId: 1 }, people: dir });
    expect(stranger).toEqual({ prompt: "PROMPT", count: 0, injected: false, declared: false });
    expect(enrichWatchPromptWithMemories("PROMPT", undefined, { event, people: dir }).injected).toBe(false);
    db.close();
  });

  test("the project block names the repo; long rows are clipped", () => {
    const db = openCorvidinhoDb({ memory: true });
    const store = new MemoryStore({ db });
    store.store({ ownerUserId: "project:corvidlabs/corvidinho", category: "entity", key: "editor", content: "x".repeat(3000) });
    const out = enrichWatchPromptWithMemories("PROMPT", store, { event: { ...event, sender: "x", senderId: 1 }, people: dir });
    expect(out.prompt).toContain(WATCH_PROJECT_MEMORY_INJECT_HEADER);
    expect(out.prompt).toContain("- project: corvidlabs/corvidinho");
    expect(out.prompt).not.toContain(WATCH_MEMORY_INJECT_HEADER);
    const line = out.prompt.split("\n").find((l) => l.startsWith("- entity/editor: "))!;
    expect(line.length).toBe("- entity/editor: ".length + WATCH_MEMORY_ROW_MAX_CHARS);
    db.close();
  });
});

describe("recall-guard", () => {
  test("claimsIgnorance: says it doesn't know / remember / have info; not ordinary replies", () => {
    for (const t of [
      "I don't know who Tofu is.",
      "Sorry, I do not have any information about that project.",
      "I have no record of that decision.",
      "I'm not sure who you mean.",
      "I can't recall that.",
      "I couldn't find any information on that repo.",
      "I didn’t know that.",
      "There is no stored memory about Ada.",
    ]) {
      expect(claimsIgnorance(t)).toBe(true);
    }
    for (const t of [
      "Done. Tests pass.",
      "I know Tofu: the release captain.",
      "Let me know if you don't know how.",
      "I couldn't find src/foo.ts, so I created it.",
      "",
      null,
    ]) {
      expect(claimsIgnorance(t)).toBe(false);
    }
  });

  test("taskHasMemorySearch / memorySearchQuery drop the harness blocks, the WATCH label and URLs", () => {
    const task = [
      "[Corvidinho acting GitHub user — recognised …]\n- github_login: tofu-dev",
      "[WATCH issue_comment] CorvidLabs/Corvidinho#7 by @tofu-dev\nTitle: editor question\nURL: https://github.com/x",
      "which editor do I use? see https://example.com/a",
    ].join("\n\n");
    expect(taskHasMemorySearch(task)).toBe(false);
    expect(taskHasMemorySearch(`[Corvidinho project memory — …]\n- project: x\n\n${task}`)).toBe(true);
    expect(memorySearchQuery(task)).toBe("CorvidLabs/Corvidinho#7 by @tofu-dev Title: editor question which editor do I use? see");
  });

  test("injectedMemorySearches: only the harness blocks at the head of the task count, own and project apart", () => {
    const own = "[Corvidinho memory for this Discord user — …]\n(no stored memories yet)";
    const project = "[Corvidinho project memory — …]\n- project: x";
    const id = "[Corvidinho acting Discord user — …]\n- discord_user_id: 1";
    expect(injectedMemorySearches(`${own}\n\n${project}\n\n${id}\n\nhi`)).toEqual({ own: true, project: true });
    expect(injectedMemorySearches(`${project}\n\n${id}\n\nwork on it`)).toEqual({ own: false, project: true });
    expect(injectedMemorySearches(`${id}\n\nwho is Ada?\n\n${own}\n\n${project}`)).toEqual({ own: false, project: false });
    expect(taskHasMemorySearch(`who is Ada?\n\n${own}`)).toBe(false);
    expect(memoryRecallSearchKind(["--query", "Ada"])).toBe("own");
    expect(memoryRecallSearchKind(["--person", "tofu"])).toBe("own");
    expect(memoryRecallSearchKind(["--project", "--query", "tests"])).toBe("project");
  });

  test("searchMemoryBeforeIgnorance: only the searches not yet run", async () => {
    const calls: string[][] = [];
    const run = async (argv: string[]) => {
      calls.push(argv);
      return { ok: true, data: [{ category: "entity", key: "k", content: argv[0] === "--project" ? "P" : "O" }], exitCode: 0 };
    };
    expect(await searchMemoryBeforeIgnorance({ taskText: "who is Tofu", run, searched: { project: true } })).toBe(
      `${RECALL_BEFORE_IGNORANCE_HEADER}\n- entity/k: O`,
    );
    expect(calls).toEqual([["--query", "who is Tofu"]]);
    calls.length = 0;
    expect(await searchMemoryBeforeIgnorance({ taskText: "who is Tofu", run, searched: { own: true, project: true } })).toBeNull();
    expect(calls).toEqual([]);
  });

  test("searchMemoryBeforeIgnorance: own rows then project rows; nothing (or refusals) ⇒ null", async () => {
    const calls: string[][] = [];
    const found = await searchMemoryBeforeIgnorance({
      taskText: "who is Tofu",
      run: async (argv) => {
        calls.push(argv);
        return argv[0] === "--project"
          ? { ok: true, data: [{ category: "entity", key: "k", content: "project fact" }], exitCode: 0 }
          : { ok: true, data: [{ category: "person", key: "tofu", content: "release captain" }], exitCode: 0 };
      },
    });
    expect(calls).toEqual([["--query", "who is Tofu"], ["--project", "--query", "who is Tofu"]]);
    expect(found).toBe(`${RECALL_BEFORE_IGNORANCE_HEADER}\n- person/tofu: release captain\nProject memory:\n- entity/k: project fact`);
    const none = await searchMemoryBeforeIgnorance({
      taskText: "who is Tofu",
      run: async () => ({ ok: false, error: "refused", exitCode: 2 }),
    });
    expect(none).toBeNull();
    expect(await searchMemoryBeforeIgnorance({ taskText: "[Corvidinho x]", run: async () => ({ ok: true, exitCode: 0 }) })).toBeNull();
  });
});
