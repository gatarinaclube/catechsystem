const express = require("express");
const { dataOwnerScope } = require("../utils/access");
const {
  addMonths,
  addYears,
  buildDisplayName,
  classifyOperationalCat,
  formatDate,
  formatDateInput,
  parseDate,
} = require("../utils/cattery-admin");
const { formatMicrochip } = require("../utils/format");

const CLUBS = [
  "Gatarina",
  "Sampa Gato",
  "CBG",
  "Amacoon",
  "Gato Grupo",
  "Rio Cat Clube",
  "Rio Minas",
];
const HOMOLOGATION_STATUSES = [
  { value: "REQUEST", label: "Solicitar Homologação" },
  { value: "HOMOLOGATED", label: "Homologado" },
];

const BREEDING_CERTIFICATES = ["CACC", "CACJ", "CAC", "CACIB", "CAGCIB", "CACS", "HP", "BIV", "BIS", "BOB", "BOA"];
const NEUTERED_CERTIFICATES = ["CACC", "CACJ", "CAP", "CAPIB", "CAGPIB", "CAPS", "HP(n)", "BIV", "BIS", "BOB", "BOA"];
const SPECIAL_TITLES = ["SW", "NW", "AW", "BW", "MW", "NSW"];
const HIGH_TITLES = new Set(["IC", "GIC", "SC", "IP", "GIP", "SP"]);
const MANAGED_TITLE_CODES = new Set(["KCH", "JCH", "CH", "IC", "GIC", "SC", "PR", "IP", "GIP", "SP", "JW", "DVM", "DSM", "DM"]);

function cleanText(value, limit = 500) {
  return String(value || "").trim().slice(0, limit);
}

function reqArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "undefined") return [];
  return [value];
}

function normalizeRecordKind(value) {
  const kind = String(value || "").toUpperCase();
  return ["CERTIFICATE", "TITLE", "SPECIAL"].includes(kind) ? kind : "";
}

function certificateCodesForCat(cat) {
  return cat?.neutered === true ? NEUTERED_CERTIFICATES : BREEDING_CERTIFICATES;
}

function normalizeCode(value) {
  return cleanText(value, 20).toUpperCase();
}

function recordDateValue(value) {
  return formatDateInput(value);
}

function countCertificates(records, code, filter = null) {
  return records.filter((record) => {
    if (record.kind !== "CERTIFICATE" || record.code !== code) return false;
    return filter ? filter(record) : true;
  });
}

function uniqueJudgeCount(records) {
  return new Set(records.map((record) => cleanText(record.judge).toLowerCase()).filter(Boolean)).size;
}

function hasIntervalLongerThanYears(records, years) {
  const dates = records
    .map((record) => parseDate(record.date))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length < 2) return false;
  return dates[dates.length - 1].getTime() > addYears(dates[0], years).getTime();
}

function beforeAge(cat, months) {
  const birth = parseDate(cat?.birthDate);
  if (!birth) return () => false;
  const limit = addMonths(birth, months);
  return (record) => {
    const date = parseDate(record.date);
    return Boolean(date && date < limit);
  };
}

function afterAge(cat, months) {
  const birth = parseDate(cat?.birthDate);
  if (!birth) return () => false;
  const limit = addMonths(birth, months);
  return (record) => {
    const date = parseDate(record.date);
    return Boolean(date && date >= limit);
  };
}

function hasTitle(records, code) {
  return records.some((record) => record.kind === "TITLE" && record.code === code);
}

function findTitleRecord(records, code) {
  return records.find((record) => record.kind === "TITLE" && record.code === code) || null;
}

function homologationStatusLabel(value) {
  const status = HOMOLOGATION_STATUSES.find((item) => item.value === value);
  return status ? status.label : "Pendente";
}

function titleOption(code, label, available, reason) {
  return { code, label, available, reason };
}

