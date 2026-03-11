/**
 * Interactive TUI for triaging feedback entries.
 *
 * Keyboard shortcuts:
 *   p — publish (requires gh auth + github_repo on feedback)
 *   e — edit title inline
 *   d — dismiss
 *   s — skip (move to next)
 *   q — quit
 */

import { createInterface } from "readline";
import type { Feedback } from "./types.js";

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const MAGENTA = "\x1b[35m";
const BLUE = "\x1b[34m";

function clearScreen(): void {
  process.stdout.write("\x1b[2J\x1b[H");
}

function hideCursor(): void {
  process.stdout.write("\x1b[?25l");
}

function showCursor(): void {
  process.stdout.write("\x1b[?25h");
}

function termSize(): { cols: number; rows: number } {
  return {
    cols: process.stdout.columns ?? 80,
    rows: process.stdout.rows ?? 24,
  };
}

function hrule(cols: number, char = "─"): string {
  return char.repeat(Math.max(0, cols));
}

function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    let remaining = paragraph;
    while (remaining.length > width) {
      // Break at last space within width
      let breakAt = remaining.lastIndexOf(" ", width);
      if (breakAt <= 0) breakAt = width;
      lines.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt + 1);
    }
    if (remaining.length > 0) lines.push(remaining);
  }
  return lines;
}

