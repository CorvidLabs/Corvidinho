import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { clearRegistry, register, list } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import type { PluginCommand } from "../src/plugins/types.ts";

const dangerousEcho: PluginCommand = {
  name: "test-dangerous-echo",
  description: "test-only dangerous command",
  dangerous: true,
  minTier: 1,
  async handler(ctx) {
    return { ok: true, data: { args: ctx.args }, message: "echoed", exitCode: 0 };
  },
};

const safeEcho: PluginCommand = {
  name: "test-safe-echo",
  description: "test-only safe command",
  dangerous: false,
  async handler(ctx) {
    return { ok: true, data: { args: ctx.args }, message: "safe", exitCode: 0 };
  },
};

describe("plugin deny-dangerous (SAFE-1)", () => {
  beforeEach(() => {
    clearRegistry();
    register(dangerousEcho);
    register(safeEcho);
  });

  afterEach(() => {
    clearRegistry();
  });

  test("list returns name+dangerous+minTier", () => {
    const entries = list();
    expect(entries).toEqual([
      {
        name: "test-dangerous-echo",
        description: "test-only dangerous command",
        dangerous: true,
        minTier: 1,
      },
      {
        name: "test-safe-echo",
        description: "test-only safe command",
        dangerous: false,
        minTier: 0,
      },
    ]);
  });

  test("dangerous denied in non-interactive without allowlist", async () => {
    const result = await runPlugin({
      name: "test-dangerous-echo",
      nonInteractive: true,
      allowlist: [],
    });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.error).toContain("Denied");
    expect(result.error).toContain("SAFE-1");
  });

  test("dangerous allowed when allowlisted in non-interactive", async () => {
    const result = await runPlugin({
      name: "test-dangerous-echo",
      args: ["hi"],
      nonInteractive: true,
      allowlist: ["test-dangerous-echo"],
    });
    expect(result.ok).toBe(true);
    expect(result.message).toBe("echoed");
  });

  test("dangerous allowed in interactive without allowlist", async () => {
    const result = await runPlugin({
      name: "test-dangerous-echo",
      nonInteractive: false,
    });
    expect(result.ok).toBe(true);
  });

  test("safe runs in non-interactive", async () => {
    const result = await runPlugin({
      name: "test-safe-echo",
      nonInteractive: true,
    });
    expect(result.ok).toBe(true);
  });

  test("unknown plugin throws", async () => {
    await expect(
      runPlugin({ name: "nope", nonInteractive: true }),
    ).rejects.toThrow(/Unknown plugin/);
  });
});
