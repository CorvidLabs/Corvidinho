/**
 * /admin — runtime Discord allowlist admin (ADMIN-1..4, issue #43).
 *
 *   /admin users add user:@someone        ADMIN-1 approve/add a user
 *   /admin channels add channel:<search>  ADMIN-2 add a channel (STRING+autocomplete)
 *   /admin channels remove channel:<…>    ADMIN-2 remove a channel (STRING+autocomplete)
 *   /admin config show                    ADMIN-3 show knobs (read-only view)
 *   /admin people list                    IDENTITY-13 declared people (read-only view)
 *   /admin people add person:<id> [display:<name>] [timezone:<IANA zone>]
 *                             [hours:<HH:MM-HH:MM>]
 *                                         (timezone / hours: when that person's
 *                                         daily briefing arrives, COS-2.a)
 *   /admin people link|unlink person:<id> [discord:@x] [github:<login>]
 *                             [github_id:<n>] [nickname:<text>]
 *                                         (link github: looks the login's
 *                                         numeric user id up once and stores
 *                                         it — GitHub matches on that id
 *                                         only, IDENTITY-7.a)
 *   /admin people remove person:<id>      ADMIN-3.a add, change, remove people
 *                                         and their links (IDENTITY-6: only
 *                                         here or in the file on the VM)
 *   /admin people role person:<id> role:<team|community>
 *                                         ADMIN-3.b set a declared person's one
 *                                         role (IDENTITY-8; the owner role is
 *                                         [owner] / env only)
 *   /admin people forget person:<id>      MEMORY-ACL-6.a start a forget for a
 *                                         declared person: the same forget
 *                                         request and DM Approve/Deny card as
 *                                         their own ask; nothing is forgotten
 *                                         until the owner approves on the card
 *   /admin deny add|remove                ADMIN-3.c (part 1) exactly one of
 *        channel:<…> | user:@x | role:@r  [discord].deny_channels|deny_users|
 *        | github_org:<org>               deny_roles, [github].deny_orgs|
 *        | github_repo:<owner/repo>       deny_repos|deny_users
 *        | github_user:<login or id>
 *   /admin github add|remove              ADMIN-3.c (part 1) exactly one of
 *        org:<org> | repo:<owner/repo>    [github].orgs|repos (the GitHub repo
 *                                         allow lists; [github].users stays
 *                                         file / env, shown read-only)
 *
 * Owner-only (IDENTITY-2): dispatch enforces minPermission ADMIN and this
 * handler re-checks ADMIN itself before anything else (ADMIN-4 / DISCORD-7);
 * no owner ⇒ nobody passes. Writes go to the allowlist file the bridge already
 * reads and to the live allowlist in place (no restart). Env values are
 * read-only at runtime. Empty stays deny-all: deny lists still win, the last
 * live (non-denied) channel cannot be removed or denied, and the owner can
 * never deny themselves (their Discord id, a role they hold here, or their
 * GitHub login / id). Mutations leave SAFE-5 audit rows
 * (intent first; fail closed when the trail is unavailable). Replies are
 * ephemeral and never contain tokens or secrets.
 */

import { argsDigest, type AuditEntryInput, type AuditOutcome } from "../../audit/index.ts";
import { formatOwnerStatus } from "../../identity/owner.ts";
import {
  encodeForgetRequester,
  FORGET_REQUEST_TTL_MS,
  memorySubjectForPerson,
  subjectLabel,
} from "../../memory/index.ts";
import {
  DEFAULT_PERSON_ROLE,
  loadDeclaredPeople,
  normalizeGithubId,
  OWNER_PERSON_ID,
  validGithubLogin,
  type DeclaredPerson,
  type PeopleDirectory,
  type PersonLinkKind,
  type PersonRole,
} from "../../identity/people.ts";
import {
  createGithubUserLookup,
  type GithubUserLookupResult,
} from "../../identity/github-user.ts";
import {
  commitPeopleChange,
  formatPersonLink,
  planPeopleChange,
  type PeopleAdminOp,
  type PeopleAdminPlan,
} from "../admin-people.ts";
import { hasGithubRepoAllowEntries } from "../../allowlist/github.ts";
import {
  ADMIN_LIST_ENV,
  ADMIN_LISTS,
  commitAdminListChange,
  envAdminList,
  liveAdminList,
  normalizeAdminListId,
  planAdminListChange,
  readAdminFileView,
  resolveAdminAllowlistPath,
  type AdminListKey,
  type AdminListOp,
  type AdminListPlan,
} from "../admin-allowlist.ts";
import { resolveChannelOption } from "../channel-autocomplete.ts";
import { PermissionLevel, resolvePermissionLevel } from "../permissions.ts";
import type { SlashContext, SlashInteraction } from "../slash-types.ts";
import { NOT_AUTHORIZED } from "../types.ts";

/** Audit surface for /admin rows (SAFE-5). */
export const ADMIN_AUDIT_SURFACE = "discord:admin";

/** Max ids listed per key in `/admin config show` before "+N more". */
const SHOW_MAX_IDS = 10;

type Mutation = {
  action: string;
  key: AdminListKey;
  op: AdminListOp;
  option: "user" | "channel";
  usage: string;
};

/** One list option of `/admin deny|github add|remove` and the list it edits. */
type ListOption = { option: string; key: AdminListKey; hint: string };

/**
 * ADMIN-3.c (part 1) — `/admin deny add|remove` and `/admin github
 * add|remove` take exactly one of their options; each names one list.
 */
type ListRoute = {
  action: string;
  op: AdminListOp;
  options: readonly ListOption[];
  usage: string;
};

const DENY_OPTIONS: readonly ListOption[] = [
  { option: "channel", key: "deny_channels", hint: "a channel (name or id)" },
  { option: "user", key: "deny_users", hint: "a Discord user" },
  { option: "role", key: "deny_roles", hint: "a Discord role" },
  { option: "github_org", key: "github.deny_orgs", hint: "a GitHub org login" },
  { option: "github_repo", key: "github.deny_repos", hint: "OWNER/REPO or OWNER/*" },
  { option: "github_user", key: "github.deny_users", hint: "a GitHub login or numeric user id" },
];

const GITHUB_OPTIONS: readonly ListOption[] = [
  { option: "org", key: "github.orgs", hint: "a GitHub org login" },
  { option: "repo", key: "github.repos", hint: "OWNER/REPO or OWNER/*" },
];

