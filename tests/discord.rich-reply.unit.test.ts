/**
 * DISCORD-15 / DISCORD-15.a / DISCORD-16 (#75, REQ-discord-075,
 * REQ-discord-457) — unit tests for src/discord/rich-reply.ts and the answer
 * footer in src/discord/thinking-status.ts: fence-safe splitting at Discord's
 * 2000-character limit, the ROLES-CHAT-3 note kept in the last part, SAFE-6
 * scrub before the split, the conservative embed pick (never for code), and
 * the footer's tokens / cost (unknown, never $0). No network, no Discord.
 */
import { describe, expect, test } from "bun:test";
import { costMicroUsd, formatUsd, priceForModel } from "../src/agent/spend.ts";
import { ROLE_REFUSED_SUMMARY_NOTE } from "../src/agent/task-summary.ts";
import {
  DISCORD_ANSWER_MAX,
  DISCORD_EMBED_DESCRIPTION_MAX,
  DISCORD_MESSAGE_MAX,
  answerSpendFor,
  planAnswerParts,
  postAnswerParts,
  readsBetterAsEmbed,
  splitDiscordMessage,
} from "../src/discord/rich-reply.ts";
import {
  THINKING_COLORS,
  buildAnswerFooterEmbed,
  formatAnswerFooter,
} from "../src/discord/thinking-status.ts";

const FENCE_LINE = /^```[A-Za-z0-9_+#.-]*$/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function fenceCount(text: string): number {
  return text.split("```").length - 1;
}

/** Non-blank lines of `parts`, minus the fence lines the split added. */
function textLines(parts: string[]): string[] {
  return parts
    .join("\n")
    .split("\n")
    .filter((l) => l.trim() && !FENCE_LINE.test(l));
}

function prose(n: number, tag: string): string {
  return Array.from({ length: n }, (_, i) => `${tag} line ${i}: some words of plain prose here.`).join("\n");
}

function codeBlock(n: number, lang = "ts"): string {
  return ["```" + lang, ...Array.from({ length: n }, (_, i) => `const v${i} = compute(${i}); // step ${i}`), "```"].join("\n");
}

describe("splitDiscordMessage (DISCORD-16)", () => {
  test("text within 2000 characters comes back as one part, unchanged", () => {
    const text = `${"x".repeat(DISCORD_MESSAGE_MAX - 5)}\n\`\`\`a`;
    expect(splitDiscordMessage(text)).toEqual([text]);
  });

  test("long prose splits on line breaks into parts of at most 2000, keeping every line in order", () => {
    const text = prose(150, "p");
    expect(text.length).toBeGreaterThan(2 * DISCORD_MESSAGE_MAX);
    const parts = splitDiscordMessage(text);
    expect(parts.length).toBeGreaterThanOrEqual(3);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(DISCORD_MESSAGE_MAX);
    expect(parts.join("\n")).toBe(text);
  });

  test("a code block longer than a part is closed at the part end and reopened with its language", () => {
    const text = `${prose(5, "intro")}\n${codeBlock(120, "ts")}\n${prose(5, "outro")}`;
    const parts = splitDiscordMessage(text);
    expect(parts.length).toBeGreaterThanOrEqual(3);
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(DISCORD_MESSAGE_MAX);
      // Every part renders on its own: its fences are balanced.
      expect(fenceCount(p) % 2).toBe(0);
    }
    // The block opened partway through the first part starts the second; the
    // part that runs out inside it closes it, and the next reopens it with
    // the same language.
    expect(parts[0]).not.toContain("```");
    expect(parts[1]!.startsWith("```ts\n")).toBe(true);
    expect(parts[1]!.endsWith("\n```")).toBe(true);
    expect(parts[2]!.startsWith("```ts\n")).toBe(true);
    expect(textLines(parts)).toEqual(textLines([text]));
  });

  test("a code block that fits one part moves whole to the next part instead of being cut", () => {
    const block = codeBlock(18, "py");
    const text = `${prose(34, "lead")}\n\n${block}\n\nAfter the code.`;
    expect(text.length).toBeGreaterThan(DISCORD_MESSAGE_MAX);
    const parts = splitDiscordMessage(text);
    expect(parts).toHaveLength(2);
    expect(parts[0]).not.toContain("```");
    expect(parts[1]!.startsWith(block)).toBe(true);
    expect(parts[1]!.endsWith("After the code.")).toBe(true);
  });

  test("a fence left open at the end (a capped answer) is closed in the last part", () => {
    const text = `${prose(3, "x")}\n\`\`\`js\n${Array.from({ length: 90 }, (_, i) => `run(${i}); // a line of code`).join("\n")}…`;
    const parts = splitDiscordMessage(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(fenceCount(p) % 2).toBe(0);
    expect(parts.at(-1)!.endsWith("…\n```")).toBe(true);
  });

  test("a line longer than a part is cut at a space; no part exceeds 2000", () => {
    const words = Array.from({ length: 700 }, (_, i) => `word${i}`).join(" ");
    expect(words.length).toBeGreaterThan(2 * DISCORD_MESSAGE_MAX);
    const parts = splitDiscordMessage(words);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(DISCORD_MESSAGE_MAX);
    expect(parts.join(" ")).toBe(words);
  });

  test("a hard cut never splits a surrogate pair", () => {
    const text = `x${"😀".repeat(1500)}`;
    const parts = splitDiscordMessage(text);
    expect(parts.length).toBe(2);
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(DISCORD_MESSAGE_MAX);
      expect(LONE_SURROGATE.test(p)).toBe(false);
    }
    expect(parts.join("")).toBe(text);
  });

  test("the ROLES-CHAT-3 closing note stays whole in the last part", () => {
    const note = `\n\n${ROLE_REFUSED_SUMMARY_NOTE}`;
    const text = `${prose(60, "r")}${note}`;
    const parts = splitDiscordMessage(text);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.at(-1)!.endsWith(note)).toBe(true);
    for (const p of parts.slice(0, -1)) expect(p).not.toContain("not allowed");
    // A note that no longer fits the last part becomes the last part itself.
    const full = `${"y".repeat(DISCORD_MESSAGE_MAX - 3)}\n${"z".repeat(DISCORD_MESSAGE_MAX - 3)}${note}`;
    const tight = splitDiscordMessage(full);
    expect(tight.at(-1)).toBe(ROLE_REFUSED_SUMMARY_NOTE);
    // A note after an open code block closes the block first.
    const inCode = `${prose(2, "c")}\n\`\`\`sh\n${"echo hi\n".repeat(300)}…${note}`;
    const coded = splitDiscordMessage(inCode);
    expect(coded.at(-1)!.endsWith(`\n\`\`\`${note}`)).toBe(true);
    for (const p of coded) expect(fenceCount(p) % 2).toBe(0);
  });
});

