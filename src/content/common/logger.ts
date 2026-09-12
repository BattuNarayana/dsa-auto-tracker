/**
 * Centralized logger. Every log line is prefixed "[DSA Tracker]" so it's easy
 * to filter in DevTools, and everything routes through here so debug logging
 * can be flipped off in one place (via ExtensionSettings.debugLogging) without
 * hunting down console.log calls across content scripts, the service worker,
 * and the popup.
 */
const PREFIX = "[DSA Tracker]";

let debugEnabled = true;

export function setDebugLogging(enabled: boolean): void {
  debugEnabled = enabled;
}

export const logger = {
  info(message: string, ...args: unknown[]): void {
    if (debugEnabled) console.log(`${PREFIX} ${message}`, ...args);
  },
  warn(message: string, ...args: unknown[]): void {
    if (debugEnabled) console.warn(`${PREFIX} ${message}`, ...args);
  },
  error(message: string, ...args: unknown[]): void {
    // Errors are always logged, even with debug logging off, since they
    // indicate the extension failed safe and did nothing — worth knowing.
    console.error(`${PREFIX} ${message}`, ...args);
  },
};
