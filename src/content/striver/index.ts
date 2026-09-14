import { StriverAdapter } from "./striver-adapter";
import { logger } from "../common/logger";
import { debounce } from "../common/dom-utils";
import striverDataset from "../../../data/striver.json";
import type {
  AccountBinding,
  AccountCompletionState,
  SheetDataset,
} from "../../core/types";
import type {
  ExtensionMessage,
  ExtensionMessageResponse,
} from "../../core/messages";

const dataset = striverDataset as SheetDataset;

const slugToSheetProblemId = new Map(
  dataset.problems
    .filter((problem) => problem.platform === "leetcode")
    .map((problem) => [
      problem.platformSlug,
      problem.sheetProblemId,
    ])
);

const adapter = new StriverAdapter();

/**
 * Detect the currently logged-in TakeUForward/Striver username.
 *
 * The current TUF page embeds authenticated user information
 * inside a Next.js RSC script payload.
 *
 * The observed structure is:
 *
 *     ["profile","Narayana_1607"]
 *
 * The payload also contains:
 *
 *     logged_in: true
 *
 * We only accept usernames found inside a script containing
 * authenticated-user data.
 *
 * If we cannot determine exactly one username, we fail closed.
 */
function getCurrentStriverUsername(): string | null {
  const candidates = new Set<string>();

  for (const script of Array.from(document.scripts)) {
    const text = script.textContent ?? "";

    if (!text.includes("logged_in")) {
      continue;
    }

    const matches = text.matchAll(
      /\\"username\\"\s*:\s*\\"([^"\\]+)\\"/g
    );

    for (const match of matches) {
      const username = match[1]?.trim();

      if (username) {
        candidates.add(username);
      }
    }
  }

  if (candidates.size !== 1) {
    return null;
  }

  return [...candidates][0];
}

async function getAccountBinding(): Promise<AccountBinding | null> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "GET_ACCOUNT_BINDING",
    } satisfies ExtensionMessage)) as
      | ExtensionMessageResponse
      | undefined;

    if (response?.type === "ACCOUNT_BINDING_RESPONSE") {
      return response.binding;
    }
  } catch (err) {
    logger.error(
      "Could not read account binding",
      err
    );
  }

  return null;
}

async function getCompletionState() {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "GET_COMPLETION_STATE",
    } satisfies ExtensionMessage)) as
      | ExtensionMessageResponse
      | undefined;

    if (response?.type === "COMPLETION_STATE_RESPONSE") {
      return response.state;
    }
  } catch (err) {
    logger.error(
      "Could not read completion state",
      err
    );
  }

  return {};
}

async function isExtensionEnabled(): Promise<boolean> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "GET_SETTINGS",
    } satisfies ExtensionMessage)) as
      | ExtensionMessageResponse
      | undefined;

    if (response?.type === "SETTINGS_RESPONSE") {
      return response.settings.enabled;
    }
  } catch (err) {
    logger.error(
      "Could not read extension settings",
      err
    );
  }

  return false;
}

function getAccountKey(username: string): string {
  return `leetcode:${username.trim().toLowerCase()}`;
}

async function reconcile(): Promise<void> {
  if (!adapter.isSupportedPage()) {
    return;
  }

  if (!(await isExtensionEnabled())) {
    logger.info(
      "Extension is disabled — skipping Striver reconciliation"
    );
    return;
  }

  const binding = await getAccountBinding();

  if (!binding) {
    logger.info(
      "No account binding configured — skipping Striver reconciliation"
    );
    return;
  }

  /*
   * IMPORTANT:
   *
   * Before touching ANY checkbox, verify that the currently
   * logged-in Striver account matches the bound Striver account.
   */
  const currentStriverUsername =
    getCurrentStriverUsername();

  if (!currentStriverUsername) {
    logger.error(
      "Current Striver account could not be determined — " +
        "refusing to synchronize checkboxes."
    );
    return;
  }

  if (
    currentStriverUsername.trim().toLowerCase() !==
    binding.striverUsername.trim().toLowerCase()
  ) {
    logger.warn(
      `Striver account mismatch — detected "${currentStriverUsername}", ` +
        `bound "${binding.striverUsername}". ` +
        "Refusing to synchronize."
    );

    return;
  }

  logger.info(
    `Verified Striver account: ${currentStriverUsername}`
  );

  const [completionState, problems] =
    await Promise.all([
      getCompletionState(),
      Promise.resolve(adapter.getProblems()),
    ]);

  const accountState: AccountCompletionState =
    completionState[
      getAccountKey(binding.leetcodeUsername)
    ] ?? {};

  for (const problem of problems) {
    const sheetProblemId =
      slugToSheetProblemId.get(
        problem.platformSlug
      );

    if (!sheetProblemId) {
      continue;
    }

    const completion =
      accountState[sheetProblemId];

    if (!completion) {
      continue;
    }

    if (
      adapter.isCompleted(problem.rowElement)
    ) {
      continue;
    }

    logger.info(
      `Stored completion found for ${sheetProblemId} ` +
        `(${binding.leetcodeUsername}) — synchronizing checkbox`
    );

    const succeeded =
      await adapter.markCompleted(
        problem.rowElement
      );

    if (!succeeded) {
      logger.error(
        `Failed to synchronize checkbox for ${sheetProblemId}`
      );
    }
  }
}

function setupMutationObserver(): void {
  const debouncedReconcile =
    debounce(() => void reconcile(), 500);

  const observer = new MutationObserver(
    (mutations) => {
      const hasStructuralChange =
        mutations.some(
          (mutation) =>
            mutation.type === "childList" &&
            (mutation.addedNodes.length > 0 ||
              mutation.removedNodes.length > 0)
        );

      if (!hasStructuralChange) {
        return;
      }

      debouncedReconcile();
    }
  );

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false,
  });
}

function main(): void {
  if (!adapter.isSupportedPage()) {
    return;
  }

  logger.info("Striver sheet detected");

  /*
   * Service worker uses this request during account binding
   * to verify the currently logged-in Striver account.
   */
  chrome.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      _sender,
      sendResponse
    ) => {
      if (
        message.type !==
        "GET_CURRENT_STRIVER_USERNAME"
      ) {
        return;
      }

      sendResponse({
        type:
          "CURRENT_STRIVER_USERNAME_RESPONSE",
        username:
          getCurrentStriverUsername(),
      });
    }
  );

  void reconcile();

  setupMutationObserver();

  chrome.storage.onChanged.addListener(
    (changes, areaName) => {
      if (areaName !== "local") {
        return;
      }

      if (
        changes.completionState ||
        changes.settings ||
        changes.accountBinding
      ) {
        logger.info(
          "Relevant storage changed — reconciling Striver sheet"
        );

        void reconcile();
      }
    }
  );

  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage) => {
      if (
        message.type ===
        "PROBLEM_MARKED_ON_SHEET"
      ) {
        void reconcile();
      }
    }
  );
}

main();