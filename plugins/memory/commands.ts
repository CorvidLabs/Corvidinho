/**
 * Memory plugins (PLUGIN-1 / REQ-plugins-010), hardened per REQ-plugins-011.
 *
 * argv is model-controlled in the tool loop, so the acting user, ADMIN, and
 * the store path never come from argv — only from the env the Discord bridge
 * sets per spawn. ADMIN is re-checked here at handler time against the live
 * admin config (ADMIN-4 / DISCORD-7; empty ⇒ deny-all). Forget/override by
 * id ask the owner on a DM Approve card with a one-time code, which is their
 * SAFE-4 two-phase confirm (SAFE-18.a, src/memory/card.ts): the call waits
 * for the answer and changes the memory only on an approval it uses once.
 * There is no typed confirm token any more, and with no running Discord
 * bridge to deliver the card (the local CLI, a schedule) they refuse.
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
 *
 * GitHub (MEMORY-8, #67 / REQ-plugins-067): a WATCH run has no Discord actor;
 * the poller sets the commenter's GitHub login / numeric id and the thread's
 * repo (`CORVIDINHO_ACTING_GITHUB_LOGIN` / `_ID` / `_REPO`, never argv). The
 * commenter's declared person (people list re-read now, matched on the
 * GitHub numeric id only — the login never counts, IDENTITY-7.a) saves and
 * recalls their own profile, as on Discord; anyone undeclared (or with no id)
 * gets community scope: this repo's project memory read-only
 * (`memory-recall --project`) and nothing saved. Project writes, `--person`,
 * private notes and forget-me stay off on GitHub (a WATCH run is community
 * and its thread is public, MEMORY-7). A search (`--query`) is ranked by
 * relevance, then recency (MEMORY-9, src/memory/rank.ts). On GitHub a forget
 * ask is a comment to the watch user that says "forget me", which the WATCH
 * poller records for the owner's card itself (MEMORY-ACL-6.a,
 * src/watch/forget-me.ts); `memory-forget-me` in a WATCH run says so.
 *
 * Shown only privately (MEMORY-7.a, #101 / REQ-plugins-710): a private
 * read — private notes, a profile (`memory-profile`) or the owner's view of
 * someone's memory (`--person`) — never goes to the model in a Discord
 * conversation. Its text rides `privateText` (kept off `data` and `message`)
 * to the bridge, which sends it to the person who asked in a direct message;
 * the model gets only a "sent privately" placeholder, so nothing it writes
 * can repeat it in a shared channel. With nowhere private to show it — a
 * GitHub thread, a schedule — the read is refused; the local CLI (no role
 * session) shows it on the operator's own terminal as before.
 */

import { appendAudit, argsDigest, auditContextFromEnv, auditKeyFromEnv } from "../../src/audit/log.ts";
import {
  askMemoryCard,
  buildMemoryProfile,
  FORGET_REQUEST_TTL_MS,
  ForgetRequestStore,
  formatMemoryProfile,
  loadPeopleForMemory,
  MEMORY_CARD_NOTHING_DONE,
  MEMORY_ACL_DENIED,
  MemoryAclError,
  memorySubjectFor,
  memorySubjectForGithub,
  memorySubjectForRef,
  MemoryNotFoundError,
  MemoryStore,
  MemoryValidationError,
  PRIVATE_NOTE_CATEGORY,
  projectScopeFor,
  projectScopeForRepo,
  sameSubject,
  subjectLabel,
  type MemoryCardOp,
  type MemorySubject,
} from "../../src/memory/index.ts";
import {
  resolveActingIsAdmin,
  resolveActingRole,
  ROLE_REFUSED_MESSAGE,
  roleSessionActive,
} from "../../src/plugins/roles.ts";
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

/** The GitHub commenter of a WATCH run (MEMORY-8), from the poller-set env only. */
type GithubActor = { login?: string; id?: string; repo?: string };

/**
 * The commenter a GitHub WATCH run acts for: set by the poller
 * (`CORVIDINHO_ACTING_GITHUB_LOGIN` / `_ID`, the thread's `_REPO`), and only
 * when there is no Discord actor (a Discord run is never a GitHub one).
 */
