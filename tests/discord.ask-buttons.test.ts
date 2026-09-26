/**
 * DISCORD-ASK-1..5 — ephemeral button asks: option parse, custom ids, expiry,
 * stub/ephemeral format. Fixtures only.
 */
import { describe, expect, test } from "bun:test";
import {
  normalizeAskOptions,
  parseChoicesFromQuestion,
  resolveAskOptions,
} from "../src/agent/ask-options.ts";
import { askFromToolArguments } from "../src/agent/ask.ts";
import {
  ASK_BUTTON_TTL_MS,
  ASK_CHOICE_EXPIRED,
  ASK_STUB_HINT,
  buildChoiceComponents,
  buildOpenStubComponents,
  findOptionLabel,
  formatAskEphemeralContent,
  formatAskStub,
  isAskExpired,
  openCustomId,
  parseAskCustomId,
  pickCustomId,
  toPendingAsk,
} from "../src/discord/ask-buttons.ts";

describe("ask-options (DISCORD-ASK-1)", () => {
  test("normalizeAskOptions needs ≥2 labels", () => {
    expect(normalizeAskOptions(["only"])).toBeUndefined();
    expect(normalizeAskOptions(["Postgres", "SQLite"])).toEqual([
      { id: "1", label: "Postgres" },
      { id: "2", label: "SQLite" },
    ]);
    expect(
      normalizeAskOptions([
        { id: "pg", label: "Postgres" },
        { id: "lite", label: "SQLite" },
      ]),
    ).toEqual([
      { id: "pg", label: "Postgres" },
      { id: "lite", label: "SQLite" },
    ]);
  });

  test("parseChoicesFromQuestion reads numbered lines", () => {
    const q = "Which DB?\n1. Postgres\n2. SQLite\n3. MySQL";
    expect(parseChoicesFromQuestion(q)?.map((o) => o.label)).toEqual([
      "Postgres",
      "SQLite",
      "MySQL",
    ]);
    expect(parseChoicesFromQuestion("Just pick something")).toBeUndefined();
  });

  test("ask-human tool args carry options", () => {
    const r = askFromToolArguments(
      JSON.stringify({
        question: "Which DB?",
        options: ["Postgres", "SQLite"],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ask.options?.map((o) => o.label)).toEqual(["Postgres", "SQLite"]);
  });

  test("resolveAskOptions prefers structured over parse", () => {
    const q = "Which?\n1. A\n2. B";
    expect(
      resolveAskOptions({ options: ["X", "Y"], question: q })?.map((o) => o.label),
    ).toEqual(["X", "Y"]);
    expect(resolveAskOptions({ question: q })?.map((o) => o.label)).toEqual([
      "A",
      "B",
    ]);
  });
});

describe("ask-buttons custom ids + expiry (DISCORD-ASK-2/5)", () => {
  test("open/pick custom ids round-trip", () => {
    expect(parseAskCustomId(openCustomId("abc123"))).toEqual({
      kind: "open",
      askId: "abc123",
    });
    expect(parseAskCustomId(pickCustomId("abc123", "2"))).toEqual({
      kind: "pick",
      askId: "abc123",
      optionId: "2",
    });
    expect(parseAskCustomId("nope")).toBeNull();
  });

  test("components: stub Choose + choice row", () => {
    const stub = buildOpenStubComponents("abc");
    expect(stub[0]!.components[0]!.label).toBe("Choose");
    expect(stub[0]!.components[0]!.custom_id).toBe(openCustomId("abc"));
    const choices = buildChoiceComponents("abc", [
      { id: "1", label: "Postgres" },
      { id: "2", label: "SQLite" },
    ]);
    expect(choices[0]!.components).toHaveLength(2);
    expect(findOptionLabel([{ id: "1", label: "Postgres" }], "1")).toBe(
      "Postgres",
    );
  });

  test("expiry after ~30 minutes", () => {
    const pending = toPendingAsk(
      { reason: "clarify", question: "x?", options: [{ id: "1", label: "a" }, { id: "2", label: "b" }] },
      { nowMs: 1_000_000, askId: "x" },
    );
    expect(pending.expiresAt).toBe(1_000_000 + ASK_BUTTON_TTL_MS);
    expect(isAskExpired(pending, 1_000_000 + ASK_BUTTON_TTL_MS - 1)).toBe(false);
    expect(isAskExpired(pending, 1_000_000 + ASK_BUTTON_TTL_MS)).toBe(true);
    expect(ASK_CHOICE_EXPIRED).toContain("expired");
  });

  test("stub hides MCQ; ephemeral shows question", () => {
    const ask = {
      reason: "clarify" as const,
      question: "Which DB?\n1. Postgres\n2. SQLite",
      options: [
        { id: "1", label: "Postgres" },
        { id: "2", label: "SQLite" },
      ],
    };
    const stub = formatAskStub({
      ask,
      requesterDiscordId: "user-1",
    });
    expect(stub.content).toContain(ASK_STUB_HINT);
    expect(stub.content).toContain("<@user-1>");
    expect(stub.content).not.toContain("Postgres");
    expect(stub.mentionUserIds).toEqual(["user-1"]);
    const eph = formatAskEphemeralContent(ask);
    expect(eph).toContain("Postgres");
    expect(eph).toContain(">");
  });
});
