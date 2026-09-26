import { describe, expect, test } from "bun:test";

const root = import.meta.dir + "/..";

describe("plugins list smoke", () => {
  test("plugins list exits 0 and shows github+meta", async () => {
    const proc = Bun.spawn(["bun", "src/cli.ts", "plugins", "list"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    expect(code).toBe(0);
    expect(out).toContain("github-pr-list");
    expect(out).toContain("github-pr-status");
    expect(out).toContain("github-ci-status");
    expect(out).toContain("github-issue-list");
    expect(out).toContain("github-issue-create");
    expect(out).toContain("github-issue-comment");
    expect(out).toContain("github-pr-create");
    expect(out).toContain("github-pr-review");
    expect(out).toContain("github-pr-diff");
    expect(out).toContain("github-pr-files");
    expect(out).toContain("plugins-list");
    expect(out).toContain("files-read");
    expect(out).toContain("files-write");
    expect(out).toContain("search-grep");
    expect(out).toContain("shell-exec");
    expect(out).toContain("danger-ping");
  });

  test("plugins list --json is an array with danger markings", async () => {
    const proc = Bun.spawn(["bun", "src/cli.ts", "plugins", "list", "--json"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    expect(code).toBe(0);
    const data = JSON.parse(out);
    expect(Array.isArray(data)).toBe(true);
    const names = data.map((d: { name: string }) => d.name);
    expect(names).toContain("github-pr-list");
    const danger = data.find((d: { name: string }) => d.name === "danger-ping");
    expect(danger.dangerous).toBe(true);
  });
});
