import { describe, expect, test } from "bun:test";

const root = import.meta.dir + "/..";

describe("corvidinho task run CLI", () => {
  test("help mentions task run and --no-verify", async () => {
    const proc = Bun.spawn(["bun", "src/cli.ts", "--help"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    expect(code).toBe(0);
    expect(out).toContain("task run");
    expect(out).toContain("--no-verify");
  });

  test("task run --no-verify --json skips gate", async () => {
    const proc = Bun.spawn(
      ["bun", "src/cli.ts", "task", "run", "--no-verify", "--json"],
      {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as {
      result: {
        verifySkipped: boolean;
        verified: boolean;
        state: string;
        cancelled: boolean;
        summary: string;
      };
    };
    expect(parsed.result.verifySkipped).toBe(true);
    expect(parsed.result.verified).toBe(false);
    expect(parsed.result.state).toBe("done");
    expect(parsed.result.cancelled).toBe(false);
    // Demo stub reports a change: skipping says so plainly (AGENT-4, #85).
    expect(parsed.result.summary).toStartWith("NOT verified:");
  });

  test("--json stays one pretty { result, events } document (not ndjson, #73)", async () => {
    const proc = Bun.spawn(
      ["bun", "src/cli.ts", "task", "run", "--no-verify", "--json"],
      {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, CORVIDINHO_LLM_API_KEY: "", OPENAI_API_KEY: "" },
      },
    );
    const [code, out] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
    ]);
    expect(code).toBe(0);
    // Pretty-printed single document: starts with "{\n  " and has no per-line frames.
    expect(out.startsWith("{\n  ")).toBe(true);
    const parsed = JSON.parse(out) as Record<string, unknown> & {
      events: Array<Record<string, unknown>>;
    };
    expect(Object.keys(parsed).sort()).toEqual(["events", "result"]);
    expect(parsed.events[0]).toEqual({ type: "StateChanged", state: "planning" });
    expect(parsed.events.every((e) => !("protocol" in e))).toBe(true);
    expect(parsed.events.map((e) => e.type)).not.toContain("usage");
  });
});
