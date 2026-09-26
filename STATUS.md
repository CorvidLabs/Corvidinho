# STATUS — Corvidinho

**As of:** 2026-09-26 (America/Denver)

| Item | State |
|------|--------|
| Repo | Bootstrap / HI + allowlists + prove-before-done + SpecSync wiring + HEAR thin + attribution + thinking status + slash + rate/mute |
| Default product | Linux-first **headless** Bun/TS agent CLI (any caller execs it; not a product UI) |
| HI | Captured under `hi/` (11 families incl. ALLOW/WALLET) — see `hi check` |
| Allowlists | **Default-deny** (empty = refuse). File + env on bot VM. See below. |
| Fledge | `fledge.toml` verify lane: lint + smoke + test + **spec-check** (Merlin pattern) |
| SpecSync | Agent tools `specsync-list/read/check/brief` + plan-time briefing; SDD ON; CI Spec Sync Action still dedicated |
| Trust / Augur / Attest | **Not** wired — do not re-add Trust thrash on this bootstrap |
| Merge policy | Merge when verify + SpecSync change cycle are green (Leif/CoS standing order) |

## Not inventing

ACCESS, bounty, MainNet product surfaces. No on-chain identity in v1. Do not invent HI/AC.

## ROADMAP (living)

Honest, issue-tied. Update this section when milestones land — do not invent status.

### Done (cite PRs / issues)

| Slice | Issues → PR | What landed |
|-------|-------------|-------------|
| BOOT | #1 | HI capture + Fledge + SpecSync CI |
| ORIGIN | #2 | Lineage docs (`docs/ORIGIN.md`) |
| Plugin host + GH reads | #6 + #4 → [#15](https://github.com/CorvidLabs/Corvidinho/pull/15) | Fledge plugin host + Octokit typed GH reads + GITHUB-6 deny gate |
| Default-deny allowlists | #16 → [#18](https://github.com/CorvidLabs/Corvidinho/pull/18) | ALLOW/WALLET HI + file/env allowlists (empty = deny-all); wallets deferred |
| Prove-before-done | #7 → [#17](https://github.com/CorvidLabs/Corvidinho/pull/17) | Agent loop refuses done until Fledge verify passes (AGENT-4 / FLEDGE-2) |
| SpecSync agent wiring | #8 → [#22](https://github.com/CorvidLabs/Corvidinho/pull/22) | Plan-time list/read (`spec_loader`) + verify-lane `spec-check`; typed SpecSync plugins |
| HEAR thin | #5 → [#23](https://github.com/CorvidLabs/Corvidinho/pull/23) | Discord bridge: mention→session stub, reply/thread continuity, allowlisted channels; no ProcessManager |
| Attribution helper | #20 → [#24](https://github.com/CorvidLabs/Corvidinho/pull/24) | Shared “Made with Corvidinho” markdown/plain constants + `corvidinho attribution` CLI (no @handles) |
| HEAR thinking status | #10 → [#25](https://github.com/CorvidLabs/Corvidinho/pull/25) | DISCORD-3 edit-in-place progress (elapsed, tool, rough tokens); no ProcessManager |
| HEAR slash commands | #11 → [#26](https://github.com/CorvidLabs/Corvidinho/pull/26) | DISCORD-4 thin `/session` `/status` `/agents` `/work`; channel re-check; no ProcessManager |
| HEAR rate limits + mutes | #12 → (this PR) | DISCORD-6 per-user sliding window + in-memory mute; peers unaffected; no ProcessManager |

### In flight / next

