/**
 * Spawned agent runs never inherit a stale memory actor
 * (REQ-discord-021 / REQ-watch-008 / REQ-plugins-011).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSpawnAgentClient as createDiscordClient } from "../src/discord/agent-client.ts";
import { createSpawnAgentClient as createWatchClient } from "../src/watch/agent-client.ts";

let dir = "";
let bin = "";
const saved: Record<string, string | undefined> = {};
const KEYS = ["CORVIDINHO_ACTING_DISCORD_USER_ID", "CORVIDINHO_ACTING_IS_ADMIN"];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "corvidinho-spawnenv-"));
  bin = join(dir, "fake-cli.ts");
  writeFileSync(
    bin,
    'console.log(`actor=[${process.env.CORVIDINHO_ACTING_DISCORD_USER_ID ?? "unset"}] admin=[${process.env.CORVIDINHO_ACTING_IS_ADMIN ?? "unset"}]`);\n',
  );
  for (const k of KEYS) saved[k] = process.env[k];
  // A stale actor in the parent (bridge / watcher) environment.
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = "stale-admin";
  process.env.CORVIDINHO_ACTING_IS_ADMIN = "1";
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
});

describe("spawn env hygiene for memory actor", () => {
  test("Discord spawn passes the dispatching actor", async () => {
    const client = createDiscordClient({ bin, cwd: dir });
    const r = await client.runChat({
      prompt: "hi",
      sessionId: "s1",
      actingUserId: "u1",
      actingIsAdmin: false,
    });
    expect(r.summary).toContain("actor=[u1] admin=[0]");
  });

  test("Discord spawn without an actor clears the inherited one", async () => {
    const client = createDiscordClient({ bin, cwd: dir });
    const r = await client.runChat({ prompt: "tick", sessionId: "schedule_x" });
    expect(r.summary).toContain("actor=[] admin=[0]");
  });

  test("WATCH spawn clears the acting env", async () => {
    const client = createWatchClient({ bin, cwd: dir });
    const r = await client.runChat({ prompt: "gh mention", sessionId: "w1" });
    expect(r.summary).toContain("actor=[] admin=[0]");
  });
});
