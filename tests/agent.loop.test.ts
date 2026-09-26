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

  test("failed verify then a retry that changes no files is never done (AGENT-4, REQ-agent-242)", async () => {
    const c = collect();
    let verifyN = 0;
    const verify: VerifyRunner = async () => {
      verifyN += 1;
      return { success: false, output: "app.ts: syntax error" };
    };
    const result = await runTask({
      cwd: "/tmp",
      verifyBeforeComplete: true,
      maxRetries: 2,
      verifyRunner: verify,
      onEvent: c.onEvent,
      // Attempt 1 writes broken code; retries only answer in text.
      execute: async ({ attempt }) => ({
        summary: attempt === 1 ? "wrote app.ts" : "I couldn't fix it",
        filesChanged: attempt === 1 ? ["app.ts"] : [],
      }),
    });
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
    expect(result.verifySkipped).toBe(false);
    expect(result.filesChanged).toEqual(["app.ts"]);
    expect(result.attempts).toBe(3);
    expect(verifyN).toBe(3);
    expect(c.states()).not.toContain("done");
  });

  test("files changed across attempts are reported as a union (REQ-agent-242)", async () => {
    let verifyN = 0;
    const verify: VerifyRunner = async () => {
      verifyN += 1;
      return verifyN === 1
        ? { success: false, output: "boom" }
        : { success: true, output: "ok" };
    };
    const result = await runTask({
      cwd: "/tmp",
      verifyBeforeComplete: true,
      maxRetries: 3,
      verifyRunner: verify,
      execute: async ({ attempt }) => ({
        summary: `attempt ${attempt}`,
        filesChanged: attempt === 1 ? ["a.ts", "b.ts"] : ["b.ts", "c.ts"],
      }),
    });
    expect(result.state).toBe("done");
    expect(result.verified).toBe(true);
    expect(result.filesChanged).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  test("execute error (provider failure) → failed, not done (AGENT-4/8, REQ-agent-242)", async () => {
    const c = collect();
    let verifyN = 0;
    const result = await runTask({
      cwd: "/tmp",
      verifyBeforeComplete: true,
      maxRetries: 3,
      verifyRunner: async () => {
        verifyN += 1;
        return { success: true, output: "ok" };
      },
      onEvent: c.onEvent,
      execute: async () => ({
        summary: "LLM HTTP 401: bad key",
        filesChanged: [],
        error: true,
      }),
    });
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
    expect(result.cancelled).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.summary).toContain("LLM HTTP 401");
    expect(verifyN).toBe(0);
    expect(c.states()).toEqual(["planning", "executing", "failed"]);
  });

  test("execute error on a retry after a failed verify → failed (REQ-agent-242)", async () => {
    let verifyN = 0;
    const result = await runTask({
      cwd: "/tmp",
      verifyBeforeComplete: true,
      maxRetries: 3,
      verifyRunner: async () => {
        verifyN += 1;
        return { success: false, output: "broken" };
      },
      execute: async ({ attempt }) =>
        attempt === 1
          ? { summary: "wrote app.ts", filesChanged: ["app.ts"] }
          : {
              summary: "LLM HTTP 503: upstream overloaded",
              filesChanged: [],
              error: true,
            },
    });
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
    expect(result.filesChanged).toEqual(["app.ts"]);
    expect(result.attempts).toBe(2);
    expect(result.summary).toContain("LLM HTTP 503");
    expect(verifyN).toBe(1);
  });

  test("execute error with the verify gate off is still failed (REQ-agent-242)", async () => {
    const result = await runTask({
      cwd: "/tmp",
      verifyBeforeComplete: false,
      execute: async () => ({
        summary: "LLM request failed: network down",
        filesChanged: [],
        error: true,
      }),
    });
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
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

describe("runTask SpecSync Planning briefing", () => {
  const root = import.meta.dir + "/..";

  test("task mentioning agent emits Spec briefing Text", async () => {
    const c = collect();
    const result = await runTask({
      cwd: root,
      task: "Improve the agent prove-before-done loop",
      verifyBeforeComplete: false,
      onEvent: c.onEvent,
      execute: async () => ({
        summary: "noop",
        filesChanged: [],
      }),
    });
    expect(result.state).toBe("done");
    const texts = c.events
      .filter((e): e is Extract<AgentEvent, { type: "Text" }> => e.type === "Text")
      .map((e) => e.text)
      .join("\n");
    expect(texts).toContain("# Spec: agent");
    expect(texts).toContain("Planning: SpecSync briefing");
  });

  test("fledge.toml verify lane includes spec-check", async () => {
    const toml = await Bun.file(`${root}/fledge.toml`).text();
    expect(toml).toMatch(/\[lanes\.verify\][\s\S]*spec-check/);
  });
});
