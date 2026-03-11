import { resolve, join } from "path";
import { existsSync, readFileSync } from "fs";

export const DEFAULT_CATEGORIES = ["friction", "feature_request", "observation"] as const;

/**
 * Load configured categories from `.suggestion-box/config.json`.
 * Falls back to DEFAULT_CATEGORIES if the config file doesn't exist or
 * doesn't contain a valid `categories` array.
 */
export function getCategories(): string[] {
  const dataDir = resolve(process.env.SUGGESTION_BOX_DIR ?? ".suggestion-box");
  const configPath = join(dataDir, "config.json");

  if (!existsSync(configPath)) {
    return [...DEFAULT_CATEGORIES];
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    if (
      Array.isArray(raw.categories) &&
      raw.categories.length > 0 &&
      raw.categories.every((c: unknown) => typeof c === "string" && c.length > 0)
    ) {
      return raw.categories;
    }
  } catch {
    // Malformed config — fall back silently
  }

  return [...DEFAULT_CATEGORIES];
}
