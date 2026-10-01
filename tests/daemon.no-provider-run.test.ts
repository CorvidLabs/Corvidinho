/**
 * REQ-cli-079 (AGENT-10 / AGENT-13, with DISCORD-3.b since #340) — what a
 * `corvidinho daemon` schedule run records when no model provider is set.
 *
 * The daemon spawns the real `task run` (through a wrapper bin that clears
 * the model settings), which fails with the no-provider notice as its
 * result's `error`. The run row of the owner's own schedule keeps that notice
 * as its summary; anyone else's keeps "That didn't work." (the daemon has no
 * DM path, so it never says the owner was told). Both rows' `error` and the
 * `run.finished` log event read `failed (exit 1): <notice>`, and one
 * `[scheduler] run failed (schedule <id>, exit 1): <notice>` line is logged —
 * never the old bare `failed (exit 1)` line. Temp data dirs, no network.
 */
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NO_PROVIDER_NOTICE } from "../src/agent/providers.ts";
import { buildCorvidinhoArgv } from "../src/agent/spawn-argv.ts";
import { createDaemonLogger, startDaemon } from "../src/daemon/index.ts";
import { FAILED_TEXT } from "../src/discord/failure-reason.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const ROOT = join(import.meta.dir, "..");
const OWNER_ID = "111122223333444455";
const OTHER_ID = "222233334444555566";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

/** The real CLI with every model setting cleared, whatever the suite's env holds. */
function noModelBin(): string {
  const dir = tempDir("corvidinho-daemon-nomodel-bin-");
  const bin = join(dir, "corvidinho");
  const argv = buildCorvidinhoArgv(join(ROOT, "src/cli.ts"))
    .map((a) => `'${a.replace(/'/g, "'\\''")}'`)
    .join(" ");
  writeFileSync(
    bin,
    "#!/bin/sh\n" +
      "export CORVIDINHO_LLM_MODEL= CORVIDINHO_LLM_MODEL_READ= CORVIDINHO_LLM_MODEL_TOOL= CORVIDINHO_LLM_MODEL_CODE=\n" +
      `exec ${argv} "$@"\n`,
    { mode: 0o755 },
  );
  chmodSync(bin, 0o755);
  return bin;
}

describe("daemon: a schedule run with no model provider (REQ-cli-079)", () => {
  test("the row keeps the notice (owner) or 'That didn't work.' (anyone else); error, run.finished and the log say why", async () => {
    const warns: string[] = [];
    const spy = spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
      warns.push(a.map(String).join(" "));
    });
    cleanups.push(() => spy.mockRestore());

    const dataDir = tempDir("corvidinho-daemon-nomodel-");
    const env = {
      ...process.env,
      CORVIDINHO_DATA_DIR: dataDir,
      CORVIDINHO_BIN: noModelBin(),
      CORVIDINHO_LLM_MODEL: "",
      CORVIDINHO_DISCORD_ALLOW_USERS: "",
      CORVIDINHO_DISCORD_ALLOW_ROLES: "",
      CORVIDINHO_DISCORD_DENY_USERS: "",
      CORVIDINHO_DISCORD_DENY_ROLES: "",
      CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
    };
    const db = openCorvidinhoDb({ env });
    cleanups.push(() => db.close());
    const store = new ScheduleStore({ db });
    const seed = (name: string, createdByUserId: string) => {
      const s = store.create({ name, cronExpression: "0 * * * *", project: ".", prompt: "summarize", createdByUserId });
      db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [Date.now() - 1000, s.id]);
      return s.id;
    };
    const own = seed("mine", OWNER_ID);
    const other = seed("theirs", OTHER_ID);

    const lines: Array<Record<string, unknown>> = [];
    const d = await startDaemon({
      env,
      projectRoot: tempDir("corvidinho-daemon-nomodel-proj-"),
      logger: createDaemonLogger({ write: (l) => lines.push(JSON.parse(l)) }),
      useWorktrees: false,
      skipProtocolCheck: true,
    });
    if (!d.ok) throw new Error("daemon did not start");
    expect(lines.find((l) => l.event === "llm.no_provider")).toBeDefined();

    expect((await d.tick()).started.sort()).toEqual([own, other].sort());
    const finished = () => lines.filter((l) => l.event === "run.finished");
    for (let i = 0; i < 600 && finished().length < 2; i++) await Bun.sleep(50);
    await d.stop("SIGTERM");

    const row = (id: string) =>
      db.query("SELECT status, summary, error FROM schedule_runs WHERE schedule_id = ?").get(id) as {
        status: string;
        summary: string;
        error: string;
      };
    const mine = row(own);
    const notice = mine.summary;
    expect(notice).toStartWith(`${NO_PROVIDER_NOTICE}: CORVIDINHO_LLM_MODEL is not set.`);
    expect(mine).toEqual({ status: "failed", summary: notice, error: `failed (exit 1): ${notice}` });
    expect(row(other)).toEqual({ status: "failed", summary: FAILED_TEXT, error: `failed (exit 1): ${notice}` });

    for (const id of [own, other]) {
      expect(finished().find((l) => l.scheduleId === id)).toMatchObject({
        level: "warn",
        ok: false,
        error: `failed (exit 1): ${notice}`,
      });
      expect(warns).toContain(`[scheduler] run failed (schedule ${id}, exit 1): ${notice}`);
    }
  }, 60_000);
});
