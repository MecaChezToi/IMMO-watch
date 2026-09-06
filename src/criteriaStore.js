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
  const criteria = JSON.parse(raw);

  // Migration douce: si de nouveaux sites (ou nouvelles cles) ont ete ajoutes au
  // code depuis la derniere sauvegarde de ce fichier, on les integre avec leur
  // valeur par defaut plutot que de forcer l'utilisateur a les rajouter a la main.
  const defaults = JSON.parse(fs.readFileSync(DEFAULT_CRITERIA_FILE, "utf-8"));
  let modifie = false;
  if (defaults.sites_actifs) {
    criteria.sites_actifs = criteria.sites_actifs || {};
    for (const [site, actif] of Object.entries(defaults.sites_actifs)) {
      if (!(site in criteria.sites_actifs)) {
        criteria.sites_actifs[site] = actif;
        modifie = true;
      }
    }
  }
  if (modifie) saveCriteria(criteria);

  return criteria;
}

function saveCriteria(criteria) {
  ensureCriteriaFile();
  fs.writeFileSync(CRITERIA_FILE, JSON.stringify(criteria, null, 2));
}

module.exports = { loadCriteria, saveCriteria };
