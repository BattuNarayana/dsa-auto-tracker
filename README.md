# DSA Auto Tracker

A Chrome extension that automatically marks problems as **Done** on your DSA sheet when you receive an **Accepted** verdict on LeetCode.

## MVP

Currently supports:

- Striver's A2Z DSA Sheet
- LeetCode
- Account binding between LeetCode and Striver
- Automatic completion synchronization

No backend or cloud storage is used. Completion data, settings, and account binding are stored locally using `chrome.storage.local`.

---

## How it works

```text
Striver Sheet
      ↓
Open LeetCode problem
      ↓
Solve
      ↓
Accepted
      ↓
Extension detects submission
      ↓
Verifies bound LeetCode account
      ↓
Matches problem using LeetCode slug
      ↓
Stores completion locally
      ↓
Automatically marks it Done on Striver
```

---

## Account Binding

DSA Auto Tracker supports account-level isolation to prevent completions from one LeetCode account from affecting another.

The user binds:

```text
LeetCode account  ↔  Striver account
```

Before synchronizing a submission, the extension verifies that:

1. The currently logged-in LeetCode account matches the bound LeetCode username.
2. The currently logged-in Striver account matches the bound Striver username.
3. The problem exists in the supported sheet dataset.
4. The submission was accepted.

If any verification fails, synchronization is rejected.

This prevents a completion from being incorrectly synchronized when the user switches between different LeetCode accounts or Striver accounts.

Completion history is scoped by the bound LeetCode account.

---

## Architecture

The extension uses three main layers:

### Content Scripts

**LeetCode**

- Detects accepted submissions.
- Detects the currently logged-in LeetCode username.
- Sends submission events to the service worker.

**Striver**

- Detects problems on the sheet.
- Detects the currently logged-in Striver username.
- Applies completion state to the corresponding checkbox.
- Reconciles completion state when the page changes.

### Service Worker

The service worker acts as the central synchronization layer.

It:

- Receives submission events.
- Verifies account binding.
- Matches LeetCode problems against the static dataset.
- Records completion state.
- Prevents duplicate completion records.
- Notifies open Striver tabs when a problem is completed.
- Handles extension settings and account binding.

### Storage

Uses:

```text
chrome.storage.local
```

Stored data includes:

- Extension settings
- Account binding
- Account-scoped completion history

No external database or backend is required.

---

## Problem Matching

Problem identity is based on the platform's stable **problem slug** rather than topic, category, or displayed position.

For example:

```text
LeetCode URL
https://leetcode.com/problems/two-sum/

Problem slug
two-sum
```

The slug is mapped to the corresponding problem in the Striver dataset.

This makes synchronization independent of the problem's position or category on the sheet.

---

## Safety / Sync Rules

The extension intentionally fails closed when it cannot confidently verify the required information.

Synchronization is skipped when:

- The extension is disabled.
- No account binding exists.
- The current LeetCode account does not match the bound account.
- The current Striver account does not match the bound account.
- The problem cannot be mapped to the active sheet.
- The submission is not accepted.
- The current account cannot be confidently detected.

Duplicate accepted submissions do not create duplicate completion records.

---

## Tech Stack

- TypeScript
- React
- Vite
- Chrome Manifest V3
- `chrome.storage.local`

No:

- State-management library
- CSS framework
- Backend
- Database
- External API
- Cloud storage

---

## Project Structure

```text
src/
├── background/
│   └── service-worker.ts
│
├── content/
│   ├── leetcode/
│   │   ├── leetcode-adapter.ts
│   │   ├── index.ts
│   │   └── selectors.ts
│   │
│   ├── striver/
│   │   ├── striver-adapter.ts
│   │   ├── index.ts
│   │   └── selectors.config.ts
│   │
│   └── common/
│       ├── logger.ts
│       └── dom-utils.ts
│
├── core/
│   ├── types.ts
│   ├── messages.ts
│   ├── problem-mapper.ts
│   └── sync-engine.ts
│
├── storage/
│   └── storage-service.ts
│
└── popup/
    ├── App.tsx
    ├── main.tsx
    └── popup.css
│
data/
└── striver.json
│
scripts/
├── build.mjs
├── smoke-test.ts
└── zip-dist.mjs
│
manifest.json
package.json
tsconfig.json
```

---

## Installation / Build

Clone the repository and install dependencies:

```bash
npm install
```

Build the extension:

```bash
npm run build
```

The build runs TypeScript validation and generates the Chrome extension inside:

```text
dist/
```

The generated `dist/` folder contains:

```text
manifest.json
popup.html
service-worker.js
content-leetcode.js
content-striver.js
icons/
```

The generated extension is directly loadable into Chrome. No zip file is required for local development.

---

## Load into Chrome

1. Go to:

   ```text
   chrome://extensions/
   ```

2. Enable **Developer mode**.

3. Click **Load unpacked**.

4. Select the:

   ```text
   dist/
   ```

   folder.

5. Open:
   - LeetCode
   - Striver's A2Z DSA Sheet

6. Configure your account binding from the extension popup:

   ```text
   LeetCode username
   Striver username
   ```

7. Solve a supported Striver problem on LeetCode.

8. Once LeetCode returns **Accepted**, the extension automatically synchronizes the completion to Striver.

---

## Development

Build:

```bash
npm run build
```

The extension can then be reloaded from:

```text
chrome://extensions/
```

For debugging, inspect the extension's service worker from the Chrome Extensions page.

The extension uses `[DSA Tracker]` log messages for debugging and synchronization events.

---

## Current Limitations

- Currently supports only Striver's A2Z DSA Sheet and LeetCode.
- Striver DOM selectors may require updates if the website changes its frontend structure.
- Completion data is local to the current Chrome profile.
- Manual mark/unmark functionality is not implemented.
- No cross-device synchronization is available.
- No cloud backup of completion history is available.

---

## Roadmap

- [ ] NeetCode support
- [ ] Blind 75 support
- [ ] Additional coding platforms
- [ ] Manual mark/unmark
- [ ] User-selectable sheets
- [ ] Automatic dataset generation
- [ ] Improved resilience against website DOM changes

---

## Design Principles

### Automate the repetitive part

The extension does not try to track everything a user solves.

Its purpose is simple:

> **Solve on LeetCode → automatically update the DSA sheet.**

### Fail closed

When account identity or problem identity cannot be verified confidently, the extension does nothing rather than making an incorrect change.

### Local-first

The extension does not require a backend or user account.

Data remains inside the user's Chrome profile.

### Stable problem identity

Synchronization is based on platform problem slugs rather than UI position, topic, or category.

---

## License

This project is currently intended as a personal / learning project.