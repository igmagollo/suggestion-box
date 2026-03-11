export { FeedbackStore } from "./store.js";
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
} from "./types.js";

import { FeedbackStore } from "./store.js";
import type { SupervisorConfig } from "./types.js";

export function createFeedbackStore(config: SupervisorConfig): FeedbackStore {
  return new FeedbackStore(config);
}
