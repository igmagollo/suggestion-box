# Contributing to suggestion-box

## Prerequisites

- [Bun](https://bun.sh/) (development runtime — the published package runs on Node.js, but you need bun to build and test)
- [gh CLI](https://cli.github.com/) (for testing publish workflows)
- Node.js 18+ (for verifying the built output works with `npx`)

## Getting started

```bash
git clone https://github.com/igmagollo/suggestion-box.git
cd suggestion-box
bun install
bun run build
bun test
```

## Project structure

```
src/
  cli.ts        # CLI entry point — init, uninit, serve, publish, etc.
  mcp.ts        # MCP server (stdio transport)
  store.ts      # SQLite/Turso data layer (feedback CRUD, dedup)
  embedder.ts   # HuggingFace embedding for dedup
  github.ts     # GitHub issue creation and dedup via gh CLI
  schemas.ts    # Zod schemas for MCP tool inputs
  sdk.ts        # Public SDK export for programmatic use
  types.ts      # Shared TypeScript types
tests/
  *.test.ts     # Bun test files
```

## Running tests

```bash
bun test              # run all tests
bun test tests/store  # run a specific test file
```

Tests use bun's built-in test runner. No extra test framework needed.

## Type checking

```bash
npx tsc --noEmit
```

The project uses `tsconfig.json` for editor/type-check and `tsconfig.build.json` for the production build.

## PR conventions

- **Conventional commits** — `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, etc.
- **Branch naming** — `feat/short-description`, `fix/short-description`, `docs/short-description`
- Keep PRs focused. One concern per PR.
- CI runs `bun test` on pull requests. Make sure tests pass before opening.

## How to add a new publish target

Publishing currently goes through `src/github.ts`, which creates GitHub issues via the `gh` CLI. To add a different target (e.g., Linear, Jira):

1. Create a new file like `src/linear.ts` exporting a function with this shape:
   ```ts
   export function createLinearIssue(
     feedback: Feedback,
     voteLog: Array<{ evidence: string | null; sessionId: string; createdAt: number }>,
   ): { url: string; deduplicated: boolean };
   ```
2. Wire it into the `publish` command in `src/cli.ts` — either by adding a `--target` flag or auto-detecting from config.
3. If the target needs MCP tool exposure, add a new tool in `src/mcp.ts` following the existing `suggestion_box_publish_to_github` pattern.
4. Add tests in `tests/`.

Use `src/github.ts` as a reference for the overall pattern: check auth, search for duplicates, create or update, return a URL.

## How to add a new agent config format to init

The `init` command in `src/cli.ts` writes config files for each supported coding agent. Currently supported: Claude Code (`.mcp.json`), Codex (`.codex/config.toml`), and OpenCode (`opencode.json`).

To add a new agent:

1. In `src/cli.ts`, find the `init` block (search for `else if (command === "init")`).
2. Add a new section after the existing config writers. Follow the pattern:
   - Read existing config if the file exists (preserve user settings).
   - Merge in the suggestion-box MCP server entry.
   - Write the file.
   - Use `cli.command` and `cli.args` from `getCliCommand()` for the server command.
   - Support `--dry-run` by printing what would happen instead of writing.
3. Add the corresponding removal logic in the `uninit` block.
4. Add the config file path to the `ignoreEntries` array in both `init` and `uninit` so it gets added to `.gitignore`.

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SUGGESTION_BOX_DIR` | Data directory path | `.suggestion-box` |
| `SUGGESTION_BOX_MODEL` | Embedding model override | `Xenova/all-MiniLM-L6-v2` |
