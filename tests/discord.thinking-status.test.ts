import { describe, expect, test } from "bun:test";
import {
  THINKING_COLORS,
  ThinkingStatus,
  buildThinkingEmbed,
  buildThinkingFooter,
  formatElapsed,
  formatTokenCount,
  formatTokenSegment,
  type ThinkingOutbound,
} from "../src/discord/thinking-status.ts";

function mockOutbound() {
  const sends: Array<{ messageId: string; embed: ReturnType<typeof buildThinkingEmbed> }> =
    [];
  const edits: Array<{ messageId: string; embed: ReturnType<typeof buildThinkingEmbed> }> =
    [];
  let n = 0;
  const outbound: ThinkingOutbound = {
    async sendEmbed({ embed }) {
      n += 1;
      const messageId = `msg_${n}`;
      sends.push({ messageId, embed });
      return { messageId };
    },
    async editEmbed({ messageId, embed }) {
      edits.push({ messageId, embed });
      return true;
    },
  };
  return { outbound, sends, edits };
}

describe("thinking-status builders (DISCORD-3)", () => {
  test("formatElapsed compact forms", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(12_000)).toBe("12s");
    expect(formatElapsed(65_000)).toBe("1m 05s");
    expect(formatElapsed(3_720_000)).toBe("1h 02m");
  });

  test("formatTokenCount and segment", () => {
    expect(formatTokenCount(640)).toBe("640");
    expect(formatTokenCount(12_400)).toBe("12k");
    expect(formatTokenCount(1_200_000)).toBe("1.2M");
    expect(formatTokenSegment({ estimated: 640 })).toBe("~640 tok");
    expect(formatTokenSegment({ estimated: 64_000, contextWindow: 200_000 })).toContain(
      "32%",
    );
    expect(formatTokenSegment(undefined)).toBeUndefined();
  });

  test("footer includes time and optional tool/tokens", () => {
    const footer = buildThinkingFooter({
      phase: "working",
      sessionId: "sess_abcdefgh",
      elapsedMs: 12_000,
      tool: "Read",
      tokens: { estimated: 1200 },
    });
    expect(footer).toContain("sess_abc");
    expect(footer).toContain("working...");
    expect(footer).toContain("12s");
    expect(footer).toContain("Read");
    expect(footer).toContain("~1k tok");
  });

  test("embed phases use ancestor colors", () => {
    expect(buildThinkingEmbed({ phase: "starting" }).color).toBe(
      THINKING_COLORS.working,
    );
    expect(buildThinkingEmbed({ phase: "done" }).color).toBe(
      THINKING_COLORS.success,
    );
    expect(buildThinkingEmbed({ phase: "error" }).color).toBe(
      THINKING_COLORS.error,
    );
    expect(buildThinkingEmbed({ phase: "working", tool: "Shell" }).description).toBe(
      "⏳ Shell",
    );
  });
});

describe("DISCORD-3.a model + plumbing in footer", () => {
  test("footer includes model and done plumbing", () => {
    const footer = buildThinkingFooter({
      phase: "done",
      sessionId: "sess_abcdefgh",
      elapsedMs: 12_000,
      model: "gpt-4o-mini",
      plumbing: "state=done verified=false verifySkipped attempts=1",
    });
    expect(footer).toContain("sess_abc");
    expect(footer).toContain("done");
    expect(footer).toContain("gpt-4o-mini");
    expect(footer).toContain("state=done verified=false");
  });

  test("done() writes plumbing into the embed footer only", async () => {
    const { outbound, sends, edits } = mockOutbound();
    const status = new ThinkingStatus({
      outbound,
      channelId: "chan-1",
      sessionId: "sess_test1234",
      model: "gpt-4o-mini",
      debounceMs: 0,
      tickMs: 60_000,
      now: () => 1_000_000,
    });
    await status.start();
    await status.done("✅ Done", {
      plumbing: "state=done verified=false attempts=1",
    });
    const last = edits[edits.length - 1]!.embed;
    expect(last.description).toBe("✅ Done");
    expect(last.description).not.toContain("state=");
    expect(last.footer?.text).toContain("gpt-4o-mini");
    expect(last.footer?.text).toContain("state=done verified=false");
  });
});

describe("ThinkingStatus controller", () => {
  test("start → update → done: one send then edits", async () => {
    const { outbound, sends, edits } = mockOutbound();
    let t = 1_000_000;
    const status = new ThinkingStatus({
      outbound,
      channelId: "chan-1",
      replyToMessageId: "user-msg",
      sessionId: "sess_test1234",
      debounceMs: 0,
      tickMs: 60_000,
      now: () => t,
    });

    await status.start();
    expect(sends).toHaveLength(1);
    expect(sends[0]!.embed.description).toContain("Working");
    expect(status.progressMessageId).toBe("msg_1");

    t += 5_000;
    await status.update({ tool: "Read", tokens: { estimated: 400 } });
    expect(edits.length).toBeGreaterThanOrEqual(1);
    const lastWorking = edits[edits.length - 1]!;
    expect(lastWorking.embed.footer?.text).toContain("5s");
    expect(lastWorking.embed.footer?.text).toContain("Read");

    t += 2_000;
    await status.done();
    const last = edits[edits.length - 1]!;
    expect(last.embed.description).toContain("Done");
    expect(last.embed.color).toBe(THINKING_COLORS.success);
    status.dispose();
  });

  test("fail marks error color", async () => {
    const { outbound, edits } = mockOutbound();
    const status = new ThinkingStatus({
      outbound,
      channelId: "c",
      sessionId: "sess_x",
      debounceMs: 0,
      tickMs: 60_000,
    });
    await status.start();
    await status.fail("❌ boom");
    expect(edits.at(-1)!.embed.color).toBe(THINKING_COLORS.error);
    expect(edits.at(-1)!.embed.description).toContain("boom");
  });
});
