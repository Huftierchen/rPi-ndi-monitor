(function () {
  const initialDataNode = document.getElementById("initial-data");
  const flashNode = document.getElementById("flash");
  const initialData = initialDataNode ? JSON.parse(initialDataNode.textContent || "{}") : {};
  let sourcePollInterval = null;
  let sseFallbackShown = false;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function humanizeState(value) {
    return value ? String(value).replaceAll("-", " ") : "n/a";
  }

  function showFlash(message, isError) {
    if (!flashNode) return;
    flashNode.hidden = false;
    flashNode.className = isError ? "flash error" : "flash";
    flashNode.textContent = message;
    setTimeout(() => {
      if (flashNode.textContent === message) {
        flashNode.hidden = true;
      }
    }, 4000);
  }

  async function request(url, options) {
    const response = await fetch(url, {
      headers: { "content-type": "application/json" },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Request failed with ${response.status}`);
    }
    return payload;
  }

  function setByPath(target, path, value) {
    const parts = path.split(".");
    let cursor = target;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      if (index === parts.length - 1) {
        cursor[part] = value;
      } else {
        cursor[part] ||= {};
        cursor = cursor[part];
      }
    }
  }

  function serializeForm(form) {
    const result = {};
    const elements = Array.from(form.elements).filter((element) => element.name);
    for (const element of elements) {
      if (element instanceof HTMLInputElement && element.type === "radio" && !element.checked) {
        continue;
      }

      let value;
      if (element instanceof HTMLInputElement && element.type === "checkbox") {
        value = element.checked;
      } else if (element instanceof HTMLInputElement && element.type === "number") {
        value = Number(element.value);
      } else {
        value = element.value;
      }

      setByPath(result, element.name, value);
    }
    return result;
  }

  function updateStatusFields(status) {
    const map = {
      "receiver": humanizeState(status.lifecycle),
      "connection": humanizeState(status.connectionState),
      "source": status.sourceName || "n/a",
      "video": status.videoActive ? "active" : "idle",
      "audio": status.audioEnabled ? (status.audioActive ? "active" : "enabled") : "disabled",
      "resolution": status.resolution || "n/a",
      "fps": status.fps ?? "n/a",
      "uptime-s": status.uptimeSeconds ?? "n/a",
      "last-error": status.lastError || "n/a",
      "restart-count": status.restartCount
    };

    for (const [key, value] of Object.entries(map)) {
      const node = document.querySelector(`[data-status-field="${key}"]`);
      if (node) {
        node.textContent = String(value);
      }
    }
  }

  async function refreshStatus() {
    const result = await request("/api/status");
    updateStatusFields(result.data);
    return result.data;
  }

  function setButtonBusy(button, isBusy, label) {
    if (!button) return;
    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = button.textContent || "";
    }
    button.disabled = isBusy;
    button.textContent = isBusy ? label : button.dataset.originalLabel;
  }

  function renderDiscovery(snapshot) {
    const tableBody = document.getElementById("sources-table-body");
    if (!tableBody) return;

    const selected = document.querySelector('input[name="sourceName"]:checked');
    const selectedName = selected ? selected.value : "";
    if (!snapshot) {
      tableBody.innerHTML = `<div class="source-empty">No source discovery has been run yet.</div>`;
      return;
    }
    if (snapshot.error) {
      tableBody.innerHTML = `<div class="source-empty">Discovery error: ${escapeHtml(snapshot.error)}</div>`;
      return;
    }
    if (!snapshot.sources.length) {
      tableBody.innerHTML = `<div class="source-empty">No NDI sources were found on the current network.</div>`;
      return;
    }

    tableBody.innerHTML = snapshot.sources
      .map((source) => `
        <label class="source-option">
          <input type="radio" name="sourceName" value="${escapeHtml(source.name)}" ${
            source.name === selectedName ? "checked" : ""
          } />
          <span class="source-copy">
            <strong>${escapeHtml(source.name)}</strong>
            <small>${escapeHtml(source.address || "n/a")}</small>
          </span>
          <span class="source-meta">${escapeHtml((source.groups || []).join(", ") || "LAN source")}</span>
        </label>
      `)
      .join("");
  }

  function appendLog(entry) {
    const node = document.querySelector(`[data-log-scope="${entry.scope}"]`);
    if (!node) return;
    const line = `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.message}`;
    node.textContent = node.textContent ? `${node.textContent}\n${line}` : line;
    node.scrollTop = node.scrollHeight;
  }

  document.querySelectorAll("[data-control-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.getAttribute("data-control-action");
      setButtonBusy(button, true, "Working...");
      try {
        await request(`/api/control/${action}`, { method: "POST", body: "{}" });
        await refreshStatus();
        const actionLabels = {
          start: "Receiver start requested.",
          stop: "Receiver stop requested.",
          restart: "Receiver restart requested.",
          reconnect: "Receiver reconnect requested."
        };
        showFlash(actionLabels[action] || `Receiver action executed: ${action}`, false);
      } catch (error) {
        showFlash(String(error.message || error), true);
      } finally {
        setButtonBusy(button, false);
      }
    });
  });

  const discoveryButton = document.querySelector("[data-discovery-refresh]");
  if (discoveryButton) {
    discoveryButton.addEventListener("click", async () => {
      setButtonBusy(discoveryButton, true, "Searching...");
      try {
        const result = await request("/api/discovery", { method: "POST", body: "{}" });
        renderDiscovery(result.data);
        showFlash("Source discovery finished.", false);
      } catch (error) {
        showFlash(String(error.message || error), true);
      } finally {
        setButtonBusy(discoveryButton, false);
      }
    });
  }

  const sourceForm = document.getElementById("source-select-form");
  if (sourceForm) {
    sourceForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const selected = sourceForm.querySelector('input[name="sourceName"]:checked');
      const submitter = event.submitter;
      if (!selected) {
        showFlash("Select an NDI source first.", true);
        return;
      }

      setButtonBusy(submitter, true, "Applying...");
      try {
        await request("/api/control/switch-source", {
          method: "POST",
          body: JSON.stringify({ sourceName: selected.value })
        });
        const configuredSourceLabel = document.getElementById("configured-source-label");
        if (configuredSourceLabel) {
          configuredSourceLabel.textContent = selected.value;
        }
        await refreshStatus();
        if (submitter && submitter.dataset.startAfter === "true") {
          await request("/api/control/start", { method: "POST", body: "{}" });
          await refreshStatus();
          showFlash(`Configured source updated and output start requested: ${selected.value}`, false);
          return;
        }
        showFlash(`Configured source updated: ${selected.value}`, false);
      } catch (error) {
        showFlash(String(error.message || error), true);
      } finally {
        setButtonBusy(submitter, false);
      }
    });
  }

  const settingsForm = document.getElementById("settings-form");
  if (settingsForm) {
    settingsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      setButtonBusy(submitter, true, "Saving...");
      try {
        await request("/api/settings", {
          method: "PUT",
          body: JSON.stringify(serializeForm(settingsForm))
        });
        await refreshStatus();
        showFlash("Settings saved. Runtime changes are applied immediately or on the next start.", false);
      } catch (error) {
        showFlash(String(error.message || error), true);
      } finally {
        setButtonBusy(submitter, false);
      }
    });
  }

  const autoDiscoveryToggle = document.querySelector("[data-auto-discovery]");
  if (autoDiscoveryToggle) {
    autoDiscoveryToggle.addEventListener("change", async () => {
      if (autoDiscoveryToggle.checked) {
        sourcePollInterval = setInterval(async () => {
          try {
            const result = await request("/api/discovery", { method: "POST", body: "{}" });
            renderDiscovery(result.data);
          } catch (error) {
            showFlash(String(error.message || error), true);
          }
        }, 10000);
      } else if (sourcePollInterval) {
        clearInterval(sourcePollInterval);
        sourcePollInterval = null;
      }
    });
  }

  if (initialData.discovery) {
    renderDiscovery(initialData.discovery);
  } else if (initialData.page === "sources") {
    void request("/api/discovery", { method: "POST", body: "{}" })
      .then((result) => renderDiscovery(result.data))
      .catch((error) => showFlash(String(error.message || error), true));
  }

  const events = new EventSource("/api/events");
  events.onmessage = (message) => {
    const event = JSON.parse(message.data);
    if (event.type === "status") {
      updateStatusFields(event.payload);
    }
    if (event.type === "log") {
      appendLog(event.payload);
    }
    if (event.type === "discovery") {
      renderDiscovery(event.payload);
    }
  };
  events.onerror = () => {
    if (!sseFallbackShown) {
      sseFallbackShown = true;
      showFlash("Live updates were interrupted. Falling back to periodic status refresh.", true);
    }
  };

  window.setInterval(() => {
    void refreshStatus().catch(() => {});
  }, 5000);
})();
