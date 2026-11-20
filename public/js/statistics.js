(() => {
  const data = JSON.parse(document.getElementById("statistics-data").textContent);
  const ns = "http://www.w3.org/2000/svg";
  const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
  const series = {
    kittens: [["maleCount", "Machos", "#2563eb"], ["femaleCount", "Fêmeas", "#a855f7"], ["unknownCount", "Sem sexo informado", "#64748b"]],
    "monthly-kittens": [["kittensPerMonth", "Filhotes / mês", "#2563eb"]],
    deaths: [["deaths", "Óbitos registrados", "#d97706"]],
    mortality: [["mortalityPercent", "Mortalidade", "#dc2626"]],
    finance: [["revenueCents", "Receita", "#059669"], ["expenseCents", "Despesa", "#dc2626"]],
    "monthly-finance": [["revenuePerMonthCents", "Receita / mês", "#059669"], ["expensePerMonthCents", "Despesa / mês", "#dc2626"]],
    "per-kitten": [["revenuePerKittenCents", "Receita / filhote", "#059669"], ["costPerKittenCents", "Custo / filhote", "#dc2626"]],
  };
  function element(tag, attributes = {}, text = "") {
    const node = document.createElementNS(ns, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    node.textContent = text;
    return node;
  }
  document.querySelectorAll("[data-chart]").forEach((container) => {
    const key = container.dataset.chart;
    const entries = series[key];
    const money = ["finance", "monthly-finance", "per-kitten"].includes(key);
    const percent = key === "mortality";
    const values = data.rows.flatMap((row) => entries.map(([field]) => row[field])).filter((value) => value !== null);
    if (!values.length) {
      const empty = document.createElement("p");
      empty.textContent = "Sem dados para este gráfico. Consulte a tabela para os demais indicadores.";
      container.appendChild(empty);
      return;
    }
    const width = Math.max(480, data.rows.length * Math.max(70, entries.length * 22) + 90);
    const height = 270, left = 72, top = 20, bottom = 225;
    const plotWidth = width - left - 15;
    const max = Math.max(1, ...values);
    const scaleMax = percent ? 100 : max * 1.12;
    const svg = element("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": container.getAttribute("aria-label") });
    svg.style.minWidth = `${width}px`;
    svg.appendChild(element("title", {}, container.getAttribute("aria-label")));
    svg.appendChild(element("desc", {}, "Valores detalhados disponíveis na tabela Valores usados nos gráficos. Passe o mouse ou use Tab nas barras para consultar os valores."));
    for (let tick = 0; tick <= 4; tick++) {
      const value = scaleMax * tick / 4;
      const y = bottom - (bottom - top) * tick / 4;
      svg.appendChild(element("line", { x1: left, x2: width - 15, y1: y, y2: y, stroke: "#e2e8f0" }));
      svg.appendChild(element("text", { x: left - 8, y: y + 4, "text-anchor": "end" }, (money ? "R$ " : "") + compact.format(money ? value / 100 : value) + (percent ? "%" : "")));
    }
    const groupWidth = plotWidth / Math.max(data.rows.length, 1);
    const barWidth = Math.min(28, groupWidth * 0.75 / entries.length);
    data.rows.forEach((row, rowIndex) => {
      const center = left + groupWidth * (rowIndex + 0.5);
      svg.appendChild(element("text", { x: center, y: bottom + 20, "text-anchor": "middle" }, String(row.year)));
      entries.forEach(([field, label, color], index) => {
        const value = row[field];
        const x = center + (index - entries.length / 2) * barWidth;
        if (value === null || (row.source === "history" && ["maleCount", "femaleCount"].includes(field))) return;
        const barHeight = value / scaleMax * (bottom - top);
        const tooltip = `${row.year} · ${label}: ${money ? currency.format(value / 100) : integer.format(value) + (percent ? "%" : "")}${row.source === "history" ? " · Histórico manual" : ""}`;
        const bar = element("rect", { x: x + 2, y: bottom - Math.max(barHeight, 2), width: Math.max(1, barWidth - 4), height: Math.max(barHeight, 2), fill: color, rx: 2, tabindex: "0", "aria-label": tooltip });
        bar.appendChild(element("title", {}, tooltip));
        svg.appendChild(bar);
      });
    });
    container.appendChild(svg);
    const legend = document.createElement("div");
    legend.className = "statistics-legend";
    entries.forEach(([, label, color]) => {
      const item = document.createElement("span");
      const swatch = document.createElement("i");
      swatch.style.backgroundColor = color;
      item.append(swatch, document.createTextNode(label));
      legend.appendChild(item);
    });
    container.appendChild(legend);
  });

  const form = document.getElementById("history-form");
  document.getElementById("open-history").addEventListener("click", () => { form.open = true; });
  document.querySelectorAll("[data-edit-history]").forEach((button) => {
    button.addEventListener("click", () => {
      const entry = data.history.find((row) => row.id === Number(button.dataset.editHistory));
      if (!entry) return;
      form.open = true;
      for (const field of ["year", "litterCount", "kittenCount", "maleDeathCount", "femaleDeathCount"]) {
        document.getElementById(`history-${field}`).value = entry[field] ?? "";
      }
      document.getElementById("history-revenue").value = (entry.revenueCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
      document.getElementById("history-expense").value = (entry.expenseCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("history-year").focus({ preventScroll: true });
    });
  });
  document.querySelectorAll("[data-delete-history]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      if (!window.confirm("Remover estes totais manuais? Os gráficos voltarão a usar os registros do sistema para esse ano.")) event.preventDefault();
    });
  });
})();
