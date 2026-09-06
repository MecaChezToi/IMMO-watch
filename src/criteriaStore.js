const fs = require("fs");
const path = require("path");

// IMPORTANT: les criteres vivent maintenant sur le volume persistant /app/data,
// PAS dans config/criteria.json (qui sert juste de valeurs par defaut au tout
// premier demarrage). Comme ca, les changements faits via les commandes Telegram
// survivent aux redeploiements, sans avoir besoin de push sur Git a chaque fois.
const DATA_DIR = path.join(__dirname, "..", "data");
const CRITERIA_FILE = path.join(DATA_DIR, "criteria.json");
const DEFAULT_CRITERIA_FILE = path.join(__dirname, "..", "config", "criteria.json");

function ensureCriteriaFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CRITERIA_FILE)) {
    const defaults = fs.readFileSync(DEFAULT_CRITERIA_FILE, "utf-8");
    fs.writeFileSync(CRITERIA_FILE, defaults);
  }
}

function loadCriteria() {
  ensureCriteriaFile();
  const raw = fs.readFileSync(CRITERIA_FILE, "utf-8");
  return JSON.parse(raw);
}

function saveCriteria(criteria) {
  ensureCriteriaFile();
  fs.writeFileSync(CRITERIA_FILE, JSON.stringify(criteria, null, 2));
}

module.exports = { loadCriteria, saveCriteria };
