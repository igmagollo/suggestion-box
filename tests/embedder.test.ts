import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  trigrams,
  trigramSimilarity,
  DEFAULT_TRIGRAM_THRESHOLD,
  isTrigramMode,
  TRIGRAM_MODE,
  createEmbedder,
} from "../src/embedder.js";
import type { EmbedFn } from "../src/types.js";

describe("trigrams", () => {
  test("produces correct character trigrams", () => {
    const result = trigrams("abcde");
    expect(result).toEqual(new Set(["abc", "bcd", "cde"]));
  });

  test("normalizes to lowercase", () => {
    const result = trigrams("ABC");
    expect(result).toEqual(new Set(["abc"]));
  });

  test("collapses whitespace", () => {
    const result = trigrams("a  b  c");
    expect(result).toEqual(new Set(["a b", " b ", "b c"]));
  });

  test("returns empty set for strings shorter than 3 chars", () => {
    expect(trigrams("ab")).toEqual(new Set());
    expect(trigrams("a")).toEqual(new Set());
    expect(trigrams("")).toEqual(new Set());
  });

  test("trims leading/trailing whitespace", () => {
    const result = trigrams("  abc  ");
    expect(result).toEqual(new Set(["abc"]));
  });
});

describe("trigramSimilarity", () => {
  test("identical strings return 1", () => {
    expect(trigramSimilarity("hello world", "hello world")).toBe(1);
  });

  test("completely different strings return low similarity", () => {
    const sim = trigramSimilarity("abcdef", "xyz123");
    expect(sim).toBeLessThan(0.1);
  });

  test("similar strings return high similarity", () => {
    const sim = trigramSimilarity(
      "the button is broken on the settings page",
      "the button is broken on the settings screen",
    );
    expect(sim).toBeGreaterThan(0.5);
  });

  test("both empty strings return 1", () => {
    expect(trigramSimilarity("", "")).toBe(1);
  });

  test("one empty string returns 0", () => {
    expect(trigramSimilarity("hello", "")).toBe(0);
    expect(trigramSimilarity("", "hello")).toBe(0);
  });

  test("case insensitive", () => {
    expect(trigramSimilarity("Hello World", "hello world")).toBe(1);
  });
});

describe("DEFAULT_TRIGRAM_THRESHOLD", () => {
  test("is a reasonable value between 0 and 1", () => {
    expect(DEFAULT_TRIGRAM_THRESHOLD).toBeGreaterThan(0);
    expect(DEFAULT_TRIGRAM_THRESHOLD).toBeLessThan(1);
  });
});

describe("isTrigramMode", () => {
  test("returns true for tagged embed function", () => {
    const fn: any = async () => new Float32Array(0);
    fn[TRIGRAM_MODE] = true;
    expect(isTrigramMode(fn)).toBe(true);
  });

  test("returns false for untagged embed function", () => {
    const fn: EmbedFn = async () => new Float32Array(384);
    expect(isTrigramMode(fn)).toBe(false);
  });
});

describe("createEmbedder with SUGGESTION_BOX_EMBEDDINGS=false", () => {
  const originalEnv = process.env.SUGGESTION_BOX_EMBEDDINGS;

  beforeEach(() => {
    // Clear the cached embedder by reimporting — but since it's module-level
    // we set the env var before calling createEmbedder
    process.env.SUGGESTION_BOX_EMBEDDINGS = "false";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SUGGESTION_BOX_EMBEDDINGS = originalEnv;
    } else {
      delete process.env.SUGGESTION_BOX_EMBEDDINGS;
    }
  });

  test("returns a trigram-mode embedder when embeddings disabled", async () => {
    // We need a fresh module to avoid the cached embedder
    // Use dynamic import with a cache-busting query param
    const mod = await import(`../src/embedder.js?t=${Date.now()}`);
    const embedder = await mod.createEmbedder();
    expect(mod.isTrigramMode(embedder)).toBe(true);

    const result = await embedder("test text");
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(0);
  });
});
