/**
 * bun test preload (bunfig.toml): isolate the shared SQLite data dir so no
 * test (or CLI it spawns) touches ~/.local/share/corvidinho.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (!process.env.CORVIDINHO_DATA_DIR?.trim()) {
  process.env.CORVIDINHO_DATA_DIR = mkdtempSync(join(tmpdir(), "corvidinho-test-data-"));
}
