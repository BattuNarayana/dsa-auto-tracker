export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Debounce so a burst of MutationObserver callbacks (typical in React/Next.js
 * apps re-rendering lists) collapses into a single reconciliation pass instead
 * of running the check on every single DOM tick. This is what keeps the
 * observers cheap — see requirement on avoiding aggressive polling/observing. */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

/** Watches for SPA-style URL changes (pushState/replaceState/popstate) that a
 * plain MutationObserver on the body won't reliably surface, since the URL
 * can change without any DOM mutation being visible yet. Cheap: a single
 * listener set, no polling loop. */
export function onUrlChange(callback: (url: string) => void): void {
  let lastUrl = location.href;

  const check = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      callback(lastUrl);
    }
  };

  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = ((...args: Parameters<History["pushState"]>) => {
    originalPushState(...args);
    check();
  }) as History["pushState"];

  history.replaceState = ((...args: Parameters<History["replaceState"]>) => {
    originalReplaceState(...args);
    check();
  }) as History["replaceState"];

  window.addEventListener("popstate", check);
}
