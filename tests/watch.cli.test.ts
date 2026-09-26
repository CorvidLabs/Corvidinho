import { describe, expect, test } from "bun:test";

describe("github watch CLI", () => {
  test("github watch without token exits cleanly", async () => {
    const proc = Bun.spawn(["bun", "src/cli.ts", "github", "watch"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        GITHUB_TOKEN: "",
        GH_TOKEN: "",
        CORVIDINHO_WATCH_USERNAME: "corvid-agent",
        CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/Corvidinho",
      },
    });
    const [code, err, out] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
      new Response(proc.stdout).text(),
    ]);
    expect(code).not.toBe(0);
    const combined = err + out;
    expect(combined.toLowerCase()).toContain("github_token");
    expect(combined.toLowerCase()).toContain("go-live");
  });

  test("help mentions github watch", async () => {
    const proc = Bun.spawn(["bun", "src/cli.ts", "--help"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, out] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
    ]);
    expect(code).toBe(0);
    expect(out).toContain("github watch");
  });
});
