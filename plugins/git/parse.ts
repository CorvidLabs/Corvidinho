/**
 * Pure parsers for git plugin output (PLUGIN-1 / REQ-plugins-182).
 * Porcelain / -z formats only, so filenames with spaces or quotes stay exact.
 */

export type StatusEntry = {
  /** Porcelain v1 X: index (staged) status. */
  index: string;
  /** Porcelain v1 Y: worktree status. */
  worktree: string;
  path: string;
  /** Source path of a rename / copy. */
  origPath?: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflicted: boolean;
};

export type StatusResult = {
  /** Current branch; null when HEAD is detached. */
  branch: string | null;
  detached: boolean;
  /** True before the first commit on the branch. */
  initial: boolean;
  upstream: string | null;
  upstreamGone: boolean;
  ahead: number;
  behind: number;
  clean: boolean;
  entries: StatusEntry[];
  staged: string[];
  unstaged: string[];
  untracked: string[];
  conflicted: string[];
};

type BranchHeader = Pick<
  StatusResult,
  "branch" | "detached" | "initial" | "upstream" | "upstreamGone" | "ahead" | "behind"
>;

function emptyHeader(): BranchHeader {
  return {
    branch: null,
    detached: false,
    initial: false,
    upstream: null,
    upstreamGone: false,
    ahead: 0,
    behind: 0,
  };
}

function parseBranchHeader(line: string): BranchHeader {
  const out = emptyHeader();
  let s = line.slice(3);
  const initial = /^(?:No commits yet on|Initial commit on) /.exec(s);
  if (initial) {
    out.initial = true;
    out.branch = s.slice(initial[0].length);
    return out;
  }
  if (s.startsWith("HEAD (no branch)")) {
    out.detached = true;
    return out;
  }
  const tracked = /^(.*?) \[(.*)\]$/.exec(s);
  let track = "";
  if (tracked) {
    s = tracked[1]!;
    track = tracked[2]!;
  }
  const sep = s.indexOf("...");
  if (sep >= 0) {
    out.branch = s.slice(0, sep);
    out.upstream = s.slice(sep + 3) || null;
  } else {
    out.branch = s;
  }
  out.upstreamGone = track === "gone";
  const ahead = /ahead (\d+)/.exec(track);
  const behind = /behind (\d+)/.exec(track);
  if (ahead) out.ahead = Number(ahead[1]);
  if (behind) out.behind = Number(behind[1]);
  return out;
}

/** Parse `git status --porcelain=v1 -z --branch` output. */
export function parseStatusPorcelainZ(stdout: string): StatusResult {
  const fields = stdout.split("\0");
  let header = emptyHeader();
  const entries: StatusEntry[] = [];
  for (let i = 0; i < fields.length; i++) {
    const rec = fields[i]!;
    if (!rec) continue;
    if (rec.startsWith("## ")) {
      header = parseBranchHeader(rec);
      continue;
    }
    if (rec.length < 4) continue;
    const x = rec[0]!;
    const y = rec[1]!;
    const path = rec.slice(3);
    let origPath: string | undefined;
    if (x === "R" || x === "C" || y === "R" || y === "C") {
      origPath = fields[++i];
    }
    const untracked = x === "?" && y === "?";
    const conflicted =
      x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D");
    const ignored = x === "!" && y === "!";
    entries.push({
      index: x,
      worktree: y,
      path,
      ...(origPath ? { origPath } : {}),
      staged: !untracked && !ignored && !conflicted && x !== " ",
      unstaged: !untracked && !ignored && !conflicted && y !== " ",
      untracked,
      conflicted,
    });
  }
  return {
    ...header,
    clean: entries.length === 0,
    entries,
    staged: entries.filter((e) => e.staged).map((e) => e.path),
    unstaged: entries.filter((e) => e.unstaged).map((e) => e.path),
    untracked: entries.filter((e) => e.untracked).map((e) => e.path),
    conflicted: entries.filter((e) => e.conflicted).map((e) => e.path),
  };
}

export type NameStatusEntry = {
  /** A / M / D / R / C / T / U (score stripped). */
  status: string;
  path: string;
  origPath?: string;
};

/** Parse `git diff --name-status -z` output. */
export function parseNameStatusZ(stdout: string): NameStatusEntry[] {
  const fields = stdout.split("\0");
  const out: NameStatusEntry[] = [];
  for (let i = 0; i < fields.length; i++) {
    const code = fields[i]!;
    if (!code) continue;
    const status = code[0]!;
    if (status === "R" || status === "C") {
      const from = fields[++i] ?? "";
      const to = fields[++i] ?? "";
      out.push({ status, path: to, origPath: from });
    } else {
      out.push({ status, path: fields[++i] ?? "" });
    }
  }
  return out;
}

export type PushRefResult = {
  /** Porcelain flag: ' ' ff, '*' new, '=' up to date, '!' rejected, '+' forced, '-' deleted. */
  flag: string;
  from: string;
  to: string;
  summary: string;
};

/** Parse the ref lines of `git push --porcelain` stdout. */
export function parsePushPorcelain(stdout: string): PushRefResult[] {
  const out: PushRefResult[] = [];
  for (const line of stdout.split("\n")) {
    const m = /^([ +\-*!=])\t([^\t]*)\t(.*)$/.exec(line);
    if (!m) continue;
    const [from = "", to = ""] = m[2]!.split(":");
    out.push({ flag: m[1]!, from, to, summary: m[3]!.trim() });
  }
  return out;
}

/**
 * OWNER/REPO from a remote URL (https, ssh, scp-like, file:// or local path):
 * the last two path segments with `.git` stripped. Null when unparseable.
 */
export function repoSlugFromRemoteUrl(url: string): string | null {
  let s = url.trim();
  if (!s) return null;
  let path: string;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    try {
      path = new URL(s).pathname;
    } catch {
      return null;
    }
  } else {
    s = s.replace(/[?#].*$/, "");
    const colon = s.indexOf(":");
    const slash = s.indexOf("/");
    if (colon > 0 && (slash < 0 || colon < slash)) {
      // scp-like: [user@]host:owner/repo.git
      path = s.slice(colon + 1);
    } else {
      path = s;
    }
  }
  const segs = path
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p.length > 0 && p !== ".");
  if (segs.length < 2) return null;
  const owner = segs[segs.length - 2]!;
  const repo = segs[segs.length - 1]!.replace(/\.git$/i, "");
  if (!owner || !repo || owner === ".." || repo === "..") return null;
  return `${owner}/${repo}`;
}

/** Redact `scheme://userinfo@` credentials embedded in URLs. */
export function redactUrlCredentials(text: string): string {
  return text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1***@");
}
