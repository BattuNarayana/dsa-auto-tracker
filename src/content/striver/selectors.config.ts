/**
 * All Striver sheet DOM selectors live here, and nowhere else.
 *
 * IMPORTANT — read this before trusting the checkbox-detection selectors:
 *
 * takeuforward.org's A2Z sheet (https://takeuforward.org/strivers-a2z-dsa-course/...)
 * is a client-side-rendered Next.js application. Its progress checkboxes and
 * row markup are generated at runtime by JavaScript and (like most modern
 * frameworks) styled with generated/hashed class names that are not present
 * in the page's initial HTML and are not documented anywhere public.
 *
 * This project was built in a sandboxed environment with no headless-browser
 * or live-DOM-inspection access to third-party sites (only a text-extracting
 * page fetcher, which returns rendered text content, not raw HTML/class
 * names, and cannot execute the click needed to reveal post-interaction
 * markup). That means the exact class names / component structure for the
 * per-row "mark done" control could NOT be verified against the live site
 * before writing this code — and per the project's own constraint ("do not
 * invent selectors"), we do not pretend otherwise.
 *
 * What IS reliable, and what this adapter is built around instead:
 *   - Every problem row links out to its LeetCode problem via a normal
 *     <a href="https://leetcode.com/problems/<slug>/..."> anchor. That's
 *     real content, not styling, so it's stable across redesigns and is
 *     used as the ONLY way problems are identified on the page (see
 *     getProblems() in striver-adapter.ts).
 *   - The completion control is located by walking up from that anchor and
 *     searching for a checkbox-like element using a prioritized list of
 *     generic, framework-agnostic candidate selectors below, rather than one
 *     hardcoded guess. If none match, the adapter logs a diagnostic and
 *     does nothing to that row — it never guesses or clicks blindly.
 *
 * ACTION REQUIRED before relying on this in production: open the sheet in
 * Chrome, right-click a problem's checkbox -> Inspect, and confirm/update
 * `checkboxCandidates` below to match what you actually see. This is a
 * five-minute calibration step documented in README.md under
 * "DOM Selector Calibration", and it's the only thing standing between this
 * adapter and full reliability.
 */
export const STRIVER_SELECTORS = {
  supportedHostname: "takeuforward.org",
  /** Any of these substrings appearing in the path marks it a supported sheet page. */
  supportedPathIncludes: ["strivers-a2z-dsa-course", "sheet"],

  /** The one selector we're highly confident in: a real link to a LeetCode problem. */
  platformLinkSelector: 'a[href*="leetcode.com/problems/"]',

  /** How far up the DOM tree from the anchor we'll search for a row container
   * that holds a completion control, before giving up on that problem. */
  maxRowAncestorDepth: 6,

  /** Tried in order; first match wins. Kept broad on purpose since the real
   * markup is unverified — see the file header. Calibrate this list first. */
  checkboxCandidates: [
  'input.sheet-checkbox[name="complete"]',
  ],
};
