import { LeetCodeAdapter } from "./leetcode-adapter";
import { logger } from "../common/logger";

const adapter = new LeetCodeAdapter();

adapter.start((problemSlug, timestamp) => {
  chrome.runtime
    .sendMessage({
      type: "SUBMISSION_ACCEPTED",
      platform: "leetcode",
      problemSlug,
      timestamp,
    })
    .catch((err) => {
      // Service worker may be momentarily asleep on first message of a new
      // browser session; Chrome wakes it to deliver onMessage, so this is
      // rare. Fail safe: log and move on, nothing to mark, no crash.
      logger.error("Failed to notify service worker of accepted submission", err);
    });
});
