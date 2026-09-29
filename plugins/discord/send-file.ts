/**
 * `discord-send-file` (DISCORD-17, REQ-discord-476 / REQ-discord-506): attach
 * a file or image to a reply in the conversation's own Discord channel.
 *
 * - Dangerous (externally visible write): SAFE-1 allowlist, SAFE-5 audit via
 *   runPlugin, and mutating, so ROLES-CHAT-3 refuses it in non-owner runs.
 * - The channel is the one the bridge set for this run
 *   (`CORVIDINHO_DISCORD_REPLY_CHANNEL_ID`, the thread when the talk is in
 *   one); the model cannot name another. No channel ⇒ refused.
 * - DISCORD-5: the bridge's own channel gate runs first, on its channel set
 *   (allowlist file / env ∪ DISCORD_CHANNEL_IDS, REQ-discord-004): a thread
 *   passes as itself or through its parent, as the router serves it
 *   (REQ-discord-212), and a deny on the thread or its parent wins.
 * - DISCORD-8: the acting user the bridge set must be able to view, send and
 *   attach files there too; a check that cannot run refuses.
 * - Caps: Discord's upload limit (8 MB, on the size and on the bytes read;
 *   never more than the cap + 1 byte is read) and a type allowlist (PNG /
 *   JPEG / GIF / WebP by magic bytes; UTF-8 txt / log / md / diff / patch /
 *   json / csv). Text is secret-scrubbed (SAFE-6) before upload.
 * - SAFE-2 protected and secret paths are refused, checked on the path as
 *   given, on where it resolves inside the project root (symlinks followed;
 *   an escape is refused) and on the file actually opened (one descriptor,
 *   final link not followed), so a swap after the checks is refused.
 * - `--git-diff` attaches the worktree diff as a `.diff` file (secret paths
 *   excluded, scrubbed), so a large diff is a file, not a wall of text.
 * - `CORVIDINHO_DISCORD_DRY_RUN=1` posts nothing.
 */

import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  openSync,
  readlinkSync,
  readSync,
} from "node:fs";
import { basename, extname, isAbsolute, normalize, relative, resolve } from "node:path";
import { checkChannel, isChannelDenied } from "../../src/allowlist/discord.ts";
import { tryLoadAllowlist } from "../../src/allowlist/load.ts";
import type { AllowlistConfig } from "../../src/allowlist/types.ts";
import { defangMassMentions } from "../../src/discord/allowed-mentions.ts";
import { mergeChannelIds } from "../../src/discord/config.ts";
import { isMonitoredConversation } from "../../src/discord/permissions.ts";
import {
  requesterCheckFix,
  verifyRequesterCanSend,
  type RequesterCheckResult,
} from "../../src/discord/requester-perms.ts";
import type { PluginCommand, PluginHandlerResult } from "../../src/plugins/types.ts";
import {
  formatErrorLine,
  redactSecretEnvValues,
  scrubSecrets,
} from "../../src/store/scrub.ts";
import { sniffImageMediaType } from "../files/image.ts";
import {
  isProtectedPath,
  isSecretPath,
  SECRET_GIT_EXCLUDE_PATHSPECS,
} from "../files/protectedPaths.ts";
import {
  assertExistingFile,
  isInsideRoot,
  PathEscapeError,
  realRoot,
  resolveProjectPath,
} from "../files/resolvePath.ts";
import { gitRoot, runGit, scrubGitOutput } from "../git/exec.ts";

export const DISCORD_SEND_FILE_NAME = "discord-send-file";

/** Env the bridge sets per spawn: the channel this conversation replies in. */
export const REPLY_CHANNEL_ENV = "CORVIDINHO_DISCORD_REPLY_CHANNEL_ID";
/** Env the bridge sets per spawn: the thread's parent channel, else empty. */
export const REPLY_PARENT_CHANNEL_ENV = "CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID";

/** Discord's default upload limit (8 MB); never raised above it. */
export const DISCORD_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

/** Discord caps message content at 2000; the bridge keeps a margin. */
const CAPTION_MAX_CHARS = 1900;

type ImageType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

