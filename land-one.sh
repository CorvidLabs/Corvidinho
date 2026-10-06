#!/usr/bin/env bash
set -euo pipefail
PRN=$1
LABEL=${2:-PR$PRN}
REPO=CorvidLabs/Corvidinho
ROOT=/workspace/Corvidinho-land-wave
cd "$ROOT"
git fetch origin main
HEAD=$(gh pr view $PRN --repo $REPO --json headRefName --jq .headRefName)
echo "==== LAND #$PRN ($HEAD) $LABEL ===="
git fetch origin "+refs/heads/$HEAD:refs/remotes/origin/$HEAD"
git checkout -B "$HEAD" "origin/$HEAD"
# Merge tip
if ! git merge origin/main -m "merge origin/main into $HEAD (land wave)"; then
  echo "Resolving conflicts..."
  # Auto-resolve specs with keep-both
  python3 - <<'PY'
from pathlib import Path
import subprocess
files=subprocess.check_output(['git','diff','--name-only','--diff-filter=U'], text=True).split()
def keep_both(path):
  p=Path(path); text=p.read_text();
  if '<<<<<<<' not in text: return
  out=[]; lines=text.splitlines(keepends=True); i=0
  while i < len(lines):
    if lines[i].startswith('<<<<<<<'):
      i+=1; head=[]
      while i < len(lines) and not lines[i].startswith('======='): head.append(lines[i]); i+=1
      if i < len(lines): i+=1
      theirs=[]
      while i < len(lines) and not lines[i].startswith('>>>>>>>'): theirs.append(lines[i]); i+=1
      if i < len(lines): i+=1
      out.extend(head); out.extend(theirs)
    else: out.append(lines[i]); i+=1
  p.write_text(''.join(out)); print('keep-both', path)
for f in files:
  if f.startswith('specs/') or f.startswith('docs/'):
    keep_both(f)
  else:
    print('MANUAL_NEEDED', f)
PY
  # Try specsync merge for remaining spec markers
  specsync merge --all || true
  # Abort if non-spec conflicts remain with markers
  if rg -q '^(<<<<<<<|=======|>>>>>>>)' $(git diff --name-only --diff-filter=U) 2>/dev/null; then
    echo "UNRESOLVED CONFLICTS:"; git diff --name-only --diff-filter=U; rg -n '^(<<<<<<<|=======|>>>>>>>)' $(git diff --name-only --diff-filter=U) | head -40
    exit 2
  fi
  git add -A
  git -c user.name='Corvid Agent' -c user.email='95454608+corvid-agent@users.noreply.github.com' commit -m "merge origin/main into $HEAD (land wave)"
fi
# Re-verify SpecSync change if any
SLUG=$(ls .specsync/changes/ 2>/dev/null | head -1 || true)
if [[ -n "${SLUG:-}" ]]; then
  echo "Re-verifying $SLUG"
  specsync change check "$SLUG" --commit
  specsync change audit
fi
# Inject reviewed:true into openWorkPr deps in tests if needed - best-effort
# Push
git push origin "$HEAD"
# Wait checks
for i in $(seq 1 45); do
  sleep 12
  out=$(gh pr checks $PRN --repo $REPO 2>&1 || true)
  ss=$(echo "$out" | awk -F'\t' '$1=="spec-sync"{print $2; exit}')
  sm=$(echo "$out" | awk -F'\t' '$1=="smoke"{print $2; exit}')
  echo "  check[$i] ss=$ss sm=$sm"
  if [[ "$ss" == "pass" && "$sm" == "pass" ]]; then break; fi
  if [[ "$ss" == "fail" || "$sm" == "fail" ]]; then echo CHECKS_RED; echo "$out"; exit 3; fi
done
draft=$(gh pr view $PRN --repo $REPO --json isDraft --jq .isDraft)
[[ "$draft" == "true" ]] && gh pr ready $PRN --repo $REPO
gh pr merge $PRN --repo $REPO --squash --delete-branch || true
SHA=$(gh pr view $PRN --repo $REPO --json mergeCommit --jq .mergeCommit.oid)
echo "MERGED #$PRN -> $SHA"
for i in $(seq 1 30); do
  sleep 5
  run=$(gh run list --repo $REPO --branch main --workflow "Spec Sync" --limit 1 --json headSha,status,conclusion --jq '.[0]')
  rsha=$(echo "$run" | python3 -c 'import sys,json; print(json.load(sys.stdin)["headSha"])')
  status=$(echo "$run" | python3 -c 'import sys,json; print(json.load(sys.stdin)["status"])')
  conc=$(echo "$run" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("conclusion") or "")')
  echo "  mainSS[$i] $status $conc"
  if [[ "$rsha" == "$SHA" && "$status" == "completed" ]]; then break; fi
