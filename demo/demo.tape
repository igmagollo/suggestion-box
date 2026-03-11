# VHS tape file — records the suggestion-box demo as a GIF
# Install: https://github.com/charmbracelet/vhs
# Record:  vhs demo/demo.tape
#
# Output settings
Output demo/demo.gif
Set FontSize 14
Set Width 1200
Set Height 800
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set Padding 20

# --- Setup ---
Type "# suggestion-box: full feedback loop demo"
Enter
Sleep 1s

Type "DEMO_DIR=$(mktemp -d -t sb-demo-XXXXXX) && cd $DEMO_DIR && git init -q && echo '# demo' > README.md && git add . && git commit -qm init"
Enter
Sleep 2s

# --- Init ---
Type "# Step 1: Initialize suggestion-box in the project"
Enter
Sleep 500ms
Type "npx -y @igmagollo/suggestion-box@latest init ."
Enter
Sleep 5s

# --- Submit friction ---
Type "# Step 2: Submit a friction report (what agents do via MCP)"
Enter
Sleep 500ms
Type@50ms "npx -y @igmagollo/suggestion-box@latest hook submit --category friction --target-type tool --target-name 'file-search' --content 'The file search tool times out on large monorepos with more than 10k files. Had to fall back to manual grep which cost ~2 minutes per search.'"
Enter
Sleep 4s

# --- Submit feature request ---
Type "# Step 3: Submit a feature request"
Enter
Sleep 500ms
Type@50ms "npx -y @igmagollo/suggestion-box@latest hook submit --category feature_request --target-type tool --target-name 'code-search' --content 'Code search should support regex patterns natively. Currently I have to search for a broad term and then filter results manually, which wastes tokens and time.'"
Enter
Sleep 4s

# --- Submit observation ---
Type "# Step 4: Submit an observation"
Enter
Sleep 500ms
Type@50ms "npx -y @igmagollo/suggestion-box@latest hook submit --category observation --target-type workflow --target-name 'pr-review' --content 'The PR review workflow could benefit from a summary step. Most reviews jump straight into line comments without a high-level overview of what changed and why.'"
Enter
Sleep 4s

# --- Status ---
Type "# Step 5: Check the status overview"
Enter
Sleep 500ms
Type "npx -y @igmagollo/suggestion-box@latest status"
Enter
Sleep 3s

# --- List ---
Type "# Step 6: List all feedback"
Enter
Sleep 500ms
Type "npx -y @igmagollo/suggestion-box@latest list"
Enter
Sleep 3s

# --- Publish (show command only) ---
Type "# Step 7: Publish good feedback as a GitHub issue"
Enter
Sleep 500ms
Type "# npx -y @igmagollo/suggestion-box@latest publish 1 owner/repo"
Enter
Sleep 2s

# --- Dismiss ---
Type "# Step 8: Dismiss feedback that isn't actionable"
Enter
Sleep 500ms
Type "npx -y @igmagollo/suggestion-box@latest dismiss 3"
Enter
Sleep 3s

# --- Final status ---
Type "# Step 9: Final status after triage"
Enter
Sleep 500ms
Type "npx -y @igmagollo/suggestion-box@latest status"
Enter
Sleep 3s

Type "# Done! Feedback captured, reviewed, triaged."
Enter
Sleep 2s
