/**
 * Quality filter for feedback submissions.
 *
 * Rejects vague, spammy, or low-effort content that would clutter the queue.
 * Runs after basic length validation (min 20, max 5000 chars from zod schema).
 */

export interface QualityIssue {
  code: string;
  message: string;
}

const MIN_WORD_COUNT = 5;
const MAX_CAPS_RATIO = 0.7;
const MIN_UNIQUE_WORDS = 3;

/**
 * Words that are too vague on their own to constitute useful feedback.
 * We check whether the *entire* content (after trimming) is just filler.
 */
const FILLER_PATTERNS: RegExp[] = [
  /^(this is (bad|good|broken|wrong|fine|ok|okay|great|terrible|awful)\.?)$/i,
  /^(it (doesn'?t|does not) work\.?)$/i,
  /^(please fix\.?|fix (this|it)\.?|needs? fix(ing)?\.?)$/i,
  /^(something is (wrong|broken|off)\.?)$/i,
  /^(not working\.?|doesn'?t work\.?|broken\.?)$/i,
  /^(i (don'?t |do not )?(like|want) (this|it)\.?)$/i,
  /^(change (this|it)\.?|update (this|it)\.?)$/i,
  /^(todo:?\.?|fixme:?\.?|hack:?\.?)$/i,
];

/**
 * Validate the quality of feedback content.
 * Returns an empty array if the content passes all checks.
 */
export function validateContentQuality(content: string): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const trimmed = content.trim();

  // --- Word count check ---
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < MIN_WORD_COUNT) {
    issues.push({
      code: "too_few_words",
      message: `Feedback must contain at least ${MIN_WORD_COUNT} words — provide enough detail to be actionable (got ${words.length}).`,
    });
  }

  // --- All-caps spam check ---
  const letters = trimmed.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 0) {
    const upperCount = letters.replace(/[^A-Z]/g, "").length;
    const capsRatio = upperCount / letters.length;
    if (capsRatio > MAX_CAPS_RATIO && letters.length >= 10) {
      issues.push({
        code: "excessive_caps",
        message: `Feedback looks like all-caps spam (${Math.round(capsRatio * 100)}% uppercase). Please write normally.`,
      });
    }
  }

  // --- Unique word diversity check ---
  const normalized = words.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, "")).filter((w) => w.length > 0);
  const unique = new Set(normalized);
  if (normalized.length >= MIN_WORD_COUNT && unique.size < MIN_UNIQUE_WORDS) {
    issues.push({
      code: "low_diversity",
      message: `Feedback is too repetitive — use at least ${MIN_UNIQUE_WORDS} distinct words to describe the issue.`,
    });
  }

  // --- Filler / vague content check ---
  if (FILLER_PATTERNS.some((p) => p.test(trimmed))) {
    issues.push({
      code: "vague_content",
      message: "Feedback is too vague to be actionable. Describe what happened, what you expected, and why it matters.",
    });
  }

  return issues;
}
