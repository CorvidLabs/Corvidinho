---
change: the-specsync-check-tool-the-verify-lane-s-spec-check-step-starts-without-my-cloud-credentials-and-its-output-is
artifact: research
---

# Research

- `src/agent/verify.ts` `runFledgeStep` (the verify lane) already spawns
  fledge with `withoutCloudCredentials(buildVerifyEnv())`; `plugins/fledge/core.ts`
  and `plugins/runners/commands.ts` add `withoutGitCredentials` too.
- `src/cli.ts` `spawnsInheritProcessEnv` fills `env: { ...process.env }` into
  any `Bun.spawn` without an `env`, so an explicit env is the only way the
  SpecSync children get a scrubbed one.
- `plugins/specsync/commands.ts`: `specsync-check` is `dangerous: false`,
  `minTier: 0`; `src/plugins/roles.ts` treats it as a read tool.
- The specsync 6.0.0 binary reads `GITHUB_TOKEN` (`change ship` check-runs,
  issue verification), so `spawnSpecsync` keeps non-cloud keys.
- `Bun.which("fledge")` in `runSpecCheck` reads the start-up PATH, so the test
  runs the tool in a child bun process started with the owner's env.
