import { describe, expect, test } from "bun:test";
import {
  agentConfigDefaults,
  loadAgentConfig,
  parseCorvidinhoSection,
} from "../src/agent/config.ts";

describe("parseCorvidinhoSection", () => {
  test("reads verify_before_complete and max_retries", () => {
    const partial = parseCorvidinhoSection(`
[tasks.test]
cmd = "bun test"

[corvidinho]
verify_before_complete = true
max_retries = 5

[lanes.verify]
steps = ["lint"]
`);
    expect(partial.verifyBeforeComplete).toBe(true);
    expect(partial.maxRetries).toBe(5);
  });

  test("false disables gate", () => {
    const partial = parseCorvidinhoSection(`
[corvidinho]
verify_before_complete = false
max_retries = 0
`);
    expect(partial.verifyBeforeComplete).toBe(false);
    expect(partial.maxRetries).toBe(0);
  });

  test("ignores other sections", () => {
    const partial = parseCorvidinhoSection(`
[merlin]
verify_before_complete = false
max_retries = 99
`);
    expect(partial.verifyBeforeComplete).toBeUndefined();
    expect(partial.maxRetries).toBeUndefined();
  });
});

describe("loadAgentConfig", () => {
  test("loads from project fledge.toml", () => {
    const cfg = loadAgentConfig(import.meta.dir + "/..");
    expect(cfg.verifyBeforeComplete).toBe(true);
    expect(cfg.maxRetries).toBe(3);
  });

  test("defaults when missing file", () => {
    const cfg = loadAgentConfig("/tmp/corvidinho-no-such-project-xyz");
    expect(cfg).toEqual(agentConfigDefaults);
  });
});
