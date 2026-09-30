/**
 * /admin — runtime Discord allowlist admin (ADMIN-1..4, issue #43).
 *
 *   /admin users add user:@someone        ADMIN-1 approve/add a user
 *   /admin channels add channel:<search>  ADMIN-2 add a channel (STRING+autocomplete)
 *   /admin channels remove channel:<…>    ADMIN-2 remove a channel (STRING+autocomplete)
 *   /admin config show                    ADMIN-3 show knobs (read-only view)
 *   /admin people list                    IDENTITY-13 declared people (read-only view)
 *   /admin people add person:<id> [display:<name>]
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
 *
 * Owner-only (IDENTITY-2): dispatch enforces minPermission ADMIN and this
 * handler re-checks ADMIN itself before anything else (ADMIN-4 / DISCORD-7);
 * no owner ⇒ nobody passes. Writes go to the allowlist file the bridge already
 * reads and to the live allowlist in place (no restart). Env values are
 * read-only at runtime. Empty stays deny-all: deny lists still win, and the
 * last live (non-denied) channel cannot be removed. Mutations leave SAFE-5 audit rows
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
import {
  ADMIN_LIST_ENV,
  ADMIN_SNOWFLAKE_RE,
  commitAdminListChange,
  envAdminList,
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
  add: "usage: /admin people add person:<id> [display:<name>] — id is lowercase letters, digits, - or _ (e.g. tofu)",
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

function mention(key: AdminListKey, id: string): string {
  return key === "users" ? `<@${id}>` : `<#${id}>`;
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
    const m = MUTATIONS[route];
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

async function handleMutation(
  ctx: SlashContext,
  interaction: SlashInteraction,
  m: Mutation,
  route: string[],
): Promise<void> {
  const raw = interaction.options[m.option];
  let id = "";
  if (m.option === "channel") {
    const resolved = resolveChannelOption(typeof raw === "string" ? raw : "");
    if (!resolved.ok) {
      await interaction.reply({ content: m.usage, ephemeral: true });
      return;
    }
    id = resolved.id;
  } else {
    id = typeof raw === "string" ? raw.trim() : "";
  }
  if (!ADMIN_SNOWFLAKE_RE.test(id)) {
    await interaction.reply({ content: m.usage, ephemeral: true });
    return;
  }
  const args = [...route, id];
  const env = ctx.env ?? process.env;
  const d = ctx.allowlist.discord;

  // Deny always wins — adding to the allow list would change nothing.
  const denyList = m.key === "users" ? d.denyUsers : d.denyChannels;
  if (m.op === "add" && denyList.includes(id)) {
    auditSoft(ctx, auditEntry(interaction, m.action, "denied", args));
    await interaction.reply({
      content: `Refused: ${mention(m.key, id)} is on deny_${m.key} and deny always wins. Remove it from the deny list on the VM first (file [discord].deny_${m.key} or env), then retry.`,
      ephemeral: true,
    });
    return;
  }

  // Plan, audit intent, commit: all synchronous, so no interleaving.
  const planned = planAdminListChange({
    allowlist: ctx.allowlist,
    env,
    key: m.key,
    op: m.op,
    id,
  });
  if (!planned.ok) {
    auditSoft(ctx, auditEntry(interaction, m.action, "error", args));
    await interaction.reply({
      content: `Refused: ${planned.error}. File: \`${planned.path}\` — nothing changed.`,
      ephemeral: true,
    });
    return;
  }
  const plan = planned.plan;

  const refusal = refusalFor(plan, m, d.denyChannels);
  if (refusal) {
    auditSoft(ctx, auditEntry(interaction, m.action, "denied", args));
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
    startedSeq = ctx.recordAudit(auditEntry(interaction, m.action, "started", args)).seq;
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
    auditSoft(ctx, auditEntry(interaction, m.action, "error", args));
    await interaction.reply({
      content: `Error: could not write \`${plan.path}\`: ${msg}. Live allowlist unchanged.`,
      ephemeral: true,
    });
    return;
  }
  const okSeq = auditSoft(ctx, auditEntry(interaction, m.action, "ok", args));
  await interaction.reply({
    content: formatApplied(ctx, interaction, plan, startedSeq, okSeq),
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
    ...links.map((l) => `${l.kind}:${l.value}`),
    ...(role !== undefined ? [`role:${role.toLowerCase()}`] : []),
  ];
  const planNow = (): ReturnType<typeof planPeopleChange> =>
    planPeopleChange({
      allowlist: ctx.allowlist,
      owner: ctx.owner,
      env: ctx.env ?? process.env,
      request: { op, personId: person, display, links, ...(role !== undefined ? { role } : {}) },
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

function formatPeopleNoChange(plan: PeopleAdminPlan): string {
  const where = `(\`${plan.path}\`)`;
  if (plan.op === "add") {
    return `No change: "${plan.personId}" is already declared${plan.before?.display ? ` as ${plan.before.display}` : ""} ${where}. Use display: to change the name, /admin people link to add links.`;
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
    lines.push(
      plan.before
        ? `✅ /admin people add: ${who} — display name changed${plan.before.display ? ` from ${plan.before.display}` : ""}.`
        : `✅ /admin people add: declared ${who}. Link accounts with /admin people link.`,
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
function refusalFor(
  plan: AdminListPlan,
  m: Mutation,
  denyChannels: readonly string[],
): string | null {
  if (m.op !== "remove") return null;
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

function formatNoChange(plan: AdminListPlan): string {
  const target = mention(plan.key, plan.id);
  const where = `[discord].${plan.key}`;
  if (plan.op === "add") {
    return `No change: ${target} is already in ${where} (\`${plan.path}\`). Live ${plan.key}: ${plan.liveAfter.length}.`;
  }
  return `No change: ${target} is not in ${where} (\`${plan.path}\`) or env. Live ${plan.key}: ${plan.liveAfter.length}.`;
}

function formatApplied(
  ctx: SlashContext,
  interaction: SlashInteraction,
  plan: AdminListPlan,
  startedSeq: number,
  okSeq: number | undefined,
): string {
  const target = mention(plan.key, plan.id);
  const where = `[discord].${plan.key}`;
  const verb =
    plan.op === "add"
      ? plan.key === "users"
        ? `approved ${target} (added to ${where})`
        : `added ${target} to ${where}`
      : `removed ${target} from ${where}`;
  const lines = [
    `✅ /admin ${plan.key} ${plan.op}: ${verb}.`,
    `File \`${plan.path}\`${plan.exists ? "" : " (created)"}: ${plan.key} ${plan.fileBefore.length} → ${plan.fileAfter.length}${plan.fileChanged ? "" : " (unchanged)"}.`,
    `Live ${plan.key} (file ∪ env): ${plan.liveBefore.length} → ${plan.liveAfter.length}. Takes effect now — no restart.`,
  ];
  if (plan.op === "add" && plan.inEnv) {
    lines.push(`Note: ${target} was already allowed via env (${ADMIN_LIST_ENV[plan.key]}); it is now also in the file.`);
  }
  if (plan.op === "remove" && plan.inEnv) {
    lines.push(`Note: ${target} is still allowed via env (${ADMIN_LIST_ENV[plan.key]}), which cannot change at runtime.`);
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
  if (
    plan.key === "channels" &&
    plan.op === "remove" &&
    plan.id === interaction.channelId.trim().toLowerCase() &&
    !plan.liveAfter.includes(plan.id)
  ) {
    lines.push("⚠️ You ran this in that channel: messages and slash here are now refused (you get the allowlist tip).");
  }
  lines.push(`Audit: #${startedSeq} started${okSeq !== undefined ? ` · #${okSeq} ok` : " · ok row not recorded (see bridge log)"}.`);
  return lines.join("\n");
}

function idList(key: AdminListKey, ids: readonly string[]): string {
  if (ids.length === 0) return "";
  const shown = ids.slice(0, SHOW_MAX_IDS).map((id) => mention(key, id)).join(" ");
  const more = ids.length > SHOW_MAX_IDS ? ` +${ids.length - SHOW_MAX_IDS} more` : "";
  return ` — ${shown}${more}`;
}

/** ADMIN-3: ephemeral, audit-friendly config view. Never prints tokens. */
export function formatConfigShow(ctx: SlashContext): string {
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

  const listLine = (k: AdminListKey) =>
    `• ${k}: live ${d[k].length} (file ${fileCount(k)} · env ${envAdminList(env, k).length})${idList(k, d[k])}`;
  lines.push("Discord (live = file ∪ env):");
  lines.push(listLine("channels"));
  lines.push(listLine("users"));
  lines.push(`• roles: live ${d.roles.length}`);
  lines.push(
    `• deny channels/users/roles: ${d.denyChannels.length}/${d.denyUsers.length}/${d.denyRoles.length}`,
  );
  if (d.users.length === 0 && d.roles.length === 0) {
    lines.push("  users+roles empty: channel-gated callers resolve to STANDARD; the first user added narrows that.");
  }
  lines.push(
    `GitHub (live): orgs ${g.orgs.length} · repos ${g.repos.length} · users ${g.users.length} · deny orgs/repos/users ${g.denyOrgs.length}/${g.denyRepos.length}/${g.denyUsers.length}`,
  );
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
    "Updatable here: [discord].users (/admin users add), [discord].channels (/admin channels add|remove), declared people (/admin people add|link|unlink|remove) and their roles (/admin people role) — written to the file, live immediately.",
  );
  lines.push(
    "Read-only at runtime: env values (CORVIDINHO_DISCORD_ALLOW_*, DISCORD_CHANNEL_IDS, CORVIDINHO_OWNER_*, rate limits) and every other file key — edit on the VM and restart.",
  );
  return lines.join("\n");
}
