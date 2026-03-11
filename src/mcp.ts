import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createFeedbackStore } from "./sdk.js";
import { createEmbedder } from "./embedder.js";
import { randomUUID } from "crypto";
import {
  createSubmitFeedbackSchema,
  createListFeedbackSchema,
  upvoteFeedbackSchema,
  dismissFeedbackSchema,
  publishToGithubSchema,
  triageSchema,
  preTriageSchema,
} from "./schemas.js";
import { getCategories, getWebhooks } from "./categories.js";
import { execFileSync } from "child_process";
import { checkGhAuth, createGithubIssue, extractKeywords, keywordSimilarity, isSuggestionBoxIssueTitle } from "./github.js";
import { assertValidConfig } from "./config.js";
import { RateLimiter, RateLimitError } from "./rate-limiter.js";

export async function startMcpServer(): Promise<void> {
  const { dataDir, dbPath } = assertValidConfig();

  const embed = await createEmbedder();

  const sessionId = randomUUID();
  const categories = getCategories();
  const webhooks = getWebhooks();
  const store = createFeedbackStore({
    dbPath,
    sessionId,
    embed,
    persistent: true,
    webhooks,
  });

  await store.init();
  const submitFeedbackSchema = createSubmitFeedbackSchema(categories);
  const listFeedbackSchema = createListFeedbackSchema(categories);

  const rateLimiter = new RateLimiter();

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

Configured categories: ${categories.join(", ")}

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
    async ({ category, title, content, target_type, target_name, github_repo, estimated_tokens_saved, estimated_time_saved_minutes, git_sha, tool_version }) => {
      try {
        rateLimiter.check(sessionId);

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
          gitSha: git_sha,
          toolVersion: tool_version,
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
        rateLimiter.check(sessionId);

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
          if (item.gitSha) text += ` (sha: ${item.gitSha.slice(0, 8)})`;
          text += "\n";
          if (item.metadata) {
            const vParts: string[] = [];
            if (item.metadata.suggestionBoxVersion) vParts.push(`sb@${item.metadata.suggestionBoxVersion}`);
            if (item.metadata.toolVersion) vParts.push(`tool@${item.metadata.toolVersion}`);
            if (vParts.length > 0) text += `Versions: ${vParts.join(", ")}\n`;
          }
          text += `${item.content}\n\n`;
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
        if (!item || (item.status !== "open" && item.status !== "pending_review")) {
          return { content: [{ type: "text" as const, text: `Feedback ${feedback_id} not found or not in a publishable state (must be open or pending_review).` }], isError: true };
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

  // -------------------------------------------------------------------------
  // Prompt: review (slash command /review)
  // -------------------------------------------------------------------------
  server.prompt(
    "review",
    `Walk through all open feedback items one by one and triage each one (publish, dismiss, or skip).`,
    {},
    async () => {
      const items = await store.listFeedback({ status: "open", sortBy: "votes" });

      if (items.length === 0) {
        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: "No open feedback items found in suggestion-box. The queue is empty — nothing to review.",
              },
            },
          ],
        };
      }

      const itemSummaries = items.map((item, i) => {
        const impact = [
          item.estimatedTokensSaved ? `~${item.estimatedTokensSaved} tokens saved` : null,
          item.estimatedTimeSavedMinutes ? `~${item.estimatedTimeSavedMinutes}min saved` : null,
        ].filter(Boolean).join(", ");

        const repoHint = item.githubRepo ? ` (repo: ${item.githubRepo})` : "";
        const titleLine = item.title ? `Title: ${item.title}\n` : "";
        const impactLine = impact ? `Impact: ${impact}\n` : "";

        return `### Item ${i + 1} of ${items.length}
ID: ${item.id}
Category: ${item.category} | Votes: ${item.votes} | Status: ${item.status}
Target: ${item.targetType}/${item.targetName}${repoHint}
${titleLine}${impactLine}Content:
${item.content}`;
      }).join("\n\n---\n\n");

      const promptText = `You are running the suggestion-box review flow. There are **${items.length} open feedback items** to triage.

Go through them one by one, in the order presented. For each item:

1. **Show** the item clearly (ID, category, votes, content, target, impact if available).
2. **Ask** the user what to do:
   - **publish** — publish it as a GitHub issue (use \`suggestion_box_publish_to_github\`)
     - If the item has no \`github_repo\`, ask the user to provide one (format: \`owner/repo\`)
   - **dismiss** — mark it as dismissed (use \`suggestion_box_dismiss_feedback\`)
   - **skip** — leave it as-is and move on
   - **quit** — stop the review session early
3. **Execute** the chosen action using the appropriate MCP tool.
4. **Confirm** the result and move to the next item.

After all items are processed (or the user quits), show a **summary**:
- How many were published, dismissed, skipped
- Links to any GitHub issues created

**Important notes:**
- Be conversational — one item at a time, wait for the user's decision before acting.
- When publishing, if \`suggestion_box_publish_to_github\` finds an existing GitHub issue, report the deduplication result.
- Observations are usually not worth publishing publicly — mention this when you encounter observation-category items (but let the user decide).
- Sort preference: highest votes first (already sorted in the list below).

---

## Pending Feedback Queue (${items.length} items)

${itemSummaries}

---

Start now: present **Item 1** and ask the user what to do.`;

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: promptText,
            },
          },
        ],
      };
    },
  );

  // -------------------------------------------------------------------------
  // Tool: suggestion_box_triage
  // -------------------------------------------------------------------------
  server.tool(
    "suggestion_box_triage",
    `Surface high-signal feedback by vote count. Returns open feedback items at or above the vote threshold (default: 3), sorted by votes descending. Use this to identify items that warrant attention without manual review of all entries.`,
    triageSchema.shape,
    async ({ threshold, limit }) => {
      try {
        const result = await store.autoTriage({ threshold, limit });

        if (result.items.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: `No open feedback with ${result.threshold} or more votes found.`,
            }],
          };
        }

        let text = `${result.items.length} item(s) with ≥${result.threshold} votes (high-signal):\n\n`;
        for (const item of result.items) {
          const impact = [
            item.estimatedTokensSaved ? `~${item.estimatedTokensSaved} tokens` : null,
            item.estimatedTimeSavedMinutes ? `~${item.estimatedTimeSavedMinutes}min` : null,
          ].filter(Boolean).join(", ");

          text += `--- [${item.category}] ${item.votes} votes${impact ? ` | impact: ${impact}` : ""} ---\n`;
          text += `ID: ${item.id}\n`;
          text += `Target: ${item.targetType}/${item.targetName}`;
          if (item.githubRepo) text += ` (repo: ${item.githubRepo})`;
          text += "\n";
          if (item.title) text += `Title: ${item.title}\n`;
          text += `${item.content}\n\n`;
        }

        return { content: [{ type: "text" as const, text }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  // -------------------------------------------------------------------------
  // Tool: suggestion_box_pre_triage
  // -------------------------------------------------------------------------
  server.tool(
    "suggestion_box_pre_triage",
    `Pre-triage open feedback: groups similar entries by topic, checks GitHub for existing issues, computes combined impact per group, and moves items to a pending_review queue for human approval.

Use this before a review session to:
- Collapse noisy duplicates into coherent clusters
- Surface which groups already have a GitHub issue
- Prioritize by combined votes and estimated impact
- Prepare a clean queue for the TUI review flow

Returns a structured report of groups with representative items, vote totals, impact estimates, and GitHub deduplication status.`,
    preTriageSchema.shape,
    async ({ target_type, target_name, github_repo, mark_as_pending_review, limit }) => {
      try {
        const result = await store.preTriage({
          targetType: target_type,
          targetName: target_name,
          githubRepo: github_repo,
          markAsPendingReview: mark_as_pending_review,
          limit,
        });

        if (result.totalItems === 0) {
          return { content: [{ type: "text" as const, text: "No open feedback items found matching the filters." }] };
        }

        // For groups that have a github_repo, check for existing issues
        const ghAvailable = github_repo ? checkGhAuth() : false;
        if (ghAvailable && github_repo) {
          for (const group of result.groups) {
            const keywords = extractKeywords(group.representative);
            if (!keywords) continue;
            try {
              const raw = execFileSync(
                "gh",
                ["issue", "list", "--repo", github_repo, "--search", `${keywords} in:title`, "--state", "open", "--json", "number,title,url", "--limit", "5"],
                { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
              );
              const issues: Array<{ number: number; title: string; url: string }> = JSON.parse(raw.trim() || "[]");
              const SIMILARITY_THRESHOLD = 0.3;
              for (const issue of issues) {
                if (!isSuggestionBoxIssueTitle(issue.title) && keywordSimilarity(keywords, issue.title) >= SIMILARITY_THRESHOLD) {
                  group.existingGithubIssueUrl = issue.url;
                  group.existingGithubIssueNumber = issue.number;
                  break;
                }
              }
            } catch {
              // GitHub search failed — continue without dedup info
            }
          }
        }

        // Build report
        const categoryLabel: Record<string, string> = {
          friction: "Friction Report",
          feature_request: "Feature Request",
          observation: "Observation",
        };

        let text = `Pre-triage complete: ${result.totalItems} items grouped into ${result.groups.length} cluster(s)`;
        if (result.markedAsPendingReview > 0) {
          text += ` — ${result.markedAsPendingReview} marked as pending_review`;
        }
        text += "\n\n";

        for (let i = 0; i < result.groups.length; i++) {
          const group = result.groups[i];
          const rep = group.representative;
          const label = categoryLabel[rep.category] ?? rep.category;

          text += `━━━ Group ${i + 1}/${result.groups.length}: [${label}] ${group.items.length} item(s), ${group.totalVotes} total vote(s) ━━━\n`;

          if (group.totalEstimatedTokensSaved > 0 || group.totalEstimatedTimeSavedMinutes > 0) {
            const parts: string[] = [];
            if (group.totalEstimatedTokensSaved > 0) parts.push(`~${group.totalEstimatedTokensSaved} tokens`);
            if (group.totalEstimatedTimeSavedMinutes > 0) parts.push(`~${group.totalEstimatedTimeSavedMinutes}min`);
            text += `Impact: ${parts.join(", ")}\n`;
          }

          if (group.existingGithubIssueUrl) {
            text += `GitHub duplicate: #${group.existingGithubIssueNumber} ${group.existingGithubIssueUrl}\n`;
          }

          text += `Target: ${rep.targetType}/${rep.targetName}\n`;
          text += `Representative (ID: ${rep.id}, ${rep.votes} vote(s)):\n`;
          const preview = rep.content.length > 200 ? rep.content.slice(0, 197) + "..." : rep.content;
          text += `  ${preview}\n`;

          if (group.items.length > 1) {
            text += `Similar items (${group.items.length - 1}):\n`;
            for (const item of group.items) {
              if (item.id === rep.id) continue;
              const itemPreview = item.content.length > 100 ? item.content.slice(0, 97) + "..." : item.content;
              text += `  - [${item.votes}v] ${item.id.slice(0, 8)}: ${itemPreview}\n`;
            }
          }

          text += "\n";
        }

        return { content: [{ type: "text" as const, text }] };
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
