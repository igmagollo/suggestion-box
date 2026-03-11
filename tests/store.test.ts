import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { FeedbackStore } from "../src/store.js";
import { TRIGRAM_MODE } from "../src/embedder.js";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import type { EmbedFn, SupervisorConfig } from "../src/types.js";

/** Create a trigram-mode embed function (no HuggingFace needed). */
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

const SAMPLE_INPUT = {
  category: "friction" as const,
  content: "The search feature is very slow when there are many results to display",
  targetType: "mcp_server" as const,
  targetName: "test-server",
};

let tmpDir: string;
let dbPath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "sb-test-"));
  dbPath = join(tmpDir, "test.db");
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("FeedbackStore", () => {
  describe("submit feedback", () => {
    test("submits new feedback and returns non-duplicate result", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const result = await store.submitFeedback(SAMPLE_INPUT);

      expect(result.feedbackId).toBeTruthy();
      expect(result.isDuplicate).toBe(false);
      expect(result.votes).toBe(1);
      await store.close();
    });

    test("stores title when provided", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const result = await store.submitFeedback({
        ...SAMPLE_INPUT,
        title: "Slow search",
      });

      const feedback = await store.getFeedbackById(result.feedbackId);
      expect(feedback?.title).toBe("Slow search");
      await store.close();
    });

    test("title is null when not provided", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const result = await store.submitFeedback(SAMPLE_INPUT);

      const feedback = await store.getFeedbackById(result.feedbackId);
      expect(feedback?.title).toBeNull();
      await store.close();
    });

    test("stores all fields correctly", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const result = await store.submitFeedback({
        ...SAMPLE_INPUT,
        githubRepo: "owner/repo",
        estimatedTokensSaved: 500,
        estimatedTimeSavedMinutes: 10,
      });

      const feedback = await store.getFeedbackById(result.feedbackId);
      expect(feedback).not.toBeNull();
      expect(feedback!.content).toBe(SAMPLE_INPUT.content);
      expect(feedback!.category).toBe("friction");
      expect(feedback!.targetType).toBe("mcp_server");
      expect(feedback!.targetName).toBe("test-server");
      expect(feedback!.githubRepo).toBe("owner/repo");
      expect(feedback!.status).toBe("open");
      expect(feedback!.votes).toBe(1);
      expect(feedback!.estimatedTokensSaved).toBe(500);
      expect(feedback!.estimatedTimeSavedMinutes).toBe(10);
      expect(feedback!.sessionId).toBe("test-session");
      expect(feedback!.gitSha).toBeTypeOf("string"); // auto-detected from git repo
      await store.close();
    });

    test("stores explicit git_sha when provided", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const result = await store.submitFeedback({
        ...SAMPLE_INPUT,
        gitSha: "abc123def456",
      });

      const feedback = await store.getFeedbackById(result.feedbackId);
      expect(feedback!.gitSha).toBe("abc123def456");
      await store.close();
    });

    test("auto-detects git SHA when not provided", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const result = await store.submitFeedback(SAMPLE_INPUT);

      const feedback = await store.getFeedbackById(result.feedbackId);
      // We're running inside a git repo, so SHA should be a 40-char hex string
      expect(feedback!.gitSha).toMatch(/^[0-9a-f]{40}$/);
      await store.close();
    });

    test("captures metadata with suggestion-box version", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const result = await store.submitFeedback(SAMPLE_INPUT);

      const feedback = await store.getFeedbackById(result.feedbackId);
      expect(feedback!.metadata).not.toBeNull();
      expect(feedback!.metadata!.suggestionBoxVersion).toBeTruthy();
      await store.close();
    });

    test("captures tool version when provided", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const result = await store.submitFeedback({
        ...SAMPLE_INPUT,
        toolVersion: "2.5.0",
      });

      const feedback = await store.getFeedbackById(result.feedbackId);
      expect(feedback!.metadata).not.toBeNull();
      expect(feedback!.metadata!.toolVersion).toBe("2.5.0");
      expect(feedback!.metadata!.suggestionBoxVersion).toBeTruthy();
      await store.close();
    });

    test("metadata omits toolVersion when not provided", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const result = await store.submitFeedback(SAMPLE_INPUT);

      const feedback = await store.getFeedbackById(result.feedbackId);
      expect(feedback!.metadata).not.toBeNull();
      expect(feedback!.metadata!.toolVersion).toBeUndefined();
      await store.close();
    });
  });

  describe("trigram dedup", () => {
    test("detects duplicate by trigram similarity", async () => {
      const store = new FeedbackStore(createConfig(dbPath));

      const first = await store.submitFeedback(SAMPLE_INPUT);
      expect(first.isDuplicate).toBe(false);

      // Submit nearly identical content
      const second = await store.submitFeedback({
        ...SAMPLE_INPUT,
        content: "The search feature is very slow when there are many results to show",
      });

      expect(second.isDuplicate).toBe(true);
      expect(second.feedbackId).toBe(first.feedbackId);
      expect(second.votes).toBe(2);
      await store.close();
    });

    test("does not dedup across different target_type/target_name", async () => {
      const store = new FeedbackStore(createConfig(dbPath));

      const first = await store.submitFeedback(SAMPLE_INPUT);

      const second = await store.submitFeedback({
        ...SAMPLE_INPUT,
        targetName: "other-server",
      });

      expect(second.isDuplicate).toBe(false);
      expect(second.feedbackId).not.toBe(first.feedbackId);
      await store.close();
    });

    test("does not dedup very different content", async () => {
      const store = new FeedbackStore(createConfig(dbPath));

      await store.submitFeedback(SAMPLE_INPUT);

      const different = await store.submitFeedback({
        ...SAMPLE_INPUT,
        content: "The database connection pool exhausts all available handles under high load",
      });

      expect(different.isDuplicate).toBe(false);
      await store.close();
    });
  });

  describe("upvote", () => {
    test("increments vote count", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const { feedbackId } = await store.submitFeedback(SAMPLE_INPUT);

      const result = await store.upvote({ feedbackId });
      expect(result.votes).toBe(2);
      await store.close();
    });

    test("accumulates impact estimates", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const { feedbackId } = await store.submitFeedback({
        ...SAMPLE_INPUT,
        estimatedTokensSaved: 100,
        estimatedTimeSavedMinutes: 5,
      });

      await store.upvote({
        feedbackId,
        estimatedTokensSaved: 200,
        estimatedTimeSavedMinutes: 10,
      });

      const feedback = await store.getFeedbackById(feedbackId);
      expect(feedback!.estimatedTokensSaved).toBe(300);
      expect(feedback!.estimatedTimeSavedMinutes).toBe(15);
      await store.close();
    });

    test("records evidence in vote log", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const { feedbackId } = await store.submitFeedback(SAMPLE_INPUT);

      await store.upvote({
        feedbackId,
        evidence: "I also experienced this issue yesterday",
      });

      const log = await store.getVoteLog(feedbackId);
      // Initial submit + upvote = 2 entries
      expect(log.length).toBe(2);
      const upvoteEntry = log.find((e) => e.evidence !== null);
      expect(upvoteEntry?.evidence).toBe("I also experienced this issue yesterday");
      await store.close();
    });
  });

  describe("dismiss", () => {
    test("dismisses open feedback", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const { feedbackId } = await store.submitFeedback(SAMPLE_INPUT);

      const dismissed = await store.dismiss(feedbackId);
      expect(dismissed).toBe(true);

      const feedback = await store.getFeedbackById(feedbackId);
      expect(feedback!.status).toBe("dismissed");
      await store.close();
    });

    test("returns false for non-existent feedback", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      await store.init();
      const dismissed = await store.dismiss("nonexistent-id");
      expect(dismissed).toBe(false);
      await store.close();
    });

    test("returns false for already dismissed feedback", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const { feedbackId } = await store.submitFeedback(SAMPLE_INPUT);

      await store.dismiss(feedbackId);
      const secondDismiss = await store.dismiss(feedbackId);
      expect(secondDismiss).toBe(false);
      await store.close();
    });
  });

  describe("purge", () => {
    test("deletes dismissed feedback", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const { feedbackId } = await store.submitFeedback(SAMPLE_INPUT);
      await store.dismiss(feedbackId);

      const purged = await store.purge();
      expect(purged).toBe(1);

      const feedback = await store.getFeedbackById(feedbackId);
      expect(feedback).toBeNull();
      await store.close();
    });

    test("does not delete open feedback", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const { feedbackId } = await store.submitFeedback(SAMPLE_INPUT);

      const purged = await store.purge();
      expect(purged).toBe(0);

      const feedback = await store.getFeedbackById(feedbackId);
      expect(feedback).not.toBeNull();
      await store.close();
    });

    test("returns 0 when nothing to purge", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      await store.init();
      const purged = await store.purge();
      expect(purged).toBe(0);
      await store.close();
    });
  });

  describe("markPublished", () => {
    test("marks feedback as published with issue URL", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const { feedbackId } = await store.submitFeedback(SAMPLE_INPUT);

      const result = await store.markPublished(feedbackId, "https://github.com/org/repo/issues/1");
      expect(result).toBe(true);

      const feedback = await store.getFeedbackById(feedbackId);
      expect(feedback!.status).toBe("published");
      expect(feedback!.publishedIssueUrl).toBe("https://github.com/org/repo/issues/1");
      await store.close();
    });
  });

  describe("listFeedback", () => {
    test("lists all feedback", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      await store.submitFeedback(SAMPLE_INPUT);
      await store.submitFeedback({
        ...SAMPLE_INPUT,
        category: "feature_request",
        content: "Please add a dark mode theme to the application dashboard",
      });

      const list = await store.listFeedback();
      expect(list.length).toBe(2);
      await store.close();
    });

    test("filters by category", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      await store.submitFeedback(SAMPLE_INPUT);
      await store.submitFeedback({
        ...SAMPLE_INPUT,
        category: "feature_request",
        content: "Please add a dark mode theme to the application dashboard",
      });

      const list = await store.listFeedback({ category: "friction" });
      expect(list.length).toBe(1);
      expect(list[0].category).toBe("friction");
      await store.close();
    });

    test("filters by status", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const { feedbackId } = await store.submitFeedback(SAMPLE_INPUT);
      await store.submitFeedback({
        ...SAMPLE_INPUT,
        content: "Another completely different feedback item for testing purposes",
      });
      await store.dismiss(feedbackId);

      const open = await store.listFeedback({ status: "open" });
      expect(open.length).toBe(1);

      const dismissed = await store.listFeedback({ status: "dismissed" });
      expect(dismissed.length).toBe(1);
      await store.close();
    });

    test("filters by sessionId", async () => {
      const store1 = new FeedbackStore(createConfig(dbPath, { sessionId: "session-a" }));
      await store1.submitFeedback(SAMPLE_INPUT);
      await store1.close();

      const store2 = new FeedbackStore(createConfig(dbPath, { sessionId: "session-b" }));
      await store2.submitFeedback({
        ...SAMPLE_INPUT,
        content: "A completely different piece of feedback from another session",
        targetName: "other-server",
      });
      await store2.close();

      const storeRead = new FeedbackStore(createConfig(dbPath));
      const all = await storeRead.listFeedback();
      expect(all.length).toBe(2);

      const sessionA = await storeRead.listFeedback({ sessionId: "session-a" });
      expect(sessionA.length).toBe(1);
      expect(sessionA[0].sessionId).toBe("session-a");

      const sessionB = await storeRead.listFeedback({ sessionId: "session-b" });
      expect(sessionB.length).toBe(1);
      expect(sessionB[0].sessionId).toBe("session-b");
      await storeRead.close();
    });

    test("respects limit", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      for (let i = 0; i < 5; i++) {
        await store.submitFeedback({
          ...SAMPLE_INPUT,
          content: `Unique feedback number ${i} with enough characters to pass validation`,
          targetName: `server-${i}`, // avoid dedup
        });
      }

      const list = await store.listFeedback({ limit: 3 });
      expect(list.length).toBe(3);
      await store.close();
    });
  });

  describe("getStats", () => {
    test("returns correct statistics", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      await store.submitFeedback({
        ...SAMPLE_INPUT,
        estimatedTokensSaved: 100,
        estimatedTimeSavedMinutes: 5,
      });
      await store.submitFeedback({
        ...SAMPLE_INPUT,
        category: "feature_request",
        content: "Please add a dark mode theme to the application dashboard",
        estimatedTokensSaved: 200,
        estimatedTimeSavedMinutes: 10,
      });

      const stats = await store.getStats();
      expect(stats.total).toBe(2);
      expect(stats.byCategory["friction"]).toBe(1);
      expect(stats.byCategory["feature_request"]).toBe(1);
      expect(stats.byStatus["open"]).toBe(2);
      expect(stats.totalEstimatedTokensSaved).toBe(300);
      expect(stats.totalEstimatedTimeSavedMinutes).toBe(15);
      expect(stats.topVoted.length).toBe(2);
      await store.close();
    });
  });

  describe("persistent mode", () => {
    test("reuses connection in persistent mode", async () => {
      const store = new FeedbackStore(createConfig(dbPath, { persistent: true }));
      const result1 = await store.submitFeedback(SAMPLE_INPUT);
      const result2 = await store.submitFeedback({
        ...SAMPLE_INPUT,
        content: "A completely different piece of feedback for testing persistent mode",
        targetName: "other-server",
      });

      expect(result1.isDuplicate).toBe(false);
      expect(result2.isDuplicate).toBe(false);

      const list = await store.listFeedback();
      expect(list.length).toBe(2);
      await store.close();
    });
  });

  describe("close", () => {
    test("can close and reopen", async () => {
      const config = createConfig(dbPath);
      const store = new FeedbackStore(config);
      await store.submitFeedback(SAMPLE_INPUT);
      await store.close();

      // Create a new store pointing to the same DB
      const store2 = new FeedbackStore(config);
      const list = await store2.listFeedback();
      expect(list.length).toBe(1);
      await store2.close();
    });
  });

  describe("autoTriage", () => {
    test("returns empty result when no items meet threshold", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      await store.submitFeedback(SAMPLE_INPUT); // 1 vote

      const result = await store.autoTriage({ threshold: 3 });
      expect(result.items).toHaveLength(0);
      expect(result.threshold).toBe(3);
      await store.close();
    });

    test("returns items at or above threshold", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const { feedbackId } = await store.submitFeedback(SAMPLE_INPUT); // 1 vote

      // Upvote to reach threshold
      await store.upvote({ feedbackId });
      await store.upvote({ feedbackId });
      // Now at 3 votes

      const result = await store.autoTriage({ threshold: 3 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(feedbackId);
      expect(result.items[0].votes).toBe(3);
      await store.close();
    });

    test("does not include dismissed items", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const { feedbackId } = await store.submitFeedback(SAMPLE_INPUT);
      await store.upvote({ feedbackId });
      await store.upvote({ feedbackId }); // 3 votes

      await store.dismiss(feedbackId);

      const result = await store.autoTriage({ threshold: 3 });
      expect(result.items).toHaveLength(0);
      await store.close();
    });

    test("does not include published items", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const { feedbackId } = await store.submitFeedback(SAMPLE_INPUT);
      await store.upvote({ feedbackId });
      await store.upvote({ feedbackId }); // 3 votes

      await store.markPublished(feedbackId, "https://github.com/org/repo/issues/1");

      const result = await store.autoTriage({ threshold: 3 });
      expect(result.items).toHaveLength(0);
      await store.close();
    });

    test("sorts by votes descending", async () => {
      const store = new FeedbackStore(createConfig(dbPath));

      const { feedbackId: id1 } = await store.submitFeedback(SAMPLE_INPUT);
      await store.upvote({ feedbackId: id1 });
      await store.upvote({ feedbackId: id1 }); // 3 votes

      const { feedbackId: id2 } = await store.submitFeedback({
        ...SAMPLE_INPUT,
        content: "A completely different feedback item about connection pooling under load",
        targetName: "other-server",
      });
      await store.upvote({ feedbackId: id2 });
      await store.upvote({ feedbackId: id2 });
      await store.upvote({ feedbackId: id2 });
      await store.upvote({ feedbackId: id2 }); // 5 votes

      const result = await store.autoTriage({ threshold: 3 });
      expect(result.items).toHaveLength(2);
      expect(result.items[0].votes).toBe(5);
      expect(result.items[1].votes).toBe(3);
      await store.close();
    });

    test("uses default threshold of 3", async () => {
      const store = new FeedbackStore(createConfig(dbPath));
      const { feedbackId } = await store.submitFeedback(SAMPLE_INPUT);
      await store.upvote({ feedbackId });
      await store.upvote({ feedbackId }); // 3 votes — meets default threshold

      const result = await store.autoTriage(); // no threshold provided
      expect(result.threshold).toBe(3);
      expect(result.items).toHaveLength(1);
      await store.close();
    });

    test("respects limit parameter", async () => {
      const store = new FeedbackStore(createConfig(dbPath));

      // Create 3 high-vote items
      for (let i = 0; i < 3; i++) {
        const { feedbackId } = await store.submitFeedback({
          ...SAMPLE_INPUT,
          content: `Unique high-signal feedback item number ${i} with plenty of detail here`,
          targetName: `server-${i}`,
        });
        await store.upvote({ feedbackId });
        await store.upvote({ feedbackId }); // 3 votes each
      }

      const result = await store.autoTriage({ threshold: 3, limit: 2 });
      expect(result.items).toHaveLength(2);
      await store.close();
    });
  });

  describe("concurrent access (WAL mode)", () => {
    test("two stores in the same process can coexist on the same DB", async () => {
      // Basic same-process sanity check. WAL mode should allow concurrent readers.
      const serverStore = new FeedbackStore(createConfig(dbPath, { persistent: true }));
      await serverStore.init();

      // CLI-style: open, read, close
      const cliStore = new FeedbackStore(createConfig(dbPath, { persistent: false }));
      const statsBefore = await cliStore.getStats();
      expect(statsBefore.total).toBe(0);

      // Submit via the persistent store (MCP server side)
      await serverStore.submitFeedback(SAMPLE_INPUT);

      // Read via the short-lived store (CLI side) — must not fail with a lock error
      const statsAfter = await cliStore.getStats();
      expect(statsAfter.total).toBe(1);

      await serverStore.close();
    });

    test("cross-process: CLI can read DB while MCP server holds a persistent connection", async () => {
      // This is the actual regression test for issue #149.
      // The MCP server (process A) keeps a bun:sqlite connection open in WAL mode,
      // and a CLI command (process B) opens a short-lived connection to the same file.
      // With @tursodatabase/database this would fail with:
      //   "Locking error: Failed locking file. File is locked by another process"
      // With bun:sqlite in WAL mode it succeeds.

      // Server script: init DB, write a row, signal readiness, wait for signal, close.
      const serverScript = `
import { FeedbackStore } from ${JSON.stringify(import.meta.dir + "/../src/store.js")};
import { TRIGRAM_MODE } from ${JSON.stringify(import.meta.dir + "/../src/embedder.js")};

const dbPath = process.argv[1];
const embed = Object.assign(async () => new Float32Array(0), { [TRIGRAM_MODE]: true });
const store = new FeedbackStore({ dbPath, sessionId: "server", embed, persistent: true });
await store.init();
await store.submitFeedback({
  category: "friction",
  content: "Cross-process lock test content that is long enough to pass validation",
  targetType: "mcp_server",
  targetName: "test-server",
});
// Signal parent that DB is ready and connection is held open
process.stdout.write("READY\\n");
// Wait for parent to tell us to shut down
await new Promise(resolve => process.stdin.once("data", resolve));
await store.close();
`;

      const serverProc = Bun.spawn(["bun", "--eval", serverScript, dbPath], {
        stdout: "pipe",
        stdin: "pipe",
        stderr: "pipe",
      });

      // Wait until server signals it's ready
      const reader = serverProc.stdout.getReader();
      let readySignal = "";
      while (!readySignal.includes("READY")) {
        const { value } = await reader.read();
        if (!value) break;
        readySignal += new TextDecoder().decode(value);
      }

      // CLI script: open, read, close — must not throw a lock error
      const cliScript = `
import { FeedbackStore } from ${JSON.stringify(import.meta.dir + "/../src/store.js")};
import { TRIGRAM_MODE } from ${JSON.stringify(import.meta.dir + "/../src/embedder.js")};

const dbPath = process.argv[1];
const embed = Object.assign(async () => new Float32Array(0), { [TRIGRAM_MODE]: true });
const store = new FeedbackStore({ dbPath, sessionId: "cli", embed, persistent: false });
const stats = await store.getStats();
process.stdout.write(JSON.stringify(stats) + "\\n");
`;

      const cliProc = Bun.spawn(["bun", "--eval", cliScript, dbPath], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const cliOutput = await new Response(cliProc.stdout).text();
      const cliExit = await cliProc.exited;

      // Tell server to shut down
      serverProc.stdin.write("done\n");
      serverProc.stdin.end();
      await serverProc.exited;

      expect(cliExit, "CLI process should exit cleanly (no lock error)").toBe(0);
      const stats = JSON.parse(cliOutput.trim());
      expect(stats.total).toBe(1);
    }, 15000); // 15s timeout for process spawning
  });
});
