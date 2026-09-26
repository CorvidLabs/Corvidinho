import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = import.meta.dir + "/..";
/** Missing allowlist file: the CLI never reads an operator's real file (ALLOW-4). */
const NO_ALLOWLIST = join(mkdtempSync(join(tmpdir(), "corvidinho-gh-deny-cli-")), "no-allowlist.toml");

describe("GITHUB-6 CLI gate (default-deny)", () => {
  test("github-pr-list without --repo exits 3", async () => {
    const proc = Bun.spawn(
      ["bun", "src/cli.ts", "plugins", "run", "github-pr-list", "--json"],
      {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, CORVIDINHO_GITHUB_ALLOW_REPOS: "", CORVIDINHO_ALLOWLIST_FILE: NO_ALLOWLIST },
      },
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
    // Not `delete`: unset falls back to ~/.config/corvidinho/allowlist.* (ALLOW-4).
    env.CORVIDINHO_ALLOWLIST_FILE = NO_ALLOWLIST;
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
          CORVIDINHO_ALLOWLIST_FILE: NO_ALLOWLIST,
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
          CORVIDINHO_ALLOWLIST_FILE: NO_ALLOWLIST,
          // Always the missing-token path: never call api.github.com from tests.
          GITHUB_TOKEN: "",
          GH_TOKEN: "",
        },
      },
    );
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    // Gate passed (not 3); stopped at auth (1, missing token) before any API call.
    expect(code).toBe(1);
    expect(out).toContain("missing GITHUB_TOKEN");
  });
});
