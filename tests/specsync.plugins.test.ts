import { describe, expect, test } from "bun:test";

const root = import.meta.dir + "/..";

async function run(...args: string[]) {
  const proc = Bun.spawn(["bun", "src/cli.ts", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { code, stdout, stderr };
}

describe("SpecSync plugins + CLI", () => {
  test("plugins list includes specsync-*", async () => {
    const { code, stdout } = await run("plugins", "list");
    expect(code).toBe(0);
    for (const name of [
      "specsync-list",
      "specsync-read",
      "specsync-check",
      "specsync-brief",
      "specsync-coverage",
      "specsync-change-list",
      "specsync-ship-status",
    ]) {
      expect(stdout).toContain(name);
    }
  });

  test("specsync list prints registered modules", async () => {
    const { code, stdout } = await run("specsync", "list");
    expect(code).toBe(0);
    expect(stdout).toContain("agent");
    expect(stdout).toContain("cli");
    expect(stdout).toContain("plugins");
    expect(stdout).toMatch(/\d+ spec\(s\) registered/);
  });

  test("specsync read cli returns spec body", async () => {
    const { code, stdout } = await run("specsync", "read", "cli");
    expect(code).toBe(0);
    expect(stdout).toContain("module: cli");
    expect(stdout).toContain("## Purpose");
  });

  test("specsync brief agent includes companions", async () => {
    const { code, stdout } = await run("specsync", "brief", "agent");
    expect(code).toBe(0);
    expect(stdout).toContain("# Spec: agent");
    expect(stdout).toMatch(/Companion: agent\//);
  });

  test("help mentions specsync surface", async () => {
    const { code, stdout } = await run("--help");
    expect(code).toBe(0);
    expect(stdout).toContain("specsync");
  });
});