/** Image extensions → the type the file's magic bytes must show. */
const IMAGE_EXTENSIONS: Readonly<Record<string, ImageType>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/** Text extensions → upload content type. Text is scrubbed before upload. */
const TEXT_EXTENSIONS: Readonly<Record<string, string>> = {
  ".txt": "text/plain; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".diff": "text/x-diff; charset=utf-8",
  ".patch": "text/x-diff; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
};

export const SEND_FILE_ALLOWED_EXTENSIONS: readonly string[] = [
  ...Object.keys(IMAGE_EXTENSIONS),
  ...Object.keys(TEXT_EXTENSIONS),
];

const MB = (DISCORD_UPLOAD_MAX_BYTES / (1024 * 1024)).toFixed(0);

export const SEND_FILE_DESCRIPTION =
  "Attach a file or image to your reply in this Discord conversation's channel (DISCORD-17; dangerous). " +
  "You CAN send files and images here (screenshots, logs, diffs, charts): never tell the user you cannot send or attach them — call this tool. " +
  `Args: [<path>] for a project file (images: png, jpg/jpeg, gif, webp; text: ${Object.keys(TEXT_EXTENSIONS).join(", ")}; at most ${MB} MB; text is secret-scrubbed), ` +
  'or ["--git-diff"] (add "--staged" for the index) to attach the current diff as a .diff file — send a large diff this way instead of pasting it. ' +
  'Optional ["--caption","short text"]. The channel is always this conversation\'s own (there is no --channel). ' +
  "Refused: .env*, .git, keystores, .specsync, specs, keys and other protected or secret paths, and anything outside the project.";

class SendFileRefused extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
    this.name = "SendFileRefused";
  }
}

type Attachment = {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
  /** Text only: true when the SAFE-6 scrub changed something. */
  scrubbed: boolean;
};

function refuse(message: string, exitCode = 3): PluginHandlerResult {
  return { ok: false, error: message, exitCode };
}

type ParsedArgs = {
  path?: string;
  gitDiff: boolean;
  staged: boolean;
  caption?: string;
};

function parseArgs(args: readonly string[]): ParsedArgs {
  const out: ParsedArgs = { gitDiff: false, staged: false };
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    const flag = a.split("=")[0]!;
    if (flag === "--channel" || flag === "-c" || flag === "--channel-id") {
      throw new SendFileRefused(
        "refused: discord-send-file always attaches in this conversation's own channel, which the bridge sets; a --channel cannot be chosen (DISCORD-17). Nothing was sent.",
        3,
      );
    }
    if (a === "--git-diff") {
      out.gitDiff = true;
    } else if (a === "--staged" || a === "--cached") {
      out.staged = true;
    } else if (flag === "--caption" || flag === "-m" || flag === "--content") {
      const v = a.includes("=") ? a.slice(flag.length + 1) : args[++i];
      if (v === undefined) throw new SendFileRefused(`missing value for ${flag}`, 1);
      out.caption = v;
    } else if (flag === "--path" || flag === "--file") {
      const v = a.includes("=") ? a.slice(flag.length + 1) : args[++i];
      if (v === undefined) throw new SendFileRefused(`missing value for ${flag}`, 1);
      positional.push(v);
    } else if (a.startsWith("-")) {
      throw new SendFileRefused(`unknown flag: ${a}`, 1);
    } else {
      positional.push(a);
    }
  }
  if (positional.length > 1) {
    throw new SendFileRefused("one file per call: pass a single <path>", 1);
  }
  if (positional[0] !== undefined) out.path = positional[0];
  if (out.gitDiff && out.path !== undefined) {
    throw new SendFileRefused("pass either <path> or --git-diff, not both", 1);
  }
  if (out.staged && !out.gitDiff) {
    throw new SendFileRefused("--staged only applies with --git-diff", 1);
  }
  return out;
}

/**
 * DISCORD-5 for the conversation's channel, judged as the bridge judges where
 * it talks: on the bridge's channel set (allowlist file +
 * `CORVIDINHO_DISCORD_ALLOW_CHANNELS` ∪ `DISCORD_CHANNEL_IDS`,
 * REQ-discord-004) with `isMonitoredConversation`, the router's own check
 * (REQ-discord-212): a thread passes when it or its parent is allowlisted,
 * and a deny on the thread or its parent wins (REQ-plugins-005). Null when it
 * passes, else the refusal (the `checkChannel` "is denied" / "not
 * allowlisted" error).
 */
