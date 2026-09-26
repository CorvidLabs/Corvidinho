# STATUS — Corvidinho

**As of:** 2026-09-26 (America/Denver)

| Item | State |
|------|--------|
| Repo | Bootstrap / HI capture + default-deny allowlists + prove-before-done |
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

### In flight / next

| Order | Issue | Notes |
|-------|-------|--------|
| Next | [#5](https://github.com/CorvidLabs/Corvidinho/issues/5) HEAR Discord thin (DISCORD-1,2,5) | **Blocked** on Discord token + non-empty channel (+ user/role) allowlists |
| Polish | [#10](https://github.com/CorvidLabs/Corvidinho/issues/10)–[#14](https://github.com/CorvidLabs/Corvidinho/issues/14) | Discord polish after thin slice |
| Listen | [#19](https://github.com/CorvidLabs/Corvidinho/issues/19) WATCH: GitHub mention/review ingress | Webhook or poll → session on allowlisted targets; **not** typed reads alone |
| Brand | [#20](https://github.com/CorvidLabs/Corvidinho/issues/20) DOGFOOD: “Made with Corvidinho” | Plain-text + link footer on PR bodies (**no @handles**) — **can land ASAP** even pre-runner |
| Defer | [#9](https://github.com/CorvidLabs/Corvidinho/issues/9) iced/billing/Windows; WALLET ACT | Explicit do-not-steal-now / no wallet ACT until approved-wallet list |

### Leif config moments

**PREPARE NOW (no secrets required in repo):**

- Draft `~/.config/corvidinho/allowlist.toml` (copy shape from **Allowlists** below) for GH orgs/repos/users and Discord channels/roles/users — write the file **empty/deny-all** today; fill lists when ready
- Decide Discord channel IDs + admin/user IDs + GH allowlists offline

**WAIT until HEAR #5 wiring:**

- `DISCORD_TOKEN` / bot token in VM env/secret store (never commit)
- Non-empty Discord channel (+ user/role as needed) allowlists — empty = deny-all; bot refuses until set

**GitHub secrets useful when:**

- `GITHUB_TOKEN` / `GH_TOKEN` — useful **NOW** for typed read plugins (list PRs/issues/CI) on allowlisted repos
- GitHub App / webhook secret / poll credentials — useful when **#19** mention/listen ingress ships (not required for typed reads alone)

### Discord @bot + reply → session

Expected **after #5** thin slice lands **and** the VM has token + non-empty allowlists. Not before.

### GitHub mention → agent response

**Not yet** — typed Octokit reads only (#4/#15). Tracked by [#19](https://github.com/CorvidLabs/Corvidinho/issues/19). No reply to random mentions (ALLOW-1).

### “Made with Corvidinho” attribution

[#20](https://github.com/CorvidLabs/Corvidinho/issues/20) — footer on PR bodies can land **ASAP** (even while Cursor/Grok still author Corvidinho PRs). Reviews/Discord embeds follow HEAR #5. Separate from live runner flip.

**HARD RULE (Leif):** attribution is plain text + markdown link **only**:

```text
Made with Corvidinho — https://github.com/CorvidLabs/Corvidinho
```

or markdown:

```markdown
Made with [Corvidinho](https://github.com/CorvidLabs/Corvidinho)
```

**NEVER** use `@Corvidinho` or any `@handle` in the footer (GitHub may notify unrelated users). Encode the same rule in helpers when #20 ships.

### DOGFOOD / RUNNER (headless CLI flip)

**What Corvidinho is:** a **headless agent CLI** — any caller can `exec` `corvidinho` / Bun entry (Grok bots, Discord bridge, GH ingress, scripts). Dogfood ≠ waiting for a Corvidinho product UI. Bridges are just other callers of the same CLI.

**First flip:** CoS / Corvidinho-bot (Grok stack) shells into `corvidinho` for *real* work — not only Cursor/Grok authoring PRs *into* this repo. Same binary later for Discord/GH callers.

**Useful order (not “become a separate product”):** SpecSync wiring (**#8**) and Discord HEAR thin (**#5**) make the CLI more useful for live callers; they are capability unlocks, not a product-UI gate. Flip when the Grok bot path can honestly exec the CLI for work.

**Honest gaps before first flip (not inventing HI):**

- Full LLM tool loop on top of prove-before-done (#17 landed the gate; loop flesh still open)
- SpecSync agent tools (#8/#22 landing) so the live CLI can list/read/check specs
- For Discord callers: HEAR (#5) + filled allowlists + `DISCORD_TOKEN` on the VM
- For GH @mention callers: ingress (#19) — typed reads alone are not enough
- Attribution (#20) preferred on outbound PRs before/at flip (can land earlier)
- Secrets stay in env/secret store; default-deny allowlists stay empty=refuse

### Phased milestones

1. **Foundation** — done (#1, #2, #15, #18)
2. **Prove loop** — done (#17)
3. **SpecSync wiring** — #8 → #22 (landing; CLI usefulness for live callers)
4. **Discord HEAR** — #5 (Discord as a caller of the same CLI)
5. **DOGFOOD / RUNNER** — first flip: CoS/Corvidinho-bot execs headless CLI (#8/#5 help; not a UI milestone)
6. **Discord polish** — #10–#14
7. **GH write / review / mention** — #19 + later GITHUB-2/3/5
8. **Deferred** — #9, wallets

Attribution #20 may ship in parallel anytime (before first flip OK).

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

## Next

See **ROADMAP** above. Short pointers:

- #8 SpecSync agent wiring lands in this PR (#22) — then #5 HEAR unlocks Discord callers; first DOGFOOD flip = CoS bot execs headless CLI
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
