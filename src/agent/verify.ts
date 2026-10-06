/**
 * Default verify runner: fledge lanes run verify --non-interactive (FLEDGE-2/3),
 * and the excerpt of its output a retry sends the model (AGENT-4.a).
 */

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { isWorkerEnvDropped } from "../autonomous/delegate.ts";
import {
  collectProcessTree,
  killProcessTree,
  trackChildProcess,
  type ProcEntry,
} from "../plugins/proc-group.ts";
import { noteIdleActivity } from "./limits.ts";
import type { VerifyResult, VerifyRunner } from "./types.ts";

export const VERIFY_ARGS = [
  "lanes",
  "run",
  "verify",
  "--non-interactive",
] as const;

/**
 * LLM provider keys: a worker needs them, the verify lane does not. Also the
 * vendor keys the Fledge plugin child env drops (plugins/fledge/spawn.ts).
 */
const VERIFY_ENV_DROP = new Set([
  "CORVIDINHO_LLM_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
]);

/**
 * True when an inherited env key must not reach the verify lane (SAFE-6): the
 * delegate worker drop list (Discord config, GitHub tokens, audit key, acting
 * identity) plus LLM API keys. The lane runs tests the agent wrote.
 */
export function isVerifyEnvDropped(key: string): boolean {
  return isWorkerEnvDropped(key) || VERIFY_ENV_DROP.has(key);
}

/** The verify lane's env: `base` minus {@link isVerifyEnvDropped} keys. */
export function buildVerifyEnv(
  base: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) {
    if (typeof v === "string" && !isVerifyEnvDropped(k)) env[k] = v;
  }
  return env;
}

/**
 * Env keys that carry the owner's cloud credentials, or point a cloud CLI or
 * SDK at them (SAFE-21.b). The verify lane, `shell-exec`, the language
 * runners and the Fledge core runs start without them
 * ({@link withoutCloudCredentials}), so they can't reach prod by accident.
 */
