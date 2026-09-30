---
module: plugins
change: shell-exec-refuses-foot-guns-and-says-why-sed-i-or-edits-downloads-piped-into-a-shell-deletes-outside-the-worktree
---

# Delta: plugins (SAFE-21 foot-guns, SAFE-21.a credential-free shell and runners, SAFE-3 env -C and symlinks)

## Added

### REQUIREMENT REQ-plugins-494

`shell-exec` SHALL refuse SAFE-21 foot-guns before it spawns anything, and
SHALL say why. Each refusal SHALL return ok=false, exit 2, `data.refused`
true with `rule: "SAFE-21"`, its `family` (`download`, `delete`, `secret`,
`edit`) and the in-root `script` it was found in (null for the typed
command), and the message
`shell-exec refused (SAFE-21): <why>[ (in SCRIPT)]; <what to do instead>`.
The check (`firstFootgun`, `plugins/shell/footguns.ts`) SHALL run before the
SAFE-3 clamp (REQ-plugins-087) and SHALL read every simple command over the
same ground as the clamp, through one walker (`forEachSimpleCommand`,
`plugins/shell/clamp.ts`): the dash and bash readings, `eval` / `trap` /
shell `-c` strings, command substitutions, the here-docs and here-strings a
shell reads, and the in-root scripts the command runs in a shell (sourced,
handed to a shell, or run by path), in the clamp's order, so for a command
the clamp accepts it reads exactly what the clamp reads. Each command comes
with the commands piped into it (`|`, `|&`) and the dirs the shell may be in
(the root and every in-root `cd` / `env -C` target anywhere in the command,
so a loop or a later `cd` is covered). What the clamp cannot read is left to
the clamp, which refuses it. The families are
checked most serious first:

- download: a downloader (`curl`, `wget`, `wget2`, `fetch`, `aria2c`,
  `http`, `https`, `xh`, `xhs`, `curlie`, also behind exec wrappers) whose
  output is run as code — piped into a shell (`sh bash dash zsh ksh mksh ash
  yash posh`), an interpreter (`python`, `python2`, `python3`, `pypy`,
  `pypy3`, `perl`, `ruby`, `node`, `nodejs`, `php`, `lua`) or `.` / `source`
  that reads its code from standard input, also through `env`, `timeout`,
  `sudo` or `doas`, and any shell or interpreter behind `xargs`; a shell,
  interpreter, `eval` or `.` whose code is an expanded string, a `<(…)`
  process substitution or an expanded here-doc / here-string while the
  command runs a downloader; or a script file the same command's downloader
  names (`curl -o i.sh … && sh i.sh`, or the last component of a URL it
  fetches: `wget https://…/install.sh && sh install.sh`). A download used as
  data (piped into `jq`, or into an interpreter running a literal `-c`
  program) is not refused.
- delete: `rm`, `rmdir`, `unlink`, `shred`, `mv` (every operand, a `-t`
  directory included), `find` with `-delete` or with `-exec` / `-execdir` /
  `-ok` / `-okdir` running one of those (its start paths), `ln -f` (its
  destination) and `git worktree remove|move` (its paths), when a target
  lands outside the worktree as written or through a symlink that exists,
  or is the worktree's own directory (a `find` start path may be the
  worktree itself). A target fails closed when it expands (`$`, backtick,
  brace), starts with `~`, or is a glob with a `..` component, a glob before
  its last component, a last component that can match `.` or `..`, or (for
  `shred` and `find -L`, which follow links) any glob. Also refused: those
  commands behind `xargs` (their targets come from input), `rmdir -p` of an
  absolute path or one with `..`, `git worktree prune`, and `git clean|rm|
  mv|worktree|reset|checkout|restore|switch|stash` under a `-C`,
  `--work-tree` or `--git-dir` outside the worktree or that expands.
