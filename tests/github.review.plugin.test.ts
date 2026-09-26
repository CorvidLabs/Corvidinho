import { describe, expect, test } from "bun:test";
import { Octokit } from "@octokit/rest";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { list } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import type { PluginCommand, PluginHandlerResult } from "../src/plugins/types.ts";
import {
  PR_DIFF_MAX_BYTES,
  PR_DIFF_SCRUB_MAX_BYTES,
  PR_FILES_MAX_LIMIT,
  UNTRUSTED_NOTE,
  boundForScrub,
  capUtf8,
  fileDiffSection,
  makeGithubReviewCommands,
  normalizeFileFilter,
} from "../plugins/github/review.ts";

const REPO = "CorvidLabs/Corvidinho";
const API = "https://api.github.com";

/** Fake token shape built at runtime so no secret-looking literal is committed. */
const FAKE_TOKEN = "ghp_" + "Ab3".repeat(12);

type Call = { url: URL; accept: string };
type Route = (url: URL, accept: string) => Response | undefined;

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers ?? {}) },
  });
}

/** Real Octokit with a mocked fetch: no network, no token. */
function mockOctokit(route: Route) {
  const calls: Call[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(init?.headers);
    const accept = headers.get("accept") ?? "";
    calls.push({ url, accept });
    return route(url, accept) ?? json({ message: "Not Found" }, { status: 404 });
  };
  const quiet = { debug() {}, info() {}, warn() {}, error() {} };
  const factory = () => new Octokit({ request: { fetch }, log: quiet });
  return { calls, factory };
}

function commands(route: Route) {
  const m = mockOctokit(route);
  const [diff, files] = makeGithubReviewCommands({ octokit: m.factory }) as [PluginCommand, PluginCommand];
  return { diff, files, calls: m.calls };
}

async function run(cmd: PluginCommand, args: string[], json = true): Promise<PluginHandlerResult> {
  return withEnv({ CORVIDINHO_GITHUB_ALLOW_REPOS: REPO }, () =>
    cmd.handler({ args, cwd: process.cwd(), json, nonInteractive: true, allowlist: new Set() }),
  );
}

async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const keys = [
    "CORVIDINHO_GITHUB_ALLOW_REPOS",
    "CORVIDINHO_GITHUB_ALLOW_ORGS",
    "CORVIDINHO_GITHUB_DENY_REPOS",
    "CORVIDINHO_GITHUB_DENY_ORGS",
    "GITHUB_TOKEN",
    "GH_TOKEN",
    ...Object.keys(vars),
  ];
  const prev: Record<string, string | undefined> = {};
  for (const k of keys) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
  for (const [k, v] of Object.entries(vars)) {
    if (v !== undefined) process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const SAMPLE_DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 111..222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,2 +1,2 @@",
  "-const a = 1;",
  "+const a = 2;",
  "",
].join("\n");

function diffRoute(body: string): Route {
  return (url, accept) =>
    url.pathname === "/repos/CorvidLabs/Corvidinho/pulls/7" && accept.includes("diff")
      ? new Response(body, { status: 200, headers: { "content-type": "application/vnd.github.v3.diff; charset=utf-8" } })
      : undefined;
}

function file(name: string, extra: Record<string, unknown> = {}) {
  return {
    sha: "abc",
    filename: name,
    status: "modified",
    additions: 2,
    deletions: 1,
    changes: 3,
    patch: `@@ -1 +1 @@\n-old ${name}\n+new ${name}`,
    ...extra,
  };
}

/** Two pages of pulls.listFiles linked by a rel="next" header. */
function filesRoute(page1: unknown[], page2: unknown[]): Route {
  return (url) => {
    if (url.pathname !== "/repos/CorvidLabs/Corvidinho/pulls/7/files") return undefined;
    if (url.searchParams.get("page") === "2") return json(page2);
    const next = new URL(url);
    next.searchParams.set("page", "2");
    return json(page1, { headers: { link: `<${next.toString()}>; rel="next"` } });
  };
}

