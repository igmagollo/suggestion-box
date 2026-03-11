/**
 * Simple in-memory sliding-window rate limiter.
 * Tracks timestamps of actions per session ID and rejects
 * when the count exceeds the limit within the window.
 */

export interface RateLimiterConfig {
  /** Maximum number of submissions allowed within the window (default: 20) */
  maxSubmissions: number;
  /** Time window in milliseconds (default: 600_000 = 10 minutes) */
  windowMs: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxSubmissions: 20,
  windowMs: 10 * 60 * 1000, // 10 minutes
};

export class RateLimitError extends Error {
  public readonly retryAfterMs: number;

  constructor(retryAfterMs: number, limit: number, windowMs: number) {
    const windowMinutes = Math.round(windowMs / 60_000);
    const retrySeconds = Math.ceil(retryAfterMs / 1000);
    super(
      `Rate limit exceeded: ${limit} submissions per ${windowMinutes} minutes. ` +
      `Slow down and try again in ${retrySeconds}s.`
    );
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class RateLimiter {
  private readonly config: RateLimiterConfig;
  /** Map of session ID → sorted array of timestamps (ms) */
  private readonly windows: Map<string, number[]> = new Map();

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check whether a session is allowed to perform an action.
   * If allowed, records the action. If not, throws RateLimitError.
   */
  check(sessionId: string): void {
    const now = Date.now();
    const cutoff = now - this.config.windowMs;

    let timestamps = this.windows.get(sessionId);
    if (!timestamps) {
      timestamps = [];
      this.windows.set(sessionId, timestamps);
    }

    // Prune expired entries
    const firstValid = timestamps.findIndex((t) => t > cutoff);
    if (firstValid > 0) {
      timestamps.splice(0, firstValid);
    } else if (firstValid === -1) {
      timestamps.length = 0;
    }

    if (timestamps.length >= this.config.maxSubmissions) {
      // The oldest entry in the window determines when a slot opens up
      const oldestInWindow = timestamps[0];
      const retryAfterMs = oldestInWindow + this.config.windowMs - now;
      throw new RateLimitError(retryAfterMs, this.config.maxSubmissions, this.config.windowMs);
    }

    timestamps.push(now);
  }

  /**
   * Get the number of submissions remaining for a session in the current window.
   */
  remaining(sessionId: string): number {
    const now = Date.now();
    const cutoff = now - this.config.windowMs;
    const timestamps = this.windows.get(sessionId);
    if (!timestamps) return this.config.maxSubmissions;

    const active = timestamps.filter((t) => t > cutoff).length;
    return Math.max(0, this.config.maxSubmissions - active);
  }

  /**
   * Reset rate limit state for a session (useful for testing).
   */
  reset(sessionId: string): void {
    this.windows.delete(sessionId);
  }
}
