import { describe, expect, test } from "bun:test";
import { checkRepoGate, extractRepoFromArgs } from "../src/plugins/githubDeny.ts";

describe("GITHUB-6 repo gate (default-deny)", () => {
  test("extracts --repo", () => {
    expect(extractRepoFromArgs(["--repo", "CorvidLabs/Corvidinho"])).toBe(
      "CorvidLabs/Corvidinho",
    );
  });

  test("requires explicit repo", () => {
    const r = checkRepoGate(undefined, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("GITHUB-6");
  });

  test("empty allowlist denies all (not Merlin BASIC)", () => {
    const r = checkRepoGate("CorvidLabs/Corvidinho", {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.toLowerCase()).toMatch(/not authorized|empty|default-deny/);
    }
  });

  test("denylist blocks even when allow matches", () => {
    const r = checkRepoGate("evil/corp", {
      CORVIDINHO_GITHUB_ALLOW_REPOS: "evil/*",
      CORVIDINHO_GITHUB_DENY_REPOS: "evil/*,other/x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toMatch(/denied|not authorized/);
  });

  test("allowlist restricts non-match", () => {
    const r = checkRepoGate("other/repo", {
      CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/*",
    });
    expect(r.ok).toBe(false);
  });

  test("allowlist permits match", () => {
    const r = checkRepoGate("CorvidLabs/Corvidinho", {
      CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/*",
    });
    expect(r.ok).toBe(true);
  });

  test("org allow permits repo under org", () => {
    const r = checkRepoGate("CorvidLabs/Corvidinho", {
      CORVIDINHO_GITHUB_ALLOW_ORGS: "CorvidLabs",
    });
    expect(r.ok).toBe(true);
  });
});