- secret: a word, the path after its first or last `:` / `=` (`HEAD:.env`,
  `--env-file=.env`) or a redirection target that `isSecretPath` matches
  (unchanged, ROLES-CHAT-8) or that is `/proc/<pid>/environ` (also
  `task/<tid>/environ`, `$PPID`); a path that — with `~`, `$HOME` and set env
  vars expanded, from every dir the shell may be in, as written and through
  symlinks — is or is inside a host secret place: the `CORVIDINHO_ENV_FILE`
  and the allowlist file (`resolveAllowlistPath`), the `corvidinho`, `gh` and
  `git` dirs under `~/.config` and `$XDG_CONFIG_HOME`, `GH_CONFIG_DIR`,
  `~/.git-credentials`, `~/.gitconfig`, `~/.netrc`, `~/_netrc` and `~/.ssh`;
  a path that holds one when the command reads trees (`tar`, `zip`, `7z`,
  `rsync`, `find`, `rg`, `ag`, `ack`, `fd`, `grep -r`, `cp -r|-a`,
  `scp -r`) or through a glob's literal prefix; a `$VAR` / `${VAR}` of a
  verify-dropped key or a credential key (REQ-plugins-495); a word naming a
  credential key (`NAME=…`, `unset NAME`, `env -u NAME`), which would point
  git or gh back at credentials; `gh auth token|git-credential|login|refresh|
  setup-git|switch` and `gh auth status -t|--show-token`; `git credential`
  and `git credential-*`; `git -c` of a `credential`, `include`, `includeIf`,
  `url.`, `core.sshCommand`, `core.askPass` or `http.*extraHeader` key,
  `--config-env`, and `git config` of such a key; and the ssh family (`ssh`,
  `scp`, `sftp`, `ssh-add`, `ssh-agent`, `ssh-copy-id`, `sshfs`, `autossh`,
  `mosh`, `rsync` to a remote or with `-e`), which uses the owner's ssh keys.
- edit, in the typed command text only (its `eval` / `-c` strings,
  substitutions and the here-docs a shell reads included; a project script's
  own redirections are a stated residual): `sed` / `gsed` with `-i`, an
  option cluster holding `i` (`-ni`, `-i.bak`) or `--in-place[=SUFFIX]` (or
  an abbreviation), also behind wrappers and `find -exec`; and every output
  redirection (`>`, `>>`, `>|`, `&>`, `&>>`, `>&`, `<>`) whose target is not
  `/dev/null`, `/dev/stdout`, `/dev/stderr` or an fd dup (`>&N`, `N>&M`,
  `>&-`), an expanded target included. The reason points to files-write and
  files-edit.

No env var, config key, flag or slash command is added, and `isSecretPath`
is unchanged.

Acceptance Criteria
- End to end each of these refuses with exit 2, `refused` / `rule: "SAFE-21"` / its family, a message that starts `shell-exec refused (SAFE-21): ` and gives a reason and, after `; `, what to do instead, and never runs its leading `touch spawned`: `sed -i`, `sed -ni.bak`, `sed --in-place`, `find … -exec sed -i … {} +`, `echo hi > f.txt`, `>> f.txt`, `>& f.txt`, `cat <<EOF > new.txt`, `echo $(echo hi > f.txt)`, `sh -c 'echo hi > f.txt'` (edit); `curl … | sh`, `curl … | sudo bash`, `wget -qO- … | python3`, `curl … | env sh`, `curl … | timeout 5 bash -s`, `curl … | xargs sh -c …`, `sh -c "$(curl …)"`, `eval "$(curl …)"`, `bash <(curl …)`, `. <(curl …)`, `curl -o i.sh … && sh i.sh`, `wget https://…/install.sh && sh install.sh` (download); `rm -rf OUTSIDE/victim`, `rm -f OUTSIDE/*`, `rm -rf ../sibling`, `rm -rf ~/x`, `rm -rf "$TMPDIR/x"`, `unlink`, `shred -u`, `find OUTSIDE -delete`, `find OUTSIDE -exec rm {} \;`, `find . … | xargs rm`, `mv OUTSIDE/victim .`, `rm -rf .*`, `rm -rf .`, `git worktree remove ../sibling`, `git worktree prune`, `rm -rf link-out/victim` through an in-root symlink to outside, and `for i in 1 2; do rm -rf up2/victim; cd sub; done` with `sub/up2` pointing outside (delete; the victims still exist); `cat .env`, `git show HEAD:.env`, `cat ~/.config/corvidinho/env`, `cat $CORVIDINHO_ENV_FILE`, `cat ~/.netrc`, `cat $HOME/.git-credentials`, `cat ~/.config/gh/hosts.yml`, `ls ~/.ssh`, `cat /proc/self/environ`, `cat /proc/$PPID/environ`, `grep -r token ~`, `gh auth token`, `git credential fill`, `echo $GH_TOKEN`, `GIT_SSH_COMMAND=ssh git push`, `git -c credential.helper=store push`, `ssh -T git@github.com` (secret).
- In-root scripts run with `sh` are read too: `sh dl.sh` (`curl … | sh`), `sh del.sh` (`rm -rf OUTSIDE/victim`) and `sh sec.sh` (`cat ~/.netrc`) refuse naming the script, and the script's first line `touch spawned` never runs; `sh edit.sh`, whose own `echo … > file` is the stated residual, runs.
- Still allowed: `echo shown 2>&1; echo hidden >/dev/null; echo err >&2; ls 2>/dev/null 1>&2`, `>/dev/stdout`, `2>/dev/stderr`, `&>/dev/null`, `exec 3>&-`; `rm -rf build && rm -f *.o && find . -name f.txt -delete`; `cat README.md && grep -r text .`; a download used as data (`curl … | jq .`, `curl … | python3 -c '…sys.stdin…'`, `curl … | python3 -c 'd = {}; print(d)'`, `curl -o x.json … && cat x.json`).

