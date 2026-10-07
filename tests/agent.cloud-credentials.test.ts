/**
 * SAFE-21.b (REQ-agent-621, REQ-plugins-621): the verify lane, `shell-exec`,
 * the language runners and the Fledge core runs start without the owner's
 * cloud credentials (KUBECONFIG, AWS, Google Cloud, Azure and similar), so
 * they can't reach prod by accident.
 *
 * Stand-in `kubectl`, `aws`, `gcloud` and `az` scripts (never the host's real
 * tools: each child calls them by absolute path from a temp dir) print what a
 * real one would read: the env it names, else its default files under a fake
 * HOME. Every fake credential and default file holds `OWNER-CLOUD-MARKER`, so
 * one marker anywhere in a child's output means a credential reached it.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fledgeCoreCommands } from "../plugins/fledge/core.ts";
import { RUNNERS, runRunner } from "../plugins/runners/commands.ts";
import { shellCommands } from "../plugins/shell/commands.ts";
import type { PluginHandlerResult } from "../src/plugins/types.ts";

const MARK = "OWNER-CLOUD-MARKER";

/** Cloud credential env vars a fake owner has set (values or files carry the marker). */
function credentialEnv(home: string): Record<string, string> {
  const x = join(home, "explicit");
  return {
    KUBECONFIG: `${join(x, "kubeconfig-a")}:${join(x, "kubeconfig-b")}`,
    KUBERNETES_SERVICE_HOST: "10.0.0.1",
    KUBERNETES_SERVICE_PORT: "443",
    AWS_ACCESS_KEY_ID: `${MARK}-aws-access-key-id`,
    AWS_SECRET_ACCESS_KEY: `${MARK}-aws-secret-access-key`,
    AWS_SESSION_TOKEN: `${MARK}-aws-session-token`,
    AWS_SECURITY_TOKEN: `${MARK}-aws-security-token`,
    AWS_PROFILE: `${MARK}-prod`,
    AWS_DEFAULT_PROFILE: `${MARK}-prod`,
    AWS_SHARED_CREDENTIALS_FILE: join(x, "aws-credentials"),
    AWS_CONFIG_FILE: join(x, "aws-config"),
    AWS_ROLE_ARN: `arn:aws:iam::000000000000:role/${MARK}`,
    AWS_WEB_IDENTITY_TOKEN_FILE: join(x, "web-identity-token"),
    AWS_CONTAINER_CREDENTIALS_FULL_URI: `http://169.254.170.2/${MARK}`,
    AWS_CONTAINER_AUTHORIZATION_TOKEN: `${MARK}-aws-container-token`,
    AWS_BEARER_TOKEN_BEDROCK: `${MARK}-bedrock`,
    GOOGLE_APPLICATION_CREDENTIALS: join(x, "service-account.json"),
    GOOGLE_CREDENTIALS: `${MARK}-google-credentials`,
    GOOGLE_OAUTH_ACCESS_TOKEN: `${MARK}-google-oauth`,
    GOOGLE_API_KEY: `${MARK}-google-api-key`,
    CLOUDSDK_CONFIG: join(x, "gcloud"),
    CLOUDSDK_CORE_ACCOUNT: `${MARK}@example.invalid`,
    CLOUDSDK_AUTH_ACCESS_TOKEN_FILE: join(x, "gcloud-token"),
    AZURE_CONFIG_DIR: join(x, "azure"),
    AZURE_CLIENT_ID: `${MARK}-azure-client-id`,
    AZURE_CLIENT_SECRET: `${MARK}-azure-client-secret`,
    AZURE_TENANT_ID: `${MARK}-azure-tenant`,
    AZURE_FEDERATED_TOKEN_FILE: join(x, "azure-federated-token"),
    ARM_CLIENT_SECRET: `${MARK}-arm-client-secret`,
    ARM_ACCESS_KEY: `${MARK}-arm-access-key`,
    IDENTITY_ENDPOINT: `http://localhost:42356/${MARK}`,
    IDENTITY_HEADER: `${MARK}-identity-header`,
    DIGITALOCEAN_TOKEN: `${MARK}-digitalocean`,
    HCLOUD_TOKEN: `${MARK}-hcloud`,
    CLOUDFLARE_API_TOKEN: `${MARK}-cloudflare`,
    VAULT_TOKEN: `${MARK}-vault`,
    TF_TOKEN_app_terraform_io: `${MARK}-terraform`,
  };
}

