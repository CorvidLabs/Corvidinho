import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { list } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";

describe("discord-post-message dangerous plugin", () => {
  test("listed as dangerous", () => {
    loadBuiltins();
    const entry = list().find((e) => e.name === "discord-post-message");
    expect(entry).toBeDefined();
    expect(entry!.dangerous).toBe(true);
  });

  test("non-interactive without allowlist denies (SAFE-1)", async () => {
    loadBuiltins();
    const r = await runPlugin({
      name: "discord-post-message",
      args: ["--channel", "111", "--content", "hi"],
      nonInteractive: true,
      allowlist: [],
    });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(2);
  });

  test("allowlisted command still denies empty channel allowlist", async () => {
    loadBuiltins();
    const prev = process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS;
    const prevTok = process.env.DISCORD_TOKEN;
    delete process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS;
    delete process.env.DISCORD_CHANNEL_IDS;
    process.env.DISCORD_TOKEN = "fake";
    process.env.CORVIDINHO_DISCORD_DRY_RUN = "1";
    try {
      const r = await runPlugin({
        name: "discord-post-message",
        args: ["--channel", "111", "--content", "hi"],
        nonInteractive: true,
        allowlist: ["discord-post-message"],
      });
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(3);
      expect(r.error?.toLowerCase()).toContain("not authorized");
    } finally {
      if (prev !== undefined) process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS = prev;
      else delete process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS;
      if (prevTok !== undefined) process.env.DISCORD_TOKEN = prevTok;
      else delete process.env.DISCORD_TOKEN;
    }
  });

  test("dry-run posts when channel allowlisted", async () => {
    loadBuiltins();
    process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS = "999";
    process.env.DISCORD_TOKEN = "fake";
    process.env.CORVIDINHO_DISCORD_DRY_RUN = "1";
    try {
      const r = await runPlugin({
        name: "discord-post-message",
        args: ["--channel", "999", "--content", "hi"],
        nonInteractive: true,
        allowlist: ["discord-post-message"],
      });
      expect(r.ok).toBe(true);
      expect((r.data as { dryRun?: boolean })?.dryRun).toBe(true);
    } finally {
      delete process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS;
      delete process.env.DISCORD_TOKEN;
      delete process.env.CORVIDINHO_DISCORD_DRY_RUN;
    }
  });
});

// DISCORD-5 / ALLOW-3, REQ-discord-004: the post gate uses the bridge's channel
// set (allowlist file + CORVIDINHO_DISCORD_ALLOW_CHANNELS ∪ DISCORD_CHANNEL_IDS),
// with deny lists first.
describe("discord-post-message channel gate matches the bridge", () => {
  const KEYS = [
    "CORVIDINHO_ALLOWLIST_FILE",
    "CORVIDINHO_DISCORD_ALLOW_CHANNELS",
    "CORVIDINHO_DISCORD_DENY_CHANNELS",
    "DISCORD_CHANNEL_IDS",
    "DISCORD_TOKEN",
    "DISCORD_BOT_TOKEN",
    "CORVIDINHO_DISCORD_DRY_RUN",
    "CORVIDINHO_ACTING_DISCORD_USER_ID",
    "CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK",
  ] as const;

  async function withEnv<T>(
    set: Partial<Record<(typeof KEYS)[number], string>>,
    fn: () => Promise<T>,
  ): Promise<T> {
    const saved = new Map(KEYS.map((k) => [k, process.env[k]] as const));
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-post-chan-"));
    for (const k of KEYS) delete process.env[k];
    // A missing file: the loader adds no channels from it.
    process.env.CORVIDINHO_ALLOWLIST_FILE = join(dir, "missing-allowlist.toml");
    process.env.DISCORD_TOKEN = "x";
    process.env.CORVIDINHO_DISCORD_DRY_RUN = "1";
    Object.assign(process.env, set);
    try {
      return await fn();
    } finally {
      for (const [k, v] of saved) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  }

  function post(channel: string) {
    loadBuiltins();
    return runPlugin({
      name: "discord-post-message",
      args: ["--channel", channel, "--content", "hi"],
      nonInteractive: true,
      allowlist: ["discord-post-message"],
    });
  }

  test("a channel allowlisted only through DISCORD_CHANNEL_IDS posts (dry run)", async () => {
    await withEnv({ DISCORD_CHANNEL_IDS: "111" }, async () => {
      const r = await post("111");
      expect(r.error).toBeUndefined();
      expect(r.ok).toBe(true);
      expect(r.exitCode).toBe(0);
      expect((r.data as { dryRun?: boolean; channelId?: string })?.dryRun).toBe(true);
      expect((r.data as { channelId?: string })?.channelId).toBe("111");

      // The union is not allow-all: a channel in no list is still refused.
      const other = await post("222");
      expect(other.ok).toBe(false);
      expect(other.exitCode).toBe(3);
      expect(other.error).toContain("not allowlisted");
    });
  });

  test("a deny on the same channel still refuses with exit 3", async () => {
    await withEnv(
      { DISCORD_CHANNEL_IDS: "111", CORVIDINHO_DISCORD_DENY_CHANNELS: "111" },
      async () => {
        const r = await post("111");
        expect(r.ok).toBe(false);
        expect(r.exitCode).toBe(3);
        expect(r.error).toContain("is denied");
      },
    );
  });
});
