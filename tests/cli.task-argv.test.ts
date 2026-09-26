/**
 * `--task` value is always task text (REQ-cli-143): untrusted bridge text
 * that looks like a flag must never be parsed as a flag.
 */
import { describe, expect, test } from "bun:test";
import { parseGlobalFlags } from "../src/cli.ts";

describe("task run --task argv (AGENT-5 / SAFE-1)", () => {
  test("flag-looking task text stays task text", () => {
    for (const text of ["--tier=code", "--tier", "--no-verify", "-h", "- fix x", "--json", "--max-retries=9"]) {
      const r = parseGlobalFlags(["task", "run", "--no-verify", "--task", text, "--json"]);
      expect(r.taskText).toBe(text);
      expect(r.tier).toBeUndefined();
      expect(r.maxRetries).toBeUndefined();
      expect(r.rest).toEqual(["task", "run"]);
    }
  });

  test("`--task --tier code` does not raise the tier", () => {
    const r = parseGlobalFlags(["task", "run", "--task", "--tier", "code"]);
    expect(r.taskText).toBe("--tier");
    expect(r.tier).toBeUndefined();
    expect(r.rest).toEqual(["task", "run", "code"]);
  });

  test("multi-line --task=TEXT keeps every line", () => {
    const r = parseGlobalFlags(["task", "run", "--task=line one\n--tier=code\nline three"]);
    expect(r.taskText).toBe("line one\n--tier=code\nline three");
    expect(r.tier).toBeUndefined();
  });

  test("plain task text and explicit flags still work", () => {
    const r = parseGlobalFlags(["task", "run", "--task", "fix the loop", "--tier", "code", "--json"]);
    expect(r.taskText).toBe("fix the loop");
    expect(r.tier).toBe("code");
    expect(r.json).toBe(true);
  });

  test("trailing --task with no value leaves task text unset", () => {
    expect(parseGlobalFlags(["task", "run", "--task"]).taskText).toBeUndefined();
  });
});
