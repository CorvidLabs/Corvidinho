import { describe, expect, test } from "bun:test";
import { runTask } from "../src/agent/loop.ts";
import type { AgentEvent, VerifyRunner } from "../src/agent/types.ts";

function collect() {
  const events: AgentEvent[] = [];
  return {
    events,
    onEvent: (e: AgentEvent) => events.push(e),
    states: () =>
      events
        .filter((e): e is Extract<AgentEvent, { type: "StateChanged" }> => e.type === "StateChanged")
        .map((e) => e.state),
  };
}

describe("runTask prove-before-done", () => {
  test("verify pass → done verified=true", async () => {
    const c = collect();
    const verifyCalls: number[] = [];
    const verify: VerifyRunner = async () => {
      verifyCalls.push(1);
      return { success: true, output: "ok" };
    };
    const result = await runTask({
      cwd: "/tmp",
      verifyBeforeComplete: true,
      maxRetries: 3,
      verifyRunner: verify,
      onEvent: c.onEvent,
      execute: async () => ({
        summary: "wrote stuff",
        filesChanged: ["src/a.ts"],
      }),
    });
    expect(result.verified).toBe(true);
    expect(result.verifySkipped).toBe(false);
    expect(result.state).toBe("done");
    expect(result.cancelled).toBe(false);
    expect(verifyCalls.length).toBe(1);
    expect(c.states()).toEqual(["planning", "executing", "verifying", "done"]);
  });

  test("verify fail then pass retries with feedback (AGENT-4.a)", async () => {
    const c = collect();
    let verifyN = 0;
    const feedbacks: (string | undefined)[] = [];
    const verify: VerifyRunner = async () => {
      verifyN += 1;
      if (verifyN === 1) return { success: false, output: "lint boom" };
      return { success: true, output: "ok" };
    };
    const result = await runTask({
      cwd: "/tmp",
      verifyBeforeComplete: true,
      maxRetries: 3,
      verifyRunner: verify,
      onEvent: c.onEvent,
      execute: async ({ attempt, verifyFeedback }) => {
        feedbacks.push(verifyFeedback);
        return {
          summary: `attempt ${attempt}`,
          filesChanged: ["src/a.ts"],
        };
      },
    });
    expect(result.verified).toBe(true);
    expect(result.attempts).toBe(2);
    expect(feedbacks[0]).toBeUndefined();
    expect(feedbacks[1]).toContain("lint boom");
    expect(c.states()).toEqual([
      "planning",
      "executing",
      "verifying",
      "executing",
      "verifying",
      "done",
    ]);
  });

  test("exhausted retries → failed verified=false", async () => {
    const c = collect();
    const verify: VerifyRunner = async () => ({
      success: false,
      output: "always fail",
    });
    const result = await runTask({
      cwd: "/tmp",
      verifyBeforeComplete: true,
      maxRetries: 1,
      verifyRunner: verify,
      onEvent: c.onEvent,
      execute: async () => ({
        summary: "work",
        filesChanged: ["x.ts"],
      }),
    });
    expect(result.verified).toBe(false);
    expect(result.verifySkipped).toBe(false);
    expect(result.state).toBe("failed");
    expect(result.attempts).toBe(2); // initial + 1 retry
    expect(result.summary).toContain("always fail");
    expect(c.states().at(-1)).toBe("failed");
  });

  test("--no-verify / flag off skips gate", async () => {
    let called = 0;
    const verify: VerifyRunner = async () => {
      called += 1;
      return { success: false, output: "should not run" };
    };
    const result = await runTask({
      cwd: "/tmp",
      verifyBeforeComplete: false,
      verifyRunner: verify,
      execute: async () => ({
        summary: "chat reply",
        filesChanged: ["anything.ts"],
      }),
    });
    expect(called).toBe(0);
    expect(result.verifySkipped).toBe(true);
    expect(result.verified).toBe(false);
    expect(result.state).toBe("done");
  });

  test("empty filesChanged skips verify (Merlin want_verify)", async () => {
    let called = 0;
    const verify: VerifyRunner = async () => {
      called += 1;
      return { success: true, output: "ok" };
    };
    const result = await runTask({
      cwd: "/tmp",
      verifyBeforeComplete: true,
      verifyRunner: verify,
      execute: async () => ({
        summary: "no edits",
        filesChanged: [],
      }),
    });
    expect(called).toBe(0);
    expect(result.verifySkipped).toBe(true);
    expect(result.state).toBe("done");
  });

  test("AbortSignal cancels promptly (AGENT-3)", async () => {
    const ac = new AbortController();
    ac.abort();
    const result = await runTask({
      cwd: "/tmp",
      verifyBeforeComplete: true,
      signal: ac.signal,
      verifyRunner: async () => ({ success: true, output: "ok" }),
      execute: async () => ({
        summary: "never",
        filesChanged: ["x.ts"],
      }),
    });
    expect(result.cancelled).toBe(true);
    expect(result.verified).toBe(false);
    expect(result.state).toBe("failed");
  });

  test("defaultVerifyRunner argv shape (FLEDGE-2/3 agree)", async () => {
    const { VERIFY_ARGS } = await import("../src/agent/verify.ts");
    expect([...VERIFY_ARGS]).toEqual([
      "lanes",
      "run",
      "verify",
      "--non-interactive",
    ]);
  });
});
