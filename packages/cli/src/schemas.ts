import { z } from "zod";

export const submitFeedbackSchema = z.object({
  category: z.enum(["friction", "feature_request", "observation"]).describe("Type of feedback"),
  content: z.string().describe("Detailed description of the feedback"),
  target_type: z.enum(["mcp_server", "tool", "codebase", "workflow", "general"]).describe("What kind of thing this feedback is about"),
  target_name: z.string().describe("Name of the target (e.g., 'context7', 'gh CLI', 'src/auth')"),
  github_repo: z.string().optional().describe("GitHub repo for publishing (e.g., 'owner/repo')"),
  estimated_tokens_saved: z.coerce.number().optional().describe("Estimated tokens this improvement would save per occurrence"),
  estimated_time_saved_minutes: z.coerce.number().optional().describe("Estimated minutes this improvement would save per occurrence"),
});

export const upvoteFeedbackSchema = z.object({
  feedback_id: z.string().describe("ID of the feedback to upvote"),
  evidence: z.string().optional().describe("Why you're upvoting — your experience or reasoning"),
  estimated_tokens_saved: z.coerce.number().optional().describe("Your estimate of tokens saved"),
  estimated_time_saved_minutes: z.coerce.number().optional().describe("Your estimate of minutes saved"),
});

export const listFeedbackSchema = z.object({
  category: z.enum(["friction", "feature_request", "observation"]).optional().describe("Filter by category"),
  target_type: z.enum(["mcp_server", "tool", "codebase", "workflow", "general"]).optional().describe("Filter by target type"),
  target_name: z.string().optional().describe("Filter by target name"),
  status: z.enum(["open", "published", "dismissed"]).optional().describe("Filter by status (default: open)"),
  sort_by: z.enum(["votes", "recent", "impact"]).optional().describe("Sort order (default: votes)"),
  limit: z.coerce.number().optional().describe("Max results (default: 20)"),
});

export const dismissFeedbackSchema = z.object({
  feedback_id: z.string().describe("ID of the feedback to dismiss"),
});

export const publishToGithubSchema = z.object({
  feedback_id: z.string().describe("ID of the feedback to publish"),
  github_repo: z.string().optional().describe("GitHub repo (overrides stored value, format: owner/repo)"),
});
