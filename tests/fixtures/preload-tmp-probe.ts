/**
 * Child-process probe for tests/preload.tmp-cleanup.test.ts, run as
 * `bun test ./tests/fixtures/preload-tmp-probe.ts` (not a *.test.ts file, so
 * the main suite skips it). Under the bun test preload it makes temp dirs the
 * way tests do (tmpdir() read at module top level and inside a test, plus a
 * shell spawned with no explicit `env` running `mktemp -d`) and prints where
 * each landed. PRELOAD_TMP_PROBE_END=fail fails the test after printing;
 * PRELOAD_TMP_PROBE_END=exit calls process.exit(7) (skips afterAll).
 */
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDataDir } from "../../src/store/paths.ts";

const topLevel = tmpdir();

test("preload tmp probe makes temp dirs and reports where they landed", () => {
  const made = mkdtempSync(join(tmpdir(), "corvidinho-probe-tmp-"));
  const madeTop = mkdtempSync(join(topLevel, "corvidinho-probe-top-"));
  const shell = Bun.spawnSync(["sh", "-c", 'mktemp -d "${TMPDIR:-/tmp}/corvidinho-probe-sh-XXXXXX"'])
    .stdout.toString()
    .trim();
  console.log(
    `PRELOAD_TMP_PROBE ${JSON.stringify({
      tmpdir: tmpdir(),
      topLevel,
      env: { TMPDIR: process.env.TMPDIR ?? null, TMP: process.env.TMP ?? null, TEMP: process.env.TEMP ?? null },
      dataDir: resolveDataDir(),
      made: [made, madeTop, shell],
    })}`,
  );
  const end = process.env.PRELOAD_TMP_PROBE_END;
  if (end === "exit") process.exit(7);
  expect(end === "fail" ? "failed on purpose" : "ok").toBe("ok");
});
