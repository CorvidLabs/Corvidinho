import { describe, expect, test } from "bun:test";

const root = import.meta.dir + "/..";

describe("GITHUB-6 CLI gate (default-deny)", () => {
  test("github-pr-list without --repo exits 3", async () => {
    const proc = Bun.spawn(
      ["bun", "src/cli.ts", "plugins", "run", "github-pr-list", "--json"],
      { cwd: root, stdout: "pipe", stderr: "pipe", env: { ...process.env, CORVIDINHO_GITHUB_ALLOW_REPOS: "" } },
    );
    const code = await proc.exited;
    const err = await new Response(proc.stderr).text();
    const out = await new Response(proc.stdout).text();
    expect(code).toBe(3);
    expect(err + out).toContain("GITHUB-6");
  });

  test("empty allowlist denies repo (not Merlin BASIC)", async () => {
    const env = { ...process.env };
    delete env.CORVIDINHO_GITHUB_ALLOW_REPOS;
    delete env.CORVIDINHO_GITHUB_ALLOW_ORGS;
    delete env.CORVIDINHO_ALLOWLIST_FILE;
    const proc = Bun.spawn(
      [
        "bun",
        "src/cli.ts",
        "plugins",
        "run",
        "github-pr-list",
        "--json",
        "--",
        "--repo",
        "CorvidLabs/Corvidinho",
      ],
      { cwd: root, stdout: "pipe", stderr: "pipe", env },
    );
    const code = await proc.exited;
    expect(code).toBe(3);
  });

  test("denied repo exits 3", async () => {
    const proc = Bun.spawn(
      [
        "bun",
        "src/cli.ts",
        "plugins",
        "run",
        "github-pr-list",
        "--json",
        "--",
        "--repo",
        "evil/corp",
      ],
      {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          CORVIDINHO_GITHUB_ALLOW_REPOS: "evil/*",
          CORVIDINHO_GITHUB_DENY_REPOS: "evil/*",
        },
      },
    );
    const code = await proc.exited;
    expect(code).toBe(3);
  });

  test("allowlisted repo reaches auth/API layer (not gate 3)", async () => {
    const proc = Bun.spawn(
      [
        "bun",
        "src/cli.ts",
        "plugins",
        "run",
        "github-pr-list",
        "--json",
        "--",
        "--repo",
        "CorvidLabs/Corvidinho",
      ],
      {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/*",
          // Force missing token path if unset — exit should not be 3 (gate)
          GITHUB_TOKEN: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "",
          GH_TOKEN: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "",
        },
      },
    );
    const code = await proc.exited;
    // Gate passed: either 0 (API ok) or 1 (missing token / API error) — not 3
    expect(code).not.toBe(3);
  });
});
