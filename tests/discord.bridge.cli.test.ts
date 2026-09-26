import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { startBridge } from "../src/discord/bridge.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import { createNullGateway } from "../src/discord/gateway.ts";
import { routeMessage } from "../src/discord/message-router.ts";

describe("discord bridge CLI / start semantics", () => {
  test("--protocol-version prints 2 (ndjson event stream, #73)", async () => {
    const proc = Bun.spawn(["bun", "src/cli.ts", "--protocol-version"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, out] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
    ]);
    expect(code).toBe(0);
    expect(CORVIDINHO_PROTOCOL_VERSION).toBe(2);
    expect(out.trim()).toBe("2");
  });

  test("discord bridge without token exits cleanly", async () => {
    const proc = Bun.spawn(["bun", "src/cli.ts", "discord", "bridge"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        DISCORD_TOKEN: "",
        DISCORD_BOT_TOKEN: "",
        DISCORD_CHANNEL_IDS: "123",
      },
    });
    const [code, err, out] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
      new Response(proc.stdout).text(),
    ]);
    expect(code).not.toBe(0);
    const combined = err + out;
    expect(combined.toLowerCase()).toContain("discord_token");
    expect(combined).toContain("go-live");
  });

  test("discord register-commands without token exits cleanly", async () => {
    const proc = Bun.spawn(["bun", "src/cli.ts", "discord", "register-commands"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        DISCORD_TOKEN: "",
        DISCORD_BOT_TOKEN: "",
      },
    });
    const [code, err, out] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
      new Response(proc.stdout).text(),
    ]);
    expect(code).not.toBe(0);
    const combined = err + out;
    expect(combined.toLowerCase()).toContain("discord_token");
  });

  test("startBridge dry path: mention→session→echo with injected gateway", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "corvidinho-bridge-proj-"));
    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: "chan-1",
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        // Missing file: never read the operator's allowlist (ALLOW-4).
        CORVIDINHO_ALLOWLIST_FILE: join(projectRoot, "no-allowlist.toml"),
      },
      // Temp non-git project: never create real worktrees/branches in this repo.
      projectRoot,
      skipProtocolCheck: true,
      agent: createEchoAgentClient(),
      gatewayFactory: async () => createNullGateway(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const action = routeMessage(
      {
        id: "m1",
        channelId: "chan-1",
        authorId: "u1",
        authorBot: false,
        content: "@bot ping",
        mentionedBot: true,
      },
      { store: result.store, allowlist: result.config.allowlist },
    );
    expect(action.kind).toBe("start_session");
    await result.stop();
  });
});
