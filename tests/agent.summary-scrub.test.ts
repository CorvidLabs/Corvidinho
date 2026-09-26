/**
 * REQ-agent-232 — run summaries are secret-scrubbed (SAFE-6) before every
 * length clip: the 500-char stderr fallback, the 1800-char chat body and the
 * 4000-char result frame cap. A clip must never cut a secret into a shape the
 * scrubber no longer recognises (a short `ghp_` prefix, a PEM body without its
 * END line). Fake secrets are built at runtime; no network, no subprocess.
 */
import { describe, expect, test } from "bun:test";
import { NDJSON_LIMITS, resultFrame } from "../src/agent/events-ndjson.ts";
import {
  chatBodyFromTaskResult,
  chatBodyFromTaskRunOutput,
  summarizeTaskResult,
  summarizeTaskRunOutput,
} from "../src/agent/task-summary.ts";
import type { TaskResult } from "../src/agent/types.ts";

const TOKEN = "gh" + "p_" + "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
const REDACTED_TOKEN = "[redacted:github-token]";
const REDACTED_KEY = "[redacted:private-key]";
/** A token cut to `ghp_` + fewer than 20 chars is no longer scrubbable. */
const TOKEN_PREFIX_RE = /ghp_/;

/** Fake PEM private key, ~1.7k chars (the size of an RSA-2048 PEM). */
const KEY_LINE = "MIIEpAIBAAKCAQEA" + "q1W2e3R4t5Y6u7I8o9P0".repeat(2) + "abcdefgh";
const PEM =
  "-----BEGIN RSA " +
  "PRIVATE KEY-----\n" +
  Array.from({ length: 26 }, () => KEY_LINE).join("\n") +
  "\n-----END RSA PRIVATE KEY-----";

const RESULT: TaskResult = {
  summary: "",
  filesChanged: [],
  verified: false,
  verifySkipped: true,
  cancelled: false,
  state: "done",
  attempts: 1,
};

/** No PEM header or key body survives. */
function expectNoKey(text: string) {
  expect(text).not.toContain("PRIVATE KEY");
  expect(text).not.toContain(KEY_LINE);
  expect(text).not.toContain("MIIEpAIBAAKCAQEA");
}

describe("stderr fallback is scrubbed before the 500-char clip (REQ-agent-232)", () => {
  test("a token straddling char 500 of stderr is redacted, not clipped to a ghp_ prefix", () => {
    // Token starts at index 477: a clip at 500 keeps `ghp_` + 19 chars, one
    // short of the 20 the github-token pattern needs.
    const stderr = `${"e".repeat(476)} ${TOKEN}\nstack trace follows\n`;
    expect(stderr.indexOf(TOKEN)).toBe(477);

    for (const out of [
      chatBodyFromTaskRunOutput("", stderr, 1),
      summarizeTaskRunOutput("", stderr, 1),
      // stdout that is a `result` JSON without a usable summary → stderr path.
      chatBodyFromTaskRunOutput('{"result": 1}', stderr, 1),
    ]) {
      expect(out).not.toMatch(TOKEN_PREFIX_RE);
      expect(out).toBe(`${"e".repeat(476)} ${REDACTED_TOKEN}`);
    }

    // Token-free stderr is clipped exactly as before.
    const plain = `  ${"p".repeat(700)}  `;
    expect(chatBodyFromTaskRunOutput("", plain, 2)).toBe("p".repeat(500));
    expect(summarizeTaskRunOutput("", plain, 2)).toBe("p".repeat(500));
    expect(chatBodyFromTaskRunOutput("", "", 3)).toBe("(exit 3)");
  });

  test("non-frame stdout: a token straddling char 1800 is redacted before the clip", () => {
    const stdout = `${"o".repeat(1776)} ${TOKEN} tail`;
    expect(stdout.indexOf(TOKEN)).toBe(1777);
    for (const out of [
      chatBodyFromTaskRunOutput(stdout, "", 0),
      summarizeTaskRunOutput(stdout, "", 0),
    ]) {
      expect(out).not.toMatch(TOKEN_PREFIX_RE);
      expect(out).toBe(`${"o".repeat(1776)} ${REDACTED_TOKEN}`);
    }

    const plain = `${"q".repeat(2000)}\n`;
    expect(chatBodyFromTaskRunOutput(plain, "", 0)).toBe("q".repeat(1800));
    expect(summarizeTaskRunOutput(plain, "", 0)).toBe("q".repeat(1800));
  });
});

