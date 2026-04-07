import type { AppConfig, DiscoverySnapshot, LogEntry, ReceiverRuntimeStatus } from "../types.js";
import { e, renderPage } from "./layout.js";

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
    { key: "receiver", label: "Receiver", value: status.lifecycle },
    { key: "connection", label: "Connection", value: status.connectionState },
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
    <h2>Controls</h2>
    <div class="actions">
      <button data-control-action="start">Start receiver</button>
      <button data-control-action="stop" class="secondary">Stop</button>
      <button data-control-action="restart" class="secondary">Restart</button>
      <button data-control-action="reconnect" class="secondary">Reconnect</button>
    </div>
    <p class="hint">Controls execute immediately and refresh status without a page reload.</p>
  </section>`;
}

function renderSourceRows(snapshot: DiscoverySnapshot | null, currentSource: string | null): string {
  if (!snapshot) {
    return `<div class="source-empty">No discovery has been run yet.</div>`;
  }
  if (snapshot.error) {
    return `<div class="source-empty">Discovery error: ${e(snapshot.error)}</div>`;
  }
  if (snapshot.sources.length === 0) {
    return `<div class="source-empty">No NDI sources found.</div>`;
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
    <form id="settings-form" data-json-form="settings">
      <div class="form-grid">
        <label><span>Server host</span><input name="server.host" value="${e(config.server.host)}" /></label>
        <label><span>Server port</span><input type="number" name="server.port" value="${config.server.port}" /></label>
        <label><span>Preferred source name</span><input name="receiver.sourceName" value="${e(
          config.receiver.sourceName
        )}" /></label>
        <label><span>Scale mode</span>
          <select name="receiver.scaleMode">
            ${["contain", "cover", "stretch"]
              .map(
                (mode) =>
                  `<option value="${mode}" ${config.receiver.scaleMode === mode ? "selected" : ""}>${mode}</option>`
              )
              .join("")}
          </select>
        </label>
        <label><span>Audio enabled</span><input type="checkbox" name="receiver.audioEnabled" ${
          config.receiver.audioEnabled ? "checked" : ""
        } /></label>
        <label><span>Auto start</span><input type="checkbox" name="receiver.autoStart" ${
          config.receiver.autoStart ? "checked" : ""
        } /></label>
        <label><span>Reconnect enabled</span><input type="checkbox" name="receiver.reconnect.enabled" ${
          config.receiver.reconnect.enabled ? "checked" : ""
        } /></label>
        <label><span>Initial retry delay (ms)</span><input type="number" name="receiver.reconnect.initialDelayMs" value="${
          config.receiver.reconnect.initialDelayMs
        }" /></label>
        <label><span>Max retry delay (ms)</span><input type="number" name="receiver.reconnect.maxDelayMs" value="${
          config.receiver.reconnect.maxDelayMs
        }" /></label>
        <label><span>Backoff multiplier</span><input type="number" step="0.1" name="receiver.reconnect.backoffMultiplier" value="${
          config.receiver.reconnect.backoffMultiplier
        }" /></label>
        <label><span>Logging level</span>
          <select name="logging.level">
            ${["trace", "debug", "info", "warn", "error"]
              .map(
                (level) =>
                  `<option value="${level}" ${config.logging.level === level ? "selected" : ""}>${level}</option>`
              )
              .join("")}
          </select>
        </label>
        <label><span>JSON logs</span><input type="checkbox" name="logging.json" ${
          config.logging.json ? "checked" : ""
        } /></label>
        <label><span>Max log files</span><input type="number" name="logging.maxFiles" value="${
          config.logging.maxFiles
        }" /></label>
        <label><span>Max log size (MB)</span><input type="number" name="logging.maxSizeMb" value="${
          config.logging.maxSizeMb
        }" /></label>
        <label><span>Fullscreen</span><input type="checkbox" name="display.fullscreen" ${
          config.display.fullscreen ? "checked" : ""
        } /></label>
        <label><span>HDMI output hint</span><input name="display.hdmiOutputHint" value="${e(
          config.display.hdmiOutputHint
        )}" /></label>
        <label><span>Device name</span><input name="device.name" value="${e(config.device.name)}" /></label>
      </div>
      <div class="actions">
        <button type="submit">Save settings</button>
      </div>
      <p class="hint">When the receiver is running, changed runtime-relevant settings trigger a controlled restart.</p>
    </form>
  </section>`;
}

function renderLogBlock(entries: LogEntry[], scope: "web" | "receiver"): string {
  const lines = entries
    .map((entry) => `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.message}`)
    .join("\n");

  return `<section class="panel">
    <div class="panel-row">
      <h2>${scope === "web" ? "Web backend logs" : "Receiver logs"}</h2>
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
          <p class="hero-copy">Open the browser UI from your phone or desktop, select an NDI source and start the receiver. HDMI output is fullscreen without X11 or Wayland.</p>
        </div>
        <div class="hero-actions">
          <button data-control-action="start">Start now</button>
          <a class="button-link secondary" href="/sources">Choose source</a>
        </div>
      </section>
      ${statusGrid(status)}
      ${controls()}
      <section class="panel">
        <h2>Configured target</h2>
        <p><strong>Source:</strong> ${e(config.receiver.sourceName || "not configured")}</p>
        <p><strong>Scale mode:</strong> ${e(config.receiver.scaleMode)}</p>
        <p><strong>Audio:</strong> ${config.receiver.audioEnabled ? "enabled" : "disabled"}</p>
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
        <p class="hint">Configured source: <strong id="configured-source-label">${e(
          config.receiver.sourceName || "none"
        )}</strong></p>
        <form id="source-select-form">
          <div id="sources-table-body" class="source-list">
            ${renderSourceRows(snapshot, config.receiver.sourceName)}
          </div>
          <div class="actions">
            <button type="submit">Use selected source</button>
            <button type="submit" class="secondary" data-start-after="true">Use and start</button>
          </div>
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

export function renderAboutPage(): string {
  return renderPage(
    "About",
    "/about",
    `<section class="panel">
      <h2>About this appliance</h2>
      <p>This system exposes a small Fastify-based control plane and a native C++ NDI receiver for direct HDMI output without X11 or Wayland.</p>
      <ul class="list">
        <li>Target OS: Raspberry Pi OS Lite / Bookworm</li>
        <li>Rendering target: SDL2 KMSDRM on the console</li>
        <li>Control protocol: REST + SSE</li>
        <li>Deployment model: systemd starts the web service, the web service supervises the receiver</li>
      </ul>
    </section>`,
    { page: "about" }
  );
}
