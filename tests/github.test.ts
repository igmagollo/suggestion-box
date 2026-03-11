import { describe, test, expect } from "bun:test";
import { extractKeywords, keywordSimilarity } from "../src/github.js";
import type { Feedback } from "../src/types.js";

function makeFeedback(overrides: Partial<Feedback> = {}): Feedback {
  return {
    id: "test-id",
    title: null,
    content: "Default content for testing purposes.",
    category: "friction",
    targetType: "mcp_server",
    targetName: "test-server",
    githubRepo: null,
    status: "open",
    votes: 1,
    estimatedTokensSaved: null,
    estimatedTimeSavedMinutes: null,
    createdAt: 1000,
    updatedAt: 1000,
    publishedIssueUrl: null,
    sessionId: "test-session",
    gitSha: null,
    ...overrides,
  };
}

describe("extractKeywords", () => {
  test("uses title when available", () => {
    const feedback = makeFeedback({ title: "Button is broken on settings" });
    const keywords = extractKeywords(feedback);
    expect(keywords).toContain("Button");
    expect(keywords).toContain("broken");
    expect(keywords).toContain("settings");
  });

  test("falls back to first sentence of content when no title", () => {
    const feedback = makeFeedback({
      title: null,
      content: "The search feature is slow. It takes forever to return results.",
    });
    const keywords = extractKeywords(feedback);
    expect(keywords).toContain("search");
    expect(keywords).toContain("feature");
    expect(keywords).toContain("slow");
    // Should not include words from the second sentence
    expect(keywords).not.toContain("forever");
  });

  test("strips non-word characters", () => {
    const feedback = makeFeedback({ title: "Bug: can't click [save] button!" });
    const keywords = extractKeywords(feedback);
    // Punctuation should be removed
    expect(keywords).not.toContain(":");
    expect(keywords).not.toContain("!");
    expect(keywords).not.toContain("[");
  });

  test("filters out short words (2 chars or fewer)", () => {
    const feedback = makeFeedback({ title: "I am at a loss on how to fix it" });
    const keywords = extractKeywords(feedback);
    expect(keywords).not.toContain("I");
    expect(keywords).not.toContain("am");
    expect(keywords).not.toContain("at");
    expect(keywords).not.toContain("a");
    expect(keywords).not.toContain("on");
    expect(keywords).not.toContain("to");
    expect(keywords).not.toContain("it");
  });

  test("limits to 8 words maximum", () => {
    const feedback = makeFeedback({
      title: "one two three four five six seven eight nine ten eleven twelve",
    });
    const keywords = extractKeywords(feedback);
    const words = keywords.split(" ");
    expect(words.length).toBeLessThanOrEqual(8);
  });
});

describe("keywordSimilarity", () => {
  test("identical keyword sets return 1", () => {
    const sim = keywordSimilarity("button broken settings", "button broken settings");
    expect(sim).toBe(1);
  });

  test("completely different sets return 0", () => {
    const sim = keywordSimilarity("alpha beta gamma", "delta epsilon zeta");
    expect(sim).toBe(0);
  });

  test("partial overlap returns value between 0 and 1", () => {
    const sim = keywordSimilarity("button broken settings", "button works settings page");
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  test("empty keywords return 0", () => {
    expect(keywordSimilarity("", "hello world")).toBe(0);
    expect(keywordSimilarity("hello world", "")).toBe(0);
  });

  test("filters short words from title", () => {
    // "is" and "on" should be filtered out from title, so only "button", "broken", "the", "page" remain
    // But "the" is 3 chars so it stays. "is" (2) and "on" (2) are filtered.
    const sim = keywordSimilarity("button broken", "button is broken on the page");
    expect(sim).toBeGreaterThan(0);
  });

  test("is case insensitive", () => {
    const sim = keywordSimilarity("Button Broken", "button broken settings");
    expect(sim).toBeGreaterThan(0);
  });

  test("strips punctuation from title", () => {
    const sim = keywordSimilarity("button broken", "[Bug] button-broken!");
    expect(sim).toBeGreaterThan(0);
  });
});