function conversationChannelRefusal(
  channelId: string,
  parentChannelId: string,
  allowlist: AllowlistConfig,
  env: NodeJS.ProcessEnv,
): string | null {
  const cfg: AllowlistConfig = {
    ...allowlist,
    discord: { ...allowlist.discord, channels: mergeChannelIds(allowlist, env) },
  };
  if (isMonitoredConversation(channelId, parentChannelId, cfg)) return null;
  const denied = [channelId, parentChannelId].find((id) => isChannelDenied(id, cfg));
  const gate = checkChannel(denied ?? (parentChannelId || channelId), cfg);
  return gate.ok ? `not authorized: Discord channel "${channelId}" is not allowlisted` : gate.error;
}

/** Discord-safe display name: letters, digits, dot, dash, underscore. */
function safeFilename(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  return cleaned || "file";
}

/**
 * True when `abs` (inside `root`) must never be attached, judged on its
 * project-relative path: SAFE-2 protected infra (`.env*`, `.git`, `specs`,
 * `*.spec.md`, fledge/bun config, keystores), any `.specsync` state, or a
 * secret path (`.ssh`, keys, credentials).
 */
function refusedPath(root: string, abs: string): boolean {
  const rel = relative(root, abs).split("\\").join("/");
  if (isProtectedPath(rel) || isSecretPath(rel)) return true;
  return rel.split("/").some((part) => part.toLowerCase() === ".specsync");
}

/** Text bytes → scrubbed UTF-8, or a refusal when not text. */
function scrubText(raw: Uint8Array, name: string): { bytes: Uint8Array; scrubbed: boolean } {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    throw new SendFileRefused(`refused: '${name}' is not UTF-8 text. Nothing was sent.`, 2);
  }
  if (text.includes("\u0000")) {
    throw new SendFileRefused(`refused: '${name}' is not UTF-8 text. Nothing was sent.`, 2);
  }
  const clean = scrubSecrets(redactSecretEnvValues(text));
  return { bytes: new TextEncoder().encode(clean), scrubbed: clean !== text };
}

function tooLarge(what: string, size: number): SendFileRefused {
  return new SendFileRefused(
    `refused: ${what} is ${size} bytes, over Discord's ${MB} MB upload limit (${DISCORD_UPLOAD_MAX_BYTES} bytes). Nothing was sent.`,
    2,
  );
}

/** Bytes read per `readSync` call while filling the capped buffer. */
const READ_CHUNK_BYTES = 64 * 1024;

/**
 * The bytes of `real` (already resolved and checked), read from one
 * descriptor so what is sent is what was checked. The final component is
 * opened without following a link (`real` is resolved, so a link there was
 * swapped in after the checks), and the file the descriptor holds must be a
 * regular file whose own path (from `/proc/self/fd`, which also sees a
 * directory swapped for a link) is still inside the project and not refused.
 * At most the cap + 1 bytes are read: a file over 8 MB, or one that grew past
 * it after its size was taken, is refused without being read into memory.
 */
