import type { Feedback, WebhookConfig } from "./types.js";

export type { WebhookConfig };

/**
 * Build a JSON payload compatible with both Slack and Discord incoming webhooks.
 * Slack expects `{ text }`, Discord expects `{ content }`. Sending both keys
 * works for both platforms; unknown keys are silently ignored.
 */
function buildPayload(feedback: Feedback): Record<string, unknown> {
  const title = feedback.title
    ? `*${feedback.title}*`
    : `*[${feedback.category}]* ${feedback.targetType}/${feedback.targetName}`;

  const preview =
    feedback.content.length > 200
      ? feedback.content.slice(0, 197) + "..."
      : feedback.content;

  const lines: string[] = [
    `:ballot_box_with_ballot: suggestion-box \u2014 high-vote item`,
    title,
    `Votes: ${feedback.votes} | Category: ${feedback.category} | Target: ${feedback.targetType}/${feedback.targetName}`,
    ``,
    preview,
    ``,
    `ID: \`${feedback.id}\``,
  ];

  const text = lines.join("\n");

  // Slack: `text`, Discord: `content`
  return { text, content: text };
}

/**
 * Fire a single webhook. Failures are non-fatal — errors are logged to stderr
 * but never thrown so they don't interrupt the feedback submission flow.
 */
export async function fireWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(
        `[suggestion-box] webhook POST to ${url} failed: HTTP ${response.status}`
      );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[suggestion-box] webhook POST to ${url} error: ${message}`);
  }
}

/**
 * Check whether a vote transition crosses any configured webhook thresholds
 * and fire the matching webhooks.
 *
 * @param feedback  The updated feedback item (with its new vote count).
 * @param prevVotes The vote count *before* this update.
 * @param webhooks  The list of webhook configs to check.
 */
export async function maybeFireWebhooks(
  feedback: Feedback,
  prevVotes: number,
  webhooks: WebhookConfig[]
): Promise<void> {
  if (webhooks.length === 0) return;

  const newVotes = feedback.votes;
  const payload = buildPayload(feedback);

  const promises: Promise<void>[] = [];
  for (const wh of webhooks) {
    const threshold = wh.voteThreshold ?? 3;
    // Fire exactly once when the vote count crosses the threshold from below.
    if (prevVotes < threshold && newVotes >= threshold) {
      promises.push(fireWebhook(wh.url, payload));
    }
  }

  if (promises.length > 0) {
    await Promise.allSettled(promises);
  }
}
