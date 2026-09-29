/**
 * Memory plugins (PLUGIN-1 / REQ-plugins-010), hardened per REQ-plugins-011.
 *
 * argv is model-controlled in the tool loop, so the acting user, ADMIN, and
 * the store path never come from argv — only from the env the Discord bridge
 * sets per spawn. ADMIN is re-checked here at handler time against the live
 * admin config (ADMIN-4 / DISCORD-7; empty ⇒ deny-all). Forget/override are
 * two-phase with a confirm token from a different turn (SAFE-4).
 *
 * Profiles, projects and privacy (MEMORY-5..7, MEMORY-ACL-6, #101 /
 * REQ-plugins-101): the acting Discord id is matched in the owner's people
 * list (re-read now, src/memory/scope.ts) — a declared person reads and
 * writes one profile scope, anyone else their Discord id as before.
 * `--person` names someone else's memory for the owner only (opaque refusal
 * otherwise). `--project` is the project's own memory (the run's repo), for
 * the owner and team and the local CLI. Private notes (`--category private`)
 * are never recalled unless asked for by name, and then only for that
 * person or the owner in a conversation with them. `memory-forget-me` asks
 * the owner to approve forgetting the acting person (nothing is deleted
 * here).
 */

import { appendAudit, argsDigest, auditContextFromEnv, auditKeyFromEnv } from "../../src/audit/log.ts";
import {
  buildMemoryProfile,
  checkConfirmToken,
  FORGET_REQUEST_TTL_MS,
  ForgetRequestStore,
  formatMemoryProfile,
  isHumanSuppliedToken,
  issueConfirmToken,
  loadPeopleForMemory,
  MEMORY_ACL_DENIED,
  MemoryAclError,
  memorySubjectFor,
  memorySubjectForRef,
  MemoryNotFoundError,
  MemoryStore,
  MemoryValidationError,
  PRIVATE_NOTE_CATEGORY,
  projectScopeFor,
  sameSubject,
  subjectLabel,
  type ConfirmBinding,
  type MemorySubject,
} from "../../src/memory/index.ts";
import { resolveActingIsAdmin, resolveActingRole, ROLE_REFUSED_MESSAGE } from "../../src/plugins/roles.ts";
import type { PluginCommand, PluginHandlerResult } from "../../src/plugins/types.ts";
import { openCorvidinhoDb } from "../../src/store/db.ts";

/** Identity, privilege, and storage are never taken from argv (MEMORY-ACL-1..4). */
const REFUSED_FLAGS = ["--user", "--admin", "--db"] as const;
const VALUE_FLAGS = new Set([
  "--category",
  "--key",
  "--content",
  "--query",
  "--id",
  "--limit",
  "--confirm",
  "--person",
]);

function flagValue(args: string[], name: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith(`${name}=`)) return a.slice(name.length + 1);
    if (a === name) {
      const v = args[i + 1];
      return v != null && !v.startsWith("--") ? v : undefined;
    }
  }
  return undefined;
}

/** Args in flag position: values of VALUE_FLAGS skipped, nothing after `--`. */
function flagTokens(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--") break;
    if (VALUE_FLAGS.has(a)) {
      i++; // skip value
      continue;
    }
    if (a.startsWith("--")) out.push(a);
  }
  return out;
}

/** A flag (value flags included) in flag position, before any `--`. */
function flagPresent(args: string[], name: string): boolean {
  const end = args.indexOf("--");
  return (end >= 0 ? args.slice(0, end) : args).some((a) => a === name || a.startsWith(`${name}=`));
}

function hasFlag(args: string[], name: string): boolean {
  return flagTokens(args).some((a) => a === name || a.startsWith(`${name}=`));
}

/** Boolean flag: bare `--x` or `--x=true|1|yes`; `--x=false` is off. */
function boolFlag(args: string[], name: string): boolean {
  return flagTokens(args).some(
    (a) => a === name || (a.startsWith(`${name}=`) && truthy(a.slice(name.length + 1))),
  );
}

function positionalAfterFlags(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--") {
      out.push(...args.slice(i + 1));
      break;
    }
    if (VALUE_FLAGS.has(a)) {
      i++; // skip value
      continue;
    }
    if (a.startsWith("--")) continue;
    out.push(a);
  }
  return out;
}

