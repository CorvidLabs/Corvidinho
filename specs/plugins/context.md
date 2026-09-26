# Context — plugins

Implements PLUGIN-1/2/6, GITHUB-1/4 (read), SAFE-1 deny path, SAFE-2 file
protected paths, and files/search builtins (issue #81). Host is in-process;
builtins authored in-repo under `plugins/`. Git builtins (issue #82) reuse the
files-plugin path clamp and protected-path list and the GitHub repo gate for
push; draft SAFE-22 (default-branch policy) is not enforced until captured.
Autonomous extras (PLUGIN-5, issue #117) live under `plugins/autonomous/`
(`delegate`), declare `autonomous: true`, and re-check the AUTONOMOUS-1 gate in
the handler.
