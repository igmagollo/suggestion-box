# suggestion-box Roadmap

## v0.2 — Foundation & Trust
> Goal: fix adoption blockers, make the project safe to recommend to strangers

- [x] Fix issue #57 — `init` modifying global `~/` (adoption blocker)
- [x] Add `--dry-run` flag to `init` that shows what would be written without touching anything
- [x] Add config schema validation with clear error messages on startup
- [x] Add per-session rate limiting to prevent runaway agent spam
- [x] Add minimum quality filter rejecting vague/too-short submissions before hitting the queue
- [x] Store session ID on every feedback entry now, even before transcript capture exists
- [x] Capture dependency/package versions on every feedback entry for regression analysis
- [x] Tie feedback entries to git SHA at submission time; auto-flag when related files change
- [x] ~~Add `CHANGELOG.md`~~ (covered by release-drafter)
- [x] Add `CONTRIBUTING.md`

---

## v0.3 — Developer Experience
> Goal: make it feel polished and serious to first-time visitors

- [x] Add a demo GIF/screen recording to the README showing the full submission → triage → publish loop
- [x] Add a "Built with suggestion-box" section to the README linking to actual agent-filed issues
- [x] Give cross-agent compatibility (Claude Code + Codex + OpenCode) its own README section
- [x] Build a `suggestion-box doctor` command to verify environment health (`gh` CLI, embedding model, write permissions)
- [x] Ship pre-authorized tool list in Claude Code config for safe operations (`submit`, `upvote`, `list`, `status`, `triage`) — keep `publish_to_github` and Linear outside the allowlist
- [x] Make feedback categories configurable per project
- [x] Create a README badge for adopters to add to their own repos — passive distribution
- [x] Publish a Homebrew formula

---

## v0.4 — Review Workflow
> Goal: make human triage fast enough to actually happen

- [x] Fix CLI/MCP server DB lock contention — CLI commands fail when server is running (#149)
- [x] Make `init` create the database so `doctor` passes immediately (#150)
- [x] Fix GitHub dedup for custom categories — `searchExistingIssues` only handles hardcoded title prefixes (#148)
- [x] Auto-triage by vote count to surface high-signal items without manual review
- [x] Build interactive `suggestion-box review` TUI with keyboard shortcuts (`p`=publish, `e`=edit, `d`=dismiss, `s`=skip)
- [x] Add a `/review` slash command that kicks off the pre-triage agent flow conversationally inside Claude Code
- [x] Add a pre-triage MCP tool that groups entries, deduplicates against target repo/Linear, enriches with impact summary, and moves results to a `pending_review` queue
- [x] Inject a digest of top-voted unresolved friction into SessionStart so new agents arrive pre-warned
- [x] Add a webhook option that pings Slack/Discord when high-vote items arrive

---

## v0.5 — Transcript & Context
> Goal: give the triage agent enough context to reason well

- [ ] Leverage Claude Code's native session transcripts at `~/.claude/projects/<project-hash>/<session-id>.jsonl`
- [ ] Add a PostToolUse hook that appends tool calls/responses to `.suggestion-box/transcripts/<session-id>.jsonl` for non-Claude Code agents
- [ ] Document the transcript capture integration path clearly
- [ ] Add per-session agent quality scoring based on feedback vote patterns — use it to measure SessionStart prompt quality

---

## v0.6 — Publisher Ecosystem
> Goal: make suggestion-box work wherever teams already live

- [ ] Linear publishing support (team + project required)
- [ ] Design generic publisher backend interface to support future targets
- [ ] Auto-detect issue templates from target GitHub repo, use local fallback when none exist
- [ ] Build reverse sync — poll GitHub/Linear and auto-resolve local feedback when linked issues close
- [ ] Track resolver attribution and build resolution rate metric per target repo/project
- [ ] Design publisher plugin interface so the community can build Jira, Notion, Azure DevOps targets

---

## v0.7 — Distribution & Discoverability
> Goal: get in front of the community while the MCP ecosystem is still sparse

- [ ] Publish to `modelcontextprotocol/registry` at `io.github.igmagollo/suggestion-box`
- [ ] Add `server.json` with proper tags (`feedback`, `ai-agents`, `claude-code`, `developer-tools`)
- [ ] Add a `suggestion-box check` CI command that fails/warns based on unresolved high-vote items
- [ ] Write post framed as "my agents filed their own GitHub issues" targeting Claude Code / Codex communities
- [ ] Write a longer thought leadership piece on "agents as contributors" — stake out the category

---

## v1.0 — Ecosystem Signal
> Goal: become the quality feedback layer for the MCP ecosystem

- [ ] Design opt-in telemetry layer for anonymized MCP tool friction signals only (target identifier + category + timestamp — no content, no repo, no identity)
- [ ] Add `suggestion-box telemetry on/off` command with clear status in `suggestion-box doctor`
- [ ] Open-source the aggregation server
- [ ] Build public dashboard of systemic friction patterns across opted-in users
- [ ] Build public leaderboard of most-reported MCP tool friction across the ecosystem

---

## Post-v1.0 — Sustainability
> Goal: build a model that funds continued development

- [ ] Design B2B analytics tier (MCP tool author monitoring) — avoid architecture decisions that foreclose this path
- [ ] Introduce MCP tool author dashboard: "here is how agents experience your tool across the ecosystem"
