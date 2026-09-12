import { logger } from "../common/logger";
import { wait } from "../common/dom-utils";
import { STRIVER_SELECTORS } from "./selectors.config";
import type { SheetPageProblem } from "../../core/types";

function extractLeetCodeSlug(href: string): string | null {
  const match = href.match(/leetcode\.com\/problems\/([^/?#]+)/);
  return match ? match[1] : null;
}

/**
 * SheetAdapter for Striver's A2Z sheet.
 *   isSupportedPage()  -> are we on the sheet?
 *   getProblems()      -> every problem row currently rendered, keyed by the
 *                         LeetCode slug it links to (see selectors.config.ts
 *                         for why identity is anchored on the link, not on
 *                         any generated class name)
 *   isCompleted(row)   -> best-effort read of the row's current check state
 *   markCompleted(row) -> click the row's control, then verify it worked
 *
 * This adapter never invents a completion control for a row it can't find
 * one in — it logs a diagnostic and leaves that row alone. False positives
 * (silently "succeeding" without actually marking anything, or marking the
 * wrong row) are worse than a problem staying unmarked, per the spec.
 */
export class StriverAdapter {
  isSupportedPage(): boolean {
    return (
      location.hostname.includes(STRIVER_SELECTORS.supportedHostname) &&
      STRIVER_SELECTORS.supportedPathIncludes.some((p) => location.pathname.includes(p))
    );
  }

  getProblems(): SheetPageProblem[] {
    const anchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(STRIVER_SELECTORS.platformLinkSelector)
    );

    const problems: SheetPageProblem[] = [];
    const seenSlugs = new Set<string>();

    for (const anchor of anchors) {
      const slug = extractLeetCodeSlug(anchor.href);
      if (!slug || seenSlugs.has(slug)) continue;

      const row = this.findRowContainer(anchor);
      if (!row) {
        logger.warn(
          `Sheet UI change suspected: found a link to "${slug}" but no row container with a recognizable completion control nearby. Skipping this problem — see selectors.config.ts to calibrate.`
        );
        continue;
      }

      seenSlugs.add(slug);
      problems.push({
        platformSlug: slug,
        platformUrl: anchor.href,
        titleGuess: (anchor.textContent || row.textContent || slug).trim().slice(0, 120),
        rowElement: row,
      });
    }

    return problems;
  }

  isCompleted(row: Element): boolean {
    const control = this.findCheckboxControl(row);
    if (!control) return false;

    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      return control.checked;
    }

    const ariaChecked = control.getAttribute("aria-checked");
    if (ariaChecked !== null) return ariaChecked === "true";

    // Last-resort heuristic for custom checkbox components with no
    // input/aria state exposed. Intentionally narrow so it doesn't false-
    // positive on unrelated "active"/"selected" styling elsewhere in the row.
    return /\b(is-)?checked\b|\bcompleted\b/i.test(control.className ?? "");
  }

  /** Idempotent: if the row already reads as completed, this is a no-op that
   * still reports success, so callers never click an already-checked box. */
  async markCompleted(row: Element): Promise<boolean> {
    if (this.isCompleted(row)) return true;

    const control = this.findCheckboxControl(row);
    if (!control) {
      logger.error(
        "Cannot mark problem done: no completion control found in this row. Refusing to click anything at random."
      );
      return false;
    }

    (control as HTMLElement).click();
    await wait(200); // let the sheet's own state update (likely an async API call) settle

    const succeeded = this.isCompleted(row);
    if (!succeeded) {
      logger.error(
        "Clicked the completion control but the row still does not read as completed. The sheet's UI may not match selectors.config.ts — see README > DOM Selector Calibration."
      );
    }
    return succeeded;
  }

  private findRowContainer(anchor: Element): Element | null {
    const candidateSelector = STRIVER_SELECTORS.checkboxCandidates.join(", ");
    let el: Element | null = anchor;
    for (let depth = 0; depth < STRIVER_SELECTORS.maxRowAncestorDepth && el; depth++) {
      if (el.querySelector(candidateSelector)) return el;
      el = el.parentElement;
    }
    return null;
  }

  private findCheckboxControl(row: Element): Element | null {
    const candidateSelector = STRIVER_SELECTORS.checkboxCandidates.join(", ");
    return row.querySelector(candidateSelector);
  }
}