describe("planAnswerParts (DISCORD-16, SAFE-6)", () => {
  const footer = { color: THINKING_COLORS.success, footer: { text: "gpt-4o-mini | 3s" } };

  test("a short answer is one plain message carrying the footer", () => {
    expect(planAnswerParts("Done.", { footer, allowEmbed: true })).toEqual([
      { content: "Done.", embed: footer },
    ]);
  });

  test("the text is scrubbed before it is split: a token across the 2000 boundary never leaks", () => {
    const token = "ghp_" + "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
    const text = `${"a".repeat(DISCORD_MESSAGE_MAX - 11)} ${token}\n\`\`\`\n${"b".repeat(1500)}\n\`\`\``;
    const parts = planAnswerParts(text, { footer, allowEmbed: true });
    const all = parts.map((p) => p.content ?? p.embed?.description ?? "").join("\n");
    expect(/ghp_[A-Za-z0-9]{3,}/.test(all)).toBe(false);
    expect(all).toContain("[redacted:github-token]");
  });

  test("long plain prose that fits one embed goes out as one embed with the footer", () => {
    const text = prose(70, "essay");
    expect(text.length).toBeGreaterThan(DISCORD_MESSAGE_MAX);
    expect(text.length).toBeLessThanOrEqual(DISCORD_EMBED_DESCRIPTION_MAX);
    expect(planAnswerParts(text, { footer, allowEmbed: true })).toEqual([
      { content: null, embed: { description: text, color: footer.color, footer: footer.footer } },
    ]);
  });

  test("never an embed for code, a mention, or when the caller does not allow it: split parts, footer on the last", () => {
    const withCode = `${prose(40, "a")}\n${codeBlock(20)}`;
    const withMention = `${prose(70, "b")}\n<@111122223333444455> see above`;
    const plain = prose(70, "c");
    for (const [text, allowEmbed] of [
      [withCode, true],
      [withMention, true],
      [plain, false],
    ] as const) {
      const parts = planAnswerParts(text, { footer, allowEmbed });
      expect(parts.length).toBeGreaterThan(1);
      for (const [i, p] of parts.entries()) {
        expect(p.content!.length).toBeLessThanOrEqual(DISCORD_MESSAGE_MAX);
        expect(p.embed).toEqual(i === parts.length - 1 ? footer : null);
      }
    }
    expect(readsBetterAsEmbed(withCode)).toBe(false);
    expect(readsBetterAsEmbed(withMention)).toBe(false);
    expect(readsBetterAsEmbed(plain)).toBe(true);
    expect(readsBetterAsEmbed("short")).toBe(false);
    expect(readsBetterAsEmbed(prose(120, "too long for one embed"))).toBe(false);
  });

  test("the whole-answer cap is three messages' worth, and no plan holds more (role note kept)", () => {
    expect(DISCORD_ANSWER_MAX).toBe(3 * DISCORD_MESSAGE_MAX);
    const note = `\n\n${ROLE_REFUSED_SUMMARY_NOTE}`;
    const huge = `${prose(400, "h")}${note}`;
    expect(huge.length).toBeGreaterThan(2 * DISCORD_ANSWER_MAX);
    const parts = planAnswerParts(huge, { footer, allowEmbed: true });
    const all = parts.map((p) => p.content!);
    expect(all.join("").length).toBeLessThanOrEqual(DISCORD_ANSWER_MAX);
    expect(all.at(-1)!.endsWith(note)).toBe(true);
    expect(all.join("\n")).toContain(`…${note}`);
    for (const p of all) expect(p.length).toBeLessThanOrEqual(DISCORD_MESSAGE_MAX);
  });
});

