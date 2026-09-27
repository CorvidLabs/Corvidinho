/**
 * REQ-discord-417 — a rejected gateway login ends startBridge with a clean
 * `{ ok: false, exitCode: 1 }` and one scrubbed line naming DISCORD_TOKEN,
 * instead of an uncaught DiscordAPIError / TokenInvalid and Bun's crash footer.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { DiscordAPIError, DiscordjsError, DiscordjsErrorCodes } from "discord.js";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import { formatDiscordLoginFailure, startBridge } from "../src/discord/bridge.ts";
import { formatRegisterCommandsFailure } from "../src/discord/register-commands.ts";
import type { DiscordGateway } from "../src/discord/gateway.ts";

// Fake secrets are assembled at runtime — never realistic literals in the repo.
const TOKEN = "garbage-bot-token-" + "f".repeat(12);

async function startWith(startError: unknown): Promise<{
  result: Awaited<ReturnType<typeof startBridge>>;
  stops: number;
}> {
  const projectRoot = mkdtempSync(join(tmpdir(), "corvidinho-login-fail-"));
  let stops = 0;
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: TOKEN,
      DISCORD_CHANNEL_IDS: "chan-1",
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: join(projectRoot, "no-allowlist.toml"),
    },
    projectRoot,
    skipProtocolCheck: true,
    disableScheduler: true,
    agent: createEchoAgentClient(),
    gatewayFactory: async () =>
      ({
        botUserId: null,
        async start() {
          throw startError;
        },
        async stop() {
          stops += 1;
        },
      }) as unknown as DiscordGateway,
  });
  return { result, stops };
}

describe("discord login failure (REQ-discord-417)", () => {
  test("TokenInvalid (discord.js 401) → ok:false, exit 1, check DISCORD_TOKEN", async () => {
    // What discord.js throws for a 401 from GET /gateway/bot (constructor is
    // private in its typings, public at runtime).
    const TokenInvalid = DiscordjsError as unknown as new (code: string) => Error;
    const { result, stops } = await startWith(
      new TokenInvalid(DiscordjsErrorCodes.TokenInvalid),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(1);
    expect(result.message).toBe(
      "discord login failed (401): check DISCORD_TOKEN (An invalid token was provided.)",
    );
    expect(stops).toBe(1);
  });

  test("DiscordAPIError 403 → ok:false with (403): check DISCORD_TOKEN", async () => {
    const err = new DiscordAPIError(
      { message: "403: Forbidden", code: 0 },
      0,
      403,
      "GET",
      "https://discord.com/api/v10/gateway/bot",
      {},
    );
    const { result } = await startWith(err);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(1);
    expect(result.message).toStartWith("discord login failed (403): check DISCORD_TOKEN");
    expect(result.message).not.toContain("rawError");
    expect(result.message).not.toContain("\n");
  });

  test("a network error names the token and reachability, one line", () => {
    const msg = formatDiscordLoginFailure(
      new Error("Unable to connect. Is the computer able to access the url?\n    at x (y.js:1:1)"),
    );
    expect(msg).toBe(
      "discord login failed: Unable to connect. Is the computer able to access the url? — check DISCORD_TOKEN and that discord.com is reachable",
    );
  });

  test("a token value in the error text is never echoed (SAFE-6)", () => {
    const prev = process.env.DISCORD_TOKEN;
    process.env.DISCORD_TOKEN = TOKEN;
    try {
      const msg = formatDiscordLoginFailure(
        Object.assign(new Error(`bad token ${TOKEN}`), { status: 401 }),
      );
      expect(msg).toStartWith("discord login failed (401): check DISCORD_TOKEN");
      expect(msg).not.toContain(TOKEN);
    } finally {
      if (prev === undefined) delete process.env.DISCORD_TOKEN;
      else process.env.DISCORD_TOKEN = prev;
    }
  });
});

describe("slash registration failure is one line (REQ-discord-417)", () => {
  const apiError = (status: number, message: string) =>
    new DiscordAPIError(
      { message, code: 50001 },
      50001,
      status,
      "PUT",
      "https://discord.com/api/v10/applications/1/guilds/2/commands",
      { body: [{ name: "work" }] } as never,
    );

  test("bridge registration on ready: status, DISCORD_GUILD_ID hint, no dump", () => {
    const line = formatRegisterCommandsFailure(apiError(403, "Missing Access"), {
      what: "slash command registration failed",
      guildHint: "DISCORD_GUILD_ID",
      env: {},
    });
    expect(line).toBe(
      "[discord] slash command registration failed (403): Missing Access — check DISCORD_TOKEN / DISCORD_BOT_TOKEN and DISCORD_GUILD_ID",
    );
    expect(line).not.toContain("requestBody");
    expect(line).not.toContain("\n");
  });

  test("CLI default: register-commands failed, --guild-id hint on 401/403 only", () => {
    expect(formatRegisterCommandsFailure(apiError(401, "401: Unauthorized"), { env: {} })).toBe(
      "[discord] register-commands failed (401): 401: Unauthorized — check DISCORD_TOKEN / DISCORD_BOT_TOKEN and --guild-id",
    );
    expect(
      formatRegisterCommandsFailure(new Error("Unable to connect\n    at x (y.js:1:1)"), {
        env: {},
      }),
    ).toBe("[discord] register-commands failed: Unable to connect");
  });

  test("a token value in the error text is never echoed (SAFE-6)", () => {
    const line = formatRegisterCommandsFailure(
      Object.assign(new Error(`bad ${TOKEN}`), { status: 401 }),
      { env: { DISCORD_TOKEN: TOKEN } },
    );
    expect(line).not.toContain(TOKEN);
    expect(line).toContain("[redacted:env-secret]");
  });
});

describe("login failure uses the bridge env for SAFE-6 redaction", () => {
  test("a token only in the startBridge env is still redacted", async () => {
    const { result } = await startWith(
      Object.assign(new Error(`rejected ${TOKEN}`), { status: 401 }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toStartWith("discord login failed (401): check DISCORD_TOKEN");
    expect(result.message).not.toContain(TOKEN);
  });
});
