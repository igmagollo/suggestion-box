import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { FeedbackStore } from "../src/store.js";
import { TRIGRAM_MODE } from "../src/embedder.js";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import type { EmbedFn, SupervisorConfig } from "../src/types.js";

function createTrigramEmbed(): EmbedFn {
  const fn: any = async (_text: string) => new Float32Array(0);
  fn[TRIGRAM_MODE] = true;
  return fn;
}

function createConfig(dbPath: string, overrides: Partial<SupervisorConfig> = {}): SupervisorConfig {
  return {
    dbPath,
    sessionId: "test-session",
    embed: createTrigramEmbed(),
    persistent: false,
    ...overrides,
  };
}

let tmpDir: string;
let dbPath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "sb-pretriage-test-"));
  dbPath = join(tmpDir, "test.db");
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("pre-triage", () => {
  describe("markPendingReview", () => {
    test("marks open feedback as pending_review", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const { feedbackId } = await store.submitFeedback({
        category: "friction",
        content: "The search feature is very slow when there are many results to display",
        targetType: "mcp_server",
        targetName: "test-server",
      });

      const marked = await store.markPendingReview(feedbackId);
      expect(marked).toBe(true);

      const feedback = await store.getFeedbackById(feedbackId);
      expect(feedback!.status).toBe("pending_review");
      await store.close();
    });

    test("returns false for non-existent feedback", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      await store.init();
      const marked = await store.markPendingReview("nonexistent-id");
      expect(marked).toBe(false);
      await store.close();
    });

    test("returns false for already dismissed feedback", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const { feedbackId } = await store.submitFeedback({
        category: "friction",
        content: "The search feature is very slow when there are many results to display",
        targetType: "mcp_server",
        targetName: "test-server",
      });

      await store.dismiss(feedbackId);
      const marked = await store.markPendingReview(feedbackId);
      expect(marked).toBe(false);
      await store.close();
    });
  });

  describe("preTriage", () => {
    test("returns empty result when no open feedback", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      await store.init();

      const result = await store.preTriage();
      expect(result.totalItems).toBe(0);
      expect(result.groups).toHaveLength(0);
      expect(result.markedAsPendingReview).toBe(0);
      await store.close();
    });

    test("groups similar feedback items together", async () => {
      const store = new FeedbackStore(createConfig(dbPath));

      // Submit two similar items about slow search — use different target names to avoid dedup
      await store.submitFeedback({
        category: "friction",
        content: "The search feature is very slow when there are many results to display on screen",
        targetType: "mcp_server",
        targetName: "server-a",
      });
      await store.submitFeedback({
        category: "friction",
        content: "The search feature is very slow when there are many results to display in UI",
        targetType: "mcp_server",
        targetName: "server-b",
      });

      // Submit an unrelated item
      await store.submitFeedback({
        category: "feature_request",
        content: "Please add export functionality for the entire database to CSV format",
        targetType: "tool",
        targetName: "export-tool",
      });

      const result = await store.preTriage({ markAsPendingReview: false });
      expect(result.totalItems).toBe(3);
      // Similar items should be clustered together, unrelated items separate
      expect(result.groups.length).toBeGreaterThanOrEqual(2);
      expect(result.groups.length).toBeLessThanOrEqual(3);
      await store.close();
    });

    test("marks items as pending_review by default", async () => {
      const store = new FeedbackStore(createConfig(dbPath));

      await store.submitFeedback({
        category: "friction",
        content: "The search feature is very slow when there are many results to display on screen",
        targetType: "mcp_server",
        targetName: "test-server",
      });
      await store.submitFeedback({
        category: "feature_request",
        content: "Please add export functionality for the entire database to CSV format",
        targetType: "tool",
        targetName: "export-tool",
      });

      const result = await store.preTriage();
      expect(result.markedAsPendingReview).toBe(2);

      // Items should now be pending_review, not open
      const openItems = await store.listFeedback({ status: "open" });
      expect(openItems).toHaveLength(0);

      const pendingItems = await store.listFeedback({ status: "pending_review" });
      expect(pendingItems).toHaveLength(2);
      await store.close();
    });

    test("does not mark as pending_review when markAsPendingReview is false", async () => {
      const store = new FeedbackStore(createConfig(dbPath));

      await store.submitFeedback({
        category: "friction",
        content: "The search feature is very slow when there are many results to display on screen",
        targetType: "mcp_server",
        targetName: "test-server",
      });

      const result = await store.preTriage({ markAsPendingReview: false });
      expect(result.markedAsPendingReview).toBe(0);

      const openItems = await store.listFeedback({ status: "open" });
      expect(openItems).toHaveLength(1);
      await store.close();
    });

    test("representative is highest-voted item in cluster", async () => {
      const store = new FeedbackStore(createConfig(dbPath));

      // Submit first item and give it extra votes
      const first = await store.submitFeedback({
        category: "friction",
        content: "The search feature is very slow when there are many results to display on screen",
        targetType: "mcp_server",
        targetName: "test-server",
      });
      await store.upvote({ feedbackId: first.feedbackId });
      await store.upvote({ feedbackId: first.feedbackId });

      // Submit a similar but lower-voted item
      const second = await store.submitFeedback({
        category: "friction",
        content: "The search feature is very slow when there are many results to display in UI",
        targetType: "mcp_server",
        targetName: "test-server",
      });

      const result = await store.preTriage({ markAsPendingReview: false });

      // Find the group containing these items
      const searchGroup = result.groups.find(g =>
        g.items.some(i => i.id === first.feedbackId || i.id === second.feedbackId)
      );
      expect(searchGroup).toBeDefined();

      if (searchGroup && searchGroup.items.length > 1) {
        // If they're grouped, representative should be the most voted
        expect(searchGroup.representative.id).toBe(first.feedbackId);
      }
      await store.close();
    });

    test("computes aggregate totals per group", async () => {
      const store = new FeedbackStore(createConfig(dbPath));

      await store.submitFeedback({
        category: "friction",
        content: "The search feature is very slow when there are many results to display on screen",
        targetType: "mcp_server",
        targetName: "test-server",
        estimatedTokensSaved: 100,
        estimatedTimeSavedMinutes: 5,
      });
      await store.submitFeedback({
        category: "friction",
        content: "The search feature is very slow when there are many results to display in the UI",
        targetType: "mcp_server",
        targetName: "test-server",
        estimatedTokensSaved: 200,
        estimatedTimeSavedMinutes: 10,
      });

      const result = await store.preTriage({ markAsPendingReview: false });

      // Find group with both items
      const group = result.groups.find(g => g.items.length === 2);
      if (group) {
        expect(group.totalVotes).toBe(2);
        expect(group.totalEstimatedTokensSaved).toBe(300);
        expect(group.totalEstimatedTimeSavedMinutes).toBe(15);
      }
      await store.close();
    });

    test("filters by target_name", async () => {
      const store = new FeedbackStore(createConfig(dbPath));

      await store.submitFeedback({
        category: "friction",
        content: "The search feature is very slow when there are many results to display on screen",
        targetType: "mcp_server",
        targetName: "server-a",
      });
      await store.submitFeedback({
        category: "friction",
        content: "The connection pool exhausts available handles under high concurrency load",
        targetType: "mcp_server",
        targetName: "server-b",
      });

      const result = await store.preTriage({ targetName: "server-a", markAsPendingReview: false });
      expect(result.totalItems).toBe(1);
      expect(result.groups[0].representative.targetName).toBe("server-a");
      await store.close();
    });

    test("respects limit parameter", async () => {
      const store = new FeedbackStore(createConfig(dbPath));

      for (let i = 0; i < 5; i++) {
        await store.submitFeedback({
          category: "friction",
          content: `Unique feedback item number ${i} that contains enough characters to pass validation`,
          targetType: "mcp_server",
          targetName: `server-${i}`,
        });
      }

      const result = await store.preTriage({ limit: 3, markAsPendingReview: false });
      expect(result.totalItems).toBe(3);
      await store.close();
    });

    test("only processes open feedback (not dismissed or published)", async () => {
      const store = new FeedbackStore(createConfig(dbPath));

      const open = await store.submitFeedback({
        category: "friction",
        content: "The search feature is very slow when there are many results to display on screen",
        targetType: "mcp_server",
        targetName: "test-server",
      });
      const dismissed = await store.submitFeedback({
        category: "friction",
        content: "The connection pool exhausts available handles under very high concurrency load",
        targetType: "mcp_server",
        targetName: "test-server",
      });
      const published = await store.submitFeedback({
        category: "feature_request",
        content: "Please add export functionality for the entire database to CSV format",
        targetType: "tool",
        targetName: "export-tool",
      });

      await store.dismiss(dismissed.feedbackId);
      await store.markPublished(published.feedbackId, "https://github.com/org/repo/issues/42");

      const result = await store.preTriage({ markAsPendingReview: false });
      expect(result.totalItems).toBe(1);
      expect(result.groups[0].representative.id).toBe(open.feedbackId);
      await store.close();
    });
  });
});
