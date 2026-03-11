import { describe, test, expect, mock, beforeEach } from "bun:test";
import { maybeFireWebhooks, fireWebhook } from "../src/webhook.js";
import type { Feedback } from "../src/types.js";

function makeFeedback(votes: number): Feedback {
  return {
    id: "test-id",
    title: null,
    content: "The search feature is very slow when there are many results to display",
    category: "friction",
    targetType: "mcp_server",
    targetName: "test-server",
    githubRepo: null,
    status: "open",
    votes,
    estimatedTokensSaved: null,
    estimatedTimeSavedMinutes: null,
    createdAt: 1000000,
    updatedAt: 1000001,
    publishedIssueUrl: null,
    sessionId: "test-session",
    gitSha: null,
    metadata: null,
  };
}

describe("maybeFireWebhooks", () => {
  test("does nothing when webhooks list is empty", async () => {
    // Should resolve without error
    await maybeFireWebhooks(makeFeedback(5), 4, []);
  });

  test("fires webhook when vote count crosses threshold", async () => {
    const fired: Array<{ url: string; payload: Record<string, unknown> }> = [];

    // Monkey-patch global fetch for this test
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      fired.push({ url: String(url), payload: JSON.parse(init.body) });
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    try {
      await maybeFireWebhooks(makeFeedback(3), 2, [
        { url: "https://hooks.example.com/webhook", voteThreshold: 3 },
      ]);

      expect(fired).toHaveLength(1);
      expect(fired[0].url).toBe("https://hooks.example.com/webhook");
      expect(typeof fired[0].payload.text).toBe("string");
      expect(typeof fired[0].payload.content).toBe("string");
      // Both Slack (text) and Discord (content) keys should be present
      expect(fired[0].payload.text).toBe(fired[0].payload.content);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("does not fire when votes are already above threshold", async () => {
    const fired: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, _init: any) => {
      fired.push(String(url));
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    try {
      // prevVotes=5 is already >= threshold=3, so no crossing
      await maybeFireWebhooks(makeFeedback(6), 5, [
        { url: "https://hooks.example.com/webhook", voteThreshold: 3 },
      ]);
      expect(fired).toHaveLength(0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("does not fire when votes stay below threshold", async () => {
    const fired: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, _init: any) => {
      fired.push(String(url));
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    try {
      // prevVotes=1, newVotes=2, threshold=5 — not crossed
      await maybeFireWebhooks(makeFeedback(2), 1, [
        { url: "https://hooks.example.com/webhook", voteThreshold: 5 },
      ]);
      expect(fired).toHaveLength(0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("uses default threshold of 3 when not specified", async () => {
    const fired: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, _init: any) => {
      fired.push(String(url));
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    try {
      // No voteThreshold specified — should default to 3
      await maybeFireWebhooks(makeFeedback(3), 2, [
        { url: "https://hooks.example.com/webhook" },
      ]);
      expect(fired).toHaveLength(1);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("fires multiple webhooks with different thresholds independently", async () => {
    const fired: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, _init: any) => {
      fired.push(String(url));
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    try {
      // newVotes=3 crosses threshold=3 but not threshold=5
      await maybeFireWebhooks(makeFeedback(3), 2, [
        { url: "https://webhook-a.example.com", voteThreshold: 3 },
        { url: "https://webhook-b.example.com", voteThreshold: 5 },
      ]);
      expect(fired).toHaveLength(1);
      expect(fired[0]).toBe("https://webhook-a.example.com");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("fires all webhooks when multiple thresholds are crossed simultaneously", async () => {
    const fired: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, _init: any) => {
      fired.push(String(url));
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    try {
      // newVotes=10 crosses both threshold=3 and threshold=5
      await maybeFireWebhooks(makeFeedback(10), 2, [
        { url: "https://webhook-a.example.com", voteThreshold: 3 },
        { url: "https://webhook-b.example.com", voteThreshold: 5 },
      ]);
      expect(fired).toHaveLength(2);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("payload includes feedback id, votes, category, and content preview", async () => {
    let capturedPayload: Record<string, unknown> | null = null;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: any, init: any) => {
      capturedPayload = JSON.parse(init.body);
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    try {
      const feedback = makeFeedback(3);
      await maybeFireWebhooks(feedback, 2, [
        { url: "https://hooks.example.com/webhook", voteThreshold: 3 },
      ]);

      expect(capturedPayload).not.toBeNull();
      const text = capturedPayload!.text as string;
      expect(text).toContain("test-id");
      expect(text).toContain("3"); // votes
      expect(text).toContain("friction");
      expect(text).toContain("test-server");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe("fireWebhook", () => {
  test("does not throw on HTTP error responses", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("error", { status: 500 })) as unknown as typeof fetch;

    try {
      // Should resolve without throwing
      await fireWebhook("https://hooks.example.com/webhook", { text: "test" });
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("does not throw on network errors", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;

    try {
      // Should resolve without throwing
      await fireWebhook("https://hooks.example.com/webhook", { text: "test" });
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
