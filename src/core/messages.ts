import type {
  AccountBinding,
  CompletionRecord,
  CompletionState,
  ExtensionSettings,
  Platform,
} from "./types";

export type ExtensionMessage =
  | {
      type: "SUBMISSION_ACCEPTED";
      platform: Platform;
      problemSlug: string;
      timestamp: number;
      leetcodeUsername: string;
    }
  | { type: "GET_COMPLETION_STATE" }
  | { type: "GET_SETTINGS" }
  | { type: "SET_ENABLED"; enabled: boolean }
  | { type: "GET_RECENT_ACTIVITY"; limit?: number }
  | { type: "GET_ACCOUNT_BINDING" }
  | {
      type: "SET_ACCOUNT_BINDING";
      binding: AccountBinding | null;
    }
  | {
      type: "PROBLEM_MARKED_ON_SHEET";
      sheetProblemId: string;
    }
  | { type: "GET_CURRENT_LEETCODE_USERNAME" }
  | { type: "GET_CURRENT_STRIVER_USERNAME" };

export type ExtensionMessageResponse =
  | {
      type: "COMPLETION_STATE_RESPONSE";
      state: CompletionState;
    }
  | {
      type: "SETTINGS_RESPONSE";
      settings: ExtensionSettings;
    }
  | {
      type: "RECENT_ACTIVITY_RESPONSE";
      items: CompletionRecord[];
    }
  | {
      type: "ACCOUNT_BINDING_RESPONSE";
      binding: AccountBinding | null;
    }
  | {
      type: "CURRENT_LEETCODE_USERNAME_RESPONSE";
      username: string | null;
    }
  | {
      type: "CURRENT_STRIVER_USERNAME_RESPONSE";
      username: string | null;
    }
  | {
      type: "ERROR";
      message: string;
    }
  | { type: "ACK" };

export async function sendRuntimeMessage<
  T extends ExtensionMessageResponse
>(
  message: ExtensionMessage
): Promise<T | undefined> {
  try {
    const response =
      await chrome.runtime.sendMessage(
        message
      );

    return response as T | undefined;
  } catch {
    return undefined;
  }
}

export async function sendTabMessage(
  tabId: number,
  message: ExtensionMessage
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(
      tabId,
      message
    );
  } catch {
    // Expected when the tab has no content script.
  }
}