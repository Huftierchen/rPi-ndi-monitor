import {
  bandwidthModes,
  logLevels,
  scaleModes,
  type AppConfig,
  type DiscoverySnapshot,
  type LogEntry,
  type ReceiverRuntimeStatus
} from "../types.js";
import { e, renderPage } from "./layout.js";

function humanizeState(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }

  return value.replaceAll("-", " ");
}

function scaleModeLabel(mode: AppConfig["receiver"]["scaleMode"]): string {
  switch (mode) {
    case "contain":
      return "Contain";
    case "cover":
      return "Cover";
    case "stretch":
      return "Stretch";
    default:
      return mode;
  }
}

function bandwidthModeLabel(mode: AppConfig["receiver"]["bandwidthMode"]): string {
  switch (mode) {
    case "highest":
      return "Highest";
    case "lowest":
      return "Lowest";
    default:
      return mode;
  }
}

function renderStatusValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "n/a";
  }
  if (typeof value === "boolean") {
    return value ? "enabled" : "disabled";
  }
  return String(value);
}

function statusGrid(status: ReceiverRuntimeStatus): string {
  const items: Array<{
    key: string;
    label: string;
    value: string | number | boolean | null | undefined;
  }> = [
    { key: "receiver", label: "Receiver", value: humanizeState(status.lifecycle) },
    { key: "connection", label: "Connection", value: humanizeState(status.connectionState) },
    { key: "source", label: "Source", value: status.sourceName },
    { key: "video", label: "Video", value: status.videoActive ? "active" : "idle" },
    {
      key: "audio",
      label: "Audio",
      value: status.audioEnabled ? (status.audioActive ? "active" : "enabled") : "disabled"
    },
    { key: "resolution", label: "Resolution", value: status.resolution },
    { key: "fps", label: "FPS", value: status.fps },
    { key: "uptime-s", label: "Uptime (s)", value: status.uptimeSeconds },
    { key: "last-error", label: "Last error", value: status.lastError },
    { key: "restart-count", label: "Restart count", value: status.restartCount }
  ];

  return `<section class="panel">
    <h2>Status</h2>
    <div class="grid">
      ${items
        .map(
          ({ key, label, value }) => `<div class="card">
            <span class="label">${e(label)}</span>
            <strong data-status-field="${e(key)}">${e(
              renderStatusValue(value)
            )}</strong>
          </div>`
        )
        .join("")}
    </div>
  </section>`;
}

function controls(): string {
  return `<section class="panel">
    <h2>Receiver controls</h2>
    <div class="actions">
      <button data-control-action="start">Start output</button>
      <button data-control-action="stop" class="secondary">Stop output</button>
      <button data-control-action="restart" class="secondary">Restart receiver</button>
      <button data-control-action="reconnect" class="secondary">Reconnect source</button>
    </div>
    <p class="hint">These actions are sent directly to the native receiver process. The status cards refresh without a full page reload.</p>
  </section>`;
}

function renderSourceRows(snapshot: DiscoverySnapshot | null, currentSource: string | null): string {
  if (!snapshot) {
    return `<div class="source-empty">No source discovery has been run yet.</div>`;
  }
  if (snapshot.error) {
    return `<div class="source-empty">Discovery error: ${e(snapshot.error)}</div>`;
  }
  if (snapshot.sources.length === 0) {
    return `<div class="source-empty">No NDI sources were found on the current network.</div>`;
  }

  return snapshot.sources
    .map((source) => {
      const checked = source.name === currentSource ? "checked" : "";
      return `<label class="source-option">
        <input type="radio" name="sourceName" value="${e(source.name)}" ${checked} />
        <span class="source-copy">
          <strong>${e(source.name)}</strong>
          <small>${e(source.address ?? "n/a")}</small>
        </span>
        <span class="source-meta">${e(source.groups?.join(", ") || "LAN source")}</span>
      </label>`;
    })
    .join("");
}

