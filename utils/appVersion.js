const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const FALLBACK_VERSION_PATH = path.join(__dirname, "..", "app-version.json");

function padVersionNumber(value) {
  return String(Math.max(1, Number(value) || 1)).padStart(3, "0");
}

function formatVersion(date, sequence) {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}.${month}-${padVersionNumber(sequence)}`;
}

function runGit(args) {
  return execFileSync("git", args, {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function gitBasedVersion() {
  const commit = process.env.RENDER_GIT_COMMIT || "HEAD";
  const commitDateRaw = runGit(["show", "-s", "--format=%cI", commit]);
  const commitDate = new Date(commitDateRaw);
  if (Number.isNaN(commitDate.getTime())) return null;

  const since = new Date(Date.UTC(commitDate.getUTCFullYear(), commitDate.getUTCMonth(), 1));
  const until = new Date(Date.UTC(commitDate.getUTCFullYear(), commitDate.getUTCMonth() + 1, 1));
  const countRaw = runGit([
    "rev-list",
    "--count",
    `--since=${since.toISOString()}`,
    `--before=${until.toISOString()}`,
    "HEAD",
  ]);

  return formatVersion(commitDate, Number(countRaw || 1));
}

function fallbackFileVersion() {
  try {
    const payload = JSON.parse(fs.readFileSync(FALLBACK_VERSION_PATH, "utf8"));
    return payload.version || null;
  } catch {
    return null;
  }
}

function getAppVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;

  try {
    const version = gitBasedVersion();
    if (version) return version;
  } catch {
    // Render/local environments without .git can use APP_VERSION or the fallback file.
  }

  return fallbackFileVersion() || formatVersion(new Date(), 1);
}

module.exports = { getAppVersion, formatVersion };
