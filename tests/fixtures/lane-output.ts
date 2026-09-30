/**
 * Verify lane output for stub verify runners. A passing lane only counts as
 * verified when its output shows that tests ran (AGENT-15, REQ-agent-185),
 * so a stub for a passing lane prints a `bun test` summary, as
 * `fledge lanes run verify` does for this repo (stdout, then bun's stderr).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const LANE_PASS_OUTPUT =
  "▶️ Lane: verify\n  ▶️ Running task: test\nbun test v1.4.2\n  ✔ Step 1 done (5ms)\n✅ Lane verify completed (1 steps in 5ms)\n\n 3 pass\n 0 fail\nRan 3 tests across 1 file. [5.00ms]\n";

/**
 * An empty scratch dir outside any git work tree, for in-process runs whose
 * gate uses tool-reported files. Not `/tmp` itself: with no git snapshot the
 * none-deleted check walks the cwd's test files, and a walk of a shared temp
 * dir can be over its entry cap (then the run is not verified).
 */
export const NON_GIT_CWD = mkdtempSync(join(tmpdir(), "corvidinho-non-git-cwd-"));
process.once("exit", () => rmSync(NON_GIT_CWD, { recursive: true, force: true }));
