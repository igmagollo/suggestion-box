import { createFeedbackStore } from "../src/sdk.js";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";

const testDir = join(import.meta.dirname, ".test-data");
if (existsSync(testDir)) rmSync(testDir, { recursive: true });
mkdirSync(testDir, { recursive: true });

const dbPath = join(testDir, "test.db");

// Simple mock embedder: hash string to a fixed-size vector
function mockEmbed(text: string): Promise<Float32Array> {
  const vec = new Float32Array(384);
  for (let i = 0; i < text.length && i < 384; i++) {
    vec[i] = text.charCodeAt(i) / 255;
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < 384; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < 384; i++) vec[i] /= norm;
  return Promise.resolve(vec);
}

const store = createFeedbackStore({
  dbPath,
  sessionId: "test-session-1",
  embed: mockEmbed,
});

await store.init();

// Test 1: Submit feedback
console.log("Test 1: Submit feedback");
const result1 = await store.submitFeedback({
  category: "feature_request",
  content: "context7 MCP should support searching by version number",
  targetType: "mcp_server",
  targetName: "context7",
  githubRepo: "upstash/context7",
  estimatedTokensSaved: 500,
});
console.assert(!result1.isDuplicate, "Should not be duplicate");
console.assert(result1.votes === 1, "Should have 1 vote");
console.log(`  Created: ${result1.feedbackId}`);

// Test 2: Submit similar feedback (should dedup)
console.log("Test 2: Submit similar feedback (dedup)");
const result2 = await store.submitFeedback({
  category: "feature_request",
  content: "context7 MCP should support searching by version number please",
  targetType: "mcp_server",
  targetName: "context7",
  estimatedTokensSaved: 300,
});
console.assert(result2.isDuplicate, "Should be duplicate");
console.assert(result2.votes === 2, "Should have 2 votes");
console.assert(result2.feedbackId === result1.feedbackId, "Should be same ID");
console.log(`  Voted on: ${result2.feedbackId}, votes: ${result2.votes}`);

// Test 3: Submit different feedback
console.log("Test 3: Submit different feedback");
const result3 = await store.submitFeedback({
  category: "friction",
  content: "gh CLI does not support bulk issue creation",
  targetType: "tool",
  targetName: "gh CLI",
  estimatedTimeSavedMinutes: 10,
});
console.assert(!result3.isDuplicate, "Should not be duplicate");
console.log(`  Created: ${result3.feedbackId}`);

// Test 4: Upvote
console.log("Test 4: Upvote");
const upResult = await store.upvote({
  feedbackId: result1.feedbackId,
  evidence: "I also needed version-specific docs for React 19",
  estimatedTokensSaved: 200,
});
console.assert(upResult.votes === 3, "Should have 3 votes");
console.log(`  Votes: ${upResult.votes}`);

// Test 5: List
console.log("Test 5: List feedback");
const list = await store.listFeedback({ sortBy: "votes" });
console.assert(list.length === 2, "Should have 2 entries");
console.assert(list[0].votes === 3, "Top should have 3 votes");
console.log(`  Found ${list.length} entries, top has ${list[0].votes} votes`);

// Test 6: Stats
console.log("Test 6: Stats");
const stats = await store.getStats();
console.assert(stats.total === 2, "Should have 2 total");
console.assert(stats.totalEstimatedTokensSaved === 1000, "Should have 1000 tokens");
console.log(`  Total: ${stats.total}, tokens: ${stats.totalEstimatedTokensSaved}, minutes: ${stats.totalEstimatedTimeSavedMinutes}`);

// Test 7: Dismiss
console.log("Test 7: Dismiss");
const dismissed = await store.dismiss(result3.feedbackId);
console.assert(dismissed, "Should dismiss");
const afterDismiss = await store.listFeedback({ status: "open" });
console.assert(afterDismiss.length === 1, "Should have 1 open entry");
console.log(`  Dismissed, open count: ${afterDismiss.length}`);

// Test 8: Vote log
console.log("Test 8: Vote log");
const voteLog = await store.getVoteLog(result1.feedbackId);
console.assert(voteLog.length === 3, "Should have 3 vote log entries");
console.assert(voteLog[0].evidence === "I also needed version-specific docs for React 19", "Should have evidence");
console.log(`  ${voteLog.length} votes logged`);

// Test 9: Purge
console.log("Test 9: Purge");
const purged = await store.purge();
console.assert(purged === 1, "Should purge 1 dismissed entry");
const afterPurge = await store.listFeedback({});
console.assert(afterPurge.length === 1, "Should have 1 entry left");
console.log(`  Purged ${purged}, remaining: ${afterPurge.length}`);

// Cleanup
await store.close();
rmSync(testDir, { recursive: true });

console.log("\nAll tests passed!");
