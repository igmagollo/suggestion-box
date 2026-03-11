import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join, resolve } from "path";
import { DEFAULT_CATEGORIES, getCategories, getWebhooks } from "../src/categories.js";

const TEST_DIR = resolve(".test-suggestion-box-categories");

describe("categories", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.env.SUGGESTION_BOX_DIR = TEST_DIR;
  });

  afterEach(() => {
    delete process.env.SUGGESTION_BOX_DIR;
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  test("DEFAULT_CATEGORIES contains the three built-in values", () => {
    expect(DEFAULT_CATEGORIES).toEqual(["friction", "feature_request", "observation"]);
  });

  test("returns defaults when no config.json exists", () => {
    expect(getCategories()).toEqual(["friction", "feature_request", "observation"]);
  });

  test("reads custom categories from config.json", () => {
    writeFileSync(
      join(TEST_DIR, "config.json"),
      JSON.stringify({ categories: ["bug", "praise", "friction"] }),
    );
    expect(getCategories()).toEqual(["bug", "praise", "friction"]);
  });

  test("falls back to defaults when categories array is empty", () => {
    writeFileSync(join(TEST_DIR, "config.json"), JSON.stringify({ categories: [] }));
    expect(getCategories()).toEqual(["friction", "feature_request", "observation"]);
  });

  test("falls back to defaults when categories is not an array", () => {
    writeFileSync(join(TEST_DIR, "config.json"), JSON.stringify({ categories: "friction" }));
    expect(getCategories()).toEqual(["friction", "feature_request", "observation"]);
  });

  test("falls back to defaults when config.json is malformed", () => {
    writeFileSync(join(TEST_DIR, "config.json"), "not json at all");
    expect(getCategories()).toEqual(["friction", "feature_request", "observation"]);
  });

  test("falls back to defaults when categories contains non-strings", () => {
    writeFileSync(join(TEST_DIR, "config.json"), JSON.stringify({ categories: ["bug", 42] }));
    expect(getCategories()).toEqual(["friction", "feature_request", "observation"]);
  });

  test("falls back to defaults when categories contains empty strings", () => {
    writeFileSync(join(TEST_DIR, "config.json"), JSON.stringify({ categories: ["bug", ""] }));
    expect(getCategories()).toEqual(["friction", "feature_request", "observation"]);
  });

  test("ignores unknown keys in config.json", () => {
    writeFileSync(
      join(TEST_DIR, "config.json"),
      JSON.stringify({ categories: ["custom"], other: true }),
    );
    expect(getCategories()).toEqual(["custom"]);
  });
});

describe("getWebhooks", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.env.SUGGESTION_BOX_DIR = TEST_DIR;
  });

  afterEach(() => {
    delete process.env.SUGGESTION_BOX_DIR;
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  test("returns empty array when no config.json exists", () => {
    expect(getWebhooks()).toEqual([]);
  });

  test("returns empty array when config.json has no webhooks key", () => {
    writeFileSync(join(TEST_DIR, "config.json"), JSON.stringify({ categories: ["friction"] }));
    expect(getWebhooks()).toEqual([]);
  });

  test("returns empty array when webhooks is not an array", () => {
    writeFileSync(join(TEST_DIR, "config.json"), JSON.stringify({ webhooks: "https://example.com" }));
    expect(getWebhooks()).toEqual([]);
  });

  test("parses a single webhook with url only", () => {
    writeFileSync(
      join(TEST_DIR, "config.json"),
      JSON.stringify({ webhooks: [{ url: "https://hooks.slack.com/services/abc" }] }),
    );
    const result = getWebhooks();
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://hooks.slack.com/services/abc");
    expect(result[0].voteThreshold).toBeUndefined();
  });

  test("parses a webhook with custom voteThreshold", () => {
    writeFileSync(
      join(TEST_DIR, "config.json"),
      JSON.stringify({ webhooks: [{ url: "https://discord.com/api/webhooks/123", voteThreshold: 5 }] }),
    );
    const result = getWebhooks();
    expect(result).toHaveLength(1);
    expect(result[0].voteThreshold).toBe(5);
  });

  test("parses multiple webhooks", () => {
    writeFileSync(
      join(TEST_DIR, "config.json"),
      JSON.stringify({
        webhooks: [
          { url: "https://webhook-a.example.com", voteThreshold: 3 },
          { url: "https://webhook-b.example.com", voteThreshold: 10 },
        ],
      }),
    );
    const result = getWebhooks();
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe("https://webhook-a.example.com");
    expect(result[1].url).toBe("https://webhook-b.example.com");
  });

  test("skips entries with missing or invalid url", () => {
    writeFileSync(
      join(TEST_DIR, "config.json"),
      JSON.stringify({
        webhooks: [
          { url: "" },
          { voteThreshold: 3 },
          null,
          "not-an-object",
          { url: "https://valid.example.com" },
        ],
      }),
    );
    const result = getWebhooks();
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://valid.example.com");
  });

  test("ignores invalid voteThreshold values", () => {
    writeFileSync(
      join(TEST_DIR, "config.json"),
      JSON.stringify({
        webhooks: [
          { url: "https://example.com", voteThreshold: -1 },
          { url: "https://example.com/2", voteThreshold: "five" },
        ],
      }),
    );
    const result = getWebhooks();
    expect(result).toHaveLength(2);
    expect(result[0].voteThreshold).toBeUndefined();
    expect(result[1].voteThreshold).toBeUndefined();
  });
});
