import { describe, expect, test } from "bun:test";
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

describe("corvidinho task run CLI", () => {
  test("help mentions task run and --no-verify", async () => {
    const proc = Bun.spawn(["bun", "src/cli.ts", "--help"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    expect(code).toBe(0);
    expect(out).toContain("task run");
    expect(out).toContain("--no-verify");
  });

  test("task run --no-verify --json skips gate", async () => {
    const proc = Bun.spawn(
      ["bun", "src/cli.ts", "task", "run", "--no-verify", "--json"],
      {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as {
      result: {
        verifySkipped: boolean;
        verified: boolean;
        state: string;
        cancelled: boolean;
      };
    };
    expect(parsed.result.verifySkipped).toBe(true);
    expect(parsed.result.verified).toBe(false);
    expect(parsed.result.state).toBe("done");
    expect(parsed.result.cancelled).toBe(false);
  });

  test("--json stays one pretty { result, events } document (not ndjson, #73)", async () => {
    const proc = Bun.spawn(
      ["bun", "src/cli.ts", "task", "run", "--no-verify", "--json"],
      {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, CORVIDINHO_LLM_API_KEY: "", OPENAI_API_KEY: "" },
      },
    );
    const [code, out] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
    ]);
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
  });
});

describe("task run interrupted by a signal (AGENT-3, REQ-cli-244)", () => {
  // A fake `fledge` on PATH stands in for the verify lane: like the real one
  // it runs the lane's task as a child, records both pids, then blocks, so the
  // signal always lands while verify is running.
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    test(`${sig} during verify: cancelled result frame, exit 130, verify lane stopped`, async () => {
      const dir = mkdtempSync(join(tmpdir(), "corvidinho-task-signal-"));
      const bin = join(dir, "bin");
      const work = join(dir, "work");
      mkdirSync(bin);
      mkdirSync(work);
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
});
