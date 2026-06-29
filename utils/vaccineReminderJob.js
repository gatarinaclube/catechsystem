const { sendStatusEmail } = require("./mailer");
const { buildDisplayName, classifyOperationalCat, formatDate, parseDate } = require("./cattery-admin");
const { buildVaccineDueItems } = require("./vaccines");
const { buildNotificationEmailOptions } = require("./userSmtp");

const REMINDER_GROUPS = {
  SIRES: "Padreadores",
  DAMS: "Matrizes",
  FOUNDERS: "Fundadores",
  KITTEN_AVAILABLE: "Filhotes Disponíveis",
  KITTEN_RESERVED: "Filhotes Reservados",
  KITTEN_UNAVAILABLE: "Filhotes Indisponíveis",
  KITTEN_BREEDER: "Filhotes Futuros Padreadores/Matrizes",
  KITTEN_DELIVERED: "Filhotes Entregues/Vendidos",
};

let vaccineReminderJobRunning = false;

function parseJsonList(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function normalizeDate(value) {
  const parsed = parseDate(value);
  if (!parsed) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function isKitten(cat) {
  return Boolean(cat?.kittenNumber || cat?.litterKitten);
}

function kittenStatus(cat) {
  if (cat?.deceased === true || cat?.kittenAvailabilityStatus === "DECEASED") return "DECEASED";
  if (cat?.breedingProspect === true || cat?.kittenAvailabilityStatus === "BREEDER") return "KITTEN_BREEDER";
  if (cat?.delivered === true || cat?.sold === true || cat?.kittenAvailabilityStatus === "DELIVERED") return "KITTEN_DELIVERED";
  if (cat?.kittenAvailabilityStatus === "AVAILABLE") return "KITTEN_AVAILABLE";
  if (cat?.kittenAvailabilityStatus === "RESERVED") return "KITTEN_RESERVED";
  return "KITTEN_UNAVAILABLE";
}

function catReminderGroup(cat) {
  if (cat?.deceased === true || cat?.kittenAvailabilityStatus === "DECEASED") return null;

  if (isKitten(cat)) {
    return kittenStatus(cat);
  }

  const category = classifyOperationalCat(cat, { includeDeliveredKittensInHistory: true });
  if (category === "sires") return "SIRES";
  if (category === "dams") return "DAMS";
  if (category === "founders") return "FOUNDERS";
  return null;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function reminderEmailHtml(user, items) {
  const rows = items.map((item) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.catName)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.vaccineType)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.lastDoseLabel)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>${escapeHtml(formatDate(item.dueDate))}</strong></td>
    </tr>
  `).join("");

  return `
    <div style="font-family:Arial,sans-serif;color:#1f2933;line-height:1.5;">
      <h2 style="margin:0 0 12px;color:#b45309;">Vacina a Vencer</h2>
      <p>Olá, ${escapeHtml(user.name || "usuário")}.</p>
      <p>As vacinas abaixo estão próximas do vencimento conforme a antecedência configurada em Configurações.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px;">
        <thead>
          <tr style="background:#fff7ed;color:#7c2d12;text-align:left;">
            <th style="padding:10px;">Gato</th>
            <th style="padding:10px;">Vacina</th>
            <th style="padding:10px;">Última dose</th>
            <th style="padding:10px;">Vencimento</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function runVaccineReminderJob(prisma, options = {}) {
  if (vaccineReminderJobRunning) return { skipped: true };
  vaccineReminderJobRunning = true;

  const today = startOfToday();
  let sentEmails = 0;
  let sentItems = 0;

  try {
    const users = await prisma.user.findMany({
      where: {
        approvalStatus: "DEFERIDO",
        settings: { is: { vaccineReminderEnabled: true } },
      },
      include: { settings: true },
      orderBy: { id: "asc" },
    });

    for (const user of users) {
      const daysBefore = Math.max(0, Number(user.settings?.vaccineReminderDaysBefore || 0));
      const selectedGroups = new Set(parseJsonList(user.settings?.vaccineReminderGroupsJson));
      if (!selectedGroups.size) continue;

      const limit = new Date(today);
      limit.setDate(limit.getDate() + daysBefore);

      const cats = await prisma.cat.findMany({
        where: { ownerId: user.id },
        include: {
          owner: { include: { settings: true } },
          mother: true,
          litterKitten: { include: { litter: true } },
          vaccinationPlan: true,
        },
        orderBy: { name: "asc" },
      });

      const dueItems = [];

      for (const cat of cats) {
        const group = catReminderGroup(cat);
        if (!group || !selectedGroups.has(group)) continue;

        const catName = buildDisplayName(cat);
        const vaccineItems = buildVaccineDueItems(cat)
          .map((item) => ({ ...item, dueDate: normalizeDate(item.dueDate) }))
          .filter((item) => item.dueDate && item.dueDate >= today && item.dueDate <= limit);

        for (const item of vaccineItems) {
          const alreadySent = await prisma.vaccineReminderEmailLog.findUnique({
            where: {
              ownerId_catId_vaccineType_dueDate: {
                ownerId: user.id,
                catId: cat.id,
                vaccineType: item.vaccineType,
                dueDate: item.dueDate,
              },
            },
          });

          if (alreadySent) continue;

          dueItems.push({
            ...item,
            catId: cat.id,
            catName,
            group,
          });
        }
      }

      if (!dueItems.length) continue;

      await sendStatusEmail({
        to: user.email,
        subject: "Vacina a Vencer",
        html: reminderEmailHtml(user, dueItems),
        ...buildNotificationEmailOptions(user.settings),
      });

      await prisma.vaccineReminderEmailLog.createMany({
        data: dueItems.map((item) => ({
          ownerId: user.id,
          catId: item.catId,
          vaccineType: item.vaccineType,
          dueDate: item.dueDate,
        })),
        skipDuplicates: true,
      });

      sentEmails += 1;
      sentItems += dueItems.length;
    }

    if (options.log !== false) {
      console.log(`Lembretes de vacina processados: ${sentEmails} e-mail(s), ${sentItems} vacina(s).`);
    }

    return { sentEmails, sentItems };
  } catch (err) {
    console.error("Erro ao processar lembretes de vacina:", err);
    return { error: err };
  } finally {
    vaccineReminderJobRunning = false;
  }
}

function startVaccineReminderScheduler(prisma) {
  if (process.env.DISABLE_VACCINE_REMINDER_JOB === "true") return;

  const intervalMs = 24 * 60 * 60 * 1000;
  setTimeout(() => runVaccineReminderJob(prisma), 60 * 1000);
  setInterval(() => runVaccineReminderJob(prisma), intervalMs);
}

module.exports = {
  REMINDER_GROUPS,
  catReminderGroup,
  runVaccineReminderJob,
  startVaccineReminderScheduler,
};
