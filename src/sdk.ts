export { FeedbackStore } from "./store.js";
export { RateLimiter, RateLimitError } from "./rate-limiter.js";
export { DEFAULT_CATEGORIES, getCategories } from "./categories.js";
export type { RateLimiterConfig } from "./rate-limiter.js";
export type {
  EmbedFn,
  VectorType,
  FeedbackCategory,
  TargetType,
  FeedbackStatus,
  SortBy,
  SupervisorConfig,
  Feedback,
  FeedbackMetadata,
  SubmitFeedbackInput,
  SubmitFeedbackResult,
  UpvoteInput,
  ListFeedbackInput,
  FeedbackStats,
  TriageInput,
  TriageResult,
  TriageGroup,
  PreTriageInput,
  PreTriageResult,
} from "./types.js";

import { FeedbackStore } from "./store.js";
import type { SupervisorConfig } from "./types.js";

export function createFeedbackStore(config: SupervisorConfig): FeedbackStore {
  return new FeedbackStore(config);
}
