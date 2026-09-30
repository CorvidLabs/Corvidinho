/**
 * AUTONOMY-9/10/11 (#97) — the must-ask list, and the gate that holds a
 * must-ask call until the owner's OK.
 *
 * Policy ({@link MUST_ASK_POLICY}): spend over a cap asks (AUTONOMY-8; the
 * SAFE-8 spend guard's, not a command class); touching prod or deploys asks
 * (`prod`, AUTONOMY-9 — VPS, secrets, env, DNS; any contact, read-only looks
 * included, AUTONOMY-9.a; a push to a remote's default branch counts as a
 * deploy; updating itself to a tagged release does not); every channel post
 * it makes asks (`public`, AUTONOMY-10/10.a — dictated text and replies to
 * the owner included). Everything else inside its guardrails runs with no ask
 * (AUTONOMY-11).
 *
 * A command declares its class, or a classifier over its args, as
 * `PluginCommand.mustAsk` (src/plugins/types.ts). The class comes from that
 * code alone, never from what the model says about a call, so a prompt can't
 * reclassify an action. `runPlugin` (src/plugins/run.ts) calls
 * {@link mustAskGate} after the role gate and SAFE-1, before SAFE-5 and the
 * handler. For a must-ask call the gate records an Approve/Deny card on the
 * shared approvals store (src/approvals/store.ts): kind `mustask` for prod
 * (class destructive, so Approve also needs the SAFE-19 one-time code,
 * AUTONOMY-9.a) and kind `mustask-post` for a channel post (class plain) —
 * the engine binds one class per kind. The running Discord bridge DMs it to
 * the owner (src/discord/approval-cards.ts `mustAskApprovalKinds`); the run
 * waits in-process, says so once ({@link setMustAskNotifier}: a Text event in
 * `task run`, stderr otherwise), and runs the call only on an approval it
 * uses once. A deny or no answer in time is a no (SAFE-20); the same call the
 * owner denied is refused again without a new card; a delegate or council
 * worker is refused without a card; with no owner configured nothing can
 * approve, so it is refused at once. With no bridge running the card lapses
 * (no), and the refusal says why.
 */

import { resolve } from "node:path";
import type { Database } from "bun:sqlite";
import {
  ApprovalStore,
  approvalActionHash,
  type ApprovalClass,
  type ApprovalRequest,
} from "../approvals/store.ts";
import { auditContextFromEnv } from "../audit/log.ts";
import { delegateDepthFromEnv } from "../autonomous/delegate.ts";
import { getOwner } from "../identity/owner.ts";
import { scheduleRunnerId } from "../scheduler/store.ts";
import { openCorvidinhoDb } from "../store/db.ts";
import { scrubSecrets } from "../store/scrub.ts";
import type {
  MustAskAsk,
  MustAskClass,
  MustAskVerdict,
  PluginCommand,
  PluginHandlerResult,
} from "./types.ts";

// ------------------------------------------------------------------ policy

/** One row of the must-ask policy table (docs/discord.md, #97). */
export type MustAskPolicyRow = {
  criterion: string;
  what: string;
  /** Where the ask happens. */
  gate: string;
  /** Approve card kind and class (SAFE-18/19), when this gate raises it. */
  card?: { kind: string; class: ApprovalClass };
};

/**
 * The must-ask list. Only `prod` and `public` are command classes; `spend`
 * is listed so the table is whole (AUTONOMY-8 is asked by the SAFE-8 spend
 * guard, never by this gate).
 */
export const MUST_ASK_POLICY: Readonly<Record<"spend" | MustAskClass, MustAskPolicyRow>> = {
  spend: {
    criterion: "AUTONOMY-8",
    what: "a model call that would go over a spend cap",
    gate: "the SAFE-8 spend guard (src/agent/spend.ts), not a command class",
  },
  prod: {
    criterion: "AUTONOMY-9",
    what:
      "any contact with prod or deploys — the VPS, secrets, env, DNS, deploy tools and a push to a " +
      "remote's default branch — read-only looks included (AUTONOMY-9.a); updating itself to a tagged " +
      "release is not a deploy",
    gate: "runPlugin's must-ask gate",
    card: { kind: "mustask", class: "destructive" },
  },
  public: {
    criterion: "AUTONOMY-10",
    what:
      "every channel post it makes (discord-post-message), dictated text and replies to the owner " +
      "included (AUTONOMY-10.a); GitHub comments and social posts don't ask",
    gate: "runPlugin's must-ask gate",
    card: { kind: "mustask-post", class: "plain" },
  },
};

