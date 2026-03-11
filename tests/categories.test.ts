import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join, resolve } from "path";
import { DEFAULT_CATEGORIES, getCategories } from "../src/categories.js";

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
