import type {
  ExtensionMessage,
  ExtensionMessageResponse,
} from "../core/messages";
import {
  handleAcceptedSubmission,
} from "../core/sync-engine";
import {
  storageService,
} from "../storage/storage-service";
import {
  logger,
  setDebugLogging,
} from "../content/common/logger";
import {
  DEFAULT_SETTINGS,
} from "../core/types";

chrome.runtime.onInstalled.addListener(
  async () => {
    const settings =
      await storageService.getSettings();

    await storageService.saveSettings(
      settings
    );

    setDebugLogging(
      settings.debugLogging
    );

    logger.info(
      "Installed. Settings initialized:",
      settings
    );
  }
);

chrome.storage.onChanged.addListener(
  (changes, area) => {
    if (
      area === "local" &&
      changes.settings
    ) {
      const next =
        changes.settings.newValue ??
        DEFAULT_SETTINGS;

      setDebugLogging(
        next.debugLogging
      );
    }
  }
);

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender,
    sendResponse
  ) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((err) => {
        logger.error(
          "Unhandled error while processing message",
          err
        );

        sendResponse({
          type: "ERROR",
          message:
            "Unexpected extension error.",
        });
      });

    return true;
  }
);

async function getUsernameFromOpenTabs(
  urlPattern: string,
  requestType:
    | "GET_CURRENT_LEETCODE_USERNAME"
    | "GET_CURRENT_STRIVER_USERNAME"
): Promise<
  | {
      ok: true;
      username: string;
    }
  | {
      ok: false;
      reason: string;
    }
> {
  const tabs =
    await chrome.tabs.query({
      url: urlPattern,
    });

  const usernames = new Set<string>();

  for (const tab of tabs) {
    if (tab.id === undefined) {
      continue;
    }

    try {
      const response =
        (await chrome.tabs.sendMessage(
          tab.id,
          {
            type: requestType,
          }
        )) as
          | ExtensionMessageResponse
          | undefined;

      if (
        response?.type ===
          "CURRENT_LEETCODE_USERNAME_RESPONSE" ||
        response?.type ===
          "CURRENT_STRIVER_USERNAME_RESPONSE"
      ) {
        const username =
          response.username?.trim();

        if (username) {
          usernames.add(username);
        }
      }
    } catch {
      /*
       * The tab may not have the content script
       * loaded yet. Ignore it.
       */
    }
  }

  if (usernames.size === 0) {
    return {
      ok: false,
      reason:
        "Could not detect the currently logged-in account. " +
        "Open the corresponding site in a tab and try again.",
    };
  }

  if (usernames.size > 1) {
    return {
      ok: false,
      reason:
        "Multiple different accounts are open in your browser. " +
        "Close the extra account tabs and try again.",
    };
  }

  return {
    ok: true,
    username: [...usernames][0],
  };
}

async function validateAccountBinding(
  binding: NonNullable<
    Extract<
      ExtensionMessage,
      {
        type: "SET_ACCOUNT_BINDING";
      }
    >["binding"]
  >
): Promise<
  | { valid: true }
  | {
      valid: false;
      message: string;
    }