/** Card kind of the prod asks (class destructive: Approve + one-time code, AUTONOMY-9.a). */
export const MUST_ASK_PROD_KIND = "mustask";
/** Card kind of the channel-post asks (class plain). */
export const MUST_ASK_POST_KIND = "mustask-post";

/** The card kinds this gate raises, for the bridge's engine. */
export const MUST_ASK_CARD_KINDS: readonly { kind: string; class: ApprovalClass }[] = [
  { kind: MUST_ASK_PROD_KIND, class: "destructive" },
  { kind: MUST_ASK_POST_KIND, class: "plain" },
];

/** How long a must-ask card stays open; no answer by then is a no (SAFE-20). */
export const MUST_ASK_CARD_TTL_MS = 5 * 60 * 1000;
/** How often the waiting run reads the decision from the shared DB. */
export const MUST_ASK_POLL_MS = 1000;

/** What a no leaves undone, on the card (`nothingDone`). */
export const MUST_ASK_NOTHING_DONE = "nothing was done";

// ------------------------------------------------------------------ tables

const VPS_REMOTE = "contacts a remote host (VPS)";
const VPS_ROOT = "runs as root on the box (VPS)";
const VPS_SERVICES = "looks at or changes the box's services (VPS)";
const VPS_PACKAGES = "looks at or changes the box's system packages (VPS)";
const VPS_CONTAINERS = "talks to the box's container engine (VPS)";
const VPS_FIREWALL = "looks at or changes the box's firewall or cron (VPS)";
const SECRETS = "reads or writes secrets";
const CLOUD = "contacts a cloud account (prod infrastructure, secrets, env, DNS)";
const HOSTING = "deploys to, or reads or changes the env of, a hosting platform";
const CLUSTER = "contacts a cluster or provisions infrastructure (deploy)";
const DNS = "looks at or changes DNS";

function rows(names: readonly string[], why: string): [string, string][] {
  return names.map((n) => [n, why]);
}

/**
 * Commands that touch prod or deploys whatever their args (AUTONOMY-9.a:
 * read-only looks included).
 */
export const PROD_COMMANDS: ReadonlyMap<string, string> = new Map([
  ...rows(["ssh", "scp", "sftp", "mosh", "sshfs", "autossh", "sshpass"], VPS_REMOTE),
  ...rows(["sudo", "su", "doas", "pkexec", "runuser"], VPS_ROOT),
  ...rows(["systemctl", "service", "journalctl", "shutdown", "reboot", "halt", "poweroff"], VPS_SERVICES),
  ...rows(["apt", "apt-get", "aptitude", "dpkg", "snap", "yum", "dnf", "rpm", "pacman", "zypper", "apk"], VPS_PACKAGES),
  ...rows(["docker", "docker-compose", "podman", "podman-compose", "nerdctl", "ctr", "crictl"], VPS_CONTAINERS),
  ...rows(["crontab", "ufw", "iptables", "ip6tables", "nft", "firewall-cmd"], VPS_FIREWALL),
  ...rows(["vault", "op", "doppler", "infisical", "chamber", "sops", "bw"], SECRETS),
  ...rows(
    ["aws", "gcloud", "gsutil", "az", "doctl", "hcloud", "linode-cli", "vultr-cli", "scw", "oci", "ibmcloud"],
    CLOUD,
  ),
  ...rows(
    [
      "fly", "flyctl", "vercel", "netlify", "heroku", "railway", "render", "wrangler", "firebase",
      "dokku", "caprover", "kamal", "eb", "sam", "cdk", "serverless", "sls", "amplify", "surge",
    ],
    HOSTING,
  ),
  ...rows(
    [
      "kubectl", "helm", "k9s", "kubectx", "kubens", "terraform", "tofu", "terragrunt", "pulumi",
      "ansible", "ansible-playbook", "ansible-pull", "salt", "salt-ssh", "knife", "nomad",
    ],
    CLUSTER,
  ),
  ...rows(
    ["dig", "nslookup", "host", "drill", "kdig", "nsupdate", "resolvectl", "dnscontrol", "octodns-sync", "flarectl", "lexicon"],
    DNS,
  ),
]);

/**
 * Table words found in free text (a runner's code or argv, a task's or
 * recipe's command text). The same tools as {@link PROD_COMMANDS} minus the
 * names that are everyday words in code and prose (`host`, `op`, `service`,
 * `render`, `dig`, `shutdown` …), plus SDK names that reach a cloud account.
 */