function titleOptionsForCat(cat, records, titledOffspringCount = 0) {
  const cacc = countCertificates(records, "CACC");
  const cacj = countCertificates(records, "CACJ");
  const bisBeforeOneYear = countCertificates(records, "BIS", beforeAge(cat, 12));
  const biv = countCertificates(records, "BIV");
  const adultBis = countCertificates(records, "BIS", afterAge(cat, 10));
  const common = [
    titleOption("KCH", "Kitten Champion", cacc.length >= 3, "3 CACC"),
    titleOption("JCH", "Junior Champion", cacj.length >= 3, "3 CACJ"),
  ];

  const sequence = cat?.neutered === true
    ? [
        titleOption("PR", "Premior", countCertificates(records, "CAP").length >= 3 && uniqueJudgeCount(countCertificates(records, "CAP")) >= 3, "3 CAP de juízes diferentes"),
        titleOption("IP", "International Premior", countCertificates(records, "CAPIB").length >= 3 && uniqueJudgeCount(countCertificates(records, "CAPIB")) >= 3, "3 CAPIB de juízes diferentes"),
        titleOption("GIP", "Grand International Premior", countCertificates(records, "CAGPIB").length >= 6 && uniqueJudgeCount(countCertificates(records, "CAGPIB")) >= 4, "6 CAGPIB de pelo menos 4 juízes"),
        titleOption("SP", "Supreme Premior", countCertificates(records, "CAPS").length >= 9 && uniqueJudgeCount(countCertificates(records, "CAPS")) >= 5, "9 CAPS de pelo menos 5 juízes"),
      ]
    : [
        titleOption("CH", "Champion", countCertificates(records, "CAC").length >= 3 && uniqueJudgeCount(countCertificates(records, "CAC")) >= 3, "3 CAC de juízes diferentes"),
        titleOption("IC", "International Champion", countCertificates(records, "CACIB").length >= 3 && uniqueJudgeCount(countCertificates(records, "CACIB")) >= 3, "3 CACIB de juízes diferentes"),
        titleOption("GIC", "Grand International Champion", countCertificates(records, "CAGCIB").length >= 6 && uniqueJudgeCount(countCertificates(records, "CAGCIB")) >= 4, "6 CAGCIB de pelo menos 4 juízes"),
        titleOption("SC", "Supreme Champion", countCertificates(records, "CACS").length >= 9 && uniqueJudgeCount(countCertificates(records, "CACS")) >= 5, "9 CACS de pelo menos 5 juízes"),
      ];

  return [
    ...common,
    ...sequence,
    titleOption("JW", "Junior Winner", bisBeforeOneYear.length >= 3, "3 BIS antes de completar 1 ano"),
    titleOption("DVM", "Distinguished Variety Merit", biv.length >= 10 && hasIntervalLongerThanYears(biv, 2), "10 BIV com intervalo maior que 2 anos"),
    titleOption("DSM", "Distinguished Show Merit", adultBis.length >= 10 && hasIntervalLongerThanYears(adultBis, 2), "10 BIS adulto com intervalo maior que 2 anos"),
    titleOption("DM", "Distinguished Merit", titledOffspringCount >= 5, "5 filhotes com IC/IP ou maior"),
  ].map((option) => ({
    ...option,
    titleRecord: findTitleRecord(records, option.code),
    alreadyAdded: hasTitle(records, option.code),
    homologationStatusLabel: homologationStatusLabel(findTitleRecord(records, option.code)?.homologationStatus),
  }));
}

function normalizeCatRecord(cat) {
  return {
    ...cat,
    displayName: buildDisplayName(cat) || cat.name,
    microchipLabel: cat.microchip ? formatMicrochip(cat.microchip) : "-",
    birthDateLabel: formatDate(cat.birthDate) || "-",
  };
}

function isOwnedByUser(cat) {
  return !cat.currentOwnerId || Number(cat.currentOwnerId) === Number(cat.ownerId);
}

