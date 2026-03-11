import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { validateConfig, assertValidConfig } from "../src/config.js";
import { mkdtemp, rm, writeFile, chmod } from "fs/promises";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "sb-config-test-"));
});

afterEach(async () => {
  // Restore env
  delete process.env.SUGGESTION_BOX_DIR;
  await rm(tmpDir, { recursive: true, force: true });
});

describe("validateConfig", () => {
  test("valid when data dir exists and is writable", () => {
    const dataDir = join(tmpDir, ".suggestion-box");
    mkdirSync(dataDir);
    process.env.SUGGESTION_BOX_DIR = dataDir;

    const result = validateConfig();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.dataDir).toBe(dataDir);
    expect(result.dbPath).toBe(join(dataDir, "feedback.db"));
  });

  test("valid when data dir does not exist but parent is writable", () => {
    const dataDir = join(tmpDir, "new-data-dir");
    process.env.SUGGESTION_BOX_DIR = dataDir;

    const result = validateConfig();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("error when data dir path is a file, not a directory", async () => {
    const filePath = join(tmpDir, "not-a-dir");
    await writeFile(filePath, "oops");
    process.env.SUGGESTION_BOX_DIR = filePath;

    const result = validateConfig();
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0]).toContain("not a directory");
  });

  test("error when parent directory does not exist", () => {
    process.env.SUGGESTION_BOX_DIR = "/tmp/nonexistent-parent-abc123/data";

    const result = validateConfig();
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("parent directory");
    expect(result.errors[0]).toContain("does not exist");
  });

  test("checks DB file permissions when DB exists", async () => {
    const dataDir = join(tmpDir, ".suggestion-box");
    mkdirSync(dataDir);
    const dbPath = join(dataDir, "feedback.db");
    writeFileSync(dbPath, "");
    process.env.SUGGESTION_BOX_DIR = dataDir;

    // DB file exists and is readable/writable — should be valid
    const result = validateConfig();
    expect(result.valid).toBe(true);
  });

  test("checks WAL companion file permissions", async () => {
    const dataDir = join(tmpDir, ".suggestion-box");
    mkdirSync(dataDir);
    const dbPath = join(dataDir, "feedback.db");
    writeFileSync(dbPath, "");
    writeFileSync(dbPath + "-wal", "");
    process.env.SUGGESTION_BOX_DIR = dataDir;

    // Both exist and are writable — should be valid
    const result = validateConfig();
    expect(result.valid).toBe(true);
  });
});

describe("assertValidConfig", () => {
  test("returns dataDir and dbPath on valid config", () => {
    const dataDir = join(tmpDir, ".suggestion-box");
    mkdirSync(dataDir);
    process.env.SUGGESTION_BOX_DIR = dataDir;

    const result = assertValidConfig();
    expect(result.dataDir).toBe(dataDir);
    expect(result.dbPath).toBe(join(dataDir, "feedback.db"));
  });

  test("throws with actionable message on invalid config", () => {
    process.env.SUGGESTION_BOX_DIR = "/tmp/nonexistent-parent-abc123/data";

    expect(() => assertValidConfig()).toThrow("configuration error");
  });

  test("error message includes init hint", () => {
    process.env.SUGGESTION_BOX_DIR = "/tmp/nonexistent-parent-abc123/data";

    try {
      assertValidConfig();
      expect(true).toBe(false); // should not reach
    } catch (e: any) {
      expect(e.message).toContain("suggestion-box init");
    }
  });
});
