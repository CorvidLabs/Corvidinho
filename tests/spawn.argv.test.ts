import { describe, expect, test } from "bun:test";
import { buildCorvidinhoArgv } from "../src/agent/spawn-argv.ts";
import {
  summarizeTaskResult,
  summarizeTaskRunOutput,
} from "../src/agent/task-summary.ts";

describe("buildCorvidinhoArgv", () => {
  test("prefixes bun for .ts bins", () => {
    expect(buildCorvidinhoArgv("/repo/src/cli.ts", ["--protocol-version"])).toEqual([
      "bun",
      "/repo/src/cli.ts",
      "--protocol-version",
    ]);
  });

  test("leaves non-.ts bins unchanged", () => {
    expect(buildCorvidinhoArgv("/usr/local/bin/corvidinho", ["task", "run"])).toEqual([
      "/usr/local/bin/corvidinho",
      "task",
      "run",
    ]);
  });

  test("agent-client style argv for .ts", () => {
    const argv = buildCorvidinhoArgv("src/cli.ts", [
      "task",
      "run",
      "--no-verify",
      "--task",
      "hi",
      "--output",
      "ndjson",
    ]);
    expect(argv[0]).toBe("bun");
    expect(argv[1]).toBe("src/cli.ts");
    expect(argv.slice(2)).toEqual([
      "task",
      "run",
      "--no-verify",
      "--task",
      "hi",
      "--output",
      "ndjson",
    ]);
  });
});

describe("summarizeTaskRunOutput", () => {
  test("parses task run --json into state + summary", () => {
    const stdout = JSON.stringify({
      result: {
        summary: "demo task attempt 1",
        state: "done",
        verified: false,
        verifySkipped: true,
        attempts: 1,
        cancelled: false,
      },
      events: [],
    });
    const out = summarizeTaskRunOutput(stdout, "", 0);
    expect(out).toContain("state=done");
    expect(out).toContain("verifySkipped");
    expect(out).toContain("demo task attempt 1");
    expect(out).not.toContain('"events"');
  });

  test("summarizeTaskResult matches the --json path for the same result", () => {
    const result = {
      summary: "demo task attempt 1",
      state: "done",
      verified: false,
      verifySkipped: true,
      attempts: 1,
      cancelled: false,
    };
    expect(summarizeTaskResult(result)).toBe(
      summarizeTaskRunOutput(JSON.stringify({ result, events: [] }), "", 0),
    );
    expect(summarizeTaskResult(result)).toBe(
      "state=done verified=false verifySkipped attempts=1\ndemo task attempt 1",
    );
  });

  test("falls back to truncated stdout when not JSON", () => {
    expect(summarizeTaskRunOutput("plain text result", "err", 0)).toBe(
      "plain text result",
    );
  });

  test("falls back to stderr / exit when stdout empty", () => {
    expect(summarizeTaskRunOutput("", "boom", 1)).toBe("boom");
    expect(summarizeTaskRunOutput("", "", 7)).toBe("(exit 7)");
  });
});
