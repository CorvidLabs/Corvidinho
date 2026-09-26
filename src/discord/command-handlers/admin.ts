/**
 * /admin — runtime Discord allowlist admin (ADMIN-1..4, issue #43).
 *
 *   /admin users add user:@someone        ADMIN-1 approve/add a user
 *   /admin channels add channel:#picker   ADMIN-2 add a channel
 *   /admin channels remove channel:#…     ADMIN-2 remove a channel
 *   /admin config show                    ADMIN-3 show knobs (read-only view)
 *
 * Owner-only (IDENTITY-2): dispatch enforces minPermission ADMIN and this
 * handler re-checks ADMIN itself before anything else (ADMIN-4 / DISCORD-7);
 * no owner ⇒ nobody passes. Writes go to the allowlist file the bridge already
 * reads and to the live allowlist in place (no restart). Env values are
 * read-only at runtime. Empty stays deny-all: deny lists still win, and the
 * last live channel cannot be removed. Mutations leave SAFE-5 audit rows
 * (intent first; fail closed when the trail is unavailable). Replies are
 * ephemeral and never contain tokens or secrets.
 */

import { argsDigest, type AuditEntryInput, type AuditOutcome } from "../../audit/index.ts";
import { formatOwnerStatus } from "../../identity/owner.ts";
import {
  ADMIN_LIST_ENV,
  ADMIN_SNOWFLAKE_RE,
  commitAdminListChange,
  envAdminList,
  planAdminListChange,
  readAdminFileView,
  type AdminListKey,
  type AdminListOp,
  type AdminListPlan,
} from "../admin-allowlist.ts";
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
    usage: "usage: /admin channels add channel:#channel",
  },
  "channels remove": {
    action: "admin-channels-remove",
    key: "channels",
    op: "remove",
    option: "channel",
    usage: "usage: /admin channels remove channel:#channel",
  },
};

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
    if (m) auditSoft(ctx, auditEntry(interaction, m.action, "denied", [group, sub]));
    await interaction.reply({ content: NOT_AUTHORIZED, ephemeral: true });
    return;
  }

  if (route === "config show") {
    await interaction.reply({ content: formatConfigShow(ctx), ephemeral: true });
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
  const id = typeof raw === "string" ? raw.trim() : "";
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

  const refusal = refusalFor(plan, m);
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
  let startedSeq: number | undefined;
  if (ctx.recordAudit) {
    try {
      startedSeq = ctx.recordAudit(auditEntry(interaction, m.action, "started", args)).seq;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await interaction.reply({
        content: `Refused: audit log unavailable (SAFE-5): ${msg}. Nothing changed.`,
        ephemeral: true,
      });
      return;
    }
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

/** Guard rails that keep empty=deny-all and env read-only honest. */
function refusalFor(plan: AdminListPlan, m: Mutation): string | null {
  if (m.op !== "remove") return null;
  const target = mention(plan.key, plan.id);
  if (!plan.inFileBefore && plan.inEnv) {
    return `Refused: ${target} comes from env (${ADMIN_LIST_ENV[plan.key]}); env values cannot be changed at runtime. Change the VM env and restart the bridge. Nothing changed.`;
  }
  if (plan.key === "channels" && plan.liveAfter.length === 0) {
    return `Refused: removing ${target} would leave no allowlisted channel — every message and slash (including /admin) would be refused and the bridge would not start again. Add another channel first. Nothing changed.`;
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
  startedSeq: number | undefined,
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
  if (startedSeq !== undefined) {
    lines.push(`Audit: #${startedSeq} started${okSeq !== undefined ? ` · #${okSeq} ok` : " · ok row not recorded (see bridge log)"}.`);
  }
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
  if (ctx.rateLimitConfig) {
    lines.push(
      `Rate limit: ${ctx.rateLimitConfig.maxMessages} per ${Math.round(ctx.rateLimitConfig.windowMs / 1000)}s (env)`,
    );
  }
  lines.push(`Muted users: ${ctx.mutedUsers?.size ?? 0} (in-memory; /mute /unmute)`);
  const audit = ctx.auditLine?.();
  if (audit) lines.push(audit);
  lines.push(
    "Updatable here: [discord].users (/admin users add) and [discord].channels (/admin channels add|remove) — written to the file, live immediately.",
  );
  lines.push(
    "Read-only at runtime: env values (CORVIDINHO_DISCORD_ALLOW_*, DISCORD_CHANNEL_IDS, CORVIDINHO_OWNER_*, rate limits) and every other file key — edit on the VM and restart.",
  );
  return lines.join("\n");
}
