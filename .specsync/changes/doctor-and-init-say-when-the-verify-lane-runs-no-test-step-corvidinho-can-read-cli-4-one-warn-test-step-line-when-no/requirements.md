---
change: doctor-and-init-say-when-the-verify-lane-runs-no-test-step-corvidinho-can-read-cli-4-one-warn-test-step-line-when-no
artifact: requirements
---

# Requirements

- Modified REQ-cli-430: doctor and `init` also print one `[warn] test-step`
  line when a loaded `[lanes.verify]` reaches no command naming a
  `TEST_SUMMARY_RUNNERS` runner (steps, task string / `cmd`, `deps`,
  `{ run }`, `{ task }`, parallel items, `.fledge/lanes/` imports), naming
  the runners and AGENT-15; exit code unchanged; none when `fledge.toml` or
  `[lanes.verify]` is absent or broken; file text never printed. Three new
  acceptance bullets.
