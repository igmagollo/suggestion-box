#!/usr/bin/env bun
import { startMcpServer } from "./mcp.js";
import { resolve, join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

const command = process.argv[2];

function getDbPath(): string {
  const dataDir = resolve(process.env.SUGGESTION_BOX_DIR ?? ".suggestion-box");
  return join(dataDir, "feedback.db");
}

async function withDb<T>(fn: (db: any) => Promise<T>): Promise<T> {
  const { connect } = await import("@tursodatabase/database");
  const dbPath = getDbPath();
  if (!existsSync(dbPath)) {
    console.log("No suggestion-box database found. Run 'suggestion-box init' first.");
    process.exit(0);
  }
  const db = await connect(dbPath);
  await db.exec("PRAGMA busy_timeout = 5000");
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

function getCliCommand(): { command: string; args: string[] } {
  const execPath = process.argv[1] ?? "";
  if (execPath.includes("node_modules")) {
    return { command: "npx", args: ["-y", "@igmagollo/suggestion-box@latest"] };
  }
  return { command: "bun", args: [resolve(execPath)] };
}

function timeAgo(epochSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - epochSec;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

if (command === "hook") {
  const event = process.argv[3];
  if (event === "session-start") {
    console.log(`<suggestion-box>
You have access to the suggestion-box MCP — a feedback registry for improving your workspace.

BE PROACTIVE. Throughout your work, actively look for opportunities to submit feedback:

1. **Friction** — When a tool, MCP, or workflow slows you down, is confusing, or gives insufficient context, submit it immediately:
   suggestion_box_submit_feedback(category: "friction", content: "what happened", target_type: ..., target_name: ...)

2. **Feature requests** — When you wish a tool could do something it can't, or you see a clear improvement:
   suggestion_box_submit_feedback(category: "feature_request", content: "what you need", target_type: ..., target_name: ...)

3. **Observations** — When you notice suboptimal patterns, confusing code, or workflow inefficiencies:
   suggestion_box_submit_feedback(category: "observation", content: "what you noticed", target_type: ..., target_name: ...)

IMPORTANT RULES:
- Include estimated_tokens_saved and/or estimated_time_saved_minutes when you can — this helps prioritize.
- Include github_repo when the feedback targets an open-source tool (e.g., "upstash/context7").
- For feedback about suggestion-box itself, use target_type: "mcp_server", target_name: "suggestion-box", github_repo: "igmagollo/suggestion-box".
- The system auto-deduplicates: if similar feedback exists, your submission becomes a vote. No need to check first.
- Do NOT hold back. Even small friction is worth reporting. The more data, the better the workspace gets.
- Actively evaluate the tools you use — including suggestion-box itself. If something is confusing, slow, or missing, report it.
- Subagents: you inherit this MCP. Use it. Your feedback is equally valuable.
</suggestion-box>`);
  }
  // Other hook events are no-ops for now
  process.exit(0);

} else if (!command || command === "serve") {
  await startMcpServer();

} else if (command === "status") {
  await withDb(async (db) => {
    const total = (await db.prepare("SELECT COUNT(*) as c FROM feedback").get() as any).c;
    const catRows = await db.prepare(
      "SELECT category, COUNT(*) as c FROM feedback GROUP BY category ORDER BY c DESC"
    ).all() as any[];
    const statusRows = await db.prepare(
      "SELECT status, COUNT(*) as c FROM feedback GROUP BY status ORDER BY c DESC"
    ).all() as any[];

    console.log(`suggestion-box status:`);
    console.log(`  Total feedback: ${total}`);
    console.log(`  By category: ${catRows.map((r: any) => `${r.category}=${r.c}`).join(", ") || "none"}`);
    console.log(`  By status: ${statusRows.map((r: any) => `${r.status}=${r.c}`).join(", ") || "none"}`);

    const topRows = await db.prepare(
      "SELECT content, votes, category, target_type, target_name FROM feedback WHERE status = 'open' ORDER BY votes DESC LIMIT 5"
    ).all() as any[];

    if (topRows.length > 0) {
      console.log(`\n  Top voted:`);
      for (const r of topRows) {
        const preview = r.content.length > 60 ? r.content.slice(0, 60) + "..." : r.content;
        console.log(`    [${r.votes} votes] [${r.category}] ${r.target_type}/${r.target_name}: ${preview}`);
      }
    }
  });

} else if (command === "list") {
  await withDb(async (db) => {
    const args = process.argv.slice(3);
    const conditions: string[] = [];
    const params: any[] = [];

    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--category" && args[i + 1]) {
        conditions.push("category = ?");
        params.push(args[++i]);
      } else if (args[i] === "--status" && args[i + 1]) {
        conditions.push("status = ?");
        params.push(args[++i]);
      } else if (args[i] === "--target" && args[i + 1]) {
        conditions.push("target_name = ?");
        params.push(args[++i]);
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await db.prepare(
      `SELECT * FROM feedback ${where} ORDER BY votes DESC`
    ).all(...params) as any[];

    if (rows.length === 0) {
      console.log("No feedback entries found.");
      process.exit(0);
    }

    console.log(`${rows.length} feedback entries:\n`);
    for (const r of rows) {
      console.log(`--- [${r.category}] ${r.status} | ${r.votes} votes | ${timeAgo(r.created_at)} ---`);
      console.log(`ID: ${r.id}`);
      console.log(`Target: ${r.target_type}/${r.target_name}${r.github_repo ? ` (repo: ${r.github_repo})` : ""}`);
      console.log(r.content.slice(0, 500));
      if (r.content.length > 500) console.log(`  ...(${r.content.length} chars total)`);
      console.log();
    }
  });

} else if (command === "dismiss") {
  const feedbackId = process.argv[3];
  if (!feedbackId) {
    console.error("Usage: suggestion-box dismiss <feedback_id>");
    process.exit(1);
  }
  await withDb(async (db) => {
    const now = Math.floor(Date.now() / 1000);
    const result = await db.prepare(
      "UPDATE feedback SET status = 'dismissed', updated_at = ? WHERE id = ? AND status = 'open'"
    ).run(now, feedbackId);
    if (result.changes > 0) {
      console.log(`Feedback ${feedbackId} dismissed.`);
    } else {
      console.log(`Feedback ${feedbackId} not found or already dismissed.`);
    }
  });

} else if (command === "publish") {
  const feedbackId = process.argv[3];
  const repoOverride = process.argv[4];
  if (!feedbackId) {
    console.error("Usage: suggestion-box publish <feedback_id> [repo]");
    process.exit(1);
  }

  const { checkGhAuth, createGithubIssue } = await import("./github.js");
  if (!checkGhAuth()) {
    console.error("Error: gh CLI is not authenticated. Run 'gh auth login' first.");
    process.exit(1);
  }

  await withDb(async (db) => {
    const row = await db.prepare("SELECT * FROM feedback WHERE id = ?").get(feedbackId) as any;
    if (!row) {
      console.error(`Feedback ${feedbackId} not found.`);
      process.exit(1);
    }

    const repo = repoOverride ?? row.github_repo;
    if (!repo) {
      console.error("No GitHub repo specified. Provide as argument: suggestion-box publish <id> <owner/repo>");
      process.exit(1);
    }

    const voteRows = await db.prepare(
      "SELECT session_id, evidence, estimated_tokens_saved, estimated_time_saved_minutes, created_at FROM vote_log WHERE feedback_id = ?"
    ).all(feedbackId) as any[];

    const issueUrl = createGithubIssue(repo, {
      id: row.id,
      title: row.title ?? null,
      content: row.content,
      category: row.category,
      targetType: row.target_type,
      targetName: row.target_name,
      githubRepo: row.github_repo,
      status: row.status,
      votes: row.votes,
      estimatedTokensSaved: row.estimated_tokens_saved,
      estimatedTimeSavedMinutes: row.estimated_time_saved_minutes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedIssueUrl: row.published_issue_url,
      sessionId: row.session_id,
    }, voteRows);

    const now = Math.floor(Date.now() / 1000);
    await db.prepare(
      "UPDATE feedback SET status = 'published', published_issue_url = ?, updated_at = ? WHERE id = ?"
    ).run(issueUrl, now, feedbackId);

    console.log(`Published: ${issueUrl}`);
  });

} else if (command === "purge") {
  await withDb(async (db) => {
    const result = await db.prepare("DELETE FROM feedback WHERE status = 'dismissed'").run();
    console.log(`Purged ${result.changes} dismissed feedback entries.`);
  });

} else if (command === "init") {
  const targetDir = resolve(process.argv[3] ?? ".");
  const cli = getCliCommand();

  const dataDir = join(targetDir, ".suggestion-box");
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const gitignorePath = join(targetDir, ".gitignore");
  const ignoreEntries = [".suggestion-box/", ".mcp.json", ".codex/", "opencode.json"];
  if (existsSync(gitignorePath)) {
    let content = readFileSync(gitignorePath, "utf-8");
    const missing = ignoreEntries.filter(e => !content.includes(e));
    if (missing.length > 0) {
      writeFileSync(gitignorePath, content.trimEnd() + "\n" + missing.join("\n") + "\n");
    }
  } else {
    writeFileSync(gitignorePath, ignoreEntries.join("\n") + "\n");
  }

  const mcpJsonPath = join(targetDir, ".mcp.json");
  let mcpConfig: any = {};
  if (existsSync(mcpJsonPath)) {
    try { mcpConfig = JSON.parse(readFileSync(mcpJsonPath, "utf-8")); } catch {}
  }
  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
  mcpConfig.mcpServers["suggestion-box"] = {
    command: cli.command,
    args: [...cli.args, "serve"],
    env: { SUGGESTION_BOX_DIR: ".suggestion-box" },
  };
  writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2) + "\n");
  console.log("  Wrote .mcp.json (Claude Code)");

  const codexDir = join(targetDir, ".codex");
  if (!existsSync(codexDir)) mkdirSync(codexDir, { recursive: true });
  const codexTomlPath = join(codexDir, "config.toml");
  let codexContent = "";
  if (existsSync(codexTomlPath)) {
    codexContent = readFileSync(codexTomlPath, "utf-8");
  }
  if (!codexContent.includes("[mcp_servers.suggestion-box]")) {
    const codexArgs = [...cli.args, "serve"].map(a => `"${a}"`).join(", ");
    codexContent += `
[mcp_servers.suggestion-box]
command = "${cli.command}"
args = [${codexArgs}]
env = { SUGGESTION_BOX_DIR = ".suggestion-box" }
enabled = true
`;
    writeFileSync(codexTomlPath, codexContent.trimStart());
    console.log("  Wrote .codex/config.toml (Codex)");
  }

  const opencodePath = join(targetDir, "opencode.json");
  let opencodeConfig: any = {};
  if (existsSync(opencodePath)) {
    try { opencodeConfig = JSON.parse(readFileSync(opencodePath, "utf-8")); } catch {}
  }
  if (!opencodeConfig.mcp) opencodeConfig.mcp = {};
  opencodeConfig.mcp["suggestion-box"] = {
    type: "local",
    command: [cli.command, ...cli.args, "serve"],
    environment: { SUGGESTION_BOX_DIR: ".suggestion-box" },
    enabled: true,
  };
  writeFileSync(opencodePath, JSON.stringify(opencodeConfig, null, 2) + "\n");
  console.log("  Wrote opencode.json (OpenCode)");

  // Claude Code hooks — ~/.claude/settings.json
  const claudeDir = join(process.env.HOME ?? "~", ".claude");
  const settingsPath = join(claudeDir, "settings.json");
  if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });

  let settings: any = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, "utf-8")); } catch {}
  }
  if (!settings.hooks) settings.hooks = {};

  const hookCmd = cli.command === "suggestion-box"
    ? "suggestion-box hook session-start"
    : `${cli.command} ${cli.args.join(" ")} hook session-start`;

  const existing: any[] = settings.hooks.SessionStart ?? [];
  const hasHook = existing.some((h: any) =>
    h.hooks?.some((hh: any) => hh.command?.includes("suggestion-box") && hh.command?.includes("hook"))
  );

  if (!hasHook) {
    existing.push({
      hooks: [{ type: "command", command: hookCmd, timeout: 10 }],
    });
    settings.hooks.SessionStart = existing;
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    console.log("  Installed SessionStart hook (~/.claude/settings.json)");
  }

  console.log(`\nsuggestion-box initialized in ${targetDir}`);
  console.log("Restart your coding agent to activate.");

} else if (command === "help" || command === "--help") {
  console.log(`suggestion-box - Centralized feedback registry for coding agents

Usage:
  suggestion-box serve                Start the MCP server (default)
  suggestion-box init [dir]           Set up supervisor for a project (MCP + hooks)
  suggestion-box hook <event>         Run a hook (session-start)
  suggestion-box status               Overview: counts, top voted, impact
  suggestion-box list [--category X] [--status X] [--target X]
  suggestion-box publish <id> [repo]  Publish feedback as GitHub issue
  suggestion-box dismiss <id>         Dismiss a feedback entry
  suggestion-box purge                Delete dismissed entries
  suggestion-box help                 Show this help

Categories: friction, feature_request, observation
Targets: mcp_server, tool, codebase, workflow, general
Statuses: open, published, dismissed

Environment:
  SUGGESTION_BOX_DIR     Data directory (default: .suggestion-box)
  SUGGESTION_BOX_MODEL   Embedding model override`);

} else {
  console.error(`Unknown command: ${command}. Run 'suggestion-box help' for usage.`);
  process.exit(1);
}