/** Keys a child may hold only as an empty stand-in, never with the owner's value. */
const STAND_IN_KEYS = new Set([
  "KUBECONFIG",
  "AWS_SHARED_CREDENTIALS_FILE",
  "AWS_CONFIG_FILE",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "CLOUDSDK_CONFIG",
  "AZURE_CONFIG_DIR",
]);

/** Ordinary settings the children keep. */
const KEPT = { AWS_REGION: "eu-north-1", GOOGLE_CLOUD_PROJECT: "keep-project", KEEP_ME: "kept" };

/** What a stand-in reads when its env names nothing: the owner's default files. */
const DEFAULT_FILES: Record<string, string> = {
  ".kube/config": `${MARK} kube default config\n`,
  ".aws/credentials": `[default]\naws_secret_access_key = ${MARK}-aws-default-credentials\n`,
  ".aws/config": `[profile prod]\ncredential_process = echo ${MARK}-aws-default-config\n`,
  ".config/gcloud/credentials.db": `${MARK} gcloud default login\n`,
  ".config/gcloud/application_default_credentials.json": `{"refresh_token":"${MARK}-adc-default"}\n`,
  ".azure/msal_token_cache.json": `{"AccessToken":"${MARK}-azure-default"}\n`,
};

const EXPLICIT_FILES: Record<string, string> = {
  "kubeconfig-a": `${MARK} kube explicit a\n`,
  "kubeconfig-b": `${MARK} kube explicit b\n`,
  "aws-credentials": `${MARK} aws explicit credentials\n`,
  "aws-config": `${MARK} aws explicit config\n`,
  "web-identity-token": `${MARK} aws web identity\n`,
  "service-account.json": `{"private_key":"${MARK}-sa"}\n`,
  "gcloud/credentials.db": `${MARK} gcloud explicit login\n`,
  "gcloud-token": `${MARK} gcloud token file\n`,
  "azure/msal_token_cache.json": `${MARK} azure explicit\n`,
  "azure-federated-token": `${MARK} azure federated\n`,
};

/**
 * Stand-ins that read what the real tools read: kubectl each KUBECONFIG entry
 * else ~/.kube/config (and in-cluster when KUBERNETES_SERVICE_HOST is set);
 * aws AWS_SHARED_CREDENTIALS_FILE / AWS_CONFIG_FILE else ~/.aws/*; gcloud
 * CLOUDSDK_CONFIG else ~/.config/gcloud, and the client libraries' ADC file
 * (GOOGLE_APPLICATION_CREDENTIALS, else the well-known file under HOME, which
 * Node and Go clients read whatever CLOUDSDK_CONFIG says); az AZURE_CONFIG_DIR
 * else ~/.azure.
 */
const STAND_INS: Record<string, string> = {
  kubectl: `#!/bin/sh
echo "kubectl KUBECONFIG=[\${KUBECONFIG-}] in-cluster=[\${KUBERNETES_SERVICE_HOST-}]"
list="\${KUBECONFIG:-$HOME/.kube/config}"
IFS=:
for f in $list; do [ -r "$f" ] && cat "$f"; done
exit 0
`,
  aws: `#!/bin/sh
echo "aws imds-disabled=[\${AWS_EC2_METADATA_DISABLED-}]"
cat "\${AWS_SHARED_CREDENTIALS_FILE:-$HOME/.aws/credentials}" "\${AWS_CONFIG_FILE:-$HOME/.aws/config}" 2>/dev/null
exit 0
`,
  gcloud: `#!/bin/sh
dir="\${CLOUDSDK_CONFIG:-$HOME/.config/gcloud}"
echo "gcloud config-dir=[$dir]"
[ -d "$dir" ] && find "$dir" -type f -exec cat {} +
cat "\${GOOGLE_APPLICATION_CREDENTIALS:-$HOME/.config/gcloud/application_default_credentials.json}" 2>/dev/null
exit 0
`,
  az: `#!/bin/sh
dir="\${AZURE_CONFIG_DIR:-$HOME/.azure}"
echo "az config-dir=[$dir]"
[ -d "$dir" ] && find "$dir" -type f -exec cat {} +
exit 0
`,
};