const CLOUD_CREDENTIAL_ENV_KEYS = new Set([
  // Kubernetes: the kubeconfig list, and the in-cluster service account
  // (client-go falls back to it when these two are set).
  "KUBECONFIG",
  "KUBERNETES_SERVICE_HOST",
  "KUBERNETES_SERVICE_PORT",
  // AWS: keys, profiles, the files that hold them, assumed and web-identity roles.
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_SECURITY_TOKEN",
  "AWS_PROFILE",
  "AWS_DEFAULT_PROFILE",
  "AWS_SHARED_CREDENTIALS_FILE",
  "AWS_CONFIG_FILE",
  "AWS_ROLE_ARN",
  "AWS_ROLE_SESSION_NAME",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
  // Google Cloud: Application Default Credentials and the key files and
  // tokens Terraform and CI auth actions read.
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CREDENTIALS",
  "GOOGLE_CLOUD_KEYFILE_JSON",
  "GCLOUD_KEYFILE_JSON",
  "GOOGLE_OAUTH_ACCESS_TOKEN",
  "GOOGLE_IMPERSONATE_SERVICE_ACCOUNT",
  "GOOGLE_GHA_CREDS_PATH",
  // Azure: service principal, user, workload and managed identity, the CLI's
  // config dir, storage keys; ARM_* is the same set for Terraform.
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "AZURE_TENANT_ID",
  "AZURE_SUBSCRIPTION_ID",
  "AZURE_USERNAME",
  "AZURE_PASSWORD",
  "AZURE_CLIENT_CERTIFICATE_PATH",
  "AZURE_CLIENT_CERTIFICATE_PASSWORD",
  "AZURE_FEDERATED_TOKEN_FILE",
  "AZURE_CONFIG_DIR",
  "AZURE_STORAGE_KEY",
  "AZURE_STORAGE_CONNECTION_STRING",
  "AZURE_STORAGE_SAS_TOKEN",
  "AZURE_DEVOPS_EXT_PAT",
  "IDENTITY_ENDPOINT",
  "IDENTITY_HEADER",
  "MSI_ENDPOINT",
  "MSI_SECRET",
  "ARM_CLIENT_ID",
  "ARM_CLIENT_SECRET",
  "ARM_TENANT_ID",
  "ARM_SUBSCRIPTION_ID",
  "ARM_ACCESS_KEY",
  "ARM_SAS_TOKEN",
  "ARM_CLIENT_CERTIFICATE_PATH",
  "ARM_CLIENT_CERTIFICATE_PASSWORD",
  "ARM_OIDC_TOKEN",
  "ARM_OIDC_TOKEN_FILE_PATH",
  "ARM_OIDC_REQUEST_TOKEN",
  "ARM_OIDC_REQUEST_URL",
  "ARM_USE_MSI",
  "ARM_MSI_ENDPOINT",
  // Other clouds and infrastructure APIs that reach prod.
  "DIGITALOCEAN_TOKEN",
  "DIGITALOCEAN_ACCESS_TOKEN",
  "HCLOUD_TOKEN",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_API_KEY",
  "LINODE_TOKEN",
  "LINODE_CLI_TOKEN",
  "VULTR_API_KEY",
  "SCW_ACCESS_KEY",
  "SCW_SECRET_KEY",
  "OCI_CLI_CONFIG_FILE",
  "OCI_CLI_KEY_FILE",
  "OCI_CLI_PROFILE",
  "OCI_CLI_AUTH",
  "IBMCLOUD_API_KEY",
  "IC_API_KEY",
  "ALIBABA_CLOUD_ACCESS_KEY_ID",
  "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
  "ALICLOUD_ACCESS_KEY",
  "ALICLOUD_SECRET_KEY",
  "OS_PASSWORD",
  "OS_TOKEN",
  "OS_APPLICATION_CREDENTIAL_SECRET",
  "HEROKU_API_KEY",
  "FLY_API_TOKEN",
  "FLY_ACCESS_TOKEN",
  "VERCEL_TOKEN",
  "NETLIFY_AUTH_TOKEN",
  "RAILWAY_TOKEN",
  "TFE_TOKEN",
  "PULUMI_ACCESS_TOKEN",
  "VAULT_TOKEN",
  "NOMAD_TOKEN",
  "CONSUL_HTTP_TOKEN",
]);
const CLOUD_CREDENTIAL_ENV_PATTERNS: readonly RegExp[] = [
  // ECS task roles and EKS Pod Identity: the credential endpoint and its token.
  /^AWS_CONTAINER_\w+$/,
  // gcloud: every property override (account, token files, impersonation, config dir).
  /^CLOUDSDK_\w+$/,
  // Any other AWS / Google Cloud / Azure key that names a key, token, secret,
  // password or credential (AWS_BEARER_TOKEN_BEDROCK, GOOGLE_API_KEY, …).
  /^(AWS|GOOGLE|GCLOUD|GCP|AZURE|ARM)_\w*(ACCESS_KEY|API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|KEYFILE|CONNECTION_STRING)\w*$/,
  // Terraform / HCP Terraform per-host tokens.
  /^TF_TOKEN_\w+$/,
];

/** True when env key `key` carries or points at the owner's cloud credentials (SAFE-21.b). */
export function isCloudCredentialEnvKey(key: string): boolean {
  return CLOUD_CREDENTIAL_ENV_KEYS.has(key) || CLOUD_CREDENTIAL_ENV_PATTERNS.some((p) => p.test(key));
}

/**
 * Empty stand-ins for the files each cloud tool reads when its env names
 * none (SAFE-21.b): dropping the env alone would leave `~/.kube/config`,
 * `~/.aws/credentials` / `~/.aws/config` and the ADC well-known file
 * `~/.config/gcloud/application_default_credentials.json` in reach. A tool
 * reads `/dev/null` as an empty file and finds no credentials, and nothing
 * it writes there persists. `AWS_EC2_METADATA_DISABLED` also stops the AWS
 * CLI and SDKs fetching instance-role credentials from EC2's metadata service.
 */
export const CLOUD_CREDENTIAL_STAND_INS: Readonly<Record<string, string>> = Object.freeze({
  KUBECONFIG: "/dev/null",
  AWS_SHARED_CREDENTIALS_FILE: "/dev/null",
  AWS_CONFIG_FILE: "/dev/null",
  AWS_EC2_METADATA_DISABLED: "true",
  GOOGLE_APPLICATION_CREDENTIALS: "/dev/null",
});

/** Stand-in config dirs made by {@link withoutCloudCredentials} and not released yet. */
const liveCloudDirs = new Set<string>();
let cloudDirsExitHook = false;

