import type { ExtensionMessage, ExtensionMessageResponse } from "../core/messages";
import { handleAcceptedSubmission } from "../core/sync-engine";
import { storageService } from "../storage/storage-service";
import { logger, setDebugLogging } from "../content/common/logger";
import { DEFAULT_SETTINGS } from "../core/types";

/**
 * The service worker is a pure message router + coordinator. It never touches
 * the DOM of any page. Content scripts never talk to each other directly —
 * everything passes through here, per the messaging architecture in the spec.
 */

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await storageService.getSettings();
  await storageService.saveSettings(settings); // ensures defaults are persisted on first install
  setDebugLogging(settings.debugLogging);
  logger.info("Installed. Settings initialized:", settings);
  await reinjectStriverContentScript();
});

// Keep the in-memory debug flag in sync if settings change from the popup.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) {
    const next = changes.settings.newValue ?? DEFAULT_SETTINGS;
    setDebugLogging(next.debugLogging);
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((err) => {
      // Fail safe: never let an unexpected error crash the worker or leave
      // the sender hanging. Log it and resolve with nothing.
      logger.error("Unhandled error while processing message", err);
      sendResponse(undefined);
    });
  return true; // keep the message channel open for the async response
});

async function handleMessage(
  message: ExtensionMessage
): Promise<ExtensionMessageResponse | undefined> {
  switch (message.type) {
    case "SUBMISSION_ACCEPTED": {
      await handleAcceptedSubmission({
        platform: message.platform,
        problemSlug: message.problemSlug,
        timestamp: message.timestamp,
      });
      return { type: "ACK" };
    }

    case "GET_COMPLETION_STATE": {
      const state = await storageService.getCompletionState();
      return { type: "COMPLETION_STATE_RESPONSE", state };
    }

    case "GET_SETTINGS": {
      const settings = await storageService.getSettings();
      return { type: "SETTINGS_RESPONSE", settings };
    }

    case "SET_ENABLED": {
      const settings = await storageService.getSettings();
      const next = { ...settings, enabled: message.enabled };
      await storageService.saveSettings(next);
      logger.info(`Extension ${message.enabled ? "enabled" : "disabled"} by user`);
      return { type: "ACK" };
    }

    case "GET_RECENT_ACTIVITY": {
      const items = await storageService.getRecentActivity(message.limit);
      return { type: "RECENT_ACTIVITY_RESPONSE", items };
    }

    default:
      // Messages meant for content scripts (e.g. PROBLEM_MARKED_ON_SHEET) are
      // sent via chrome.tabs.sendMessage directly and won't reach here as the
      // service worker's own onMessage listener from itself; nothing to do.
      return undefined;
  }
}

async function reinjectStriverContentScript(): Promise<void> {
  const tabs = await chrome.tabs.query({
    url: "https://takeuforward.org/*",
  });

  for (const tab of tabs) {
    if (tab.id === undefined) continue;

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content-striver.js"],
      });

      logger.info(`Re-injected Striver content script into tab ${tab.id}`);
    } catch (err) {
      logger.error(
        `Could not re-inject Striver content script into tab ${tab.id}`,
        err
      );
    }
  }
}
