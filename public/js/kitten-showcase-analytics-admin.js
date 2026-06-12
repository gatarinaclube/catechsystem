(function () {
  const refreshButton = document.getElementById("refreshShowcaseAnalytics");
  const activeRoot = document.getElementById("activeShowcaseVisitors");
  const eventsRoot = document.getElementById("showcaseAnalyticsEvents");
  const eventsPager = document.getElementById("showcaseAnalyticsEventsPager");
  const recentRoot = document.getElementById("recentShowcaseVisitors");
  const topKittensRoot = document.getElementById("showcaseTopKittens");
  const topCitiesRoot = document.getElementById("showcaseTopCities");
  const leadVisitsRoot = document.getElementById("showcaseLeadVisits");
  if (!refreshButton || !activeRoot || !eventsRoot || !eventsPager || !recentRoot) return;

  let latestData = { events: [] };
  let eventPage = 0;
  const pageSize = 10;

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function empty(text) {
    return `<div class="empty">${escapeHtml(text)}</div>`;
  }

  function simpleRow(title, subtitle) {
    return `<div class="showcase-analytics-row"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></div>`;
  }

  function eventLine(event) {
    return `
      <div class="showcase-analytics-event-line">
        <strong>${escapeHtml(event.label)}</strong>
        <span>${escapeHtml(`${event.createdAtLabel}${event.details ? ` · ${event.details}` : ""}`)}</span>
      </div>
    `;
  }

  function renderEvents() {
    const events = latestData.events || [];
    const totalPages = Math.max(1, Math.ceil(events.length / pageSize));
    eventPage = Math.min(eventPage, totalPages - 1);
    const visible = events.slice(eventPage * pageSize, eventPage * pageSize + pageSize);

    eventsRoot.innerHTML = visible.length
      ? visible.map((event) => simpleRow(
        event.label,
        `${event.createdAtLabel} · ${event.place}${event.details ? ` · ${event.details}` : ""}`
      )).join("")
      : empty("Nenhuma ação registrada ainda.");

    eventsPager.innerHTML = events.length > pageSize
      ? `
        <button class="btn" type="button" data-page="prev" ${eventPage === 0 ? "disabled" : ""}>Anterior</button>
        <span>${eventPage + 1} / ${totalPages}</span>
        <button class="btn" type="button" data-page="next" ${eventPage >= totalPages - 1 ? "disabled" : ""}>Próxima</button>
      `
      : "";
  }

  function renderVisits(visits) {
    recentRoot.innerHTML = visits?.length
      ? visits.map((session) => `
        <details class="showcase-analytics-row">
          <summary>
            <strong>${escapeHtml(session.place)}</strong>
            <span>${escapeHtml(`${session.startedAtLabel} · tempo ${session.durationLabel} · ${session.browserLabel}`)}</span>
          </summary>
          <div class="showcase-analytics-details">
            <p><strong>Última atividade:</strong> ${escapeHtml(session.lastSeenAtLabel)}</p>
            ${session.referrer ? `<p><strong>Origem:</strong> ${escapeHtml(session.referrer)}</p>` : ""}
            ${session.language ? `<p><strong>Idioma:</strong> ${escapeHtml(session.language)}</p>` : ""}
            ${session.timezone ? `<p><strong>Fuso:</strong> ${escapeHtml(session.timezone)}</p>` : ""}
            ${session.screen ? `<p><strong>Tela:</strong> ${escapeHtml(session.screen)}</p>` : ""}
            ${session.coordinates ? `<p><strong>Localização:</strong> ${escapeHtml(session.coordinates)}</p>` : ""}
            <div class="showcase-analytics-list">
              ${session.events?.length ? session.events.map(eventLine).join("") : empty("Nenhuma ação registrada nesta visita.")}
            </div>
          </div>
        </details>
      `).join("")
      : empty("Nenhuma visita registrada ainda.");
  }

  function rankingRow(item, suffix) {
    return simpleRow(item.label, `${item.count} ${suffix}`);
  }

  function renderRankings(rankings = {}) {
    const whatsappTotal = document.querySelector('[data-analytics-ranking="whatsapp"]');
    const durationTotal = document.querySelector('[data-analytics-ranking="duration"]');
    const leadsTotal = document.querySelector('[data-analytics-ranking="leads"]');
    if (whatsappTotal) whatsappTotal.textContent = rankings.whatsappClicks || 0;
    if (durationTotal) durationTotal.textContent = rankings.averageDurationLabel || "0s";
    if (leadsTotal) leadsTotal.textContent = rankings.leadVisits?.length || 0;

    if (topKittensRoot) {
      topKittensRoot.innerHTML = rankings.topKittens?.length
        ? rankings.topKittens.map((item) => rankingRow(item, "visualização(ões)")).join("")
        : empty("Ainda não há visualizações de filhotes suficientes.");
    }

    if (topCitiesRoot) {
      topCitiesRoot.innerHTML = rankings.topPlaces?.length
        ? rankings.topPlaces.map((item) => rankingRow(item, "acesso(s)")).join("")
        : empty("Cidade ainda não identificada.");
    }

    if (leadVisitsRoot) {
      leadVisitsRoot.innerHTML = rankings.leadVisits?.length
        ? rankings.leadVisits.map((visit) => simpleRow(
          visit.place,
          `${visit.durationLabel} · ${visit.browserLabel} · ${visit.clicks} clique(s)`
        )).join("")
        : empty("Nenhum clique em WhatsApp registrado ainda.");
    }
  }

  function render(data) {
    latestData = data || { events: [] };
    document.querySelector('[data-analytics-total="active"]').textContent = data.totals?.active || 0;
    document.querySelector('[data-analytics-total="today"]').textContent = data.totals?.today || 0;
    document.querySelector('[data-analytics-total="total"]').textContent = data.totals?.total || 0;

    activeRoot.innerHTML = data.active?.length
      ? data.active.map((session) => simpleRow(
        `${session.browserLabel} · ${session.place}`,
        `Tempo: ${session.durationLabel} · visto às ${session.lastSeenAtLabel}`
      )).join("")
      : empty("Nenhum visitante ativo agora.");

    renderEvents();
    renderVisits(data.recent || []);
    renderRankings(data.rankings || {});
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

  eventsPager.addEventListener("click", (event) => {
    const button = event.target.closest("[data-page]");
    if (!button) return;
    eventPage += button.dataset.page === "next" ? 1 : -1;
    renderEvents();
  });

  refreshButton.addEventListener("click", refresh);
  refresh();
  window.setInterval(refresh, 30000);
})();
