import { logger } from "../common/logger";
import { debounce, onUrlChange } from "../common/dom-utils";
import { LEETCODE_ACCEPTED_TEXT, LEETCODE_SELECTORS } from "./selectors";
import type { SubmissionStatus } from "../../core/types";

export type OnAccepted = (problemSlug: string, timestamp: number) => void;

/**
 * PlatformAdapter for LeetCode.
 *   isSupportedPage()       -> is this a /problems/<slug> page?
 *   getCurrentProblemSlug() -> the stable identifier we key everything on
 *   start()                 -> begins watching for an Accepted verdict
 *
 * Detection strategy: a MutationObserver on <body>, checked (debounced) on
 * every subtree mutation, looking for LEETCODE_SELECTORS.submissionResult.
 * This avoids polling the DOM on a timer entirely for the actual verdict —
 * we only react to real changes. The one cheap timer that does exist
 * (checked every 800ms) is solely for detecting SPA URL changes when the
 * user navigates from one problem to another without a full page load; it
 * does a single string comparison, not a DOM query, so it is not the kind of
 * "aggressive polling" the spec warns against.
 *
 * Only ever emits on a verdict whose text is exactly "Accepted". Submit
 * clicks, "Running", compile errors, wrong answers, and partial test-case
 * passes are all deliberately ignored — completion means Accepted, nothing
 * else.
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
    logger.info(`LeetCode problem page detected: ${slug ?? "(unknown slug)"}`);
    this.notifiedForCurrentView = false;
    this.teardownObserver();

    const checkNow = () => this.checkForVerdict();
    checkNow(); // covers a page refresh that lands directly on an already-graded submission

    this.observer = new MutationObserver(debounce(checkNow, 250));
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  private teardownObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private checkForVerdict(): void {
    if (this.notifiedForCurrentView) return; // idempotent per page view

    const resultEl = document.querySelector(LEETCODE_SELECTORS.submissionResult);
    const text = resultEl?.textContent?.trim();
    if (!text) return;

    const status: SubmissionStatus = this.classify(text);
    if (status !== "accepted") return; // rejected/unknown -> never emit, never mark anything

    const slug = this.getCurrentProblemSlug();
    if (!slug) {
      logger.warn("Accepted verdict seen but could not identify problem slug — ignoring");
      return;
    }

    this.notifiedForCurrentView = true;
    this.onAccepted?.(slug, Date.now());
  }

  private classify(verdictText: string): SubmissionStatus {
    if (verdictText === LEETCODE_ACCEPTED_TEXT) return "accepted";
    // Anything else ("Wrong Answer", "Time Limit Exceeded", "Runtime Error",
    // "Compile Error", ...) is intentionally rejected, never treated as
    // completion, matching the spec's explicit exclusion list.
    return "rejected";
  }
}
