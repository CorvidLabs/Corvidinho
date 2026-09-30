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
import { buildStopComponents } from "../src/discord/run-control.ts";

function mockOutbound() {
  const sends: Array<{ messageId: string; embed: ReturnType<typeof buildThinkingEmbed> }> =
    [];
  const edits: Array<{ messageId: string; embed: ReturnType<typeof buildThinkingEmbed> }> =
    [];
  const contentEdits: Array<{
    messageId: string;
    content?: string | null;
    embed?: unknown;
    components?: unknown[] | null;
  }> = [];
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
    async editMessage(opts) {
      contentEdits.push({
        messageId: opts.messageId,
        content: opts.content,
        embed: opts.embed,
        components: opts.components,
      });
      if (opts.embed) {
        edits.push({ messageId: opts.messageId, embed: opts.embed });
      }
      return true;
    },
  };
  return { outbound, sends, edits, contentEdits };
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

describe("DISCORD-ASK-6/7 finalizeContent", () => {
  test("finalizeContent clears embed and writes content + components", async () => {
    const { outbound, contentEdits } = mockOutbound();
    const status = new ThinkingStatus({
      outbound,
      channelId: "chan-1",
      sessionId: "sess_test1234",
      debounceMs: 0,
      tickMs: 60_000,
    });
    await status.start();
    const collapsed = await status.finalizeContent({
      content: "❓ Choose",
      components: [{ type: 1, components: [] }],
    });
    expect(collapsed?.messageId).toBe("msg_1");
    expect(contentEdits).toHaveLength(1);
    expect(contentEdits[0]!.content).toContain("Choose");
    expect(contentEdits[0]!.embed).toBeNull();
    expect(contentEdits[0]!.components).toBeDefined();
  });

  test("start with existingMessageId reuses stub via editMessage", async () => {
    const { outbound, sends, contentEdits } = mockOutbound();
    const status = new ThinkingStatus({
      outbound,
      channelId: "chan-1",
      sessionId: "sess_test1234",
      existingMessageId: "stub_9",
      debounceMs: 0,
      tickMs: 60_000,
    });
    await status.start({ description: "Working on your request..." });
    expect(sends).toHaveLength(0);
    expect(status.progressMessageId).toBe("stub_9");
    expect(contentEdits[0]!.messageId).toBe("stub_9");
    expect(contentEdits[0]!.content).toBeNull();
    expect(contentEdits[0]!.embed).toBeDefined();
    status.dispose();
  });
});

describe("DISCORD-3.a footer-only embed on the collapsed answer", () => {
  const PLUMBING = "state=done verified=true attempts=1";

  function statusWith(outbound: ThinkingOutbound, model?: string) {
    return new ThinkingStatus({
      outbound,
      channelId: "chan-1",
      sessionId: "sess_test1234",
      ...(model ? { model } : {}),
      debounceMs: 0,
      tickMs: 60_000,
      // DISCORD-15: the footer shows the time; a fixed clock keeps it "0s".
      now: () => 1_000_000,
    });
  }

  test("the final answer keeps one footer-only embed (model | time | plumbing, no description); the body stays as given", async () => {
    const { outbound, contentEdits } = mockOutbound();
    const status = statusWith(outbound, "gpt-test");
    await status.start();
    const collapsed = await status.finalizeContent({
      content: "Shipped it.",
      extras: { plumbing: PLUMBING },
    });
    expect(collapsed?.messageId).toBe("msg_1");
    expect(contentEdits).toHaveLength(1);
    expect(contentEdits[0]!.content).toBe("Shipped it.");
    expect(contentEdits[0]!.components).toBeNull();
    expect(contentEdits[0]!.embed).toStrictEqual({
      color: THINKING_COLORS.success,
      footer: { text: `gpt-test | 0s | ${PLUMBING}` },
    });
  });

  test("a failed answer's footer is error-colored and carries verifySkipped / attempts", async () => {
    const { outbound, contentEdits } = mockOutbound();
    const status = statusWith(outbound, "gpt-test");
    await status.start();
    await status.finalizeContent({
      content: "failed (exit 1)",
      extras: { plumbing: "state=failed verified=false verifySkipped attempts=3" },
      failed: true,
    });
    expect(contentEdits[0]!.embed).toStrictEqual({
      color: THINKING_COLORS.error,
      footer: { text: "gpt-test | 0s | state=failed verified=false verifySkipped attempts=3" },
    });
    expect(contentEdits[0]!.content).not.toContain("state=");
  });

  test("a later re-edit of the answer (appended notice) keeps the footer and its outcome", async () => {
    const { outbound, contentEdits } = mockOutbound();
    const status = statusWith(outbound, "gpt-test");
    await status.start();
    await status.finalizeContent({
      content: "stuck",
      extras: { plumbing: "state=failed verified=false attempts=2" },
      failed: true,
    });
    await status.finalizeContent({ content: "stuck\n\n⚠️ owner notice" });
    expect(contentEdits).toHaveLength(2);
    expect(contentEdits[1]!.embed).toStrictEqual(contentEdits[0]!.embed);
    expect(contentEdits[1]!.embed).toStrictEqual({
      color: THINKING_COLORS.error,
      footer: { text: "gpt-test | 0s | state=failed verified=false attempts=2" },
    });
  });

  test("a Choose stub (buttons) carries no embed even when model and plumbing are known", async () => {
    const { outbound, contentEdits } = mockOutbound();
    const status = statusWith(outbound, "gpt-test");
    await status.start();
    await status.finalizeContent({
      content: "❓ Choose",
      components: [{ type: 1, components: [] }],
      extras: { plumbing: "state=blocked verified=false attempts=1" },
    });
    expect(contentEdits[0]!.embed).toBeNull();
  });

  test("with neither model nor plumbing the answer still carries the time (DISCORD-15)", async () => {
    const { outbound, contentEdits } = mockOutbound();
    const status = statusWith(outbound);
    await status.start();
    await status.finalizeContent({ content: "hi" });
    expect(contentEdits[0]!.embed).toStrictEqual({
      color: THINKING_COLORS.success,
      footer: { text: "0s" },
    });
  });
});