function isEligibleCat(cat) {
  if (!cat || cat.deceased === true || cat.kittenAvailabilityStatus === "DECEASED") return false;
  if (cat.delivered === true || cat.kittenAvailabilityStatus === "DELIVERED") return false;
  if (!isOwnedByUser(cat)) return false;

  const category = classifyOperationalCat(cat, { includeOwnedBreedingKittensAsAdults: true });
  if (["sires", "dams", "founders"].includes(category)) return true;

  const isKitten = Boolean(cat.kittenNumber || cat.litterKitten);
  if (!isKitten) return false;
  const birth = parseDate(cat.birthDate);
  return Boolean(birth && addMonths(birth, 4) <= new Date());
}

async function titledOffspringCount(prisma, catId) {
  const children = await prisma.cat.findMany({
    where: {
      OR: [{ fatherId: catId }, { motherId: catId }],
    },
    select: { id: true },
  });
  const ids = children.map((child) => child.id);
  if (!ids.length) return 0;

  const rows = await prisma.catTitleRecord.findMany({
    where: {
      catId: { in: ids },
      kind: "TITLE",
      code: { in: Array.from(HIGH_TITLES) },
    },
    select: { catId: true },
  });
  return new Set(rows.map((row) => row.catId)).size;
}

function validateRecordData(data, allowedTitleCodes, allowedCertificateCodes) {
  if (data.kind === "CERTIFICATE" && !allowedCertificateCodes.has(data.code)) {
    return `Certificado ${data.code} não permitido para este gato.`;
  }
  if (data.kind === "TITLE" && !allowedTitleCodes.has(data.code)) {
    return `Título ${data.code} ainda não está liberado pelas regras.`;
  }
  if (data.kind === "SPECIAL" && !SPECIAL_TITLES.includes(data.code)) {
    return `Título especial ${data.code} não permitido.`;
  }
  if (data.kind === "SPECIAL") {
    return data.year ? null : "Informe o ano do título especial.";
  }
  return data.date && data.club && data.judge
    ? null
    : "Informe data, clube e juiz para cada certificado ou título.";
}

function normalizeHomologationStatus(value) {
  const status = String(value || "").trim().toUpperCase();
  return HOMOLOGATION_STATUSES.some((item) => item.value === status) ? status : null;
}

function parseRecordsFromBody(body, ownerId, catId, allowedTitleCodes, allowedCertificateCodes) {
  const ids = reqArray(body.recordId);
  const kinds = reqArray(body.recordKind);
  const codes = reqArray(body.recordCode);
  const dates = reqArray(body.recordDate);
  const clubs = reqArray(body.recordClub);
  const judges = reqArray(body.recordJudge);
  const years = reqArray(body.recordYear);
  const notes = reqArray(body.recordNotes);
  const homologationStatuses = reqArray(body.recordHomologationStatus);
  const deletes = new Set(reqArray(body.deleteRecord).map(Number).filter(Boolean));
  const records = [];
  const errors = [];

  ids.forEach((idValue, index) => {
    const id = Number(idValue);
    if (!id || deletes.has(id)) return;
    const kind = normalizeRecordKind(kinds[index]);
    const code = normalizeCode(codes[index]);
    if (!kind || !code) return;
    const data = {
      ownerId,
      catId,
      kind,
      code,
      date: kind === "SPECIAL" ? null : parseDate(dates[index]),
      club: kind === "SPECIAL" ? null : cleanText(clubs[index], 80) || null,
      judge: kind === "SPECIAL" ? null : cleanText(judges[index], 120) || null,
      year: kind === "SPECIAL" ? cleanText(years[index], 10) || null : null,
      notes: cleanText(notes[index], 500) || null,
      homologationStatus: kind === "TITLE" ? normalizeHomologationStatus(homologationStatuses[index]) : null,
    };
    const error = validateRecordData(data, allowedTitleCodes, allowedCertificateCodes);
    if (error) {
      errors.push(error);
      return;
    }
    records.push({ id, data });
  });

  const newKind = normalizeRecordKind(body.newKind);
  const newCode = normalizeCode(body.newCode);
  if (newKind && newCode) {
    const isAllowedTitle = newKind !== "TITLE" || allowedTitleCodes.has(newCode);
    const isSpecial = newKind === "SPECIAL";
    const data = {
      ownerId,
      catId,
      kind: newKind,
      code: newCode,
      date: isSpecial ? null : parseDate(body.newDate),
      club: isSpecial ? null : cleanText(body.newClub, 80) || null,
      judge: isSpecial ? null : cleanText(body.newJudge, 120) || null,
      year: isSpecial ? cleanText(body.newYear, 10) || null : null,
      notes: cleanText(body.newNotes, 500) || null,
      homologationStatus: newKind === "TITLE" ? normalizeHomologationStatus(body.newHomologationStatus) : null,
    };
    const error = isAllowedTitle
      ? validateRecordData(data, allowedTitleCodes, allowedCertificateCodes)
      : `Título ${newCode} ainda não está liberado pelas regras.`;
    if (error) {
      errors.push(error);
    } else {
      records.push({ id: null, data });
    }
  }

  return { records, deletes, errors };
}