/**
 * SAFE-21.b: `env` minus the owner's cloud credentials, in place. The keys
 * {@link isCloudCredentialEnvKey} names are dropped; each tool's default
 * credential files are replaced by the empty {@link CLOUD_CREDENTIAL_STAND_INS};
 * and gcloud (`CLOUDSDK_CONFIG`, not `~/.config/gcloud`) and az
 * (`AZURE_CONFIG_DIR`, not `~/.azure`) get fresh, empty dirs inside one
 * private temp dir made for this one child, so a login or token one child
 * writes there never reaches the next. {@link releaseCloudStandIns} removes
 * that dir once the child has exited; any still there when this process
 * exits are removed then.
 */
export function withoutCloudCredentials(env: Record<string, string>): Record<string, string> {
  for (const key of Object.keys(env)) {
    if (isCloudCredentialEnvKey(key)) delete env[key];
  }
  Object.assign(env, CLOUD_CREDENTIAL_STAND_INS);
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-no-cloud-"));
  liveCloudDirs.add(dir);
  if (!cloudDirsExitHook) {
    cloudDirsExitHook = true;
    process.once("exit", () => {
      for (const d of liveCloudDirs) rmSync(d, { recursive: true, force: true });
    });
  }
  env.CLOUDSDK_CONFIG = join(dir, "gcloud");
  env.AZURE_CONFIG_DIR = join(dir, "azure");
  mkdirSync(env.CLOUDSDK_CONFIG, { mode: 0o700 });
  mkdirSync(env.AZURE_CONFIG_DIR, { mode: 0o700 });
  return env;
}

/**
 * Remove the stand-in config dirs {@link withoutCloudCredentials} made for
 * `env`, once its child has exited. A no-op for an env it did not build or
 * one already released.
 */
export function releaseCloudStandIns(env: Record<string, string>): void {
  const gcloud = env.CLOUDSDK_CONFIG;
  if (!gcloud) return;
  const dir = dirname(gcloud);
  if (!liveCloudDirs.delete(dir)) return;
  rmSync(dir, { recursive: true, force: true });
}

/**
 * After an abort, how long the runner still waits for the lane's output
 * pipes. The caller drops that output (a cancel), and a lane process that
 * escaped the tree kill (its own session, already reparented) may hold a pipe
 * open for as long as it runs.
 */
const ABORT_PIPE_GRACE_MS = 250;

type PipeReader = ReadableStreamDefaultReader<Uint8Array>;

/**
 * Read a lane pipe to its end as it is written: each chunk is output, which
 * resets the run's idle watchdog (AGENT-12, REQ-agent-244), so only a lane
 * that prints nothing for the idle timeout is stopped.
 */
async function readLanePipe(
  stream: ReadableStream<Uint8Array> | number | undefined,
  readers: PipeReader[],
): Promise<string> {
  if (!stream || typeof stream === "number") return "";
  const reader = stream.getReader();
  readers.push(reader);
  const decoder = new TextDecoder();
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        noteIdleActivity();
        text += decoder.decode(value, { stream: true });
      }
    }
  } catch {
    /* reader cancelled after an abort */
  }
  return text + decoder.decode();
}

export const defaultVerifyRunner: VerifyRunner = async (cwd, signal) => {
  const fledge = Bun.which("fledge");
  if (!fledge) {
    return {
      success: false,
      output: "fledge not on PATH — cannot run verify lane",
    };
  }
  if (signal?.aborted) {
    return { success: false, output: "verify lane aborted before start" };
  }
  // SAFE-21.b: the lane starts without the owner's cloud credentials; its
  // stand-in config dirs are removed once it has exited.
  const env = withoutCloudCredentials(buildVerifyEnv());
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn([fledge, ...VERIFY_ARGS], {
      cwd,
      env,
      stdout: "pipe",
      stderr: "pipe",
      // Own process group: an abort stops the lane's tasks (tests, typecheck),
      // not only fledge, which leaves them running (AGENT-3, REQ-agent-244).
      detached: true,
    });
  } catch (e) {
    releaseCloudStandIns(env);
    throw e;
  }
  // What the lane left in its group as fledge exited: an abort or this
  // process exiting still reaches it (as in spawnCapped).
  let atExit: ProcEntry[] = [];
  const exited = proc.exited.then((code) => {
    atExit = collectProcessTree(proc.pid, { rootJustExited: true });
    return code;
  });
  const untrack = trackChildProcess(proc.pid, () => atExit);
  // The pipes are read while the lane runs, so its output counts as the
  // run's activity (AGENT-12).
  const readers: PipeReader[] = [];
  const read = Promise.all([
    readLanePipe(proc.stdout, readers),
    readLanePipe(proc.stderr, readers),
  ]);
  // An abort stops waiting on the output pipes after a short grace (AGENT-3).
  let giveUp: () => void = () => {};
  const gaveUp = new Promise<null>((resolve) => {
    giveUp = () => {
      for (const r of readers) r.cancel().catch(() => {});
      resolve(null);
    };
  });
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  const onAbort = () => {
    killProcessTree(proc.pid, { known: atExit });
    graceTimer ??= setTimeout(giveUp, ABORT_PIPE_GRACE_MS);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const code = await exited;
    const out = await Promise.race([read, gaveUp]);
    if (out === null) {
      return { success: false, output: "verify lane aborted" };
    }
    const [stdout, stderr] = out;
    return { success: code === 0, output: `${stdout}${stderr}` };
  } finally {
    if (graceTimer) clearTimeout(graceTimer);
    signal?.removeEventListener("abort", onAbort);
    untrack();
    releaseCloudStandIns(env);
  }
};

