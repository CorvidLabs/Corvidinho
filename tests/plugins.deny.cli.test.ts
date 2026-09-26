import { describe, expect, test } from "bun:test";

const root = import.meta.dir + "/..";

describe("CLI non-interactive deny (SAFE-1 / CLI-3)", () => {
  test("danger-ping denied with --non-interactive", async () => {
    const proc = Bun.spawn(
      ["bun", "src/cli.ts", "--non-interactive", "plugins", "run", "danger-ping"],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    const code = await proc.exited;
    const err = await new Response(proc.stderr).text();
    expect(code).toBe(2);
    expect(err).toContain("Denied");
  });

  test("danger-ping denied via CORVIDINHO_NON_INTERACTIVE", async () => {
    const proc = Bun.spawn(["bun", "src/cli.ts", "plugins", "run", "danger-ping"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, CORVIDINHO_NON_INTERACTIVE: "1" },
    });
    const code = await proc.exited;
    expect(code).toBe(2);
  });

  test("danger-ping denied via FLEDGE_NON_INTERACTIVE", async () => {
    const proc = Bun.spawn(["bun", "src/cli.ts", "plugins", "run", "danger-ping"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        CORVIDINHO_NON_INTERACTIVE: "",
        FLEDGE_NON_INTERACTIVE: "true",
      },
    });
    const code = await proc.exited;
    expect(code).toBe(2);
  });

  test("danger-ping allowed when allowlisted", async () => {
    const proc = Bun.spawn(
      ["bun", "src/cli.ts", "--non-interactive", "plugins", "run", "danger-ping"],
      {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, CORVIDINHO_ALLOWLIST: "danger-ping" },
      },
    );
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    expect(code).toBe(0);
    expect(out).toContain("pong");
  });
});
