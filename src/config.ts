import { resolve, dirname } from "path";
import { existsSync, mkdirSync, accessSync, constants, statSync } from "fs";

export interface ConfigValidationResult {
  valid: boolean;
  dataDir: string;
  dbPath: string;
  errors: string[];
}

/**
 * Validate the suggestion-box configuration and environment before starting.
 * Returns structured results with actionable error messages.
 */
export function validateConfig(): ConfigValidationResult {
  const errors: string[] = [];

  const rawDir = process.env.SUGGESTION_BOX_DIR ?? ".suggestion-box";
  const dataDir = resolve(rawDir);
  const dbPath = resolve(dataDir, "feedback.db");

  // Check if the data directory exists
  if (existsSync(dataDir)) {
    // Verify it's actually a directory, not a file
    try {
      const stat = statSync(dataDir);
      if (!stat.isDirectory()) {
        errors.push(
          `SUGGESTION_BOX_DIR points to "${dataDir}" which exists but is not a directory. ` +
          `Remove the file or set SUGGESTION_BOX_DIR to a different path.`
        );
      }
    } catch (e: any) {
      errors.push(
        `Cannot stat "${dataDir}": ${e.message}`
      );
    }

    // Verify the directory is writable (needed for DB operations)
    if (errors.length === 0) {
      try {
        accessSync(dataDir, constants.W_OK);
      } catch {
        errors.push(
          `Data directory "${dataDir}" is not writable. ` +
          `Check permissions or set SUGGESTION_BOX_DIR to a writable path.`
        );
      }
    }
  } else {
    // Directory doesn't exist — check if we can create it
    const parent = dirname(dataDir);
    if (!existsSync(parent)) {
      errors.push(
        `Cannot create data directory "${dataDir}": parent directory "${parent}" does not exist. ` +
        `Create it first or set SUGGESTION_BOX_DIR to a valid path. ` +
        `Run 'suggestion-box init' to set up the project.`
      );
    } else {
      try {
        accessSync(parent, constants.W_OK);
      } catch {
        errors.push(
          `Cannot create data directory "${dataDir}": parent "${parent}" is not writable. ` +
          `Check permissions or set SUGGESTION_BOX_DIR to a writable path.`
        );
      }

      // Try to actually create it
      if (errors.length === 0) {
        try {
          mkdirSync(dataDir, { recursive: true });
        } catch (e: any) {
          errors.push(
            `Failed to create data directory "${dataDir}": ${e.message}`
          );
        }
      }
    }
  }

  // If the DB file already exists, check it's writable
  if (errors.length === 0 && existsSync(dbPath)) {
    try {
      accessSync(dbPath, constants.R_OK | constants.W_OK);
    } catch {
      errors.push(
        `Database file "${dbPath}" is not readable/writable. ` +
        `Check file permissions.`
      );
    }

    // Also check for WAL/SHM companion files
    const walPath = dbPath + "-wal";
    const shmPath = dbPath + "-shm";
    for (const companion of [walPath, shmPath]) {
      if (existsSync(companion)) {
        try {
          accessSync(companion, constants.R_OK | constants.W_OK);
        } catch {
          errors.push(
            `Database companion file "${companion}" is not readable/writable. ` +
            `Check file permissions or delete stale WAL/SHM files.`
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    dataDir,
    dbPath,
    errors,
  };
}

/**
 * Validate config and throw with a clear message if anything is wrong.
 * Used by the MCP server on startup.
 */
export function assertValidConfig(): { dataDir: string; dbPath: string } {
  const result = validateConfig();
  if (!result.valid) {
    const msg = [
      "suggestion-box: configuration error",
      "",
      ...result.errors.map((e, i) => `  ${i + 1}. ${e}`),
      "",
      "Tip: Run 'suggestion-box init' to set up the project, or check your SUGGESTION_BOX_DIR environment variable.",
    ].join("\n");
    throw new Error(msg);
  }
  return { dataDir: result.dataDir, dbPath: result.dbPath };
}