const DENY_USAGE = (op: AdminListOp) =>
  `usage: /admin deny ${op} with exactly one of channel:<name or id> user:@someone role:@role github_org:<org> github_repo:<owner/repo or owner/*> github_user:<login or numeric id>`;
const GITHUB_USAGE = (op: AdminListOp) =>
  `usage: /admin github ${op} with exactly one of org:<org> repo:<owner/repo or owner/*> — the GitHub repo allow lists ([github].users stays in the file / env)`;

const LIST_ROUTES: Record<string, ListRoute> = {
  "deny add": { action: "admin-deny-add", op: "add", options: DENY_OPTIONS, usage: DENY_USAGE("add") },
  "deny remove": { action: "admin-deny-remove", op: "remove", options: DENY_OPTIONS, usage: DENY_USAGE("remove") },
  "github add": { action: "admin-github-add", op: "add", options: GITHUB_OPTIONS, usage: GITHUB_USAGE("add") },
  "github remove": {
    action: "admin-github-remove",
    op: "remove",
    options: GITHUB_OPTIONS,
    usage: GITHUB_USAGE("remove"),
  },
};

/** One validated list change, ready to plan (shared by every list route). */
type ListChange = {
  action: string;
  key: AdminListKey;
  op: AdminListOp;
  id: string;
  /** Audit args: route, option and id (digest only). */
  args: string[];
  /** The slash command, for replies (e.g. `/admin deny add`). */
  command: string;
};

const MUTATIONS: Record<string, Mutation> = {
  "users add": {
    action: "admin-users-add",
    key: "users",
    op: "add",
    option: "user",
    usage: "usage: /admin users add user:@someone",
  },
  "channels add": {
    action: "admin-channels-add",
    key: "channels",
    op: "add",
    option: "channel",
    usage: "usage: /admin channels add channel:<name or id> (pick from autocomplete, or paste a snowflake)",
  },
  "channels remove": {
    action: "admin-channels-remove",
    key: "channels",
    op: "remove",
    option: "channel",
    usage: "usage: /admin channels remove channel:<name or id> (pick from autocomplete, or paste a snowflake)",
  },
};

/** ADMIN-3.a — `/admin people …` mutations (audited like MUTATIONS). */
const PEOPLE_OPS: Record<string, PeopleAdminOp> = {
  "people add": "add",
  "people link": "link",
  "people unlink": "unlink",
  "people remove": "remove",
  "people role": "role",
};

const PEOPLE_USAGE: Record<PeopleAdminOp, string> = {
  add: "usage: /admin people add person:<id> [display:<name>] [timezone:<IANA zone, e.g. Europe/Oslo>] [hours:<HH:MM-HH:MM>] — id is lowercase letters, digits, - or _ (e.g. tofu)",
  link: "usage: /admin people link person:<id> and one or more of discord:@user github:<login> github_id:<number> nickname:<text>",
  unlink: "usage: /admin people unlink person:<id> and one or more of discord:@user github:<login> github_id:<number> nickname:<text>",
  remove: "usage: /admin people remove person:<id>",
  role: "usage: /admin people role person:<id> role:<team|community> — the owner role is [owner] / env only (IDENTITY-1)",
};

const LINK_OPTIONS: readonly PersonLinkKind[] = ["discord", "github", "github_id", "nickname"];

/** MEMORY-ACL-6.a — `/admin people forget` (audited like the people ops). */
const PEOPLE_FORGET_ROUTE = "people forget";
export const PEOPLE_FORGET_ACTION = "admin-people-forget";
const PEOPLE_FORGET_USAGE =
  "usage: /admin people forget person:<id> — a declared person (see /admin people list); you then approve or deny it on the card I DM you";

function isAdmin(ctx: SlashContext, interaction: SlashInteraction): boolean {
  return (
    resolvePermissionLevel({
      userId: interaction.userId,
      roleIds: interaction.roleIds,
      mutedUsers: ctx.mutedUsers,
      allowlist: ctx.allowlist,
      adminUserIds: ctx.adminUserIds,
      adminRoleIds: ctx.adminRoleIds,
      owner: ctx.owner,
    }) >= PermissionLevel.ADMIN
  );
}

/** How a reply names one entry: a Discord mention, else the GitHub entry in code. */
function mention(key: AdminListKey, id: string): string {
  if (key === "users" || key === "deny_users") return `<@${id}>`;
  if (key === "channels" || key === "deny_channels") return `<#${id}>`;
  if (key === "deny_roles") return `<@&${id}>`;
  return `\`${id}\``;
}

/** `[section].key` of a list (canonical spelling). */
function listName(key: AdminListKey): string {
  const spec = ADMIN_LISTS[key];
  return `[${spec.section}].${spec.key}`;
}

function auditEntry(
  interaction: SlashInteraction,
  action: string,
  outcome: AuditOutcome,
  args: readonly string[],
): AuditEntryInput {
  return {
    action,
    actor: interaction.userId,
    surface: ADMIN_AUDIT_SURFACE,
    argsDigest: argsDigest(args),
    outcome,
  };
}

