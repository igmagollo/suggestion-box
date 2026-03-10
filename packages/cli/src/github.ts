import { execSync } from "child_process";
import type { Feedback } from "supervisor";

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
    "*Submitted via [supervisor](https://github.com/anthropics/supervisor) — feedback registry for coding agents.*",
  ].join("\n");

  const title = `[${categoryLabel[feedback.category] ?? feedback.category}] ${feedback.content.slice(0, 80)}${feedback.content.length > 80 ? "..." : ""}`;

  const result = execSync(
    `gh issue create --repo ${JSON.stringify(repo)} --title ${JSON.stringify(title)} --body ${JSON.stringify(body)}`,
    { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
  );

  return result.trim();
}
