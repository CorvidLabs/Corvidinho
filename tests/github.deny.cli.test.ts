import { describe, expect, test } from "bun:test";

const root = import.meta.dir + "/..";

describe("GITHUB-6 CLI gate", () => {
  test("github-pr-list without --repo exits 3", async () => {
    const proc = Bun.spawn(
      ["bun", "src/cli.ts", "plugins", "run", "github-pr-list", "--json"],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    const code = await proc.exited;
    const err = await new Response(proc.stderr).text();
    const out = await new Response(proc.stdout).text();
    expect(code).toBe(3);
    expect(err + out).toContain("GITHUB-6");
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
        env: { ...process.env, CORVIDINHO_GITHUB_DENY_REPOS: "evil/*" },
      },
    );
    const code = await proc.exited;
    expect(code).toBe(3);
  });
});
