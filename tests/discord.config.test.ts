import { describe, expect, test } from "bun:test";
import { loadBridgeConfig, mergeChannelIds } from "../src/discord/config.ts";
import { emptyConfig } from "../src/allowlist/types.ts";

describe("discord bridge config", () => {
  test("missing token → missing_token", async () => {
    const r = await loadBridgeConfig({
      env: {
        DISCORD_CHANNEL_IDS: "111",
      },
      filePath: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_token");
  });

  test("empty channels → empty_channels", async () => {
    const r = await loadBridgeConfig({
      env: {
        DISCORD_BOT_TOKEN: "fake-token-for-test",
      },
      filePath: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("empty_channels");
  });

  test("token + DISCORD_CHANNEL_IDS loads", async () => {
    const r = await loadBridgeConfig({
      env: {
        DISCORD_TOKEN: "fake-token-for-test",
        DISCORD_CHANNEL_IDS: "111, 222",
      },
      filePath: null,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.channelIds).toEqual(["111", "222"]);
      expect(r.config.token).toBe("fake-token-for-test");
    }
  });

  test("mergeChannelIds unions env + allowlist", () => {
    const cfg = emptyConfig();
    cfg.discord.channels = ["aaa"];
    const merged = mergeChannelIds(cfg, { DISCORD_CHANNEL_IDS: "bbb,aaa" });
    expect(merged.sort()).toEqual(["aaa", "bbb"]);
  });
});