describe("github review reads (GITHUB-3 / issue #93)", () => {
  test("listed read-only: dangerous false, minTier 0", () => {
    loadBuiltins();
    for (const name of ["github-pr-diff", "github-pr-files"]) {
      const entry = list().find((e) => e.name === name);
      expect(entry).toBeDefined();
      expect(entry!.dangerous).toBe(false);
      expect(entry!.minTier).toBe(0);
    }
  });

  test("GITHUB-6: empty repo allowlist refuses before any API call (exit 3)", async () => {
    loadBuiltins();
    await withEnv({}, async () => {
      for (const name of ["github-pr-diff", "github-pr-files"]) {
        const r = await runPlugin({ name, args: ["7", "--repo", REPO], nonInteractive: true, allowlist: [] });
        expect(r.ok).toBe(false);
        expect(r.exitCode).toBe(3);
      }
    });
  });

  test("GITHUB-6: deny list wins over allow list (exit 3)", async () => {
    const { diff, files, calls } = commands(diffRoute(SAMPLE_DIFF));
    await withEnv(
      { CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/*", CORVIDINHO_GITHUB_DENY_REPOS: REPO },
      async () => {
        for (const cmd of [diff, files]) {
          const r = await cmd.handler({
            args: ["7", "--repo", REPO],
            cwd: process.cwd(),
            json: true,
            nonInteractive: true,
            allowlist: new Set(),
          });
          expect(r.ok).toBe(false);
          expect(r.exitCode).toBe(3);
        }
      },
    );
    expect(calls).toHaveLength(0);
  });

  test("not dangerous: non-interactive run is not SAFE-1 denied; missing token is a clear error", async () => {
    loadBuiltins();
    await withEnv({ CORVIDINHO_GITHUB_ALLOW_REPOS: REPO }, async () => {
      const r = await runPlugin({
        name: "github-pr-diff",
        args: ["7", "--repo", REPO],
        nonInteractive: true,
        allowlist: [],
      });
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(1);
      expect(r.error).toContain("GITHUB_TOKEN");
    });
  });

  test("usage errors: missing/invalid number, unknown args, bad --limit", async () => {
    const { diff, files, calls } = commands(() => undefined);
    for (const [cmd, args] of [
      [diff, ["--repo", REPO]],
      [diff, ["abc", "--repo", REPO]],
      [diff, ["7", "extra", "--repo", REPO]],
      [diff, ["7", "--repo", REPO, "--file"]],
      [files, ["--repo", REPO]],
      [files, ["7", "--repo", REPO, "--limit", "0"]],
      [files, ["7", "--repo", REPO, "--limit", String(PR_FILES_MAX_LIMIT + 1)]],
      [files, ["7", "--repo", REPO, "--file", "x"]],
    ] as Array<[PluginCommand, string[]]>) {
      const r = await run(cmd, args);
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(1);
    }
    expect(calls).toHaveLength(0);
  });

  test("github-pr-diff returns the unified diff as labelled untrusted data", async () => {
    const { diff, calls } = commands(diffRoute(SAMPLE_DIFF));
    const r = await run(diff, ["#7", "--repo", REPO]);
    expect(r.ok).toBe(true);
    const d = r.data as Record<string, unknown>;
    expect(d.diff).toBe(SAMPLE_DIFF);
    expect(d.truncated).toBe(false);
    expect(d.untrusted).toBe(true);
    expect(d.note).toBe(UNTRUSTED_NOTE);
    expect(d.pull_number).toBe(7);
    expect(d.repo).toBe(REPO);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.accept).toContain("diff");

    const human = await run(diff, ["7", "--repo", REPO], false);
    expect(human.message).toBe(SAMPLE_DIFF);
  });

  test("github-pr-diff caps at 200 KiB on a line boundary with a truncation marker", async () => {
    const line = "+" + "x".repeat(99) + "\n";
    const big = SAMPLE_DIFF + line.repeat(Math.ceil((PR_DIFF_MAX_BYTES * 1.5) / line.length));
    const { diff } = commands(diffRoute(big));
    const r = await run(diff, ["7", "--repo", REPO]);
    expect(r.ok).toBe(true);
    const d = r.data as { diff: string; truncated: boolean; bytes: number; totalBytes: number };
    expect(d.truncated).toBe(true);
    expect(d.bytes).toBeLessThanOrEqual(PR_DIFF_MAX_BYTES);
    expect(d.totalBytes).toBe(Buffer.byteLength(big));
    const [body, marker] = d.diff.split("[corvidinho: diff truncated");
    expect(marker).toBeDefined();
    expect(marker).toContain("--file PATH");
    expect(body!.endsWith("\n")).toBe(true);
    expect(big.startsWith(body!)).toBe(true);
  });

  test("SAFE-6: secrets in diff text are scrubbed", async () => {
    const body = `${SAMPLE_DIFF}+token = "${FAKE_TOKEN}"\n`;
    const { diff } = commands(diffRoute(body));
    const r = await run(diff, ["7", "--repo", REPO]);
    const d = r.data as { diff: string };
    expect(d.diff).toContain('+token = "[redacted:github-token]"');
    expect(d.diff).not.toContain(FAKE_TOKEN);
  });

  test("SAFE-6: a secret straddling the cap leaks no prefix (scrub before cap)", async () => {
    // One long line (no newline to cut back to) with the token starting 9 bytes before the cap.
    const body = "+" + "y".repeat(PR_DIFF_MAX_BYTES - 11) + " " + FAKE_TOKEN;
    const { diff } = commands(diffRoute(body));
    const r = await run(diff, ["7", "--repo", REPO]);
    const d = r.data as { diff: string; truncated: boolean };
    expect(d.truncated).toBe(true);
    expect(d.diff).not.toContain("ghp_");
  });

  test("a hostile diff far over the cap is cut before the scrub and returns quickly", async () => {
    // ~1.2 MiB of private-key openers with no closer: every opener used to
    // rescan to the end of the text, stalling the task process.
    const body = SAMPLE_DIFF + "+-----BEGIN A PRIVATE KEY-----\n".repeat(40_000);
    expect(Buffer.byteLength(body)).toBeGreaterThan(PR_DIFF_SCRUB_MAX_BYTES);
    const { diff } = commands(diffRoute(body));
    const started = performance.now();
    const r = await run(diff, ["7", "--repo", REPO]);
    expect(performance.now() - started).toBeLessThan(2_000);
    const d = r.data as { diff: string; truncated: boolean; bytes: number; totalBytes: number };
    expect(d.truncated).toBe(true);
    expect(d.bytes).toBeLessThanOrEqual(PR_DIFF_MAX_BYTES);
    expect(d.totalBytes).toBe(Buffer.byteLength(body));
    expect(d.diff).toContain(`of ${Buffer.byteLength(body)} bytes (cap ${PR_DIFF_MAX_BYTES})`);
  });

  test("SAFE-6: a private key split by the hard cut is dropped, not returned half-scrubbed", async () => {
    // Enough whole keys to shrink by far more than the cap once redacted, then
    // one key whose END line lands past the hard cut.
    const key = (fill: string, lines: number) =>
      "+-----BEGIN RSA PRIVATE KEY-----\n" +
      `+${fill.repeat(64)}\n`.repeat(lines) +
      "+-----END RSA PRIVATE KEY-----\n";
    const whole = key("A", 50);
    let body = SAMPLE_DIFF;
    while (Buffer.byteLength(body) < PR_DIFF_SCRUB_MAX_BYTES - 2_000) body += whole;
    body += key("Q", 100);
    expect(Buffer.byteLength(body)).toBeGreaterThan(PR_DIFF_SCRUB_MAX_BYTES);
    const { diff } = commands(diffRoute(body));
    const r = await run(diff, ["7", "--repo", REPO]);
    const d = r.data as { diff: string; truncated: boolean; totalBytes: number };
    expect(d.truncated).toBe(true);
    expect(d.totalBytes).toBe(Buffer.byteLength(body));
    expect(d.diff).toContain("[redacted:private-key]");
    expect(d.diff).not.toContain("A".repeat(64));
    expect(d.diff).not.toContain("Q".repeat(64));
    expect(d.diff).not.toContain("-----BEGIN");
  });

  test("boundForScrub cuts on a line boundary and drops an open private-key block", () => {
    expect(boundForScrub("small\n", 100)).toEqual({ text: "small\n", truncated: false, totalBytes: 6 });

    const lines = "a".repeat(9) + "\n";
    const cut = boundForScrub(lines.repeat(10), 35);
    expect(cut).toEqual({ text: lines.repeat(3), truncated: true, totalBytes: 100 });

    // No newline before the limit: nothing is kept rather than half a line.
    expect(boundForScrub("x".repeat(50), 20).text).toBe("");

    const open = "keep\n-----BEGIN EC PRIVATE KEY-----\nAAAA\nBBBB\n-----END EC PRIVATE KEY-----\n";
    expect(boundForScrub(open, 40).text).toBe("keep\n");
    const closed = "-----BEGIN EC PRIVATE KEY-----\nAAAA\n-----END EC PRIVATE KEY-----\nmore\ntail\n";
    expect(boundForScrub(closed, closed.length - 2).text).toBe(closed.slice(0, closed.length - 5));
  });

  test("github-pr-diff --file returns one file section across pages", async () => {
    const page1 = Array.from({ length: 3 }, (_, i) => file(`src/f${i}.ts`));
    const page2 = [
      file("src/b.ts", { status: "renamed", previous_filename: "src/old-b.ts" }),
      file("assets/logo.png", { patch: undefined, status: "added" }),
    ];
    const { diff } = commands(filesRoute(page1, page2));

    const r = await run(diff, ["7", "--repo", REPO, "--file", "src/b.ts"]);
    expect(r.ok).toBe(true);
    const d = r.data as { diff: string; file: string };
    expect(d.file).toBe("src/b.ts");
    expect(d.diff).toContain("diff --git a/src/old-b.ts b/src/b.ts");
    expect(d.diff).toContain("rename from src/old-b.ts");
    expect(d.diff).toContain("+new src/b.ts");
    expect(d.diff).not.toContain("src/f0.ts");

    const byOld = await run(diff, ["7", "--repo", REPO, "--file=./src/old-b.ts"]);
    expect((byOld.data as { diff: string }).diff).toContain("rename to src/b.ts");

    const bin = await run(diff, ["7", "--repo", REPO, "--file", "assets/logo.png"]);
    expect((bin.data as { diff: string }).diff).toContain("no textual patch");

    const missing = await run(diff, ["7", "--repo", REPO, "--file", "nope.ts"]);
    expect(missing.ok).toBe(false);
    expect(missing.error).toContain("nope.ts");
  });

  test("github-pr-diff: GitHub 406 (diff too large) points at --file / github-pr-files", async () => {
    const { diff } = commands((url) =>
      url.pathname.endsWith("/pulls/7") ? json({ message: "Sorry, the diff exceeded the maximum" }, { status: 406 }) : undefined,
    );
    const r = await run(diff, ["7", "--repo", REPO]);
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.error).toContain("--file PATH");
    expect(r.error).toContain("github-pr-files");
  });

  test("github-pr-files lists status/additions/deletions across pages", async () => {
    const page1 = [file("src/a.ts"), file("src/new.ts", { status: "added", additions: 10, deletions: 0, changes: 10 })];
    const page2 = [file("src/b.ts", { status: "renamed", previous_filename: "src/old-b.ts" })];
    const { files } = commands(filesRoute(page1, page2));
    const r = await run(files, ["7", "--repo", REPO]);
    expect(r.ok).toBe(true);
    const d = r.data as {
      count: number;
      truncated: boolean;
      untrusted: boolean;
      totals: { additions: number; deletions: number };
      files: Array<Record<string, unknown>>;
    };
    expect(d.count).toBe(3);
    expect(d.truncated).toBe(false);
    expect(d.untrusted).toBe(true);
    expect(d.totals).toEqual({ additions: 14, deletions: 2 });
    expect(d.files[1]).toEqual({ filename: "src/new.ts", status: "added", additions: 10, deletions: 0, changes: 10 });
    expect(d.files[2]!.previousFilename).toBe("src/old-b.ts");
    expect(d.files[0]).not.toHaveProperty("patch");

    const human = await run(files, ["7", "--repo", REPO], false);
    expect(human.message).toContain("added\t+10\t-0\tsrc/new.ts");
    expect(human.message).toContain("src/old-b.ts -> src/b.ts");
    expect(human.message).toContain("3 files (+14 -2)");
  });

  test("github-pr-files --limit caps the list and flags truncation", async () => {
    const page1 = [file("a"), file("b")];
    const page2 = [file("c"), file("d")];
    const { files } = commands(filesRoute(page1, page2));
    const r = await run(files, ["7", "--repo", REPO, "--limit", "2"]);
    const d = r.data as { count: number; truncated: boolean; limit: number };
    expect(d.count).toBe(2);
    expect(d.limit).toBe(2);
    expect(d.truncated).toBe(true);

    const all = await run(files, ["7", "--repo", REPO, "--limit=4"]);
    expect((all.data as { truncated: boolean }).truncated).toBe(false);
  });

  test("capUtf8 never splits a multi-byte character", () => {
    const text = "ab\n" + "é".repeat(10);
    const r = capUtf8(text, 8);
    expect(r.truncated).toBe(true);
    expect(r.text).toBe("ab\n");
    const noNl = capUtf8("é".repeat(10), 5);
    expect(noNl.text).toBe("éé");
    expect(noNl.bytes).toBe(4);
    expect(capUtf8("short", 100)).toEqual({ text: "short", truncated: false, bytes: 5, totalBytes: 5 });
  });

  test("fileDiffSection marks added and removed files against /dev/null", () => {
    const added = fileDiffSection({ filename: "n.ts", status: "added", additions: 1, deletions: 0, changes: 1, patch: "@@ -0,0 +1 @@\n+x" });
    expect(added).toContain("--- /dev/null\n+++ b/n.ts");
    const removed = fileDiffSection({ filename: "r.ts", status: "removed", additions: 0, deletions: 1, changes: 1, patch: "@@ -1 +0,0 @@\n-x" });
    expect(removed).toContain("--- a/r.ts\n+++ /dev/null");
  });

  test("fileDiffSection: pure rename / copy / mode change say content unchanged, not binary or too large", () => {
    const zero = { additions: 0, deletions: 0, changes: 0 };
    const renamed = fileDiffSection({ filename: "src/new.ts", previous_filename: "src/old.ts", status: "renamed", ...zero });
    expect(renamed).toBe(
      "diff --git a/src/old.ts b/src/new.ts\nrename from src/old.ts\nrename to src/new.ts\n" +
        "(no line changes: pure rename, content unchanged unless the file is binary)\n",
    );
    expect(renamed).not.toContain("too large");

    const copied = fileDiffSection({ filename: "src/copy.ts", previous_filename: "src/orig.ts", status: "copied", ...zero });
    expect(copied).toContain("diff --git a/src/orig.ts b/src/copy.ts\ncopy from src/orig.ts\ncopy to src/copy.ts\n");
    expect(copied).toContain("pure copy, content unchanged");
    expect(copied).not.toContain("too large");

    const mode = fileDiffSection({ filename: "bin/run.sh", status: "changed", ...zero });
    expect(mode).toContain("mode or type change only, content unchanged");
    expect(mode).not.toContain("too large");

    // A copy with edits keeps copy lines and the patch.
    const copiedEdited = fileDiffSection({
      filename: "b.ts",
      previous_filename: "a.ts",
      status: "copied",
      additions: 1,
      deletions: 1,
      changes: 2,
      patch: "@@ -1 +1 @@\n-x\n+y",
    });
    expect(copiedEdited).toContain("copy from a.ts\ncopy to b.ts\n--- a/a.ts\n+++ b/b.ts\n@@ -1 +1 @@");

    // Line changes but no patch (too large), or an edited binary: unchanged wording.
    const big = fileDiffSection({ filename: "gen.ts", status: "renamed", previous_filename: "g.ts", additions: 9000, deletions: 0, changes: 9000 });
    expect(big).toContain("binary file, or the file diff is too large");
    const bin = fileDiffSection({ filename: "logo.png", status: "modified", ...zero });
    expect(bin).toContain("binary file, or the file diff is too large");
  });

  test("github-pr-diff --file that is empty after normalization is a usage error, not the full diff", async () => {
    const { diff, calls } = commands(diffRoute(SAMPLE_DIFF));
    for (const args of [
      ["7", "--repo", REPO, "--file", "./"],
      ["7", "--repo", REPO, "--file", "   "],
      ["7", "--repo", REPO, "--file=./"],
      ["7", "--repo", REPO, "--file", " ././ "],
    ]) {
      const r = await run(diff, args);
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(1);
      expect(r.error).toContain("--file needs a file path");
      expect(r.error).toContain("usage: github-pr-diff");
    }
    expect(calls).toHaveLength(0);
    expect(normalizeFileFilter(undefined)).toBeUndefined();
    expect(normalizeFileFilter(" ./src/a.ts ")).toBe("src/a.ts");
    expect(normalizeFileFilter("././src/a.ts")).toBe("src/a.ts");
    expect(normalizeFileFilter("./")).toBe("");
  });
});
