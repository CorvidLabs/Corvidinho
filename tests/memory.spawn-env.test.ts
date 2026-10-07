/**
 * Spawned agent runs never inherit a stale memory actor
 * (REQ-discord-021 / REQ-watch-008 / REQ-plugins-011), and never carry a
 * typed confirm token (SAFE-18.a: the owner's DM card is the confirm).
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
const KEYS = [
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_CONFIRM_TOKENS",
  "CORVIDINHO_NON_INTERACTIVE",
];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "corvidinho-spawnenv-"));
  bin = join(dir, "fake-cli.ts");
  writeFileSync(
    bin,
    'const e = process.env; console.log(`actor=[${e.CORVIDINHO_ACTING_DISCORD_USER_ID ?? "unset"}] admin=[${e.CORVIDINHO_ACTING_IS_ADMIN ?? "unset"}] nonint=[${e.CORVIDINHO_NON_INTERACTIVE ?? "unset"}] tokens=[${e.CORVIDINHO_ACTING_CONFIRM_TOKENS ?? "unset"}]`);\n',
  );
  for (const k of KEYS) saved[k] = process.env[k];
  // A stale actor in the parent (bridge / watcher) environment.
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = "stale-admin";
  process.env.CORVIDINHO_ACTING_IS_ADMIN = "1";
  process.env.CORVIDINHO_ACTING_CONFIRM_TOKENS = "stale-token";
  process.env.CORVIDINHO_NON_INTERACTIVE = "0";
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
    expect(r.summary).toContain("actor=[u1] admin=[0] nonint=[1] tokens=[]");
  });

  test("SAFE-18.a: a confirm token the human typed is not passed to the run (the DM card is the confirm)", async () => {
    const token = `mc1.123.abc.${"f".repeat(64)}`;
    const client = createDiscordClient({ bin, cwd: dir });
    const r = await client.runChat({
      prompt: `yes confirm ${token} please`,
      humanText: `yes confirm ${token} please`,
      sessionId: "s1",
      actingUserId: "u1",
      actingIsAdmin: true,
    });
    expect(r.summary).toContain("admin=[1] nonint=[1] tokens=[]");
  });

  test("tokens in the enriched prompt (e.g. recalled memory) are not human-supplied", async () => {
    const token = `mc1.123.abc.${"e".repeat(64)}`;
    const client = createDiscordClient({ bin, cwd: dir });
    const r = await client.runChat({
      prompt: `[Corvidinho memory] pending: ${token}\n\nyes go ahead`,
      humanText: "yes go ahead",
      sessionId: "s1",
      actingUserId: "u1",
      actingIsAdmin: true,
    });
    expect(r.summary).toContain("tokens=[]");
  });

  test("Discord spawn without an actor clears the inherited one", async () => {
    const client = createDiscordClient({ bin, cwd: dir });
    const r = await client.runChat({ prompt: "tick", sessionId: "schedule_x" });
    expect(r.summary).toContain("actor=[] admin=[0] nonint=[1] tokens=[]");
  });

  test("WATCH spawn clears the acting env", async () => {
    const client = createWatchClient({ bin, cwd: dir });
    const r = await client.runChat({ prompt: `gh mention mc1.1.a.${"0".repeat(64)}`, sessionId: "w1" });
    expect(r.summary).toContain("actor=[] admin=[0] nonint=[1] tokens=[]");
  });
});
