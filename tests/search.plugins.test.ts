import { describe, expect, test, beforeEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearRegistry, list } from "../src/plugins/registry.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";

describe("search plugins (REQ-plugins-081)", () => {
  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  test("plugins list includes search-grep", () => {
    const entry = list().find((e) => e.name === "search-grep");
    expect(entry).toBeTruthy();
    expect(entry!.dangerous).toBe(false);
    expect(entry!.minTier).toBe(0);
  });

  test("search-grep finds matches under cwd", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-grep-"));
    try {
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "src", "a.ts"), "const FINDME = 1;\n");
      writeFileSync(join(dir, "src", "b.ts"), "const other = 2;\n");

      const found = await runPlugin({
        name: "search-grep",
        args: ["FINDME", ".", "--include", "ts"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(found.ok).toBe(true);
      expect((found.data as { count: number }).count).toBeGreaterThanOrEqual(1);
      expect(found.message).toContain("FINDME");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
