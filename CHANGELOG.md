# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.4] - 2026-03-11

### Added

- Test suite using `bun:test` with CI workflow ([#83](https://github.com/igmagollo/suggestion-box/pull/83))
- Type-check step in CI workflow
- Trigram Jaccard fallback for lightweight dedup without HuggingFace ([#82](https://github.com/igmagollo/suggestion-box/pull/82))
- `init --dry-run` flag and `uninit` command ([#78](https://github.com/igmagollo/suggestion-box/pull/78))
- Dedup against existing GitHub issues before publishing ([#77](https://github.com/igmagollo/suggestion-box/pull/77))
- Content length validation (min 20, max 5000 chars) and optional title field on feedback ([#76](https://github.com/igmagollo/suggestion-box/pull/76))

### Fixed

- Use project-scoped hooks instead of global settings ([#79](https://github.com/igmagollo/suggestion-box/pull/79))
- Use relative paths in init config files and create `settings.json` if missing ([#75](https://github.com/igmagollo/suggestion-box/pull/75))
- Enable WAL mode for concurrent DB access and scope dedup queries by target ([#74](https://github.com/igmagollo/suggestion-box/pull/74))
- Relevance check for GitHub issue dedup

### Changed

- Persistent DB connection for MCP server (connection pooling) ([#81](https://github.com/igmagollo/suggestion-box/pull/81))
- Clarified Node.js runtime compatibility in docs ([#80](https://github.com/igmagollo/suggestion-box/pull/80))
- Updated publish workflow permissions

## [0.1.3] - 2026-03-11

### Added

- Issue templates, labels, and self-feedback hooks

### Fixed

- Use `execFileSync` for GitHub issue creation

## [0.1.2] - 2026-03-11

### Changed

- Release drafter workflow and npx install command fix

## [0.1.1] - 2026-03-11

### Added

- README with install, usage, and acknowledgments
- MIT license
- npm publish workflow on GitHub release
- Release drafter CI

### Fixed

- Build for Node.js compatibility and environment variable naming
- Use bun instead of node in generated MCP configs

### Changed

- Scoped package as `@igmagollo/suggestion-box`

## [0.1.0] - 2026-03-11

### Added

- MCP server with 6 tools (submit, list, dismiss, upvote, publish, status)
- CLI with all commands (init, uninit, serve, hook, status, list, publish, dismiss, purge)
- SDK types, `FeedbackStore`, and public API
- Zod schemas and GitHub integration
- Embedder for semantic dedup
- SessionStart hook for proactive feedback injection
- Auto-add generated config files to `.gitignore` on init
- Flat package structure (single package, not monorepo)

[Unreleased]: https://github.com/igmagollo/suggestion-box/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/igmagollo/suggestion-box/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/igmagollo/suggestion-box/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/igmagollo/suggestion-box/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/igmagollo/suggestion-box/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/igmagollo/suggestion-box/releases/tag/v0.1.0
