/**
 * Follow-up to #375 (AUTONOMY-10.b): the archived SpecSync review for that
 * change said a review passed in a `SpecSync scoped review` GitHub Actions
 * check. No workflow here defines that check, the PR had no review, and the
 * record was written by the tip-orphan script at the finalization timestamp.
 * The archive now holds the post-merge review that actually ran.
 *
 * Reads the repository's own `.specsync/archive` and `.github/workflows`; no
 * fixtures, no network.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const ARCHIVE = join(ROOT, ".specsync", "archive", "changes");
const WORKFLOWS = join(ROOT, ".github", "workflows");

const BRIDGE_LIVE_NOTE =
  "2026-10-06-the-fixed-bridge-live-note-it-posts-after-a-restart-is-system-text-not-an-announcement-so-it-posts-without-waiting-for";
/** The #375 squash on main. */
const MERGED_375 = "f0c125383ff7ae21f35acf9cb57f1d0f758ddaae";

/**
 * Archives a tip-orphan script wrote before this fix, each with a review
 * stamped in the same second as its finalization. Each keeps its record until
 * its own review runs; an archive written after this fix is not on this list.
 */
const SCRIPTED_BEFORE_FIX = new Set([
  "2026-10-06-after-the-one-nudge-a-stalled-run-moves-to-the-next-stronger-model-in-the-order-i-set-and-says-so-agent-17-agent-17-a",
  "2026-10-06-before-each-call-the-spend-guard-counts-a-worst-case-reply-toward-the-cap-the-model-s-listed-maximum-output-or-128k",
  "2026-10-06-doctor-and-init-say-when-the-verify-lane-runs-no-test-step-corvidinho-can-read-cli-4-one-warn-test-step-line-when-no",
  "2026-10-06-i-or-the-schedule-s-creator-can-stop-a-scheduled-run-in-progress-from-discord-the-same-way-as-a-chat-run-agent-3-c",
  "2026-10-06-in-a-non-git-project-my-runs-work-in-the-folder-itself-its-file-tools-leave-the-root-agents-md-and-claude-md-alone",
  "2026-10-06-in-a-trust-repo-the-verify-gate-also-runs-fledge-trust-verify-after-the-lane-both-must-pass-and-trust-toml-is-safe-2",
  "2026-10-06-on-github-the-owner-and-team-i-ve-declared-get-their-role-s-tools-behind-the-must-ask-gate-strangers-stay-community",
  "2026-10-06-shell-exec-refuses-specsync-change-approve-review-finalize-and-ship-in-every-repo-only-a-human-or-corvidinho-s-own",
  "2026-10-06-the-verify-lane-the-shell-and-the-runners-start-without-my-cloud-credentials-kubeconfig-aws-google-cloud-azure-and",
  "2026-10-06-where-a-repo-uses-hi-it-drafts-criteria-and-asks-the-owner-on-a-card-before-capturing-them-agent-18-hi-drafts",
  "2026-10-06-work-runs-its-second-model-review-rounds-before-the-pr-and-skips-with-not-reviewed-otherwise-github-9",
  "2026-10-06-work-schedule-and-the-scheduler-can-be-turned-off-in-corvidinho-plugins-and-existing-installs-stay-on-plugin-5-5-a",
  "2026-10-06-workreviewapplies-passes-cwd-into-actingworktask-after-agent-1-nongit",
]);

type Review = {
  reviewer?: string;
  verdict?: string;
  implementation_commit?: string;
  timestamp?: number;
  provenance?: { provider?: string; required_check?: string };
};

function readJson<T>(dir: string, file: string): T {
  return JSON.parse(readFileSync(join(ARCHIVE, dir, file), "utf8")) as T;
}

/** Job ids and every `name:` value across the repo's workflows: the check names CI can report. */
function workflowCheckNames(): Set<string> {
  const names = new Set<string>();
  for (const file of readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))) {
    let inJobs = false;
    for (const line of readFileSync(join(WORKFLOWS, file), "utf8").split("\n")) {
      if (/^jobs:\s*$/.test(line)) inJobs = true;
      else if (/^\S/.test(line)) inJobs = false;
      const job = inJobs ? /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line) : null;
      if (job?.[1]) names.add(job[1]);
      const name = /^\s*(?:-\s+)?name:\s*["']?(.*?)["']?\s*$/.exec(line);
      if (name?.[1]) names.add(name[1]);
    }
  }
  return names;
}

describe("archived SpecSync review for #375 (AUTONOMY-10.b bridge-live note)", () => {
  test("is the post-merge review of the merged commit, not the tip-orphan script's record", () => {
    const review = readJson<Review>(BRIDGE_LIVE_NOTE, "review.json");
    const finalization = readJson<{ timestamp: number }>(BRIDGE_LIVE_NOTE, "finalization.json");
    expect(review.timestamp).not.toBe(finalization.timestamp);
    expect(review.reviewer?.trim()).toBeTruthy();
    expect(review.verdict).toBe("pass");
    expect(review.implementation_commit).toBe(MERGED_375);

    const attempts = readJson<unknown>(BRIDGE_LIVE_NOTE, "review-attempts.json");
    expect(Array.isArray(attempts)).toBe(false);
    const ledger = attempts as { schema_version?: number; reviews?: Review[] };
    expect(ledger.schema_version).toBe(1);
    expect(ledger.reviews?.at(-1)).toEqual(review);
  });

  test("claims no GitHub Actions check that no workflow in this repo defines", () => {
    const checks = workflowCheckNames();
    expect(checks.has("spec-sync")).toBe(true);
    expect(checks.has("smoke")).toBe(true);
    for (const file of ["review.json", "review-attempts.json"]) {
      const text = readFileSync(join(ARCHIVE, BRIDGE_LIVE_NOTE, file), "utf8");
      const claimed = [...text.matchAll(/"required_check":\s*"([^"]*)"/g)].map((m) => m[1] ?? "");
      for (const check of claimed) expect(checks.has(check)).toBe(true);
    }
  });
});

describe("archived SpecSync reviews", () => {
  test("no archive written after this fix has a review stamped in its finalization's second", () => {
    const scripted: string[] = [];
    for (const dir of readdirSync(ARCHIVE).sort()) {
      if (SCRIPTED_BEFORE_FIX.has(dir)) continue;
      let review: Review;
      let finalization: { timestamp?: number };
      try {
        review = readJson<Review>(dir, "review.json");
        finalization = readJson<{ timestamp?: number }>(dir, "finalization.json");
      } catch {
        continue;
      }
      if (review.timestamp !== undefined && review.timestamp === finalization.timestamp) scripted.push(dir);
    }
    expect(scripted).toEqual([]);
  });
});
