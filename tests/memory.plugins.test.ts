import { describe, expect, test, beforeEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearRegistry } from "../src/plugins/registry.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { list } from "../src/plugins/registry.ts";

describe("memory plugins (REQ-plugins-010)", () => {
  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  test("plugins list includes memory-* with danger markings", () => {
    const names = list().map((e) => e.name);
    expect(names).toContain("memory-store");
    expect(names).toContain("memory-recall");
    expect(names).toContain("memory-forget");
    expect(names).toContain("memory-override");
    const forget = list().find((e) => e.name === "memory-forget");
    expect(forget?.dangerous).toBe(true);
    const store = list().find((e) => e.name === "memory-store");
    expect(store?.dangerous).toBe(false);
  });

  test("store/recall + ACL refuse forget without admin/confirm", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-memplug-"));
    try {
      const dbPath = join(dir, "t.db");
      const stored = await runPlugin({
        name: "memory-store",
        args: [
          "--db",
          dbPath,
          "--user",
          "u1",
          "--category",
          "conversation",
          "--key",
          "c1",
          "hello memory",
        ],
        nonInteractive: true,
      });
      expect(stored.ok).toBe(true);
      const id = (stored.data as { id: string }).id;

      const recalled = await runPlugin({
        name: "memory-recall",
        args: ["--db", dbPath, "--user", "u1"],
        nonInteractive: true,
      });
      expect(recalled.ok).toBe(true);
      expect((recalled.data as unknown[]).length).toBe(1);

      const noConfirm = await runPlugin({
        name: "memory-forget",
        args: ["--db", dbPath, "--user", "u1", "--id", id, "--admin"],
        nonInteractive: true,
        allowlist: ["memory-forget"],
      });
      expect(noConfirm.ok).toBe(false);
      expect(noConfirm.error).toContain("--confirm");

      const noAdmin = await runPlugin({
        name: "memory-forget",
        args: ["--db", dbPath, "--user", "u1", "--id", id, "--confirm"],
        nonInteractive: true,
        allowlist: ["memory-forget"],
      });
      expect(noAdmin.ok).toBe(false);
      expect(noAdmin.error).toBe("not authorized");
      expect(noAdmin.error).not.toContain("hello memory");

      const okForget = await runPlugin({
        name: "memory-forget",
        args: [
          "--db",
          dbPath,
          "--user",
          "admin",
          "--id",
          id,
          "--confirm",
          "--admin",
        ],
        nonInteractive: true,
        allowlist: ["memory-forget"],
      });
      expect(okForget.ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
