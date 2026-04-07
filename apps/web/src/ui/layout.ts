function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function serializeInitialData(value: Record<string, unknown> | undefined): string {
  return JSON.stringify(value ?? {})
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

export function renderPage(
  title: string,
  activePath: string,
  content: string,
  initialData?: Record<string, unknown>
): string {
  const navItems = [
    { href: "/", label: "Dashboard" },
    { href: "/sources", label: "Sources" },
    { href: "/settings", label: "Settings" },
    { href: "/logs", label: "Logs" },
    { href: "/about", label: "About" }
  ];

  const nav = navItems
    .map(({ href, label }) => {
      const className = href === activePath ? "nav-link active" : "nav-link";
      return `<a class="${className}" href="${href}">${label}</a>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} | NDI Monitor</title>
    <link rel="stylesheet" href="/assets/style.css" />
  </head>
  <body>
    <div class="shell">
      <header class="topbar">
        <div>
          <h1>NDI Monitor</h1>
          <p>Headless HDMI NDI appliance for Raspberry Pi 5</p>
        </div>
        <nav class="nav">${nav}</nav>
      </header>
      <main class="content">
        <div id="flash" class="flash" hidden></div>
        ${content}
      </main>
    </div>
    <script id="initial-data" type="application/json">${serializeInitialData(initialData)}</script>
    <script src="/assets/app.js" defer></script>
  </body>
</html>`;
}

export function e(value: string | null | undefined): string {
  return escapeHtml(value ?? "");
}