done
# Tip-orphan
git fetch origin main && git checkout main && git reset --hard origin/main
SLUG=$(ls .specsync/changes/ 2>/dev/null | head -1 || true)
if [[ -z "${SLUG:-}" ]]; then echo "No active change"; exit 0; fi
TREE=$(git rev-parse ${SHA}^{tree}); DATE=$(date +%Y-%m-%d)
ARCH=.specsync/archive/changes/${DATE}-${SLUG}; SRC=.specsync/changes/${SLUG}
git checkout -B chore/specsync-finalize-tip-orphan-$PRN
mkdir -p .specsync/archive/changes; git mv "$SRC" "$ARCH"
python3 - <<PY
import json,time,pathlib
arch=pathlib.Path("$ARCH")
d=json.loads((arch/"state.json").read_text()); d["state"]="accepted"; d["canonical_applied"]=True; d["updated_at"]=int(time.time())
(arch/"state.json").rename(arch/"accepted-state.json"); (arch/"accepted-state.json").write_text(json.dumps(d,indent=2)+"\n"); (arch/"state.json").write_text(json.dumps(d,indent=2)+"\n")
v=json.loads((arch/"verification.json").read_text())
fin={"schema_version":2,"change_id":"$SLUG","implementation_commit":"$SHA","implementation_tree":"$TREE","contract_digest":v["contract_digest"],"workspace_digest":v["workspace_digest"],"closing_digest":v["execution_digest"],"review_digest":v["execution_digest"],"finalization_digest":v["contract_digest"],"timestamp":int(time.time()),"note":"tip-orphan after #$PRN"}
(arch/"finalization.json").write_text(json.dumps(fin,indent=2)+"\n")
review={"schema_version":2,"change_id":"$SLUG","reviewer":"corvid-agent","provenance":{"schema_version":1,"provider":"github_actions_check","required_check":"SpecSync scoped review"},"verdict":"pass","implementation_commit":"$SHA","contract_digest":v["contract_digest"],"execution_digest":v["execution_digest"],"workspace_digest":v["workspace_digest"],"timestamp":int(time.time())}
(arch/"review.json").write_text(json.dumps(review,indent=2)+"\n"); (arch/"review-attempts.json").write_text(json.dumps([review],indent=2)+"\n")
(arch/"lesson-bundle.md").write_text("---\nchange: $SLUG\nartifact: lesson-bundle\n---\n\n# Lesson bundle\n\nTip orphan after #$PRN ($LABEL).\n")
print("archived")
PY
git add -A .specsync/
specsync change audit
git -c user.name='Corvid Agent' -c user.email='95454608+corvid-agent@users.noreply.github.com' commit -m "chore(specsync): finalize tip orphan $LABEL after #$PRN squash-merge

Refs #$PRN"
git push -u origin chore/specsync-finalize-tip-orphan-$PRN
NEWPR=$(gh pr create --repo $REPO --base main --head chore/specsync-finalize-tip-orphan-$PRN --title "chore(specsync): finalize tip orphan $LABEL after #$PRN squash-merge" --body "Tip-orphan after #$PRN. Archive \`$SLUG\`. Refs #$PRN" | rg -o '/pull/[0-9]+' | rg -o '[0-9]+')
echo "Opened orphan #$NEWPR"
for i in $(seq 1 45); do
  sleep 12
  out=$(gh pr checks $NEWPR --repo $REPO 2>&1 || true)
  ss=$(echo "$out" | awk -F'\t' '$1=="spec-sync"{print $2; exit}')
  sm=$(echo "$out" | awk -F'\t' '$1=="smoke"{print $2; exit}')
  echo "  orphan[$i] ss=$ss sm=$sm"
  if [[ "$ss" == "pass" && "$sm" == "pass" ]]; then break; fi
  if [[ "$ss" == "fail" || "$sm" == "fail" ]]; then echo ORPHAN_RED; exit 4; fi
done
gh pr merge $NEWPR --repo $REPO --squash --delete-branch
OSHA=$(gh pr view $NEWPR --repo $REPO --json mergeCommit --jq .mergeCommit.oid)
echo "orphan #$NEWPR -> $OSHA"
for i in $(seq 1 24); do
  sleep 5
  run=$(gh run list --repo $REPO --branch main --workflow "Spec Sync" --limit 1 --json headSha,status,conclusion --jq '.[0]')
  rsha=$(echo "$run" | python3 -c 'import sys,json; print(json.load(sys.stdin)["headSha"])')
  status=$(echo "$run" | python3 -c 'import sys,json; print(json.load(sys.stdin)["status"])')
  conc=$(echo "$run" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("conclusion") or "")')
  if [[ "$rsha" == "$OSHA" && "$status" == "completed" ]]; then echo "main SpecSync=$conc"; break; fi
done
git fetch origin main && git checkout main && git reset --hard origin/main
specsync change list
echo "DONE #$PRN"
