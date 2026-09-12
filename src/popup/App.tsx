import { useEffect, useState } from "react";
import type { CompletionRecord, ExtensionSettings } from "../core/types";
import { DEFAULT_SETTINGS } from "../core/types";
import type { ExtensionMessage, ExtensionMessageResponse } from "../core/messages";

async function send<T extends ExtensionMessageResponse>(
  message: ExtensionMessage
): Promise<T | undefined> {
  try {
    return (await chrome.runtime.sendMessage(message)) as T | undefined;
  } catch {
    return undefined;
  }
}

export function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [activity, setActivity] = useState<CompletionRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const settingsResponse = await send<
      Extract<ExtensionMessageResponse, { type: "SETTINGS_RESPONSE" }>
    >({ type: "GET_SETTINGS" });
    if (settingsResponse) setSettings(settingsResponse.settings);

    const activityResponse = await send<
      Extract<ExtensionMessageResponse, { type: "RECENT_ACTIVITY_RESPONSE" }>
    >({ type: "GET_RECENT_ACTIVITY", limit: 10 });
    if (activityResponse) setActivity(activityResponse.items);

    setLoaded(true);
  }

  async function toggleEnabled() {
    const next = !settings.enabled;
    setSettings((s) => ({ ...s, enabled: next })); // optimistic
    await send({ type: "SET_ENABLED", enabled: next });
  }

  return (
    <div className="popup">
      <h1 className="popup__header">DSA Auto Tracker</h1>

      <div className="status-row">
        <span className={`status-dot ${settings.enabled ? "status-dot--on" : "status-dot--off"}`} />
        <span className="status-row__label">
          {settings.enabled ? "Extension Active" : "Extension Disabled"}
        </span>
        <button
          className={`toggle ${settings.enabled ? "toggle--on" : "toggle--off"}`}
          onClick={toggleEnabled}
          aria-label="Toggle extension enabled"
          disabled={!loaded}
        >
          <span className="toggle__knob" />
        </button>
      </div>

      <div className="section">
        <p className="section__title">Supported sheets</p>
        <div className="support-row">
          <span>Striver</span>
          <span className="check">✓</span>
        </div>
      </div>

      <div className="section">
        <p className="section__title">Supported platform</p>
        <div className="support-row">
          <span>LeetCode</span>
          <span className="check">✓</span>
        </div>
      </div>

      <div className="section">
        <p className="section__title">Recent activity</p>
        {activity.length === 0 ? (
          <p className="empty-state">Nothing marked done yet.</p>
        ) : (
          <ul className="activity-list">
            {activity.map((item) => (
              <li className="activity-item" key={item.sheetProblemId}>
                <span className="activity-item__check">✓</span>
                <span>{item.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
