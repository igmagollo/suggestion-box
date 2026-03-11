# suggestion-box

[![suggestion-box](https://img.shields.io/badge/feedback-suggestion--box-blue)](https://github.com/igmagollo/suggestion-box)

A feedback registry MCP for coding agents. Agents proactively report friction, feature requests, and observations as they work. Feedback is deduplicated via embeddings, accumulates votes and impact evidence, and can be published as GitHub issues after human review.

## The problem

When agents and subagents work, they constantly hit friction — tools that fall short, missing features, confusing APIs, insufficient context. That insight evaporates when the session ends. Suggestion-box captures it systematically, creating a feedback loop for improving your agent workspace over time.

## How it works

```
Agent hits friction → submits feedback → similar? auto-votes → human reviews → publishes GitHub issue
```

- **Friction reports** — "I couldn't do X because of Y"
- **Feature requests** — "Tool X should support Y"
- **Observations** — "This pattern is suboptimal"

Each submission includes impact estimates (tokens saved, time saved) for prioritization. Embeddings detect duplicates automatically — if two agents report the same issue, the second becomes a vote instead of a duplicate.

## Demo

![suggestion-box demo](demo/demo.gif)

Re-record with [VHS](https://github.com/charmbracelet/vhs): `vhs demo/demo.tape`

## Install

No special runtime required — the published package runs on **Node.js** (v18+).

```bash
npx @igmagollo/suggestion-box init .
```

### Homebrew (macOS) — coming soon

Once the tap is published, you'll be able to install with:

```bash
brew install igmagollo/tap/suggestion-box
suggestion-box init .
```

See [docs/homebrew-setup.md](docs/homebrew-setup.md) for tap setup details.

This creates a `.suggestion-box/` data directory (local SQLite + vector DB), configures your coding agents, and updates `.gitignore`. Restart your agent to activate.

## Cross-agent compatibility

`suggestion-box init` configures **Claude Code**, **Codex**, and **OpenCode** automatically. All three share the same `.suggestion-box/` database, so feedback submitted by one agent is visible to all others.

| Agent | Config files created | Notes |
|-------|---------------------|-------|
| **Claude Code** | `.mcp.json` + `.claude/settings.json` | SessionStart hook prompts the agent to use suggestion-box proactively |
| **Codex** | `.codex/config.toml` | Sees the MCP tools; no hook support |
| **OpenCode** | `opencode.json` | Sees the MCP tools; no hook support |

**SessionStart hook**: The `.claude/settings.json` hook fires at the start of every Claude Code session, reminding the agent to submit feedback as it works. Codex and OpenCode don't support session hooks — agents will still have access to the tools, but won't get the proactive prompt unless instructed in their system prompt or rules.

**Shared database**: All agents read and write the same `.suggestion-box/` directory. Dedup, votes, and impact estimates work across agents — if Claude Code reports an issue and Codex hits the same friction later, the second submission becomes a vote on the first.

## MCP Tools

Agents get these tools automatically:

| Tool | Description |
|------|-------------|
| `suggestion_box_submit_feedback` | Submit friction, feature request, or observation. Auto-deduplicates via embeddings. |
| `suggestion_box_upvote_feedback` | Vote on existing feedback with evidence and impact estimates. |
| `suggestion_box_list_feedback` | Browse and filter feedback by category, target, status. |
| `suggestion_box_dismiss_feedback` | Soft-delete feedback that's no longer relevant. |
| `suggestion_box_publish_to_github` | Publish feedback as a GitHub issue via `gh` CLI. |
| `suggestion_box_status` | Overview stats: counts, top voted, total estimated impact. |

## CLI

```bash
suggestion-box serve                # Start MCP server (default)
suggestion-box init [dir]           # Set up for a project
suggestion-box status               # Overview
suggestion-box list [--category X] [--status X] [--target X]
suggestion-box submit               # Submit feedback from the CLI
suggestion-box publish <id> [repo]  # Publish as GitHub issue
suggestion-box dismiss <id>         # Dismiss feedback
suggestion-box purge                # Delete dismissed entries
suggestion-box help
```

## Review workflow

```bash
# See what agents have been reporting
suggestion-box list

# Publish the good ones to GitHub
suggestion-box publish <id> owner/repo

# Dismiss the rest
suggestion-box dismiss <id>
```

Or do it conversationally — ask your agent to list feedback, review together, and publish the ones you approve.

## Built with suggestion-box

The issues below were actually filed by AI agents using suggestion-box while developing this project:

- [#84 — Publish flow requires two-step manual intervention](https://github.com/igmagollo/suggestion-box/issues/84) (feature request)
- [#107 — Demo GIF for README](https://github.com/igmagollo/suggestion-box/issues/107) (feature request)
- [#108 — Homebrew formula for CLI distribution](https://github.com/igmagollo/suggestion-box/issues/108) (feature request)
- [#111 — Doctor command for troubleshooting](https://github.com/igmagollo/suggestion-box/issues/111) (feature request)
- [#113 — Configurable feedback categories](https://github.com/igmagollo/suggestion-box/issues/113) (feature request)
- [#116 — README badge showing feedback count](https://github.com/igmagollo/suggestion-box/issues/116) (feature request)

These were all captured automatically during development — no manual issue filing needed. See the full set of agent-filed issues at [#84–#131](https://github.com/igmagollo/suggestion-box/issues?q=is%3Aissue+label%3Asuggestion-box).

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SUGGESTION_BOX_DIR` | Data directory path | `.suggestion-box` |
| `SUGGESTION_BOX_MODEL` | Embedding model override | `Xenova/all-MiniLM-L6-v2` |

## How dedup works

Each feedback submission is embedded using a local model (384-dim, runs on CPU, no API key). When new feedback arrives, it's compared against existing open entries. If cosine similarity exceeds 0.85, the submission becomes a vote on the existing entry instead of creating a duplicate. Impact estimates accumulate across votes.

## Runtime compatibility

The published npm package is bundled for **Node.js** — `npx` works out of the box, no bun required. The CLI shebang is `#!/usr/bin/env node` in the published build, and all MCP config generated by `init` uses `npx -y @igmagollo/suggestion-box@latest` as the command.

[Bun](https://bun.sh/) is only needed for **development** (building from source). If you clone the repo to contribute, install bun and run `bun run build`.

## Badge

Using suggestion-box? Add the badge to your README:

```markdown
[![suggestion-box](https://img.shields.io/badge/feedback-suggestion--box-blue)](https://github.com/igmagollo/suggestion-box)
```

## Acknowledgments

Inspired by [memelord](https://github.com/glommer/memelord) — persistent memory with reinforcement learning for coding agents. Suggestion-box follows similar patterns (local Turso DB, embeddings, MCP tools) but focuses on feedback collection rather than memory retention.

## License

MIT