### REQUIREMENT REQ-plugins-495

The `shell-exec` child and the language runners' children (REQ-plugins-313)
SHALL start without the owner's GitHub or git credentials (SAFE-21.a), from
one env builder (`runnerChildEnv` → `withoutGitCredentials`,
`plugins/runners/commands.ts`): the verify lane's scrub (`buildVerifyEnv`:
no Discord config, GitHub tokens, audit key, acting identity or LLM keys)
minus `CDPATH` / `OLDPWD` and minus every credential key
(`isCredentialEnvKey`: `GH_TOKEN`, `GITHUB_TOKEN`, `GH_ENTERPRISE_TOKEN`,
`GITHUB_ENTERPRISE_TOKEN`, any `GH_*` / `GITHUB_*` key naming a token, PAT,
password or secret, `GH_CONFIG_DIR`, `GIT_ASKPASS`, `SSH_ASKPASS`,
`SSH_ASKPASS_REQUIRE`, `SSH_AUTH_SOCK`, `GIT_SSH`, `GIT_SSH_COMMAND`,
`GIT_CONFIG`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`,
`GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`,
`GIT_CONFIG_KEY_<n>`, `GIT_CONFIG_VALUE_<n>`, `GIT_TERMINAL_PROMPT`), then
with `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_NOSYSTEM=1` (no global or
system git config, where credential helpers and URL rewrites live),
`GIT_CONFIG_COUNT=1` / `GIT_CONFIG_KEY_0=credential.helper` /
`GIT_CONFIG_VALUE_0=` (an empty helper at command-line level resets a repo's
own helpers), `GIT_TERMINAL_PROMPT=0`, a `GIT_SSH_COMMAND` that reads no ssh
config and offers no key or agent (`ssh -F /dev/null -o
IdentityFile=/dev/null -o IdentitiesOnly=yes -o IdentityAgent=none -o
BatchMode=yes`), a `GH_CONFIG_DIR` that is an empty dir private to the
process (gh is logged out), `CARGO_NET_GIT_FETCH_WITH_CLI=true` (cargo
fetches git dependencies with that git) and `CORVIDINHO_PROJECT_ROOT`.
Pushes, PRs and merges then happen only through the checked GitHub tools.

`shell-exec` SHALL spawn through `spawnCapped` (`plugins/fledge/spawn.ts`)
with that env, the calling run's abort signal, the runners' timeout (10
minutes, exit 124) and per-stream output cap (64 KiB, with a truncation
note), stdin closed, in its own process group, killed on timeout or abort
(exit 130); a shell that cannot start SHALL return exit 127, and the output
SHALL be secret-scrubbed (SAFE-6).

The SAFE-3 clamp (REQ-plugins-087) SHALL also:
- check the directory of `env -C DIR` / `-CDIR` / `--chdir[=]DIR` (in an
  option cluster such as `-iC`, or abbreviated such as `--ch`) and of
  `sudo -D` / `-R` / `--chdir` / `--chroot` like a `cd` target, wherever the
  wrapper sits in the command (behind other wrappers or `find -exec`), and
  look for the wrapped command's scripts from that dir;
- refuse a wrapper whose command it cannot read (`env -S` /
  `--split-string`, `sudo -s` / `-i` / `--shell` / `--login` with a
  command), and read `sudo` and `doas` as exec wrappers;
- check each `cd` / `pushd` / `env -C` target from the root and every dir
  the shell may be in both as written and as the kernel walks it (an
  existing symlink followed, a `..` after it taken from the link's target),
  refusing one that lands outside the real root or cannot be walked (a
  dangling or looping link);
- refuse an `ln` (symbolic or hard) whose target leads out of the root (a
  symbolic link's relative target read from the directory the link is made
  in), expands or starts with `~`.

The refusal names `cd/pushd/env -C or a symlink` and the target with its
option (`/ (env -C)`, `/ (sudo -D)`, `/ (ln target)`).

Acceptance Criteria
- `printenv` in `shell-exec` shows no `OPENAI_API_KEY`, `DISCORD_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`, `GIT_ASKPASS` or `SSH_AUTH_SOCK` set in the bot's env, shows `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0`, a key-less `GIT_SSH_COMMAND`, and a `GH_CONFIG_DIR` outside the owner's home with no `hosts.yml`.
- With a credential helper (a marker-writing script) in the owner's `~/.gitconfig` and in the repo's own config, `shell-exec` running `git ls-remote` against a local HTTP server that answers 401 fails and the helper never runs.
- The node runner's child env (a stub that prints `env`) drops `GH_TOKEN`, `GH_ENTERPRISE_TOKEN`, `GIT_ASKPASS`, `SSH_AUTH_SOCK`, inherited `GIT_CONFIG_KEY_1` / `GIT_CONFIG_VALUE_1` / `GIT_CONFIG_PARAMETERS` and an inherited `GH_CONFIG_DIR`, and sets the values above plus `GIT_CONFIG_COUNT=1`, `GIT_CONFIG_KEY_0=credential.helper`, an empty `GIT_CONFIG_VALUE_0` and `CARGO_NET_GIT_FETCH_WITH_CLI=true`.
- An aborted calling run stops `shell-exec` running `sleep 60` with exit 130 well before the sleep ends; 200000 bytes of output come back truncated (under 80000 characters, `truncated: true`); a `ghp_…` token printed by the command is scrubbed.
- `firstDisallowedCd` refuses `env -C / ls` (`/ (env -C)`), `env --chdir=/ ls`, `env --chdir /etc sh -c pwd`, `env -iC/ ls`, `env --ch=.. ls`, `env -C up ls` (up → /), `env -C $D ls`, `sudo -D / ls`, `find . -exec env -C / ls \;` and `env -S '…'`; allows `env -C sub ls` and `env -C sub ./x.sh`.
- With in-root `up → /`, `sub/out → OUTSIDE` and `insub → sub`: `cd up && ls`, `pushd up`, `cd up/etc`, `cd sub && cd out` and `cd nothere/../up` refuse; `cd insub && cd deep` and `cd sub/deep/../..` stay allowed.
- `ln -s / x && cd x` (`/ (ln target)`), `ln -sfn /etc cfg`, `ln -s ../../x sub/l`, `ln /etc/hosts h` and `ln -s $T x` refuse; `ln -s ../sub sub/again` and `ln -s sub l` stay allowed.
- End to end `env -C / pwd`, `env --chdir=/ pwd`, `cd up && pwd`, `cd sub/out && pwd` and `ln -s / x && cd x && pwd` return exit 2 with SAFE-3 and spawn nothing (no marker, no `x`); `env -C sub pwd && cd insub && pwd` runs and prints the in-root `sub`.

## Modified

### REQUIREMENT REQ-plugins-087


`shell-exec` SHALL pin the spawned shell's initial cwd to the plugin cwd
(project root / task worktree) and SHALL refuse, before spawn, any command
whose lexically-resolved `cd` or `pushd` target would land outside that root
(SAFE-3). Refusals include absolute paths outside the root, `..` chains that
escape, `~` / `~user`, `$VAR` references, and bare `cd` (home). Relative `cd`
that stays under root and absolute `cd` under root SHALL be allowed. The clamp
SHALL be fail-closed: any command it cannot resolve to an in-root target
refuses.

The clamp SHALL tokenize the way the shell reads a command. Quotes and
backslash escapes SHALL join text into one word — a quoted or escaped space
never splits a target, so `cd "sub dir"` is checked as `sub dir` — and SHALL be
removed from a word before it is checked. A separator (`;`, `&`, `|`, newline,
`(`, `)`) inside single or double quotes or escaped with `\` is not a
separator. A backslash-newline outside single quotes SHALL be a line
continuation, and an escaped backslash before a newline SHALL NOT be one. `#`
at the start of a word SHALL start a comment that runs to the end of the line.
The end of a `$(…)` SHALL be found by these same rules. dash reads the lines
after `<<` / `<<-` as a here-doc body — data up to the exact delimiter line
(the delimiter word itself is not expanded, so a `$(` or backtick in it is
literal), apart from the `$(…)` and backtick substitutions of an unquoted
body — while
bash may read them as commands (`(( x << 2 ))` is arithmetic there), so a
command containing `<<` SHALL be checked under both readings and SHALL refuse
if either refuses, and so SHALL the re-parsed argument of `eval`; a quote
inside a here-doc body therefore cannot hide the commands after it. bash reads
`$'…'` as ANSI-C quoting, where `\` escapes even a `'`, while dash reads a `$`
then a single-quoted string, so a command containing `$'` SHALL also be
checked as bash reads it; a `$'…'` word holding a backslash escape counts as
an expansion. A `cd` or
`pushd` command that the text leaves open — an unterminated quote or a
trailing backslash — SHALL refuse, and so SHALL a command nested too deeply
to check. It SHALL find
a `cd` or `pushd` behind prefix words (`{`, `}`, `!`, `if`, `then`, `else`,
`elif`, `do`, `while`, `until`, `time`, `builtin`, `command`, `function NAME`)
and `NAME=value` / `NAME+=value` assignments. It SHALL drop redirections
(`>`, `>>`, `>&`, `>|`, `<`, `<>`, `<&`, `&>`, an `fd` prefix such as `2>&1`)
together with their targets wherever they appear in the command, SHALL NOT
treat the `&` of a redirection as a command separator, and SHALL skip
`cd` / `pushd` options (`-P`, `-L`, `-e`, `-@`, `-n`, `--`) to reach the real
target.

It SHALL refuse `-` (OLDPWD); a target containing `$`, a backtick, a glob or a
brace; a command word that the shell would expand (a command word containing
`$`, `$(…)` or a backtick); an `eval` whose argument would expand; and a write
to `DIRSTACK`. It SHALL re-parse the literal argument of `eval` as a command,
and likewise the action of `trap` and the `-c` string of a shell (`sh`,
`bash`, `dash`, `zsh`, `ksh`, `mksh`, `ash`, `yash`, `posh`, named by name or
path anywhere in a simple command, so also behind `env`, `exec`, `nohup`,
`timeout`, `xargs` or `find -exec`; `-` ends the shell's options like `--`, and
each `o` / `O` in an option cluster such as `-co pipefail` takes the next
word), refusing a `trap` action or `-c` string that would expand; it SHALL
refuse an alias definition (`alias NAME=…`); and it SHALL analyse the body of each command substitution (`$(…)` and backticks)
as a command, refusing an escaping `cd`/`pushd` found inside. The spawned shell
SHALL run `CDPATH=; readonly CDPATH` before the command and SHALL NOT inherit
`CDPATH` or `OLDPWD` from the bot's environment, so a `CDPATH` set anywhere in
the command (including one built dynamically) cannot redirect a relative `cd`
outside the root; `CDPATH` is therefore NOT refused lexically.

The clamp SHALL run after the SAFE-21 foot-gun check (REQ-plugins-494), so a
command that is both a foot-gun and a clamp refusal is refused with the
SAFE-21 reason; the clamp on its own still refuses it. It SHALL also check
`env -C` / `sudo -D` directories, symlinks and `ln` targets as REQ-plugins-495
says.

The clamp SHALL also check, before spawn, each script the command runs in a
shell, looking for it from the root and from every in-root `cd` target before
it: a file sourced with `.` / `source` or named by `BASH_ENV=` or a shell's
`--rcfile` / `--init-file`; a file a shell runs as its script operand or reads
as standard input through `<` / `<>`; a here-doc or here-string a shell reads
(an unquoted here-doc body as the shell expands it: `\$`, `` \` ``, `\\` and
`\`-newline lose the backslash); and a file run by path — a command word
holding `/`, also behind the exec wrappers above and `find -exec` — whose `#!`
line names a shell (directly or through `env` / `busybox`) or that has no `#!`
line and is text. Each script's text SHALL be checked like a command, scripts
it runs included, and a refusal inside it SHALL name the script
(`TARGET (in SCRIPT)`). It SHALL refuse a script path that would expand; a
sourced or shell-run script that does not exist; more than 1 MiB of script
text, more than 32 scripts, or more than 32 directories to look in; a script
that the command or one of its scripts writes, in any order — an output
redirection (`>`, `>>`, `<>`, …) target or an argument of a command that is not
read-only; a here-doc or here-string a shell reads that would expand; and a
shell reading its commands from anything else (a pipe, the standard input it
inherits, a process substitution). A file run by path that does not exist (a
program the command builds first) or is not a shell script (a binary, a `#!`
naming another interpreter) SHALL NOT be read.

Acceptance Criteria
- Unit fixtures cover allow/refuse cases above.
- Integration: `cd /tmp && …` and `cd ..` from root refuse with exit 2 and SAFE-3 message; `cd sub && …` inside project succeeds when allowlisted.
- Redirection-hidden targets refuse: `>/dev/null cd /etc`, `cd >/dev/null /etc`, `cd</dev/null /etc`, `cd 2>&1 /etc`, `cd -P >/dev/null /etc`; an in-root `cd sub >/dev/null` and `cd 2>&1 sub` stay allowed.
- Quote-aware forms refuse: `X="a b" cd /etc`, `X=';' cd /etc`, `cd "x /../.."`, `cd 'sub dir/../..'`; a backslash-newline `cd` (`c\`+newline+`d /etc`, `cd sub/\`+newline+`../..`) refuses; `cd "sub dir"` and `X=';' cd sub` stay allowed.
- Quoting is read as the shell reads it: `mkdir -p "a b" && cd "a b/../.."`, `cd "zz q/../.."`, `cd a\ b/../..`, `cd 'a b'/../..` and `cd sub/..\`+newline+`/..` refuse; so does a `cd /etc` after an escaped backslash and a newline (`echo a\\`+newline), after a `#` comment holding a quote, after a here-doc body holding a lone quote (`<<EOF`, `<<'EOF'`, `<<-EOF`), or after a `$(…)` whose comment or here-doc holds a `)`; an escaping `cd` in a `$(…)` or backtick of an unquoted here-doc body refuses, also when the delimiter holds a backtick (`cat <<`+backtick+`x`+newline+`#' $(cd ..)`); `(( x = 1 << 2 ))`+newline+`cd /etc` refuses, also inside `eval` when quote removal forms the `<<`; `cd "sub`, `cd 'sub` and `cd sub\` refuse; `$(`-nesting too deep to check refuses instead of throwing; `cd sub # comment`, `cd sub \`+newline+`&& ls`, and an in-root `cd sub` after a here-doc whose body holds a stray quote or apostrophe stay allowed; `eval "cd /; ls"` refuses `/`. End to end each refused form returns exit 2 with SAFE-3 (or SAFE-21 when the form is also a SAFE-21 foot-gun, REQ-plugins-494) and nothing is spawned.
- bash `$'…'` is read as bash reads it: `echo $'\''; cd /etc #'` refuses, and so do `cd $'\x2e\x2e'` and `$'\x63d' /etc`. A shell's `-c` string is checked like an `eval` argument: `sh -c 'cd /etc'`, `/bin/sh -ec 'cd /etc'`, `bash --norc -o pipefail -c 'cd ..'`, `env X=1 sh -c 'cd /etc'`, `timeout 5 sh -c 'cd /etc'`, `xargs sh -c 'cd /etc'`, `find . -exec sh -c 'cd /etc' \;` and `sh -c "cd $X"` refuse; `sh -c 'cd sub && ls'`, `bash -lc 'echo hi'` and `bash scripts/build.sh` (an in-root script) stay allowed.
- Expansion forms refuse: `$(echo cd) /etc`, `` `echo cd` /etc ``, `x=cd; $x /etc`, `cd${IFS}/etc`, `eval $(printf 'cd /etc')`, `echo` `` `cd /etc` `` and `echo $(cd /etc && cat x)`; `echo $(cd sub && ls)` and `eval 'cd sub'` stay allowed.
- Bash `X+=1 cd /etc` refuses; a `DIRSTACK[...]=` write refuses.
- With `OLDPWD` set outside the root in the bot's environment, `cd -` is refused before spawn; with `CDPATH` set outside the root, `cd sub && pwd` prints the in-root `sub`; a command that sets `CDPATH` to an outside dir and then runs a relative `cd sub` does not print the outside path.
- Scripts a command runs in a shell are checked, with `bad.sh` holding `cd /etc`: `. ./bad.sh`, `source bad.sh`, `sh bad.sh`, `bash -e ./bad.sh arg`, `./bad.sh`, a `#!`-less text file or `#!/usr/bin/env -S bash -e` script run by path, `env X=1 ./bad.sh`, `timeout 5 ./bad.sh`, `exec ./bad.sh`, `find . -exec ./bad.sh \;`, `BASH_ENV=./bad.sh bash -c true`, `bash --rcfile bad.sh -i ok.sh`, `sh < bad.sh`, `sh -s arg < bad.sh`, a nested `. ./nested.sh` and `cd sub && . ./inner.sh` (`cd ../..`) refuse, naming the script (`/etc (in ./bad.sh)`); so do `sh <<'EOF'`+newline+`cd /etc`+newline+`EOF`, an unquoted here-doc whose body expands to `cd /etc` (`c\\d /etc`), `bash <<< 'cd /etc'`, shell input that would expand (`sh <<EOF` with a `$`, `bash <<< "$X"`), `cat bad.sh | sh`, `{ sh; } < bad.sh`, `bash < <(cat bad.sh)`, `. <(cat bad.sh)`, `sh missing.sh`, `sh "$S"`, `. ~/x.sh`, `sh *.sh`, a script over 1 MiB, and a script the command writes (`echo … > gen.sh; sh gen.sh`, `cp bad.sh ok.sh && ./ok.sh`, `for i in 1 2; do sh ok.sh; cp bad.sh ok.sh; done`). `trap 'cd /etc' EXIT`, `trap "$X" EXIT`, `alias c=cd`, `sh -c - 'cd /etc'` and `bash -co pipefail 'cd /etc'` refuse. `sh ok.sh`, `./ok.sh && ./okcd.sh` (`cd sub`), `. ./ok.sh`, `bash scripts/build.sh`, `cd sub && sh ../ok.sh`, `chmod +x ok.sh && ./ok.sh`, `sh <<'EOF'`+newline+`cd sub && pwd`+newline+`EOF`, `bash <<< 'echo hi'`, a binary or `#!/usr/bin/env python3` file run by path, a program the command builds first, and `trap 'rm -f tmp.txt' EXIT` stay allowed. End to end each refused form returns exit 2 with SAFE-3 (or SAFE-21 when the form is also a SAFE-21 foot-gun, REQ-plugins-494) and nothing is spawned; in-root scripts run.
- End to end, `echo 'touch spawned; cd /etc' | tee gen.sh >/dev/null; sh gen.sh` refuses with SAFE-3 (`gen.sh (script written by this command)`); its `>` form `echo … > gen.sh; sh gen.sh` is refused first by SAFE-21 (a `>` edit), still exit 2 with nothing spawned, while `firstDisallowedCd` alone still refuses it.

### REQUIREMENT REQ-plugins-313


When `node`, `python3` (else `python`) or `cargo` resolves on an absolute
PATH entry at builtin load, the system SHALL register `node-exec`,
`python-exec` or `cargo-exec` respectively (PLUGIN-4), bound to the absolute
binary found. A relative PATH entry SHALL NOT be used to resolve a runner, and
a hit whose real path is the running Bun binary (the `node` shim `bun run` puts
on PATH) SHALL NOT count as the toolchain; resolution continues on PATH. Each
runner SHALL be `dangerous: true` and `minTier: 2` (PLUGIN-2), so a
non-interactive run that has not allowlisted it is denied (SAFE-1), every run
is audited (SAFE-5), non-ADMIN role sessions never see or run it
(ROLES-CHAT-2/3), and the tool catalog offers it only at code tier with
dangerous tools included. A runner SHALL spawn `[bin, ...argv]` with the
caller's argv verbatim (no shell, no expansion, its own flags kept) and SHALL
pin the child's cwd to the plugin cwd (project root / task worktree), with no
cwd option. The child SHALL get the verify lane's scrubbed env (no Discord
config, GitHub tokens, audit key, acting identity or LLM keys) without
`CDPATH` / `OLDPWD` and without the owner's GitHub or git credentials
(SAFE-21.a, the env of REQ-plugins-495), stdin closed, a timeout (exit 124), per-stream output
caps, and its process group killed on timeout or the calling run's abort (exit
130); output SHALL be secret-scrubbed (SAFE-6). A non-zero exit SHALL return
ok=false with that exit code; empty argv SHALL be a usage error (exit 1) that
spawns nothing. `shell-exec` gets the same env (REQ-plugins-495). No new slash command,
env var or config key.

Acceptance Criteria
- With stub `node`, `python3` and `cargo` on PATH, `node-exec`, `python-exec` and `cargo-exec` are registered with dangerous=true, mutating=true, minTier=2; a second load keeps the same commands.
- `python-exec` binds `python3` when both `python3` and `python` exist and `python` when only it exists; a toolchain only on a relative PATH entry is not resolved.
- A `node` that is a symlink to the running Bun binary is skipped: with only it on PATH `node-exec` is not loaded (`node not found on PATH`), with a real `node` later on PATH that one is bound; `bun run corvidinho plugins list` without node lists no `node-exec`.
- `python-exec` with `` ["-c","x","$(id)","--json","a b","*","--","`id`"] `` reaches the binary as exactly those argv words, with cwd = the project root; a stub exit 3 returns ok=false, exitCode 3.
- The child env has no `GITHUB_TOKEN`, `DISCORD_TOKEN`, `OPENAI_API_KEY`, `CORVIDINHO_AUDIT_HMAC_KEY`, `CORVIDINHO_ACTING_*`, `CDPATH` or `OLDPWD`, and `CORVIDINHO_PROJECT_ROOT` is the project root.
- Non-interactive with an empty allowlist each runner is denied (exit 2, SAFE-1) and nothing is spawned; allowlisted, it runs.
- `buildOpenAiTools` lists the runners at code tier with dangerous tools for ADMIN only; not at tool tier, not without dangerous tools, not for a non-ADMIN session.
- An aborted calling run returns exit 130 and kills the runner's process tree; a run past the timeout returns exit 124 and kills the tree.
- Where real `node` / `python3` / `cargo` are installed, `node-exec -e 'console.log(process.cwd())'` and `python-exec -c 'import os; print(os.getcwd())'` print the project root and `cargo-exec --version` succeeds.
- The child env also has no `GH_TOKEN`, `GH_ENTERPRISE_TOKEN`, `GIT_ASKPASS`, `SSH_AUTH_SOCK`, inherited `GIT_CONFIG_KEY_<n>` / `GIT_CONFIG_VALUE_<n>` / `GIT_CONFIG_PARAMETERS`, and has `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_COUNT=1` with an empty `credential.helper`, `GIT_TERMINAL_PROMPT=0`, a key-less `GIT_SSH_COMMAND`, `CARGO_NET_GIT_FETCH_WITH_CLI=true` and a `GH_CONFIG_DIR` with no `hosts.yml` (SAFE-21.a).
