Output demo/trustlock-demo.gif

Set FontSize 16
Set Width 900
Set Height 580
Set Theme "Dracula"
Set Shell "bash"
Set TypingSpeed 40ms
Set WaitTimeout 60s
Set Padding 20

# ── Hidden setup: create a demo git repo with fixtures ───────────────────────
Hide
Type "DEMO=$(mktemp -d) && cd $DEMO"
Enter
Type "git init -q && git config user.name 'Dev' && git config user.email 'dev@example.com'"
Enter
Type "FIXTURES=/Users/tayyabtariq/Documents/projects/trustlock/demo/fixtures"
Enter
Type "cp $FIXTURES/package.json $FIXTURES/package-lock.json $FIXTURES/package-lock-upgraded.json $FIXTURES/package-lock-suspicious.json $FIXTURES/.trustlockrc.json ."
Enter
Type "mkdir -p .trustlock && cp $FIXTURES/.trustlock/baseline.json $FIXTURES/.trustlock/approvals.json .trustlock/"
Enter
Type "git add -A && git commit -q -m 'Initial commit'"
Enter
Show

# ── Step 1: Show the project state ───────────────────────────────────────────
Type "cat package.json"
Enter
Sleep 2500ms

# ── Step 2: No changes — baseline matches lockfile ───────────────────────────
Type "trustlock check"
Enter
Sleep 3s

# ── Step 3: Add ms@2.1.3 — old, trusted package ──────────────────────────────
Type "cp package-lock-upgraded.json package-lock.json"
Enter
Sleep 300ms
Type "trustlock check"
Enter
Sleep 6s

# ── Step 4: Add new-hotness@1.0.0 — has install scripts, not allowlisted ─────
Type "cp package-lock-suspicious.json package-lock.json"
Enter
Sleep 300ms
Type "trustlock check"
Enter
Sleep 6s

# ── Step 5: Approve the blocked package ──────────────────────────────────────
Type "trustlock approve 'new-hotness@1.0.0' --override scripts --reason 'Verified by team review' --expires 7d"
Enter
Sleep 3500ms

# ── Step 6: Check again — admitted with approval ─────────────────────────────
Type "trustlock check"
Enter
Sleep 5s

Sleep 2s
