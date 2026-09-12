/**
 * This is not a full test suite (see README > Manual Testing Checklist for
 * the end-to-end browser checklist that actually needs real Chrome + real
 * LeetCode + real takeuforward.org). It exercises the parts that CAN be
 * verified without a browser: the sync engine's decision logic, running for
 * real against the storage service and a mocked chrome.* API, so we know the
 * idempotency and mapping-lookup rules actually hold before this ever touches
 * a live page.
 */
import assert from "node:assert/strict";

// --- Minimal in-memory mock of the chrome APIs sync-engine.ts touches -----
type Listener = (changes: any, area: string) => void;

const localStore: Record<string, unknown> = {};
const changeListeners: Listener[] = [];
const sentTabMessages: Array<{ tabId: number; message: unknown }> = [];

(globalThis as any).chrome = {
  storage: {
    local: {
      async get(key: string) {
        return { [key]: localStore[key] };
      },
      async set(obj: Record<string, unknown>) {
        for (const [k, v] of Object.entries(obj)) {
          const changes: Record<string, unknown> = {};
          changes[k] = { oldValue: localStore[k], newValue: v };
          localStore[k] = v;
          changeListeners.forEach((l) => l(changes, "local"));
        }
      },
    },
    onChanged: {
      addListener(fn: Listener) {
        changeListeners.push(fn);
      },
    },
  },
  tabs: {
    async query() {
      return []; // no open Striver tabs in this test — exercises the "no-op notify" path
    },
    async sendMessage(tabId: number, message: unknown) {
      sentTabMessages.push({ tabId, message });
    },
  },
};

async function main() {
  const { handleAcceptedSubmission } = await import("../src/core/sync-engine");
  const { storageService } = await import("../src/storage/storage-service");

  // 1. A mapped, previously-unsolved problem should be recorded.
  await handleAcceptedSubmission({
    platform: "leetcode",
    problemSlug: "two-sum",
    timestamp: 1000,
  });
  let state = await storageService.getCompletionState();
  assert.equal(Object.keys(state).length, 1, "expected exactly one completion recorded");
  assert.ok(state["striver-two-sum"], "expected striver-two-sum to be recorded");
  console.log("✓ mapped accepted submission is recorded");

  // 2. The same problem solved again (e.g. re-submitted) must NOT duplicate
  //    or re-notify — idempotency is the whole point of requirement #9.
  await handleAcceptedSubmission({
    platform: "leetcode",
    problemSlug: "two-sum",
    timestamp: 2000,
  });
  state = await storageService.getCompletionState();
  assert.equal(Object.keys(state).length, 1, "duplicate accepted submission must not add a second entry");
  assert.equal(
    state["striver-two-sum"].completedAt,
    1000,
    "the original completion timestamp must not be overwritten by a duplicate"
  );
  console.log("✓ duplicate accepted submission is ignored (idempotent)");

  // 3. A problem with no mapping in the active sheet must be silently ignored
  //    — this is the "solve something unrelated to the sheet" case from the
  //    product spec. No entry should appear, and nothing should throw.
  await handleAcceptedSubmission({
    platform: "leetcode",
    problemSlug: "some-problem-not-on-any-sheet",
    timestamp: 3000,
  });
  state = await storageService.getCompletionState();
  assert.equal(Object.keys(state).length, 1, "unmapped problem must not create any completion entry");
  console.log("✓ unmapped problem is ignored, not guessed at");

  // 4. When the extension is disabled, nothing should be recorded even for a
  //    mapped, valid problem.
  await storageService.saveSettings({ enabled: false, activeSheet: "striver", debugLogging: false });
  await handleAcceptedSubmission({
    platform: "leetcode",
    problemSlug: "3sum",
    timestamp: 4000,
  });
  state = await storageService.getCompletionState();
  assert.ok(!state["striver-3sum"], "disabled extension must not record completions");
  console.log("✓ disabled extension ignores accepted submissions");

  // Re-enable and confirm it resumes working normally.
  await storageService.saveSettings({ enabled: true, activeSheet: "striver", debugLogging: false });
  await handleAcceptedSubmission({
    platform: "leetcode",
    problemSlug: "3sum",
    timestamp: 5000,
  });
  state = await storageService.getCompletionState();
  assert.ok(state["striver-3sum"], "re-enabled extension should record subsequent completions");
  console.log("✓ re-enabling the extension resumes normal recording");

  console.log("\nAll sync-engine smoke tests passed.\n");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
