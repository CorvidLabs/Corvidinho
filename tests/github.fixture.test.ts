import { describe, expect, test } from "bun:test";
import { parseJsonStdout } from "../plugins/github/api.ts";

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