function readCheckedFile(root: string, real: string, raw: string): Uint8Array {
  let fd: number;
  try {
    fd = openSync(
      real,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK,
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ELOOP") {
      throw new SendFileRefused(
        `refused (SAFE-2): '${raw}' became a symlink after it was checked and is not attached. Nothing was sent.`,
        2,
      );
    }
    throw new SendFileRefused(formatErrorLine(e, { max: 200 }), 1);
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) {
      throw new SendFileRefused(`refused: '${raw}' is not a regular file. Nothing was sent.`, 2);
    }
    let opened: string;
    try {
      opened = readlinkSync(`/proc/self/fd/${fd}`);
    } catch {
      throw new SendFileRefused(
        `refused: could not confirm which file '${raw}' opened, so it is not attached. Nothing was sent.`,
        2,
      );
    }
    // Linux names an unlinked file "<path> (deleted)": judge both spellings.
    const openedPaths = [opened, opened.replace(/ \(deleted\)$/, "")];
    if (openedPaths.some((o) => !isInsideRoot(root, o) || refusedPath(root, o))) {
      throw new SendFileRefused(
        `refused (SAFE-2): '${raw}' changed after it was checked and now opens a protected, secret or outside path; it is never attached. Nothing was sent.`,
        2,
      );
    }
    if (st.size > DISCORD_UPLOAD_MAX_BYTES) throw tooLarge(`'${raw}'`, st.size);
    // It may grow after the fstat: read at most one byte past the cap.
    const limit = DISCORD_UPLOAD_MAX_BYTES + 1;
    let buf = Buffer.alloc(Math.min(Math.max(st.size + 1, READ_CHUNK_BYTES), limit));
    let n = 0;
    for (;;) {
      if (n === buf.length) {
        if (buf.length >= limit) break;
        const grown = Buffer.alloc(Math.min(buf.length * 2, limit));
        buf.copy(grown, 0, 0, n);
        buf = grown;
      }
      const got = readSync(fd, buf, n, buf.length - n, null);
      if (got === 0) break;
      n += got;
    }
    if (n > DISCORD_UPLOAD_MAX_BYTES) {
      throw tooLarge(`'${raw}'`, Math.max(n, fstatSync(fd).size));
    }
    return new Uint8Array(buf.buffer, buf.byteOffset, n);
  } finally {
    closeSync(fd);
  }
}

/** A project file as an attachment, after every path and type check. */
export function fileAttachment(cwd: string, userPath: string): Attachment {
  const raw = userPath.trim();
  if (!raw) throw new SendFileRefused("missing <path>", 1);
  const root = realRoot(cwd);
  const lexical = isAbsolute(raw) ? normalize(raw) : resolve(root, raw);
  if (!isInsideRoot(root, lexical)) {
    throw new SendFileRefused(
      `refused: '${raw}' is outside the project directory. Nothing was sent.`,
      2,
    );
  }
  // The name as given: a protected name is refused whatever it links to.
  if (refusedPath(root, lexical)) {
    throw new SendFileRefused(
      `refused (SAFE-2): '${raw}' is a protected or secret path (.env* / .git / keystores / .specsync / specs / keys) and is never attached. Nothing was sent.`,
      2,
    );
  }
  let real: string;
  try {
    real = resolveProjectPath(root, raw);
    assertExistingFile(real);
  } catch (e) {
    if (e instanceof PathEscapeError) {
      throw new SendFileRefused(`refused: ${e.message}. Nothing was sent.`, 2);
    }
    throw new SendFileRefused(formatErrorLine(e, { max: 200 }), 1);
  }
  // Where it really is: a link to a protected file is refused too.
  if (refusedPath(root, real)) {
    throw new SendFileRefused(
      `refused (SAFE-2): '${raw}' resolves to a protected or secret path and is never attached. Nothing was sent.`,
      2,
    );
  }

  const name = basename(real);
  const ext = extname(name).toLowerCase();
  const imageType = IMAGE_EXTENSIONS[ext];
  const textType = TEXT_EXTENSIONS[ext];
  if (!imageType && !textType) {
    throw new SendFileRefused(
      `refused: '${raw}' is not an allowed type (${SEND_FILE_ALLOWED_EXTENSIONS.join(", ")}). Nothing was sent.`,
      2,
    );
  }
  const data = readCheckedFile(root, real, raw);

  if (imageType) {
    const sniffed = sniffImageMediaType(data.subarray(0, 12));
    if (sniffed !== imageType) {
      throw new SendFileRefused(
        `refused: '${raw}' is not a ${imageType.slice("image/".length).toUpperCase()} image (its bytes do not match its name). Nothing was sent.`,
        2,
      );
    }
    return {
      filename: safeFilename(name),
      contentType: imageType,
      bytes: data,
      scrubbed: false,
    };
  }
  const text = scrubText(data, raw);
  if (text.bytes.byteLength > DISCORD_UPLOAD_MAX_BYTES) {
    throw tooLarge(`'${raw}'`, text.bytes.byteLength);
  }
  return {
    filename: safeFilename(name),
    contentType: textType!,
    bytes: text.bytes,
    scrubbed: text.scrubbed,
  };
}

/**
 * The worktree diff (or the index with `staged`) as a `.diff` attachment.
 * Secret paths are excluded; a secret path that slips through refuses.
 */
