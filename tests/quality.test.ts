import { describe, test, expect } from "bun:test";
import { validateContentQuality } from "../src/quality.js";
import { submitFeedbackSchema } from "../src/schemas.js";

describe("validateContentQuality", () => {
  describe("word count", () => {
    test("rejects content with fewer than 5 words", () => {
      const issues = validateContentQuality("needs more detail here");
      expect(issues.some((i) => i.code === "too_few_words")).toBe(true);
    });

    test("accepts content with 5 or more words", () => {
      const issues = validateContentQuality("this has exactly five words here");
      expect(issues.some((i) => i.code === "too_few_words")).toBe(false);
    });

    test("rejects a single long word padded to 20 chars", () => {
      // "aaaaaaaaaaaaaaaaaaaa" is 20 chars but only 1 word
      const issues = validateContentQuality("aaaaaaaaaaaaaaaaaaaa");
      expect(issues.some((i) => i.code === "too_few_words")).toBe(true);
    });
  });

  describe("all-caps detection", () => {
    test("rejects mostly uppercase content", () => {
      const issues = validateContentQuality("THIS TOOL IS COMPLETELY BROKEN AND NEEDS FIXING NOW");
      expect(issues.some((i) => i.code === "excessive_caps")).toBe(true);
    });

    test("accepts normal mixed-case content", () => {
      const issues = validateContentQuality("The search tool returns stale results when querying recent files");
      expect(issues.some((i) => i.code === "excessive_caps")).toBe(false);
    });

    test("allows short uppercase abbreviations in otherwise normal text", () => {
      const issues = validateContentQuality("The MCP server's API endpoint returns HTTP 500 errors intermittently");
      expect(issues.some((i) => i.code === "excessive_caps")).toBe(false);
    });

    test("ignores caps ratio for very short letter content", () => {
      // Under 10 letters, we don't flag caps
      const issues = validateContentQuality("OK IT 12345 67890 extra");
      expect(issues.some((i) => i.code === "excessive_caps")).toBe(false);
    });
  });

  describe("word diversity", () => {
    test("rejects highly repetitive content", () => {
      const issues = validateContentQuality("bad bad bad bad bad bad bad");
      expect(issues.some((i) => i.code === "low_diversity")).toBe(true);
    });

    test("accepts content with diverse vocabulary", () => {
      const issues = validateContentQuality("the search tool returns incorrect results for recent queries");
      expect(issues.some((i) => i.code === "low_diversity")).toBe(false);
    });
  });

  describe("filler / vague content", () => {
    test.each([
      "it doesn't work",
      "It doesn't work.",
      "it does not work",
      "please fix",
      "Please fix.",
      "fix this",
      "not working",
      "broken",
      "this is broken",
      "something is wrong",
      "needs fixing",
    ])("rejects vague content: %s", (content) => {
      const issues = validateContentQuality(content);
      expect(issues.some((i) => i.code === "vague_content")).toBe(true);
    });

    test("accepts detailed content that happens to contain filler phrases", () => {
      const issues = validateContentQuality(
        "The search results endpoint doesn't work when the query contains special characters like parentheses"
      );
      expect(issues.some((i) => i.code === "vague_content")).toBe(false);
    });
  });

  describe("good feedback passes all checks", () => {
    test.each([
      "The context7 MCP server times out after 30 seconds when querying large repositories with more than 1000 files",
      "Feature request: add a --json flag to the list command so output can be piped to jq for filtering",
      "The embedder falls back to trigram mode silently — it would help to log a warning when HuggingFace is unavailable",
      "When running suggestion-box init in a monorepo, the relative path in mcp.json points to the wrong directory",
    ])("accepts: %s", (content) => {
      const issues = validateContentQuality(content);
      expect(issues).toHaveLength(0);
    });
  });
});

describe("schema integration", () => {
  const base = {
    category: "friction" as const,
    target_type: "mcp_server" as const,
    target_name: "suggestion-box",
  };

  test("rejects low-quality content through the schema", () => {
    const result = submitFeedbackSchema.safeParse({
      ...base,
      content: "bad bad bad bad bad bad bad",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("repetitive"))).toBe(true);
    }
  });

  test("accepts good quality content through the schema", () => {
    const result = submitFeedbackSchema.safeParse({
      ...base,
      content: "The search tool returns stale cached results when files have been modified within the last 5 seconds",
    });
    expect(result.success).toBe(true);
  });

  test("quality checks run after length checks", () => {
    // Too short should fail on length, not quality
    const result = submitFeedbackSchema.safeParse({
      ...base,
      content: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("at least 20 characters");
    }
  });
});
