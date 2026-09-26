import { describe, expect, test } from "bun:test";
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
