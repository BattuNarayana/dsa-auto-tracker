import type { CompletionRecord } from "./types";
import { problemMapper } from "./problem-mapper";
import { storageService } from "../storage/storage-service";
import { logger } from "../content/common/logger";
import { sendTabMessage } from "./messages";

/**
 * Implements the flow from the spec:
 *
 *   AcceptedSubmission -> look up mapping -> find sheet problem ->
 *   already completed? -> (yes: ignore) / (no: mark done + persist + notify)
 *
 * This is the ONLY place that decides whether a completion "counts". Content
 * scripts never write to storage directly and never decide idempotency
 * themselves — that logic lives here, once.
 */
export async function handleAcceptedSubmission(input: {
  platform: "leetcode";
  problemSlug: string;
  timestamp: number;
}): Promise<void> {
  const settings = await storageService.getSettings();

  if (!settings.enabled) {
    logger.info("Extension is disabled — ignoring accepted submission");
    return;
  }

  logger.info(`LeetCode problem detected: ${input.problemSlug}`);
  logger.info("Submission status: Accepted");

  const mapping = problemMapper.findBySlug(
    settings.activeSheet,
    input.platform,
    input.problemSlug
  );

  if (!mapping) {
    // Fail safe: the user solved something outside the configured sheet, or a
    // problem that isn't in our mapping dataset yet. Do nothing. Never guess.
    logger.info(
      `No ${settings.activeSheet} mapping found for "${input.problemSlug}" — ignoring (not tracked by this sheet)`
    );
    return;
  }

  logger.info(`Mapping found: ${mapping.sheetProblemId}`);

  const record: CompletionRecord = {
    sheetProblemId: mapping.sheetProblemId,
    title: mapping.title,
    platform: input.platform,
    problemSlug: input.problemSlug,
    completedAt: input.timestamp,
  };

  const { added } = await storageService.addCompletion(record);

  if (!added) {
    logger.info(
      `"${mapping.sheetProblemId}" was already marked complete — ignoring duplicate (idempotent)`
    );
    return;
  }

  logger.info(`Marking problem as completed: ${mapping.sheetProblemId}`);
  await notifyOpenStriverTabs(mapping.sheetProblemId);
  logger.info(`Successfully recorded completion for ${mapping.sheetProblemId}`);
}

/**
 * Best-effort live push to any Striver tab that happens to be open right now,
 * so the checkbox ticks immediately without a refresh. This is purely an
 * optimization: every Striver content script also reconciles its own DOM
 * against storage on load and on every DOM mutation, so a missed message here
 * (tab not open, content script not yet injected) is recovered from
 * automatically the next time that tab is viewed.
 */
async function notifyOpenStriverTabs(sheetProblemId: string): Promise<void> {
  const tabs = await chrome.tabs.query({ url: "https://takeuforward.org/*" });
  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => tab.id !== undefined)
      .map((tab) =>
        sendTabMessage(tab.id, {
          type: "PROBLEM_MARKED_ON_SHEET",
          sheetProblemId,
        })
      )
  );
}