| Order | Issue | Notes |
|-------|-------|--------|
| Go-live | [#5](https://github.com/CorvidLabs/Corvidinho/issues/5) HEAR thin **shipped** (code) | Still needs Leif/CoS: `DISCORD_TOKEN` + **non-empty** Discord channel allowlists on the VM |
| Polish | [#13](https://github.com/CorvidLabs/Corvidinho/issues/13)–[#14](https://github.com/CorvidLabs/Corvidinho/issues/14) | Remaining Discord polish after rate/mute (#12) |
| Listen | [#19](https://github.com/CorvidLabs/Corvidinho/issues/19) WATCH: GitHub mention/review ingress | Webhook or poll → session on allowlisted targets; **not** typed reads alone |
| Defer | [#9](https://github.com/CorvidLabs/Corvidinho/issues/9) iced/billing/Windows; WALLET ACT | Explicit do-not-steal-now / no wallet ACT until approved-wallet list |

### Leif config moments

**PREPARE NOW (no secrets required in repo):**

- Draft `~/.config/corvidinho/allowlist.toml` (copy shape from **Allowlists** below) for GH orgs/repos/users and Discord channels/roles/users — write the file **empty/deny-all** today; fill lists when ready
- Decide Discord channel IDs + admin/user IDs + GH allowlists offline

**GO-LIVE for Discord HEAR (#5 thin shipped):**

- `DISCORD_TOKEN` or `DISCORD_BOT_TOKEN` in VM env/secret store (never commit)
- Non-empty Discord channel allowlist: `DISCORD_CHANNEL_IDS` and/or `CORVIDINHO_DISCORD_ALLOW_CHANNELS` / `~/.config/corvidinho/allowlist.toml` `[discord].channels` — empty = refuse start (not Merlin BASIC)
- Optional user/role allowlists (empty = deny-all when those gates apply)
- Then: `corvidinho discord bridge` (or `CORVIDINHO_DISCORD_DRY_RUN=1` for local dry-run)

**GitHub secrets useful when:**

- `GITHUB_TOKEN` / `GH_TOKEN` — useful **NOW** for typed read plugins (list PRs/issues/CI) on allowlisted repos
- GitHub App / webhook secret / poll credentials — useful when **#19** mention/listen ingress ships (not required for typed reads alone)

### Discord @bot + reply → session

Thin slice **landed** (`corvidinho discord bridge`). Live @bot works **only after** the VM has token + non-empty Discord allowlists (see go-live below).

### GitHub mention → agent response

**Not yet** — typed Octokit reads only (#4/#15). Tracked by [#19](https://github.com/CorvidLabs/Corvidinho/issues/19). No reply to random mentions (ALLOW-1).

### “Made with Corvidinho” attribution

[#20](https://github.com/CorvidLabs/Corvidinho/issues/20) → [#24](https://github.com/CorvidLabs/Corvidinho/pull/24) **shipped** (`corvidinho attribution` + shared helpers). Use on PR bodies; never @handles.

**HARD RULE (Leif):** attribution is plain text + markdown link **only**:

```text
Made with Corvidinho — https://github.com/CorvidLabs/Corvidinho
```

or markdown:

```markdown
Made with [Corvidinho](https://github.com/CorvidLabs/Corvidinho)
```

**NEVER** use `@Corvidinho` or any `@handle` in the footer (GitHub may notify unrelated users). Helpers shipped in #24; keep using them.

### DOGFOOD / RUNNER (headless CLI flip)

**What Corvidinho is:** a **headless agent CLI** — any caller can `exec` `corvidinho` / Bun entry (Grok bots, Discord bridge, GH ingress, scripts). Dogfood ≠ waiting for a Corvidinho product UI. Bridges are just other callers of the same CLI.

**First flip:** CoS / Corvidinho-bot (Grok stack) shells into `corvidinho` for *real* work — not only Cursor/Grok authoring PRs *into* this repo. Same binary later for Discord/GH callers.

**Useful order (not “become a separate product”):** SpecSync wiring (**#8**) and Discord HEAR thin (**#5**) make the CLI more useful for live callers; they are capability unlocks, not a product-UI gate. Flip when the Grok bot path can honestly exec the CLI for work.

**Honest gaps before first flip (not inventing HI):**

- Full LLM tool loop on top of prove-before-done (#17 landed the gate; loop flesh still open)
- SpecSync agent tools (#8→#22) so the live CLI can list/read/check specs
- For Discord callers: HEAR (#5) + filled allowlists + `DISCORD_TOKEN` on the VM
- For GH @mention callers: ingress (#19) — typed reads alone are not enough
- Attribution (#20→#24) on outbound PRs
- Secrets stay in env/secret store; default-deny allowlists stay empty=refuse

### Phased milestones

1. **Foundation** — done (#1, #2, #15, #18)
2. **Prove loop** — done (#17)
3. **SpecSync wiring** — #8 → #22 (landing; CLI usefulness for live callers)
4. **Discord HEAR** — #5 → #23 thin shipped (go-live = token + allowlists on VM)
5. **Attribution** — #20 → #24 shipped
6. **DOGFOOD / RUNNER** — first flip: CoS/Corvidinho-bot execs headless CLI (#8/#5 help; not a UI milestone)
7. **Discord polish** — #10→#25 thinking status shipped; then #11–#14
8. **GH write / review / mention** — #19 + later GITHUB-2/3/5
9. **Deferred** — #9, wallets

Attribution #20→#24 already shipped.

## Allowlists on the bot VM (ALLOW-4)

Default-deny everywhere: **empty/missing allowlist refuses** targeted GitHub plugin runs and Discord channel posts/listens. Deny overrides always win. **Never** treat empty as allow-all (forbid Merlin empty-permissions → BASIC).

1. Write a config file (preferred), e.g. `~/.config/corvidinho/allowlist.toml`:

```toml
[github]
orgs = ["CorvidLabs"]
repos = ["CorvidLabs/Corvidinho"]
users = ["0xLeif"]
deny_repos = []

[discord]
channels = ["123456789012345678"]
roles = ["admin"]
users = []
```

   Or JSON with the same shape. Override path with `CORVIDINHO_ALLOWLIST_FILE`.

2. Optional env overlays (union onto file when non-empty):
   - `CORVIDINHO_GITHUB_ALLOW_REPOS` / `_ORGS` / `_USERS`
   - `CORVIDINHO_GITHUB_DENY_REPOS` / `_ORGS` / `_USERS`
   - `CORVIDINHO_DISCORD_ALLOW_CHANNELS` / `_ROLES` / `_USERS`
   - `CORVIDINHO_DISCORD_DENY_*`

Secrets (`DISCORD_TOKEN`, `GITHUB_TOKEN`, …) stay in env/secret store — never in the allowlist file committed to git.

### AlgoChat / wallets — deferred

WALLET-1..3 captured in `hi/allow.md`. **No wallet ACT** until an approved-wallet allowlist exists. HEAR (#5) must wire Discord channel/user allowlist checks before go-live.



## READY-FOR-SECRETS (Discord HEAR)

**Milestone:** bridge code accepts token + non-empty allowlists end-to-end; docs/templates shipped; doctor/bridge fail cleanly without secrets.

| Gate | State |
|------|--------|
| `corvidinho discord bridge` thin slice | **Shipped** (this PR / #5) |
| `.env.example` + `allowlist.example.toml` | **Shipped** (no secret values) |
| `docs/DISCORD-GO-LIVE.md` (Developer Portal + VM paths) | **Shipped** |
| Doctor: missing token / empty channels | **Shipped** (clear exit / refuse start) |
| Live token in VM | **Waiting** — CoS/Leif via **secure secret-request room only** (never chat/GitHub paste) |
| Non-empty channel IDs on VM | **Waiting** — same secure path / offline handoff of snowflakes |

**Ping CoS/Leif for secrets ONLY when this milestone is green in code** (merge + doctor checklist ready). Do not ask for tokens before READY-FOR-SECRETS.

## Discord HEAR go-live checklist

Code for #5 is in-tree. Live Discord still needs secrets on the bot VM:

1. `export DISCORD_TOKEN=…` or `DISCORD_BOT_TOKEN=…` (secret store; never commit)
2. Non-empty channels: `DISCORD_CHANNEL_IDS=…` **or** allowlist file / `CORVIDINHO_DISCORD_ALLOW_CHANNELS`
3. Optional: `CORVIDINHO_DISCORD_ALLOW_USERS` / `_ROLES` (empty = deny-all for those checks)
4. `corvidinho doctor` — Discord check should go green
5. `corvidinho discord bridge`

Fixture/unit tests cover mention→session, reply/thread continuity, and allowlist refuse without a live token. Do not block merge on missing token.

## Next

See **ROADMAP** above. Short pointers:

- #5 HEAR thin shipped — set token + non-empty Discord allowlists on VM for live @bot; first DOGFOOD flip = CoS bot execs headless CLI
- Flesh full LLM tool loop on top of prove-before-done + SpecSync plugins
- #19 GH mention/listen ingress; #20 attribution ASAP (footer on PR bodies)
- #10–#14 Discord polish after #5; #9 / wallets deferred
- Keep secrets out of repo; keep verify lane honest; no Trust/attest on bootstrap

## Verify locally

```bash
hi check
bun test
bun src/cli.ts --help
bun src/cli.ts specsync list
bun src/cli.ts plugins list
fledge lanes run verify --non-interactive
```
