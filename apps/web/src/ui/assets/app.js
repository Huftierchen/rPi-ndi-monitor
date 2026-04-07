(function () {
  const initialDataNode = document.getElementById("initial-data");
  const flashNode = document.getElementById("flash");
  const initialData = initialDataNode ? JSON.parse(initialDataNode.textContent || "{}") : {};

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
      "receiver": status.lifecycle,
      "connection": status.connectionState,
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

  function renderDiscovery(snapshot) {
    const tableBody = document.getElementById("sources-table-body");
    if (!tableBody) return;

    const selected = document.querySelector('input[name="sourceName"]:checked');
    const selectedName = selected ? selected.value : "";

    if (!snapshot) {
      tableBody.innerHTML = `<tr><td colspan="4">No discovery has been run yet.</td></tr>`;
      return;
    }
    if (snapshot.error) {
      tableBody.innerHTML = `<tr><td colspan="4">Discovery error: ${snapshot.error}</td></tr>`;
      return;
    }
    if (!snapshot.sources.length) {
      tableBody.innerHTML = `<tr><td colspan="4">No NDI sources found.</td></tr>`;
      return;
    }

    tableBody.innerHTML = snapshot.sources
      .map((source) => `
        <tr>
          <td><input type="radio" name="sourceName" value="${source.name}" ${
            source.name === selectedName ? "checked" : ""
          } /></td>
          <td>${source.name}</td>
          <td>${source.address || "n/a"}</td>
          <td>${(source.groups || []).join(", ") || "n/a"}</td>
        </tr>
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
      try {
        const action = button.getAttribute("data-control-action");
        await request(`/api/control/${action}`, { method: "POST", body: "{}" });
        showFlash(`Receiver action executed: ${action}`, false);
      } catch (error) {
        showFlash(String(error.message || error), true);
      }
    });
  });

  const discoveryButton = document.querySelector("[data-discovery-refresh]");
  if (discoveryButton) {
    discoveryButton.addEventListener("click", async () => {
      try {
        const result = await request("/api/discovery", { method: "POST", body: "{}" });
        renderDiscovery(result.data);
        showFlash("Discovery completed", false);
      } catch (error) {
        showFlash(String(error.message || error), true);
      }
    });
  }

  const sourceForm = document.getElementById("source-select-form");
  if (sourceForm) {
    sourceForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const selected = sourceForm.querySelector('input[name="sourceName"]:checked');
      if (!selected) {
        showFlash("Select a source first", true);
        return;
      }

      try {
        await request("/api/control/switch-source", {
          method: "POST",
          body: JSON.stringify({ sourceName: selected.value })
        });
        showFlash(`Configured source: ${selected.value}`, false);
      } catch (error) {
        showFlash(String(error.message || error), true);
      }
    });
  }

  const settingsForm = document.getElementById("settings-form");
  if (settingsForm) {
    settingsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await request("/api/settings", {
          method: "PUT",
          body: JSON.stringify(serializeForm(settingsForm))
        });
        showFlash("Settings saved", false);
      } catch (error) {
        showFlash(String(error.message || error), true);
      }
    });
  }

  const autoDiscoveryToggle = document.querySelector("[data-auto-discovery]");
  let discoveryInterval = null;
  if (autoDiscoveryToggle) {
    autoDiscoveryToggle.addEventListener("change", async () => {
      if (autoDiscoveryToggle.checked) {
        discoveryInterval = setInterval(async () => {
          try {
            const result = await request("/api/discovery", { method: "POST", body: "{}" });
            renderDiscovery(result.data);
          } catch (error) {
            showFlash(String(error.message || error), true);
          }
        }, 10000);
      } else if (discoveryInterval) {
        clearInterval(discoveryInterval);
      }
    });
  }

  if (initialData.discovery) {
    renderDiscovery(initialData.discovery);
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
})();
