import { logger } from "../common/logger";
import { debounce, onUrlChange } from "../common/dom-utils";
import { LEETCODE_ACCEPTED_TEXT, LEETCODE_SELECTORS } from "./selectors";
import type { SubmissionStatus } from "../../core/types";

export type OnAccepted = (problemSlug: string, timestamp: number) => void;

/**
 * PlatformAdapter for LeetCode.
 *
 * Watches the LeetCode submission-result area for an "Accepted" verdict.
 *
 * Detection strategy:
 *  1. Try LeetCode's data-e2e-locator selector.
 *  2. Fall back to the current LeetCode DOM by looking for an element whose
 *     direct text content is exactly "Accepted".
 *
 * A MutationObserver is used instead of polling the DOM for submission
 * results. SPA URL changes are handled separately by onUrlChange().
 *
 * Only an exact "Accepted" verdict is considered successful.
 * Wrong Answer, TLE, Runtime Error, Compile Error, etc. are ignored.
 */
export class LeetCodeAdapter {
  private observer: MutationObserver | null = null;
  private notifiedForCurrentView = false;
  private onAccepted: OnAccepted | null = null;

  isSupportedPage(): boolean {
    return (
      location.hostname === "leetcode.com" &&
      /^\/problems\/[^/]+/.test(location.pathname)
    );
  }

  getCurrentProblemSlug(): string | null {
    const match = location.pathname.match(/^\/problems\/([^/]+)/);
    return match ? match[1] : null;
  }

  start(onAccepted: OnAccepted): void {
    this.onAccepted = onAccepted;

    if (!this.isSupportedPage()) {
      logger.info("Not a supported LeetCode problem page — adapter idle");
      return;
    }

    this.armForCurrentProblem();
    onUrlChange(() => this.armForCurrentProblem());
  }

  private armForCurrentProblem(): void {
    if (!this.isSupportedPage()) {
      this.teardownObserver();
      return;
    }

    const slug = this.getCurrentProblemSlug();

    logger.info(
      `LeetCode problem page detected: ${slug ?? "(unknown slug)"}`
    );

    this.notifiedForCurrentView = false;
    this.teardownObserver();

    const checkNow = () => this.checkForVerdict();

    // Covers a refresh that lands directly on a page where the verdict
    // is already present.
    checkNow();

    this.observer = new MutationObserver(debounce(checkNow, 250));

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private teardownObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private checkForVerdict(): void {
    if (this.notifiedForCurrentView) return;

    const resultEl = this.findSubmissionResult();

    if (!resultEl) return;

    const text = resultEl.textContent?.trim();

    if (!text) return;

    logger.info(`Submission status detected: ${text}`);

    const status: SubmissionStatus = this.classify(text);

    if (status !== "accepted") {
      return;
    }

    const slug = this.getCurrentProblemSlug();

    if (!slug) {
      logger.warn(
        "Accepted verdict seen but could not identify problem slug — ignoring"
      );
      return;
    }

    this.notifiedForCurrentView = true;

    logger.info(`Accepted submission detected for: ${slug}`);

    this.onAccepted?.(slug, Date.now());
  }

  /**
   * Finds the current submission verdict.
   *
   * First use LeetCode's known data-e2e locator.
   * If that is unavailable in the current UI, fall back to the current
   * DOM structure by searching for an element whose DIRECT text is exactly
   * "Accepted".
   *
   * We intentionally do not use a styling class such as:
   *   .text-sm.text-muted-foreground
   *
   * because generated Tailwind/class names are brittle.
   */
  private findSubmissionResult(): Element | null {
    // Strategy 1: existing stable selector.
    const resultEl = document.querySelector(
      LEETCODE_SELECTORS.submissionResult
    );

    if (resultEl) {
      return resultEl;
    }

    // Strategy 2: current LeetCode DOM fallback.
    //
    // Search elements with small/simple text nodes rather than blindly
    // querying every div and accepting anything containing "Accepted".
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT
    );

    let current = walker.nextNode();

    while (current) {
      const element = current as Element;

      // We only care about elements whose complete visible text is exactly
      // "Accepted". This prevents matching strings such as:
      // "Accepted Solutions"
      // "Accepted 4,926,441"
      const text = element.textContent?.trim();

      if (text === LEETCODE_ACCEPTED_TEXT) {
        return element;
      }

      current = walker.nextNode();
    }

    return null;
  }

  private classify(verdictText: string): SubmissionStatus {
    if (verdictText === LEETCODE_ACCEPTED_TEXT) {
      return "accepted";
    }

    // Everything else is rejected.
    return "rejected";
  }
}