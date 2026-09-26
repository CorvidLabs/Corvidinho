/**
 * bun test preload (bunfig.toml): isolate the shared SQLite data dir so no
 * test (or CLI it spawns) touches ~/.local/share/corvidinho, and never read
 * the operator's allowlist file (ALLOW-4).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "corvidinho-test-data-"));

if (!process.env.CORVIDINHO_DATA_DIR?.trim()) {
  process.env.CORVIDINHO_DATA_DIR = scratch;
}

// Always overwrite: an operator's CORVIDINHO_ALLOWLIST_FILE or
// ~/.config/corvidinho/allowlist.* must never change test outcomes. This path
// does not exist, so the loader adds nothing. Tests that need a file set their
// own; tests that hand a custom env object to a loader pass a missing path too.
process.env.CORVIDINHO_ALLOWLIST_FILE = join(scratch, "no-allowlist.toml");
