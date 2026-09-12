# DSA Auto Tracker

A Chrome extension that automatically marks problems as **Done** on your
DSA sheet when you receive an **Accepted** verdict on LeetCode.

## MVP

Currently supports:

- Striver's A2Z DSA Sheet
- LeetCode

No backend, accounts, or cloud storage. Completion data is stored locally
in the browser.

## How it works

Striver Sheet
→ Open LeetCode problem
→ Solve
→ Accepted
→ Extension detects submission
→ Matches the problem
→ Automatically marks it Done on Striver

## Architecture

The extension uses three main layers:

- **Content scripts**
  - LeetCode: detects Accepted submissions
  - Striver: detects problems and updates completion state

- **Service worker**
  - Receives submission events
  - Matches problems using the static dataset
  - Handles idempotency and persistence
  - Notifies open Striver tabs

- **Storage**
  - Uses `chrome.storage.local`
  - Stores settings and completion history

Problem identity is based on the platform's stable problem slug,
not topic/category.

## Tech Stack

- TypeScript
- React
- Vite
- Chrome Manifest V3
- `chrome.storage.local`

No state-management library, CSS framework, backend, or database.

## Project Structure

```text
src/
├── background/
├── content/
│   ├── leetcode/
│   ├── striver/
│   └── common/
├── core/
├── storage/
└── popup/

data/
└── striver.json

scripts/
├── build.mjs
├── smoke-test.ts
└── zip-dist.mjs

manifest.json
package.json
tsconfig.json
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

---

## Current limitations

- Only Striver A2Z + LeetCode are supported
- The current dataset contains a subset of the full Striver sheet
- Striver's DOM selectors may need adjustment if the site changes
- Data is local to the current Chrome profile
- Manual mark/unmark functionality is not implemented yet

## Future roadmap

- Complete Striver dataset
- NeetCode / Blind 75 support
- Additional coding platforms
- Sheet selection from settings
- Manual mark/unmark
- Automatic dataset generation
