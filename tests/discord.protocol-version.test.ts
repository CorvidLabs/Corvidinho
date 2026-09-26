/**
 * DISCORD-10 — Merlin-shaped protocol-version handshake fixtures.
 * Steal coverage from Merlin bridges/discord/tests/protocol-version.test.ts.
 */
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CORVIDINHO_PROTOCOL_VERSION,
  checkProtocolVersion,
} from "../src/discord/protocol-version.ts";

function writeStub(script: string): string {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-proto-"));
  const path = join(dir, "corvidinho");
  writeFileSync(path, script, { mode: 0o755 });
  chmodSync(path, 0o755);
  return path;
}

const PROBE_TIMEOUT_MS = 25_000;
const SPAWN_TIMEOUT_MS = 30_000;

describe("checkProtocolVersion (DISCORD-10)", () => {
  test("returns match when binary prints expected integer", async () => {
    const bin = writeStub(`#!/bin/sh\necho ${CORVIDINHO_PROTOCOL_VERSION}\n`);
    const result = await checkProtocolVersion(bin, undefined, PROBE_TIMEOUT_MS);
    expect(result.kind).toBe("match");
    if (result.kind === "match") {
      expect(result.version).toBe(CORVIDINHO_PROTOCOL_VERSION);
    }
  }, SPAWN_TIMEOUT_MS);

  test("returns mismatch on divergent version (startup refuse path)", async () => {
    const bin = writeStub("#!/bin/sh\necho 99\n");
    const result = await checkProtocolVersion(bin, undefined, PROBE_TIMEOUT_MS);
    expect(result.kind).toBe("mismatch");
    if (result.kind === "mismatch") {
      expect(result.version).toBe(99);
    }
  }, SPAWN_TIMEOUT_MS);

  test("returns unverifiable when binary does not exist", async () => {
    const result = await checkProtocolVersion(
      "/nonexistent/path/to/corvidinho-binary-xyz",
      undefined,
      PROBE_TIMEOUT_MS,
    );
    expect(result.kind).toBe("unverifiable");
  }, SPAWN_TIMEOUT_MS);

  test("returns unverifiable when stdout is not a bare integer", async () => {
    const bin = writeStub("#!/bin/sh\necho 'v1.0'\n");
    const result = await checkProtocolVersion(bin, undefined, PROBE_TIMEOUT_MS);
    expect(result.kind).toBe("unverifiable");
  }, SPAWN_TIMEOUT_MS);

  test("returns unverifiable (not hang) on timeout", async () => {
    const bin = writeStub("#!/bin/sh\nsleep 30\necho 1\n");
    const result = await checkProtocolVersion(bin, undefined, 250);
    expect(result.kind).toBe("unverifiable");
    if (result.kind === "unverifiable") {
      expect(result.reason).toMatch(/timed out/);
    }
  }, SPAWN_TIMEOUT_MS);
});

describe("checkProtocolVersion bun-invokes .ts", () => {
  test("live src/cli.ts probe returns match (no EACCES)", async () => {
    const root = import.meta.dir + "/..";
    const bin = `${root}/src/cli.ts`;
    const result = await checkProtocolVersion(bin, undefined, PROBE_TIMEOUT_MS);
    expect(result.kind).toBe("match");
    if (result.kind === "match") {
      expect(result.version).toBe(CORVIDINHO_PROTOCOL_VERSION);
    }
  }, SPAWN_TIMEOUT_MS);
});
