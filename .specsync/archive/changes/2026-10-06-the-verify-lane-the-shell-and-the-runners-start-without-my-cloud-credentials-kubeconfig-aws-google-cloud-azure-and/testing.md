---
change: the-verify-lane-the-shell-and-the-runners-start-without-my-cloud-credentials-kubeconfig-aws-google-cloud-azure-and
artifact: testing
---

# Testing

One new file, 7 tests, no network: `tests/agent.cloud-credentials.test.ts`.
Stand-in `kubectl`, `aws`, `gcloud` and `az` shell scripts in a temp dir print
what a real one reads (the env it names, else its default files under a fake
HOME); each child calls them by absolute path, so the host's own tools never
run. Every fake credential value and file carries one marker, so the marker
anywhere in a child's output means a credential reached it. Each surface runs
with the owner's cloud env set and again with only the default files: the
verify lane (`defaultVerifyRunner` in a child bun process with a stand-in
`fledge`), `shell-exec` (the handler, as `runPlugin` would call it after its
gates), `node-exec` / `python-exec` / `cargo-exec` (`runRunner` with a
stand-in binary), and `fledge-lanes-run` / `fledge-run` (stand-in `fledge`).
Plus: a first runner child writing a "login" into its gcloud and az dirs does
not reach the second; the key family (documented keys and patterns true,
ordinary settings false); fresh 0700 dirs per call; release removes only its
own dirs.

Fail-on-base proof: with the base's (`e1a24ed2`, main) four sources swapped in
(`src/agent/verify.ts`, `plugins/runners/commands.ts`,
`plugins/shell/commands.ts`, `plugins/fledge/core.ts`), the file gave 0 pass,
7 fail: the owner's cloud env values and the default files' contents reached
the verify lane, the shell, all three runners and both Fledge runs (the
defaults-only "fresh dirs" case shows `~/.kube/config` and `~/.aws/*` read),
and the two unit tests found no `isCloudCredentialEnvKey` /
`withoutCloudCredentials`. Restored: 7 of 7 pass.

Unchanged suites that cover the touched files pass: `agent.verify-env`,
`runners.plugins`, `shell.footguns`, `fledge.core`, `cli.safe3a-shell`,
`gif.search`, `web.search`, `shell.plugins`, `agent.safe3a-gate`,
`agent.safe3a-owner-shell`, `agent.loop`, `shell.clamp-bypass` (228 tests),
and the full `bun test` (3739 tests in 236 files: 3737 pass, 0 fail, the rest skipped).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-621` | `tests/agent.cloud-credentials.test.ts` ("defaultVerifyRunner: no cloud env, default files neutralised…", "isCloudCredentialEnvKey names the documented family…", "withoutCloudCredentials: fresh private dirs per child…") | The lane's fledge sees no cloud key, value or default file in either scenario; stand-ins are `/dev/null`, `AWS_EC2_METADATA_DISABLED=true`, the gcloud / az dirs lie outside HOME and are gone after the lane; the family and the kept settings match the list; dirs are fresh, empty and 0700, release removes only its own. |
| `REQ-agent-002` | `tests/agent.cloud-credentials.test.ts` (verify lane case); `tests/agent.verify-env.test.ts` (unchanged) | The default runner still drops the SAFE-6 keys and keeps the rest; with cloud credentials set or only on disk, its child has none of them. |
| `REQ-plugins-621` | `tests/agent.cloud-credentials.test.ts` ("shell-exec: …", "node-exec / python-exec / cargo-exec: …", "fledge-lanes-run and fledge-run: …", "each child gets fresh, empty config dirs…"); `tests/runners.plugins.test.ts`, `tests/shell.footguns.test.ts`, `tests/fledge.core.test.ts` (unchanged SAFE-21.a) | Every surface's child sees no cloud env or default file and its stand-in dirs are removed; a login written by one child never reaches the next; the git / GitHub scrub is unchanged. |
