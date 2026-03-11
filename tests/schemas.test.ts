import { describe, test, expect } from "bun:test";
import {
  submitFeedbackSchema,
  upvoteFeedbackSchema,
  listFeedbackSchema,
  dismissFeedbackSchema,
  publishToGithubSchema,
} from "../src/schemas.js";

describe("submitFeedbackSchema", () => {
  const validInput = {
    category: "friction",
    content: "This is a detailed feedback message that is long enough to pass validation.",
    target_type: "mcp_server",
    target_name: "suggestion-box",
  };

  test("accepts valid input", () => {
    const result = submitFeedbackSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  test("accepts valid input with optional title", () => {
    const result = submitFeedbackSchema.safeParse({
      ...validInput,
      title: "Short summary",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Short summary");
    }
  });

  test("title is optional", () => {
    const result = submitFeedbackSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBeUndefined();
    }
  });

  test("rejects title longer than 100 characters", () => {
    const result = submitFeedbackSchema.safeParse({
      ...validInput,
      title: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  describe("content length validation", () => {
    test("rejects content shorter than 20 characters", () => {
      const result = submitFeedbackSchema.safeParse({
        ...validInput,
        content: "too short",
      });
      expect(result.success).toBe(false);
    });

    test("accepts content near minimum length with enough quality", () => {
      const result = submitFeedbackSchema.safeParse({
        ...validInput,
        content: "The search tool breaks on special chars",
      });
      expect(result.success).toBe(true);
    });

    test("rejects content longer than 5000 characters", () => {
      const result = submitFeedbackSchema.safeParse({
        ...validInput,
        content: "a".repeat(5001),
      });
      expect(result.success).toBe(false);
    });

    test("accepts content near max length with enough quality", () => {
      // Build a long but realistic content string
      const sentence = "The search tool returns incorrect results for queries with special characters. ";
      const content = sentence.repeat(Math.floor(4999 / sentence.length));
      const result = submitFeedbackSchema.safeParse({
        ...validInput,
        content,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("category validation", () => {
    test("accepts friction", () => {
      const result = submitFeedbackSchema.safeParse({ ...validInput, category: "friction" });
      expect(result.success).toBe(true);
    });

    test("accepts feature_request", () => {
      const result = submitFeedbackSchema.safeParse({ ...validInput, category: "feature_request" });
      expect(result.success).toBe(true);
    });

    test("accepts observation", () => {
      const result = submitFeedbackSchema.safeParse({ ...validInput, category: "observation" });
      expect(result.success).toBe(true);
    });

    test("rejects invalid category", () => {
      const result = submitFeedbackSchema.safeParse({ ...validInput, category: "bug" });
      expect(result.success).toBe(false);
    });
  });

  describe("target_type validation", () => {
    for (const tt of ["mcp_server", "tool", "codebase", "workflow", "general"]) {
      test(`accepts ${tt}`, () => {
        const result = submitFeedbackSchema.safeParse({ ...validInput, target_type: tt });
        expect(result.success).toBe(true);
      });
    }

    test("rejects invalid target_type", () => {
      const result = submitFeedbackSchema.safeParse({ ...validInput, target_type: "plugin" });
      expect(result.success).toBe(false);
    });
  });

  describe("optional fields", () => {
    test("accepts github_repo", () => {
      const result = submitFeedbackSchema.safeParse({
        ...validInput,
        github_repo: "owner/repo",
      });
      expect(result.success).toBe(true);
    });

    test("coerces estimated_tokens_saved from string", () => {
      const result = submitFeedbackSchema.safeParse({
        ...validInput,
        estimated_tokens_saved: "100",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.estimated_tokens_saved).toBe(100);
      }
    });

    test("coerces estimated_time_saved_minutes from string", () => {
      const result = submitFeedbackSchema.safeParse({
        ...validInput,
        estimated_time_saved_minutes: "5",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.estimated_time_saved_minutes).toBe(5);
      }
    });

    test("accepts optional git_sha", () => {
      const result = submitFeedbackSchema.safeParse({
        ...validInput,
        git_sha: "abc123def456",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.git_sha).toBe("abc123def456");
      }
    });

    test("accepts optional tool_version", () => {
      const result = submitFeedbackSchema.safeParse({
        ...validInput,
        tool_version: "1.2.3",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tool_version).toBe("1.2.3");
      }
    });

    test("tool_version is optional", () => {
      const result = submitFeedbackSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tool_version).toBeUndefined();
      }
    });
  });
});

describe("upvoteFeedbackSchema", () => {
  test("accepts valid input", () => {
    const result = upvoteFeedbackSchema.safeParse({
      feedback_id: "some-uuid",
    });
    expect(result.success).toBe(true);
  });

  test("accepts optional evidence", () => {
    const result = upvoteFeedbackSchema.safeParse({
      feedback_id: "some-uuid",
      evidence: "I also experienced this issue",
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing feedback_id", () => {
    const result = upvoteFeedbackSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("listFeedbackSchema", () => {
  test("accepts empty input (all optional)", () => {
    const result = listFeedbackSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test("accepts all filters", () => {
    const result = listFeedbackSchema.safeParse({
      category: "friction",
      target_type: "mcp_server",
      target_name: "my-server",
      status: "open",
      sort_by: "votes",
      limit: 10,
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid status", () => {
    const result = listFeedbackSchema.safeParse({ status: "closed" });
    expect(result.success).toBe(false);
  });

  test("rejects invalid sort_by", () => {
    const result = listFeedbackSchema.safeParse({ sort_by: "name" });
    expect(result.success).toBe(false);
  });
});

describe("dismissFeedbackSchema", () => {
  test("accepts valid input", () => {
    const result = dismissFeedbackSchema.safeParse({ feedback_id: "some-uuid" });
    expect(result.success).toBe(true);
  });

  test("rejects missing feedback_id", () => {
    const result = dismissFeedbackSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("publishToGithubSchema", () => {
  test("accepts valid input", () => {
    const result = publishToGithubSchema.safeParse({ feedback_id: "some-uuid" });
    expect(result.success).toBe(true);
  });

  test("accepts optional github_repo", () => {
    const result = publishToGithubSchema.safeParse({
      feedback_id: "some-uuid",
      github_repo: "owner/repo",
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing feedback_id", () => {
    const result = publishToGithubSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
