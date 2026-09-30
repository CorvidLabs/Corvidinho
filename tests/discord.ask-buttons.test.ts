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

describe("ask option ids are unique (DISCORD-ASK-1/3 / REQ-agent-045)", () => {
  const ids = (raw: unknown) => normalizeAskOptions(raw)?.map((o) => o.id);

  test("a repeated explicit id takes the first unused position number", () => {
    expect(
      normalizeAskOptions([
        { id: "x", label: "Keep" },
        { id: "x", label: "Drop" },
      ]),
    ).toEqual([
      { id: "x", label: "Keep" },
      { id: "1", label: "Drop" },
    ]);
    expect(
      ids([
        { id: "x", label: "A" },
        { id: "x", label: "B" },
        { id: "1", label: "C" },
      ]),
    ).toEqual(["x", "1", "2"]);
  });

  test("a position fallback that equals an earlier id is moved on", () => {
    // "✅" cleans to "" and falls back to its position, "2", already taken.
    expect(
      ids([
        { id: "2", label: "A" },
        { id: "✅", label: "B" },
      ]),
    ).toEqual(["2", "1"]);
    // A plain string takes its position "1"; the explicit "1" moves on.
    expect(ids(["Yes", { id: "1", label: "No" }])).toEqual(["1", "2"]);
  });

  test("ids that are equal once cut to 32 chars stay apart", () => {
    expect(
      ids([
        { id: "option_use_postgres_for_the_main_database", label: "DB" },
        { id: "option_use_postgres_for_the_main_cache", label: "Cache" },
      ]),
    ).toEqual(["option_use_postgres_for_the_main", "1"]);
  });

  test("a dropped empty option does not hold its id", () => {
    expect(
      ids([
        { id: "a", label: "  " },
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ]),
    ).toEqual(["a", "b"]);
  });

  test("already-unique options normalize byte-identically, again and again", () => {
    for (const raw of [
      ["Postgres", "SQLite"],
      [
        { id: "pg", label: "Postgres" },
        { id: "lite", label: "SQLite" },
      ],
      [{ id: "pg", label: "Postgres" }, "SQLite", { id: "3", label: "MySQL" }],
      [
        { id: "x", label: "Keep" },
        { id: "x", label: "Drop" },
      ],
    ]) {
      const once = normalizeAskOptions(raw)!;
      expect(JSON.stringify(normalizeAskOptions(once))).toBe(JSON.stringify(once));
    }
    expect(
      JSON.stringify(
        normalizeAskOptions([
          { id: "1", label: "Postgres" },
          { id: "2", label: "SQLite" },
        ]),
      ),
    ).toBe('[{"id":"1","label":"Postgres"},{"id":"2","label":"SQLite"}]');
  });

  test("ask-human args with one id twice give buttons with distinct custom ids", () => {
    const r = askFromToolArguments(
      JSON.stringify({
        question: "Which?",
        options: [
          { id: "x", label: "Keep" },
          { id: "x", label: "Drop" },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const options = r.ask.options!;
    const customIds = buildChoiceComponents("ask1", options)[0]!.components.map(
      (b) => b.custom_id,
    );
    expect(new Set(customIds).size).toBe(2);
    expect(findOptionLabel(options, options[1]!.id)).toBe("Drop");
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

describe("SAFE-6.a: choice labels are scrubbed before they are cut or posted", () => {
  // A fake GitHub token, built at runtime (never a real key).
  const token = "gh" + "p_" + "a1B2c3D4e5".repeat(4).slice(0, 36);
  const mark = "[redacted:github-token]";

  test("buildChoiceComponents posts a label that held a secret as [redacted:<kind>], cut after the scrub; custom_ids unchanged", () => {
    const whole = `Use ${token}`;
    // Pads the token so the 80-char cut falls inside it (on main the button
    // showed `ghp_` plus 19 raw characters, one short of the scrub pattern).
    const straddled = `${"x".repeat(55)} ${token} for the deploy`;
    const row = buildChoiceComponents("ask9", [
      { id: "1", label: whole },
      { id: "2", label: straddled },
      { id: "3", label: "Neither" },
    ])[0]!.components;
    expect(row.map((b) => b.label)).toEqual([
      `Use ${mark}`,
      `${"x".repeat(55)} ${mark}…`,
      "Neither",
    ]);
    expect(row.map((b) => b.custom_id)).toEqual(["1", "2", "3"].map((id) => pickCustomId("ask9", id)));
    expect(JSON.stringify(row)).not.toContain(token.slice(0, 4));
    for (const b of row) expect(b.label.length).toBeLessThanOrEqual(80);
  });

  test("the ephemeral pick shows the scrubbed labels of an ask resolved from raw options", () => {
    const options = resolveAskOptions({
      options: [`${"y".repeat(60)} ${token}`, `Keep ${token}`],
      question: "Which key?",
    })!;
    const posted = JSON.stringify({
      content: formatAskEphemeralContent({ reason: "clarify", question: "Which key?", options }),
      components: buildChoiceComponents("ask9", options),
    });
    expect(posted).not.toContain(token.slice(0, 4));
    // A marker the cut itself splits stays a marker piece, never the secret.
    expect(options.map((o) => o.label)).toEqual([
      `${`${"y".repeat(60)} ${mark}`.slice(0, 79)}…`,
      `Keep ${mark}`,
    ]);
  });
});
