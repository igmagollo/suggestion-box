import { execFileSync } from "child_process";
import type { Feedback } from "./types.js";

export interface GithubIssueResult {
  url: string;
  deduplicated: boolean;
  existingIssueNumber?: number;
}

export function checkGhAuth(): boolean {
  try {
    execFileSync("gh", ["auth", "status"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function extractKeywords(feedback: Feedback): string {
  const source = feedback.title ?? feedback.content.split(/[.\n]/)[0].trim();
  // Strip markdown-ish noise, keep meaningful words
  return source
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 8)
    .join(" ");
}

interface ExistingIssue {
  number: number;
  title: string;
  url: string;
}

function keywordSimilarity(keywords: string, title: string): number {
  const kwSet = new Set(keywords.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const titleSet = new Set(title.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 2));
  if (kwSet.size === 0 || titleSet.size === 0) return 0;
  let intersection = 0;
  for (const w of kwSet) {
    if (titleSet.has(w)) intersection++;
  }
  const union = new Set([...kwSet, ...titleSet]).size;
  return intersection / union;
}

function searchExistingIssues(repo: string, keywords: string): ExistingIssue | null {
  try {
    const raw = execFileSync(
      "gh",
      ["issue", "list", "--repo", repo, "--search", `${keywords} in:title`, "--state", "open", "--json", "number,title,url", "--limit", "5"],
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    const issues: ExistingIssue[] = JSON.parse(raw.trim() || "[]");
    // Skip issues created by suggestion-box, then pick best match above similarity threshold
    const candidates = issues.filter((i) =>
      !i.title.includes("[Friction Report]") && !i.title.includes("[Feature Request]") && !i.title.includes("[Observation]")
    );
    const SIMILARITY_THRESHOLD = 0.3;
    for (const candidate of candidates) {
      if (keywordSimilarity(keywords, candidate.title) >= SIMILARITY_THRESHOLD) {
        return candidate;
      }
    }
    return null;
  } catch {
    // Search failed — proceed with creation
    return null;
  }
}

function reactAndComment(
  repo: string,
  issueNumber: number,
  feedback: Feedback,
  voteLog: Array<{ evidence: string | null; sessionId: string; createdAt: number }>,
): void {
  // Add 👍 reaction
  try {
    execFileSync(
      "gh",
      ["api", "--method", "POST", `repos/${repo}/issues/${issueNumber}/reactions`, "-f", "content=+1"],
      { stdio: "pipe" },
    );
  } catch {
    console.error("Warning: could not add reaction to issue");
  }

  // Post a comment with vote count and evidence
  const evidenceLines = voteLog
    .filter((v) => v.evidence)
    .map((v) => `> ${v.evidence}`)
    .join("\n\n");

  const commentBody = [
    `**suggestion-box** detected this as related feedback.`,
    "",
    `**Votes:** ${feedback.votes}`,
    ...(evidenceLines ? ["", "### Evidence from agents", "", evidenceLines] : []),
    "",
    "---",
    "*Posted via [suggestion-box](https://github.com/igmagollo/suggestion-box)*",
  ].join("\n");

  try {
    execFileSync(
      "gh",
      ["issue", "comment", String(issueNumber), "--repo", repo, "--body", commentBody],
      { stdio: "pipe" },
    );
  } catch {
    console.error("Warning: could not post comment to issue");
  }
}

export function createGithubIssue(
  repo: string,
  feedback: Feedback,
  voteLog: Array<{ evidence: string | null; sessionId: string; createdAt: number }>,
): GithubIssueResult {
  // Search for existing similar issues before creating a new one
  const keywords = extractKeywords(feedback);
  if (keywords) {
    const existing = searchExistingIssues(repo, keywords);
    if (existing) {
      reactAndComment(repo, existing.number, feedback, voteLog);
      return { url: existing.url, deduplicated: true, existingIssueNumber: existing.number };
    }
  }
  const impactLines: string[] = [];
  if (feedback.estimatedTokensSaved) {
    impactLines.push(`- Estimated tokens saved: **${feedback.estimatedTokensSaved}**`);
  }
  if (feedback.estimatedTimeSavedMinutes) {
    impactLines.push(`- Estimated time saved: **${feedback.estimatedTimeSavedMinutes} minutes**`);
  }

  const evidenceLines = voteLog
    .filter((v) => v.evidence)
    .map((v) => `> ${v.evidence}`)
    .join("\n\n");

  const categoryLabel: Record<string, string> = {
    friction: "Friction Report",
    feature_request: "Feature Request",
    observation: "Observation",
  };

  const categoryTag = feedback.category === "feature_request" ? "enhancement" : feedback.category;

  const body = [
    `## ${categoryLabel[feedback.category] ?? feedback.category}`,
    "",
    feedback.content,
    "",
    `**Target:** ${feedback.targetType} / ${feedback.targetName}`,
    `**Votes:** ${feedback.votes}`,
    ...(impactLines.length > 0 ? ["", "### Impact", ...impactLines] : []),
    ...(evidenceLines ? ["", "### Evidence from agents", "", evidenceLines] : []),
    "",
    "---",
    "*Submitted via [suggestion-box](https://github.com/igmagollo/suggestion-box) — feedback registry for coding agents.*",
  ].join("\n");

  // Title: use explicit title if provided, otherwise first sentence of content
  let summary: string;
  if (feedback.title) {
    summary = feedback.title;
  } else {
    const firstSentence = feedback.content.split(/[.\n]/)[0].trim();
    summary = firstSentence.length > 80 ? firstSentence.slice(0, 77) + "..." : firstSentence;
  }
  const title = `[${categoryLabel[feedback.category] ?? feedback.category}] ${summary}`;

  // Try to create labels (ignore failures — labels may already exist or user may lack permissions)
  const labels = [categoryTag, "suggestion-box"];
  for (const label of labels) {
    try {
      execFileSync("gh", ["label", "create", label, "--repo", repo, "--force"], { stdio: "pipe" });
    } catch {}
  }

  const args = [
    "issue", "create",
    "--repo", repo,
    "--title", title,
    "--body", body,
    ...labels.flatMap(l => ["--label", l]),
  ];

  const result = execFileSync("gh", args, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });

  return { url: result.trim(), deduplicated: false };
}