function settingsForm(config: AppConfig): string {
  return `<section class="panel">
    <h2>Settings</h2>
    <p class="hint">These values are persisted to the appliance YAML configuration. Runtime-relevant changes trigger a controlled receiver restart when output is active.</p>
    <form id="settings-form" data-json-form="settings">
      <div class="stack">
        <section class="form-section">
          <div class="section-heading">
            <h3>Receiver target</h3>
            <p>Select which sender this Pi should use and how the HDMI output should behave.</p>
          </div>
          <div class="form-grid">
            <label><span>Preferred source name</span><input name="receiver.sourceName" value="${e(
              config.receiver.sourceName
            )}" placeholder="Example: Studio Sender" /></label>
            <label><span>Scale mode</span>
              <select name="receiver.scaleMode">
                ${scaleModes
                  .map(
                    (mode) =>
                      `<option value="${mode}" ${config.receiver.scaleMode === mode ? "selected" : ""}>${scaleModeLabel(
                        mode
                      )}</option>`
                  )
                  .join("")}
              </select>
            </label>
            <p class="hint">Scale mode: contain keeps the whole frame visible, cover fills the display and may crop, stretch fills the display without preserving aspect ratio.</p>
            <label><span>NDI bandwidth mode</span>
              <select name="receiver.bandwidthMode">
                ${bandwidthModes
                  .map(
                    (mode) =>
                      `<option value="${mode}" ${config.receiver.bandwidthMode === mode ? "selected" : ""}>${bandwidthModeLabel(
                        mode
                      )}</option>`
                  )
                  .join("")}
              </select>
            </label>
            <p class="hint">Bandwidth mode: highest requests the full stream, lowest requests a reduced-bandwidth stream and is usually the safer choice on Raspberry Pi 4.</p>
            <label><span>Audio over HDMI</span><input type="checkbox" name="receiver.audioEnabled" ${
              config.receiver.audioEnabled ? "checked" : ""
            } /></label>
            <label><span>Start automatically after boot</span><input type="checkbox" name="receiver.autoStart" ${
              config.receiver.autoStart ? "checked" : ""
            } /></label>
          </div>
        </section>

        <section class="form-section">
          <div class="section-heading">
            <h3>Reconnect strategy</h3>
            <p>Use this when the sender is not always online or briefly disappears from the network.</p>
          </div>
          <div class="form-grid">
            <label><span>Automatic reconnect</span><input type="checkbox" name="receiver.reconnect.enabled" ${
              config.receiver.reconnect.enabled ? "checked" : ""
            } /></label>
            <label><span>Initial retry delay (ms)</span><input type="number" name="receiver.reconnect.initialDelayMs" value="${
              config.receiver.reconnect.initialDelayMs
            }" /></label>
            <label><span>Maximum retry delay (ms)</span><input type="number" name="receiver.reconnect.maxDelayMs" value="${
              config.receiver.reconnect.maxDelayMs
            }" /></label>
            <label><span>Backoff multiplier</span><input type="number" step="0.1" name="receiver.reconnect.backoffMultiplier" value="${
              config.receiver.reconnect.backoffMultiplier
            }" /></label>
          </div>
        </section>

        <section class="form-section">
          <div class="section-heading">
            <h3>Web UI and logging</h3>
            <p>These settings control how the control plane is exposed on the LAN and how much history is kept on disk.</p>
          </div>
          <div class="form-grid">
            <label><span>Server host</span><input name="server.host" value="${e(
              config.server.host
            )}" /></label>
            <label><span>Server port</span><input type="number" name="server.port" value="${
              config.server.port
            }" /></label>
            <label><span>Logging level</span>
              <select name="logging.level">
                ${logLevels
                  .map(
                    (level) =>
                      `<option value="${level}" ${config.logging.level === level ? "selected" : ""}>${level}</option>`
                  )
                  .join("")}
              </select>
            </label>
            <label><span>Write JSON logs</span><input type="checkbox" name="logging.json" ${
              config.logging.json ? "checked" : ""
            } /></label>
            <label><span>Maximum log files</span><input type="number" name="logging.maxFiles" value="${
              config.logging.maxFiles
            }" /></label>
            <label><span>Maximum log size (MB)</span><input type="number" name="logging.maxSizeMb" value="${
              config.logging.maxSizeMb
            }" /></label>
          </div>
        </section>

        <section class="form-section">
          <div class="section-heading">
            <h3>Device identity and display</h3>
            <p>These values are primarily operational metadata and appliance defaults.</p>
          </div>
          <div class="form-grid">
            <label><span>Fullscreen output</span><input type="checkbox" name="display.fullscreen" ${
              config.display.fullscreen ? "checked" : ""
            } /></label>
            <label><span>HDMI output hint</span><input name="display.hdmiOutputHint" value="${e(
              config.display.hdmiOutputHint
            )}" placeholder="auto" /></label>
            <label><span>Device name</span><input name="device.name" value="${e(
              config.device.name
            )}" /></label>
          </div>
        </section>
      </div>
      <div class="actions">
        <button type="submit">Save settings</button>
      </div>
      <p class="hint">On Raspberry Pi 4, the easiest performance wins are usually disabling HDMI audio and switching NDI bandwidth mode to lowest for heavy Full-HD senders.</p>
    </form>
  </section>`;
}

