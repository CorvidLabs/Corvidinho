import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { defaultDbPath, resolveDataDir } from "../src/store/paths.ts";

describe("store paths (MEMORY-1 alignment)", () => {
  test("defaults to ~/.local/share/corvidinho", () => {
    const dir = resolveDataDir({ env: {}, home: "/home/leif" });
    expect(dir).toBe(join("/home/leif", ".local", "share", "corvidinho"));
    expect(defaultDbPath({ env: {}, home: "/home/leif" })).toBe(
      join(dir, "corvidinho.db"),
    );
  });

  test("CORVIDINHO_DATA_DIR overrides", () => {
    const dir = resolveDataDir({
      env: { CORVIDINHO_DATA_DIR: "/tmp/corvidinho-data" },
      home: "/home/leif",
    });
    expect(dir).toBe("/tmp/corvidinho-data");
  });
});