export async function gitDiffAttachment(cwd: string, staged: boolean): Promise<Attachment> {
  const r = await gitRoot(cwd);
  if (!r.ok) throw new SendFileRefused(r.error, r.exitCode);
  const which = staged ? ["--cached"] : [];
  const pathspecs = ["--", ...SECRET_GIT_EXCLUDE_PATHSPECS];
  const names = await runGit(
    r.root,
    ["diff", "--name-only", "-z", "--no-ext-diff", ...which, ...pathspecs],
    { literalPathspecs: false },
  );
  if (names.code !== 0) {
    throw new SendFileRefused(`git diff failed: ${formatErrorLine(names.stderr, { max: 200 })}`, 1);
  }
  const files = names.stdout.split("\0").filter(Boolean);
  const secret = files.find((f) => isSecretPath(f));
  if (secret !== undefined) {
    throw new SendFileRefused(
      `refused: the diff touches a secret path ('${secret}'), so it is not attached. Nothing was sent.`,
      2,
    );
  }
  if (files.length === 0) {
    throw new SendFileRefused(
      `no ${staged ? "staged " : ""}changes to attach: the diff is empty. Nothing was sent.`,
      1,
    );
  }
  const d = await runGit(
    r.root,
    ["diff", "--no-color", "--no-ext-diff", "--no-textconv", ...which, ...pathspecs],
    { literalPathspecs: false, maxStdoutBytes: DISCORD_UPLOAD_MAX_BYTES + 1 },
  );
  if (d.code !== 0) {
    throw new SendFileRefused(`git diff failed: ${formatErrorLine(d.stderr, { max: 200 })}`, 1);
  }
  if (d.truncated || d.stdoutBytes > DISCORD_UPLOAD_MAX_BYTES) {
    throw tooLarge("the diff", d.stdoutBytes);
  }
  const clean = scrubGitOutput(redactSecretEnvValues(d.stdout));
  const bytes = new TextEncoder().encode(clean);
  if (bytes.byteLength > DISCORD_UPLOAD_MAX_BYTES) throw tooLarge("the diff", bytes.byteLength);
  return {
    filename: staged ? "staged.diff" : "changes.diff",
    contentType: TEXT_EXTENSIONS[".diff"]!,
    bytes,
    scrubbed: clean !== d.stdout,
  };
}

/** Discord said the upload is over this server's limit (HTTP 413 / code 40005). */
function isTooLargeResponse(status: number, body: string): boolean {
  if (status === 413) return true;
  try {
    return (JSON.parse(body) as { code?: unknown }).code === 40005;
  } catch {
    return false;
  }
}

async function upload(opts: {
  token: string;
  channelId: string;
  attachment: Attachment;
  caption?: string;
}): Promise<PluginHandlerResult> {
  const { attachment } = opts;
  const payload: Record<string, unknown> = {
    // REQ-discord-205: no @everyone/@here, role or user ping from the caption.
    allowed_mentions: { parse: [] },
    attachments: [{ id: 0, filename: attachment.filename }],
  };
  const caption = opts.caption?.trim();
  if (caption) {
    payload.content = defangMassMentions(scrubSecrets(redactSecretEnvValues(caption))).slice(
      0,
      CAPTION_MAX_CHARS,
    );
  }
  const form = new FormData();
  form.append("payload_json", JSON.stringify(payload));
  form.append(
    "files[0]",
    new Blob([Buffer.from(attachment.bytes)], { type: attachment.contentType }),
    attachment.filename,
  );
  let res: Response;
  try {
    res = await fetch(`https://discord.com/api/v10/channels/${opts.channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${opts.token}` },
      body: form,
    });
  } catch (e) {
    return refuse(`discord upload failed: ${formatErrorLine(e, { max: 200 })}`, 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (isTooLargeResponse(res.status, body)) {
      return refuse(
        `refused: Discord says '${attachment.filename}' (${attachment.bytes.byteLength} bytes) is over this server's upload limit. Nothing was sent.`,
        2,
      );
    }
    return refuse(
      `discord API ${res.status}: ${formatErrorLine(body || res.statusText, { max: 200 })}`,
      1,
    );
  }
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return {
    ok: true,
    data: {
      messageId: json.id,
      channelId: opts.channelId,
      filename: attachment.filename,
      bytes: attachment.bytes.byteLength,
      contentType: attachment.contentType,
      scrubbed: attachment.scrubbed,
    },
    message: `attached ${attachment.filename} (${attachment.bytes.byteLength} bytes) in ${opts.channelId}`,
    exitCode: 0,
  };
}

