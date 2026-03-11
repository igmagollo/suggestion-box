import { resolve, join } from "path";
import { existsSync, readFileSync } from "fs";
import type { WebhookConfig } from "./types.js";

export const DEFAULT_CATEGORIES = ["friction", "feature_request", "observation"] as const;

/**
 * Parse and return the raw config.json object, or null if absent/unparseable.
 */
function readConfigJson(dataDir?: string): Record<string, unknown> | null {
  const dir = dataDir ?? resolve(process.env.SUGGESTION_BOX_DIR ?? ".suggestion-box");
  const configPath = join(dir, "config.json");
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Load configured categories from `.suggestion-box/config.json`.
 * Falls back to DEFAULT_CATEGORIES if the config file doesn't exist or
 * doesn't contain a valid `categories` array.
 */
export function getCategories(): string[] {
  const raw = readConfigJson();
  if (
    raw &&
    Array.isArray(raw.categories) &&
    raw.categories.length > 0 &&
    raw.categories.every((c: unknown) => typeof c === "string" && c.length > 0)
  ) {
    return raw.categories as string[];
  }
  return [...DEFAULT_CATEGORIES];
}

/**
 * Load webhook configurations from `.suggestion-box/config.json`.
 * Returns an empty array if none are configured or the config is absent.
 *
 * Example config.json entry:
 * ```json
 * {
 *   "webhooks": [
 *     { "url": "https://hooks.slack.com/services/...", "voteThreshold": 3 },
 *     { "url": "https://discord.com/api/webhooks/...", "voteThreshold": 5 }
 *   ]
 * }
 * ```
 */
export function getWebhooks(): WebhookConfig[] {
  const raw = readConfigJson();
  if (!raw || !Array.isArray(raw.webhooks)) return [];

  const result: WebhookConfig[] = [];
  for (const entry of raw.webhooks) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.url !== "string" || !e.url) continue;

    const wh: WebhookConfig = { url: e.url };
    if (typeof e.voteThreshold === "number" && e.voteThreshold > 0) {
      wh.voteThreshold = e.voteThreshold;
    }
    result.push(wh);
  }
  return result;
}