function actingGithub(env: NodeJS.ProcessEnv): GithubActor | null {
  if (actingUser(env)) return null;
  const login = env.CORVIDINHO_ACTING_GITHUB_LOGIN?.trim() ?? "";
  const id = env.CORVIDINHO_ACTING_GITHUB_ID?.trim() ?? "";
  if (!login && !id) return null;
  const repo = env.CORVIDINHO_ACTING_GITHUB_REPO?.trim() ?? "";
  return { ...(login ? { login } : {}), ...(id ? { id } : {}), ...(repo ? { repo } : {}) };
}

const NO_ACTOR: PluginHandlerResult = {
  ok: false,
  error:
    "refused: no acting user — memory is per-user and the actor is set by the Discord bridge (CORVIDINHO_ACTING_DISCORD_USER_ID) or, for a GitHub commenter, by the WATCH poller (CORVIDINHO_ACTING_GITHUB_LOGIN / _ID)",
  exitCode: 2,
};

/** MEMORY-8: an undeclared GitHub commenter has community scope — project memory read-only, nothing saved. */
const GITHUB_UNDECLARED: PluginHandlerResult = {
  ok: false,
  error:
    "refused: this GitHub user is not on the owner's people list, so nothing is saved or recalled for them personally (MEMORY-8) — this repo's project memory is readable with memory-recall --project",
  exitCode: 2,
};