function mergeNames(...groups) {
  const seen = new Set();
  const names = [];
  groups.flat().forEach((value) => {
    const name = cleanText(value, 120);
    const key = name.toLocaleLowerCase("pt-BR");
    if (!name || seen.has(key)) return;
    seen.add(key);
    names.push(name);
  });
  return names.sort((a, b) => a.localeCompare(b, "pt-BR"));
}

async function loadTitleOptions(prisma, ownerId, records = []) {
  const rows = await prisma.catTitleOption.findMany({
    where: { ownerId },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  return {
    clubs: mergeNames(
      CLUBS,
      rows.filter((row) => row.type === "CLUB").map((row) => row.name),
      records.map((record) => record.club)
    ),
    judges: mergeNames(
      rows.filter((row) => row.type === "JUDGE").map((row) => row.name),
      records.map((record) => record.judge)
    ),
  };
}

async function rememberTitleOptions(tx, ownerId, records) {
  const values = [];
  records.forEach((record) => {
    if (record.data.club) values.push({ type: "CLUB", name: record.data.club });
    if (record.data.judge) values.push({ type: "JUDGE", name: record.data.judge });
  });

  for (const value of values) {
    await tx.catTitleOption.upsert({
      where: { ownerId_type_name: { ownerId, type: value.type, name: value.name } },
      update: {},
      create: { ownerId, type: value.type, name: value.name },
    });
  }
}

function buildTitleBeforeName(records) {
  const order = ["SC", "GIC", "IC", "CH", "SP", "GIP", "IP", "PR", "JCH", "KCH"];
  return order.find((code) => hasTitle(records, code)) || null;
}

function titleBeforeNameUpdate(currentValue, records) {
  const nextTitle = buildTitleBeforeName(records);
  const currentTitle = normalizeCode(currentValue);
  if (nextTitle) return nextTitle;
  if (!currentTitle || MANAGED_TITLE_CODES.has(currentTitle)) return null;
  return currentValue;
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  async function loadContext(req, selectedCatId = null, error = null, success = false) {
    const ownerScope = dataOwnerScope(req);
    const cats = await prisma.cat.findMany({
      where: ownerScope,
      include: {
        litterKitten: true,
        owner: { include: { settings: true } },
        titleRecords: { orderBy: [{ kind: "asc" }, { date: "asc" }, { id: "asc" }] },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const eligibleCats = cats.filter(isEligibleCat).map(normalizeCatRecord);
    const catsWithRecords = eligibleCats
      .filter((cat) => cat.titleRecords.length)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));
    const availableCats = eligibleCats
      .filter((cat) => !cat.titleRecords.length)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));
    const selectedCat = selectedCatId
      ? eligibleCats.find((cat) => Number(cat.id) === Number(selectedCatId)) || null
      : null;
    const offspringCount = selectedCat ? await titledOffspringCount(prisma, selectedCat.id) : 0;
    const titleOptions = selectedCat
      ? titleOptionsForCat(selectedCat, selectedCat.titleRecords, offspringCount)
      : [];
    const titleOptionLists = await loadTitleOptions(prisma, req.session.userId, selectedCat?.titleRecords || []);

    return {
      user: req.user,
      currentPath: req.path,
      availableCats,
      catsWithRecords,
      selectedCat,
      certificateCodes: selectedCat ? certificateCodesForCat(selectedCat) : [],
      titleOptions,
      specialTitles: SPECIAL_TITLES,
      clubs: titleOptionLists.clubs,
      judges: titleOptionLists.judges,
      homologationStatuses: HOMOLOGATION_STATUSES,
      error,
      success,
      formatDateInput: recordDateValue,
      formatDate,
    };
  }

  router.get("/admin/titles", requireAuth, requirePermission("admin.titles"), async (req, res) => {
    const selectedCatId = req.query.catId ? Number(req.query.catId) : null;
    res.render("titles/index", await loadContext(req, selectedCatId, null, req.query.saved === "1"));
  });

  router.post("/admin/titles/select", requireAuth, requirePermission("admin.titles"), async (req, res) => {
    const catId = Number(req.body.catId);
    if (!catId) return res.redirect("/admin/titles");
    return res.redirect(`/admin/titles?catId=${catId}`);
  });

  router.post("/admin/titles/options", requireAuth, requirePermission("admin.titles"), async (req, res) => {
    const type = String(req.body.type || "").trim().toUpperCase();
    const name = cleanText(req.body.name, 120);
    const redirect = req.body.catId ? `/admin/titles?catId=${Number(req.body.catId)}` : "/admin/titles";
    if (!["CLUB", "JUDGE"].includes(type) || !name) {
      return res.redirect(redirect);
    }

    await prisma.catTitleOption.upsert({
      where: { ownerId_type_name: { ownerId: req.session.userId, type, name } },
      update: {},
      create: { ownerId: req.session.userId, type, name },
    });
    return res.redirect(redirect);
  });

  router.post("/admin/titles/:catId", requireAuth, requirePermission("admin.titles"), async (req, res) => {
    const catId = Number(req.params.catId);
    const cat = await prisma.cat.findFirst({
      where: { id: catId, ...dataOwnerScope(req) },
      include: { litterKitten: true, titleRecords: true },
    });

    if (!cat || !isEligibleCat(cat)) {
      return res.status(404).render("titles/index", await loadContext(req, null, "Gato não encontrado ou não elegível para lançamento de títulos."));
    }

    const offspringCount = await titledOffspringCount(prisma, cat.id);
    const allowedTitleCodes = new Set(
      titleOptionsForCat(cat, cat.titleRecords, offspringCount)
        .filter((option) => option.available || option.alreadyAdded)
        .map((option) => option.code)
    );
    const allowedCertificateCodes = new Set(certificateCodesForCat(cat));
    const { records, deletes, errors } = parseRecordsFromBody(
      req.body,
      req.session.userId,
      cat.id,
      allowedTitleCodes,
      allowedCertificateCodes
    );
    if (errors.length) {
      return res.status(400).render("titles/index", await loadContext(req, cat.id, [...new Set(errors)].join(" ")));
    }

    await prisma.$transaction(async (tx) => {
      if (deletes.size) {
        await tx.catTitleRecord.deleteMany({
          where: { id: { in: Array.from(deletes) }, catId: cat.id, ownerId: req.session.userId },
        });
      }

      for (const record of records) {
        if (record.id) {
          await tx.catTitleRecord.updateMany({
            where: { id: record.id, catId: cat.id, ownerId: req.session.userId },
            data: record.data,
          });
        } else {
          await tx.catTitleRecord.create({ data: record.data });
        }
      }
      await rememberTitleOptions(tx, req.session.userId, records);

      const savedRecords = await tx.catTitleRecord.findMany({ where: { catId: cat.id } });
      await tx.cat.update({
        where: { id: cat.id },
        data: { titleBeforeName: titleBeforeNameUpdate(cat.titleBeforeName, savedRecords) },
      });
    });

    return res.redirect(`/admin/titles?catId=${cat.id}&saved=1`);
  });

  return router;
};
