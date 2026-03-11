import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

let cachedVersion: string | undefined;

/**
 * Read the suggestion-box version from our own package.json.
 * Falls back to "unknown" if the file can't be read.
 */
export function getSuggestionBoxVersion(): string {
  if (cachedVersion) return cachedVersion;

  try {
    // Walk up from this file to find package.json
    const thisDir = dirname(fileURLToPath(import.meta.url));
    // In dist/ or src/, package.json is one level up
    const pkgPath = resolve(thisDir, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    cachedVersion = pkg.version ?? "unknown";
  } catch {
    cachedVersion = "unknown";
  }

  return cachedVersion!;
}
