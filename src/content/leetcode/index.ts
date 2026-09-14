import { LeetCodeAdapter } from "./leetcode-adapter";
import { logger } from "../common/logger";
import type { ExtensionMessage } from "../../core/messages";

const adapter = new LeetCodeAdapter();

/**
 * Extract a username from a LeetCode profile URL.
 *
 * Expected format:
 *   /u/Battu_Narayana/
 */
function extractUsernameFromProfileLink(
  link: HTMLAnchorElement
): string | null {
  const href = link.getAttribute("href");
  if (!href) return null;

  const match = href.match(
    /^\/u\/([^/?#]+)\/?$/
  );

  if (!match) return null;

  const username = decodeURIComponent(
    match[1]
  ).trim();

  return username || null;
}

/**
 * Detect the currently logged-in LeetCode username.
 *
 * Strategy:
 *
 * 1. Prefer LeetCode's account dropdown when it exists.
 * 2. If the dropdown is not rendered/open, fall back to
 *    all /u/<username>/ links currently present on the page.
 *
 * Multiple duplicate links to the same username are fine.
 * Multiple DIFFERENT usernames are ambiguous, so we fail closed.
 */
function getCurrentLeetCodeUsername(): string | null {
  /*
   * ---------------------------------------------------------
   * Strategy 1: Account dropdown
   * ---------------------------------------------------------
   */
  const accountMenu = document.querySelector(
    "#web-user-dropdown-content"
  );

  if (accountMenu) {
    const candidates = new Set<string>();

    const links =
      accountMenu.querySelectorAll<HTMLAnchorElement>(
        'a[href^="/u/"]'
      );

    for (const link of links) {
      const username =
        extractUsernameFromProfileLink(link);

      if (!username) continue;

      const text =
        link.textContent?.trim() ?? "";

      /*
       * If visible text exists, require it to match the
       * username. This prevents unrelated profile links
       * from being accepted.
       */
      if (
        text &&
        text.toLowerCase() !==
          username.toLowerCase()
      ) {
        continue;
      }

      candidates.add(username);
    }

    if (candidates.size === 1) {
      const username = [...candidates][0];

      logger.info(
        `Detected current LeetCode account from account menu: ${username}`
      );

      return username;
    }
  }

  /*
   * ---------------------------------------------------------
   * Strategy 2: Page-wide profile links
   * ---------------------------------------------------------
   *
   * The account dropdown may not exist on pages such as
   * /problemset/. In that case LeetCode still exposes the
   * logged-in user's profile through /u/<username>/ links.
   */
  const candidates = new Set<string>();

  const profileLinks =
    document.querySelectorAll<HTMLAnchorElement>(
      'a[href^="/u/"]'
    );

  for (const link of profileLinks) {
    const username =
      extractUsernameFromProfileLink(link);

    if (!username) continue;

    const text =
      link.textContent?.trim() ?? "";

    /*
     * Accept:
     *
     *   <a href="/u/Battu_Narayana/">Battu_Narayana</a>
     *
     * Also accept an empty-text profile link because LeetCode
     * sometimes renders the username through nested elements.
     *
     * Reject links whose visible text explicitly identifies
     * a different username.
     */
    if (
      text &&
      text.toLowerCase() !==
        username.toLowerCase()
    ) {
      continue;
    }

    candidates.add(username);
  }

  /*
   * Multiple identical links are normal.
   *
   * Example:
   *   /u/Battu_Narayana/
   *   /u/Battu_Narayana/
   *   /u/Battu_Narayana/
   *
   * Set<> reduces those to one identity.
   */
  if (candidates.size === 1) {
    const username = [...candidates][0];

    logger.info(
      `Detected current LeetCode account from page profile links: ${username}`
    );

    return username;
  }

  if (candidates.size === 0) {
    logger.error(
      "Could not find any LeetCode profile link for the current account. " +
        "Accepted submission will NOT be synced."
    );
  } else {
    logger.error(
      `Could not confidently determine current LeetCode account. ` +
        `Found multiple usernames: ${[
          ...candidates,
        ].join(", ")}. ` +
        "Accepted submission will NOT be synced."
    );
  }

  return null;
}

/**
 * Allow the service worker to verify the currently logged-in
 * LeetCode account during account binding.
 */
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender,
    sendResponse
  ) => {
    if (
      message.type !==
      "GET_CURRENT_LEETCODE_USERNAME"
    ) {
      return;
    }

    sendResponse({
      type:
        "CURRENT_LEETCODE_USERNAME_RESPONSE",
      username:
        getCurrentLeetCodeUsername(),
    });
  }
);

/**
 * Normal Accepted-submission flow.
 */
adapter.start(
  (problemSlug, timestamp) => {
    const leetcodeUsername =
      getCurrentLeetCodeUsername();

    if (!leetcodeUsername) {
      logger.error(
        "Accepted submission detected, but current " +
          "LeetCode account could not be determined. " +
          "Submission will NOT be synced."
      );

      return;
    }

    chrome.runtime
      .sendMessage({
        type: "SUBMISSION_ACCEPTED",
        platform: "leetcode",
        problemSlug,
        timestamp,
        leetcodeUsername,
      })
      .catch((err) => {
        logger.error(
          "Failed to notify service worker of accepted submission",
          err
        );
      });
  }
);