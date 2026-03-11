import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createFeedbackStore } from "./sdk.js";
import { createEmbedder } from "./embedder.js";
import { randomUUID } from "crypto";
import {
  submitFeedbackSchema,
  upvoteFeedbackSchema,
  listFeedbackSchema,
  dismissFeedbackSchema,
  publishToGithubSchema,
} from "./schemas.js";
import { checkGhAuth, createGithubIssue } from "./github.js";
import { assertValidConfig } from "./config.js";

export async function startMcpServer(): Promise<void> {
  const { dataDir, dbPath } = assertValidConfig();

  const embed = await createEmbedder();

  const store = createFeedbackStore({
    dbPath,
    sessionId: randomUUID(),
    embed,
    persistent: true,
  });

  await store.init();

  const server = new McpServer({
    name: "suggestion-box",
    version: "0.1.0",
  });

  // -------------------------------------------------------------------------
  // Tool: suggestion_box_submit_feedback
  // -------------------------------------------------------------------------
  server.tool(
    "suggestion_box_submit_feedback",
    `Submit feedback about a tool, MCP server, codebase, or workflow.

Use category "friction" when you:
- Hit a limitation that slowed you down
- Had insufficient context to complete a task
- Found a tool's behavior confusing or unexpected

Use category "feature_request" when:
- A tool or MCP is missing a capability you need
- You envision a specific improvement that would help

Use category "observation" when:
- You notice a pattern that could be improved
- Something in the codebase or workflow is suboptimal

If similar feedback already exists, your submission becomes a vote on it instead of creating a duplicate. Include impact estimates to help prioritize.`,
    submitFeedbackSchema.shape,
    async ({ category, title, content, target_type, target_name, github_repo, estimated_tokens_saved, estimated_time_saved_minutes }) => {
      try {
        store.embedPending().catch((e) => console.error("[suggestion-box] embedPending error:", e));

        const result = await store.submitFeedback({
          category,
          title,
          content,
          targetType: target_type,
          targetName: target_name,
          githubRepo: github_repo,
          estimatedTokensSaved: estimated_tokens_saved,
          estimatedTimeSavedMinutes: estimated_time_saved_minutes,
        });

        if (result.isDuplicate) {
          return {
            content: [{
              type: "text" as const,
              text: `Similar feedback already exists (id: ${result.feedbackId}). Your submission was recorded as a vote. Total votes: ${result.votes}.`,
            }],
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: `Feedback submitted (id: ${result.feedbackId}). This will be reviewed and may be published as a GitHub issue.`,
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  // -------------------------------------------------------------------------
  // Tool: suggestion_box_upvote_feedback
  // -------------------------------------------------------------------------
  server.tool(
    "suggestion_box_upvote_feedback",
    `Upvote an existing feedback entry. Use this when you encounter the same friction or agree with a feature request found via suggestion_box_list_feedback. Include evidence about your specific experience to strengthen the case.`,
    upvoteFeedbackSchema.shape,
    async ({ feedback_id, evidence, estimated_tokens_saved, estimated_time_saved_minutes }) => {
      try {
        const result = await store.upvote({
          feedbackId: feedback_id,
          evidence,
          estimatedTokensSaved: estimated_tokens_saved,
          estimatedTimeSavedMinutes: estimated_time_saved_minutes,
        });
        return {
          content: [{
            type: "text" as const,
            text: `Upvoted feedback ${feedback_id}. Total votes: ${result.votes}.`,
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  // -------------------------------------------------------------------------
  // Tool: suggestion_box_list_feedback
  // -------------------------------------------------------------------------
  server.tool(
    "suggestion_box_list_feedback",
    `List and filter feedback entries. Use this to review what agents have reported. Default: open items sorted by votes.`,
    listFeedbackSchema.shape,
    async ({ category, target_type, target_name, status, session_id, sort_by, limit }) => {
      try {
        const items = await store.listFeedback({
          category,
          targetType: target_type,
          targetName: target_name,
          status: status ?? "open",
          sessionId: session_id,
          sortBy: sort_by,
          limit,
        });

        if (items.length === 0) {
          return { content: [{ type: "text" as const, text: "No feedback entries found matching the filters." }] };
        }

        let text = `Found ${items.length} feedback entries:\n\n`;
        for (const item of items) {
          const impact = [
            item.estimatedTokensSaved ? `~${item.estimatedTokensSaved} tokens` : null,
            item.estimatedTimeSavedMinutes ? `~${item.estimatedTimeSavedMinutes}min` : null,
          ].filter(Boolean).join(", ");

          text += `--- [${item.category}] ${item.status} | ${item.votes} votes${impact ? ` | impact: ${impact}` : ""} ---\n`;
          text += `ID: ${item.id}\n`;
          text += `Target: ${item.targetType}/${item.targetName}`;
          if (item.githubRepo) text += ` (repo: ${item.githubRepo})`;
          text += `\n${item.content}\n\n`;
        }

        return { content: [{ type: "text" as const, text }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  // -------------------------------------------------------------------------
  // Tool: suggestion_box_dismiss_feedback
  // -------------------------------------------------------------------------
  server.tool(
    "suggestion_box_dismiss_feedback",
    `Dismiss a feedback entry (soft delete). Use when feedback is no longer relevant, was addressed, or is invalid.`,
    dismissFeedbackSchema.shape,
    async ({ feedback_id }) => {
      try {
        const dismissed = await store.dismiss(feedback_id);
        if (!dismissed) {
          return { content: [{ type: "text" as const, text: `Feedback ${feedback_id} not found or already dismissed.` }] };
        }
        return { content: [{ type: "text" as const, text: `Feedback ${feedback_id} dismissed.` }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  // -------------------------------------------------------------------------
  // Tool: suggestion_box_publish_to_github
  // -------------------------------------------------------------------------
  server.tool(
    "suggestion_box_publish_to_github",
    `Publish a feedback entry as a GitHub issue. Requires gh CLI to be authenticated. The issue includes the feedback description, vote count, impact estimates, and evidence from agents. The github_repo parameter overrides any repo stored on the feedback entry.`,
    publishToGithubSchema.shape,
    async ({ feedback_id, github_repo }) => {
      try {
        if (!checkGhAuth()) {
          return {
            content: [{ type: "text" as const, text: "Error: gh CLI is not authenticated. Run 'gh auth login' first." }],
            isError: true,
          };
        }

        const item = await store.getFeedbackById(feedback_id);
        if (!item || item.status !== "open") {
          return { content: [{ type: "text" as const, text: `Feedback ${feedback_id} not found or not open.` }], isError: true };
        }

        const repo = github_repo ?? item.githubRepo;
        if (!repo) {
          return {
            content: [{ type: "text" as const, text: "Error: No GitHub repo specified. Provide github_repo parameter or set it on the feedback entry." }],
            isError: true,
          };
        }

        const voteLog = await store.getVoteLog(feedback_id);
        const result = createGithubIssue(repo, item, voteLog);
        await store.markPublished(feedback_id, result.url);

        if (result.deduplicated) {
          return {
            content: [{ type: "text" as const, text: `Found existing issue #${result.existingIssueNumber} — added 👍 reaction and comment instead of creating a duplicate: ${result.url}` }],
          };
        }

        return {
          content: [{ type: "text" as const, text: `Published as GitHub issue: ${result.url}` }],
        };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  // -------------------------------------------------------------------------
  // Tool: suggestion_box_status
  // -------------------------------------------------------------------------
  server.tool(
    "suggestion_box_status",
    `Show feedback system statistics: total entries, by category, by status, top voted, and total estimated impact.`,
    {},
    async () => {
      try {
        const stats = await store.getStats();
        const lines = [
          `suggestion-box status:`,
          `  Total feedback: ${stats.total}`,
          `  By category: ${Object.entries(stats.byCategory).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}`,
          `  By status: ${Object.entries(stats.byStatus).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}`,
          `  Estimated impact: ~${stats.totalEstimatedTokensSaved} tokens, ~${stats.totalEstimatedTimeSavedMinutes} minutes`,
        ];

        if (stats.topVoted.length > 0) {
          lines.push(`\n  Top voted:`);
          for (const f of stats.topVoted) {
            const preview = f.content.length > 70 ? f.content.slice(0, 70) + "..." : f.content;
            lines.push(`    [${f.votes} votes] [${f.category}] ${f.targetType}/${f.targetName}: ${preview}`);
          }
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = () => {
    store.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