function timeAgo(epochSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - epochSec;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function categoryColor(cat: string): string {
  switch (cat) {
    case "friction": return RED;
    case "feature_request": return BLUE;
    case "observation": return YELLOW;
    default: return MAGENTA;
  }
}

// ---------------------------------------------------------------------------
// Card renderer
// ---------------------------------------------------------------------------

function renderCard(
  feedback: Feedback,
  index: number,
  total: number,
  statusLine: string,
): void {
  const { cols, rows } = termSize();
  clearScreen();

  const catCol = categoryColor(feedback.category);
  const catLabel = feedback.category.replace(/_/g, " ").toUpperCase();

  // Header bar
  const headerLeft = `${BOLD}${CYAN}suggestion-box review${RESET}`;
  const headerRight = `${DIM}${index + 1} / ${total}${RESET}`;
  process.stdout.write(`${headerLeft}  ${headerRight}\n`);
  process.stdout.write(hrule(cols) + "\n");

  // Category + votes
  process.stdout.write(`${catCol}${BOLD}[${catLabel}]${RESET}  ${YELLOW}${feedback.votes} vote${feedback.votes !== 1 ? "s" : ""}${RESET}  ${DIM}${timeAgo(feedback.createdAt)}${RESET}\n`);

  // Target + repo
  const repoSuffix = feedback.githubRepo ? `  ${DIM}(${feedback.githubRepo})${RESET}` : "";
  process.stdout.write(`Target: ${CYAN}${feedback.targetType}/${feedback.targetName}${RESET}${repoSuffix}\n`);

  // Title (if set)
  if (feedback.title) {
    process.stdout.write(`Title:  ${BOLD}${feedback.title}${RESET}\n`);
  }

  process.stdout.write(hrule(cols, "─") + "\n");

  // Content — wrapped to terminal width, capped to available rows
  const contentWidth = Math.max(20, cols - 2);
  const contentLines = wrapText(feedback.content, contentWidth);
  const headerLines = 7; // rough count of lines above
  const footerLines = 4; // controls + status
  const maxContent = Math.max(3, rows - headerLines - footerLines);

  for (let i = 0; i < Math.min(contentLines.length, maxContent); i++) {
    process.stdout.write(`  ${contentLines[i]}\n`);
  }
  if (contentLines.length > maxContent) {
    process.stdout.write(`  ${DIM}… (${contentLines.length - maxContent} more lines)${RESET}\n`);
  }

  // Status / result line
  process.stdout.write("\n");
  process.stdout.write(hrule(cols, "─") + "\n");
  if (statusLine) {
    process.stdout.write(`${statusLine}\n`);
  }

  // Controls
  const controls = [
    `${BOLD}${GREEN}p${RESET}ublish`,
    `${BOLD}${YELLOW}e${RESET}dit title`,
    `${BOLD}${RED}d${RESET}ismiss`,
    `${BOLD}${CYAN}s${RESET}kip`,
    `${BOLD}q${RESET}uit`,
  ];
  process.stdout.write(`${DIM}${controls.join("  ")}${RESET}\n`);
}

// ---------------------------------------------------------------------------
// Inline title editor (uses readline for comfortable editing)
// ---------------------------------------------------------------------------

async function promptTitle(current: string | null): Promise<string | null> {
  return new Promise((resolve) => {
    showCursor();
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(
      `\nNew title (empty to clear, Ctrl-C to cancel): [${current ?? ""}] `,
      (answer) => {
        rl.close();
        hideCursor();
        // On Ctrl-C, readline calls the question callback with an empty string.
        // Treat empty string as null (cancel / clear) — callers distinguish
        // "cancelled" from "set to empty" by receiving null either way.
        resolve(answer || null);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Main review loop
// ---------------------------------------------------------------------------

export interface ReviewDeps {
  /** Fetch all open feedback sorted by votes desc */
  listOpen: () => Promise<Feedback[]>;
  /** Dismiss a feedback entry */
  dismiss: (id: string) => Promise<boolean>;
  /** Publish a feedback entry to GitHub. Returns the issue URL. */
  publish: (feedback: Feedback) => Promise<string>;
  /** Update title on a feedback entry */
  updateTitle: (id: string, title: string | null) => Promise<void>;
  /** Check if gh is authenticated */
  checkAuth: () => boolean;
}

export async function runReview(deps: ReviewDeps): Promise<void> {
  const items = await deps.listOpen();

  if (items.length === 0) {
    console.log("No open feedback to review.");
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("Error: review command requires an interactive terminal.");
    process.exit(1);
  }

  hideCursor();
  let index = 0;
  let statusLine = "";
  // Mutable working copy so edits are visible without re-fetching
  const feedbacks = [...items];

  const cleanup = () => {
    showCursor();
    clearScreen();
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });

  const renderCurrent = () => {
    renderCard(feedbacks[index], index, feedbacks.length, statusLine);
    statusLine = ""; // reset after render
  };

  renderCurrent();

  // Put stdin in raw mode to capture individual keypresses
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  await new Promise<void>((resolve) => {
    const onKey = async (key: string) => {
      // Ctrl-C
      if (key === "\x03") {
        cleanup();
        process.exit(0);
      }

      const current = feedbacks[index];

      if (key === "q" || key === "Q") {
        cleanup();
        resolve();
        return;
      }

      if (key === "s" || key === "S" || key === "\x1b[C") {
        // Skip — advance to next
        if (index < feedbacks.length - 1) {
          index++;
          renderCurrent();
        } else {
          statusLine = `${DIM}Already at last item. Press q to quit.${RESET}`;
          renderCurrent();
        }
        return;
      }

      if (key === "d" || key === "D") {
        try {
          await deps.dismiss(current.id);
          feedbacks.splice(index, 1);
          statusLine = `${GREEN}Dismissed.${RESET}`;
          if (feedbacks.length === 0) {
            cleanup();
            console.log("All feedback reviewed.");
            resolve();
            return;
          }
          if (index >= feedbacks.length) index = feedbacks.length - 1;
          renderCurrent();
        } catch (e: any) {
          statusLine = `${RED}Error: ${e.message}${RESET}`;
          renderCurrent();
        }
        return;
      }

      if (key === "p" || key === "P") {
        if (!deps.checkAuth()) {
          statusLine = `${RED}gh CLI not authenticated. Run 'gh auth login' first.${RESET}`;
          renderCurrent();
          return;
        }
        if (!current.githubRepo) {
          statusLine = `${YELLOW}No github_repo on this feedback. Cannot publish automatically. Set --repo when submitting.${RESET}`;
          renderCurrent();
          return;
        }
        statusLine = `${DIM}Publishing to ${current.githubRepo}…${RESET}`;
        renderCurrent();
        try {
          const url = await deps.publish(current);
          feedbacks.splice(index, 1);
          statusLine = `${GREEN}Published: ${url}${RESET}`;
          if (feedbacks.length === 0) {
            cleanup();
            console.log(`Published: ${url}`);
            console.log("All feedback reviewed.");
            resolve();
            return;
          }
          if (index >= feedbacks.length) index = feedbacks.length - 1;
          renderCurrent();
        } catch (e: any) {
          statusLine = `${RED}Publish error: ${e.message}${RESET}`;
          renderCurrent();
        }
        return;
      }

      if (key === "e" || key === "E") {
        // Pause raw mode for readline
        process.stdin.setRawMode(false);
        process.stdin.pause();

        process.stdout.write("\n");
        process.stdout.write(`Current title: ${current.title ?? "(none)"}\n`);

        const rawAnswer = await promptTitle(current.title);
        const newTitle = rawAnswer === null ? null : (rawAnswer.trim() === "" ? null : rawAnswer.trim());

        // Restore raw mode
        process.stdin.setRawMode(true);
        process.stdin.resume();
        hideCursor();

        if (newTitle !== null || current.title !== null) {
          try {
            await deps.updateTitle(current.id, newTitle);
            feedbacks[index] = { ...current, title: newTitle };
            statusLine = `${GREEN}Title updated.${RESET}`;
          } catch (e: any) {
            statusLine = `${RED}Update error: ${e.message}${RESET}`;
          }
        }
        renderCurrent();
        return;
      }

      // Left arrow — go back
      if (key === "\x1b[D") {
        if (index > 0) {
          index--;
          renderCurrent();
        } else {
          statusLine = `${DIM}Already at first item.${RESET}`;
          renderCurrent();
        }
        return;
      }
    };

    process.stdin.on("data", onKey);
  });

  process.stdin.setRawMode(false);
  process.stdin.pause();
}