/**
 * Most verify lane output a retry sends the model (AGENT-4.a, REQ-agent-002).
 * The tool loop and the read-tier chat both cap the feedback here.
 */
export const VERIFY_FEEDBACK_MAX_CHARS = 4000;

/**
 * fledge's own failure line: `Lane 'verify' failed at step 3 (test) after …`,
 * or `… failed at step 1 (parallel(lint, smoke)) after …` for a parallel step.
 */
const LANE_FAILED_RE =
  /Lane '([^'\n]*)' failed at step (\d+) \(((?:[^()\n]|\([^()\n]*\))*)\)/g;
/**
 * fledge's step markers on stdout: `  ▶️ Running task: test`, and
 * `  ▶️ Running parallel: lint, smoke` before a parallel step's tasks.
 */
const RUNNING_STEP_RE = /^[^\n]*Running (task|parallel): ([^\n]*?)[ \t]*$/gm;
/**
 * Colour escapes (CSI), as a lane prints them when FORCE_COLOR or
 * CLICOLOR_FORCE reaches it: noise to the model, and they hide the markers.
 */
const ANSI_CSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
/** Lines kept from the failing step when its output is over the cap. */
const ERROR_LINE_RE =
  /error|fail|panic|fatal|exception|\bexpected\b|\breceived\b|[✗✘✖]/i;
/**
 * Error lines that report a failure (a test runner's `(fail)`, `error:`,
 * `Expected:` / `Received:` lines, a `TypeError: …`, a compiler's
 * `file(1,2): error TS…`, a `✗` check) rather than a log line that mentions
 * one (`… marked failed`, `error_class=ok`). They are kept first, so a step's
 * console chatter cannot crowd its failure out.
 */
const FAILURE_LINE_RE =
  /^\s*(?:\(fail\)|[✗✘✖]|\w*(?:error|exception)\b|(?:fail(?:ed|ure)?|panic|fatal|expected|received)\b)|:\s*(?:error|fatal)\b/i;
/** Passing tests and steps, even when a test name says "fails". */
const PASS_LINE_RE = /^\s*(?:\(pass\)|\(skip\)|\(todo\)|✓|✔)/;
const ERROR_LINE_MAX_CHARS = 300;
/** A tail cut mid-line moves to the next line start when one is this close. */
const TAIL_LINE_SNAP_CHARS = 200;

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** At most `n` chars from the end, from a line start when one is near. */
function tailOf(text: string, n: number): string {
  if (n <= 0) return "";
  if (text.length <= n) return text;
  let start = text.length - n;
  if (text[start - 1] !== "\n") {
    const nl = text.indexOf("\n", start);
    if (nl !== -1 && nl - start < TAIL_LINE_SNAP_CHARS && nl + 1 < text.length) {
      start = nl + 1;
    }
  }
  // Never start on half a surrogate pair.
  if (isLowSurrogate(text.charCodeAt(start))) start += 1;
  return text.slice(start);
}

/** One kept error line, at most ERROR_LINE_MAX_CHARS. */
function capLine(line: string): string {
  if (line.length <= ERROR_LINE_MAX_CHARS) return line;
  let cut = ERROR_LINE_MAX_CHARS - 1;
  if (isHighSurrogate(line.charCodeAt(cut - 1))) cut -= 1;
  return `${line.slice(0, cut)}…`;
}

