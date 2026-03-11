import { z } from "zod";
import { validateContentQuality } from "./quality.js";
import { DEFAULT_CATEGORIES } from "./categories.js";

/**
 * Build the submit-feedback schema with the given category list.
 * When no categories are supplied the three defaults are used.
 */
export function createSubmitFeedbackSchema(categories?: string[]) {
  const cats = categories && categories.length > 0 ? categories : [...DEFAULT_CATEGORIES];
  // z.enum requires a tuple with at least one element
  const categorySchema = z.enum(cats as [string, ...string[]]).describe("Type of feedback");

  return z.object({
    category: categorySchema,
    title: z.string().max(100, "Title must be 100 characters or fewer").optional().describe("Short summary for the feedback (used as GitHub issue title when published)"),
    content: z.string().min(20, "Feedback must be at least 20 characters — provide enough detail to be actionable").max(5000, "Feedback must be 5000 characters or fewer").superRefine((val, ctx) => {
      const issues = validateContentQuality(val);
      for (const issue of issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: issue.message,
          params: { qualityCode: issue.code },
        });
      }
    }).describe("Detailed description of the feedback"),
    target_type: z.enum(["mcp_server", "tool", "codebase", "workflow", "general"]).describe("What kind of thing this feedback is about"),
    target_name: z.string().describe("Name of the target (e.g., 'context7', 'gh CLI', 'src/auth')"),
    github_repo: z.string().optional().describe("GitHub repo for publishing (e.g., 'owner/repo')"),
    estimated_tokens_saved: z.coerce.number().optional().describe("Estimated tokens this improvement would save per occurrence"),
    estimated_time_saved_minutes: z.coerce.number().optional().describe("Estimated minutes this improvement would save per occurrence"),
    git_sha: z.string().optional().describe("Git HEAD SHA at time of feedback (auto-detected if omitted)"),
    tool_version: z.string().optional().describe("Version of the target tool, if known (e.g., '1.2.3')"),
  });
}

/**
 * Build the list-feedback schema with the given category list.
 * When no categories are supplied the three defaults are used.
 */
export function createListFeedbackSchema(categories?: string[]) {
  const cats = categories && categories.length > 0 ? categories : [...DEFAULT_CATEGORIES];
  const categorySchema = z.enum(cats as [string, ...string[]]).optional().describe("Filter by category");

  return z.object({
    category: categorySchema,
    target_type: z.enum(["mcp_server", "tool", "codebase", "workflow", "general"]).optional().describe("Filter by target type"),
    target_name: z.string().optional().describe("Filter by target name"),
    status: z.enum(["open", "published", "dismissed"]).optional().describe("Filter by status (default: open)"),
    session_id: z.string().optional().describe("Filter by session ID"),
    sort_by: z.enum(["votes", "recent", "impact"]).optional().describe("Sort order (default: votes)"),
    limit: z.coerce.number().optional().describe("Max results (default: 20)"),
  });
}

/** Default schemas using the built-in categories — kept for backward compatibility and tests. */
export const submitFeedbackSchema = createSubmitFeedbackSchema();
export const listFeedbackSchema = createListFeedbackSchema();

export const upvoteFeedbackSchema = z.object({
  feedback_id: z.string().describe("ID of the feedback to upvote"),
  evidence: z.string().optional().describe("Why you're upvoting — your experience or reasoning"),
  estimated_tokens_saved: z.coerce.number().optional().describe("Your estimate of tokens saved"),
  estimated_time_saved_minutes: z.coerce.number().optional().describe("Your estimate of minutes saved"),
});

export const dismissFeedbackSchema = z.object({
  feedback_id: z.string().describe("ID of the feedback to dismiss"),
});

export const publishToGithubSchema = z.object({
  feedback_id: z.string().describe("ID of the feedback to publish"),
  github_repo: z.string().optional().describe("GitHub repo (overrides stored value, format: owner/repo)"),
});

export const triageSchema = z.object({
  threshold: z.coerce.number().int().min(1).optional().describe("Minimum vote count to include (default: 3)"),
  limit: z.coerce.number().int().min(1).optional().describe("Max results (default: 20)"),
});