function renderLogBlock(entries: LogEntry[], scope: "web" | "receiver"): string {
  const lines = entries
    .map((entry) => `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.message}`)
    .join("\n");

  return `<section class="panel">
    <div class="panel-row">
      <h2>${scope === "web" ? "Web control plane logs" : "Native receiver logs"}</h2>
      <a class="button-link secondary" href="/api/logs/download?scope=${scope}">Download</a>
    </div>
    <pre class="log-output" data-log-scope="${scope}">${e(lines)}</pre>
  </section>`;
}

export function renderDashboardPage(status: ReceiverRuntimeStatus, config: AppConfig): string {
  return renderPage(
    "Dashboard",
    "/",
    `
      <section class="panel hero">
        <div>
          <p class="eyebrow">Configured target</p>
          <h2>${e(config.receiver.sourceName || "No source selected")}</h2>
          <p class="hero-copy">This Pi is running as a headless HDMI appliance. Choose an NDI sender, start output, and the native receiver takes over the attached display without X11 or Wayland.</p>
        </div>
        <div class="hero-actions">
          <button data-control-action="start">Start output</button>
          <a class="button-link secondary" href="/sources">Choose source</a>
        </div>
      </section>
      ${statusGrid(status)}
      ${controls()}
      <section class="panel">
        <h2>Configured target</h2>
        <div class="info-grid">
          <div class="info-card">
            <span class="label">Source</span>
            <strong>${e(config.receiver.sourceName || "not configured")}</strong>
          </div>
          <div class="info-card">
            <span class="label">Scale mode</span>
            <strong>${e(config.receiver.scaleMode)}</strong>
          </div>
          <div class="info-card">
            <span class="label">NDI bandwidth</span>
            <strong>${e(config.receiver.bandwidthMode)}</strong>
          </div>
          <div class="info-card">
            <span class="label">Audio over HDMI</span>
            <strong>${config.receiver.audioEnabled ? "enabled" : "disabled"}</strong>
          </div>
          <div class="info-card">
            <span class="label">Auto-start after boot</span>
            <strong>${config.receiver.autoStart ? "enabled" : "disabled"}</strong>
          </div>
        </div>
      </section>
    `,
    { page: "dashboard" }
  );
}

