/**
 * AUTONOMY-9/9.a (#97, REQ-plugins-097) — which calls touch prod or deploys.
 *
 * shell-exec (read with the clamp's walker, package scripts and recipes
 * resolved, inline code scanned, anything unreadable asks; the self-update
 * to a tagged release exempt), the language runners, fledge-run /
 * fledge-lanes-run (the task and lane commands from fledge.toml) and
 * git-push (the remote's default branch is a deploy). Read-only looks at
 * prod ask too (AUTONOMY-9.a). Temp dirs and repos; nothing runs.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { mustAskVerdict, prodTextWhy } from "../src/plugins/must-ask.ts";
import { get } from "../src/plugins/registry.ts";
import type { MustAskVerdict } from "../src/plugins/types.ts";
import { fledgeLanesRunMustAsk, fledgeRunMustAsk } from "../plugins/fledge/must-ask.ts";
import { runnerCommand, RUNNERS } from "../plugins/runners/commands.ts";
import { isSelfUpdateToTag, runnerProdWhy, shellProdWhy } from "../plugins/shell/must-ask.ts";

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function git(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(["git", ...args], {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@e",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@e",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
}

const asks = (v: MustAskVerdict) => (v && "ask" in v ? v.ask : null);

let root: string;

beforeAll(() => {
  loadBuiltins();
  root = tmp("must-ask-shell-");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      scripts: {
        test: "bun test",
        deploy: "bun run build && flyctl deploy",
        predeploy: "echo building",
        release: "npm run publish-site",
        "publish-site": "wrangler pages deploy dist",
        lint: "tsc --noEmit",
      },
    }),
  );
  writeFileSync(
    join(root, "Makefile"),
    [
      "KUBE = kubectl",
      "",
      "test:",
      "\tbun test",
      "",
      "deploy: build",
      "\t$(KUBE) apply -f k8s/",
      "",
      "build:",
      "\tbun build src/index.ts",
      "",
      "ship: check",
      "\techo ok",
      "",
      "deploy-dyn:",
      "\t$$TOOL --prod",
      "",
      "check:",
      "\tsudo systemctl status corvidinho",
      "",
    ].join("\n"),
  );
  writeFileSync(join(root, "justfile"), ["test:", "    bun test", "", "up:", "    docker compose up -d", ""].join("\n"));
  writeFileSync(join(root, "deploy.js"), 'require("child_process").execSync("ssh box uptime");\n');
  writeFileSync(join(root, "hello.py"), 'print("hello")\n');
});

describe("shell-exec: prod and deploy contact asks, read-only looks included (AUTONOMY-9.a)", () => {
  const cases: [string, RegExp][] = [
    ["apt list --installed", /system packages/],
    ["crontab -l", /firewall or cron/],
    ["ufw status", /firewall or cron/],
    ["systemctl status corvidinho", /box's services/],
    ["journalctl -u corvidinho -n 50", /box's services/],
    ["docker ps", /container engine/],
    ["kubectl get pods", /cluster/],
    ["helm list", /cluster/],
    ["terraform plan", /infrastructure/],
    ["pulumi preview", /infrastructure/],
    ["ansible-playbook site.yml", /infrastructure/],
    ["flyctl deploy", /hosting platform/],
    ["vercel env ls", /hosting platform/],
    ["aws s3 ls", /cloud account/],
    ["gcloud secrets list", /cloud account/],
    ["vault kv get secret/app", /secrets/],
    ["doppler secrets", /secrets/],
    ["gh secret list", /GitHub secrets or variables/],
    ["gh variable set X --body 1", /GitHub secrets or variables/],
    ["gh workflow run deploy.yml", /GitHub workflow/],
    ["gh release create v1.0.0", /GitHub release/],
    ["gh api repos/o/r/actions/secrets", /secrets, variables/],
    ["dig example.com", /DNS/],
    ["nslookup example.com", /DNS/],
    ["git push origin main", /git push/],
    ["npx vercel deploy --prod", /hosting platform/],
    ["bunx wrangler deploy", /hosting platform/],
    ["npm run deploy", /flyctl/],
    ["npm run release", /wrangler/],
    ["make deploy", /kubectl/],
    ["make ship", /systemctl|sudo/],
    ["just up", /docker/],
    ["node -e 'require(\"child_process\").execSync(\"kubectl get ns\")'", /kubectl/],
    ["python3 -c 'import subprocess; subprocess.run([\"docker\", \"ps\"])'", /docker/],
    ["node deploy.js", /ssh/],
    ["echo ok && timeout 5 xargs -a list.txt helm status", /cluster/],
    ["env FOO=1 terraform apply -auto-approve", /infrastructure/],
    ["echo $(kubectl config current-context)", /cluster/],
    ["bash -c 'docker compose ps'", /container engine/],
    ["make deploy-dyn", /expansion/],
    ["npm run nosuch", /can't read/],
    ["make nosuch", /can't read/],
    ["make -C other deploy", /can't read/],
    // Options and their values before the subcommand (review fixes).
    ["git -C . push origin main", /git push/],
    ["git --git-dir .git push origin main", /git push/],
    ["git -c alias.p=push p origin main", /git alias/],
    ["gh workflow -R o/r run deploy.yml", /GitHub workflow/],
    ["gh release -R o/r create v1.0.0", /GitHub release/],
    ["npm --loglevel warn run deploy", /flyctl/],
    ["npx -c 'flyctl deploy'", /hosting platform/],
    // bun's own forms: `bun <script>`, `bun x`, `bun exec`, `bun <file>`.
    ["bun release", /wrangler/],
    ["bun x vercel deploy", /hosting platform/],
    ["bun exec 'kubectl get pods'", /cluster/],
    ["bun deploy.js", /ssh/],
    // Another package.json, workspace or preload can't be read.
    ["bun --cwd sub run test", /can't read/],
    ["npm run test --workspace api", /can't read/],
    ["pnpm -C sub deploy", /can't read/],
    ["bun --preload ./setup.ts test", /can't read/],
  ];
  for (const [cmd, why] of cases) {
    test(`asks: ${cmd}`, () => {
      const got = shellProdWhy(cmd, root);
      expect(got).not.toBeNull();
      expect(got!).toMatch(why);
    });
  }

  const benign = [
    "ls -la",
    "bun test",
    "npm test",
    "npm run lint",
    "make test",
    "just test",
    "git status && git log --oneline -3",
    "echo docker kubectl ssh",
    "python3 hello.py",
    "node -e 'console.log(1)'",
    "grep -rn systemctl src || true",
    "rsync -a src/ build/",
    "npm install",
    "bun install",
    "npm ci",
    "bun run lint",
    "git -C . status",
    "gh pr list -R o/r",
    "gh workflow -R o/r list",
  ];
  for (const cmd of benign) {
    test(`runs with no ask: ${cmd}`, () => {
      expect(shellProdWhy(cmd, root)).toBeNull();
    });
  }

  test("an install reads the project's install lifecycle scripts", () => {
    const dir = tmp("must-ask-install-");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { postinstall: "doppler secrets download" } }));
    for (const cmd of ["npm install", "npm ci", "bun install", "pnpm i", "yarn"]) {
      expect(shellProdWhy(cmd, dir)).toMatch(/postinstall.*doppler/);
    }
  });

  test("a git alias in the repo's config is read like the command it stands for", () => {
    const dir = tmp("must-ask-alias-");
    git(dir, "init", "-q", "-b", "work");
    git(dir, "config", "alias.ship", "push origin main");
    git(dir, "config", "alias.dep", "!flyctl deploy");
    git(dir, "config", "alias.st", "status");
    expect(shellProdWhy("git ship", dir)).toMatch(/git alias.*git push/);
    expect(shellProdWhy("git dep", dir)).toMatch(/git alias.*hosting platform/);
    expect(shellProdWhy("git st", dir)).toBeNull();
    expect(shellProdWhy("git status", dir)).toBeNull();
  });

  test("a command SAFE-21 or the SAFE-3 clamp refuses is not carded (the handler refuses it first)", () => {
    expect(shellProdWhy("ssh box uptime", root)).toBeNull();
    expect(shellProdWhy("sudo apt-get install jq", root)).toBeNull();
    expect(shellProdWhy("cd / && docker ps", root)).toBeNull();
    expect(shellProdWhy("$DEPLOY_TOOL --prod", root)).toBeNull();
  });

  test("the shell-exec classifier carries the exact command and the cwd", async () => {
    const v = asks(await mustAskVerdict(get("shell-exec")!, ["--", "docker", "ps", "-a"], root));
    expect(v).toMatchObject({ class: "prod", text: "docker ps -a", target: `the command below, run in ${root}` });
  });
});

describe("AUTONOMY-9: updating itself to a tagged release is not a deploy", () => {
  let install: string;
  beforeAll(() => {
    install = tmp("must-ask-install-");
    git(install, "init", "-q", "-b", "main");
    mkdirSync(join(install, "scripts"));
    writeFileSync(
      join(install, "scripts", "corvidinho-update.sh"),
      '#!/usr/bin/env bash\ngit fetch --tags\nsystemctl --user restart "$CORVIDINHO_BRIDGE_UNIT"\n',
      { mode: 0o755 },
    );
    git(install, "add", ".");
    git(install, "commit", "-q", "-m", "init");
    git(install, "tag", "v1.2.3");
  });

  test("exactly CORVIDINHO_REF=v<tag> <installed>/scripts/corvidinho-update.sh (or bash <it>) with an existing tag: no ask", () => {
    const script = join(install, "scripts", "corvidinho-update.sh");
    expect(isSelfUpdateToTag(`CORVIDINHO_REF=v1.2.3 ${script}`, root, { installRoot: install })).toBe(true);
    expect(isSelfUpdateToTag(`CORVIDINHO_REF=v1.2.3 bash ${script}`, root, { installRoot: install })).toBe(true);
    expect(shellProdWhy("CORVIDINHO_REF=v1.2.3 scripts/corvidinho-update.sh", install, { installRoot: install })).toBeNull();
  });

  test("anything else asks: no tag, a branch ref, a missing tag, another override, an argument, another command, a copy", () => {
    const script = join(install, "scripts", "corvidinho-update.sh");
    const opts = { installRoot: install };
    for (const cmd of [
      "scripts/corvidinho-update.sh",
      "CORVIDINHO_REF=origin/main scripts/corvidinho-update.sh",
      "CORVIDINHO_REF=v9.9.9 scripts/corvidinho-update.sh",
      "CORVIDINHO_REF=v1.2.3 CORVIDINHO_BRIDGE_CMD=x scripts/corvidinho-update.sh",
      "CORVIDINHO_REF=v1.2.3 scripts/corvidinho-update.sh --force",
      "CORVIDINHO_REF=v1.2.3 scripts/corvidinho-update.sh && docker ps",
    ]) {
      expect(isSelfUpdateToTag(cmd, install, opts)).toBe(false);
      expect(shellProdWhy(cmd, install, opts)).not.toBeNull();
    }
    // The talk worktree's own copy of the script is not the installed one.
    const worktree = tmp("must-ask-worktree-");
    mkdirSync(join(worktree, "scripts"));
    writeFileSync(join(worktree, "scripts", "corvidinho-update.sh"), "#!/bin/sh\n", { mode: 0o755 });
    expect(isSelfUpdateToTag("CORVIDINHO_REF=v1.2.3 scripts/corvidinho-update.sh", worktree, opts)).toBe(false);
    expect(isSelfUpdateToTag(`CORVIDINHO_REF=v1.2.3 ${script}`, worktree, opts)).toBe(true);
  });
});

describe("the language runners ask on table words in argv, inline code and the script they run", () => {
  test("node / python / cargo", () => {
    expect(runnerProdWhy("node", ["-e", "require('child_process').execSync('kubectl get pods')"], root)).toMatch(/kubectl/);
    expect(runnerProdWhy("node", ["deploy.js"], root)).toMatch(/ssh/);
    expect(runnerProdWhy("python", ["-c", "import boto3"], root)).toMatch(/cloud account/);
    expect(runnerProdWhy("cargo", ["run", "--", "terraform"], root)).toMatch(/infrastructure/);
    expect(runnerProdWhy("node", ["-e", "console.log(1)"], root)).toBeNull();
    expect(runnerProdWhy("python", ["hello.py"], root)).toBeNull();
    expect(runnerProdWhy("cargo", ["test", "--quiet"], root)).toBeNull();
  });

  test("every runner command carries the classifier", async () => {
    for (const spec of RUNNERS) {
      const cmd = runnerCommand(spec, "/bin/true");
      const v = asks(await mustAskVerdict(cmd, ["-e", "docker ps"], root));
      expect(v?.class).toBe("prod");
      expect(await mustAskVerdict(cmd, ["--version"], root)).toBeNull();
    }
  });
});

describe("fledge-run and fledge-lanes-run read the commands fledge.toml gives them", () => {
  let proj: string;
  beforeAll(() => {
    proj = tmp("must-ask-fledge-");
    writeFileSync(join(proj, "package.json"), JSON.stringify({ scripts: { ship: "netlify deploy --prod" } }));
    writeFileSync(
      join(proj, "fledge.toml"),
      [
        "[tasks]",
        'test = "bun test"',
        'lint = "bunx tsc --noEmit"',
        "",
        "[tasks.deploy]",
        'cmd = "flyctl deploy"',
        "",
        "[tasks.ship]",
        'cmd = "npm run ship"',
        "",
        "[tasks.all]",
        'cmd = "echo all"',
        'deps = ["test", "deploy"]',
        "",
        "[lanes.verify]",
        'steps = ["lint", "test"]',
        "",
        "[lanes.release]",
        'steps = ["test", { parallel = ["lint", "deploy"] }]',
        "",
        "[lanes.inline]",
        'steps = [{ run = "ssh box uptime" }]',
        "",
        "[lanes.tasked]",
        'steps = [{ task = "deploy" }]',
        "",
        "[lanes.odd]",
        'steps = [{ something = "x" }]',
      ].join("\n"),
    );
  });
  const run = (args: string[]) => asks(fledgeRunMustAsk({ args, cwd: proj, env: process.env }) as MustAskVerdict);
  const lane = (args: string[]) => asks(fledgeLanesRunMustAsk({ args, cwd: proj, env: process.env }) as MustAskVerdict);

  test("tasks", () => {
    expect(run(["test"])).toBeNull();
    expect(run(["deploy"])?.why).toMatch(/flyctl/);
    expect(run(["ship"])?.why).toMatch(/netlify/);
    expect(run(["all"])?.why).toMatch(/deploy/);
    expect(run(["nosuch"])?.why).toMatch(/can't read/);
    expect(run(["test", "--", "kubectl"])?.why).toMatch(/kubectl/);
  });

  test("lanes", () => {
    expect(lane(["verify"])).toBeNull();
    expect(lane(["release"])?.why).toMatch(/flyctl/);
    expect(lane(["inline"])?.why).toMatch(/ssh/);
    expect(lane(["tasked"])?.why).toMatch(/flyctl/);
    expect(lane(["odd"])?.why).toMatch(/can't read/);
    expect(lane(["nosuch"])?.why).toMatch(/can't read/);
  });

  test("Corvidinho's own verify lane runs with no ask", () => {
    const here = join(import.meta.dir, "..");
    expect(asks(fledgeLanesRunMustAsk({ args: ["verify"], cwd: here, env: process.env }) as MustAskVerdict)).toBeNull();
  });
});

describe("git-push: a push to the remote's default branch is a deploy (AUTONOMY-9)", () => {
  function repo(recordHead: boolean): string {
    const bare = tmp("must-ask-remote-");
    git(bare, "init", "-q", "--bare", "-b", "trunk");
    const dir = tmp("must-ask-repo-");
    git(dir, "init", "-q", "-b", "trunk");
    writeFileSync(join(dir, "a.txt"), "a\n");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "a");
    git(dir, "remote", "add", "origin", bare);
    git(dir, "push", "-q", "origin", "trunk");
    if (recordHead) git(dir, "remote", "set-head", "origin", "trunk");
    return dir;
  }

  test("recorded default: its branch asks, a feature branch does not", async () => {
    const dir = repo(true);
    const cmd = get("git-push")!;
    const v = asks(await mustAskVerdict(cmd, [], dir));
    expect(v?.why).toContain("origin's default branch");
    expect(v?.target).toBe("branch trunk → remote origin");
    git(dir, "checkout", "-q", "-b", "talk/feature");
    expect(await mustAskVerdict(cmd, [], dir)).toBeNull();
    expect(await mustAskVerdict(cmd, ["--remote", "origin"], dir)).toBeNull();
  });

  test("a usual default or deploy name asks even when another default is recorded (git-flow: develop is the default, main deploys)", async () => {
    const dir = repo(true);
    const cmd = get("git-push")!;
    git(dir, "checkout", "-q", "-b", "main");
    expect(asks(await mustAskVerdict(cmd, [], dir))?.why).toContain("usual default or deploy branch name");
    git(dir, "checkout", "-q", "-b", "gh-pages");
    expect(asks(await mustAskVerdict(cmd, [], dir))).not.toBeNull();
    git(dir, "checkout", "-q", "-b", "talk/feature");
    expect(await mustAskVerdict(cmd, [], dir)).toBeNull();
  });

  test("no recorded default: a usual default name asks, a feature branch does not", async () => {
    const dir = repo(false);
    const cmd = get("git-push")!;
    git(dir, "checkout", "-q", "-b", "main");
    expect(asks(await mustAskVerdict(cmd, [], dir))?.why).toContain("not recorded");
    git(dir, "checkout", "-q", "-b", "talk/feature");
    expect(await mustAskVerdict(cmd, [], dir)).toBeNull();
  });
});

describe("free-text table words", () => {
  test("distinct tool names ask; everyday words do not", () => {
    expect(prodTextWhy("run kubectl rollout restart")).toMatch(/kubectl/);
    expect(prodTextWhy("gh secret set TOKEN")).toMatch(/GitHub secrets/);
    expect(prodTextWhy("git push origin main")).toMatch(/git push/);
    expect(prodTextWhy("the host service will render and shutdown")).toBeNull();
    expect(prodTextWhy("docker-compose.yml")).toMatch(/docker-compose/);
    // Client libraries that reach another host, a cloud account or a secrets store.
    expect(prodTextWhy("import paramiko")).toMatch(/remote host/);
    expect(prodTextWhy('const { Client } = require("ssh2")')).toMatch(/remote host/);
    expect(prodTextWhy("python -m awscli s3 ls")).toMatch(/cloud account/);
    expect(prodTextWhy("import hvac")).toMatch(/secrets/);
    // Options between the tool and its subcommand.
    expect(prodTextWhy('execSync("git -C . push origin main")')).toMatch(/pushes a branch/);
    expect(prodTextWhy("gh workflow -R o/r run deploy.yml")).toMatch(/GitHub workflow/);
  });
});
