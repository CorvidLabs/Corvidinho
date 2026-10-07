/**
 * Shared version helper + LLM/git status lines.
 */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  formatLlmStatusLine,
  llmBaseHost,
  readPackageVersion,
  tryGitTipShortSha,
  VERSION,
} from "../src/version.ts";

describe("readPackageVersion / VERSION", () => {
  test("matches package.json at repo root", () => {
    const fromFile = readPackageVersion(
      join(import.meta.dir, "..", "package.json"),
    );
    expect(fromFile).toBe("0.0.46");
    expect(VERSION).toBe("0.0.46");
  });

  test("returns 0.0.0 for missing file", () => {
    expect(readPackageVersion("/tmp/corvidinho-no-such-package.json")).toBe(
      "0.0.0",
    );
  });
});

describe("formatLlmStatusLine", () => {
  test("no provider: says so (AGENT-10), never a stub or a default model", () => {
    expect(formatLlmStatusLine({}, { ownerView: true })).toBe(
      "LLM: none — No model provider is configured: CORVIDINHO_LLM_MODEL is not set. Set CORVIDINHO_LLM_MODEL (or CORVIDINHO_LLM_MODEL_READ / _TOOL / _CODE per tier) to openai:<model>, ollama:<model> or anthropic:<model>; there is no built-in default.",
    );
    // A model whose kind needs a key it does not have is no provider either.
    expect(formatLlmStatusLine({ CORVIDINHO_LLM_MODEL: "x" }, { ownerView: true })).toBe(
      "LLM: none — No model provider is configured: x needs CORVIDINHO_LLM_API_KEY or OPENAI_API_KEY, which is not set.",
    );
    // A key alone picks no model (AGENT-13).
    const keyOnly = formatLlmStatusLine({ OPENAI_API_KEY: "sk-openai-secret" }, { ownerView: true });
    expect(keyOnly).toStartWith("LLM: none — No model provider is configured");
    expect(keyOnly).not.toContain("gpt-4o-mini");
    expect(keyOnly).not.toContain("sk-openai");
    // A caller that does not say who is looking gets the non-owner line
    // (fail closed): no tier or setting names.
    expect(formatLlmStatusLine({})).toBe("LLM: none — No model provider is configured.");
  });

  test("model @ host when key set; never includes key", () => {
    const line = formatLlmStatusLine({
      CORVIDINHO_LLM_API_KEY: "sk-secret-never-print",
      CORVIDINHO_LLM_MODEL: "gpt-test",
      CORVIDINHO_LLM_BASE_URL: "https://api.example.com/v1",
    });
    expect(line).toBe("LLM: gpt-test @ api.example.com");
    expect(line).not.toContain("sk-secret");
    expect(line).not.toContain("never-print");
  });

  test("OPENAI_API_KEY fallback still never prints key", () => {
    const line = formatLlmStatusLine({
      OPENAI_API_KEY: "sk-openai-secret",
      CORVIDINHO_LLM_MODEL: "local",
      CORVIDINHO_LLM_BASE_URL: "http://127.0.0.1:8080/v1",
    });
    expect(line).toContain("LLM:");
    expect(line).toContain("@ 127.0.0.1:8080");
    expect(line).not.toContain("sk-openai");
  });
});

describe("llmBaseHost", () => {
  test("parses host from URL", () => {
    expect(llmBaseHost("https://api.openai.com/v1")).toBe("api.openai.com");
  });
});

describe("tryGitTipShortSha", () => {
  test("returns short sha in this repo or undefined without throwing", () => {
    const sha = tryGitTipShortSha(join(import.meta.dir, ".."));
    if (sha !== undefined) {
      expect(sha.length).toBeGreaterThanOrEqual(4);
      expect(sha.length).toBeLessThanOrEqual(40);
    }
  });

  test("offline / bad cwd does not throw", () => {
    expect(tryGitTipShortSha("/tmp/corvidinho-not-a-git-repo-xyz")).toBeUndefined();
  });
});
