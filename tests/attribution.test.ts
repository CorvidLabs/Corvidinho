import { describe, expect, test } from "bun:test";
import {
  ATTRIBUTION_MARKDOWN,
  ATTRIBUTION_PLAIN,
  attribution,
} from "../src/attribution.ts";

describe("Corvidinho attribution", () => {
  test("exports canonical markdown and plain forms without handles", () => {
    expect(ATTRIBUTION_MARKDOWN).toBe(
      "Made with [Corvidinho](https://github.com/CorvidLabs/Corvidinho)",
    );
    expect(ATTRIBUTION_PLAIN).toBe(
      "Made with Corvidinho — https://github.com/CorvidLabs/Corvidinho",
    );
    expect(ATTRIBUTION_MARKDOWN).not.toContain("@");
    expect(ATTRIBUTION_PLAIN).not.toContain("@");
    expect(attribution()).toBe(ATTRIBUTION_MARKDOWN);
    expect(attribution("plain")).toBe(ATTRIBUTION_PLAIN);
  });

  test("CLI prints the markdown footer", async () => {
    const proc = Bun.spawn(["bun", "src/cli.ts", "attribution"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    const out = (await new Response(proc.stdout).text()).trim();
    expect(code).toBe(0);
    expect(out).toBe(ATTRIBUTION_MARKDOWN);
    expect(out).not.toContain("@");
  });
});
