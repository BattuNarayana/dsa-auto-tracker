# DSA Auto Tracker

A Chrome extension that automatically marks a problem as **Done** on your DSA
sheet the moment you get an **Accepted** verdict for it on LeetCode.

MVP scope: **Striver's A2Z sheet** (takeuforward.org) + **LeetCode**, and
nothing else. No backend, no accounts, no cloud — everything lives in your
browser's local storage.

```
Striver Sheet → open a problem → solve it on LeetCode → LeetCode says Accepted
   → extension detects it → finds the matching sheet problem → ticks it. Done.
```

---

## Why this exists

Following a structured sheet means a five-step manual loop for every single
problem: open it, solve it elsewhere, come back, find it again, tick it. The
solving is the only step that needs a human. This extension automates the
other four.

The sheet is treated as the **source of truth** — the extension only ever
acts on problems that are actually part of your configured sheet's mapping.
Solving something outside that scope is deliberately ignored.

---

## Architecture

```
┌──────────────────────────┐        ┌────────────────────────────┐
│   Striver content        │        │   LeetCode content         │
│   script (striver-       │        │   script (leetcode-        │
│   adapter.ts)            │        │   adapter.ts)              │
│                          │        │                            │
│  isSupportedPage()       │        │  isSupportedPage()         │
│  getProblems()           │        │  getCurrentProblemSlug()   │
│  isCompleted()           │        │  start(onAccepted)         │
│  markCompleted()         │        │  (MutationObserver on the  │
│                          │        │   submission verdict node) │
└───────────▲──────────────┘        └─────────────┬──────────────┘
            │  chrome.tabs.sendMessage            │  chrome.runtime.sendMessage
            │  (PROBLEM_MARKED_ON_SHEET)          │  (SUBMISSION_ACCEPTED)
            │                                     ▼
            │                         ┌────────────────────────────────┐
            └─────────────────────────┤   Service worker               │
                                      │   (background/service-worker)  │
                                      │                                │
                                      │   core/sync-engine.ts:         │
                                      │     lookup mapping             │
                                      │     check idempotency          │
                                      │     persist + notify           │
                                      │                                │
                                      │   core/problem-mapper.ts       │
                                      │   storage/storage-service.ts   │
                                      └───────────────┬────────────────┘
                                                      │ chrome.storage.  local
                                                       ▼
                                      settings · completion state (history)
```

Content scripts never talk to each other directly — everything passes
through the service worker via a typed message contract
(`src/core/messages.ts`), so the LeetCode adapter and the Striver adapter are
fully decoupled. Neither one knows the other exists.

**Problem identity** is never based on topic/category (the same problem can
sit under "Arrays" on one sheet and "Hashing" on another). It's based on the
platform's stable slug — for LeetCode, the URL slug (`two-sum`) — via a
static mapping dataset (`data/striver.json`) linking each sheet problem to
its platform problem. Adding a second sheet later means adding
`data/neetcode.json` and one line in `problem-mapper.ts`; the sync engine
itself never changes.

### Project structure

```
dsa-auto-tracker/
├── src/
│   ├── background/service-worker.ts       # message router / coordinator
│   ├── content/
│   │   ├── leetcode/
│   │   │   ├── leetcode-adapter.ts         # PlatformAdapter for LeetCode
│   │   │   ├── selectors.ts                # LeetCode DOM selectors, isolated
│   │   │   └── index.ts                    # content script entry
│   │   ├── striver/
│   │   │   ├── striver-adapter.ts          # SheetAdapter for Striver
│   │   │   ├── selectors.config.ts         # Striver DOM selectors, isolated
│   │   │   └── index.ts                    # content script entry (reconciler)
│   │   └── common/
│   │       ├── logger.ts                   # centralized "[DSA Tracker]" logger
│   │       └── dom-utils.ts                # debounce, wait, SPA URL-change hook
│   ├── core/
│   │   ├── types.ts                        # every shared domain type
│   │   ├── messages.ts                     # typed ExtensionMessage contract
│   │   ├── problem-mapper.ts               # sheet dataset registry + lookup
│   │   └── sync-engine.ts                  # the actual sync decision logic
│   ├── storage/storage-service.ts          # the only module that touches chrome.storage
│   └── popup/                              # React popup (App.tsx, main.tsx, popup.css)
├── data/striver.json                       # static sheet → LeetCode mapping
├── public/icons/                           # extension icons
├── scripts/build.mjs                       # multi-target build (see below)
├── scripts/smoke-test.ts                   # sync-engine logic test (mocked chrome API)
├── scripts/zip-dist.mjs                    # packages dist/ into a .zip
├── manifest.json
└── vite / tsconfig / package.json
```

