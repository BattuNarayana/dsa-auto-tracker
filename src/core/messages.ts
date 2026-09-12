import type {
  CompletionRecord,
  CompletionState,
  ExtensionSettings,
  Platform,
} from "./types";

/**
 * Every message that flows through chrome.runtime / chrome.tabs messaging is
 * declared here as a discriminated union on `type`. Content scripts never
 * import from each other directly — they only know about this contract and
 * the service worker (core/sync-engine.ts) in between. This keeps the LeetCode
 * adapter and the Striver adapter fully decoupled, per the architecture spec.
 */
export type ExtensionMessage =
  // LeetCode content script -> service worker
  | {
      type: "SUBMISSION_ACCEPTED";
      platform: Platform;
      problemSlug: string;
      timestamp: number;
    }
  // Striver content script -> service worker
  | { type: "GET_COMPLETION_STATE" }
  // Striver content script -> service worker (popup also uses this)
  | { type: "GET_SETTINGS" }
  | { type: "SET_ENABLED"; enabled: boolean }
  | { type: "GET_RECENT_ACTIVITY"; limit?: number }
  // service worker -> Striver content script (fire-and-forget, best effort;
  // the Striver adapter never *trusts* this alone, it always reconciles
  // against GET_COMPLETION_STATE on load/mutation too)
  | { type: "PROBLEM_MARKED_ON_SHEET"; sheetProblemId: string };

export type ExtensionMessageResponse =
  | { type: "COMPLETION_STATE_RESPONSE"; state: CompletionState }
  | { type: "SETTINGS_RESPONSE"; settings: ExtensionSettings }
  | { type: "RECENT_ACTIVITY_RESPONSE"; items: CompletionRecord[] }
  | { type: "ACK" };

/** Thin, typed wrapper around chrome.runtime.sendMessage for callers that
 * expect a response (request/response pattern). Resolves `undefined` instead
 * of throwing when there is no receiver yet (e.g. service worker asleep, or
 * no matching content script on this tab) — callers must treat that as
 * "unknown, do nothing" per the fail-safe requirement. */
export async function sendRuntimeMessage<T extends ExtensionMessageResponse>(
  message: ExtensionMessage
): Promise<T | undefined> {
  try {
    const response = await chrome.runtime.sendMessage(message);
    return response as T | undefined;
  } catch {
    return undefined;
  }
}

/** Fire-and-forget send to a specific tab. Swallows errors (e.g. tab has no
 * content script injected) since a missed live-update is recovered from on
 * that tab's own next reconciliation pass. */
export async function sendTabMessage(
  tabId: number,
  message: ExtensionMessage
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Expected when the tab has no Striver content script (wrong page, or
    // not yet injected). Not an error worth surfacing.
  }
}
