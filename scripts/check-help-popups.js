const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const sidebarPath = path.join(ROOT, "views", "partials", "sidebar.ejs");
const helpScriptPath = path.join(ROOT, "public", "js", "help-popups.js");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".ejs")) {
      files.push(fullPath);
    }
  }
  return files;
}

function unique(values) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

const sidebar = read(sidebarPath);
const helpScript = read(helpScriptPath);
if (!helpScript.includes("const contextualHelp = {") || !helpScript.includes("function addAutomaticHelpButtons()")) {
  console.error("A ajuda contextual automatica precisa manter contextualHelp e addAutomaticHelpButtons em public/js/help-popups.js.");
  process.exit(1);
}

const helpBlockMatch = sidebar.match(/const helpByLabel = \{([\s\S]*?)\n\s*\};/);
if (!helpBlockMatch) {
  console.error("Nao encontrei o bloco helpByLabel em views/partials/sidebar.ejs.");
  process.exit(1);
}

const helpLabels = new Set();
for (const match of helpBlockMatch[1].matchAll(/"([^"]+)"\s*:/g)) {
  helpLabels.add(match[1]);
}

const menuLabels = [];
for (const match of sidebar.matchAll(/label:\s*"([^"]+)"/g)) {
  menuLabels.push(match[1]);
}
for (const match of sidebar.matchAll(/label:\s*\([^?]+\)\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"/g)) {
  menuLabels.push(match[1], match[2]);
}

const missingMenuHelp = unique(menuLabels.filter((label) => !helpLabels.has(label)));

const invalidButtons = [];
for (const filePath of walk(path.join(ROOT, "views"))) {
  const relativePath = path.relative(ROOT, filePath);
  if (relativePath === path.join("views", "partials", "sidebar.ejs")) continue;
  const content = read(filePath);
  const buttonMatches = content.matchAll(/<button\b[^>]*class="[^"]*\bhelp-info-button\b[^"]*"[^>]*>/g);
  for (const match of buttonMatches) {
    const tag = match[0];
    const hasTitle = /data-help-title="[^"]+"/.test(tag);
    const hasText = /data-help-text="[^"]+"/.test(tag);
    if (!hasTitle || !hasText) {
      invalidButtons.push(relativePath);
    }
  }
}

if (missingMenuHelp.length || invalidButtons.length) {
  if (missingMenuHelp.length) {
    console.error("Itens do menu sem texto no helpByLabel:");
    for (const label of missingMenuHelp) console.error(`- ${label}`);
  }
  if (invalidButtons.length) {
    console.error("Botoes de ajuda sem data-help-title ou data-help-text:");
    for (const filePath of unique(invalidButtons)) console.error(`- ${filePath}`);
  }
  process.exit(1);
}

console.log("Ajuda contextual verificada com sucesso.");