---

## Tech stack

- TypeScript, strict mode
- Vite (build only — see the note on why the build isn't a single plain
  `vite build` below)
- React (popup UI only)
- Manifest V3
- `chrome.storage.local` for all persistence
- No bundler magic beyond what's needed: no state management library, no
  routing, no CSS framework.

### A build detail worth knowing about

Vite's default multi-entry output shares code between entries via ES
`import` statements. That's fine for a page loaded with
`<script type="module">` (the popup), but Chrome loads Manifest V3 content
scripts as **classic scripts** — a stray `import` in one would throw
`Cannot use import statement outside a module` the moment the page loaded.
`scripts/build.mjs` therefore builds the popup as a normal Vite/ES-module app,
and builds the service worker and each content script as **separate,
single-entry IIFE bundles** with no code-splitting, so every file Chrome
actually loads is fully self-contained. This was caught and fixed during
development (see the smoke test and the build output below) rather than
shipped as a latent bug.

---

## Installation / build

```bash
npm install
npm run build      # runs `tsc --noEmit`, then scripts/build.mjs
```

This produces a `dist/` folder containing `manifest.json`, `popup.html`,
`service-worker.js`, `content-leetcode.js`, `content-striver.js`, and
`icons/`. It's already Chrome-loadable — no zip needed for local dev.

### Load into Chrome

1. Go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the `dist/` folder (not the project root).
5. Open a Striver A2Z sheet problem's LeetCode page and solve it — watch the
   service worker's console (`chrome://extensions` → click "service worker"
   under this extension) for `[DSA Tracker]` log lines.

### Optional: package as a .zip

```bash
npm run zip        # writes dsa-auto-tracker.zip from dist/, for Web Store upload etc.
```

### Other scripts

```bash
npm run typecheck  # tsc --noEmit only
npm run test       # runs scripts/smoke-test.ts — see "Testing" below
npm run dev        # build.mjs in --watch mode (rebuilds on save; still needs a manual "Reload" in chrome://extensions)
```

---

## How the Striver ↔ LeetCode flow actually works

1. **On a LeetCode problem page** (`leetcode.com/problems/<slug>`), the
   content script arms a `MutationObserver` on `<body>`. It does **not**
   poll on a timer for the verdict — it only reacts to real DOM mutations,
   debounced to 250ms so a burst of React re-renders collapses into one
   check.
2. When it finds `[data-e2e-locator="submission-result"]` (see provenance
   below) whose text is exactly `"Accepted"`, it sends a single
   `SUBMISSION_ACCEPTED` message to the service worker with the problem's
   slug and a timestamp. "Wrong Answer", "Time Limit Exceeded", a bare submit
   click, or a successful compile are all explicitly **not** treated as
   completion.
3. The **service worker** (`core/sync-engine.ts`) looks up that slug in the
   active sheet's mapping dataset. No mapping → logged and ignored, nothing
   written anywhere. Mapping found but already recorded as complete →
   logged and ignored (idempotent — resubmitting an already-solved problem
   never double-fires). Otherwise, it records the completion in
   `chrome.storage.local` and best-effort pushes a `PROBLEM_MARKED_ON_SHEET`
   message to any currently-open Striver tab.
4. **On the Striver sheet**, the content script reconciles on load, on every
   debounced DOM mutation (the sheet's problem list re-renders as you scroll
   or filter), and on receipt of that push message. Reconciliation means:
   for every problem row currently on screen, look up its sheet ID, check
   whether the extension's own storage says it's done, and — only if so, and
   only if the row doesn't already show as done — click its completion
   control, then verify the click actually changed the state before
   declaring success.

