import { useEffect, useState } from "react";

import type {
  AccountBinding,
  CompletionRecord,
  ExtensionSettings,
} from "../core/types";

import {
  DEFAULT_SETTINGS,
} from "../core/types";

import type {
  ExtensionMessage,
  ExtensionMessageResponse,
} from "../core/messages";

async function send<
  T extends ExtensionMessageResponse
>(
  message: ExtensionMessage
): Promise<T | undefined> {
  try {
    return (
      (await chrome.runtime.sendMessage(
        message
      )) as T | undefined
    );
  } catch {
    return undefined;
  }
}

export function App() {
  const [settings, setSettings] =
    useState<ExtensionSettings>(
      DEFAULT_SETTINGS
    );

  const [binding, setBinding] =
    useState<AccountBinding | null>(
      null
    );

  const [
    leetcodeUsername,
    setLeetcodeUsername,
  ] = useState("");

  const [
    striverUsername,
    setStriverUsername,
  ] = useState("");

  const [activity, setActivity] =
    useState<CompletionRecord[]>(
      []
    );

  const [loaded, setLoaded] =
    useState(false);

  const [
    savingBinding,
    setSavingBinding,
  ] = useState(false);

  const [
    bindingMessage,
    setBindingMessage,
  ] = useState("");

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const settingsResponse =
      await send<
        Extract<
          ExtensionMessageResponse,
          {
            type:
              "SETTINGS_RESPONSE";
          }
        >
      >({
        type:
          "GET_SETTINGS",
      });

    if (settingsResponse) {
      setSettings(
        settingsResponse.settings
      );
    }

    const bindingResponse =
      await send<
        Extract<
          ExtensionMessageResponse,
          {
            type:
              "ACCOUNT_BINDING_RESPONSE";
          }
        >
      >({
        type:
          "GET_ACCOUNT_BINDING",
      });

    if (bindingResponse) {
      setBinding(
        bindingResponse.binding
      );

      setLeetcodeUsername(
        bindingResponse.binding
          ?.leetcodeUsername ?? ""
      );

      setStriverUsername(
        bindingResponse.binding
          ?.striverUsername ?? ""
      );
    }

    const activityResponse =
      await send<
        Extract<
          ExtensionMessageResponse,
          {
            type:
              "RECENT_ACTIVITY_RESPONSE";
          }
        >
      >({
        type:
          "GET_RECENT_ACTIVITY",
        limit: 10,
      });

    if (activityResponse) {
      setActivity(
        activityResponse.items
      );
    }

    setLoaded(true);
  }

  async function toggleEnabled() {
    const next =
      !settings.enabled;

    setSettings((current) => ({
      ...current,
      enabled: next,
    }));

    await send({
      type: "SET_ENABLED",
      enabled: next,
    });
  }

  async function saveBinding() {
    const lc = leetcodeUsername.trim();
    const striver = striverUsername.trim();

    if (!lc || !striver) {
      setBindingMessage("Enter both usernames.");
      return;
    }

    setSavingBinding(true);
    setBindingMessage(
      "Verifying both accounts..."
    );

    const nextBinding: AccountBinding = {
      leetcodeUsername: lc,
      striverUsername: striver,
      boundAt: Date.now(),
    };

    const response = await send({
      type: "SET_ACCOUNT_BINDING",
      binding: nextBinding,
    });

    setSavingBinding(false);

    if (!response) {
      setBindingMessage(
        "Could not contact the extension. Try again."
      );
      return;
    }

    if (response.type === "ERROR") {
      setBindingMessage(response.message);
      return;
    }

    if (response.type !== "ACK") {
      setBindingMessage(
        "Account verification failed. Try again."
      );
      return;
    }

    setBinding(nextBinding);

    setBindingMessage(
      "Both accounts verified and binding saved."
    );

    await refresh();
  }

  async function clearBinding() {
    setSavingBinding(true);
    setBindingMessage("");

    const response =
      await send({
        type:
          "SET_ACCOUNT_BINDING",
        binding: null,
      });

    setSavingBinding(false);

    if (
      !response ||
      response.type !== "ACK"
    ) {
      setBindingMessage(
        "Could not clear the binding. Try again."
      );

      return;
    }

    setBinding(null);
    setLeetcodeUsername("");
    setStriverUsername("");
    setActivity([]);

    setBindingMessage(
      "Account binding cleared."
    );
  }

  return (
    <div className="popup">
      <h1 className="popup__header">
        DSA Auto Tracker
      </h1>

      <div className="status-row">
        <span
          className={`status-dot ${
            settings.enabled
              ? "status-dot--on"
              : "status-dot--off"
          }`}
        />

        <span className="status-row__label">
          {settings.enabled
            ? "Extension Active"
            : "Extension Disabled"}
        </span>

        <button
          className={`toggle ${
            settings.enabled
              ? "toggle--on"
              : "toggle--off"
          }`}
          onClick={
            toggleEnabled
          }
          aria-label="Toggle extension enabled"
          disabled={!loaded}
        >
          <span className="toggle__knob" />
        </button>
      </div>

      <div className="section binding-section">
        <p className="section__title">
          Account binding
        </p>

        <label
          className="field-label"
          htmlFor="leetcode-username"
        >
          LeetCode username
        </label>

        <input
          id="leetcode-username"
          className="text-input"
          value={
            leetcodeUsername
          }
          onChange={(event) =>
            setLeetcodeUsername(
              event.target.value
            )
          }
          placeholder="e.g. Battu_Narayana"
          disabled={
            savingBinding
          }
          autoComplete="off"
        />

        <label
          className="field-label"
          htmlFor="striver-username"
        >
          Striver username
        </label>

        <input
          id="striver-username"
          className="text-input"
          value={
            striverUsername
          }
          onChange={(event) =>
            setStriverUsername(
              event.target.value
            )
          }
          placeholder="Your Striver username"
          disabled={
            savingBinding
          }
          autoComplete="off"
        />

        <p className="binding-help">
          Sync is authorized only when the
          current LeetCode account matches the
          bound LeetCode username.
        </p>

        <div className="binding-actions">
          <button
            className="primary-button"
            onClick={
              saveBinding
            }
            disabled={
              savingBinding ||
              !loaded
            }
          >
            {savingBinding
              ? "Saving..."
              : binding
                ? "Update Binding"
                : "Bind Accounts"}
          </button>

          {binding && (
            <button
              className="secondary-button"
              onClick={
                clearBinding
              }
              disabled={
                savingBinding
              }
            >
              Unbind
            </button>
          )}
        </div>

        {binding && (
          <div className="binding-status">
            <span className="binding-status__icon">
              ✓
            </span>

            <div>
              <strong>
                Account Verified
              </strong>

              <span>
                {binding.leetcodeUsername}
                {" ↔ "}
                {binding.striverUsername}
              </span>
            </div>
          </div>
        )}

        {bindingMessage && (
          <p className="binding-message">
            {bindingMessage}
          </p>
        )}
      </div>

      <div className="section">
        <p className="section__title">
          Supported sheets
        </p>

        <div className="support-row">
          <span>Striver</span>
          <span className="check">
            ✓
          </span>
        </div>
      </div>

      <div className="section">
        <p className="section__title">
          Supported platform
        </p>

        <div className="support-row">
          <span>LeetCode</span>
          <span className="check">
            ✓
          </span>
        </div>
      </div>

      <div className="section">
        <p className="section__title">
          Recent activity
        </p>

        {activity.length === 0 ? (
          <p className="empty-state">
            {binding
              ? "Nothing marked done yet."
              : "Bind your accounts to start tracking."}
          </p>
        ) : (
          <ul className="activity-list">
            {activity.map(
              (item) => (
                <li
                  className="activity-item"
                  key={
                    item.sheetProblemId
                  }
                >
                  <span className="activity-item__check">
                    ✓
                  </span>

                  <span>
                    {item.title}
                  </span>
                </li>
              )
            )}
          </ul>
        )}
      </div>
    </div>
  );
}