export function renderSourcesPage(
  status: ReceiverRuntimeStatus,
  snapshot: DiscoverySnapshot | null,
  config: AppConfig
): string {
  return renderPage(
    "Sources",
    "/sources",
    `
      ${statusGrid(status)}
      <section class="panel">
        <div class="panel-row">
          <h2>NDI source discovery</h2>
          <div class="actions">
            <button data-discovery-refresh>Search sources</button>
            <label class="compact"><input type="checkbox" data-auto-discovery /> Auto refresh</label>
          </div>
        </div>
        <p class="hint">Discovery runs in a short native helper process. It does not interrupt an already running HDMI output.</p>
        <p class="hint">Configured source: <strong id="configured-source-label">${e(
          config.receiver.sourceName || "none"
        )}</strong></p>
        <form id="source-select-form">
          <div id="sources-table-body" class="source-list">
            ${renderSourceRows(snapshot, config.receiver.sourceName)}
          </div>
          <div class="actions">
            <button type="submit">Use selected source</button>
            <button type="submit" class="secondary" data-start-after="true">Use and start now</button>
          </div>
          <p class="hint">Using a source stores it in the persistent YAML config. If the receiver is already running, the appliance performs a controlled restart onto the new sender.</p>
        </form>
      </section>
    `,
    { page: "sources", discovery: snapshot, config }
  );
}

export function renderSettingsPage(config: AppConfig): string {
  return renderPage("Settings", "/settings", settingsForm(config), {
    page: "settings"
  });
}

export function renderLogsPage(webLogs: LogEntry[], receiverLogs: LogEntry[]): string {
  return renderPage(
    "Logs",
    "/logs",
    `${renderLogBlock(webLogs, "web")}${renderLogBlock(receiverLogs, "receiver")}`,
    { page: "logs" }
  );
}

export function renderAboutPage(config: AppConfig): string {
  return renderPage(
    "About",
    "/about",
    `
      <section class="panel">
        <h2>About this appliance</h2>
        <p>This Raspberry Pi runs as a headless NDI HDMI appliance. The browser UI is the control plane; the actual video receive and render path lives in the native C++ receiver process.</p>
        <div class="info-grid">
          <div class="info-card">
            <span class="label">Device name</span>
            <strong>${e(config.device.name)}</strong>
          </div>
          <div class="info-card">
            <span class="label">Web UI bind</span>
            <strong>${e(config.server.host)}:${config.server.port}</strong>
          </div>
          <div class="info-card">
            <span class="label">Configured source</span>
            <strong>${e(config.receiver.sourceName || "not configured")}</strong>
          </div>
          <div class="info-card">
            <span class="label">NDI bandwidth</span>
            <strong>${e(config.receiver.bandwidthMode)}</strong>
          </div>
          <div class="info-card">
            <span class="label">Video path</span>
            <strong>SDL2 KMSDRM on HDMI</strong>
          </div>
        </div>
      </section>
      <section class="panel">
        <h2>How it works</h2>
        <ul class="list">
          <li><code>ndi-web.service</code> starts on boot and exposes the HTML UI, REST API and SSE event stream.</li>
          <li>The web service supervises the native <code>ndi-receiver</code> child process instead of using a second control-plane daemon.</li>
          <li>NDI discovery runs as a short, separate native command so a live output path is not disturbed.</li>
          <li><code>ndi-standby.service</code> keeps <code>tty1</code> in appliance mode so HDMI shows a standby screen instead of the normal Linux login prompt.</li>
        </ul>
      </section>
      <section class="panel">
        <h2>Runtime paths</h2>
        <ul class="list">
          <li>Config: <code>/etc/ndi-receiver/config.yaml</code></li>
          <li>Status: <code>/var/lib/ndi-receiver/receiver-status.json</code></li>
          <li>Web log: <code>/var/log/ndi-receiver/web.log</code></li>
          <li>Receiver log: <code>/var/log/ndi-receiver/receiver.log</code></li>
          <li>Install root: <code>/opt/ndi-monitor</code></li>
        </ul>
      </section>
      <section class="panel">
        <h2>Operating model</h2>
        <ul class="list">
          <li>Target OS: Raspberry Pi OS Lite / Bookworm-class ARM64 system</li>
          <li>No desktop session, no X11 and no Wayland required</li>
          <li>Designed for one active NDI stream at a time</li>
          <li>Best controlled from a phone or desktop browser on the same LAN</li>
        </ul>
      </section>
    `,
    { page: "about" }
  );
}
