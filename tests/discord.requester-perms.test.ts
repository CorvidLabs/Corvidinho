/**
 * DISCORD-8 — confused-deputy requester check (fixture; no live token).
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
  evaluateRequesterCanSend,
  requesterCheckFix,
  setRequesterPermCheckerForTests,
  type ChannelPermProbe,
} from "../src/discord/requester-perms.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";

afterEach(() => {
  setRequesterPermCheckerForTests(undefined);
  delete process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS;
  delete process.env.DISCORD_TOKEN;
  delete process.env.CORVIDINHO_DISCORD_DRY_RUN;
  delete process.env.CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK;
});

describe("evaluateRequesterCanSend (DISCORD-8 / Merlin)", () => {
  test("missing channel → 404", () => {
    const probe: ChannelPermProbe = {
      channelExists: false,
      isGuildText: true,
      memberInGuild: true,
      canView: true,
      canSend: true,
    };
    const r = evaluateRequesterCanSend(probe);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(404);
      expect(r.reason).toBe("channel not found");
    }
  });

  test("not guild text → 404", () => {
    const r = evaluateRequesterCanSend({
      channelExists: true,
      isGuildText: false,
      memberInGuild: true,
      canView: true,
      canSend: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });

  test("requester not in guild → 403", () => {
    const r = evaluateRequesterCanSend({
      channelExists: true,
      isGuildText: true,
      memberInGuild: false,
      canView: false,
      canSend: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.reason).toBe("requester not in guild");
    }
  });

  test("lacks View or Send → 403", () => {
    const r = evaluateRequesterCanSend({
      channelExists: true,
      isGuildText: true,
      memberInGuild: true,
      canView: true,
      canSend: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.reason).toBe("requester cannot send to this channel");
    }
  });

  test("View+Send → ok", () => {
    const r = evaluateRequesterCanSend({
      channelExists: true,
      isGuildText: true,
      memberInGuild: true,
      canView: true,
      canSend: true,
    });
    expect(r.ok).toBe(true);
  });

  test("fix hints differ for 404 vs 403", () => {
    const notFound = evaluateRequesterCanSend({
      channelExists: false,
      isGuildText: true,
      memberInGuild: true,
      canView: true,
      canSend: true,
    });
    const noSend = evaluateRequesterCanSend({
      channelExists: true,
      isGuildText: true,
      memberInGuild: true,
      canView: true,
      canSend: false,
    });
    expect(notFound.ok).toBe(false);
    expect(noSend.ok).toBe(false);
    if (!notFound.ok && !noSend.ok) {
      const f404 = requesterCheckFix(notFound, "ch", "u");
      const f403 = requesterCheckFix(noSend, "ch", "u");
      expect(f404).toMatch(/guild/);
      expect(f404).not.toMatch(/ViewChannel/);
      expect(f403).toMatch(/ViewChannel/);
      expect(f403).toMatch(/SendMessages/);
    }
  });
});

describe("discord-post-message requester check (DISCORD-8)", () => {
  test("allowlisted + requester denied → refuse, no post", async () => {
    loadBuiltins();
    setRequesterPermCheckerForTests(async () => ({
      ok: false,
      status: 403,
      reason: "requester cannot send to this channel",
    }));
    process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS = "999";
    process.env.DISCORD_TOKEN = "fake";
    process.env.CORVIDINHO_DISCORD_DRY_RUN = "1";
    const r = await runPlugin({
      name: "discord-post-message",
      args: [
        "--channel",
        "999",
        "--content",
        "leak",
        "--requesting-user-id",
        "user-no-access",
      ],
      nonInteractive: true,
      allowlist: ["discord-post-message"],
    });
    expect(r.ok).toBe(false);
    expect(r.error?.toLowerCase()).toContain("cannot send");
  });

  test("allowlisted + requester ok → dry-run posts", async () => {
    loadBuiltins();
    setRequesterPermCheckerForTests(async () => ({ ok: true }));
    process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS = "999";
    process.env.DISCORD_TOKEN = "fake";
    process.env.CORVIDINHO_DISCORD_DRY_RUN = "1";
    const r = await runPlugin({
      name: "discord-post-message",
      args: [
        "--channel",
        "999",
        "--content",
        "hi",
        "--requesting-user-id",
        "user-ok",
      ],
      nonInteractive: true,
      allowlist: ["discord-post-message"],
    });
    expect(r.ok).toBe(true);
    expect((r.data as { dryRun?: boolean })?.dryRun).toBe(true);
  });

  test("strict mode missing requesting_user_id → refuse", async () => {
    loadBuiltins();
    process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS = "999";
    process.env.DISCORD_TOKEN = "fake";
    process.env.CORVIDINHO_DISCORD_DRY_RUN = "1";
    process.env.CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK = "1";
    const r = await runPlugin({
      name: "discord-post-message",
      args: ["--channel", "999", "--content", "hi"],
      nonInteractive: true,
      allowlist: ["discord-post-message"],
    });
    expect(r.ok).toBe(false);
    expect(r.error?.toLowerCase()).toContain("requesting_user_id");
  });

  test("channel allowlist deny still wins before requester check", async () => {
    loadBuiltins();
    let checkerCalls = 0;
    setRequesterPermCheckerForTests(async () => {
      checkerCalls += 1;
      return { ok: true };
    });
    process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS = "111";
    process.env.DISCORD_TOKEN = "fake";
    process.env.CORVIDINHO_DISCORD_DRY_RUN = "1";
    const r = await runPlugin({
      name: "discord-post-message",
      args: [
        "--channel",
        "999",
        "--content",
        "hi",
        "--requesting-user-id",
        "u1",
      ],
      nonInteractive: true,
      allowlist: ["discord-post-message"],
    });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(3);
    expect(checkerCalls).toBe(0);
  });
});
