import { execSync } from "child_process";
import type { Feedback } from "./types.js";

export function checkGhAuth(): boolean {
  try {
    execSync("gh auth status", { stdio: "pipe" });
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

  const title = `[${categoryLabel[feedback.category] ?? feedback.category}] ${feedback.content.slice(0, 80)}${feedback.content.length > 80 ? "..." : ""}`;

  // Try to create labels (ignore failures — labels may already exist or user may lack permissions)
  const labels = [categoryTag, "suggestion-box"];
  for (const label of labels) {
    try {
      execSync(`gh label create ${JSON.stringify(label)} --repo ${JSON.stringify(repo)} --force`, { stdio: "pipe" });
    } catch {}
  }

  const labelArgs = labels.map(l => `--label ${JSON.stringify(l)}`).join(" ");

  const result = execSync(
    `gh issue create --repo ${JSON.stringify(repo)} --title ${JSON.stringify(title)} --body ${JSON.stringify(body)} ${labelArgs}`,
    { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
  );

  return result.trim();
}
