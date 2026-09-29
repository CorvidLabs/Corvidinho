import { describe, expect, test } from "bun:test";
import { createOctokit, getGithubToken, parseJsonStdout } from "../plugins/github/api.ts";

const fixtures = import.meta.dir + "/fixtures/github";

describe("github fixture JSON parsing", () => {
  test("pr-list fixture parses", async () => {
    const raw = await Bun.file(`${fixtures}/pr-list.json`).text();
    const data = parseJsonStdout(raw) as Array<{ number: number; title: string }>;
    expect(data).toHaveLength(1);
    expect(data[0]!.number).toBe(1);
    expect(data[0]!.title).toContain("BOOT");
  });

  test("pr-status fixture parses", async () => {
    const raw = await Bun.file(`${fixtures}/pr-status.json`).text();
    const data = parseJsonStdout(raw) as { isDraft: boolean; number: number };
    expect(data.number).toBe(1);
    expect(data.isDraft).toBe(true);
  });

  test("ci-status fixture parses", async () => {
    const raw = await Bun.file(`${fixtures}/ci-status.json`).text();
    const data = parseJsonStdout(raw) as Array<{ state: string }>;
    expect(data[0]!.state).toBe("SUCCESS");
  });

  test("issue-list fixture parses", async () => {
    const raw = await Bun.file(`${fixtures}/issue-list.json`).text();
    const data = parseJsonStdout(raw) as Array<{ number: number }>;
    expect(data[0]!.number).toBe(42);
  });
});

describe("Octokit token (REQ-plugins-003, REQ-cli-003): a blank GITHUB_TOKEN / GH_TOKEN is missing", () => {
  test("a whitespace-only GITHUB_TOKEN does not shadow a real GH_TOKEN", () => {
    expect(getGithubToken({ GITHUB_TOKEN: "   ", GH_TOKEN: "ghp_fixtureNotReal" })).toBe("ghp_fixtureNotReal");
    expect(getGithubToken({ GITHUB_TOKEN: "ghp_first", GH_TOKEN: "ghp_second" })).toBe("ghp_first");
  });

  test("blank tokens only: no token, and createOctokit refuses before any request", () => {
    expect(getGithubToken({ GITHUB_TOKEN: "   " })).toBeUndefined();
    expect(getGithubToken({ GITHUB_TOKEN: " ", GH_TOKEN: "\t\n" })).toBeUndefined();
    const client = createOctokit({ GITHUB_TOKEN: "   " });
    expect("ok" in client && client.ok === false).toBe(true);
    expect("error" in client ? client.error : "").toContain("missing GITHUB_TOKEN or GH_TOKEN");
  });
});
