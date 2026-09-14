import type {
  AccountBinding,
  AccountCompletionState,
  CompletionRecord,
  CompletionState,
  ExtensionSettings,
} from "../core/types";

import { DEFAULT_SETTINGS } from "../core/types";

const KEYS = {
  settings: "settings",
  completionState: "completionState",
  accountBinding: "accountBinding",
} as const;

/**
 * Completion state from the old version, before account isolation:
 *
 * {
 *   "striver-two-sum": CompletionRecord,
 *   "striver-binary-search": CompletionRecord
 * }
 */
type LegacyCompletionState = Record<
  string,
  CompletionRecord
>;

async function readLocal<T>(
  key: string
): Promise<T | undefined> {
  const result =
    await chrome.storage.local.get(key);

  return result[key] as T | undefined;
}

async function writeLocal<T>(
  key: string,
  value: T
): Promise<void> {
  await chrome.storage.local.set({
    [key]: value,
  });
}

function accountKey(
  leetcodeUsername: string
): string {
  return `leetcode:${leetcodeUsername
    .trim()
    .toLowerCase()}`;
}

function isCompletionRecord(
  value: unknown
): value is CompletionRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record =
    value as Partial<CompletionRecord>;

  return (
    typeof record.sheetProblemId === "string" &&
    typeof record.title === "string" &&
    record.platform === "leetcode" &&
    typeof record.problemSlug === "string" &&
    typeof record.completedAt === "number"
  );
}

function isLegacyCompletionState(
  value: unknown
): value is LegacyCompletionState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entries = Object.values(
    value as Record<string, unknown>
  );

  // Empty object is valid for the new format.
  if (entries.length === 0) {
    return false;
  }

  return entries.some(isCompletionRecord);
}

/**
 * Migrates the old flat completion structure into the
 * currently bound LeetCode account.
 *
 * Existing account-scoped data is preserved.
 */
function migrateLegacyState(
  rawState: Record<string, unknown>,
  binding: AccountBinding
): CompletionState {
  const key = accountKey(
    binding.leetcodeUsername
  );

  const nextState: CompletionState = {};

  // Preserve already-account-scoped data.
  for (const [
    topLevelKey,
    value,
  ] of Object.entries(rawState)) {
    if (!value || typeof value !== "object") {
      continue;
    }

    // This is an old flat completion record.
    if (isCompletionRecord(value)) {
      continue;
    }

    const accountState: AccountCompletionState =
      {};

    for (const [
      sheetProblemId,
      record,
    ] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (isCompletionRecord(record)) {
        accountState[sheetProblemId] = record;
      }
    }

    if (Object.keys(accountState).length > 0) {
      nextState[topLevelKey] = accountState;
    }
  }

  // Migrate legacy records into the newly bound account.
  const migratedAccountState: AccountCompletionState =
    {
      ...(nextState[key] ?? {}),
    };

  for (const record of Object.values(rawState)) {
    if (!isCompletionRecord(record)) {
      continue;
    }

    migratedAccountState[
      record.sheetProblemId
    ] = {
      ...record,
      leetcodeUsername:
        binding.leetcodeUsername,
    };
  }

  if (
    Object.keys(migratedAccountState).length > 0
  ) {
    nextState[key] =
      migratedAccountState;
  }

  return nextState;
}

async function saveCompletionStateInternal(
  state: CompletionState
): Promise<void> {
  await writeLocal(
    KEYS.completionState,
    state
  );
}

export const storageService = {
  async getSettings(): Promise<ExtensionSettings> {
    const stored =
      await readLocal<ExtensionSettings>(
        KEYS.settings
      );

    return {
      ...DEFAULT_SETTINGS,
      ...stored,
    };
  },

  async saveSettings(
    settings: ExtensionSettings
  ): Promise<void> {
    await writeLocal(
      KEYS.settings,
      settings
    );
  },

  async getAccountBinding(): Promise<AccountBinding | null> {
    return (
      (await readLocal<
        AccountBinding | null
      >(KEYS.accountBinding)) ?? null
    );
  },

  /**
   * Save account binding.
   *
   * On the first binding, if old unscoped completion
   * history exists, migrate it into this account.
   */
  async saveAccountBinding(
    binding: AccountBinding | null
  ): Promise<void> {
    if (!binding) {
      await writeLocal(
        KEYS.accountBinding,
        null
      );

      return;
    }

    const normalizedBinding: AccountBinding =
      {
        ...binding,
        leetcodeUsername:
          binding.leetcodeUsername.trim(),
        striverUsername:
          binding.striverUsername.trim(),
      };

    if (
      !normalizedBinding.leetcodeUsername ||
      !normalizedBinding.striverUsername
    ) {
      throw new Error(
        "Both account usernames are required"
      );
    }

    const rawState =
      await readLocal<unknown>(
        KEYS.completionState
      );

    if (
      isLegacyCompletionState(rawState)
    ) {
      const migratedState =
        migrateLegacyState(
          rawState as Record<
            string,
            unknown
          >,
          normalizedBinding
        );

      await saveCompletionStateInternal(
        migratedState
      );
    }

    await writeLocal(
      KEYS.accountBinding,
      normalizedBinding
    );
  },

  async getCompletionState(): Promise<CompletionState> {
    const rawState =
      await readLocal<unknown>(
        KEYS.completionState
      );

    if (
      !rawState ||
      typeof rawState !== "object"
    ) {
      return {};
    }

    /**
     * Safety net in case a legacy state survives
     * until after the binding has already been saved.
     */
    if (
      isLegacyCompletionState(rawState)
    ) {
      const binding =
        await this.getAccountBinding();

      if (!binding) {
        return {};
      }

      const migratedState =
        migrateLegacyState(
          rawState as Record<
            string,
            unknown
          >,
          binding
        );

      await saveCompletionStateInternal(
        migratedState
      );

      return migratedState;
    }

    return rawState as CompletionState;
  },

  async saveCompletionState(
    state: CompletionState
  ): Promise<void> {
    await saveCompletionStateInternal(
      state
    );
  },

  async getAccountCompletionState(
    leetcodeUsername: string
  ): Promise<AccountCompletionState> {
    const state =
      await this.getCompletionState();

    return (
      state[
        accountKey(leetcodeUsername)
      ] ?? {}
    );
  },

  /**
   * Idempotent per LeetCode account.
   */
  async addCompletion(
    record: CompletionRecord
  ): Promise<{
    added: boolean;
    state: AccountCompletionState;
  }> {
    const fullState =
      await this.getCompletionState();

    const key = accountKey(
      record.leetcodeUsername
    );

    const currentAccountState =
      fullState[key] ?? {};

    if (
      currentAccountState[
        record.sheetProblemId
      ]
    ) {
      return {
        added: false,
        state: currentAccountState,
      };
    }

    const nextAccountState: AccountCompletionState =
      {
        ...currentAccountState,
        [record.sheetProblemId]:
          record,
      };

    const nextFullState: CompletionState =
      {
        ...fullState,
        [key]:
          nextAccountState,
      };

    await saveCompletionStateInternal(
      nextFullState
    );

    return {
      added: true,
      state: nextAccountState,
    };
  },

  async getRecentActivity(
    limit = 10
  ): Promise<CompletionRecord[]> {
    const binding =
      await this.getAccountBinding();

    if (!binding) {
      return [];
    }

    const state =
      await this.getAccountCompletionState(
        binding.leetcodeUsername
      );

    return Object.values(state)
      .sort(
        (a, b) =>
          b.completedAt -
          a.completedAt
      )
      .slice(0, limit);
  },
};