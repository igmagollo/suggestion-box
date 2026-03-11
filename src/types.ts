/** User-provided embedding function. Takes text, returns a vector. */
export type EmbedFn = (text: string) => Promise<Float32Array>;

/** Turso vector type for distance calculations. */
export type VectorType = "vector32" | "vector64" | "vector8" | "vector1";

/**
 * Feedback category. The three built-in values are "friction",
 * "feature_request", and "observation", but projects can define
 * custom categories in `.suggestion-box/config.json`.
 */
export type FeedbackCategory = "friction" | "feature_request" | "observation" | (string & {});

export type TargetType = "mcp_server" | "tool" | "codebase" | "workflow" | "general";

export type FeedbackStatus = "open" | "pending_review" | "published" | "dismissed";

export type SortBy = "votes" | "recent" | "impact";

export interface WebhookConfig {
  /** Webhook URL — supports Slack incoming webhooks, Discord webhooks, or any generic HTTP endpoint. */
  url: string;
  /**
   * Vote count threshold. The webhook fires the first time a feedback item's
   * vote count crosses this value (transitions from below to >= threshold).
   * Default: 3.
   */
  voteThreshold?: number;
}

export interface SupervisorConfig {
  /** Path to the Turso database file */
  dbPath: string;
  /** Session identifier — each agent session gets its own ID */
  sessionId: string;
  /** Embedding function — SDK users provide their own */
  embed: EmbedFn;
  /** Vector type for distance calculations (default: "vector32") */
  vectorType?: VectorType;
  /** Cosine similarity threshold for dedup (default: 0.85) */
  dedupThreshold?: number;
  /** Use a persistent DB connection instead of open/close per operation (default: false) */
  persistent?: boolean;
  /**
   * Webhook endpoints to ping when feedback crosses a vote threshold.
   * Each webhook fires exactly once per threshold crossing.
   */
  webhooks?: WebhookConfig[];
}

/** Version metadata captured at feedback submission time. */
export interface FeedbackMetadata {
  /** suggestion-box version that created this entry */
  suggestionBoxVersion?: string;
  /** Version of the target tool, if known */
  toolVersion?: string;
  /** Any additional key-value pairs */
  [key: string]: unknown;
}

export interface Feedback {
  id: string;
  title: string | null;
  content: string;
  category: FeedbackCategory;
  targetType: TargetType;
  targetName: string;
  githubRepo: string | null;
  status: FeedbackStatus;
  votes: number;
  estimatedTokensSaved: number | null;
  estimatedTimeSavedMinutes: number | null;
  createdAt: number;
  updatedAt: number;
  publishedIssueUrl: string | null;
  sessionId: string;
  gitSha: string | null;
  metadata: FeedbackMetadata | null;
}

export interface SubmitFeedbackInput {
  category: FeedbackCategory;
  title?: string;
  content: string;
  targetType: TargetType;
  targetName: string;
  githubRepo?: string;
  estimatedTokensSaved?: number;
  estimatedTimeSavedMinutes?: number;
  gitSha?: string;
  toolVersion?: string;
}

export interface SubmitFeedbackResult {
  feedbackId: string;
  isDuplicate: boolean;
  /** The vote count after this submission */
  votes: number;
}

export interface UpvoteInput {
  feedbackId: string;
  evidence?: string;
  estimatedTokensSaved?: number;
  estimatedTimeSavedMinutes?: number;
}

export interface ListFeedbackInput {
  category?: FeedbackCategory;
  targetType?: TargetType;
  targetName?: string;
  status?: FeedbackStatus;
  sessionId?: string;
  sortBy?: SortBy;
  limit?: number;
}

export interface FeedbackStats {
  total: number;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  topVoted: Feedback[];
  totalEstimatedTokensSaved: number;
  totalEstimatedTimeSavedMinutes: number;
}

export interface TriageInput {
  /** Minimum vote count to include an item (default: 3) */
  threshold?: number;
  /** Max results (default: 20) */
  limit?: number;
}

export interface TriageResult {
  /** Feedback items at or above the vote threshold, sorted by votes descending */
  items: Feedback[];
  /** The threshold used */
  threshold: number;
}

/** A cluster of similar feedback items produced by pre-triage. */
export interface TriageGroup {
  /** The representative (highest-voted) item in this cluster. */
  representative: Feedback;
  /** All items in the cluster (includes the representative). */
  items: Feedback[];
  /** Combined vote count across all items in the cluster. */
  totalVotes: number;
  /** Combined estimated tokens saved across all items. */
  totalEstimatedTokensSaved: number;
  /** Combined estimated time saved across all items. */
  totalEstimatedTimeSavedMinutes: number;
  /** URL of an existing GitHub issue that matches this cluster, if any. */
  existingGithubIssueUrl: string | null;
  /** Number of an existing GitHub issue, if any. */
  existingGithubIssueNumber: number | null;
}

export interface PreTriageInput {
  targetType?: TargetType;
  targetName?: string;
  githubRepo?: string;
  /** If true, mark triaged items as pending_review. Default: true. */
  markAsPendingReview?: boolean;
  limit?: number;
}

export interface PreTriageResult {
  groups: TriageGroup[];
  totalItems: number;
  markedAsPendingReview: number;
}
