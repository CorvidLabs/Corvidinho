import { describe, expect, test } from "bun:test";
import {
  extractConstraintSections,
  loadRelevantSpecs,
  planningSelectionText,
  selectRelevantSpecs,
} from "../src/agent/specLoader.ts";

const root = import.meta.dir + "/..";

describe("specLoader (Merlin steal)", () => {
  test("selectRelevantSpecs orders by score", () => {
    const picks = selectRelevantSpecs(
      "Refactor the agent loop and plugins tools",
      ["agent", "plugins", "cli", "fledge-protocol"],
      3,
    );
    const names = picks.map((p) => p.name);
    expect(names).toContain("agent");
    expect(names).toContain("plugins");
  });

  test("selectRelevantSpecs no match returns empty", () => {
    expect(
      selectRelevantSpecs("xylophone unicycle", ["agent", "plugins"], 3),
    ).toEqual([]);
  });

  test("selectRelevantSpecs alphabetical tiebreak", () => {
    const picks = selectRelevantSpecs("agent", ["zulu-agent", "alpha-agent"], 2);
    expect(picks[0]!.name).toBe("alpha-agent");
    expect(picks[1]!.name).toBe("zulu-agent");
  });

  test("extractConstraintSections picks known sections", () => {
    const doc = `---
module: x
---

# X

## Purpose

Does things.

## Public API

foo()

## Invariants

1. Never panic.

## Other

ignore me

## Error Cases

| E | When |
`;
    const extracted = extractConstraintSections("x", doc);
    expect(extracted).toContain("# Spec: x");
    expect(extracted).toContain("## Purpose");
    expect(extracted).toContain("Does things.");
    expect(extracted).toContain("## Invariants");
    expect(extracted).toContain("Never panic.");
    expect(extracted).toContain("## Public API");
    expect(extracted).not.toContain("ignore me");
  });

  test("loadRelevantSpecs briefs agent module from this repo", () => {
    const text = loadRelevantSpecs({
      cwd: root,
      task: "Improve the agent prove-before-done loop",
      topN: 2,
    });
    expect(text).toContain("# Spec: agent");
    expect(text).toContain("## Purpose");
  });

  test("planningSelectionText drops bridge context, keeps the request", () => {
    const discord =
      "[Corvidinho memory for this Discord user — use these facts]\n- person/tone: short discord replies\n\n" +
      "[Corvidinho acting Discord user — use these facts]\n- discord_user_id: 42\n\n" +
      "fix the agent loop retry";
    const text = planningSelectionText(discord);
    expect(text).toBe("fix the agent loop retry");
    expect(selectRelevantSpecs(text, ["agent", "discord"], 3).map((p) => p.name)).toEqual([
      "agent",
    ]);

    const watch = planningSelectionText(
      "[WATCH issue_comment] org/repo#1 by @x\nTitle: plugins crash\n\n[image: discord.png (image/png)]",
    );
    expect(watch).toContain("org/repo#1 by @x");
    expect(watch).toContain("Title: plugins crash");
    expect(watch).not.toContain("WATCH");
    // Lower-case brackets are the human's own text and still count.
    expect(watch).toContain("[image: discord.png");

    const plain = "Refactor the agent loop and plugins tools";
    expect(planningSelectionText(plain)).toBe(plain);
  });
});
