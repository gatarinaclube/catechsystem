const BREED_OPTIONS = [
  "ABY","SOM","ACL","ACS","BAL","SIA","BEN","BLH","BSH","BML","BOM","BUR",
  "CHA","CRX","DRX","DSP","EUR","EXO","PER","GRX","HCL","HCS","JBS","KBL",
  "KBS","KOR","LPL","LPS","LYO","MAU","MCO","NEM","NFO","OCI","OLH","OSH",
  "PEB","RAG","RUS","SBI","SIB","SNO","SOK","SPH","SRL","SRS","THA","TUA","TUV",
];

const EXAM_OPTIONS = ["PKDef", "PKD", "PRA", "HCM - Genético", "HCM - Doppler"];
const EXAM_KITTENS_TAB_OPTION = "__SHOW_KITTENS_TAB__";
const EXAM_KITTENS_TAB_DISABLED_OPTION = "__HIDE_KITTENS_TAB__";

function normalizeList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function parseJsonList(value) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function filterAllowed(values, allowedValues) {
  const allowed = new Set(allowedValues);
  return normalizeList(values).filter((value, index, array) => (
    allowed.has(value) && array.indexOf(value) === index
  ));
}

function appendCurrentValues(options, currentValues = [], allowedValues = options) {
  const optionSet = new Set(options);
  const allowedSet = new Set(allowedValues);

  normalizeList(currentValues).forEach((value) => {
    if (value && allowedSet.has(value) && !optionSet.has(value)) {
      options.push(value);
      optionSet.add(value);
    }
  });

  return options;
}

function selectedBreedsFromSettings(settings, currentValues = []) {
  const selected = filterAllowed(parseJsonList(settings?.breedsJson), BREED_OPTIONS);
  const options = selected.length ? selected : [...BREED_OPTIONS];
  return appendCurrentValues(options, currentValues, BREED_OPTIONS);
}

function selectedExamsFromSettings(settings, { defaultAll = false } = {}) {
  if (!settings || settings.examsJson === null || settings.examsJson === undefined) {
    return defaultAll ? [...EXAM_OPTIONS] : [];
  }

  return filterAllowed(parseJsonList(settings.examsJson), EXAM_OPTIONS);
}

function examKittensTabEnabledFromSettings(settings, { defaultEnabled = true } = {}) {
  if (!settings || settings.examsJson === null || settings.examsJson === undefined) {
    return defaultEnabled;
  }

  return !parseJsonList(settings.examsJson).includes(EXAM_KITTENS_TAB_DISABLED_OPTION);
}

function selectedExamSettingsFromBody(exams, showKittensTab) {
  const selected = filterAllowed(exams, EXAM_OPTIONS);
  if (showKittensTab) {
    selected.push(EXAM_KITTENS_TAB_OPTION);
  } else {
    selected.push(EXAM_KITTENS_TAB_DISABLED_OPTION);
  }
  return selected;
}

module.exports = {
  BREED_OPTIONS,
  EXAM_OPTIONS,
  EXAM_KITTENS_TAB_OPTION,
  EXAM_KITTENS_TAB_DISABLED_OPTION,
  normalizeList,
  parseJsonList,
  filterAllowed,
  selectedBreedsFromSettings,
  examKittensTabEnabledFromSettings,
  selectedExamSettingsFromBody,
  selectedExamsFromSettings,
};
