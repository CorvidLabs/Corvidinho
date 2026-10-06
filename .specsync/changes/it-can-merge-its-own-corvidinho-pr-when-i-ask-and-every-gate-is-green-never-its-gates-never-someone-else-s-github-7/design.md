---
change: it-can-merge-its-own-corvidinho-pr-when-i-ask-and-every-gate-is-green-never-its-gates-never-someone-else-s-github-7
artifact: design
---

# Design

- **plugins/github/merge.ts** (new): `makeGithubPrMergeCommand(deps)` builds
  `github-pr-merge` (dangerous, mutating, minTier 1) with an injectable
  GitHub client (`SelfMergeOctokit`, the Octokit slice it calls).
  `checkSelfMerge(args, env, deps)` is the one gate, run by the must-ask
  classifier (before any card) and again by the handler (after the owner's
  approval), reading everything fresh: the caller
  (`selfMergeCallerRefusal`), the repo (`SELF_MERGE_REPO` =
  `CORVIDINHO_REPO`, then the GITHUB-6 write gate), the token's user
  (`users.getAuthenticated`), the PR (`pulls.get`), its events
  (`issues.listEvents`: no `ready_for_review` by its own token, and at least
  one by a person — round 13's "only PRs a human has marked ready", so a PR
  it opened ready via `github-pr-create` without `--draft` waits too), its files
  (`pulls.listFiles`, rename old paths too, `selfMergeGatePath`), its reviews
  (`pulls.listReviews`, latest per reviewer), the two required check runs at
  the exact head (`checks.listForRef` with `check_name`, app
  `github-actions`), the whole CI verdict there (`fetchCiStatus`, reused from
  `ciStatus.ts`), and GitHub's `mergeable` / `mergeable_state`. Each refusal
  is `refused (GITHUB-7.a): …` with a fixed reason code. The merge is
  `pulls.merge` with `sha` (the named head), `squash` and
  `<title> (#N)`; no admin or bypass flag exists in the REST call, and
  requiring `clean` / `has_hooks` first means it never relies on an admin
  token's implicit bypass.
- **"Only when I ask"**: `--sha` is required, so the owner's card, the
  approval's action hash and the merge are all about one commit. The caller
  check reuses SAFE-3.a's building blocks (`actingSurface`,
  `SAFE3A_SURFACES`, `TOOL_CHILD_ENV`, `ACTING_SURFACE_ENV`,
  `isScheduleRunEnv`, `isWatchRunEnv`, `delegateDepthFromEnv`,
  `resolveActingRole`) without the talk-worktree condition (the merge runs no
  project code). WATCH is refused by its session id or its `watch` surface
  stamp before any role read: since IDENTITY-12.a (#374) the owner's own
  GitHub-triggered run passes the role gate with the owner's tools, and it is
  still not the owner's own interactive run.
- **Must-ask engine (#316)**: a third command class `merge`
  (`MUST_ASK_POLICY.merge`, criterion GITHUB-7.a) with card kind
  `mustask-merge`, class destructive (Approve plus the one-time code); added
  to `MUST_ASK_CARD_KINDS`, so the bridge's `mustAskApprovalKinds` delivers it
  with no bridge change. Card title `Merge its own PR — only when you ask
  (GITHUB-7.a)`, amount `1 merge (no money)`. A card refusal of a merge sets
  `auditDenied: card-<outcome>`.
- **SAFE-5 with a reason**: `PluginHandlerResult.auditDenied` (a fixed
  kebab-case code). `runPlugin` records a held or handler result that carries
  it as one `denied` row named `<command>:<reason>`; everything else is
  unchanged (`ok` / `error` under the command name). No schema change: the
  reason lives in the existing `action` column, never args.
- **Catalog**: `SELF_MERGE_TOOLS` / `BuildToolsOpts.selfMerge` in
  `tools.ts`; `createTaskExecute` computes the grant per attempt and emits one
  operator line when it holds the tool back. Team / community never get it
  (mutating, not in any team set); the role gate in `runPlugin` still runs
  first.
- **Loop and status**: `github-pr-merge` is a state change
  (`STATE_CHANGING_TOOLS`); `MUST_ASK_WAIT_TEXT_RE` also matches the
  `GITHUB-7.a:` wait line so the Discord thinking status shows the wait; the
  AUTONOMY-11 prompt sentence names merging its own PR among the things that
  ask.
- **Gate paths** (GITHUB-7.a's list plus what it already protects): `.github/`,
  `hi/`, any `fledge.toml`, `.fledge/`, any `AGENTS.md`, any `CODEOWNERS`,
  any `.trust.toml` and any `bunfig.toml` (SAFE-2), SpecSync's config
  (`.specsync/` outside `changes/` and `archive/`), and the merge gate's own
  code (`SELF_MERGE_CODE`: `plugins/github/merge.ts`, `ciStatus.ts`,
  `src/plugins/githubPublic.ts`, `must-ask.ts`, `run.ts`, `roles.ts`,
  `src/agent/shell-gate.ts`, `src/approvals/code.ts`, `store.ts`,
  `src/discord/approval-cards.ts` — the CI verdict, repo gate, caller and
  role checks, must-ask gate and audit rows, and the card's store, code and
  engine).
