/**
 * Thin reviewed wrapper around `gh` CLI JSON output.
 * Callers must go through typed plugin commands — do not improvise raw gh elsewhere.
 */

export type GhResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
};

export async function ghJson(
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string> },
): Promise<GhResult> {
  const ghPath = Bun.which("gh");
  if (!ghPath) {
    return {
      ok: false,
      stdout: "",
      stderr: "gh not on PATH",
      exitCode: 127,
    };
  }

  const proc = Bun.spawn(["gh", ...args], {
    cwd: opts?.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...opts?.env },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return {
    ok: exitCode === 0,
    stdout,
    stderr: stderr.trim(),
    exitCode,
  };
}

export function parseJsonStdout(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}
