---
module: plugins
change: safe-default-deny-allowlists-for-github-orgs-repos-users-and-discord-channels-roles-users-file-env-config-on-bot-vm
---

# Delta — plugins (default-deny allowlists)

## Added

### REQUIREMENT REQ-plugins-005

Allowlists SHALL default-deny: empty or missing allow entries refuse targeted GitHub plugin runs and Discord channel/role/user checks (ALLOW-1..5, GITHUB-6, DISCORD-5). Deny overrides always win. Empty lists MUST NOT map to allow-all or Merlin BASIC.

Acceptance Criteria
- Empty/missing allowlist refuses GH `--repo` targets (exit 3 / not authorized).
- Discord stub `checkChannel`/`checkRole`/`checkUser` refuse when allow lists empty.
- Regression: empty allow never permits a target (Merlin empty→BASIC forbidden).

### REQUIREMENT REQ-plugins-006

Allowlists SHALL load from bot-VM config file (`CORVIDINHO_ALLOWLIST_FILE` or `~/.config/corvidinho/allowlist.toml|json`) with env overlays (ALLOW-4). Secrets stay in env.

Acceptance Criteria
- File path env and default home config paths are consulted.
- Env overlays (e.g. `CORVIDINHO_GITHUB_ALLOW_REPOS`) merge over file.

### REQUIREMENT REQ-plugins-007

The system SHALL expose a Discord allowlist stub API (channel/role/user) for future HEAR (#5) without implementing the full Discord bridge.

Acceptance Criteria
- Exported `checkChannel` / `checkRole` / `checkUser` (or equivalent) honor default-deny + deny override.
- No Discord gateway/bridge process in this change.

## Modified

### REQUIREMENT REQ-plugins-004

GitHub plugins SHALL require `--repo OWNER/REPO` and enforce default-deny allowlists for orgs/repos (and user checks when supplied): empty allow ⇒ refuse; deny always wins; allow match required (GITHUB-6 / ALLOW-1,2,5). Never empty→allow-all.

Acceptance Criteria
- Missing `--repo` exits non-zero with GITHUB-6 message.
- Empty allowlist + any repo ⇒ deny (not authorized).
- Denied repo exits with code 3 and clear error.
- Allow-listed repo/org match ⇒ ok unless also denied.

### SPEC SECTION Change Log

Default-deny allowlists file+env; Discord stub; empty≠BASIC (2026-09-26, corvid-agent).

### SPEC SECTION Invariants

Empty allowlists deny all targeted GH/Discord actions; deny overrides win; file+env load; no Merlin empty→BASIC.

### SPEC SECTION Public API

Export allowlist load + github/discord gate helpers used by plugins and future HEAR.
