import { afterAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeCarriedTalk } from "./fixtures/talk-worktree.ts";
import { startFakeLlm } from "./fixtures/fake-llm.ts";

// AGENT-13: there is no built-in default model or stub, so spawned runs
// call this localhost fake provider (a keyless ollama: model).
const fakeLlm = startFakeLlm();
afterAll(() => fakeLlm.stop());

const root = import.meta.dir + "/..";

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(check: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await Bun.sleep(25);
  }
  return check();
}

/** Temp dir with a fake `fledge` on PATH that records every call, and a non-git project. */
function recordingLane() {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-task-cli-"));
  const bin = join(dir, "bin");
  const work = join(dir, "work");
  mkdirSync(bin);
  mkdirSync(work);
  const calls = join(dir, "fledge.calls");
  writeFileSync(join(bin, "fledge"), `#!/bin/sh\necho "$*" >> '${calls}'\nexit 1\n`);
  chmodSync(join(bin, "fledge"), 0o755);
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    CORVIDINHO_LLM_API_KEY: "",
    OPENAI_API_KEY: "",
    ...fakeLlm.env,
    CORVIDINHO_DELEGATE_DEPTH: "",
  };
  return { dir, work, calls, env };
}

async function cliIn(cwd: string, args: string[], env: Record<string, string | undefined>) {
  const proc = Bun.spawn(["bun", join(root, "src/cli.ts"), ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env,
  });
  const [code, out, err] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code, out, err };
}

