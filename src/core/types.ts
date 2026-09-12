/**
 * Core domain types. Every other module (background, content scripts, popup,
 * storage) imports from here so the shape of a "problem", "submission" and
 * "settings" is defined in exactly one place.
 */

/** Coding platforms the extension can detect submissions on. MVP: only LeetCode. */
export type Platform = "leetcode";

/** DSA sheets the extension can mark completion on. MVP: only Striver's A2Z sheet. */
export type SheetId = "striver";

/** Result of a LeetCode (or future platform) submission, as detected on-page. */
export type SubmissionStatus = "accepted" | "rejected" | "unknown";

export interface SubmissionResult {
  platform: Platform;
  /** Stable platform identifier for the problem, e.g. LeetCode's URL slug ("two-sum"). */
  problemSlug: string;
  status: SubmissionStatus;
  timestamp: number;
}

/**
 * One entry in a sheet's static mapping dataset (e.g. data/striver.json).
 * This is the single source of truth linking a sheet's problem to a platform's
 * problem. Identity is by platform slug/id, never by title or topic.
 */
export interface SheetProblemMapping {
  sheetProblemId: string;
  title: string;
  platform: Platform;
  /** Numeric/string problem id on the platform, when reliably known. Informational only. */
  platformProblemId?: string;
  /** The stable, canonical identifier we actually match against at runtime. */
  platformSlug: string;
  platformUrl: string;
}

export interface SheetDataset {
  sheet: SheetId;
  problems: SheetProblemMapping[];
}

/** A problem row as discovered live in the sheet's DOM (not the static mapping). */
export interface SheetPageProblem {
  platformSlug: string;
  platformUrl: string;
  /** Best-effort title read from the DOM, for logging/debugging only. */
  titleGuess: string;
  rowElement: Element;
}

export interface ExtensionSettings {
  enabled: boolean;
  activeSheet: SheetId;
  debugLogging: boolean;
}

export interface CompletionRecord {
  sheetProblemId: string;
  title: string;
  platform: Platform;
  problemSlug: string;
  completedAt: number;
}

/** Keyed by sheetProblemId. This is the extension's own record of what it has
 * marked done — the source of truth it reconciles the sheet's DOM against. */
export type CompletionState = Record<string, CompletionRecord>;

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  activeSheet: "striver",
  debugLogging: true,
};
