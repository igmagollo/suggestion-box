import { execFileSync } from "child_process";
import type { Feedback } from "./types.js";

export function checkGhAuth(): boolean {
  try {
    execFileSync("gh", ["auth", "status"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function createGithubIssue(
  repo: string,
  feedback: Feedback,
  voteLog: Array<{ evidence: string | null; sessionId: string; createdAt: number }>,
): string {
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

  // Title: first sentence or first 80 chars of content, whichever is shorter
  const firstSentence = feedback.content.split(/[.\n]/)[0].trim();
  const summary = firstSentence.length > 80 ? firstSentence.slice(0, 77) + "..." : firstSentence;
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

  return result.trim();
}
