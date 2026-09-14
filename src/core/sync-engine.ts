import type { CompletionRecord } from "./types";

import { problemMapper } from "./problem-mapper";
import { storageService } from "../storage/storage-service";
import { logger } from "../content/common/logger";
import { sendTabMessage } from "./messages";

/**
 * The service worker is the final authorization gate.
 *
 * Accepted submission
 *      ↓
 * Extension enabled?
 *      ↓
 * Account binding exists?
 *      ↓
 * Detected LeetCode account matches binding?
 *      ↓
 * Problem mapped?
 *      ↓
 * Already complete for THIS account?
 *      ↓
 * Persist
 *      ↓
 * Notify Striver
 */
export async function handleAcceptedSubmission(
  input: {
    platform: "leetcode";
    problemSlug: string;
    timestamp: number;
    leetcodeUsername: string;
  }
): Promise<void> {
  const settings =
    await storageService.getSettings();

  if (!settings.enabled) {
    logger.info(
      "Extension is disabled — ignoring accepted submission"
    );
    return;
  }

  const binding =
    await storageService.getAccountBinding();

  if (!binding) {
    logger.info(
      "No account binding configured — ignoring accepted submission"
    );
    return;
  }

  const detectedUsername =
    input.leetcodeUsername
      .trim()
      .toLowerCase();

  const boundUsername =
    binding.leetcodeUsername
      .trim()
      .toLowerCase();

  /**
   * Critical account-isolation check.
   */
  if (
    !detectedUsername ||
    detectedUsername !== boundUsername
  ) {
    logger.warn(
      `LeetCode account mismatch — detected ` +
        `"${input.leetcodeUsername}", bound ` +
        `"${binding.leetcodeUsername}". ` +
        `Ignoring submission.`
    );

    return;
  }

  logger.info(
    `Verified LeetCode account: ` +
      `${binding.leetcodeUsername}`
  );

  logger.info(
    `LeetCode problem detected: ` +
      `${input.problemSlug}`
  );

  logger.info(
    "Submission status: Accepted"
  );

  const mapping =
    problemMapper.findBySlug(
      settings.activeSheet,
      input.platform,
      input.problemSlug
    );

  if (!mapping) {
    logger.info(
      `No ${settings.activeSheet} mapping found ` +
        `for "${input.problemSlug}" — ignoring`
    );

    return;
  }

  logger.info(
    `Mapping found: ${mapping.sheetProblemId}`
  );

  const record: CompletionRecord = {
    sheetProblemId:
      mapping.sheetProblemId,

    title: mapping.title,

    platform: input.platform,

    problemSlug:
      input.problemSlug,

    completedAt:
      input.timestamp,

    leetcodeUsername:
      binding.leetcodeUsername,
  };

  const { added } =
    await storageService.addCompletion(
      record
    );

  if (!added) {
    logger.info(
      `"${mapping.sheetProblemId}" was already ` +
        `marked complete for LeetCode account ` +
        `"${binding.leetcodeUsername}" — ` +
        `ignoring duplicate`
    );

    return;
  }

  logger.info(
    `Marking problem as completed: ` +
      `${mapping.sheetProblemId}`
  );

  await notifyOpenStriverTabs(
    mapping.sheetProblemId
  );

  logger.info(
    `Successfully recorded completion for ` +
      `${mapping.sheetProblemId} under LeetCode ` +
      `account "${binding.leetcodeUsername}"`
  );
}

async function notifyOpenStriverTabs(
  sheetProblemId: string
): Promise<void> {
  const tabs =
    await chrome.tabs.query({
      url: "https://takeuforward.org/*",
    });

  await Promise.all(
    tabs
      .filter(
        (
          tab
        ): tab is chrome.tabs.Tab & {
          id: number;
        } =>
          tab.id !== undefined
      )
      .map((tab) =>
        sendTabMessage(
          tab.id,
          {
            type:
              "PROBLEM_MARKED_ON_SHEET",
            sheetProblemId,
          }
        )
      )
  );
}