/**
 * AGENT-3.a (REQ-discord-303): the run's Stop button rides the progress
 * message while it runs and is cleared when the run is done, failed or
 * stopped (the answer's edit).
 */
describe("the progress message's Stop button (AGENT-3.a, REQ-discord-303)", () => {
  const STOP = buildStopComponents("run_4");

  /** Every call with the fields as passed (a field left out stays out). */
  function recording(opts: { editMessage?: boolean } = {}) {
    const calls: Array<{ op: string } & Record<string, unknown>> = [];
    let n = 0;
    const outbound: ThinkingOutbound = {
      async sendEmbed(o) {
        n += 1;
        calls.push({ op: "send", ...o });
        return { messageId: `msg_${n}` };
      },
      async editEmbed(o) {
        calls.push({ op: "editEmbed", ...o });
        return true;
      },
      ...(opts.editMessage === false
        ? {}
        : {
            async editMessage(o: Parameters<NonNullable<ThinkingOutbound["editMessage"]>>[0]) {
              calls.push({ op: "editMessage", ...o });
              return true;
            },
          }),
    };
    return { outbound, calls };
  }

  function status(outbound: ThinkingOutbound, extra: { components?: unknown[]; existingMessageId?: string } = {}) {
    return new ThinkingStatus({
      outbound,
      channelId: "chan-1",
      sessionId: "sess_stop1234",
      debounceMs: 0,
      tickMs: 60_000,
      ...extra,
    });
  }

  test("sent with the progress embed; working edits leave it; done clears it (components: null)", async () => {
    const { outbound, calls } = recording();
    const s = status(outbound, { components: STOP });
    await s.start();
    expect(calls[0]).toMatchObject({ op: "send", components: STOP });
    await s.update({ tool: "Read" });
    expect(calls[1]!.op).toBe("editEmbed");
    expect("components" in calls[1]!).toBe(false);
    await s.done("✅ Done");
    expect(calls.at(-1)).toMatchObject({ op: "editEmbed", components: null });
  });

  test("fail clears it too", async () => {
    const { outbound, calls } = recording();
    const s = status(outbound, { components: STOP });
    await s.start();
    await s.fail("❌ boom");
    expect(calls.at(-1)).toMatchObject({ op: "editEmbed", components: null });
    expect((calls.at(-1)!.embed as { description: string }).description).toBe("❌ boom");
  });

  test("the collapsed answer replaces it: no components, or the answer's own (an ask's button)", async () => {
    for (const answer of [undefined, [{ type: 1, components: [] }]]) {
      const { outbound, calls } = recording();
      const s = status(outbound, { components: STOP });
      await s.start();
      await s.finalizeContent({ content: "the answer", ...(answer ? { components: answer } : {}) });
      const edit = calls.at(-1)!;
      expect(edit.op).toBe("editMessage");
      expect(edit.components).toEqual(answer ?? null);
    }
  });

  test("a reused Choose stub gets it in place of the Choose button (editMessage, else editEmbed)", async () => {
    const withEdit = recording();
    await status(withEdit.outbound, { components: STOP, existingMessageId: "stub_9" }).start();
    expect(withEdit.calls).toEqual([
      expect.objectContaining({ op: "editMessage", messageId: "stub_9", content: null, components: STOP }),
    ]);
    const embedOnly = recording({ editMessage: false });
    await status(embedOnly.outbound, { components: STOP, existingMessageId: "stub_9" }).start();
    expect(embedOnly.calls).toEqual([expect.objectContaining({ op: "editEmbed", messageId: "stub_9", components: STOP })]);
  });

  test("without components nothing changes: no components sent, done and fail edit the embed only", async () => {
    for (const end of ["done", "fail"] as const) {
      const { outbound, calls } = recording();
      const s = status(outbound);
      await s.start();
      await (end === "done" ? s.done() : s.fail());
      for (const c of calls) expect({ end, op: c.op, has: "components" in c }).toEqual({ end, op: c.op, has: false });
    }
    // A reused stub still has its Choose button cleared, as before.
    const stub = recording();
    await status(stub.outbound, { existingMessageId: "stub_9" }).start();
    expect(stub.calls[0]).toMatchObject({ op: "editMessage", components: null });
  });
});