const TEXT_WORDS: ReadonlyMap<string, string> = (() => {
  const everyday = new Set([
    "host", "op", "service", "su", "az", "fly", "eb", "sam", "cdk", "render", "salt", "snap", "apk",
    "rpm", "ctr", "bw", "surge", "amplify", "shutdown", "reboot", "halt", "poweroff", "dig", "drill",
    "railway", "nomad", "knife", "sls", "tofu", "lexicon", "chamber", "oci", "scw", "runuser",
  ]);
  const out = new Map<string, string>();
  for (const [name, why] of PROD_COMMANDS) if (!everyday.has(name)) out.set(name, why);
  out.set("aws-sdk", CLOUD);
  out.set("boto3", CLOUD);
  out.set("botocore", CLOUD);
  return out;
})();

/** Two-word table entries read in free text. */
const TEXT_PHRASES: readonly [RegExp, string][] = [
  [/\bgh\s+(secret|variable)\b/, "reads or writes GitHub secrets or variables"],
  [/\bgh\s+workflow\s+(run|enable|disable)\b/, "starts or changes a GitHub workflow (deploy)"],
  [/\bgh\s+run\s+rerun\b/, "re-runs a GitHub workflow (deploy)"],
  [/\bgh\s+release\s+(create|upload|edit|delete)\b/, "creates or changes a GitHub release (deploy)"],
  [/\bgit\s+push\b/, "pushes a branch (it can reach a deploy remote or the default branch)"],
  [/\b(fly|flyctl)\s+(deploy|secrets)\b/, HOSTING],
];

/** Why free text names a prod or deploy tool (the first hit), else null. */
export function prodTextWhy(text: string): string | null {
  for (const [re, why] of TEXT_PHRASES) {
    const m = re.exec(text);
    if (m) return `${why} (\`${m[0].replace(/\s+/g, " ")}\`)`;
  }
  for (const token of text.split(/[^A-Za-z0-9_-]+/)) {
    const why = TEXT_WORDS.get(token);
    if (why) return `${why} (\`${token}\`)`;
  }
  return null;
}

/** `gh` subcommands that touch secrets, env or deploys. */
function ghWhy(args: readonly string[]): string | null {
  const pos = args.filter((a) => !a.startsWith("-"));
  const [sub, action] = pos;
  if (sub === "secret" || sub === "variable") return "reads or writes GitHub secrets or variables";
  if (sub === "workflow" && (action === "run" || action === "enable" || action === "disable")) {
    return "starts or changes a GitHub workflow (deploy)";
  }
  if (sub === "run" && action === "rerun") return "re-runs a GitHub workflow (deploy)";
  if (sub === "release" && action !== undefined && ["create", "upload", "edit", "delete"].includes(action)) {
    return "creates or changes a GitHub release (deploy)";
  }
  if (sub === "api" && args.some((a) => /(^|\/)(secrets|variables|environments|deployments|dispatches|releases|pages)(\/|$|\?)/.test(a))) {
    return "calls the GitHub API on secrets, variables, environments, deployments or releases";
  }
  if (sub === "codespace" && action === "ssh") return VPS_REMOTE;
  return null;
}

/**
 * Why one command (name and args, as a shell or an exec wrapper runs it)
 * touches prod or deploys, else null. Resolving package scripts and recipes
 * is the shell classifier's (plugins/shell/must-ask.ts).
 */