describe("result summary is scrubbed before the 1800-char chat body clip (REQ-agent-232)", () => {
  test("a PEM key straddling char 1800 of the result summary leaves no header or key body", () => {
    // Key starts at 1000 and ends ~2700: a clip at 1800 drops the END line.
    const summary = `${"s".repeat(999)}\n${PEM}\nDone.`;
    expect(summary.indexOf("-----BEGIN")).toBe(1000);
    expect(summary.indexOf("-----END")).toBeGreaterThan(1800);
    const r = { ...RESULT, summary };

    const body = chatBodyFromTaskResult(r);
    expectNoKey(body);
    expect(body).toBe(`${"s".repeat(999)}\n${REDACTED_KEY}\nDone.`);
    expectNoKey(summarizeTaskResult(r));
    // Same summary arriving as `task run --json` stdout (Discord fallback).
    expectNoKey(summarizeTaskRunOutput(JSON.stringify({ result: r }), "", 0));
    expectNoKey(chatBodyFromTaskRunOutput(JSON.stringify({ result: r }), "", 0));

    // A token straddling 1800 in the summary is redacted too.
    const tokenBody = chatBodyFromTaskResult({
      ...RESULT,
      summary: `${"t".repeat(1776)} ${TOKEN}`,
    });
    expect(tokenBody).not.toMatch(TOKEN_PREFIX_RE);

    // Token-free summaries are unchanged: trimmed and clipped at 1800.
    const plain = { ...RESULT, summary: `  ${"n".repeat(2500)}  ` };
    expect(chatBodyFromTaskResult(plain)).toBe("n".repeat(1800));
    expect(chatBodyFromTaskResult({ ...RESULT, summary: " Listed plugins. " })).toBe(
      "Listed plugins.",
    );
    expect(summarizeTaskResult({ ...RESULT, summary: "ok" })).toBe(
      "state=done verified=false verifySkipped attempts=1\nok",
    );
  });
});

describe("result frame is scrubbed before the 4000-char cap (REQ-agent-232)", () => {
  const max = NDJSON_LIMITS.resultSummary;

  test("a PEM key straddling the child's 4000-char cap is redacted in the frame", () => {
    // Key starts at 3000 and ends ~4700: capping first would ship the header
    // and ~1000 chars of key body with no END line.
    const summary = `${"k".repeat(2999)}\n${PEM}\n${"after ".repeat(50)}`;
    expect(summary.indexOf("-----BEGIN")).toBe(3000);
    expect(summary.indexOf("-----END")).toBeGreaterThan(max);
    const frame = resultFrame({ ...RESULT, summary });
    expectNoKey(frame.result.summary);
    expect(frame.result.summary.startsWith(`${"k".repeat(2999)}\n${REDACTED_KEY}\nafter`)).toBe(true);
    expect(frame.result.summary.length).toBeLessThanOrEqual(max + 1);

    // A token straddling the cap is not shipped as a ghp_ prefix either.
    const tokenFrame = resultFrame({
      ...RESULT,
      summary: `${"t".repeat(3976)} ${TOKEN} ${"u".repeat(200)}`,
    });
    expect(tokenFrame.result.summary).not.toMatch(TOKEN_PREFIX_RE);
    expect(tokenFrame.truncated).toBe(true);

    // Token-free frames are unchanged: same object under the cap, head + `…` over it.
    const small = { ...RESULT, summary: "Listed plugins." };
    expect(resultFrame(small).result).toBe(small);
    const big = resultFrame({ ...RESULT, summary: "z".repeat(max + 10) });
    expect(big.result.summary).toBe(`${"z".repeat(max)}…`);
    expect(big.truncated).toBe(true);
  });
});
