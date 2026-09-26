import { describe, expect, test } from "bun:test";
import { buildCorvidinhoArgv } from "../src/agent/spawn-argv.ts";
import {
  chatBodyFromTaskResult,
  formatTaskPlumbing,
  summarizeTaskResult,
  summarizeTaskRunOutput,
} from "../src/agent/task-summary.ts";

describe("buildCorvidinhoArgv", () => {
  test("prefixes bun for .ts bins", () => {
    expect(buildCorvidinhoArgv("/repo/src/cli.ts", ["--protocol-version"])).toEqual([
      "bun",
      "--no-env-file",
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

  test("agent-client style argv for .ts (no --no-verify; AGENT-4 / #85)", () => {
    const argv = buildCorvidinhoArgv("src/cli.ts", [
      "task",
      "run",
      "--task",
      "hi",
      "--output",
      "ndjson",
    ]);
    expect(argv[0]).toBe("bun");
    expect(argv[1]).toBe("--no-env-file");
    expect(argv[2]).toBe("src/cli.ts");
    expect(argv.slice(3)).toEqual([
      "task",
      "run",
      "--task",
      "hi",
      "--output",
      "ndjson",
    ]);
    expect(argv).not.toContain("--no-verify");
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

describe("spawned agents ignore the project .env (ALLOW-4 / SAFE-1)", () => {
  test("a .env in the spawn cwd does not reach the child", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-noenv-"));
    try {
      writeFileSync(join(dir, ".env"), "CORVIDINHO_ALLOWLIST=memory-forget\n");
      const bin = join(dir, "probe.ts");
      writeFileSync(bin, "console.log(`allow=[${process.env.CORVIDINHO_ALLOWLIST ?? \"unset\"}]`);\n");
      const env = { ...process.env };
      delete env.CORVIDINHO_ALLOWLIST;
      const proc = Bun.spawn(buildCorvidinhoArgv(bin), { cwd: dir, env, stdout: "pipe" });
      const out = await new Response(proc.stdout).text();
      await proc.exited;
      expect(out).toContain("allow=[unset]");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("DISCORD-3.a chat body vs plumbing", () => {
  const result = {
    summary: "Hello Leif, here is the answer.",
    state: "done",
    verified: false,
    verifySkipped: true,
    attempts: 1,
    cancelled: false,
  };

  test("chatBodyFromTaskResult is human text only", () => {
    const body = chatBodyFromTaskResult(result);
    expect(body).toBe("Hello Leif, here is the answer.");
    expect(body).not.toContain("state=");
    expect(body).not.toContain("verified=");
    expect(body).not.toContain("attempts=");
  });

  test("formatTaskPlumbing is operator line for the embed", () => {
    const line = formatTaskPlumbing(result);
    expect(line).toContain("state=done");
    expect(line).toContain("verified=false");
    expect(line).toContain("verifySkipped");
    expect(line).toContain("attempts=1");
    expect(line).not.toContain("Hello Leif");
  });
});
