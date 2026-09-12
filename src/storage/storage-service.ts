import type {
  CompletionRecord,
  CompletionState,
  ExtensionSettings,
} from "../core/types";
import { DEFAULT_SETTINGS } from "../core/types";

/**
 * Every chrome.storage.local read/write in the extension goes through this
 * module. Nothing else touches chrome.storage directly. That gives us one
 * place to change the storage backend later, and one place to reason about
 * exactly what we persist (see README > Privacy: only settings + a small
 * completion history, never code, never credentials).
 */

const KEYS = {
  settings: "settings",
  completionState: "completionState",
} as const;

async function readLocal<T>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as T | undefined;
}

async function writeLocal<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export const storageService = {
  async getSettings(): Promise<ExtensionSettings> {
    const stored = await readLocal<ExtensionSettings>(KEYS.settings);
    return { ...DEFAULT_SETTINGS, ...stored };
  },

  async saveSettings(settings: ExtensionSettings): Promise<void> {
    await writeLocal(KEYS.settings, settings);
  },

  async getCompletionState(): Promise<CompletionState> {
    const stored = await readLocal<CompletionState>(KEYS.completionState);
    return stored ?? {};
  },

  async saveCompletionState(state: CompletionState): Promise<void> {
    await writeLocal(KEYS.completionState, state);
  },

  /** Idempotent: if this sheetProblemId is already recorded, does nothing and
   * reports that no new completion happened, so callers never double-log or
   * double-notify tabs for the same problem. */
  async addCompletion(
    record: CompletionRecord
  ): Promise<{ added: boolean; state: CompletionState }> {
    const state = await this.getCompletionState();
    if (state[record.sheetProblemId]) {
      return { added: false, state };
    }
    const nextState: CompletionState = {
      ...state,
      [record.sheetProblemId]: record,
    };
    await this.saveCompletionState(nextState);
    return { added: true, state: nextState };
  },

  async getRecentActivity(limit = 10): Promise<CompletionRecord[]> {
    const state = await this.getCompletionState();
    return Object.values(state)
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, limit);
  },
};
