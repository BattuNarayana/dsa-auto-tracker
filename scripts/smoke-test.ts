import assert from "node:assert/strict";

type Listener = (
  changes: any,
  area: string
) => void;

const localStore:
  Record<string, unknown> = {};

const changeListeners:
  Listener[] = [];

const sentTabMessages:
  Array<{
    tabId: number;
    message: unknown;
  }> = [];

(globalThis as any).chrome = {
  storage: {
    local: {
      async get(key: string) {
        return {
          [key]: localStore[key],
        };
      },

      async set(
        obj: Record<string, unknown>
      ) {
        for (
          const [key, value]
          of Object.entries(obj)
        ) {
          const changes:
            Record<string, unknown> =
              {};

          changes[key] = {
            oldValue:
              localStore[key],
            newValue:
              value,
          };

          localStore[key] =
            value;

          changeListeners.forEach(
            (listener) =>
              listener(
                changes,
                "local"
              )
          );
        }
      },
    },

    onChanged: {
      addListener(
        fn: Listener
      ) {
        changeListeners.push(fn);
      },
    },
  },

  tabs: {
    async query() {
      return [];
    },

    async sendMessage(
      tabId: number,
      message: unknown
    ) {
      sentTabMessages.push({
        tabId,
        message,
      });
    },
  },
};

async function main() {
  const {
    handleAcceptedSubmission,
  } = await import(
    "../src/core/sync-engine"
  );

  const {
    storageService,
  } = await import(
    "../src/storage/storage-service"
  );

  const binding = {
    leetcodeUsername:
      "Battu_Narayana",

    striverUsername:
      "test-striver",

    boundAt: 1,
  };

  await storageService.saveAccountBinding(
    binding
  );

  // 1. Valid mapped submission.
  await handleAcceptedSubmission({
    platform: "leetcode",
    problemSlug: "two-sum",
    timestamp: 1000,
    leetcodeUsername:
      "Battu_Narayana",
  });

  let state =
    await storageService
      .getCompletionState();

  assert.ok(
    state[
      "leetcode:battu_narayana"
    ]
  );

  assert.ok(
    state[
      "leetcode:battu_narayana"
    ][
      "striver-two-sum"
    ]
  );

  console.log(
    "✓ mapped accepted submission is recorded under bound account"
  );

  // 2. Duplicate must be ignored.
  await handleAcceptedSubmission({
    platform: "leetcode",
    problemSlug: "two-sum",
    timestamp: 2000,
    leetcodeUsername:
      "Battu_Narayana",
  });

  state =
    await storageService
      .getCompletionState();

  assert.equal(
    state[
      "leetcode:battu_narayana"
    ][
      "striver-two-sum"
    ].completedAt,
    1000
  );

  console.log(
    "✓ duplicate accepted submission is ignored"
  );

  // 3. Different account must NOT affect bound account.
  await handleAcceptedSubmission({
    platform: "leetcode",
    problemSlug: "3sum",
    timestamp: 3000,
    leetcodeUsername:
      "someOtherAccount",
  });

  state =
    await storageService
      .getCompletionState();

  assert.ok(
    !state[
      "leetcode:battu_narayana"
    ][
      "striver-3sum"
    ]
  );

  console.log(
    "✓ mismatched LeetCode account is rejected"
  );

  // 4. Unmapped problem ignored.
  await handleAcceptedSubmission({
    platform: "leetcode",
    problemSlug:
      "some-problem-not-on-any-sheet",
    timestamp: 4000,
    leetcodeUsername:
      "Battu_Narayana",
  });

  state =
    await storageService
      .getCompletionState();

  assert.equal(
    Object.keys(
      state[
        "leetcode:battu_narayana"
      ]
    ).length,
    1
  );

  console.log(
    "✓ unmapped problem is ignored"
  );

  // 5. Disabled extension.
  await storageService.saveSettings({
    enabled: false,
    activeSheet: "striver",
    debugLogging: false,
  });

  await handleAcceptedSubmission({
    platform: "leetcode",
    problemSlug: "3sum",
    timestamp: 5000,
    leetcodeUsername:
      "Battu_Narayana",
  });

  state =
    await storageService
      .getCompletionState();

  assert.ok(
    !state[
      "leetcode:battu_narayana"
    ][
      "striver-3sum"
    ]
  );

  console.log(
    "✓ disabled extension ignores submissions"
  );

  // 6. Re-enable.
  await storageService.saveSettings({
    enabled: true,
    activeSheet: "striver",
    debugLogging: false,
  });

  await handleAcceptedSubmission({
    platform: "leetcode",
    problemSlug: "3sum",
    timestamp: 6000,
    leetcodeUsername:
      "Battu_Narayana",
  });

  state =
    await storageService
      .getCompletionState();

  assert.ok(
    state[
      "leetcode:battu_narayana"
    ][
      "striver-3sum"
    ]
  );

  console.log(
    "✓ re-enabling resumes normal recording"
  );

  console.log(
    "\nAll account-isolation smoke tests passed.\n"
  );
}

main().catch((err) => {
  console.error(
    "Smoke test failed:",
    err
  );

  process.exit(1);
});