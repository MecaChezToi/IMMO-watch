require("dotenv").config();
const cron = require("node-cron");

const { runScan } = require("./scanner");
const { startCommandListener } = require("./telegramCommands");

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "*/30 * * * *"; // toutes les 30 min par defaut

async function main() {
  const runOnce = process.argv.includes("--once");

  if (runOnce) {
    await runScan();
    process.exit(0);
  }

  console.log(`[immo-watch] demarre. Frequence de scan: ${CRON_SCHEDULE}`);
  // Ecouteur de commandes Telegram en parallele (fire-and-forget, boucle infinie)
  startCommandListener().catch((err) =>
    console.error("[telegram-commands] erreur fatale:", err.message)
  );
  // Premier scan immediat au demarrage, puis selon le planning cron
  runScan().catch((err) => console.error("[scan] erreur:", err));
  cron.schedule(CRON_SCHEDULE, () => {
    runScan().catch((err) => console.error("[scan] erreur:", err));
  });
}

main();