const GITHUB_NO_REPO: PluginHandlerResult = {
  ok: false,
  error: "refused: this GitHub run names no owner/repo, so there is no project memory to read (MEMORY-8)",
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

const PRIVATE_NOT_ON_GITHUB: PluginHandlerResult = {
  ok: false,
  error:
    "refused: private notes are never read in a GitHub thread — it is public; ask on Discord (MEMORY-7 / MEMORY-8)",
  exitCode: 2,
};

const FORGET_NEEDS_CONVERSATION: PluginHandlerResult = {
  ok: false,
  error:
    "refused: a forget request comes from the person themself in a conversation with me (a Discord message or command), never from a schedule or another run (MEMORY-ACL-6)",
  exitCode: 2,
};

/** MEMORY-ACL-6.a: on GitHub the ask is a comment the poller handles, never this tool. */
const FORGET_ON_GITHUB: PluginHandlerResult = {
  ok: false,
  error:
    'refused: on GitHub a forget request is a comment that @mentions me and says just "forget me" — I then ask the owner, who approves or denies it on their card (MEMORY-ACL-6.a); this tool records nothing here',
  exitCode: 2,
};

/**
 * Project memory (MEMORY-6): the owner and team (people who work on the
 * repo), and the local CLI (no role session) — the owner's own schedules
 * too (DISCORD-SCHEDULE-1.a). Community — undeclared, WATCH, schedules other
 * people create, workers — neither reads nor writes it.
 */
async function mayUseProjectMemory(env: NodeJS.ProcessEnv): Promise<boolean> {
  const role = await resolveActingRole(env);
  return role === null || role === "owner" || role === "team";
}

/** A conversation with the acting person (chat, slash, button), not a schedule. */
function inConversation(env: NodeJS.ProcessEnv): boolean {
  return !!env.CORVIDINHO_DISCORD_REPLY_CHANNEL_ID?.trim();
}

/**
 * The model's whole tool result for a private read sent privately
 * (MEMORY-7.a): it never sees the text, so it cannot repeat it.
 */
export const SENT_PRIVATELY_MESSAGE =
  "sent privately (MEMORY-7.a): this result went only to the person who asked, in a direct message, and is not shown to you — do not guess or repeat what it says; tell them it was sent to them privately";

const PROFILE_NOT_ON_GITHUB: PluginHandlerResult = {
  ok: false,
  error:
    "refused: a profile is shown only privately to that person or the owner, never in a GitHub thread — it is public; ask on Discord (MEMORY-7.a)",
  exitCode: 2,
};

const PRIVATE_VIEW_NEEDS_CONVERSATION: PluginHandlerResult = {
  ok: false,
  error:
    "refused: a profile or the owner's view of someone's memory is shown only privately to that person or the owner, in a conversation with them — never in a schedule or other run's channel (MEMORY-7.a)",
  exitCode: 2,
};

/**
 * Where a private read may be shown (MEMORY-7.a): `dm` — a Discord
 * conversation, privately to the person who asked (the bridge sends
 * `privateText` by direct message); `terminal` — the local CLI, no role
 * session (the operator's own terminal, as before); `none` — a GitHub
 * thread, a schedule or any other run with no private place to show it.
 */
function privateReadSurface(env: NodeJS.ProcessEnv): "dm" | "terminal" | "none" {
  if (actingGithub(env)) return "none";
  if (!roleSessionActive(env)) return "terminal";
  return inConversation(env) ? "dm" : "none";
}

/**
 * A private read's result for a Discord conversation (MEMORY-7.a): the text
 * rides `privateText` to the bridge; `data` and `message` — all the model,
 * the run's events and its output see — are the placeholder.
 */
function sentPrivately(what: "private-notes" | "person-view" | "profile", text: string): PluginHandlerResult {
  return {
    ok: true,
    data: { sentPrivately: true, what },
    message: SENT_PRIVATELY_MESSAGE,
    privateText: text,
    exitCode: 0,
  };
}

/** Rows as the person reading them privately sees them (MEMORY-7.a). */
function privateListing(heading: string, rows: readonly { id: string; category: string; key: string; content: string }[]): string {
  const body =
    rows.length === 0
      ? "(no memories)"
      : rows.map((r) => `- ${r.category}/${r.key}: ${r.content.slice(0, 500)} (id ${r.id})`).join("\n");
  return `${heading}\n${body}`;
}

type SubjectPick =
  | { ok: true; subject: MemorySubject; self: boolean }
  | { ok: false; result: PluginHandlerResult };

/**
 * Whose memory this call reads: the acting person's own — the Discord
 * actor's, or in a GitHub run the commenter's declared person (MEMORY-8) —
 * or, `--person`, owner only (MEMORY-7 / MEMORY-ACL-2), someone else's. A
 * non-owner naming anyone but themselves gets the opaque refusal, known
 * person or not; a GitHub run is never the owner's ADMIN run.
 */
async function pickSubject(env: NodeJS.ProcessEnv, ref: string | undefined): Promise<SubjectPick> {
  const { dir } = await loadPeopleForMemory(env);
  const actor = actingUser(env);
  const github = actingGithub(env);
  const self = actor
    ? memorySubjectFor(dir, actor)
    : github
      ? memorySubjectForGithub(dir, github)
      : null;
  if (!self) {
    if (!github) return { ok: false, result: NO_ACTOR };
    return { ok: false, result: ref === undefined ? GITHUB_UNDECLARED : ACL_DENIED };
  }
  if (ref === undefined) return { ok: true, subject: self, self: true };
  const target = memorySubjectForRef(dir, ref);
  if (target && sameSubject(target, self)) return { ok: true, subject: self, self: true };
  if (!actor || !(await actingIsAdmin(env, actor))) return { ok: false, result: ACL_DENIED };
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

/** SAFE-18.a: the typed confirm token is gone; the card is the confirm. */
function confirmGone(op: MemoryCardOp): PluginHandlerResult {
  return {
    ok: false,
    error: `refused (SAFE-18.a): there are no confirm tokens any more — memory-${op} by id asks the owner on a DM Approve card with a one-time code. Call it once without --confirm and wait for the owner's answer; never ask anyone to type a token`,
    exitCode: 2,
  };
}

/**
 * SAFE-18.a: the card can only be delivered by the running Discord bridge,
 * to a run it started for a conversation with the owner. Anywhere else (the
 * local CLI, a schedule, WATCH) it fails closed — no typed-token fallback.
 */
function cardNeedsBridge(op: MemoryCardOp): PluginHandlerResult {
  return {
    ok: false,
    error: `refused (SAFE-18.a): memory-${op} by id asks the owner on a DM Approve card with a one-time code, and only the running Discord bridge delivers it, from a conversation with the owner (a Discord message or command) — this run has none (the local CLI, a schedule or another run), so ${MEMORY_CARD_NOTHING_DONE} and there is no typed-token fallback. Ask me in a Discord conversation`,
    exitCode: 2,
  };
}

/** The `memory-<op>` refusal for a card that came to no (SAFE-20). */
function cardRefusal(
  op: MemoryCardOp,
  id: string,
  outcome: "denied" | "expired" | "aborted" | "changed" | "unavailable",
  error: string,
  requestId?: string,
): PluginHandlerResult {
  return {
    ok: false,
    error,
    exitCode: outcome === "aborted" ? 130 : 2,
    data: { refused: true, op, id, outcome, ...(requestId ? { request: requestId } : {}) },
  };
}

/**
 * Shared flow for the owner's forget/override by id (SAFE-18.a / SAFE-4):
 * the target is checked, the owner's DM card raised (src/memory/card.ts) and
 * the call waits for the answer. On an approval it uses once, `apply` runs —
 * only while the memory is still exactly what the card showed (same row,
 * not forgotten, not changed since) and the actor is still the owner; else
 * nothing changes. Deny, no answer or a stopped run changes nothing (SAFE-20).
 */
async function ownerCard(opts: {
  args: string[];
  op: MemoryCardOp;
  usage: string;
  content?: string;
  signal?: AbortSignal;
  apply: (store: MemoryStore, id: string, actor: string, isAdmin: boolean) => {
    deletedAt?: number;
    updatedAt: number;
  };
}): Promise<PluginHandlerResult> {
  const refused = refuseArgvIdentity(opts.args);
  if (refused) return refused;
  const env = process.env;
  // The local CLI (no role session): no bridge started this run, so no card
  // can reach the owner — fail closed.
  if (!roleSessionActive(env)) return cardNeedsBridge(opts.op);
  const actor = actingUser(env);
  if (!actor) return NO_ACTOR;
  const id = flagValue(opts.args, "--id") ?? positionalAfterFlags(opts.args)[0];
  if (!id || (opts.op === "override" && !opts.content?.trim())) {
    return { ok: false, error: opts.usage, exitCode: 1 };
  }
  const isAdmin = await actingIsAdmin(env, actor);
  if (!isAdmin) return ACL_DENIED;
  if (flagPresent(opts.args, "--confirm")) return confirmGone(opts.op);
  if (!inConversation(env)) return cardNeedsBridge(opts.op);

  const { db, store, close } = openStore(env);
  try {
    const row = store.getById(id);
    if (!row || row.deletedAt != null) throw new MemoryNotFoundError();
    const target = {
      id: row.id,
      category: row.category,
      key: row.key,
      ownerUserId: row.ownerUserId,
    };
    let asked;
    try {
      asked = await askMemoryCard({
        db,
        op: opts.op,
        row,
        ...(opts.op === "override" ? { content: opts.content } : {}),
        requester: actor,
        surface: auditContextFromEnv(env).surface,
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
    } catch (err) {
      return cardRefusal(
        opts.op,
        row.id,
        "unavailable",
        `refused (SAFE-18.a): the owner's DM card could not be raised or read (${err instanceof Error ? err.message : String(err)}), so ${MEMORY_CARD_NOTHING_DONE}`,
      );
    }
    const what = `memory-${opts.op} of memory ${row.id}`;
    if (!asked.approved) {
      const r = asked.requestId;
      if (asked.outcome === "denied") {
        return cardRefusal(opts.op, row.id, "denied", `refused (SAFE-18.a): the owner denied ${what} on their DM card ${r}, so ${MEMORY_CARD_NOTHING_DONE} (SAFE-20)`, r);
      }
      if (asked.outcome === "aborted") {
        return cardRefusal(opts.op, row.id, "aborted", `stopped (SAFE-18.a): the run was interrupted while waiting for the owner's DM card ${r}, so ${MEMORY_CARD_NOTHING_DONE}`, r);
      }
      return cardRefusal(
        opts.op,
        row.id,
        "expired",
        `refused (SAFE-18.a): no answer on the owner's DM card ${r} for ${what} in time, so ${MEMORY_CARD_NOTHING_DONE} (SAFE-20: no answer means no)`,
        r,
      );
    }

    // Approved with the code and used once: the owner, still, and the memory
    // exactly as the card showed it.
    const changed = () =>
      cardRefusal(
        opts.op,
        row.id,
        "changed",
        `refused (SAFE-18.a): memory ${row.id} changed after the owner's DM card ${asked.requestId} went out, so ${MEMORY_CARD_NOTHING_DONE} — ask again for a card that shows it as it is now`,
        asked.requestId,
      );
    if (!(await actingIsAdmin(env, actor))) return ACL_DENIED;
    const done = db
      .transaction(() => {
        const now = store.getById(row.id);
        if (!now || now.deletedAt != null || now.updatedAt !== row.updatedAt) return null;
        return opts.apply(store, row.id, actor, isAdmin);
      })
      .immediate();
    if (!done) return changed();
    const verb = opts.op === "forget" ? "forgot" : "overrode";
    return {
      ok: true,
      data: {
        op: opts.op,
        ...target,
        actorUserId: actor,
        at: done.deletedAt ?? done.updatedAt,
        request: asked.requestId,
      },
      message: `${verb} memory ${row.id} (${row.category}/${row.key}, owner ${row.ownerUserId}) by ${actor} — approved on the owner's DM card ${asked.requestId} with the one-time code (SAFE-18.a)`,
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
      "On GitHub (a WATCH run) it saves into the commenter's profile when they are on the owner's people list; nothing is saved for anyone else there, and --project is not written from GitHub (MEMORY-8). " +
      "Acting user comes from CORVIDINHO_ACTING_DISCORD_USER_ID (bridge sets it), or the GitHub commenter the WATCH poller sets.",
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
      if (!user && !actingGithub(env) && !project) return NO_ACTOR;
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
        // MEMORY-8: project memory is read-only from GitHub, whoever comments.
        if (actingGithub(env) || !(await mayUseProjectMemory(env))) return PROJECT_DENIED;
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
        const pick = await pickSubject(env, undefined);
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
      "Call BEFORE claiming you do not know who the user is or facts about them/people/projects (MEMORY-9): search with --query and the key words (names, topics); results are ranked by relevance, then recency. " +
      'argv examples: [] (all), ["--category","person"], ' +
      '["--query","Leif"], ["--category","person","--limit","20"], ["--category","preference"]. ' +
      'Project memory of this repo (MEMORY-6, owner/team; recall it before working on the repo): ["--project"]. ' +
      'Private notes are left out unless asked for: ["--category","private"] (only that person or the owner, in a conversation with them; never repeat them to anyone else, MEMORY-7). ' +
      'The owner may read someone else\'s memory: ["--person","tofu"] (declared person id or Discord user id). ' +
      "Private notes and the owner's --person view are sent privately to the person who asked, in a direct message, and never shown to you or in the channel: you get only a \"sent privately\" note — tell them to check their DMs (MEMORY-7.a). " +
      "On GitHub (a WATCH run) it recalls the commenter's own memory when they are on the owner's people list, and --project reads this thread's repo memory for anyone (MEMORY-8); private notes and --person never there. " +
      "Acting user from CORVIDINHO_ACTING_DISCORD_USER_ID, or the GitHub commenter the WATCH poller sets.",
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
      const github = actingGithub(env);
      if (!user && !github && !project) return NO_ACTOR;
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
      // MEMORY-7.a: private notes or the owner's view of someone else's memory.
      let privateRead: { what: "private-notes" | "person-view"; heading: string } | null = null;
      if (project) {
        // MEMORY-8: in a GitHub run anyone reads the thread's repo memory
        // (read-only); elsewhere the owner, team and the local CLI.
        if (!github && !(await mayUseProjectMemory(env))) return PROJECT_DENIED;
        if (wantsPrivate) {
          return { ok: false, error: "refused: a project has no private notes (MEMORY-7)", exitCode: 1 };
        }
        const p = github ? projectScopeForRepo(github.repo) : projectScopeFor(ctx.cwd || process.cwd());
        if (!p) return GITHUB_NO_REPO;
        scopes = [p.scope];
        heading = github
          ? `Project memory of ${p.key} (MEMORY-6; read-only in a GitHub run, MEMORY-8):`
          : `Project memory of ${p.key} (MEMORY-6):`;
      } else {
        // MEMORY-7: private notes never in a (public) GitHub thread.
        if (wantsPrivate && github) return PRIVATE_NOT_ON_GITHUB;
        const pick = await pickSubject(env, personRef);
        if (!pick.ok) return pick.result;
        // MEMORY-7: private notes only in a conversation with that person or the owner.
        if (wantsPrivate && !inConversation(env)) return PRIVATE_NEEDS_CONVERSATION;
        scopes = pick.subject.readScopes;
        const label = subjectLabel(pick.subject);
        if (wantsPrivate) {
          heading = `Private notes of ${label} — for them and the owner only; never repeat them to anyone else or where others can read them (MEMORY-7):`;
          privateRead = {
            what: "private-notes",
            heading: `Private notes of ${label} — only for them and the owner (MEMORY-7.a):`,
          };
        } else if (!pick.self) {
          heading = `Memory of ${label} (owner view; private to them and the owner, MEMORY-7):`;
          privateRead = {
            what: "person-view",
            heading: `Memory of ${label} — owner view, private to them and the owner (MEMORY-7.a):`,
          };
        }
        // MEMORY-7.a: shown only privately; with no private place, refused.
        if (privateRead && privateReadSurface(env) === "none") return PRIVATE_VIEW_NEEDS_CONVERSATION;
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
        if (privateRead && privateReadSurface(env) === "dm") {
          return sentPrivately(privateRead.what, privateListing(privateRead.heading, rows));
        }
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
      "The profile is sent privately to the person who asked, in a direct message, and never shown to you or in the channel: you get only a \"sent privately\" note — tell them to check their DMs; it is refused on GitHub and in schedules (MEMORY-7.a). " +
      'argv examples: [] (the acting user\'s own), ["--person","tofu"] (owner only: a declared person id or Discord user id). ' +
      "Acting user from CORVIDINHO_ACTING_DISCORD_USER_ID.",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const refused = refuseArgvIdentity(ctx.args);
      if (refused) return refused;
      const env = process.env;
      if (!actingUser(env) && !actingGithub(env)) return NO_ACTOR;
      const pick = await pickSubject(env, flagValue(ctx.args, "--person"));
      if (!pick.ok) return pick.result;
      // MEMORY-7.a: a profile read is shown only privately — never in a
      // (public) GitHub thread or a schedule's channel.
      const surface = privateReadSurface(env);
      if (surface === "none") return actingGithub(env) ? PROFILE_NOT_ON_GITHUB : PRIVATE_VIEW_NEEDS_CONVERSATION;
      const { store, close } = openStore(env);
      try {
        const profile = buildMemoryProfile(store, pick.subject);
        if (surface === "dm") return sentPrivately("profile", formatMemoryProfile(profile, pick.subject));
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
      // On GitHub the poller takes the ask from a "forget me" comment (MEMORY-ACL-6.a).
      if (!user) return actingGithub(env) ? FORGET_ON_GITHUB : NO_ACTOR;
      if (ctx.args.some((a) => a.trim() !== "")) {
        return {
          ok: false,
          error: "usage: memory-forget-me takes no arguments — it is always the acting user asking about themselves",
          exitCode: 1,
        };
      }
      if (!inConversation(env)) return FORGET_NEEDS_CONVERSATION;
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
      "Owner only: soft-delete a memory by id (own or anyone's; MEMORY-ACL-4). It asks the owner on a DM Approve/Deny card showing the exact action and target, " +
      "and Approve also needs a one-time code the owner types back (SAFE-18.a / SAFE-19). Call it once and wait: it returns when the owner answers; " +
      "Deny or no answer within 5 minutes means nothing is forgotten (SAFE-20). There are no confirm tokens — never ask anyone to type one. " +
      'Only from a Discord conversation with the owner. argv: ["--id","<uuid>"] (acting user from the bridge env).',
    dangerous: true,
    minTier: 1,
    async handler(ctx) {
      return ownerCard({
        args: ctx.args,
        op: "forget",
        usage: "usage: memory-forget --id MEMORY_ID",
        ...(ctx.signal ? { signal: ctx.signal } : {}),
        apply: (store, id, actor, isAdmin) =>
          store.forget({ actorUserId: actor, id, isAdmin }),
      });
    },
  },
  {
    name: "memory-override",
    description:
      "Owner only: replace a memory's text by id (own or anyone's; MEMORY-ACL-3/4). It asks the owner on a DM Approve/Deny card showing the exact action, target and the new text word for word, " +
      "and Approve also needs a one-time code the owner types back (SAFE-18.a / SAFE-19). Call it once and wait: it returns when the owner answers; " +
      "Deny or no answer within 5 minutes means nothing is changed (SAFE-20). There are no confirm tokens — never ask anyone to type one. " +
      'Only from a Discord conversation with the owner. argv: ["--id","<uuid>","--content","new text"].',
    dangerous: true,
    minTier: 1,
    async handler(ctx) {
      let content = flagValue(ctx.args, "--content");
      if (!content) {
        const pos = positionalAfterFlags(ctx.args);
        content = (flagValue(ctx.args, "--id") ? pos : pos.slice(1)).join(" ");
      }
      const finalContent = content;
      return ownerCard({
        args: ctx.args,
        op: "override",
        content: finalContent,
        usage: "usage: memory-override --id MEMORY_ID <content>",
        ...(ctx.signal ? { signal: ctx.signal } : {}),
        apply: (store, id, actor, isAdmin) =>
          store.override({ actorUserId: actor, id, content: finalContent, isAdmin }),
      });
    },
  },
];