describe("postAnswerParts (fresh replies, DISCORD-16)", () => {
  test("first part replies with the answer's mentions; later parts ping only who they first mention; the footer and buttons ride the last", async () => {
    const posts: Array<Record<string, unknown>> = [];
    const post = async (p: Record<string, unknown>) => {
      posts.push(p);
      return { messageId: `m${posts.length}` };
    };
    const owner = "111122223333444455";
    const body = `${prose(60, "x")}\n\n⚠️ <@${owner}> Spend warning`;
    const footer = { color: 1, footer: { text: "f" } };
    const ids = await postAnswerParts(post, {
      channelId: "c",
      content: body,
      footer,
      replyToMessageId: "req",
      mentionUserIds: ["requester"],
    });
    expect(ids).toEqual(posts.map((_, i) => `m${i + 1}`));
    expect(posts.length).toBeGreaterThan(1);
    expect(posts[0]).toMatchObject({ replyToMessageId: "req", mentionUserIds: ["requester"] });
    expect(posts[0]!.embed).toBeUndefined();
    for (const p of posts.slice(1)) expect(p.replyToMessageId).toBeUndefined();
    expect(posts.at(-1)!.embed).toEqual(footer);
    expect(posts.at(-1)!.mentionUserIds).toEqual([]);

    // The owner's line landed in a later part: that part pings the owner (the
    // first part held no mention of them, so it pinged nobody).
    posts.length = 0;
    const withOwner = await postAnswerParts(post, {
      channelId: "c",
      content: body,
      footer,
      mentionUserIds: [owner],
      skipFirst: true,
    });
    expect(withOwner!.length).toBeGreaterThan(0);
    expect(posts.at(-1)!.content).toContain(`<@${owner}>`);
    expect(posts.at(-1)!.mentionUserIds).toEqual([owner]);

    // A mention the (skipped) first part already holds is never pinged twice.
    posts.length = 0;
    await postAnswerParts(post, {
      channelId: "c",
      content: `<@${owner}> see below\n${body}`,
      footer,
      mentionUserIds: [owner],
      skipFirst: true,
    });
    expect(posts.length).toBeGreaterThan(0);
    for (const p of posts) expect(p.mentionUserIds).toEqual([]);
  });

  test("a first part that does not go out returns null", async () => {
    const ids = await postAnswerParts(async () => null, {
      channelId: "c",
      content: "hi",
      footer: null,
    });
    expect(ids).toBeNull();
  });
});

describe("answer footer (DISCORD-15 / 15.a, SAFE-16)", () => {
  const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };

  test("a priced model with provider usage gives tokens and a cost above zero", () => {
    const spend = answerSpendFor(usage, "gpt-4o-mini");
    const expected = costMicroUsd(priceForModel("gpt-4o-mini")!, usage);
    expect(spend).toEqual({ totalTokens: 1500, costMicroUsd: expected });
    expect(expected).toBeGreaterThan(0);
    expect(formatAnswerFooter({ model: "gpt-4o-mini", elapsedMs: 12_000, spend, plumbing: "state=done" })).toBe(
      `gpt-4o-mini | 2k tokens | ${formatUsd(expected)} | 12s | state=done`,
    );
  });

  test("an unpriced model or missing usage shows unknown, never $0", () => {
    expect(answerSpendFor(usage, "some-unpriced-model")).toEqual({ totalTokens: 1500 });
    expect(answerSpendFor(undefined, "gpt-4o-mini")).toEqual({});
    expect(answerSpendFor({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }, "gpt-4o-mini")).toEqual({});
    const unpriced = formatAnswerFooter({ model: "m", elapsedMs: 0, spend: { totalTokens: 1500 } });
    expect(unpriced).toBe("m | 2k tokens | cost unknown | 0s");
    const none = formatAnswerFooter({ model: "m", elapsedMs: 0, spend: {} });
    expect(none).toBe("m | tokens unknown | cost unknown | 0s");
    for (const text of [unpriced, none]) expect(text).not.toContain("$0");
    expect(formatAnswerFooter({ model: "m", spend: { costMicroUsd: 0 } })).toBe(
      "m | tokens unknown | cost unknown",
    );
  });

  test("without spend (anyone but the owner) the footer is model and time only", () => {
    const text = formatAnswerFooter({ model: "gpt-4o-mini", elapsedMs: 65_000, plumbing: "state=done attempts=1" });
    expect(text).toBe("gpt-4o-mini | 1m 05s | state=done attempts=1");
    expect(text).not.toContain("token");
    expect(text).not.toContain("$");
    expect(buildAnswerFooterEmbed({ phase: "error", model: "m", elapsedMs: 1000 })).toEqual({
      color: THINKING_COLORS.error,
      footer: { text: "m | 1s" },
    });
    expect(buildAnswerFooterEmbed({ phase: "done" })).toBeNull();
  });
});