/** Best-effort audit (denials / outcomes after the fact). */
function auditSoft(ctx: SlashContext, entry: AuditEntryInput): number | undefined {
  if (!ctx.recordAudit) return undefined;
  try {
    return ctx.recordAudit(entry).seq;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[audit] could not record ${entry.outcome} for ${entry.action}: ${msg}`);
    return undefined;
  }
}

export async function handleAdminCommand(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const group = interaction.subcommandGroup ?? "";
  const sub = interaction.subcommand ?? "";
  const route = `${group} ${sub}`.trim();

  // ADMIN-4 / DISCORD-7: handler-time re-check; registration and the
  // dispatcher floor are never enough. No owner ⇒ nobody is ADMIN.
  if (!isAdmin(ctx, interaction)) {
    const m = MUTATIONS[route] ?? LIST_ROUTES[route];
    const pop = PEOPLE_OPS[route];
    if (m) auditSoft(ctx, auditEntry(interaction, m.action, "denied", [group, sub]));
    else if (pop) auditSoft(ctx, auditEntry(interaction, `admin-people-${pop}`, "denied", [group, sub]));
    else if (route === PEOPLE_FORGET_ROUTE) {
      auditSoft(ctx, auditEntry(interaction, PEOPLE_FORGET_ACTION, "denied", [group, sub]));
    }
    await interaction.reply({ content: NOT_AUTHORIZED, ephemeral: true });
    return;
  }

  if (route === "config show") {
    await interaction.reply({ content: formatConfigShow(ctx), ephemeral: true });
    return;
  }

  if (route === "people list") {
    await interaction.reply({ content: formatPeopleList(ctx), ephemeral: true });
    return;
  }

  const pop = PEOPLE_OPS[route];
  if (pop) {
    await handlePeopleMutation(ctx, interaction, pop, [group, sub]);
    return;
  }

  if (route === PEOPLE_FORGET_ROUTE) {
    await handlePeopleForget(ctx, interaction, [group, sub]);
    return;
  }

  const lr = LIST_ROUTES[route];
  if (lr) {
    await handleListRoute(ctx, interaction, lr, [group, sub]);
    return;
  }

  const m = MUTATIONS[route];
  if (!m) {
    await interaction.reply({
      content: `Unknown /admin subcommand: ${route || "(none)"}`,
      ephemeral: true,
    });
    return;
  }
  await handleMutation(ctx, interaction, m, [group, sub]);
}

/** The entry a list option holds (a channel option also takes `<#id>` / a picked name), or null. */
function optionEntry(key: AdminListKey, raw: unknown): string | null {
  const text = typeof raw === "string" ? raw : "";
  if (key === "channels" || key === "deny_channels") {
    const resolved = resolveChannelOption(text);
    return resolved.ok ? normalizeAdminListId(key, resolved.id) : null;
  }
  return normalizeAdminListId(key, text);
}

async function handleMutation(
  ctx: SlashContext,
  interaction: SlashInteraction,
  m: Mutation,
  route: string[],
): Promise<void> {
  const id = optionEntry(m.key, interaction.options[m.option]);
  if (id === null) {
    await interaction.reply({ content: m.usage, ephemeral: true });
    return;
  }
  await applyListChange(ctx, interaction, {
    action: m.action,
    key: m.key,
    op: m.op,
    id,
    args: [...route, id],
    command: `/admin ${route.join(" ")}`,
  });
}

/**
 * ADMIN-3.c (part 1) — `/admin deny add|remove` and `/admin github
 * add|remove`: exactly one option, validated for its list, then the same
 * plan → audit intent → commit path as the ADMIN-1/2 mutations.
 */
async function handleListRoute(
  ctx: SlashContext,
  interaction: SlashInteraction,
  r: ListRoute,
  route: string[],
): Promise<void> {
  const given = r.options.filter((o) => {
    const v = interaction.options[o.option];
    return typeof v === "string" && v.trim() !== "";
  });
  if (given.length !== 1) {
    await interaction.reply({ content: r.usage, ephemeral: true });
    return;
  }
  const opt = given[0]!;
  const id = optionEntry(opt.key, interaction.options[opt.option]);
  if (id === null) {
    await interaction.reply({
      content: `Refused: ${opt.option} must be ${opt.hint}. Nothing changed.\n${r.usage}`,
      ephemeral: true,
    });
    return;
  }
  await applyListChange(ctx, interaction, {
    action: r.action,
    key: opt.key,
    op: r.op,
    id,
    args: [...route, opt.option, id],
    command: `/admin ${route.join(" ")}`,
  });
}

/** The owner's GitHub login and numeric ids: `[owner]` plus the owner's declared person. */
function ownerGithubIds(ctx: SlashContext): Set<string> {
  const out = new Set<string>();
  const add = (v: string | undefined) => {
    const t = v?.trim().toLowerCase();
    if (t) out.add(t);
  };
  add(ctx.owner?.githubLogin);
  add(ctx.owner?.githubId);
  try {
    const dir = loadDeclaredPeople({ allowlist: ctx.allowlist, owner: ctx.owner });
    const me = dir.people.find((p) => p.id === dir.ownerPersonId);
    for (const l of me?.githubLogins ?? []) add(l);
    for (const i of me?.githubIds ?? []) add(i);
  } catch {
    /* [owner] alone still guards */
  }
  return out;
}

/**
 * Refusals known before the file is read: deny always wins over an allow
 * add, and a deny add that would lock the owner out (their Discord id, a
 * role they hold here — @everyone included —, the last live non-denied
 * channel, or their GitHub login / id) is never made.
 */
function preRefusal(
  ctx: SlashContext,
  interaction: SlashInteraction,
  c: ListChange,
): string | null {
  const d = ctx.allowlist.discord;
  const g = ctx.allowlist.github;
  const target = mention(c.key, c.id);
  if (c.op === "add") {
    // Deny always wins — adding to an allow list would change nothing.
    if (c.key === "users" || c.key === "channels") {
      const denyList = c.key === "users" ? d.denyUsers : d.denyChannels;
      if (denyList.includes(c.id)) {
        return `Refused: ${target} is on deny_${c.key} and deny always wins. Remove it from the deny list first (/admin deny remove, or the VM file / env), then retry.`;
      }
    }
    if (c.key === "github.orgs" && g.denyOrgs.includes(c.id)) {
      return `Refused: ${target} is on [github].deny_orgs and deny always wins. Remove it first (/admin deny remove github_org:${c.id}, or the VM file / env), then retry.`;
    }
    if (c.key === "github.orgs" && g.denyRepos.includes(`${c.id}/*`)) {
      return `Refused: every repo of ${target} is on [github].deny_repos (\`${c.id}/*\`) and deny always wins. Remove it first (/admin deny remove github_repo:${c.id}/*, or the VM file / env), then retry.`;
    }
    if (c.key === "github.repos") {
      const [owner] = c.id.split("/");
      const denied =
        g.denyOrgs.includes(owner!) ||
        g.denyRepos.some((p) => p === c.id || p === `${owner}/*`);
      if (denied) {
        return `Refused: ${target} is covered by [github].deny_orgs / deny_repos and deny always wins. Remove that deny entry first (/admin deny remove, or the VM file / env), then retry.`;
      }
    }
    const lockout = "you would lock yourself out";
    if (c.key === "deny_users" && (c.id === interaction.userId.trim().toLowerCase() || c.id === ctx.owner?.discordId)) {
      return `Refused: ${target} is you (the owner) — ${lockout} of every message and slash, /admin included. Nothing changed.`;
    }
    if (c.key === "deny_roles") {
      const mine = (interaction.roleIds ?? []).map((r) => r.trim().toLowerCase());
      if (mine.includes(c.id) || c.id === interaction.guildId?.trim().toLowerCase()) {
        return `Refused: you hold ${target} here (every member holds @everyone) — ${lockout} of every message and slash, /admin included. Nothing changed.`;
      }
    }
    if (c.key === "deny_channels" && d.channels.length > 0) {
      const after = new Set([...d.denyChannels, c.id]);
      if (d.channels.every((ch) => after.has(ch))) {
        return `Refused: denying ${target} would leave no allowlisted channel that is not denied — every message and slash (including /admin) would be refused. Add another channel first. Nothing changed.`;
      }
    }
    if (c.key === "github.deny_users" && ownerGithubIds(ctx).has(c.id)) {
      return `Refused: ${target} is your GitHub login or id (the owner) — ${lockout} on GitHub (WATCH would refuse you). Nothing changed.`;
    }
  }
  return null;
}

/**
 * Plan, audit intent, commit, audit outcome — all synchronous, so two admin
 * commands never interleave a read-modify-write. Shared by every list route.
 */
async function applyListChange(
  ctx: SlashContext,
  interaction: SlashInteraction,
  c: ListChange,
): Promise<void> {
  const env = ctx.env ?? process.env;
  const args = c.args;

  const pre = preRefusal(ctx, interaction, c);
  if (pre) {
    auditSoft(ctx, auditEntry(interaction, c.action, "denied", args));
    await interaction.reply({ content: pre, ephemeral: true });
    return;
  }

  const planned = planAdminListChange({
    allowlist: ctx.allowlist,
    env,
    key: c.key,
    op: c.op,
    id: c.id,
  });
  if (!planned.ok) {
    auditSoft(ctx, auditEntry(interaction, c.action, "error", args));
    await interaction.reply({
      content: `Refused: ${planned.error}. File: \`${planned.path}\` — nothing changed.`,
      ephemeral: true,
    });
    return;
  }
  const plan = planned.plan;

  const refusal = refusalFor(plan, ctx.allowlist.discord.denyChannels);
  if (refusal) {
    auditSoft(ctx, auditEntry(interaction, c.action, "denied", args));
    await interaction.reply({ content: refusal, ephemeral: true });
    return;
  }

  if (!plan.fileChanged && !plan.liveChanged) {
    await interaction.reply({ content: formatNoChange(plan), ephemeral: true });
    return;
  }

  // SAFE-5: the intent is on the tamper-evident trail before the change.
  // No trail wired (bridge without a DB) fails closed exactly like a trail
  // that throws: an unaudited allowlist write is never made.
  let startedSeq: number;
  try {
    if (!ctx.recordAudit) throw new Error("no audit database is wired to this bridge");
    startedSeq = ctx.recordAudit(auditEntry(interaction, c.action, "started", args)).seq;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await interaction.reply({
      content: `Refused: audit log unavailable (SAFE-5): ${msg}. Nothing changed.`,
      ephemeral: true,
    });
    return;
  }

  try {
    commitAdminListChange(plan, {
      allowlist: ctx.allowlist,
      channelIds: ctx.channelIds,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    auditSoft(ctx, auditEntry(interaction, c.action, "error", args));
    await interaction.reply({
      content: `Error: could not write \`${plan.path}\`: ${msg}. Live allowlist unchanged.`,
      ephemeral: true,
    });
    return;
  }
  const okSeq = auditSoft(ctx, auditEntry(interaction, c.action, "ok", args));
  await interaction.reply({
    content: formatApplied(ctx, interaction, plan, c.command, startedSeq, okSeq),
    ephemeral: true,
  });
}

/**
 * ADMIN-3.a / IDENTITY-6 — add, change or remove a declared person or its
 * links. Same shape as the list mutations: plan, audit intent (fail closed),
 * commit, audit outcome, all synchronous. The only writer of people.
 */
async function handlePeopleMutation(
  ctx: SlashContext,
  interaction: SlashInteraction,
  op: PeopleAdminOp,
  route: string[],
): Promise<void> {
  const str = (k: string): string | undefined => {
    const v = interaction.options[k];
    return typeof v === "string" && v.trim() ? v : undefined;
  };
  const action = `admin-people-${op}`;
  const person = str("person")?.trim() ?? "";
  if (!person) {
    await interaction.reply({ content: PEOPLE_USAGE[op], ephemeral: true });
    return;
  }
  const display = op === "add" ? str("display") : undefined;
  // COS-2.a: the briefing time zone and working hours (`add` only).
  const timezone = op === "add" ? str("timezone")?.trim() : undefined;
  const hours = op === "add" ? str("hours")?.trim() : undefined;
  const role = op === "role" ? str("role")?.trim() : undefined;
  if (op === "role" && !role) {
    await interaction.reply({ content: PEOPLE_USAGE[op], ephemeral: true });
    return;
  }
  const links =
    op === "link" || op === "unlink"
      ? LINK_OPTIONS.flatMap((kind) => {
          const value = str(kind);
          return value === undefined ? [] : [{ kind, value: value.trim() }];
        })
      : [];
  if ((op === "link" || op === "unlink") && links.length === 0) {
    await interaction.reply({ content: PEOPLE_USAGE[op], ephemeral: true });
    return;
  }
  const argsNow = (): string[] => [
    ...route,
    person.toLowerCase(),
    ...(display !== undefined ? [`display:${display}`] : []),
    ...(timezone !== undefined ? [`timezone:${timezone}`] : []),
    ...(hours !== undefined ? [`hours:${hours}`] : []),
    ...links.map((l) => `${l.kind}:${l.value}`),
    ...(role !== undefined ? [`role:${role.toLowerCase()}`] : []),
  ];
  const planNow = (): ReturnType<typeof planPeopleChange> =>
    planPeopleChange({
      allowlist: ctx.allowlist,
      owner: ctx.owner,
      env: ctx.env ?? process.env,
      request: {
        op,
        personId: person,
        display,
        links,
        ...(timezone !== undefined ? { timezone } : {}),
        ...(hours !== undefined ? { hours } : {}),
        ...(role !== undefined ? { role } : {}),
      },
    });

  // Plan, audit intent, commit: all synchronous, so no interleaving.
  let planned = planNow();

  // IDENTITY-7.a: on GitHub people match only by numeric user id, so `link
  // github:<login>` looks the login's id up once, now, and links it too (also
  // for a login that is already linked). The request is planned first, so a
  // refusal keeps its own reason; a failed lookup links nothing. The final
  // plan and the commit stay synchronous.
  const githubLogin = op === "link" ? validGithubLogin(links.find((l) => l.kind === "github")?.value) : undefined;
  if (planned.ok && githubLogin) {
    await interaction.deferReply?.({ ephemeral: true });
    const lookup = ctx.lookupGithubUser ?? createGithubUserLookup(ctx.env ?? process.env);
    let found: GithubUserLookupResult;
    try {
      found = await lookup(githubLogin);
    } catch {
      found = { ok: false, error: "GitHub lookup failed" };
    }
    if (!found.ok || found.login !== githubLogin) {
      const why = found.ok ? `GitHub answered for @${found.login}` : found.error;
      auditSoft(ctx, auditEntry(interaction, action, "error", argsNow()));
      await interaction.reply({
        content: `Refused: could not look up the GitHub numeric user id of @${githubLogin} (${why}). On GitHub people match only by that id (IDENTITY-7.a). Nothing changed — try again, or link github_id:<number>.`,
        ephemeral: true,
      });
      return;
    }
    if (!links.some((l) => l.kind === "github_id" && normalizeGithubId(l.value) === found.id)) {
      links.push({ kind: "github_id", value: found.id });
    }
    planned = planNow();
  }
  const args = argsNow();
  if (!planned.ok) {
    auditSoft(ctx, auditEntry(interaction, action, planned.kind === "refused" ? "denied" : "error", args));
    await interaction.reply({
      content:
        planned.kind === "refused"
          ? `Refused: ${planned.error}. Nothing changed.`
          : `Refused: ${planned.error}. File: \`${planned.path}\` — nothing changed.`,
      ephemeral: true,
    });
    return;
  }
  const plan = planned.plan;
  if (!plan.fileChanged) {
    await interaction.reply({ content: formatPeopleNoChange(plan), ephemeral: true });
    return;
  }

  // SAFE-5: intent on the tamper-evident trail before the write; no trail
  // (or a trail that throws) fails closed — an unaudited change is never made.
  let startedSeq: number;
  try {
    if (!ctx.recordAudit) throw new Error("no audit database is wired to this bridge");
    startedSeq = ctx.recordAudit(auditEntry(interaction, action, "started", args)).seq;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await interaction.reply({
      content: `Refused: audit log unavailable (SAFE-5): ${msg}. Nothing changed.`,
      ephemeral: true,
    });
    return;
  }
  try {
    commitPeopleChange(plan);
    // Surfaces read people from the file this process loaded; a bridge that
    // started without one reads the file this change wrote from now on.
    if (!ctx.allowlist.sourcePath) ctx.allowlist.sourcePath = plan.path;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    auditSoft(ctx, auditEntry(interaction, action, "error", args));
    await interaction.reply({
      content: `Error: could not write \`${plan.path}\`: ${msg}. Declared people unchanged.`,
      ephemeral: true,
    });
    return;
  }
  const okSeq = auditSoft(ctx, auditEntry(interaction, action, "ok", args));
  await interaction.reply({ content: formatPeopleApplied(plan, startedSeq, okSeq), ephemeral: true });
}

/**
 * MEMORY-ACL-6.a — the owner starts a forget for any declared person: the
 * same `forget_requests` row and DM Approve/Deny card as the person's own
 * ask (src/discord/forget-card.ts); nothing is forgotten here. Audited like
 * the other people ops: `started` first (no trail ⇒ refused), then `ok`;
 * an undeclared id is refused (`denied`). One open ask per person: an ask
 * already pending is reused. The card goes out right after the reply.
 */
async function handlePeopleForget(
  ctx: SlashContext,
  interaction: SlashInteraction,
  route: string[],
): Promise<void> {
  const raw = interaction.options.person;
  const personId = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!personId) {
    await interaction.reply({ content: PEOPLE_FORGET_USAGE, ephemeral: true });
    return;
  }
  const args = [...route, personId];
  // Exactly who chat, slash and WATCH see: the file this process loaded.
  const dir = loadDeclaredPeople({ allowlist: ctx.allowlist, owner: ctx.owner });
  const subject = memorySubjectForPerson(dir, personId);
  if (!subject) {
    auditSoft(ctx, auditEntry(interaction, PEOPLE_FORGET_ACTION, "denied", args));
    await interaction.reply({
      content: `Refused: "${personId}" is not a declared person (see /admin people list), so there is nothing to forget from here. Nothing was asked.`,
      ephemeral: true,
    });
    return;
  }
  if (!ctx.requestForget) {
    await interaction.reply({
      content: "Refused: no database is wired to this bridge, so a forget request cannot be recorded. Nothing was asked.",
      ephemeral: true,
    });
    return;
  }

  // SAFE-5: the intent is on the trail before the request; fail closed.
  let startedSeq: number;
  try {
    if (!ctx.recordAudit) throw new Error("no audit database is wired to this bridge");
    startedSeq = ctx.recordAudit(auditEntry(interaction, PEOPLE_FORGET_ACTION, "started", args)).seq;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await interaction.reply({
      content: `Refused: audit log unavailable (SAFE-5): ${msg}. Nothing was asked.`,
      ephemeral: true,
    });
    return;
  }
  let made: ReturnType<NonNullable<SlashContext["requestForget"]>>;
  try {
    made = ctx.requestForget({
      subject,
      requesterUserId: encodeForgetRequester({ via: "admin", discordId: interaction.userId }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    auditSoft(ctx, auditEntry(interaction, PEOPLE_FORGET_ACTION, "error", args));
    await interaction.reply({
      content: `Error: could not record the forget request: ${msg}. Nothing was asked.`,
      ephemeral: true,
    });
    return;
  }
  const okSeq = auditSoft(ctx, auditEntry(interaction, PEOPLE_FORGET_ACTION, "ok", args));
  const who = subjectLabel(subject);
  const r = made.request;
  const lines = made.created
    ? [
        `✅ /admin people forget: asked to forget ${who} (request ${r.id}). Approve or Deny it on the card I DM you — nothing is forgotten until you approve, and no answer within ${Math.round(FORGET_REQUEST_TTL_MS / 3_600_000)} h means no.`,
      ]
    : [
        `No change: ${who} already has an open forget request (${r.id}) — answer it on its card. Nothing is forgotten until you approve.`,
      ];
  lines.push(`Audit: #${startedSeq} started${okSeq !== undefined ? ` · #${okSeq} ok` : " · ok row not recorded (see bridge log)"}.`);
  await interaction.reply({ content: lines.join("\n"), ephemeral: true });
  // The card goes out now (the scheduler tick would also send it).
  try {
    await ctx.deliverForgetCards?.();
  } catch (e) {
    console.error(`[discord] /admin people forget: card delivery failed: ${e instanceof Error ? e.message : e}`);
  }
}

function personLabel(p: DeclaredPerson): string {
  return p.display ? `"${p.id}" (${p.display})` : `"${p.id}"`;
}

/** COS-2.a: ` (time zone …, hours …)` for a person who has either, else "". */
function briefingHoursLabel(p: DeclaredPerson | null | undefined): string {
  const parts: string[] = [];
  if (p?.timezone) parts.push(`time zone ${p.timezone}`);
  if (p?.workingHours) parts.push(`hours ${p.workingHours}`);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

function formatPeopleNoChange(plan: PeopleAdminPlan): string {
  const where = `(\`${plan.path}\`)`;
  if (plan.op === "add") {
    return `No change: "${plan.personId}" is already declared${plan.before?.display ? ` as ${plan.before.display}` : ""}${briefingHoursLabel(plan.before)} ${where}. Use display:, timezone: or hours: to change them, /admin people link to add links.`;
  }
  if (plan.op === "remove") {
    return `No change: "${plan.personId}" is not a declared person in the file ${where}.`;
  }
  if (plan.op === "role") {
    return `No change: "${plan.personId}" already has role ${plan.roleAfter} ${where}.`;
  }
  const what = plan.unchanged.map(formatPersonLink).join(", ");
  return plan.op === "link"
    ? `No change: "${plan.personId}" already has ${what} ${where}.`
    : `No change: "${plan.personId}" has no ${what} in the file ${where}.`;
}

function formatPeopleApplied(
  plan: PeopleAdminPlan,
  startedSeq: number,
  okSeq: number | undefined,
): string {
  const lines: string[] = [];
  const who = plan.after ? personLabel(plan.after) : `"${plan.personId}"`;
  if (plan.op === "add") {
    const changes: string[] = [];
    if (plan.before && plan.displayChanged) {
      changes.push(`display name changed${plan.before.display ? ` from ${plan.before.display}` : ""}`);
    }
    if (plan.timezoneChanged) {
      changes.push(`time zone ${plan.before?.timezone ? `${plan.before.timezone} → ` : ""}${plan.after!.timezone}`);
    }
    if (plan.hoursChanged) {
      changes.push(`working hours ${plan.before?.workingHours ? `${plan.before.workingHours} → ` : ""}${plan.after!.workingHours}`);
    }
    const briefing = plan.timezoneChanged || plan.hoursChanged ? " Their daily briefing follows it from the next working day (COS-2.a)." : "";
    lines.push(
      plan.before
        ? `✅ /admin people add: ${who} — ${changes.join("; ")}.${briefing}`
        : `✅ /admin people add: declared ${who}${changes.length ? ` — ${changes.join("; ")}` : ""}. Link accounts with /admin people link.${briefing}`,
    );
  } else if (plan.op === "role") {
    lines.push(
      `✅ /admin people role: ${who} — role ${plan.roleBefore ?? DEFAULT_PERSON_ROLE} → ${plan.roleAfter} (IDENTITY-8). The tool layer re-checks it on the next run.`,
    );
  } else if (plan.op === "remove") {
    const b = plan.before!;
    const n = b.discordIds.length + b.githubLogins.length + b.githubIds.length + b.nicknames.length;
    lines.push(`✅ /admin people remove: ${personLabel(b)} is no longer a declared person (${n} link${n === 1 ? "" : "s"} dropped).`);
  } else {
    const verb = plan.op === "link" ? "linked" : "unlinked";
    lines.push(`✅ /admin people ${plan.op}: ${who} — ${verb} ${plan.changed.map(formatPersonLink).join(", ")}.`);
    if (plan.unchanged.length > 0) {
      lines.push(
        `${plan.op === "link" ? "Already linked" : "Not linked"} (unchanged): ${plan.unchanged.map(formatPersonLink).join(", ")}.`,
      );
    }
    // IDENTITY-7.a: a login is a label; the numeric id is what matches.
    if (plan.op === "unlink" && plan.changed.some((l) => l.kind === "github") && (plan.after?.githubIds.length ?? 0) > 0) {
      lines.push(
        `GitHub id ${plan.after!.githubIds.join(", ")} stays linked, so GitHub still recognises them — unlink github_id to stop that (IDENTITY-7.a).`,
      );
    }
  }
  lines.push(
    `File \`${plan.path}\`${plan.exists ? "" : " (created)"}: people ${plan.countBefore} → ${plan.countAfter}. Takes effect on the next message or comment — no restart.`,
  );
  lines.push(`Audit: #${startedSeq} started${okSeq !== undefined ? ` · #${okSeq} ok` : " · ok row not recorded (see bridge log)"}.`);
  return lines.join("\n");
}

/** A listed person's effective role (IDENTITY-8): declared team / community, else community. */
function listedRole(dir: PeopleDirectory, p: DeclaredPerson): PersonRole {
  if (p.id === dir.ownerPersonId) return "owner";
  return p.role === "team" || p.role === "community" ? p.role : DEFAULT_PERSON_ROLE;
}

/** Max people listed by `/admin people list` before "+N more" (Discord 2000-char cap). */
const PEOPLE_LIST_MAX_CHARS = 1800;

/** IDENTITY-13: ephemeral read-only view of the declared people (owner only). */
export function formatPeopleList(ctx: SlashContext): string {
  const env = ctx.env ?? process.env;
  // Exactly what chat, slash and WATCH see: the file this process loaded.
  const dir = loadDeclaredPeople({ allowlist: ctx.allowlist, owner: ctx.owner });
  const declared = dir.people.filter((p) => p.id !== OWNER_PERSON_ID);
  const head = ["**/admin people** (IDENTITY-13, read-only view)"];
  head.push(
    ctx.allowlist.sourcePath
      ? `Allowlist file: \`${ctx.allowlist.sourcePath}\` — ${declared.length} declared`
      : `No allowlist file loaded — /admin people add writes \`${resolveAdminAllowlistPath(ctx.allowlist, env)}\``,
  );
  const rows = dir.people.map((p) => {
    const parts = [p.id === OWNER_PERSON_ID ? "owner (from [owner] / env)" : p.id];
    if (p.display) parts.push(p.display);
    if (p.nicknames.length) parts.push(`nicknames ${p.nicknames.join(", ")}`);
    if (p.discordIds.length) parts.push(`Discord ${p.discordIds.map((d) => `<@${d}>`).join(" ")}`);
    if (p.githubLogins.length) parts.push(`GitHub ${p.githubLogins.map((l) => `@${l}`).join(" ")}`);
    if (p.githubIds.length) parts.push(`GitHub id ${p.githubIds.join(" ")}`);
    // COS-2.a: when their daily briefing arrives.
    if (p.timezone) parts.push(`tz ${p.timezone}`);
    if (p.workingHours) parts.push(`hours ${p.workingHours}`);
    const owner = p.id === dir.ownerPersonId ? " — **owner**" : ` — role ${listedRole(dir, p)}`;
    return `• ${parts.join(" · ")}${owner}`;
  });
  const tail: string[] = [];
  if (dir.issues.length > 0) tail.push(`⚠️ ${dir.issues.length} problem(s): ${dir.issues.join("; ")}`);
  tail.push(
    "Matched on Discord user ids and GitHub numeric user ids only — never on GitHub logins or names (IDENTITY-7.a). Change with /admin people add|link|unlink|remove|role (audited) or in the file on the VM — never through chat. Roles: owner, team, community (IDENTITY-8); undeclared is community.",
  );
  const out = [...head];
  let used = [...head, ...tail].join("\n").length;
  let shown = 0;
  for (const r of rows) {
    if (used + r.length + 1 > PEOPLE_LIST_MAX_CHARS) break;
    out.push(r);
    used += r.length + 1;
    shown++;
  }
  if (rows.length === 0) out.push("• nobody declared yet — /admin people add person:<id> display:<name>");
  if (shown < rows.length) out.push(`… +${rows.length - shown} more (see the file)`);
  out.push(...tail);
  return out.join("\n").slice(0, 1990);
}

/**
 * Guard rails that keep empty=deny-all and env read-only honest.
 * A channel that is also on deny_channels does not count as live: deny always
 * wins in the channel gate, so leaving only denied channels is the same
 * lockout as leaving none.
 */
function refusalFor(plan: AdminListPlan, denyChannels: readonly string[]): string | null {
  if (plan.op !== "remove") return null;
  const target = mention(plan.key, plan.id);
  if (!plan.inFileBefore && plan.inEnv) {
    return `Refused: ${target} comes from env (${ADMIN_LIST_ENV[plan.key]}); env values cannot be changed at runtime. Change the VM env and restart the bridge. Nothing changed.`;
  }
  if (plan.key !== "channels") return null;
  if (plan.liveAfter.length === 0) {
    return `Refused: removing ${target} would leave no allowlisted channel — every message and slash (including /admin) would be refused and the bridge would not start again. Add another channel first. Nothing changed.`;
  }
  const denied = new Set(denyChannels.map((c) => c.trim().toLowerCase()));
  if (plan.liveAfter.every((c) => denied.has(c))) {
    return `Refused: removing ${target} would leave only deny-listed channels (deny_channels always wins) — every message and slash (including /admin) would be refused. Add another channel first. Nothing changed.`;
  }
  return null;
}

/** The list as replies count it: `users` / `channels` (ADMIN-1/2 wording), else `[section].key`. */
function countName(plan: AdminListPlan): string {
  return plan.key === "users" || plan.key === "channels" ? plan.key : `[${plan.section}].${plan.fileKey}`;
}

function formatNoChange(plan: AdminListPlan): string {
  const target = mention(plan.key, plan.id);
  const where = `[${plan.section}].${plan.fileKey}`;
  if (plan.op === "add") {
    return `No change: ${target} is already in ${where} (\`${plan.path}\`). Live ${countName(plan)}: ${plan.liveAfter.length}.`;
  }
  return `No change: ${target} is not in ${where} (\`${plan.path}\`) or env. Live ${countName(plan)}: ${plan.liveAfter.length}.`;
}

function formatApplied(
  ctx: SlashContext,
  interaction: SlashInteraction,
  plan: AdminListPlan,
  command: string,
  startedSeq: number,
  okSeq: number | undefined,
): string {
  const target = mention(plan.key, plan.id);
  const where = `[${plan.section}].${plan.fileKey}`;
  const name = countName(plan);
  const deny = ADMIN_LISTS[plan.key].key.startsWith("deny_");
  const verb =
    plan.op === "add"
      ? plan.key === "users"
        ? `approved ${target} (added to ${where})`
        : deny
          ? `denied ${target} (added to ${where})`
          : `added ${target} to ${where}`
      : `removed ${target} from ${where}`;
  const lines = [
    `✅ ${command}: ${verb}.`,
    `File \`${plan.path}\`${plan.exists ? "" : " (created)"}: ${name} ${plan.fileBefore.length} → ${plan.fileAfter.length}${plan.fileChanged ? "" : " (unchanged)"}.`,
    `Live ${name} (file ∪ env): ${plan.liveBefore.length} → ${plan.liveAfter.length}. Takes effect now — no restart.`,
  ];
  if (plan.section === "github") {
    lines.push("GitHub tools read the file on their next call, and `github watch` re-reads it on its next poll.");
  }
  const listed = plan.key === "users" || plan.key === "channels" ? "allowed" : "listed";
  if (plan.op === "add" && plan.inEnv) {
    lines.push(`Note: ${target} was already ${listed} via env (${ADMIN_LIST_ENV[plan.key]}); it is now also in the file.`);
  }
  if (plan.op === "remove" && plan.inEnv) {
    lines.push(`Note: ${target} is still ${listed} via env (${ADMIN_LIST_ENV[plan.key]}), which cannot change at runtime.`);
  }
  if (
    plan.key === "users" &&
    plan.op === "add" &&
    plan.liveBefore.length === 0 &&
    plan.liveAfter.length > 0 &&
    ctx.allowlist.discord.roles.length === 0
  ) {
    lines.push(
      "⚠️ First user allowlist entry: while users and roles were both empty, every caller in an allowlisted channel resolved to STANDARD. From now on only listed users/roles (and the owner) do — everyone else resolves to BLOCKED.",
    );
  }
  const here = interaction.channelId.trim().toLowerCase();
  if (
    plan.key === "channels" &&
    plan.op === "remove" &&
    plan.id === here &&
    !plan.liveAfter.includes(plan.id)
  ) {
    lines.push("⚠️ You ran this in that channel: messages and slash here are now refused (you get the allowlist tip).");
  }
  if (plan.key === "deny_channels" && plan.op === "add" && plan.id === here) {
    lines.push("⚠️ You ran this in that channel: messages and slash here are now refused (deny always wins).");
  }
  if (
    plan.op === "remove" &&
    (plan.key === "github.orgs" || plan.key === "github.repos") &&
    !hasGithubRepoAllowEntries(ctx.allowlist.github)
  ) {
    lines.push(
      "⚠️ The GitHub repo allow lists are now empty: GitHub repo actions are refused (default-deny) and `github watch` polls nothing until you add one (/admin github add).",
    );
  }
  lines.push(`Audit: #${startedSeq} started${okSeq !== undefined ? ` · #${okSeq} ok` : " · ok row not recorded (see bridge log)"}.`);
  return lines.join("\n");
}

function idList(key: AdminListKey, ids: readonly string[], max: number): string {
  if (ids.length === 0 || max <= 0) return "";
  const shown = ids.slice(0, max).map((id) => mention(key, id)).join(" ");
  const more = ids.length > max ? ` +${ids.length - max} more` : "";
  return ` — ${shown}${more}`;
}

/** Discord's message cap is 2000; `config show` stays under it. */
const CONFIG_SHOW_MAX_CHARS = 1990;

/**
 * ADMIN-3 / ADMIN-3.c: ephemeral, audit-friendly config view. Never prints
 * tokens. Lists the allow and deny lists `/admin` edits (live, file and env
 * counts with up to 10 entries each, fewer when the reply would pass
 * Discord's 2000-character cap) and `[github].users` read-only.
 */
export function formatConfigShow(ctx: SlashContext): string {
  for (const max of [SHOW_MAX_IDS, 3, 0]) {
    const out = configShowText(ctx, max);
    if (out.length <= CONFIG_SHOW_MAX_CHARS) return out;
  }
  return configShowText(ctx, 0).slice(0, CONFIG_SHOW_MAX_CHARS);
}

function configShowText(ctx: SlashContext, maxIds: number): string {
  const env = ctx.env ?? process.env;
  const d = ctx.allowlist.discord;
  const g = ctx.allowlist.github;
  const view = readAdminFileView(ctx.allowlist, env);
  const lines = ["**/admin config** (ADMIN-3, read-only view)"];

  let fileCount: (k: AdminListKey) => string;
  if (view.ok) {
    lines.push(
      `Allowlist file: \`${view.path}\` (${view.format}${view.exists ? "" : ", not created yet"})`,
    );
    fileCount = (k) => String(view.file[k].length);
  } else {
    lines.push(`Allowlist file: \`${view.path}\` — unreadable: ${view.error}`);
    fileCount = () => "?";
  }

  const listLine = (k: AdminListKey) => {
    const live = liveAdminList(ctx.allowlist, k);
    return `• ${ADMIN_LISTS[k].key}: live ${live.length} (file ${fileCount(k)} · env ${envAdminList(env, k).length})${idList(k, live, maxIds)}`;
  };
  lines.push("Discord (live = file ∪ env):");
  lines.push(listLine("channels"));
  lines.push(listLine("users"));
  lines.push(`• roles: live ${d.roles.length}`);
  lines.push(listLine("deny_channels"));
  lines.push(listLine("deny_users"));
  lines.push(listLine("deny_roles"));
  if (d.users.length === 0 && d.roles.length === 0) {
    lines.push("  users+roles empty: channel-gated callers resolve to STANDARD; the first user added narrows that.");
  }
  lines.push("GitHub (live = file ∪ env):");
  lines.push(listLine("github.orgs"));
  lines.push(listLine("github.repos"));
  lines.push(listLine("github.deny_orgs"));
  lines.push(listLine("github.deny_repos"));
  lines.push(listLine("github.deny_users"));
  const ghUsers =
    maxIds > 0 && g.users.length > 0
      ? ` — ${g.users.slice(0, maxIds).map((u) => `\`${u}\``).join(" ")}${g.users.length > maxIds ? ` +${g.users.length - maxIds} more` : ""}`
      : "";
  lines.push(`• users: live ${g.users.length} (read-only here: file / CORVIDINHO_GITHUB_ALLOW_USERS)${ghUsers}`);
  lines.push(`${formatOwnerStatus(ctx.owner)} — the only ADMIN (IDENTITY-2)`);
  const people = loadDeclaredPeople({ allowlist: ctx.allowlist, owner: ctx.owner });
  const nPeople = people.people.filter((p) => p.id !== OWNER_PERSON_ID).length;
  const others = people.people.filter((p) => p.id !== OWNER_PERSON_ID && p.id !== people.ownerPersonId);
  const nTeam = others.filter((p) => p.role === "team").length;
  lines.push(
    `Declared people: ${nPeople}${people.issues.length ? ` (⚠️ ${people.issues.length} problem(s))` : ""} — /admin people list (IDENTITY-13); roles: team ${nTeam}, community ${others.length - nTeam} (IDENTITY-8)`,
  );
  if (ctx.rateLimitConfig) {
    lines.push(
      `Rate limit: ${ctx.rateLimitConfig.maxMessages} per ${Math.round(ctx.rateLimitConfig.windowMs / 1000)}s (env)`,
    );
  }
  lines.push(`Muted users: ${ctx.mutedUsers?.size ?? 0} (in-memory; /mute /unmute)`);
  const audit = ctx.auditLine?.();
  if (audit) lines.push(audit);
  lines.push(
    "Updatable here: [discord].users (/admin users add), [discord].channels (/admin channels add|remove), the deny lists [discord].deny_channels|deny_users|deny_roles and [github].deny_orgs|deny_repos|deny_users (/admin deny add|remove), the GitHub repo allow lists [github].orgs|repos (/admin github add|remove), declared people (/admin people add|link|unlink|remove) and their roles (/admin people role) — written to the file, live immediately.",
  );
  lines.push(
    "Read-only at runtime: env values (CORVIDINHO_DISCORD_*, DISCORD_CHANNEL_IDS, CORVIDINHO_GITHUB_*, CORVIDINHO_OWNER_*, rate limits), [github].users, [discord].roles and every other file key — edit on the VM and restart.",
  );
  return lines.join("\n");
}
