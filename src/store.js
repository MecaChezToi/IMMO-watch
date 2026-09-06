const fs = require("fs");
const path = require("path");

// Stocke les IDs d'annonces deja vues pour ne notifier que les nouvelles.
// Fichier persiste sur disque -> monte un volume Docker sur /app/data en prod (Coolify)
// pour ne pas perdre l'historique a chaque redeploiement.
const DATA_DIR = path.join(__dirname, "..", "data");
const STORE_FILE = path.join(DATA_DIR, "seen.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) fs.writeFileSync(STORE_FILE, JSON.stringify([]));
}

function loadSeenIds() {
  ensureStore();
  const raw = fs.readFileSync(STORE_FILE, "utf-8");
  try {
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveSeenIds(idsSet) {
  ensureStore();
  // Garde les 5000 derniers IDs max pour eviter que le fichier grossisse indefiniment
  const arr = Array.from(idsSet).slice(-5000);
  fs.writeFileSync(STORE_FILE, JSON.stringify(arr, null, 2));
}

function clearSeenIds() {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify([]));
}

module.exports = { loadSeenIds, saveSeenIds, clearSeenIds };