/** Runs every stand-in by absolute path, then dumps the env. Used as fake node / fledge. */
const PROBE = `#!/bin/sh
d="$(dirname "$0")"
"$d/kubectl"; "$d/aws"; "$d/gcloud"; "$d/az"
echo "--- env"
env
exit 0
`;

type Fixture = { root: string; bin: string; home: string; project: string };
const roots: string[] = [];

function writeTree(base: string, files: Record<string, string>): void {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(base, rel)), { recursive: true });
    writeFileSync(join(base, rel), text);
  }
}

function makeFixture(): Fixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-cloud-creds-")));
  roots.push(root);
  const bin = join(root, "bin");
  const home = join(root, "home");
  const project = join(root, "project");
  for (const d of [bin, home, project]) mkdirSync(d);
  for (const [name, text] of Object.entries({ ...STAND_INS, probe: PROBE, fledge: PROBE, node: PROBE })) {
    writeFileSync(join(bin, name), text);
    chmodSync(join(bin, name), 0o755);
  }
  writeTree(home, DEFAULT_FILES);
  writeTree(join(home, "explicit"), EXPLICIT_FILES);
  return { root, bin, home, project };
}

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

/** The two ways an owner's box holds cloud credentials: env vars, or only the default files. */
type Scenario = "env" | "defaults";
const SCENARIOS: readonly Scenario[] = ["env", "defaults"];

function ownerEnv(f: Fixture, scenario: Scenario): Record<string, string> {
  return {
    PATH: `${f.bin}:/usr/bin:/bin`,
    HOME: f.home,
    ...KEPT,
    ...(scenario === "env" ? credentialEnv(f.home) : {}),
  };
}

/** Asserts a child's output shows no cloud credential; returns its stand-in config dirs. */
function expectCloudFree(out: string, f: Fixture, scenario: Scenario): { gcloud: string; azure: string } {
  const where = `${scenario}: ${out}`;
  expect(out, where).toContain("--- env");
  expect(out, where).not.toContain(MARK);
  for (const key of Object.keys(credentialEnv(f.home))) {
    if (!STAND_IN_KEYS.has(key)) expect(out, where).not.toMatch(new RegExp(`^${key}=`, "m"));
  }
  for (const key of ["KUBECONFIG", "AWS_SHARED_CREDENTIALS_FILE", "AWS_CONFIG_FILE", "GOOGLE_APPLICATION_CREDENTIALS"]) {
    expect(out, where).toMatch(new RegExp(`^${key}=/dev/null$`, "m"));
  }
  expect(out, where).toMatch(/^AWS_EC2_METADATA_DISABLED=true$/m);
  expect(out, where).toContain("kubectl KUBECONFIG=[/dev/null] in-cluster=[]");
  const gcloud = out.match(/^CLOUDSDK_CONFIG=(.+)$/m)?.[1] ?? "";
  const azure = out.match(/^AZURE_CONFIG_DIR=(.+)$/m)?.[1] ?? "";
  for (const dir of [gcloud, azure]) {
    expect(dir, where).not.toBe("");
    expect(dir.startsWith(f.home), where).toBe(false);
  }
  expect(out, where).toContain(`gcloud config-dir=[${gcloud}]`);
  expect(out, where).toContain(`az config-dir=[${azure}]`);
  for (const [k, v] of Object.entries(KEPT)) expect(out, where).toMatch(new RegExp(`^${k}=${v}$`, "m"));
  return { gcloud, azure };
}

/** The stand-in dirs are gone once the child has exited. */
function expectReleased(dirs: { gcloud: string; azure: string }): void {
  for (const d of [dirs.gcloud, dirs.azure, dirname(dirs.gcloud)]) expect(existsSync(d), d).toBe(false);
}

function outputOf(r: PluginHandlerResult): string {
  return String(r.message ?? (r.data as { output?: string } | undefined)?.output ?? "");
}