This means refreshing the sheet, closing and reopening the tab, or never
having the sheet open at solve-time all work correctly: storage is the
single source of truth the sheet always reconciles against, not a one-shot
live event.

---

## DOM Selector Calibration (please read before relying on this)

### LeetCode — verified, not guessed

`src/content/leetcode/selectors.ts` uses
`[data-e2e-locator="submission-result"]` for the verdict banner. This wasn't
guessed: I read the current, actively-maintained content script of an
open-source LeetCode-submission-sync extension (LeetHub 3.0) to confirm it,
rather than inventing a selector against LeetCode's actual production
frontend. `data-e2e-locator` attributes are LeetCode's own end-to-end-test
hooks — deliberately stable identifiers, much less likely to shift on a
visual refresh than a generated class name. If LeetCode changes its frontend
enough to break this, `selectors.ts` is the one file to check.

### Striver's sheet — a real limitation, handled honestly

**This is the one part of the system that could not be verified against the
live site during development, and you should know why before trusting it.**
takeuforward.org's A2Z sheet is a client-side-rendered Next.js app: its
checkboxes and row markup are generated by JavaScript at runtime, styled
with hashed/generated class names that don't appear anywhere in the page's
initial HTML and aren't documented publicly. Development happened in a
sandboxed environment with no headless-browser or live-DOM-inspection access
to third-party sites — only a text-extracting page fetcher that returns
rendered *text*, not raw HTML or class names, and can't execute a click to
reveal post-interaction markup. Per the project's own ground rule ("do not
invent selectors"), I didn't pretend to have verified something I hadn't.

**What's reliable, and what the adapter actually leans on instead:**
every problem row links out to its LeetCode problem via a real
`<a href="https://leetcode.com/problems/<slug>/...">` anchor — genuine
content, not styling, so it's the one thing guaranteed stable across
redesigns. `getProblems()` in `striver-adapter.ts` uses that anchor as the
**only** way problems are identified on the page. To find the completion
control, it walks up from that anchor (bounded to 6 ancestor levels) looking
for a checkbox-like element using a prioritized, generic candidate list in
`src/content/striver/selectors.config.ts`
(`input[type="checkbox"]`, `[role="checkbox"]`, `button[aria-checked]`,
class names containing "checkbox"/"check"). If none match, it logs a
diagnostic and leaves that row alone — it never guesses, never clicks
something it isn't sure about. A false "success" that actually clicked the
wrong thing is worse than a row that stays unmarked.

**Before you rely on this**, open the sheet in Chrome, right-click a
problem's checkbox → **Inspect**, and confirm/adjust
`checkboxCandidates` in `selectors.config.ts` to match what you actually
see. This is a five-minute task and it's the only thing standing between
this adapter and full reliability — everything else in the system (mapping,
sync engine, storage, popup, idempotency) has been exercised and works
independently of this one file.

---

## Privacy & permissions

- Permissions requested: `storage` only, plus `host_permissions` scoped to
  exactly `leetcode.com` and `takeuforward.org` — nothing broader.
- No backend, no network requests anywhere in this codebase, no analytics.
- Never reads or transmits your code, your LeetCode session/cookies, or any
  browsing data outside those two sites.
- Everything persisted lives in `chrome.storage.local`: your settings
  (enabled/disabled, active sheet, debug logging) and a small completion
  history (`sheetProblemId`, `title`, `platform`, `slug`, `completedAt`).
  That's it.

---

## Error handling (fail-safe by design)

| Situation | Behavior |
|---|---|
| Can't identify the current LeetCode problem | Do nothing |
| Verdict text isn't recognized / isn't "Accepted" | Do nothing |
| No mapping for the solved problem | Do nothing, log why |
| Already marked complete | Do nothing (idempotent), log why |
| No completion control found in a Striver row | Do nothing to that row, log a diagnostic — never click at random |
| Click didn't actually change the row's state | Log an error, don't report false success |
| Extension disabled | Do nothing for any accepted submission |
| Service worker unreachable when content script messages it | Log and continue; nothing crashes |

