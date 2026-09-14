/**
 * Core domain types.
 */

export type Platform = "leetcode";

export type SheetId = "striver";

export type SubmissionStatus = "accepted" | "rejected" | "unknown";

export interface SubmissionResult {
  platform: Platform;
  problemSlug: string;
  status: SubmissionStatus;
  timestamp: number;
}

/**
 * User-selected pairing between a LeetCode account and a Striver account.
 *
 * The LeetCode username is used for runtime authorization.
 * The Striver username currently acts as the paired-account label.
 */
export interface AccountBinding {
  leetcodeUsername: string;
  striverUsername: string;
  boundAt: number;
}

export interface SheetProblemMapping {
  sheetProblemId: string;
  title: string;
  platform: Platform;
  platformProblemId?: string;
  platformSlug: string;
  platformUrl: string;
}

export interface SheetDataset {
  sheet: SheetId;
  problems: SheetProblemMapping[];
}

export interface SheetPageProblem {
  platformSlug: string;
  platformUrl: string;
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

  /**
   * LeetCode account that produced this completion.
   */
  leetcodeUsername: string;
}

/**
 * Completion history belonging to ONE LeetCode account.
 */
export type AccountCompletionState = Record<
  string,
  CompletionRecord
>;

/**
 * Account-scoped completion history.
 *
 * Example:
 *
 * {
 *   "leetcode:battu_narayana": {
 *     "striver-two-sum": {...},
 *     "striver-binary-search": {...}
 *   },
 *
 *   "leetcode:other_account": {
 *     "striver-two-sum": {...}
 *   }
 * }
 */
export type CompletionState = Record<
  string,
  AccountCompletionState
>;

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  activeSheet: "striver",
  debugLogging: true,
};