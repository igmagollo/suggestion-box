# VHS tape — suggestion-box demo
# Install: https://github.com/charmbracelet/vhs
# Record:  cd <project-root> && vhs demo/demo.tape
#
# Prerequisites: bun, git

Output demo/demo.gif
Set FontSize 14
Set Width 1000
Set Height 600
Set Theme "Catppuccin Mocha"
Set TypingSpeed 30ms
Set Padding 20
Set Shell bash

# Prepare env silently — VHS requires shell setup before any visible output
Hide
Type `export PS1="\033[32m$\033[0m "`
Enter
Sleep 500ms
Type `REPO_ROOT="$(pwd)"`
Enter
Sleep 200ms
Type `sb() { SUGGESTION_BOX_DIR=.suggestion-box bun run "$REPO_ROOT/src/cli.ts" "$@" 2>/dev/null; }`
Enter
Sleep 200ms
Type `cd $(mktemp -d) && git init -q && echo '# demo' > README.md && git add . && git commit -qm init`
Enter
Sleep 2s
Type "clear"
Enter
Sleep 500ms
Show

# --- Init ---
Type "# Step 1: Initialize suggestion-box"
Enter
Sleep 800ms
Type "sb init ."
Enter
Sleep 5s

# --- Submit friction ---
Type "# Step 2: Submit feedback (friction)"
Enter
Sleep 600ms
Type@40ms `sb submit --category friction --target-type tool --target-name "file-search" --content "File search times out on large monorepos with 10k+ files. Falls back to manual grep, costs ~2min per search."`
Enter
Sleep 12s

# --- Submit feature request ---
Type "# Step 3: Submit feedback (feature request)"
Enter
Sleep 600ms
Type@40ms `sb submit --category feature_request --target-type tool --target-name "code-search" --content "Code search should support regex patterns natively instead of requiring broad term searches with manual filtering."`
Enter
Sleep 12s

# --- Status ---
Type "# Step 4: Check status"
Enter
Sleep 600ms
Type "sb status"
Enter
Sleep 5s

# --- List ---
Type "# Step 5: List all feedback"
Enter
Sleep 600ms
Type "sb list"
Enter
Sleep 5s

# --- Dismiss ---
Type "# Step 6: Dismiss low-priority item"
Enter
Sleep 600ms
Hide
Type `LAST_ID=$(SUGGESTION_BOX_DIR=.suggestion-box bun run "$REPO_ROOT/src/cli.ts" list 2>/dev/null | grep '^ID:' | tail -1 | awk '{print $2}')`
Enter
Sleep 4s
Show
Type `sb dismiss $LAST_ID`
Enter
Sleep 5s

# --- Final status ---
Type "# Step 7: Status after triage"
Enter
Sleep 600ms
Type "sb status"
Enter
Sleep 4s

Type "# Done! Feedback captured, reviewed, triaged."
Enter
Sleep 3s
