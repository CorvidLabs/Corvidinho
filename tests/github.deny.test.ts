import { describe, expect, test } from "bun:test";
import { checkRepoGate, extractRepoFromArgs } from "../src/plugins/githubDeny.ts";

describe("GITHUB-6 repo gate", () => {
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

  test("denylist blocks", () => {
    const r = checkRepoGate("evil/corp", {
      CORVIDINHO_GITHUB_DENY_REPOS: "evil/*,other/x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("denied");
  });

  test("allowlist restricts", () => {
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
});
