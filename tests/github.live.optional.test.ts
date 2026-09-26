import { describe, expect, test } from "bun:test";

/**
 * Optional live gh smoke. Skips unless CORVIDINHO_LIVE_GH=1 and gh auth works.
 * Prefer fixture tests for CI.
 */
const live = process.env.CORVIDINHO_LIVE_GH === "1";
const root = import.meta.dir + "/..";

describe.skipIf(!live)("github live (optional)", () => {
  test("github-pr-list against CorvidLabs/Corvidinho", async () => {
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
        "--limit",
        "5",
      ],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    expect(code).toBe(0);
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(true);
    expect(Array.isArray(parsed.data)).toBe(true);
    if (code !== 0) console.error(err);
  });
});
