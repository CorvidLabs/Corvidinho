import { describe, expect, test } from "bun:test";

const root = import.meta.dir + "/..";

describe("corvidinho task run CLI", () => {
  test("help mentions task run and --no-verify", async () => {
    const proc = Bun.spawn(["bun", "src/cli.ts", "--help"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    expect(code).toBe(0);
    expect(out).toContain("task run");
    expect(out).toContain("--no-verify");
  });

  test("task run --no-verify --json skips gate", async () => {
    const proc = Bun.spawn(
      ["bun", "src/cli.ts", "task", "run", "--no-verify", "--json"],
      {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as {
      result: {
        verifySkipped: boolean;
        verified: boolean;
        state: string;
        cancelled: boolean;
      };
    };
    expect(parsed.result.verifySkipped).toBe(true);
    expect(parsed.result.verified).toBe(false);
    expect(parsed.result.state).toBe("done");
    expect(parsed.result.cancelled).toBe(false);
  });
});