async function handle(ctx: { args: string[]; cwd: string }): Promise<PluginHandlerResult> {
  const args = parseArgs(ctx.args);
  if (!args.gitDiff && args.path === undefined) {
    return refuse(
      'usage: discord-send-file <path> [--caption <text>] | discord-send-file --git-diff [--staged] [--caption <text>]',
      1,
    );
  }

  // The bridge sets the channel per spawn; nothing else can.
  const channelId = process.env[REPLY_CHANNEL_ENV]?.trim() ?? "";
  if (!channelId) {
    return refuse(
      "refused: no Discord conversation for this run — discord-send-file attaches only to a reply in a talk the bridge started (it sets the channel). Nothing was sent.",
    );
  }
  const actingUserId = process.env.CORVIDINHO_ACTING_DISCORD_USER_ID?.trim() ?? "";
  if (!actingUserId) {
    return refuse(
      "refused: no acting Discord user for this run (the bridge sets it); the DISCORD-8 check needs one. Nothing was sent.",
    );
  }

  // DISCORD-5: the conversation's channel passes the gate the bridge serves
  // it by (REQ-discord-212).
  const loaded = await tryLoadAllowlist({ env: process.env });
  if (!loaded.ok) return refuse(`not authorized: ${loaded.error}`);
  const parent = process.env[REPLY_PARENT_CHANNEL_ENV]?.trim() ?? "";
  const gateError = conversationChannelRefusal(channelId, parent, loaded.config, process.env);
  if (gateError !== null) return refuse(gateError);

  const attachment = args.gitDiff
    ? await gitDiffAttachment(ctx.cwd, args.staged)
    : fileAttachment(ctx.cwd, args.path!);

  const token =
    process.env.DISCORD_BOT_TOKEN?.trim() || process.env.DISCORD_TOKEN?.trim() || "";
  if (!token) {
    return refuse("missing DISCORD_TOKEN or DISCORD_BOT_TOKEN (set in env; never commit)", 1);
  }
  const dryRun = process.env.CORVIDINHO_DISCORD_DRY_RUN === "1";

  // DISCORD-8: the acting user must be able to view, send and attach here.
  let check: RequesterCheckResult;
  try {
    check = await verifyRequesterCanSend(channelId, actingUserId, {
      token,
      dryRun,
      attachFiles: true,
    });
  } catch (e) {
    return refuse(
      `refused: could not check that the acting Discord user can attach files in channel ${channelId} (DISCORD-8), so nothing was sent: ${formatErrorLine(e, { max: 200 })}. The check logs in with the Guild Members intent to look the user up: if Server Members Intent is off for the bot in the Discord Developer Portal, turn it on.`,
    );
  }
  if (!check.ok) {
    return {
      ok: false,
      error: `${check.reason} — ${requesterCheckFix(check, channelId, actingUserId)}`,
      exitCode: check.status === 404 ? 4 : 3,
      data: { status: check.status, reason: check.reason },
    };
  }

  if (dryRun) {
    return {
      ok: true,
      data: {
        dryRun: true,
        channelId,
        filename: attachment.filename,
        bytes: attachment.bytes.byteLength,
        contentType: attachment.contentType,
        scrubbed: attachment.scrubbed,
      },
      message: `dry-run: would attach ${attachment.filename} (${attachment.bytes.byteLength} bytes) in ${channelId}`,
      exitCode: 0,
    };
  }
  return upload({ token, channelId, attachment, caption: args.caption });
}

export const discordSendFile: PluginCommand = {
  name: DISCORD_SEND_FILE_NAME,
  description: SEND_FILE_DESCRIPTION,
  dangerous: true,
  mutating: true,
  minTier: 1,
  async handler(ctx) {
    try {
      return await handle(ctx);
    } catch (e) {
      if (e instanceof SendFileRefused) return refuse(e.message, e.exitCode);
      return refuse(formatErrorLine(e, { max: 200 }), 1);
    }
  },
};