describe("corvidinho task run CLI", () => {
  test("help documents task run and no longer offers --no-verify (AGENT-14)", async () => {
    const proc = Bun.spawn(["bun", "src/cli.ts", "--help"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    expect(code).toBe(0);
    expect(out).toContain("task run");
    expect(out).not.toContain("--no-verify");
    // REQ-cli-009 / AGENT-5: the optional per-tier model keys are documented.
    expect(out).toContain("CORVIDINHO_LLM_MODEL_READ / _TOOL / _CODE");
    // REQ-cli-009 / AGENT-17.a: so is the optional model order.
    expect(out).toContain("CORVIDINHO_LLM_MODEL_ORDER");
  });

  test("task run --no-verify is refused before anything runs: exit 1, one line, no lane, no run (REQ-cli-085)", async () => {
    const lane = recordingLane();
    try {
      const r = await cliIn(lane.work, ["task", "run", "--no-verify", "--task", "fix it"], lane.env);
      expect(r.code).toBe(1);
      expect(r.out).toBe("");
      expect(r.err).toContain(
        "corvidinho: --no-verify was removed: verification can't be skipped (AGENT-14)",
      );
      expect(r.err).toContain("hint: run the command without it");
      expect(r.err).not.toContain("planning");
      expect(existsSync(lane.calls)).toBe(false);

      // Anywhere it is read as a Corvidinho flag, before the command too.
      const early = await cliIn(lane.work, ["--no-verify", "doctor"], lane.env);
      expect(early.code).toBe(1);
      expect(early.out).toBe("");
      expect(early.err).toContain("--no-verify was removed");
    } finally {
      rmSync(lane.dir, { recursive: true, force: true });
    }
  });

  test("with --json the refusal is { ok: false, error } on stdout (REQ-cli-419 shape)", async () => {
    const lane = recordingLane();
    try {
      for (const args of [
        ["task", "run", "--no-verify", "--json"],
        ["task", "run", "--output", "json", "--no-verify"],
      ]) {
        const r = await cliIn(lane.work, args, lane.env);
        expect(r.code).toBe(1);
        expect(JSON.parse(r.out)).toEqual({
          ok: false,
          error: "--no-verify was removed: verification can't be skipped (AGENT-14)",
        });
      }
      expect(existsSync(lane.calls)).toBe(false);
    } finally {
      rmSync(lane.dir, { recursive: true, force: true });
    }
  });

  test("task run --json that changed nothing ends done with the 'nothing to verify' note (REQ-agent-003)", async () => {
    const lane = recordingLane();
    try {
      const r = await cliIn(lane.work, ["task", "run", "--here", "--json"], lane.env);
      expect(r.code).toBe(0);
      const parsed = JSON.parse(r.out) as {
        result: {
          verifySkipped: boolean;
          verified: boolean;
          state: string;
          cancelled: boolean;
          filesChanged: string[];
        };
        events: Array<{ type: string; text?: string }>;
      };
      expect(parsed.result.verifySkipped).toBe(true);
      expect(parsed.result.verified).toBe(false);
      expect(parsed.result.state).toBe("done");
      expect(parsed.result.cancelled).toBe(false);
      // The fake model changes nothing, so it claims nothing.
      expect(parsed.result.filesChanged).toEqual([]);
      expect(
        parsed.events.filter((e) => e.type === "Text" && e.text === "Verify gate: no changes, nothing to verify."),
      ).toHaveLength(1);
      expect(existsSync(lane.calls)).toBe(false);
    } finally {
      rmSync(lane.dir, { recursive: true, force: true });
    }
  });

  test("--json stays one pretty { result, events } document (not ndjson, #73)", async () => {
    const lane = recordingLane();
    try {
      const { code, out } = await cliIn(lane.work, ["task", "run", "--here", "--json"], lane.env);
      expect(code).toBe(0);
      // Pretty-printed single document: starts with "{\n  " and has no per-line frames.
      expect(out.startsWith("{\n  ")).toBe(true);
      const parsed = JSON.parse(out) as Record<string, unknown> & {
        events: Array<Record<string, unknown>>;
      };
      expect(Object.keys(parsed).sort()).toEqual(["events", "result"]);
      expect(parsed.events[0]).toEqual({ type: "StateChanged", state: "planning" });
      expect(parsed.events.every((e) => !("protocol" in e))).toBe(true);
      expect(parsed.events.map((e) => e.type)).not.toContain("usage");
    } finally {
      rmSync(lane.dir, { recursive: true, force: true });
    }
  });
});

describe("task run interrupted by a signal (AGENT-3, REQ-cli-244)", () => {
  // A fake `fledge` on PATH stands in for the verify lane: like the real one
  // it runs the lane's task as a child, records both pids, then blocks, so the
  // signal always lands while verify is running. The run's cwd is a talk
  // worktree whose last run left an unverified edit, so the run (the fake
  // model changes nothing itself) still verifies (AGENT-15.a).
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    test(`${sig} during verify: cancelled result frame, exit 130, verify lane stopped`, async () => {
      const dir = mkdtempSync(join(tmpdir(), "corvidinho-task-signal-"));
      const bin = join(dir, "bin");
      mkdirSync(bin);
      const { work } = await makeCarriedTalk(dir);
      const pidFile = join(dir, "fledge.pid");
      const taskPidFile = join(dir, "task.pid");
      writeFileSync(
        join(bin, "fledge"),
        `#!/bin/sh\nsleep 30 &\necho $! > '${taskPidFile}'\necho $$ > '${pidFile}'\nwait\n`,
      );
      chmodSync(join(bin, "fledge"), 0o755);
      let fledgePid = 0;
      let taskPid = 0;
      const proc = Bun.spawn(
        [
          "bun",
          join(root, "src/cli.ts"),
          "task",
          "run",
          "--here",
          "--task",
          "demo",
          "--output",
          "ndjson",
        ],
        {
          cwd: work,
          stdout: "pipe",
          stderr: "pipe",
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH ?? ""}`,
            CORVIDINHO_LLM_API_KEY: "",
            OPENAI_API_KEY: "",
            ...fakeLlm.env,
            // A top-level run (it takes the talk's marker), even inside a worker's lane.
            CORVIDINHO_DELEGATE_DEPTH: "",
          },
        },
      );
      try {
        const out = new Response(proc.stdout).text();
        const started = await waitFor(
          () => existsSync(pidFile) && readFileSync(pidFile, "utf8").trim() !== "",
          10_000,
        );
        expect(started).toBe(true);
        fledgePid = Number(readFileSync(pidFile, "utf8").trim());
        taskPid = Number(readFileSync(taskPidFile, "utf8").trim());
        expect(pidAlive(fledgePid)).toBe(true);
        expect(pidAlive(taskPid)).toBe(true);

        proc.kill(sig);
        const code = await Promise.race([
          proc.exited,
          Bun.sleep(10_000).then(() => "still running" as const),
        ]);
        expect(code).toBe(130);
        expect(proc.signalCode).toBeNull();

        const frames = (await out)
          .split("\n")
          .filter((l) => l.trim())
          .map((l) => JSON.parse(l) as { type: string; result?: Record<string, unknown> });
        const last = frames[frames.length - 1];
        expect(last?.type).toBe("result");
        expect(last?.result).toMatchObject({
          cancelled: true,
          verified: false,
          state: "failed",
        });
        // The lane (fledge and its task) was stopped, not left to finish in
        // the background.
        expect(await waitFor(() => !pidAlive(fledgePid), 2_000)).toBe(true);
        expect(await waitFor(() => !pidAlive(taskPid), 2_000)).toBe(true);
      } finally {
        if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
        for (const pid of [fledgePid, taskPid]) {
          if (pid > 0 && pidAlive(pid)) process.kill(pid, "SIGKILL");
        }
        rmSync(dir, { recursive: true, force: true });
      }
    }, 30_000);
  }

  /**
   * Temp dir with a fake `fledge` (a sh script body; `$DIR` is the temp dir)
   * on PATH, and a carried talk worktree to run in (verify runs).
   */
  async function fakeLane(body: string) {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-task-signal-"));
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const { work } = await makeCarriedTalk(dir);
    writeFileSync(join(bin, "fledge"), `#!/bin/sh\nexport DIR='${dir}'\n${body}\n`);
    chmodSync(join(bin, "fledge"), 0o755);
    return { dir, bin, work };
  }

  /** `task run --task demo --output ndjson` in a carried talk worktree (verify runs). */
  function spawnTaskRun(lane: { bin: string; work: string }, wrap: string[] = []) {
    return Bun.spawn(
      [...wrap, "bun", join(root, "src/cli.ts"), "task", "run", "--here", "--task", "demo", "--output", "ndjson"],
      {
        cwd: lane.work,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          PATH: `${lane.bin}:${process.env.PATH ?? ""}`,
          CORVIDINHO_LLM_API_KEY: "",
          OPENAI_API_KEY: "",
          ...fakeLlm.env,
          // A top-level run (it takes the talk's marker), even inside a worker's lane.
          CORVIDINHO_DELEGATE_DEPTH: "",
        },
      },
    );
  }

  const pidIn = (file: string) =>
    existsSync(file) ? Number(readFileSync(file, "utf8").trim()) || 0 : 0;

  function lastResult(out: string): Record<string, unknown> | undefined {
    const frames = out
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { type: string; result?: Record<string, unknown> });
    const last = frames[frames.length - 1];
    return last?.type === "result" ? last.result : undefined;
  }

  test("SIGINT the run started with ignored (a background job) stays ignored; SIGTERM still cancels", async () => {
    const lane = await fakeLane(`echo $$ > "$DIR/fledge.pid"\nexec sleep 30`);
    const pidFile = join(lane.dir, "fledge.pid");
    // A non-interactive shell starts `cmd &` with SIGINT ignored.
    const proc = spawnTaskRun(lane, ["sh", "-c", 'trap "" INT; exec "$@"', "sh"]);
    let fledgePid = 0;
    try {
      const out = new Response(proc.stdout).text();
      expect(await waitFor(() => pidIn(pidFile) > 0, 10_000)).toBe(true);
      fledgePid = pidIn(pidFile);

      proc.kill("SIGINT");
      await Bun.sleep(1_000);
      expect(proc.exitCode).toBeNull();
      expect(proc.signalCode).toBeNull();
      expect(pidAlive(fledgePid)).toBe(true);

      proc.kill("SIGTERM");
      const code = await Promise.race([
        proc.exited,
        Bun.sleep(10_000).then(() => "still running" as const),
      ]);
      expect(code).toBe(130);
      expect(lastResult(await out)).toMatchObject({ cancelled: true, state: "failed" });
      expect(await waitFor(() => !pidAlive(fledgePid), 2_000)).toBe(true);
    } finally {
      if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
      if (fledgePid > 0 && pidAlive(fledgePid)) process.kill(fledgePid, "SIGKILL");
      rmSync(lane.dir, { recursive: true, force: true });
    }
  }, 30_000);

  test("a lane process that escaped the tree kill and holds the output pipe does not keep the run from exiting", async () => {
    // The escaped task has its own session and was reparented before the
    // signal (out of /proc reach), and still holds the lane's stdout.
    const lane = await fakeLane(
      `(setsid sh -c 'echo $$ > "$DIR/escaped.pid"; exec sleep 30' &)\n` +
        `echo $$ > "$DIR/fledge.pid"\nexec sleep 30`,
    );
    const pidFile = join(lane.dir, "fledge.pid");
    const escapedFile = join(lane.dir, "escaped.pid");
    const proc = spawnTaskRun(lane);
    let fledgePid = 0;
    let escapedPid = 0;
    try {
      const out = new Response(proc.stdout).text();
      expect(
        await waitFor(() => pidIn(pidFile) > 0 && pidIn(escapedFile) > 0, 10_000),
      ).toBe(true);
      fledgePid = pidIn(pidFile);
      escapedPid = pidIn(escapedFile);

      const t0 = Date.now();
      proc.kill("SIGTERM");
      const code = await Promise.race([
        proc.exited,
        Bun.sleep(10_000).then(() => "still running" as const),
      ]);
      expect(code).toBe(130);
      expect(Date.now() - t0).toBeLessThan(8_000);
      expect(lastResult(await out)).toMatchObject({ cancelled: true, state: "failed" });
      expect(await waitFor(() => !pidAlive(fledgePid), 2_000)).toBe(true);
    } finally {
      if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
      for (const pid of [fledgePid, escapedPid]) {
        if (pid > 0 && pidAlive(pid)) process.kill(pid, "SIGKILL");
      }
      rmSync(lane.dir, { recursive: true, force: true });
    }
  }, 30_000);
});
