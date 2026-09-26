/**
 * Memory plugins (PLUGIN-1 / REQ-plugins-010), hardened per REQ-plugins-011.
 *
 * argv is model-controlled in the tool loop, so the acting user, ADMIN, and
 * the store path never come from argv — only from the env the Discord bridge
 * sets per spawn. ADMIN is re-checked here at handler time against the live
 * admin config (ADMIN-4 / DISCORD-7; empty ⇒ deny-all). Forget/override are
 * two-phase with a confirm token from a different turn (SAFE-4).
 */

import {
  checkConfirmToken,
  isHumanSuppliedToken,
  issueConfirmToken,
  MEMORY_ACL_DENIED,
  MemoryAclError,
  MemoryNotFoundError,
  MemoryStore,
  MemoryValidationError,
  type ConfirmBinding,
} from "../../src/memory/index.ts";
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
      "Store a durable fact for the acting Discord user (MEMORY / AGENT-7). " +
      "Categories: conversation|entity|person|personality. " +
      'Call when the user states identity/person/project facts. argv example: ' +
      '["--category","person","--key","identity","Leif is the owner"]. ' +
      "Also: [\"person\",\"identity\",\"Leif is the owner\"] positional. " +
      "Acting user comes from CORVIDINHO_ACTING_DISCORD_USER_ID (bridge sets it).",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const refused = refuseArgvIdentity(ctx.args);
      if (refused) return refused;
      const user = actingUser(process.env);
      if (!user) return NO_ACTOR;
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
      const { store, close } = openStore(process.env);
      try {
        const rec = store.store({
          ownerUserId: user,
          category,
          key,
          content,
        });
        return {
          ok: true,
          data: rec,
          message: ctx.json
            ? undefined
            : `stored ${rec.category}/${rec.key} id=${rec.id}`,
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
      "Recall durable facts for the acting Discord user (MEMORY / AGENT-7). " +
      "Call BEFORE claiming you do not know who the user is or facts about them/people/projects. " +
      'argv examples: [] (all), ["--category","person"], ' +
      '["--query","Leif"], ["--category","person","--limit","20"]. ' +
      "Acting user from CORVIDINHO_ACTING_DISCORD_USER_ID.",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const refused = refuseArgvIdentity(ctx.args);
      if (refused) return refused;
      const env = process.env;
      const user = actingUser(env);
      if (!user) return NO_ACTOR;
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
      const { store, close } = openStore(env);
      try {
        const rows = store.recall({
          ownerUserId: user,
          category: category || undefined,
          query: query || undefined,
          limit: Number.isFinite(limit) ? limit : undefined,
          includeDeleted,
        });
        return {
          ok: true,
          data: rows,
          message: ctx.json
            ? undefined
            : rows.length === 0
              ? "(no memories)"
              : rows
                  .map(
                    (r) =>
                      `${r.id}\t${r.category}\t${r.key}\t${r.content.slice(0, 80)}`,
                  )
                  .join("\n"),
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
