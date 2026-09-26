/**
 * Spawn client abort after the agent exited (REQ-discord-108 / REQ-cli-108,
 * AGENT-3): a background process the agent left in its group still holds the
 * output pipe, so the run is still in flight; an abort (daemon shutdown after
 * its grace) must kill that process and let runChat return. Fake `sh` agent
 * bin in a temp dir; no network.
 */
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSpawnAgentClient } from "../src/discord/agent-client.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Alive and not a zombie (an unreaped orphan counts as dead). */
function running(pid: number): boolean {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const state = stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
    return state !== "Z" && state !== "X";
  } catch {
    return false;
  }
}

async function until(cond: () => boolean, ms = 3000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await Bun.sleep(20);
  }
  return cond();
}

function pidIn(path: string): number {
  try {
    const n = Number(readFileSync(path, "utf8").trim());
    return Number.isInteger(n) && n > 1 ? n : 0;
  } catch {
    return 0;
  }
}

test("abort after the agent exited kills what it left holding the output pipe", async () => {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-agent-tree-"));
  dirs.push(dir);
  const bin = join(dir, "corvidinho");
  writeFileSync(
    bin,
    ["#!/bin/sh", `echo $$ > "${dir}/run.pid"`, `sleep 30 & echo $! > "${dir}/bg.pid"`, "exit 0", ""].join("\n"),
    { mode: 0o755 },
  );
  const ac = new AbortController();
  const done = createSpawnAgentClient({ bin, cwd: dir }).runChat({
    prompt: "hello",
    sessionId: "s-tree",
    signal: ac.signal,
  });
  let settled = false;
  void done.then(() => {
    settled = true;
  });
  const runPid = join(dir, "run.pid");
  const bgPid = join(dir, "bg.pid");
  expect(await until(() => existsSync(runPid) && pidIn(bgPid) > 0, 10_000)).toBe(true);
  const agent = pidIn(runPid);
  const bg = pidIn(bgPid);
  // The agent is gone; its background child keeps the run in flight.
  expect(await until(() => !running(agent))).toBe(true);
  await Bun.sleep(100);
  expect(running(bg)).toBe(true);
  expect(settled).toBe(false);

  ac.abort();
  expect(await until(() => !running(bg))).toBe(true);
  expect(await until(() => settled)).toBe(true);
  await done;
});