describe("SAFE-21.b: the verify lane starts without cloud credentials (REQ-agent-621)", () => {
  test("defaultVerifyRunner: no cloud env, default files neutralised, stand-in dirs removed after the lane", async () => {
    const runner = join(import.meta.dir, "..", "src", "agent", "verify.ts");
    for (const scenario of SCENARIOS) {
      const f = makeFixture();
      // A bridge / daemon process with the owner's env runs the default runner
      // (a child process: Bun.which reads PATH as the process started).
      const script =
        `const { defaultVerifyRunner } = await import(${JSON.stringify(runner)});` +
        `const r = await defaultVerifyRunner(${JSON.stringify(f.project)});` +
        `process.stdout.write(JSON.stringify(r));`;
      const base: Record<string, string> = {};
      for (const [k, v] of Object.entries(process.env)) {
        if (typeof v === "string" && !(k in credentialEnv(f.home))) base[k] = v;
      }
      const proc = Bun.spawn([process.execPath, "--no-env-file", "-e", script], {
        cwd: f.project,
        env: { ...base, ...ownerEnv(f, scenario), PATH: `${f.bin}:${process.env.PATH ?? ""}` },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      expect(code, stderr).toBe(0);
      const res = JSON.parse(stdout) as { success: boolean; output: string };
      expect(res.success, res.output).toBe(true);
      expectReleased(expectCloudFree(res.output, f, scenario));
    }
  });
});

describe("SAFE-21.b: shell-exec, the runners and the Fledge core runs start without cloud credentials (REQ-plugins-621)", () => {
  const saved: Record<string, string | undefined> = {};
  let keys: string[] = [];

  beforeEach(() => {
    keys = ["PATH", "HOME", ...Object.keys(KEPT), ...Object.keys(credentialEnv("/x"))];
    for (const k of keys) saved[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  test("shell-exec: the command sees no cloud env or default file; its stand-in dirs are removed", async () => {
    const shell = shellCommands.find((c) => c.name === "shell-exec");
    if (!shell) throw new Error("no shell-exec");
    for (const scenario of SCENARIOS) {
      const f = makeFixture();
      // shell-exec builds its child env from this process's env.
      for (const k of Object.keys(credentialEnv(f.home))) delete process.env[k];
      Object.assign(process.env, ownerEnv(f, scenario));
      const r = await shell.handler({
        // The stand-ins by absolute path (the clamp refuses an expanded command word).
        args: [
          "--command",
          `${["kubectl", "aws", "gcloud", "az"].map((t) => join(f.bin, t)).join("; ")}; echo "--- env"; printenv`,
        ],
        cwd: f.project,
        json: false,
        nonInteractive: true,
        allowlist: new Set(["shell-exec"]),
      });
      expect(r.ok, outputOf(r)).toBe(true);
      expectReleased(expectCloudFree(outputOf(r), f, scenario));
    }
  });

  test("node-exec / python-exec / cargo-exec: the runner's child sees no cloud env or default file", async () => {
    for (const spec of RUNNERS) {
      for (const scenario of SCENARIOS) {
        const f = makeFixture();
        const r = await runRunner({
          spec,
          bin: join(f.bin, "node"),
          args: ["x"],
          cwd: f.project,
          env: ownerEnv(f, scenario),
        });
        expect(r.ok, outputOf(r)).toBe(true);
        expectReleased(expectCloudFree(outputOf(r), f, scenario));
      }
    }
  });

  test("fledge-lanes-run and fledge-run: the lane or task sees no cloud env or default file", async () => {
    for (const [name, args] of [
      ["fledge-lanes-run", ["verify"]],
      ["fledge-run", ["deploy"]],
    ] as const) {
      for (const scenario of SCENARIOS) {
        const f = makeFixture();
        const cmd = fledgeCoreCommands({ env: ownerEnv(f, scenario) }).find((c) => c.name === name);
        if (!cmd) throw new Error(`no ${name}`);
        const r = await cmd.handler({
          args: [...args],
          cwd: f.project,
          json: false,
          nonInteractive: false,
          allowlist: new Set(),
        });
        expect(r.ok, outputOf(r)).toBe(true);
        expectReleased(expectCloudFree(outputOf(r), f, scenario));
      }
    }
  });

  test("each child gets fresh, empty config dirs: a login one child writes never reaches the next", async () => {
    const f = makeFixture();
    // A first child "logs in": it writes into whatever gcloud / az config dir it got.
    const plant = join(f.bin, "plant");
    writeFileSync(
      plant,
      `#!/bin/sh
for dir in "\${CLOUDSDK_CONFIG:-$HOME/.config/gcloud}" "\${AZURE_CONFIG_DIR:-$HOME/.azure}"; do
  mkdir -p "$dir" && echo "PLANTED-BY-AN-EARLIER-CHILD" > "$dir/planted.json"
done
echo "planted"
`,
    );
    chmodSync(plant, 0o755);
    const env = { PATH: `${f.bin}:/usr/bin:/bin`, HOME: f.home, ...KEPT };
    const spec = RUNNERS[0]!;
    const first = await runRunner({ spec, bin: plant, args: ["x"], cwd: f.project, env });
    expect(first.ok, outputOf(first)).toBe(true);
    const second = await runRunner({ spec, bin: join(f.bin, "node"), args: ["x"], cwd: f.project, env });
    expect(second.ok, outputOf(second)).toBe(true);
    expect(outputOf(second)).not.toContain("PLANTED-BY-AN-EARLIER-CHILD");
    expectReleased(expectCloudFree(outputOf(second), f, "defaults"));
  });
});

describe("SAFE-21.b: specsync-check, the verify lane's spec-check step, starts without cloud credentials (REQ-plugins-621)", () => {
  const commands = join(import.meta.dir, "..", "plugins", "specsync", "commands.ts");
  /** A GitHub token with no vendor shape: only the by-name env redaction catches it. */
  const GH = "OWNER-GH-TOKEN-NO-VENDOR-SHAPE-0001";

  /**
   * The tier-0 `specsync-check` tool run by a process with the owner's env
   * (a child process: Bun.which reads PATH as the process started).
   */
  async function specCheckAsOwner(f: Fixture, scenario: Scenario): Promise<{ ok: boolean; out: string }> {
    const script =
      `const { specsyncCommands } = await import(${JSON.stringify(commands)});` +
      `const cmd = specsyncCommands.find((c) => c.name === "specsync-check");` +
      `const r = await cmd.handler({ args: [], cwd: ${JSON.stringify(f.project)}, json: false, nonInteractive: true, allowlist: new Set() });` +
      `process.stdout.write(JSON.stringify({ ok: r.ok, out: String(r.message ?? r.error ?? "") }));`;
    const base: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === "string" && !(k in credentialEnv(f.home))) base[k] = v;
    }
    const proc = Bun.spawn([process.execPath, "--no-env-file", "-e", script], {
      cwd: f.project,
      env: { ...base, ...ownerEnv(f, scenario), GITHUB_TOKEN: GH, PATH: `${f.bin}:${process.env.PATH ?? ""}` },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    expect(code, stderr).toBe(0);
    return JSON.parse(stdout) as { ok: boolean; out: string };
  }

  test("its fledge spec-check task and its plain specsync check see no cloud env or default file; output is scrubbed", async () => {
    for (const viaFledge of [true, false]) {
      for (const scenario of SCENARIOS) {
        const f = makeFixture();
        writeFileSync(join(f.bin, "specsync"), PROBE);
        chmodSync(join(f.bin, "specsync"), 0o755);
        // With a spec-check task the tool runs `fledge run spec-check`; without one, `specsync check`.
        if (viaFledge) writeFileSync(join(f.project, "fledge.toml"), `[tasks.spec-check]\ncmd = "probe"\n`);
        const r = await specCheckAsOwner(f, scenario);
        const where = `${viaFledge ? "fledge" : "specsync"} ${scenario}: ${r.out}`;
        expect(r.ok, where).toBe(true);
        expectReleased(expectCloudFree(r.out, f, scenario));
        // SAFE-6: the owner's GitHub token never comes back in the tool's output.
        expect(r.out, where).not.toContain(GH);
      }
    }
  });
});

describe("SAFE-21.b: the cloud credential family and its stand-ins (REQ-agent-621)", () => {
  test("isCloudCredentialEnvKey names the documented family and keeps ordinary settings", async () => {
    const mod = (await import("../src/agent/verify.ts")) as Record<string, unknown>;
    const isCloud = mod.isCloudCredentialEnvKey as ((k: string) => boolean) | undefined;
    expect(typeof isCloud).toBe("function");
    for (const k of [
      ...Object.keys(credentialEnv("/x")),
      "AWS_ROLE_SESSION_NAME",
      "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
      "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
      "GCLOUD_KEYFILE_JSON",
      "GOOGLE_CLOUD_KEYFILE_JSON",
      "GOOGLE_IMPERSONATE_SERVICE_ACCOUNT",
      "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
      "AZURE_USERNAME",
      "AZURE_PASSWORD",
      "AZURE_CLIENT_CERTIFICATE_PATH",
      "AZURE_STORAGE_CONNECTION_STRING",
      "MSI_ENDPOINT",
      "MSI_SECRET",
      "ARM_CLIENT_ID",
      "ARM_OIDC_TOKEN_FILE_PATH",
      "ARM_USE_MSI",
      "DIGITALOCEAN_ACCESS_TOKEN",
      "CLOUDFLARE_API_KEY",
      "LINODE_TOKEN",
      "SCW_SECRET_KEY",
      "OCI_CLI_KEY_FILE",
      "IBMCLOUD_API_KEY",
      "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
      "OS_PASSWORD",
      "HEROKU_API_KEY",
      "FLY_API_TOKEN",
      "VERCEL_TOKEN",
      "NETLIFY_AUTH_TOKEN",
      "TFE_TOKEN",
      "PULUMI_ACCESS_TOKEN",
      "NOMAD_TOKEN",
      "CONSUL_HTTP_TOKEN",
    ]) {
      expect({ k, cloud: isCloud?.(k) }).toEqual({ k, cloud: true });
    }
    for (const k of [
      "PATH",
      "HOME",
      "TMPDIR",
      "KEEP_ME",
      "AWS_REGION",
      "AWS_DEFAULT_REGION",
      "AWS_ENDPOINT_URL",
      "GOOGLE_CLOUD_PROJECT",
      "GCLOUD_PROJECT",
      "AZURE_LOCATION",
      "KUBE_EDITOR",
      "OSTYPE",
      "TF_LOG",
    ]) {
      expect({ k, cloud: isCloud?.(k) }).toEqual({ k, cloud: false });
    }
  });

  test("withoutCloudCredentials: fresh private dirs per child; release removes only its own dirs", async () => {
    const mod = (await import("../src/agent/verify.ts")) as Record<string, unknown>;
    const without = mod.withoutCloudCredentials as ((e: Record<string, string>) => Record<string, string>) | undefined;
    const release = mod.releaseCloudStandIns as ((e: Record<string, string>) => void) | undefined;
    expect(typeof without).toBe("function");
    expect(typeof release).toBe("function");
    if (!without || !release) return;
    const f = makeFixture();
    const a = without({ ...credentialEnv(f.home), ...KEPT });
    const b = without({ ...KEPT });
    for (const env of [a, b]) {
      for (const k of Object.keys(credentialEnv(f.home))) {
        if (!STAND_IN_KEYS.has(k)) expect(env[k]).toBeUndefined();
      }
      expect(env).toMatchObject({ ...KEPT, KUBECONFIG: "/dev/null", AWS_EC2_METADATA_DISABLED: "true" });
      for (const d of [env.CLOUDSDK_CONFIG!, env.AZURE_CONFIG_DIR!]) {
        expect(readdirSync(d)).toEqual([]);
        expect(statSync(d).mode & 0o077).toBe(0);
        expect(statSync(dirname(d)).mode & 0o077).toBe(0);
      }
    }
    expect(dirname(a.CLOUDSDK_CONFIG!)).not.toBe(dirname(b.CLOUDSDK_CONFIG!));
    release(a);
    expect(existsSync(dirname(a.CLOUDSDK_CONFIG!))).toBe(false);
    expect(existsSync(b.CLOUDSDK_CONFIG!)).toBe(true);
    release(a); // twice is a no-op
    release(b);
    expect(existsSync(dirname(b.CLOUDSDK_CONFIG!))).toBe(false);
    // An env it did not build (the owner's own gcloud dir) is never removed.
    const own = join(f.home, ".config", "gcloud");
    release({ CLOUDSDK_CONFIG: own, AZURE_CONFIG_DIR: join(f.home, ".azure") });
    expect(existsSync(own)).toBe(true);
    expect(existsSync(join(f.home, ".azure"))).toBe(true);
  });
});
