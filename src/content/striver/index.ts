import { StriverAdapter } from "./striver-adapter";
import { logger } from "../common/logger";
import { debounce } from "../common/dom-utils";
import striverDataset from "../../../data/striver.json";
import type { SheetDataset } from "../../core/types";

const dataset = striverDataset as SheetDataset;

const slugToSheetProblemId = new Map(
  dataset.problems
    .filter((p) => p.platform === "leetcode")
    .map((p) => [p.platformSlug, p.sheetProblemId])
);

const adapter = new StriverAdapter();

async function getCompletionState(): Promise<Record<string, unknown>> {
  try {
    const result = await chrome.storage.local.get("completionState");
    return result.completionState ?? {};
  } catch (err) {
    logger.error("Could not read completion state", err);
    return {};
  }
}

async function isExtensionEnabled(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get("settings");

    return result.settings?.enabled ?? true;
  } catch (err) {
    logger.error("Could not read extension settings", err);

    // Fail closed:
    // if we cannot determine the setting, do not modify the sheet.
    return false;
  }
}

async function reconcile(): Promise<void> {
  if (!adapter.isSupportedPage()) return;

  // Do nothing when the extension is disabled.
  const enabled = await isExtensionEnabled();

  if (!enabled) {
    logger.info("Extension is disabled — skipping Striver reconciliation");
    return;
  }

  const [problems, completionState] = await Promise.all([
    Promise.resolve(adapter.getProblems()),
    getCompletionState(),
  ]);

  for (const problem of problems) {
    const sheetProblemId = slugToSheetProblemId.get(problem.platformSlug);

    if (!sheetProblemId) continue;

    const isRecordedComplete = Boolean(completionState[sheetProblemId]);

    if (!isRecordedComplete) continue;

    if (adapter.isCompleted(problem.rowElement)) continue;

    const succeeded = await adapter.markCompleted(problem.rowElement);

    logger.info(
      succeeded
        ? `Successfully marked completed: ${sheetProblemId} (${problem.titleGuess})`
        : `Failed to mark completed: ${sheetProblemId} (${problem.titleGuess})`
    );
  }
}

function main(): void {
  if (!adapter.isSupportedPage()) return;

  logger.info("Striver sheet detected");

  void reconcile();

  const debouncedReconcile = debounce(() => void reconcile(), 500);

  const observer = new MutationObserver(debouncedReconcile);

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // React to relevant storage changes directly.
  //
  // completionState changes:
  //   A new LeetCode Accepted problem was recorded.
  //
  // settings changes:
  //   Extension was enabled/disabled.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    if (changes.completionState || changes.settings) {
      logger.info("Relevant storage changed — reconciling Striver sheet");
      void reconcile();
    }
  });
}

main();