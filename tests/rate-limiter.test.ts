import { describe, test, expect, beforeEach } from "bun:test";
import { RateLimiter, RateLimitError } from "../src/rate-limiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ maxSubmissions: 3, windowMs: 1000 });
  });

  test("allows submissions under the limit", () => {
    expect(() => limiter.check("session-1")).not.toThrow();
    expect(() => limiter.check("session-1")).not.toThrow();
    expect(() => limiter.check("session-1")).not.toThrow();
  });

  test("blocks submissions over the limit", () => {
    limiter.check("session-1");
    limiter.check("session-1");
    limiter.check("session-1");

    expect(() => limiter.check("session-1")).toThrow(RateLimitError);
  });

  test("error message tells the agent to slow down", () => {
    for (let i = 0; i < 3; i++) limiter.check("session-1");

    try {
      limiter.check("session-1");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      const err = e as RateLimitError;
      expect(err.message).toContain("Rate limit exceeded");
      expect(err.message).toContain("Slow down");
      expect(err.retryAfterMs).toBeGreaterThan(0);
    }
  });

  test("tracks sessions independently", () => {
    for (let i = 0; i < 3; i++) limiter.check("session-1");

    // session-2 should still be fine
    expect(() => limiter.check("session-2")).not.toThrow();
  });

  test("allows submissions after window expires", async () => {
    const shortLimiter = new RateLimiter({ maxSubmissions: 2, windowMs: 50 });
    shortLimiter.check("s1");
    shortLimiter.check("s1");

    expect(() => shortLimiter.check("s1")).toThrow(RateLimitError);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 60));

    expect(() => shortLimiter.check("s1")).not.toThrow();
  });

  test("remaining() returns correct count", () => {
    expect(limiter.remaining("session-1")).toBe(3);

    limiter.check("session-1");
    expect(limiter.remaining("session-1")).toBe(2);

    limiter.check("session-1");
    expect(limiter.remaining("session-1")).toBe(1);

    limiter.check("session-1");
    expect(limiter.remaining("session-1")).toBe(0);
  });

  test("remaining() returns full limit for unknown sessions", () => {
    expect(limiter.remaining("unknown")).toBe(3);
  });

  test("reset() clears session state", () => {
    for (let i = 0; i < 3; i++) limiter.check("session-1");
    expect(limiter.remaining("session-1")).toBe(0);

    limiter.reset("session-1");
    expect(limiter.remaining("session-1")).toBe(3);
  });

  test("uses default config when none provided", () => {
    const defaultLimiter = new RateLimiter();
    // Default is 20 per 10 minutes — should allow 20
    for (let i = 0; i < 20; i++) {
      expect(() => defaultLimiter.check("s")).not.toThrow();
    }
    expect(() => defaultLimiter.check("s")).toThrow(RateLimitError);
  });

  test("sliding window evicts old entries", async () => {
    const slidingLimiter = new RateLimiter({ maxSubmissions: 2, windowMs: 80 });

    slidingLimiter.check("s1"); // t=0
    await new Promise((r) => setTimeout(r, 50));
    slidingLimiter.check("s1"); // t=50

    // At t=50, both entries are within the 80ms window → limit reached
    expect(() => slidingLimiter.check("s1")).toThrow(RateLimitError);

    // Wait for the first entry to expire (t=0 + 80ms = 80ms, we're at ~90ms)
    await new Promise((r) => setTimeout(r, 40));

    // Now the first entry should be evicted, freeing a slot
    expect(() => slidingLimiter.check("s1")).not.toThrow();
  });
});