> {
  const enteredLeetCode =
    binding.leetcodeUsername.trim();

  const enteredStriver =
    binding.striverUsername.trim();

  /*
   * -------------------------
   * Verify LeetCode
   * -------------------------
   */
  const leetcodeResult =
    await getUsernameFromOpenTabs(
      "https://leetcode.com/*",
      "GET_CURRENT_LEETCODE_USERNAME"
    );

  if (!leetcodeResult.ok) {
    return {
      valid: false,
      message:
        `LeetCode verification failed: ` +
        leetcodeResult.reason,
    };
  }

  if (
    leetcodeResult.username.toLowerCase() !==
    enteredLeetCode.toLowerCase()
  ) {
    return {
      valid: false,
      message:
        `LeetCode account mismatch. ` +
        `You entered "${enteredLeetCode}", ` +
        `but the currently logged-in LeetCode ` +
        `account is "${leetcodeResult.username}".`,
    };
  }

  /*
   * -------------------------
   * Verify Striver
   * -------------------------
   */
  const striverResult =
    await getUsernameFromOpenTabs(
      "https://takeuforward.org/*",
      "GET_CURRENT_STRIVER_USERNAME"
    );

  if (!striverResult.ok) {
    return {
      valid: false,
      message:
        `Striver verification failed: ` +
        striverResult.reason,
    };
  }

  if (
    striverResult.username.toLowerCase() !==
    enteredStriver.toLowerCase()
  ) {
    return {
      valid: false,
      message:
        `Striver account mismatch. ` +
        `You entered "${enteredStriver}", ` +
        `but the currently logged-in Striver ` +
        `account is "${striverResult.username}".`,
    };
  }

  logger.info(
    `Both accounts verified: ` +
      `LeetCode "${leetcodeResult.username}" ↔ ` +
      `Striver "${striverResult.username}"`
  );

  return { valid: true };
}

async function handleMessage(
  message: ExtensionMessage
): Promise<
  ExtensionMessageResponse | undefined
> {
  switch (message.type) {
    case "SUBMISSION_ACCEPTED":
      await handleAcceptedSubmission({
        platform: message.platform,
        problemSlug:
          message.problemSlug,
        timestamp: message.timestamp,
        leetcodeUsername:
          message.leetcodeUsername,
      });

      return { type: "ACK" };

    case "GET_COMPLETION_STATE":
      return {
        type:
          "COMPLETION_STATE_RESPONSE",
        state:
          await storageService.getCompletionState(),
      };

    case "GET_SETTINGS":
      return {
        type: "SETTINGS_RESPONSE",
        settings:
          await storageService.getSettings(),
      };

    case "SET_ENABLED": {
      const settings =
        await storageService.getSettings();

      await storageService.saveSettings({
        ...settings,
        enabled: message.enabled,
      });

      logger.info(
        `Extension ${
          message.enabled
            ? "enabled"
            : "disabled"
        } by user`
      );

      return { type: "ACK" };
    }

    case "GET_RECENT_ACTIVITY":
      return {
        type:
          "RECENT_ACTIVITY_RESPONSE",
        items:
          await storageService.getRecentActivity(
            message.limit
          ),
      };

    case "GET_ACCOUNT_BINDING":
      return {
        type:
          "ACCOUNT_BINDING_RESPONSE",
        binding:
          await storageService.getAccountBinding(),
      };

    case "SET_ACCOUNT_BINDING": {
      /*
       * Unbinding does not require identity verification.
       */
      if (!message.binding) {
        await storageService.saveAccountBinding(
          null
        );

        logger.info(
          "Account binding cleared"
        );

        return { type: "ACK" };
      }

      /*
       * CRITICAL:
       *
       * Validate both currently authenticated
       * accounts BEFORE saving anything.
       */
      const validation =
        await validateAccountBinding(
          message.binding
        );

      if (!validation.valid) {
        logger.warn(
          validation.message
        );

        return {
          type: "ERROR",
          message:
            validation.message,
        };
      }

      /*
       * Only verified bindings reach storage.
       */
      await storageService.saveAccountBinding(
        message.binding
      );

      logger.info(
        `Account binding verified and saved: ` +
          `LeetCode "${message.binding.leetcodeUsername}" ↔ ` +
          `Striver "${message.binding.striverUsername}"`
      );

      return { type: "ACK" };
    }

    case "PROBLEM_MARKED_ON_SHEET":
      return { type: "ACK" };

    /*
     * These are handled by the respective
     * content scripts.
     */
    case "GET_CURRENT_LEETCODE_USERNAME":
    case "GET_CURRENT_STRIVER_USERNAME":
      return undefined;

    default:
      return undefined;
  }
}