---
change: the-verify-lane-the-shell-and-the-runners-start-without-my-cloud-credentials-kubeconfig-aws-google-cloud-azure-and
artifact: context
---

# Context

Part of #83 (SAFE-21). Leif confirmed SAFE-21.b in the 2026-09-28 interview
record, round 16 (2026-10-06: "Verify-lane env (AUTONOMY-9.a / SAFE-21.a):
drop cloud credentials (KUBECONFIG, AWS_*, GOOGLE_*, AZURE_* and similar) from
the verify lane, shell and runners"); it is captured in this PR with `hi` as a
sub-criterion of SAFE-21 (own commit).

What was wrong on main (e1a24ed2): the verify lane (`buildVerifyEnv`) dropped
only Discord config, GitHub tokens, the audit key, acting identity, search
keys and LLM keys; `shell-exec`, the runners and the Fledge core runs added
the SAFE-21.a git / GitHub scrub (`withoutGitCredentials`). Every cloud
credential in the bot's env (KUBECONFIG, AWS keys and profiles, Google ADC,
Azure principals, other clouds' tokens) reached tests the agent wrote, shell
commands and runner code, and even with the env dropped each tool would still
read its default files (`~/.kube/config`, `~/.aws`, `~/.config/gcloud`,
`~/.azure`).

Constraints: smallest change on the existing env builders (`buildVerifyEnv`,
`runnerChildEnv`, `fledgeCoreChildEnv`, the `withoutGitCredentials` pattern);
no new env var, config key, slash command, table or schema bump; specs only
through SpecSync; #232/#233 untouched; v1 off-chain. Out of scope (not named
by SAFE-21.b): Fledge plugin commands and delegate workers keep their env;
cloud metadata services other than EC2's IMDS (the 2026-09-26 egress-block
decision on #83 is separate and not captured yet).
