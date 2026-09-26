import { describe, expect, test } from "bun:test";

describe("corvidinho CLI smoke", () => {
  test("--help exits 0", async () => {
    const proc = Bun.spawn(["bun", "src/cli.ts", "--help"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    expect(code).toBe(0);
    expect(out).toContain("corvidinho");
    expect(out).toContain("--help");
  });

  test("version exits 0", async () => {
    const proc = Bun.spawn(["bun", "src/cli.ts", "version"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    const out = (await new Response(proc.stdout).text()).trim();
    expect(code).toBe(0);
    expect(out).toMatch(/^\d+\.\d+\.\d+/);
  });
});