---

## Testing

### Automated (what's actually been run)

```bash
npm run typecheck   # tsc --noEmit — passes clean
npm run test        # scripts/smoke-test.ts
```

The smoke test exercises the real `core/sync-engine.ts` against a mocked
`chrome.storage`/`chrome.tabs` API (no browser needed) and asserts:

1. A mapped, previously-unsolved problem gets recorded.
2. The same problem solved again does **not** duplicate or overwrite the
   original timestamp (idempotency).
3. A problem with no mapping in the active sheet is ignored — no entry
   created, nothing thrown.
4. Disabling the extension suppresses recording even for a valid, mapped
   problem.
5. Re-enabling it resumes normal recording.

All five currently pass. This validates the mapping/idempotency/enable-
disable logic that's identical regardless of which sheet or platform is
plugged in later — it does **not** and cannot validate real-DOM behavior on
LeetCode or the Striver sheet, which needs an actual browser (see the manual
checklist below).

### Manual checklist (needs a real Chrome + real sites)

**Functional**
1. Open a Striver problem that has a mapping in `data/striver.json` (e.g.
   Two Sum, 3Sum, Climbing Stairs — see the file for the full MVP list).
2. Open its linked LeetCode problem.
3. Submit a wrong/incorrect solution → confirm nothing on the sheet changes
   and no `SUBMISSION_ACCEPTED` log appears.
4. Submit a correct solution → confirm the console logs
   `Submission status: Accepted`, `Mapping found: ...`, and
   `Marking problem as completed: ...`.
5. Confirm the Striver problem becomes Done (requires the selector
   calibration above).
6. Refresh the Striver tab → confirm the completion persists.
7. Re-solve an already-completed problem → confirm the sheet isn't clicked
   again and no duplicate log/history entry appears.
8. Navigate between several LeetCode problems in one tab (SPA navigation,
   no full reload) → confirm each is tracked independently and the wrong
   problem is never marked.
9. Solve a LeetCode problem that has no entry in `data/striver.json` →
   confirm it's fully ignored.
10. Disable the extension from the popup → confirm accepted submissions are
    ignored until re-enabled.

**Edge cases**
- Slow-loading LeetCode/Striver pages (throttle network in DevTools).
- Hard refresh mid-submission.
- Multiple LeetCode tabs open on different problems simultaneously.
- Multiple Striver tabs open simultaneously (both should reconcile).
- Sheet UI structure differing from `selectors.config.ts`'s assumptions —
  confirm the console shows a diagnostic warning rather than a silent
  failure or a wrong click.

---

## Current limitations

- Only Striver's A2Z sheet and only LeetCode are supported (by design, for
  this MVP).
- The Striver completion-control selectors are generic/best-effort and need
  a one-time DevTools calibration pass — see "DOM Selector Calibration"
  above. This is the single biggest known gap.
- `data/striver.json` currently covers a representative subset of the full
  ~450-problem A2Z sheet (~35 problems spanning arrays, linked lists, binary
  search, graphs, DP, etc.), not the complete sheet. Extending it is
  data-entry, not architecture — the mapping schema and sync engine already
  support the full sheet.
- No account/sync across devices — everything is local to one Chrome
  profile.
- The popup shows history but has no way to manually mark/unmark a problem
  yet.

## Future roadmap

- Additional sheets (`data/neetcode.json`, `data/blind75.json`, ...) via the
  `SheetAdapter` interface — no changes needed to `sync-engine.ts`.
- Additional platforms (Codeforces, GeeksforGeeks) via the `PlatformAdapter`
  interface — same story.
- A settings page to let the user pick which sheet is "active" instead of
  hardcoding `striver`.
- Manual "mark done" / "undo" controls in the popup.
- Auto-generating `data/striver.json` from the sheet itself (once the DOM
  is calibrated, the same anchor-scraping `getProblems()` already does could
  export a full mapping instead of relying on a hand-maintained subset).
