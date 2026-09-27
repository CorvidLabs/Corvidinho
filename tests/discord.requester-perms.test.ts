/**
 * DISCORD-8 — confused-deputy requester check (fixture; no live token).
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Client } from "discord.js";
import {
  evaluateRequesterCanSend,
  requesterCheckFix,
  setRequesterPermCheckerForTests,
  type ChannelPermProbe,
} from "../src/discord/requester-perms.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  setRequesterPermCheckerForTests(undefined);
  globalThis.fetch = originalFetch;
  delete process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS;
  delete process.env.DISCORD_TOKEN;
  delete process.env.CORVIDINHO_DISCORD_DRY_RUN;
  delete process.env.CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK;
  delete process.env.CORVIDINHO_ACTING_DISCORD_USER_ID;
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

/**
 * DISCORD-8 in bridge-started runs: the bridge sets the acting Discord user
 * per spawn (CORVIDINHO_ACTING_DISCORD_USER_ID); the check is always for that
 * user, never a model-supplied id. Live posts are stubbed (fetch spy), so
 * "nothing posted" means no Discord API call went out.
 */
describe("discord-post-message checks the acting Discord user (DISCORD-8)", () => {
  const ACTOR = "181969874455756800";
  const OTHER = "999999999999999999";
  const TOKEN = "fixture-bot-token-not-real";
  let posts: string[];
  let checked: string[];

  beforeEach(() => {
    loadBuiltins();
    posts = [];
    checked = [];
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      posts.push(String(url));
      return new Response(JSON.stringify({ id: "m1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
    process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS = "999";
    process.env.DISCORD_TOKEN = TOKEN;
  });

  function checker(verdict: "ok" | "deny") {
    setRequesterPermCheckerForTests(async (_channelId, userId) => {
      checked.push(userId);
      return verdict === "ok"
        ? { ok: true }
        : { ok: false, status: 403, reason: "requester cannot send to this channel" };
    });
  }

  function post(extra: string[] = []) {
    return runPlugin({
      name: "discord-post-message",
      args: ["--channel", "999", "--content", "hi", ...extra],
      nonInteractive: true,
      allowlist: ["discord-post-message"],
    });
  }

  test("bridge run without --requesting-user-id: the acting user is checked and a denial posts nothing", async () => {
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = ACTOR;
    checker("deny");
    const r = await post();
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(3);
    expect(r.error?.toLowerCase()).toContain("cannot send");
    expect(r.error).toContain(ACTOR);
    expect(checked).toEqual([ACTOR]);
    expect(posts).toEqual([]);
  });

  test("bridge run where the acting user may send: one post, checked for the acting user", async () => {
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = ACTOR;
    checker("ok");
    const r = await post();
    expect(r.ok).toBe(true);
    expect(checked).toEqual([ACTOR]);
    expect(posts).toEqual(["https://discord.com/api/v10/channels/999/messages"]);
  });

  test("a --requesting-user-id naming another user is refused, never checked in place of the acting user", async () => {
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = ACTOR;
    checker("ok");
    for (const flag of [
      ["--requesting-user-id", OTHER],
      [`--requesting-user-id=${OTHER}`],
      ["--requester", OTHER],
    ]) {
      const r = await post(flag);
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(3);
      expect(r.error).toContain("different Discord user");
      expect(r.error).toContain("Nothing was posted");
    }
    expect(checked).toEqual([]);
    expect(posts).toEqual([]);
  });

  test("a --requesting-user-id equal to the acting user runs the one check for that user", async () => {
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = ACTOR;
    checker("ok");
    const r = await post(["--requesting-user-id", ACTOR]);
    expect(r.ok).toBe(true);
    expect(checked).toEqual([ACTOR]);
    expect(posts).toHaveLength(1);
  });

  test("strict mode in a bridge run is met by the acting user's check", async () => {
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = ACTOR;
    process.env.CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK = "1";
    checker("ok");
    const r = await post();
    expect(r.ok).toBe(true);
    expect(checked).toEqual([ACTOR]);
    expect(posts).toHaveLength(1);
  });

  test("a check that cannot run refuses (fail closed), says why, scrubbed, nothing posted", async () => {
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = ACTOR;
    setRequesterPermCheckerForTests(async () => {
      throw new Error(`Used disallowed intents (login with ${TOKEN})\n    at stack frame`);
    });
    const r = await post();
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(3);
    expect(r.error).toContain("could not check that the acting Discord user can post");
    expect(r.error).toContain("Used disallowed intents");
    expect(r.error).toContain("Server Members Intent");
    expect(r.error).not.toContain(TOKEN);
    expect(r.error).not.toContain("stack frame");
    expect(posts).toEqual([]);
  });

  test("the live check whose gateway login is refused (Server Members Intent off) refuses, nothing posted", async () => {
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = ACTOR;
    const realLogin = Client.prototype.login;
    Client.prototype.login = async function () {
      throw new Error("Used disallowed intents");
    };
    let r: Awaited<ReturnType<typeof post>>;
    try {
      r = await post();
    } finally {
      Client.prototype.login = realLogin;
    }
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(3);
    expect(r.error).toContain("Used disallowed intents");
    expect(posts).toEqual([]);
  });

  test("the channel allowlist deny still wins before the acting user check", async () => {
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = ACTOR;
    process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS = "111";
    checker("ok");
    const r = await post(["--requesting-user-id", OTHER]);
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(3);
    expect(r.error).not.toContain("different Discord user");
    expect(checked).toEqual([]);
    expect(posts).toEqual([]);
  });

  test("acting env empty (WATCH / operator): no flag posts without a check, as before", async () => {
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = "";
    checker("deny");
    const r = await post();
    expect(r.ok).toBe(true);
    expect(checked).toEqual([]);
    expect(posts).toHaveLength(1);
  });

  test("acting env unset: --requesting-user-id still checks that user, strict still refuses a missing id", async () => {
    checker("ok");
    const r = await post(["--requesting-user-id", OTHER]);
    expect(r.ok).toBe(true);
    expect(checked).toEqual([OTHER]);
    process.env.CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK = "1";
    const strict = await post();
    expect(strict.ok).toBe(false);
    expect(strict.error).toContain("requesting_user_id is required");
    expect(posts).toHaveLength(1);
  });

  test("acting env unset: a check that throws still throws, as before", async () => {
    setRequesterPermCheckerForTests(async () => {
      throw new Error("offline fixture");
    });
    await expect(post(["--requesting-user-id", OTHER])).rejects.toThrow("offline fixture");
    expect(posts).toEqual([]);
  });
});