/**
 * The verify lane output a retry sends the model (AGENT-4.a, REQ-agent-002).
 * Output within `max` chars is returned unchanged. Over it, colour escapes
 * are dropped, the start of the log (earlier steps that passed, such as a
 * typecheck or a `--help` smoke) is left out and the failing step is kept:
 * its name from fledge's `Lane '…' failed at step N (name)` line, its output
 * from its `Running task: <name>` marker on when that fits, else the error /
 * fail lines of that output (lines that report a failure before lines that
 * only mention one) and the end of the log. Never longer than `max`; never
 * cut inside a surrogate pair.
 */
export function verifyFeedbackExcerpt(
  output: string,
  max: number = VERIFY_FEEDBACK_MAX_CHARS,
): string {
  if (output.length <= max) return output;
  const log = output.replace(ANSI_CSI_RE, "");
  if (log.length <= max) return log;

  let lane: { name: string; step: string; task: string } | undefined;
  for (const m of log.matchAll(LANE_FAILED_RE)) {
    lane = { name: m[1] ?? "", step: m[2] ?? "", task: m[3] ?? "" };
  }
  // The failing step's output starts at its (last) marker; a parallel step
  // starts at its `Running parallel:` line. A lane runs its steps in order,
  // so without a named match the last marker is the step that failed. The
  // log is stdout then stderr, so stderr is in the section.
  let lastNamed: number | undefined;
  let lastAny: number | undefined;
  for (const m of log.matchAll(RUNNING_STEP_RE)) {
    const name = m[1] === "parallel" ? `parallel(${m[2] ?? ""})` : (m[2] ?? "");
    if (m[1] === "task") lastAny = m.index;
    if (lane && name === lane.task) lastNamed = m.index;
  }
  const sectionStart = lastNamed ?? lastAny ?? 0;
  const section = log.slice(sectionStart);

  let fixed =
    lane || lastAny !== undefined
      ? `[verify output is ${log.length} chars, over the feedback cap: ` +
        `this is the failing step's output, not the start of the log]\n`
      : `[verify output is ${log.length} chars, over the feedback cap: ` +
        `its start is left out]\n`;
  if (lane) {
    fixed += `Failing step: ${lane.task} (step ${lane.step} of lane '${lane.name}')\n`;
  }
  if (fixed.length >= max) return tailOf(log, max);

  const avail = max - fixed.length;
  if (section.length <= avail) return fixed + section;

  const errorsLabel = "Error lines from the failing step:\n";
  const tailLabel = "\n… end of the verify output:\n";
  const body = avail - errorsLabel.length - tailLabel.length;
  if (body <= 0) return fixed + tailOf(log, avail);
  // At least half the room is the end of the log. Error lines before it get
  // the rest: lines that report a failure first, then lines that mention
  // one, first ones first (the first error is often the cause), printed in
  // log order.
  const tailBudget = Math.ceil(body / 2);
  const room = body - tailBudget;
  let scanEnd = Math.max(sectionStart, log.length - tailBudget);
  // Never end the scanned lines on half a surrogate pair.
  if (scanEnd > sectionStart && isLowSurrogate(log.charCodeAt(scanEnd))) scanEnd -= 1;
  const seen = new Set<string>();
  const found: { at: number; line: string; failure: boolean }[] = [];
  const lines = log.slice(sectionStart, scanEnd).split("\n");
  for (let at = 0; at < lines.length; at++) {
    const line = capLine((lines[at] ?? "").trimEnd());
    if (!line.trim() || seen.has(line)) continue;
    if (!ERROR_LINE_RE.test(line) || PASS_LINE_RE.test(line)) continue;
    seen.add(line);
    found.push({ at, line, failure: FAILURE_LINE_RE.test(line) });
  }
  const kept: { at: number; line: string }[] = [];
  let used = 0;
  for (const failure of [true, false]) {
    for (const f of found) {
      if (f.failure !== failure) continue;
      if (used + f.line.length + 1 > room) break;
      kept.push(f);
      used += f.line.length + 1;
    }
  }
  if (kept.length === 0) return fixed + tailOf(log, avail);
  kept.sort((a, b) => a.at - b.at);
  const errors = `${errorsLabel}${kept.map((k) => k.line).join("\n")}\n`;
  const tail = tailOf(log, avail - errors.length - tailLabel.length);
  return `${fixed}${errors}${tailLabel}${tail}`;
}

export type { VerifyResult };
