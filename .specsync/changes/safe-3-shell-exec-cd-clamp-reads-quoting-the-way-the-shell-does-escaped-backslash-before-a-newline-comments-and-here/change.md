---
id: safe-3-shell-exec-cd-clamp-reads-quoting-the-way-the-shell-does-escaped-backslash-before-a-newline-comments-and-here
state: approved
type: bug_fix
base_commit: 07fa953887ab61dde8a0e32ee1161b5981695dea
---

# SAFE-3 shell-exec cd clamp reads quoting the way the shell does: escaped backslash before a newline, comments and here-doc bodies no longer hide a cd, the end of a command substitution is found with the same tokenizer, and a cd/pushd command left open by a quote or trailing backslash is refused

## Intent

SAFE-3 shell-exec cd clamp reads quoting the way the shell does: escaped backslash before a newline, comments and here-doc bodies no longer hide a cd, the end of a command substitution is found with the same tokenizer, and a cd/pushd command left open by a quote or trailing backslash is refused

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- shell-exec refuses before spawn (exit 2, SAFE-3) the reported quoted and escaped cd forms: mkdir -p "a b" && cd "a b/../..", cd "zz q/../..", cd a\ b/../.., cd 'a b'/../.., X="a b" cd /etc and cd sub/..\<nl>/.. (each checked as the single target word the shell sees); it also refuses echo a\\<nl>cd /etc (escaped backslash, real newline), a cd hidden by a quote inside a # comment, a cd after a here-doc whose body holds a lone quote (<<EOF, <<'EOF', <<-EOF), a cd after a $( ) whose comment or here-doc holds a ), an escaping cd inside a $( ) or backtick in an unquoted here-doc body, a cd after (( x = 1 << 2 )) (bash arithmetic), and any cd/pushd command left open by an unterminated quote or a trailing backslash; a command with << is checked both as dash reads it (here-doc body is data) and as bash may read it (lines are commands) and refuses if either does; cd "sub dir", cd sub # comment, cd sub \<nl>&& ls, a here-doc body holding a stray quote before an in-root cd sub, eval "cd /; ls" (still refused as /) and every existing clamp assertion keep their results; no new flag, env var or command

## No-spec Rationale

Not applicable
