(function () {
  const refreshButton = document.getElementById("refreshShowcaseAnalytics");
  const activeRoot = document.getElementById("activeShowcaseVisitors");
  const eventsRoot = document.getElementById("showcaseAnalyticsEvents");
  const recentRoot = document.getElementById("recentShowcaseVisitors");
  if (!refreshButton || !activeRoot || !eventsRoot || !recentRoot) return;

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function row(title, subtitle) {
    return `<div class="showcase-analytics-row"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></div>`;
  }

  function empty(text) {
    return `<div class="empty">${escapeHtml(text)}</div>`;
  }

  function render(data) {
    document.querySelector('[data-analytics-total="active"]').textContent = data.totals?.active || 0;
    document.querySelector('[data-analytics-total="today"]').textContent = data.totals?.today || 0;
    document.querySelector('[data-analytics-total="total"]').textContent = data.totals?.total || 0;

    activeRoot.innerHTML = data.active?.length
      ? data.active.map((session) => row(
        `${session.browserLabel} · ${session.place}`,
        `Tempo: ${session.durationLabel} · visto às ${session.lastSeenAtLabel}`
      )).join("")
      : empty("Nenhum visitante ativo agora.");

    eventsRoot.innerHTML = data.events?.length
      ? data.events.map((event) => row(
        event.label,
        `${event.createdAtLabel} · ${event.place}${event.details ? ` · ${event.details}` : ""}`
      )).join("")
      : empty("Nenhuma ação registrada ainda.");

    recentRoot.innerHTML = data.recent?.length
      ? data.recent.map((session) => row(
        session.place,
        `${session.startedAtLabel} · tempo ${session.durationLabel} · ${session.browserLabel}`
      )).join("")
      : empty("Nenhuma visita registrada ainda.");
  }

  async function refresh() {
    refreshButton.disabled = true;
    try {
      const response = await fetch("/admin/vitrine-filhotes/analytics", {
        headers: { Accept: "application/json" },
      });
      if (response.ok) render(await response.json());
    } finally {
      refreshButton.disabled = false;
    }
  }

  refreshButton.addEventListener("click", refresh);
  window.setInterval(refresh, 30000);
})();
