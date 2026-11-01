---
change: file-tools-refuse-the-loaded-allowlist-file-so-people-links-never-change-through-chat-identity-6
artifact: design
---

# Design

- **`plugins/files/protectedPaths.ts`**:
  - `landingPath(p)` (private): where a read or write of `p` lands —
    `realpath` when it exists, else the parent's landing path plus the
    leaf, a dangling leaf link followed by hand (up to 40 hops), mirroring
    `resolveProjectPath` without the project clamp.
  - `allowlistFilePaths(env, home)`: for `homedir()` and (when it differs)
    `env.HOME`, `resolveAllowlistPath(env, home)` (a relative value from
    the process cwd and from home) plus both `defaultAllowlistPaths(home)`,
    each as written and its `landingPath`.
  - `isAllowlistFilePath(absPath, env, home)`: true when the landing path
    equals one of them, or is a regular file sharing the inode of one.
  - `allowlistFileRefuseMessage(path)`: `refused (IDENTITY-6): …` naming
    ALLOW-6 and `/admin people add|link|unlink|remove|role` or the file on
    the VM.
- **`plugins/files/commands.ts`**: `refuseProtected` refuses
  `isAllowlistFilePath(absPath)` with exit 2 after the SAFE-2,
  SpecSync-record, AGENT-1.b and persona rules, so `files-write`,
  `files-edit` and `files-delete` all refuse before any existence, size
  or content check, for every caller.
- Alternatives ruled out: refusing only in role sessions (the local CLI's
  agent run is not the owner's explicit config change either, ALLOW-6;
  refusing every caller matches SAFE-2 and AGENT-1.b and is the more
  conservative reading); refusing only the resolved file (creating the other
  default path would change which file is read); refusing the whole
  `~/.config/corvidinho` dir as the shell does (wider than the people file;
  other project files there stay writable); a new env var or override (none
  allowed).