function truthy(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function refuseArgvIdentity(args: string[]): PluginHandlerResult | null {
  const hit = REFUSED_FLAGS.find((f) => hasFlag(args, f));
  if (!hit) return null;
  return {
    ok: false,
    error: `refused: ${hit} is not accepted — acting user, ADMIN, and store come from the bridge environment, never argv (MEMORY-ACL-1..4). To store text that contains it, put the text after \`--\` or in --content=…`,
    exitCode: 2,
  };
}

/** Acting Discord user from the bridge-set env only (MEMORY-ACL-1). */
function actingUser(env: NodeJS.ProcessEnv): string {
  return env.CORVIDINHO_ACTING_DISCORD_USER_ID?.trim() ?? "";
}

const NO_ACTOR: PluginHandlerResult = {
  ok: false,
  error:
    "refused: no acting user — memory is per-user and the actor is set by the Discord bridge (CORVIDINHO_ACTING_DISCORD_USER_ID)",
  exitCode: 2,
};

const ACL_DENIED: PluginHandlerResult = {
  ok: false,
  error: MEMORY_ACL_DENIED,
  exitCode: 2,
};

/**
 * Handler-time ADMIN re-check (ADMIN-4 / DISCORD-7 / MEMORY-ACL-3/4 / ROLES-CHAT-6).
 * Delegates to shared resolveActingIsAdmin (owner-only; empty ⇒ nobody).
 */
export async function actingIsAdmin(
  env: NodeJS.ProcessEnv,
  userId: string,
): Promise<boolean> {
  return resolveActingIsAdmin(env, userId);
}

const PROJECT_DENIED: PluginHandlerResult = {
  ok: false,
  error: `refused: ${ROLE_REFUSED_MESSAGE} — project memory is for the owner and team working on the repo (MEMORY-6)`,
  exitCode: 2,
};

const PRIVATE_NEEDS_CONVERSATION: PluginHandlerResult = {
  ok: false,
  error:
    "refused: private notes are shown only in a conversation with that person or the owner, never in a schedule or other run (MEMORY-7)",
  exitCode: 2,
};

/**
 * Project memory (MEMORY-6): the owner and team (people who work on the
 * repo), and the local CLI (no role session). Community — undeclared,
 * WATCH, schedules, workers — neither reads nor writes it.
 */
async function mayUseProjectMemory(env: NodeJS.ProcessEnv): Promise<boolean> {
  const role = await resolveActingRole(env);
  return role === null || role === "owner" || role === "team";
}

/** A conversation with the acting person (chat, slash, button), not a schedule. */
function inConversation(env: NodeJS.ProcessEnv): boolean {
  return !!env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID?.trim();
}

type SubjectPick =
  | { ok: true; subject: MemorySubject; self: boolean }
  | { ok: false; result: PluginHandlerResult };

/**
 * Whose memory this call reads: the acting person's own, or — `--person`,
 * owner only (MEMORY-7 / MEMORY-ACL-2) — someone else's. A non-owner naming
 * anyone but themselves gets the opaque refusal, known person or not.
 */
async function pickSubject(env: NodeJS.ProcessEnv, actor: string, ref: string | undefined): Promise<SubjectPick> {
  const { dir } = await loadPeopleForMemory(env);
  const self = memorySubjectFor(dir, actor);
  if (!self) return { ok: false, result: NO_ACTOR };
  if (ref === undefined) return { ok: true, subject: self, self: true };
  const target = memorySubjectForRef(dir, ref);
  if (target && sameSubject(target, self)) return { ok: true, subject: self, self: true };
  if (!(await actingIsAdmin(env, actor))) return { ok: false, result: ACL_DENIED };
  if (!target) {
    return {
      ok: false,
      result: {
        ok: false,
        error: "no such person: --person takes a declared person id or a Discord user id",
        exitCode: 1,
      },
    };
  }
  return { ok: true, subject: target, self: false };
}

function openStore(env: NodeJS.ProcessEnv) {
  const db =
    env.CORVIDINHO_MEMORY_INMEM === "1"
      ? openCorvidinhoDb({ memory: true })
      : openCorvidinhoDb({ env });
  return { db, store: new MemoryStore({ db }), close: () => db.close() };
}

function errResult(err: unknown): PluginHandlerResult {
  if (err instanceof MemoryAclError) {
    return { ok: false, error: err.message, exitCode: 2 };
  }
  if (err instanceof MemoryNotFoundError) {
    return { ok: false, error: err.message, exitCode: 1 };
  }
  if (err instanceof MemoryValidationError) {
    return { ok: false, error: err.message, exitCode: 1 };
  }
  return {
    ok: false,
    error: err instanceof Error ? err.message : String(err),
    exitCode: 1,
  };
}

type ConfirmArg =
  | { present: false }
  | { present: true; token: string | undefined };

function parseConfirm(args: string[]): ConfirmArg {
  const end = args.indexOf("--");
  const head = end >= 0 ? args.slice(0, end) : args;
  if (!head.some((a) => a === "--confirm" || a.startsWith("--confirm="))) {
    return { present: false };
  }
  return { present: true, token: flagValue(args, "--confirm")?.trim() || undefined };
}

const CONFIRM_NEEDS_TOKEN: PluginHandlerResult = {
  ok: false,
  error:
    "refused: --confirm needs the token from phase 1 (run once without --confirm, then confirm from a new turn) — SAFE-4",
  exitCode: 1,
};

/**
 * Shared two-phase flow for forget/override. Phase 1 returns a token and the
 * target (never content); phase 2 verifies it, then `apply` runs.
 */
async function twoPhase(opts: {
  args: string[];
  op: ConfirmBinding["op"];
  usage: string;
  content?: string;
  apply: (store: MemoryStore, id: string, actor: string, isAdmin: boolean) => {
    deletedAt?: number;
    updatedAt: number;
  };
}): Promise<PluginHandlerResult> {
  const refused = refuseArgvIdentity(opts.args);
  if (refused) return refused;
  const env = process.env;
  const actor = actingUser(env);
  if (!actor) return NO_ACTOR;
  const id = flagValue(opts.args, "--id") ?? positionalAfterFlags(opts.args)[0];
  if (!id || (opts.op === "override" && !opts.content?.trim())) {
    return { ok: false, error: opts.usage, exitCode: 1 };
  }
  const isAdmin = await actingIsAdmin(env, actor);
  if (!isAdmin) return ACL_DENIED;
  const confirm = parseConfirm(opts.args);
  if (confirm.present && !confirm.token) return CONFIRM_NEEDS_TOKEN;

  const { db, store, close } = openStore(env);
  try {
    const row = store.getById(id);
    if (!row || row.deletedAt != null) throw new MemoryNotFoundError();
    const binding: ConfirmBinding = {
      op: opts.op,
      actorUserId: actor,
      memoryId: row.id,
      memoryUpdatedAt: row.updatedAt,
      content: opts.op === "override" ? opts.content : undefined,
    };
    const target = {
      id: row.id,
      category: row.category,
      key: row.key,
      ownerUserId: row.ownerUserId,
    };

    if (!confirm.present) {
      const { token, expiresAt } = issueConfirmToken(db, binding);
      return {
        ok: true,
        data: { pending: true, op: opts.op, ...target, confirmToken: token, expiresAt },
        message: `pending ${opts.op} of ${row.category}/${row.key} (owner ${row.ownerUserId}). To confirm within 10m the human must reply with this token in a new message: ${token} — then run memory-${opts.op} --id ${row.id} --confirm <token>${opts.op === "override" ? " --content <the same content as this request>" : ""}`,
        exitCode: 0,
      };
    }

    const check = checkConfirmToken(db, confirm.token!, binding);
    if (!check.ok) return { ok: false, error: check.error, exitCode: 2 };
    // SAFE-4: phase 2 needs a human act — the token must appear in the
    // human's own message for this run (bridge-extracted), not only argv.
    if (!isHumanSuppliedToken(confirm.token!, env)) {
      return {
        ok: false,
        error:
          "refused: confirm token must come from the human — reply with the token in a new message (SAFE-4)",
        exitCode: 2,
      };
    }

    const done = opts.apply(store, row.id, actor, isAdmin);
    const verb = opts.op === "forget" ? "forgot" : "overrode";
    return {
      ok: true,
      data: {
        op: opts.op,
        ...target,
        actorUserId: actor,
        at: done.deletedAt ?? done.updatedAt,
      },
      message: `${verb} memory ${row.id} (${row.category}/${row.key}, owner ${row.ownerUserId}) by ${actor}`,
      exitCode: 0,
    };
  } catch (err) {
    return errResult(err);
  } finally {
    close();
  }
}

export const memoryCommands: PluginCommand[] = [
  {
    name: "memory-store",
    description:
      "Store a durable fact for the acting Discord user (MEMORY / AGENT-7) — in their profile when they are a declared person (MEMORY-5). " +
      "Categories: conversation|entity|person|personality, profile: project (their projects) | preference (how they like to be talked to, timezone, hours) | decision | ask | approval (their history), and private (a private note: never shown to anyone but them and the owner, MEMORY-7). " +
      'Call when the user states identity/person/project facts. argv example: ' +
      '["--category","person","--key","identity","Leif is the owner"]; ' +
      '["--category","preference","--key","timezone","Europe/Oslo"]; ["--category","decision","--key","2026-09-28-release","ship weekly"]. ' +
      "Also: [\"person\",\"identity\",\"Leif is the owner\"] positional. " +
      'Project memory (MEMORY-6, what you learned about this repo for whoever works on it next; owner/team only): ["--project","--category","entity","--key","test-cmd","bun test"]. ' +
      "Acting user comes from CORVIDINHO_ACTING_DISCORD_USER_ID (bridge sets it).",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const refused = refuseArgvIdentity(ctx.args);
      if (refused) return refused;
      const env = process.env;
      if (flagPresent(ctx.args, "--person")) {
        return {
          ok: false,
          error:
            "refused: memory-store writes the acting person's own memory (or --project); --person is only for the owner reading someone's memory (MEMORY-ACL-2)",
          exitCode: 2,
        };
      }
      const project = boolFlag(ctx.args, "--project");
      const user = actingUser(env);
      if (!user && !project) return NO_ACTOR;
      const category =
        flagValue(ctx.args, "--category") ?? positionalAfterFlags(ctx.args)[0];
      const key =
        flagValue(ctx.args, "--key") ?? positionalAfterFlags(ctx.args)[1];
      let content = flagValue(ctx.args, "--content");
      if (!content) {
        const pos = positionalAfterFlags(ctx.args);
        // when category/key taken from positional, content is rest
        const start =
          flagValue(ctx.args, "--category") && flagValue(ctx.args, "--key")
            ? 0
            : flagValue(ctx.args, "--category") || flagValue(ctx.args, "--key")
              ? 1
              : 2;
        content = pos.slice(start).join(" ");
      }
      if (!category || !key || !content?.trim()) {
        return {
          ok: false,
          error:
            "usage: memory-store --category CAT --key KEY <content> (or positional CAT KEY content...)",
          exitCode: 1,
        };
      }
      let scope: string;
      let where = "";
      if (project) {
        if (!(await mayUseProjectMemory(env))) return PROJECT_DENIED;
        if (category === PRIVATE_NOTE_CATEGORY) {
          return {
            ok: false,
            error: "refused: a private note belongs to a person, not a project (MEMORY-7)",
            exitCode: 1,
          };
        }
        const p = projectScopeFor(ctx.cwd || process.cwd());
        scope = p.scope;
        where = ` in project ${p.key}`;
      } else {
        const pick = await pickSubject(env, user, undefined);
        if (!pick.ok) return pick.result;
        scope = pick.subject.writeScope;
        if (pick.subject.kind === "person") where = ` in ${pick.subject.id}'s profile`;
      }
      const { store, close } = openStore(env);
      try {
        const rec = store.store({
          ownerUserId: scope,
          category,
          key,
          content,
        });
        return {
          ok: true,
          data: rec,
          message: ctx.json
            ? undefined
            : `stored ${rec.category}/${rec.key}${where} id=${rec.id}`,
          exitCode: 0,
        };
      } catch (err) {
        return errResult(err);
      } finally {
        close();
      }
    },
  },
  {
    name: "memory-recall",
    description:
      "Recall durable facts for the acting Discord user (MEMORY / AGENT-7), their profile when declared (MEMORY-5). " +
      "Call BEFORE claiming you do not know who the user is or facts about them/people/projects. " +
      'argv examples: [] (all), ["--category","person"], ' +
      '["--query","Leif"], ["--category","person","--limit","20"], ["--category","preference"]. ' +
      'Project memory of this repo (MEMORY-6, owner/team; recall it before working on the repo): ["--project"]. ' +
      'Private notes are left out unless asked for: ["--category","private"] (only that person or the owner, in a conversation with them; never repeat them to anyone else, MEMORY-7). ' +
      'The owner may read someone else\'s memory: ["--person","tofu"] (declared person id or Discord user id). ' +
      "Acting user from CORVIDINHO_ACTING_DISCORD_USER_ID.",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const refused = refuseArgvIdentity(ctx.args);
      if (refused) return refused;
      const env = process.env;
      const project = boolFlag(ctx.args, "--project");
      const personRef = flagValue(ctx.args, "--person");
      if (project && personRef !== undefined) {
        return { ok: false, error: "usage: memory-recall takes --project or --person, not both", exitCode: 1 };
      }
      const user = actingUser(env);
      if (!user && !project) return NO_ACTOR;
      // Forgotten content stays forgotten for non-admins (MEMORY-ACL-4).
      const includeDeleted = boolFlag(ctx.args, "--include-deleted");
      if (includeDeleted && !(await actingIsAdmin(env, user))) {
        return ACL_DENIED;
      }
      const category =
        flagValue(ctx.args, "--category") ?? positionalAfterFlags(ctx.args)[0];
      const queryFlag = flagValue(ctx.args, "--query");
      const pos = positionalAfterFlags(ctx.args);
      const queryFromPos = (
        category && !flagValue(ctx.args, "--category") ? pos.slice(1) : pos
      )
        .join(" ")
        .trim();
      const query = queryFlag ?? (queryFromPos || undefined);
      const limitRaw = flagValue(ctx.args, "--limit");
      const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
      const wantsPrivate = category === PRIVATE_NOTE_CATEGORY;
      let scopes: string[];
      let heading: string | null = null;
      if (project) {
        if (!(await mayUseProjectMemory(env))) return PROJECT_DENIED;
        if (wantsPrivate) {
          return { ok: false, error: "refused: a project has no private notes (MEMORY-7)", exitCode: 1 };
        }
        const p = projectScopeFor(ctx.cwd || process.cwd());
        scopes = [p.scope];
        heading = `Project memory of ${p.key} (MEMORY-6):`;
      } else {
        const pick = await pickSubject(env, user, personRef);
        if (!pick.ok) return pick.result;
        // MEMORY-7: private notes only in a conversation with that person or the owner.
        if (wantsPrivate && !inConversation(env)) return PRIVATE_NEEDS_CONVERSATION;
        scopes = pick.subject.readScopes;
        const label = subjectLabel(pick.subject);
        if (wantsPrivate) {
          heading = `Private notes of ${label} — for them and the owner only; never repeat them to anyone else or where others can read them (MEMORY-7):`;
        } else if (!pick.self) {
          heading = `Memory of ${label} (owner view; private to them and the owner, MEMORY-7):`;
        }
      }
      const { store, close } = openStore(env);
      try {
        const rows = store.recall({
          ownerUserId: scopes[0]!,
          scopes,
          category: category || undefined,
          query: query || undefined,
          limit: Number.isFinite(limit) ? limit : undefined,
          includeDeleted,
        });
        const listing =
          rows.length === 0
            ? "(no memories)"
            : rows
                .map(
                  (r) =>
                    `${r.id}\t${r.category}\t${r.key}\t${r.content.slice(0, 80)}`,
                )
                .join("\n");
        return {
          ok: true,
          data: rows,
          message: ctx.json ? undefined : heading ? `${heading}\n${listing}` : listing,
          exitCode: 0,
        };
      } catch (err) {
        return errResult(err);
      } finally {
        close();
      }
    },
  },
  {
    name: "memory-profile",
    description:
      "Show a person's profile (MEMORY-5): their role (from the owner's people list), projects, preferences and a history of their decisions, asks and approvals; private notes only counted. " +
      'argv examples: [] (the acting user\'s own), ["--person","tofu"] (owner only: a declared person id or Discord user id). ' +
      "Acting user from CORVIDINHO_ACTING_DISCORD_USER_ID.",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const refused = refuseArgvIdentity(ctx.args);
      if (refused) return refused;
      const env = process.env;
      const user = actingUser(env);
      if (!user) return NO_ACTOR;
      const pick = await pickSubject(env, user, flagValue(ctx.args, "--person"));
      if (!pick.ok) return pick.result;
      const { store, close } = openStore(env);
      try {
        const profile = buildMemoryProfile(store, pick.subject);
        return {
          ok: true,
          data: profile,
          message: ctx.json ? undefined : formatMemoryProfile(profile, pick.subject),
          exitCode: 0,
        };
      } catch (err) {
        return errResult(err);
      } finally {
        close();
      }
    },
  },
  {
    name: "memory-forget-me",
    description:
      "The acting user asks to be forgotten (MEMORY-ACL-6). Call when the user asks you to forget them / delete what you know about them. " +
      "It asks the owner on a Discord Approve/Deny card; nothing is forgotten until the owner approves (no answer within a day is no), and the user is told the outcome. " +
      "argv: [] (always the acting user; never someone else).",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const refused = refuseArgvIdentity(ctx.args);
      if (refused) return refused;
      const env = process.env;
      const user = actingUser(env);
      if (!user) return NO_ACTOR;
      if (ctx.args.some((a) => a.trim() !== "")) {
        return {
          ok: false,
          error: "usage: memory-forget-me takes no arguments — it is always the acting user asking about themselves",
          exitCode: 1,
        };
      }
      if (!inConversation(env)) {
        return {
          ok: false,
          error:
            "refused: a forget request comes from the person themself in a conversation with me (a Discord message or command), never from a schedule or another run (MEMORY-ACL-6)",
          exitCode: 2,
        };
      }
      const { dir, owner } = await loadPeopleForMemory(env);
      if (!owner) {
        return {
          ok: false,
          error: "refused: no owner is configured, so nobody can approve a forget request (IDENTITY-3)",
          exitCode: 2,
        };
      }
      const subject = memorySubjectFor(dir, user);
      if (!subject) return NO_ACTOR;
      const { db, close } = openStore(env);
      const audit = (outcome: "started" | "ok" | "error") =>
        appendAudit(
          db,
          {
            action: "memory-forget-request",
            ...auditContextFromEnv(env),
            argsDigest: argsDigest(["forget-me", subject.kind, subject.id]),
            outcome,
          },
          { key: auditKeyFromEnv(env) },
        );
      try {
        try {
          audit("started");
        } catch (err) {
          return {
            ok: false,
            error: `refused: audit log unavailable for a forget request (SAFE-5): ${err instanceof Error ? err.message : String(err)}`,
            exitCode: 2,
          };
        }
        let made;
        try {
          made = new ForgetRequestStore({ db }).request({
            subject,
            requesterUserId: user,
            originChannelId: env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID,
            originParentChannelId: env.CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID,
          });
        } catch (err) {
          try {
            audit("error");
          } catch {
            /* the refusal stands */
          }
          return errResult(err);
        }
        try {
          audit("ok");
        } catch {
          /* started row is written; the request stands */
        }
        const r = made.request;
        const hours = Math.round(FORGET_REQUEST_TTL_MS / 3_600_000);
        return {
          ok: true,
          data: { requestId: r.id, status: r.status, created: made.created, expiresAt: r.expiresAt },
          message: made.created
            ? `Asked the owner to approve forgetting what I remember about you (request ${r.id}). Nothing is forgotten until they approve on their Approve/Deny card; no answer within ${hours} h means no. You will be told the outcome.`
            : `Already waiting for the owner on your forget request (request ${r.id}); nothing is forgotten until they approve.`,
          exitCode: 0,
        };
      } finally {
        close();
      }
    },
  },
  {
    name: "memory-forget",
    description:
      "ADMIN soft-delete a memory by id (own or other). Two-phase (SAFE-4): run without --confirm to get a token, " +
      "the human must reply with that token in a new message, then run again with --confirm TOKEN. MEMORY-ACL-4. " +
      'argv examples: ["--id","<uuid>"] then ["--id","<uuid>","--confirm","<token>"] (acting admin from bridge env).',
    dangerous: true,
    minTier: 1,
    async handler(ctx) {
      return twoPhase({
        args: ctx.args,
        op: "forget",
        usage: "usage: memory-forget --id MEMORY_ID [--confirm TOKEN]",
        apply: (store, id, actor, isAdmin) =>
          store.forget({ actorUserId: actor, id, isAdmin }),
      });
    },
  },
  {
    name: "memory-override",
    description:
      "ADMIN overwrite memory content by id (own or other). Two-phase (SAFE-4): run without --confirm to get a token, " +
      "the human must reply with that token in a new message, then run again with --confirm TOKEN and the same content. MEMORY-ACL-3/4. " +
      'argv examples: ["--id","<uuid>","--content","new text"] then ["--id","<uuid>","--confirm","<token>","--content","new text"].',
    dangerous: true,
    minTier: 1,
    async handler(ctx) {
      let content = flagValue(ctx.args, "--content");
      if (!content) {
        const pos = positionalAfterFlags(ctx.args);
        content = (flagValue(ctx.args, "--id") ? pos : pos.slice(1)).join(" ");
      }
      const finalContent = content;
      return twoPhase({
        args: ctx.args,
        op: "override",
        content: finalContent,
        usage:
          "usage: memory-override --id MEMORY_ID [--confirm TOKEN] <content>",
        apply: (store, id, actor, isAdmin) =>
          store.override({ actorUserId: actor, id, content: finalContent, isAdmin }),
      });
    },
  },
];
