/**
 * DISCORD-10 light — wire protocol handshake with corvidinho binary.
 * Soft-continue if unverifiable; hard-fail on verifiable mismatch.
 */

export const CORVIDINHO_PROTOCOL_VERSION = 1;

export type HandshakeResult =
  | { kind: "match"; version: number }
  | { kind: "mismatch"; version: number }
  | { kind: "unverifiable"; reason: string };

export async function checkProtocolVersion(
  bin: string,
  expected: number = CORVIDINHO_PROTOCOL_VERSION,
  timeoutMs: number = 10_000,
): Promise<HandshakeResult> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn([bin, "--protocol-version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: "unverifiable", reason: `spawn failed: ${msg}` };
  }

  const TIMED_OUT = Symbol("timed-out");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const collected = (async () => {
    const stdout = proc.stdout;
    const stderr = proc.stderr;
    const [exitCode, stdoutTextRaw, stderrTextRaw] = await Promise.all([
      proc.exited,
      stdout && typeof stdout !== "number"
        ? new Response(stdout).text()
        : Promise.resolve(""),
      stderr && typeof stderr !== "number"
        ? new Response(stderr).text()
        : Promise.resolve(""),
    ]);
    return { exitCode, stdoutTextRaw, stderrTextRaw };
  })();
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });

  let raced:
    | { exitCode: number; stdoutTextRaw: string; stderrTextRaw: string }
    | typeof TIMED_OUT;
  try {
    raced = await Promise.race([collected, timeout]);
  } catch (err) {
    if (timer) clearTimeout(timer);
    try {
      proc.kill();
    } catch {
      /* best-effort */
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: "unverifiable", reason: `probe failed: ${msg}` };
  }
  if (timer) clearTimeout(timer);
  if (raced === TIMED_OUT) {
    try {
      proc.kill();
    } catch {
      /* best-effort */
    }
    return { kind: "unverifiable", reason: `timed out after ${timeoutMs}ms` };
  }

  const { exitCode, stdoutTextRaw, stderrTextRaw } = raced;
  const stdoutText = stdoutTextRaw.trim();
  const stderrText = stderrTextRaw.trim();

  if (exitCode !== 0) {
    const tail = stderrText || stdoutText || "(no output)";
    return {
      kind: "unverifiable",
      reason: `exit ${exitCode}: ${tail.slice(0, 200)}`,
    };
  }

  if (!/^\d+$/.test(stdoutText)) {
    return {
      kind: "unverifiable",
      reason: `unrecognized output: ${stdoutText.slice(0, 100) || "(empty)"}`,
    };
  }

  const version = Number.parseInt(stdoutText, 10);
  if (!Number.isFinite(version)) {
    return {
      kind: "unverifiable",
      reason: `parse failed: ${stdoutText.slice(0, 100)}`,
    };
  }

  return version === expected
    ? { kind: "match", version }
    : { kind: "mismatch", version };
}

export async function enforceProtocolVersionOrExit(
  bin: string,
  expected: number = CORVIDINHO_PROTOCOL_VERSION,
): Promise<void> {
  const result = await checkProtocolVersion(bin, expected);
  switch (result.kind) {
    case "match":
      console.log(`[discord] protocol version ${result.version} OK`);
      return;
    case "mismatch":
      console.error(
        `[discord] protocol version mismatch: bridge expects ${expected}, corvidinho reports ${result.version}. Upgrade either binary or the bridge.`,
      );
      process.exit(1);
    case "unverifiable":
      console.warn(
        `[discord] couldn't verify protocol version (${result.reason}). Proceeding — if handling misbehaves, check corvidinho --protocol-version.`,
      );
      return;
  }
}
