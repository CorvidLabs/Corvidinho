---
hi: 1
families: [ROLES]
owner: leif
---

# Roles / chat gates

## Intent

Anyone in an allowlisted Discord channel can have a solid chat experience. Non-admins stay **read / chat only** at the tool layer (not just the prompt). Only the configured owner (ADMIN) gets mutating / dangerous tools, still behind existing SAFE + ALLOW gates. We need ~95% confidence that "delete this project" or "override that" from a random chatter cannot succeed.

## Criteria

- **ROLES-CHAT-1**  In an allowlisted channel, any non-blocked user can @mention / reply and get a real chat session (today's empty users+roles → STANDARD path).
- **ROLES-CHAT-2**  Non-ADMIN Discord/GitHub/AlgoChat sessions only receive **read/chat** tools (e.g. file read/list/search, memory recall, github reads, status). Mutating tools never appear in the catalog for them.
- **ROLES-CHAT-3**  At tool-run time, non-ADMIN callers are refused for every mutating / dangerous plugin (file write/edit/delete, shell, github writes, discord-post, memory forget/override, allowlist/config changes) — even if the model invents the call. Refusal is silent to the channel except a short in-session "not allowed for your role" in the agent summary.
- **ROLES-CHAT-4**  ADMIN (configured owner per IDENTITY-2) may use mutating tools subject to SAFE-1..9, ALLOW, ADMIN-4, MEMORY-ACL, and two-phase confirms.
- **ROLES-CHAT-5**  "Mutating" includes plugins with `dangerous: true` **and** any write/edit/delete/post/merge/config tool even if currently marked `dangerous: false` (notably file-write / file-edit today).
- **ROLES-CHAT-6**  Role is re-checked in the plugin/runtime layer each call (same spirit as DISCORD-7 / IDENTITY-12 draft) — prompt text never grants power.
- **ROLES-CHAT-7**  Prove-before-done: automated tests cover (a) non-admin cannot run file-write / shell / github-create-pr / memory-forget, (b) admin can reach those paths still gated by SAFE, (c) channel allowlist still required.
- **ROLES-CHAT-8**  Non-ADMIN community Discord sessions may answer from any public GitHub plus site/roadmap; refuse private repo access and secret paths.
  - **ROLES-CHAT-8.a**  Community sessions may read the public repo docs (README, docs/, STATUS, CHANGELOG) and the public issues and milestones of allowed public repos, and nothing else as site or roadmap.
- **ROLES-CHAT-9**  In Discord community chat, prefer a conversational prose reply for social or game banter; only open SpecSync, git, github, or project file tools when the query clearly needs Corvidinho codebase or product data.

## Notes (not numbered AC)

- Three roles (owner / team / community) are captured as **IDENTITY-8..12** (Leif, 2026-09-28 interview) and replace this two-tier gate over time: owner = ADMIN here, community = non-ADMIN here, team is the middle tier (#65).
- Related already captured: ADMIN-1..4 (slash → #43), IDENTITY-1..3, DISCORD-5/7, DISCORD-DENY, SAFE-1..9, MEMORY-ACL.
- Empty channel allowlist stays deny (do not relax).
