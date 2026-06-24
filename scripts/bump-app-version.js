const { PrismaClient } = require("@prisma/client");
const {
  bumpDeploymentVersion,
  getAppVersion,
  nextDeploymentVersion,
  writeVersionFile,
} = require("../utils/appVersion");

const SETTING_KEY = "app.deployVersion";

async function bumpWithDatabase() {
  const prisma = new PrismaClient();
  const now = new Date();

  try {
    const current = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY },
      select: { value: true },
    });
    const version = nextDeploymentVersion(current?.value || getAppVersion(), now);

    await prisma.systemSetting.upsert({
      where: { key: SETTING_KEY },
      create: { key: SETTING_KEY, value: version },
      update: { value: version },
    });
    writeVersionFile(version, now);

    return version;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  let version;

  if (process.env.DATABASE_URL) {
    try {
      version = await bumpWithDatabase();
    } catch (err) {
      console.warn(`Não foi possível atualizar a versão no banco: ${err.message}`);
    }
  }

  if (!version) {
    version = bumpDeploymentVersion();
  }

  process.stdout.write(`Versão do deploy: ${version}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
