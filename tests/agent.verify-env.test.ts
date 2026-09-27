/**
 * The prove-before-done verify lane runs tests the agent wrote, so the default
 * verify runner spawns fledge without operator secrets (SAFE-6): no Discord
 * config, GitHub tokens, LLM API keys, audit key or acting identity.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildVerifyEnv, defaultVerifyRunner, isVerifyEnvDropped } from "../src/agent/verify.ts";

const SECRETS: Record<string, string> = {
  DISCORD_TOKEN: "discord-token-secret",
  DISCORD_BOT_TOKEN: "discord-bot-token-secret",
  GITHUB_TOKEN: "ghp_githubtokensecret",
  GH_TOKEN: "gho_ghtokensecret",
  OPENAI_API_KEY: "sk-openai-secret",
  CORVIDINHO_LLM_API_KEY: "sk-corvidinho-llm-secret",
  CORVIDINHO_AUDIT_HMAC_KEY: "audit-hmac-secret",
  CORVIDINHO_ACTING_IS_ADMIN: "1",
  CORVIDINHO_ACTING_CONFIRM_TOKENS: "confirm-token-secret",
  CORVIDINHO_ACTING_DISCORD_USER_ID: "123",
};

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("verify runner env (SAFE-6)", () => {
  test("isVerifyEnvDropped covers the worker drop list plus LLM API keys", () => {
    for (const k of Object.keys(SECRETS)) expect(isVerifyEnvDropped(k)).toBe(true);
    for (const k of ["PATH", "HOME", "CORVIDINHO_DATA_DIR", "CORVIDINHO_LLM_BASE_URL", "CORVIDINHO_LLM_MODEL"]) {
      expect(isVerifyEnvDropped(k)).toBe(false);
    }
  });

  test("buildVerifyEnv keeps the rest of the env and drops every secret", () => {
    const env = buildVerifyEnv({
      ...SECRETS,
      PATH: "/usr/bin",
      HOME: "/home/op",
      CORVIDINHO_DATA_DIR: "/data",
      KEEP_ME: "yes",
    });
    expect(env).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/op",
      CORVIDINHO_DATA_DIR: "/data",
      KEEP_ME: "yes",
    });
  });

  test("defaultVerifyRunner spawns fledge without operator secrets", async () => {
    const bin = mkdtempSync(join(tmpdir(), "corvidinho-fake-fledge-"));
    dirs.push(bin);
    const fake = join(bin, "fledge");
    writeFileSync(fake, '#!/bin/sh\necho "ARGV $*"\nenv\n');
    chmodSync(fake, 0o755);

    // A bridge / daemon process with the operator's env runs the default
    // runner (child process: Bun.which reads PATH as the process started).
    const runner = join(import.meta.dir, "..", "src", "agent", "verify.ts");
    const script =
      `const { defaultVerifyRunner } = await import(${JSON.stringify(runner)});` +
      `const r = await defaultVerifyRunner(${JSON.stringify(bin)});` +
      `process.stdout.write(JSON.stringify(r));`;
    const proc = Bun.spawn([process.execPath, "--no-env-file", "-e", script], {
      cwd: bin,
      env: {
        ...process.env,
        ...SECRETS,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        VERIFY_ENV_MARKER: "kept",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    expect(code, stderr).toBe(0);
    const res = JSON.parse(stdout) as { success: boolean; output: string };
    expect(res.success, res.output).toBe(true);
    expect(res.output).toContain("ARGV lanes run verify --non-interactive");
    expect(res.output).toContain("VERIFY_ENV_MARKER=kept");
    const keys = res.output
      .split("\n")
      .map((l) => l.split("=")[0])
      .filter((k): k is string => !!k);
    for (const k of Object.keys(SECRETS)) expect(keys).not.toContain(k);
    for (const v of Object.values(SECRETS).filter((s) => s.length > 3)) {
      expect(res.output).not.toContain(v);
    }
  });
});