export function prodCommandWhy(name: string, args: readonly string[]): string | null {
  const fixed = PROD_COMMANDS.get(name);
  if (fixed) return `\`${name}\` ${fixed}`;
  if (name === "rsync") {
    if (args.some((a) => /^-[A-Za-z]*e|^--rsh/.test(a) || /^[^/:]+:(?!\/\/)/.test(a) || /^rsync:\/\//.test(a))) {
      return `\`rsync\` ${VPS_REMOTE}`;
    }
    return null;
  }
  if (name === "gh") {
    const why = ghWhy(args);
    return why ? `\`gh\` ${why}` : null;
  }
  if (name === "git") {
    // A push from the shell can reach a deploy remote or the default branch;
    // the checked git-push tool tells them apart.
    const sub = args.find((a) => !a.startsWith("-"));
    if (sub === "push") return "`git push` pushes a branch from the shell (it can reach a deploy remote or the default branch; use git-push)";
    return null;
  }
  return null;
}

// ------------------------------------------------------------------ gate

/** Test seams: a short card lifetime and poll, and a hook right after a card is recorded. */
export type MustAskTestHooks = {
  ttlMs?: number;
  pollMs?: number;
  onRequest?: (req: ApprovalRequest, db: Database) => void;
};

let testHooks: MustAskTestHooks = {};

/** Tests only: set (or clear with `{}`) the gate's seams. Returns the previous ones. */
export function setMustAskTestHooks(hooks: MustAskTestHooks): MustAskTestHooks {
  const prev = testHooks;
  testHooks = hooks;
  return prev;
}

/** Where the "waiting for the owner's OK" line goes. */
export type MustAskNotifier = (line: string) => void;

let notifier: MustAskNotifier | null = null;

/**
 * Route the gate's one-line notes (`task run` emits them as Text events, so
 * `--output ndjson` and the bridges show them). Null ⇒ stderr. Returns the
 * previous notifier.
 */
export function setMustAskNotifier(fn: MustAskNotifier | null): MustAskNotifier | null {
  const prev = notifier;
  notifier = fn;
  return prev;
}

function note(line: string): void {
  try {
    if (notifier) notifier(line);
    else console.error(line);
  } catch {
    /* a note never changes the gate's outcome */
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function refusal(
  ask: MustAskAsk,
  outcome: "denied" | "expired" | "resent" | "worker" | "no-owner" | "unavailable" | "aborted",
  error: string,
  requestId?: string,
): PluginHandlerResult {
  const rule = MUST_ASK_POLICY[ask.class].criterion;
  return {
    ok: false,
    error,
    exitCode: outcome === "aborted" ? 130 : 2,
    data: {
      refused: true,
      rule,
      class: ask.class,
      outcome,
      why: ask.why,
      ...(requestId ? { request: requestId } : {}),
    },
  };
}

/** The verdict of `cmd.mustAsk` for this call; a classifier that throws asks (fail closed). */
export async function mustAskVerdict(
  cmd: Pick<PluginCommand, "name" | "mustAsk">,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<MustAskVerdict> {
  const policy = cmd.mustAsk;
  if (!policy) return null;
  if (typeof policy === "string") {
    return {
      ask: {
        class: policy,
        why: policy === "prod" ? "touches prod or deploys" : "posts in a channel",
        target: `in ${resolve(cwd)}`,
        text: JSON.stringify(args),
      },
    };
  }
  try {
    return await policy({ args: [...args], cwd, env });
  } catch (e) {
    return {
      ask: {
        class: "prod",
        why: `could not tell whether this call touches prod (${scrubSecrets(errText(e)).slice(0, 160)}), so it asks`,
        target: `in ${resolve(cwd)}`,
        text: JSON.stringify(args),
      },
    };
  }
}

type CardFields = {
  kind: string;
  class: ApprovalClass;
  title: string;
  action: string;
  target: string;
  amount: string;
  text?: string;
};

/** Longest `why` on a card's action line; the exact text or command goes out whole before the card. */
export const MUST_ASK_WHY_MAX = 300;

function shortLine(text: string, max: number): string {
  const one = text.replace(/\s*\n\s*/g, " ");
  return one.length <= max ? one : `${one.slice(0, max - 1)}…`;
}

function cardFields(cmdName: string, ask: MustAskAsk, surface: string): CardFields {
  const row = MUST_ASK_POLICY[ask.class];
  const card = row.card!;
  const amount =
    ask.class === "public"
      ? `1 message (${(ask.text ?? "").length} characters)`
      : "1 call (no money)";
  const title =
    ask.class === "public"
      ? `Channel post — waits for your OK (${row.criterion}) · from ${surface}`
      : `Prod / deploy — asks first (${row.criterion}) · from ${surface}`;
  return {
    kind: card.kind,
    class: card.class,
    title,
    action: `${cmdName}: ${shortLine(ask.why, MUST_ASK_WHY_MAX)}`,
    target: shortLine(ask.target, MUST_ASK_WHY_MAX),
    amount,
    ...(ask.text !== undefined ? { text: ask.text } : {}),
  };
}

/** The action hash `ApprovalStore.request` records for these fields (same scrub). */
function fieldsHash(f: CardFields): string {
  return approvalActionHash({
    kind: f.kind,
    class: f.class,
    action: scrubSecrets(f.action),
    target: scrubSecrets(f.target),
    amount: scrubSecrets(f.amount),
    ...(f.text !== undefined ? { text: scrubSecrets(f.text) } : {}),
  });
}

/** The owner's earlier deny of this exact call by this requester, if any. */
function deniedBefore(db: Database, kind: string, hash: string, requester: string): string | null {
  const row = db
    .query(
      `SELECT id FROM approval_requests
       WHERE kind = ? AND status = 'denied' AND action_hash = ? AND COALESCE(requester, '') = ?
       ORDER BY decided_at DESC LIMIT 1`,
    )
    .get(kind, hash, requester) as { id: string } | null;
  return row?.id ?? null;
}

export type MustAskGateInput = {
  cmd: Pick<PluginCommand, "name" | "mustAsk">;
  args: readonly string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
};

/**
 * AUTONOMY-9/10 gate for one call. Null ⇒ run it (not must-ask, or the
 * owner approved it and the approval was used). A result ⇒ return it and run
 * nothing (a refusal the command itself would give, or a no: SAFE-20).
 */
export async function mustAskGate(input: MustAskGateInput): Promise<PluginHandlerResult | null> {
  const env = input.env ?? process.env;
  const verdict = await mustAskVerdict(input.cmd, input.args, input.cwd, env);
  if (!verdict) return null;
  if ("refuse" in verdict) return verdict.refuse;
  const ask = verdict.ask;
  const rule = MUST_ASK_POLICY[ask.class].criterion;
  const what = `${input.cmd.name}: ${ask.why}`;

  // Delegate and council workers never raise the owner's card.
  if (delegateDepthFromEnv(env) > 0) {
    return refusal(
      ask,
      "worker",
      `refused (${rule}): ${what} — this needs the owner's OK on an Approve card, and a delegate or council worker can't ask for it, so nothing was done. Hand it back to the lead run, which asks.`,
    );
  }

  let owner;
  try {
    owner = await getOwner({ env });
  } catch {
    owner = null;
  }
  if (!owner) {
    return refusal(
      ask,
      "no-owner",
      `refused (${rule}): ${what} — this needs the owner's OK on an Approve card, but no owner is configured (IDENTITY-1), so nothing was done (SAFE-20).`,
    );
  }

  const { actor, surface } = auditContextFromEnv(env);
  const fields = cardFields(input.cmd.name, ask, surface);
  let db: Database;
  try {
    db = openCorvidinhoDb({ env });
  } catch (e) {
    return refusal(
      ask,
      "unavailable",
      `refused (${rule}): ${what} — the approvals store is unavailable (${scrubSecrets(errText(e))}), so no card could be raised and nothing was done.`,
    );
  }
  try {
    const earlier = deniedBefore(db, fields.kind, fieldsHash(fields), actor);
    if (earlier) {
      return refusal(
        ask,
        "resent",
        `refused (${rule}): ${what} — the owner already denied this exact call on Approve card ${earlier}, so no new card is raised and nothing was done (SAFE-20). Change the call, or leave it to the owner.`,
        earlier,
      );
    }
    const store = new ApprovalStore({ db });
    const ttlMs = testHooks.ttlMs ?? MUST_ASK_CARD_TTL_MS;
    const req = store.request({
      kind: fields.kind,
      class: fields.class,
      title: fields.title,
      action: fields.action,
      target: fields.target,
      amount: fields.amount,
      ...(fields.text !== undefined ? { text: fields.text, textLabel: "text" as const } : {}),
      requester: actor,
      waiter: scheduleRunnerId(),
      ttlMs,
    });
    const code = fields.class === "plain" ? "" : " with the one-time code";
    note(
      `[operator] ${rule}: waiting for the owner's OK on an Approve card${code} (${what}; request ${req.id}; no answer by ${new Date(req.expiresAt).toISOString()} means no).`,
    );
    testHooks.onRequest?.(req, db);
    const decided = await store.waitForDecision(req.id, {
      pollMs: testHooks.pollMs ?? MUST_ASK_POLL_MS,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (decided?.status === "approved" && store.consume(req.id)) {
      note(`[operator] ${rule}: the owner approved request ${req.id}; running ${input.cmd.name}.`);
      return null;
    }
    if (decided?.status === "denied") {
      return refusal(
        ask,
        "denied",
        `refused (${rule}): ${what} — the owner denied it on Approve card ${req.id}, so nothing was done (SAFE-20). Don't send the same call again; tell the requester.`,
        req.id,
      );
    }
    if (input.signal?.aborted) {
      return refusal(
        ask,
        "aborted",
        `stopped (${rule}): the run was interrupted while waiting for the owner's OK on Approve card ${req.id}, so nothing was done.`,
        req.id,
      );
    }
    return refusal(
      ask,
      "expired",
      `refused (${rule}): ${what} — no answer on the owner's Approve card ${req.id} in time, so nothing was done (SAFE-20: no answer means no). The running Discord bridge DMs the card to the owner; with no bridge running it lapses.`,
      req.id,
    );
  } catch (e) {
    return refusal(
      ask,
      "unavailable",
      `refused (${rule}): ${what} — the Approve card could not be raised or read (${scrubSecrets(errText(e))}), so nothing was done.`,
    );
  } finally {
    try {
      db.close();
    } catch {
      /* already closed */
    }
  }
}
