/**
 * All LeetCode DOM selectors live here, and nowhere else, so a LeetCode UI
 * change only ever requires editing this one file.
 *
 * Provenance (see README > "DOM Selector Calibration" for the full story):
 * `submissionResult` is `[data-e2e-locator="submission-result"]`. This is
 * LeetCode's own end-to-end-test hook attribute on the verdict banner
 * ("Accepted" / "Wrong Answer" / etc.) that appears after a submission
 * finishes grading. It was confirmed by reading the current, actively
 * maintained content script of an open-source LeetCode submission-sync
 * extension (LeetHub 3.0) rather than guessed — `data-e2e-locator`
 * attributes are deliberately stable identifiers LeetCode ships for
 * automated testing, which makes them far less likely to change on a
 * visual/CSS refresh than a class name would be. That said, LeetCode does
 * change its frontend over time, so if detection stops working, this is the
 * first (and only) place to check with DevTools.
 */
export const LEETCODE_SELECTORS = {
  /** Verdict banner shown after a submission finishes grading. */
  submissionResult: '[data-e2e-locator="submission-result"]',
};

export const LEETCODE_ACCEPTED_TEXT = "Accepted";
