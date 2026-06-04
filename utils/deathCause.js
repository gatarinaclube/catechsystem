const DEATH_CAUSE_OPTIONS = ["Castração", "Trauma", "Causa Desconhecida", "Outro"];
const DEATH_HISTORY_SECTION = "OTHER";
const DEATH_HISTORY_SOURCE = "death-status";

function cleanDeathText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDeathCause(value) {
  const text = cleanDeathText(value);
  return DEATH_CAUSE_OPTIONS.includes(text) ? text : "";
}

function parseDeathCauseData(body, deceased) {
  if (!deceased) {
    return {
      deathCause: null,
      deathCauseDescription: null,
    };
  }

  const deathCause = normalizeDeathCause(body.deathCause);
  const deathCauseDescription = cleanDeathText(body.deathCauseDescription) || null;

  if (!deathCause) {
    throw new Error("Selecione a causa do óbito.");
  }

  if (["Outro", "Causa Desconhecida"].includes(deathCause) && !deathCauseDescription) {
    throw new Error("Descreva a causa do óbito.");
  }

  return {
    deathCause,
    deathCauseDescription,
  };
}

function deathCauseSummary(catOrData) {
  const cause = cleanDeathText(catOrData?.deathCause);
  const description = cleanDeathText(catOrData?.deathCauseDescription);
  if (!cause && !description) return "";
  return [cause, description].filter(Boolean).join(" - ");
}

async function syncDeathHistoryEntry(prisma, catId, data) {
  const isDeceased = data.deceased === true;
  const entries = await prisma.catHistoryEntry.findMany({
    where: { catId, section: DEATH_HISTORY_SECTION },
    orderBy: { sortOrder: "asc" },
  });
  const existing = entries.find((entry) => {
    try {
      const payload = entry.payloadJson ? JSON.parse(entry.payloadJson) : {};
      return payload.source === DEATH_HISTORY_SOURCE;
    } catch {
      return false;
    }
  });

  if (!isDeceased) {
    if (existing) await prisma.catHistoryEntry.delete({ where: { id: existing.id } });
    return;
  }

  const summary = deathCauseSummary(data);
  const previousPayload = (() => {
    try {
      return existing?.payloadJson ? JSON.parse(existing.payloadJson) : {};
    } catch {
      return {};
    }
  })();
  const payload = {
    source: DEATH_HISTORY_SOURCE,
    date: previousPayload.date || new Date().toISOString().slice(0, 10),
    notes: summary ? `Óbito. Causa: ${summary}.` : "Óbito registrado.",
    deathCause: data.deathCause || "",
    deathCauseDescription: data.deathCauseDescription || "",
  };

  if (existing) {
    await prisma.catHistoryEntry.update({
      where: { id: existing.id },
      data: { payloadJson: JSON.stringify(payload) },
    });
    return;
  }

  await prisma.catHistoryEntry.create({
    data: {
      catId,
      section: DEATH_HISTORY_SECTION,
      sortOrder: entries.length,
      payloadJson: JSON.stringify(payload),
    },
  });
}

module.exports = {
  DEATH_CAUSE_OPTIONS,
  parseDeathCauseData,
  syncDeathHistoryEntry,
};
