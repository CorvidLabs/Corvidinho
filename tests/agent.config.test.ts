import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  agentConfigDefaults,
  loadAgentConfig,
  parseCorvidinhoSection,
  removedVerifyKeys,
} from "../src/agent/config.ts";

describe("parseCorvidinhoSection", () => {
  test("reads max_retries", () => {
    const partial = parseCorvidinhoSection(`
[tasks.test]
cmd = "bun test"

[corvidinho]
max_retries = 5

[lanes.verify]
steps = ["lint"]
`);
    expect(partial).toEqual({ maxRetries: 5 });
  });

  test("verify_before_complete = false is ignored: there is no switch (AGENT-14)", () => {
    const partial = parseCorvidinhoSection(`
[corvidinho]
verify_before_complete = false
max_retries = 0
`);
    expect(partial).toEqual({ maxRetries: 0 });
  });

  test("ignores other sections", () => {
    const partial = parseCorvidinhoSection(`
[merlin]
verify_before_complete = false
max_retries = 99
`);
    expect(partial.maxRetries).toBeUndefined();
  });
});

describe("loadAgentConfig", () => {
  test("loads from project fledge.toml", () => {
    const cfg = loadAgentConfig(import.meta.dir + "/..");
    expect(cfg).toEqual({ maxRetries: 3 });
  });

  test("defaults when missing file", () => {
    const cfg = loadAgentConfig("/tmp/corvidinho-no-such-project-xyz");
    expect(cfg).toEqual(agentConfigDefaults);
  });
});

describe("removedVerifyKeys (doctor [warn], AGENT-14)", () => {
  test("names verify_before_complete only when [corvidinho] still sets it", () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-removed-key-"));
    try {
      expect(removedVerifyKeys(dir)).toEqual([]);
      writeFileSync(join(dir, "fledge.toml"), "[merlin]\nverify_before_complete = false\n");
      expect(removedVerifyKeys(dir)).toEqual([]);
      writeFileSync(
        join(dir, "fledge.toml"),
        "[corvidinho]\nverify_before_complete = false\nmax_retries = 1\n",
      );
      expect(removedVerifyKeys(dir)).toEqual(["verify_before_complete"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("this repo's fledge.toml no longer sets it", () => {
    expect(removedVerifyKeys(import.meta.dir + "/..")).toEqual([]);
  });
});
