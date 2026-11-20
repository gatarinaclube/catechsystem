const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function publish(message, run = (command, args, capture = false) => execFileSync(command, args, {
  cwd: root, stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit", encoding: "utf8",
})) {
  // Stop on validation failures before staging or publishing changes.
  run("git", ["diff", "--check"]);
  const tests = fs.readdirSync(__dirname).filter((file) => /^test-.*\.js$/.test(file)).map((file) => `scripts/${file}`);
  if (tests.length) run(process.execPath, ["--test", ...tests]);
  run("npm", ["exec", "--", "prisma", "validate"]);
  run("git", ["add", "."]);
  const changed = run("git", ["diff", "--cached", "--name-only"], true).trim();
  if (changed) {
    const stamp = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium",
    }).format(new Date());
    run("git", ["commit", "-m", message || `Atualização ${stamp}`]);
  }
  run("git", ["push"]);
  console.log("Código enviado. O servidor aplicará as migrações ao executar npm start.");
}

if (require.main === module) {
  try { publish(process.argv.slice(2).join(" ").trim()); }
  catch (err) {
    console.error("Publicação interrompida. Verifique o erro acima; nenhuma etapa seguinte foi executada.");
    process.exitCode = 1;
  }
}

module.exports = { publish };
