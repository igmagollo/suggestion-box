#!/usr/bin/env bash
#
# suggestion-box demo script
#
# Walks through the full feedback loop:
#   init → submit → list → status → publish → dismiss
#
# Usage:
#   1. Run interactively to follow along step-by-step
#   2. Record with asciinema:  asciinema rec demo.cast -c 'bash demo/demo-script.sh'
#   3. Record with vhs:        vhs demo/demo.tape
#
# Prerequisites:
#   - Node.js v18+
#   - gh CLI (authenticated) for the publish step
#   - A scratch directory (the script creates a temp project)
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
step() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
}

pause() {
  if [ -t 0 ]; then
    read -rp "  Press Enter to continue..."
  else
    sleep 1
  fi
}

# ---------------------------------------------------------------------------
# Set up a temporary project directory
# ---------------------------------------------------------------------------
step "1. Create a temporary project"
DEMO_DIR=$(mktemp -d -t suggestion-box-demo-XXXXXX)
echo "Working in: $DEMO_DIR"
cd "$DEMO_DIR"
git init -q
echo "# demo project" > README.md
git add README.md && git commit -q -m "init"
pause

# ---------------------------------------------------------------------------
# Initialize suggestion-box
# ---------------------------------------------------------------------------
step "2. Initialize suggestion-box"
echo '$ npx @igmagollo/suggestion-box init .'
npx -y @igmagollo/suggestion-box@latest init .
echo ""
echo "Created files:"
ls -la .suggestion-box/ 2>/dev/null || true
pause

# ---------------------------------------------------------------------------
# Submit feedback (simulating what agents do via MCP tools)
# ---------------------------------------------------------------------------
step "3. Submit feedback — friction report"
echo '$ npx @igmagollo/suggestion-box submit \'
echo '    --category friction \'
echo '    --target-type tool --target-name "file-search" \'
echo '    --content "The file search tool times out on large monorepos with more than 10k files. Had to fall back to manual grep which cost ~2 minutes per search."'
npx -y @igmagollo/suggestion-box@latest submit \
  --category friction \
  --target-type tool --target-name "file-search" \
  --content "The file search tool times out on large monorepos with more than 10k files. Had to fall back to manual grep which cost ~2 minutes per search."
pause

step "4. Submit feedback — feature request"
echo '$ npx @igmagollo/suggestion-box submit \'
echo '    --category feature_request \'
echo '    --target-type tool --target-name "code-search" \'
echo '    --content "Code search should support regex patterns natively. Currently I have to search for a broad term and then filter results manually, which wastes tokens and time."'
npx -y @igmagollo/suggestion-box@latest submit \
  --category feature_request \
  --target-type tool --target-name "code-search" \
  --content "Code search should support regex patterns natively. Currently I have to search for a broad term and then filter results manually, which wastes tokens and time."
pause

step "5. Submit feedback — observation"
echo '$ npx @igmagollo/suggestion-box submit \'
echo '    --category observation \'
echo '    --target-type workflow --target-name "pr-review" \'
echo '    --content "The PR review workflow could benefit from a summary step. Most reviews jump straight into line comments without a high-level overview of what changed and why."'
npx -y @igmagollo/suggestion-box@latest submit \
  --category observation \
  --target-type workflow --target-name "pr-review" \
  --content "The PR review workflow could benefit from a summary step. Most reviews jump straight into line comments without a high-level overview of what changed and why."
pause

# ---------------------------------------------------------------------------
# Check status
# ---------------------------------------------------------------------------
step "6. Check status overview"
echo '$ npx @igmagollo/suggestion-box status'
npx -y @igmagollo/suggestion-box@latest status
pause

# ---------------------------------------------------------------------------
# List all feedback
# ---------------------------------------------------------------------------
step "7. List all feedback"
echo '$ npx @igmagollo/suggestion-box list'
npx -y @igmagollo/suggestion-box@latest list
pause

# ---------------------------------------------------------------------------
# Publish one to GitHub (dry-run — requires gh auth + real repo)
# ---------------------------------------------------------------------------
step "8. Publish feedback as GitHub issue"
echo "NOTE: This step requires 'gh' CLI authenticated and a real repo."
echo "      Skipping actual publish — here is what the command looks like:"
echo ""
echo '$ npx @igmagollo/suggestion-box publish <id> owner/repo'
echo ""
echo "Replace <id> with a feedback ID from the list above,"
echo "and owner/repo with your GitHub repository."
pause

# ---------------------------------------------------------------------------
# Dismiss feedback
# ---------------------------------------------------------------------------
step "9. Dismiss feedback"
LAST_ID=$(npx -y @igmagollo/suggestion-box@latest list 2>/dev/null | grep '^ID:' | tail -1 | awk '{print $2}')
echo "Dismissing feedback $LAST_ID:"
echo "$ npx @igmagollo/suggestion-box dismiss $LAST_ID"
npx -y @igmagollo/suggestion-box@latest dismiss "$LAST_ID" 2>/dev/null || echo "(dismissed)"
pause

# ---------------------------------------------------------------------------
# Final status
# ---------------------------------------------------------------------------
step "10. Final status after triage"
echo '$ npx @igmagollo/suggestion-box status'
npx -y @igmagollo/suggestion-box@latest status
pause

# ---------------------------------------------------------------------------
# Clean up
# ---------------------------------------------------------------------------
step "Done!"
echo "Demo complete. Temp directory: $DEMO_DIR"
echo "Clean up with:  rm -rf $DEMO_DIR"
