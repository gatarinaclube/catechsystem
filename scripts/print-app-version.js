const { getAppVersion } = require("../utils/appVersion");

process.stdout.write(`${getAppVersion()}\n`);
