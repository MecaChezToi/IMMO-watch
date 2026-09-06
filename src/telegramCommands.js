const axios = require("axios");
const { loadCriteria, saveCriteria } = require("./criteriaStore");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const API = `https://api.telegram.org/bot${TOKEN}`;

let offset = 0;

async function sendReply(text) {
  if (!TOKEN || !CHAT_ID) return;
  try {
    await axios.post(`${API}/sendMessage`, {
      chat_id: CHAT_ID,
      text,
    });
  } catch (err) {
    console.error("[telegram-commands] echec envoi reponse:", err.response?.data || err.message);
  }
}

function formatCriteres(c) {
  return (
    `📋 Critères actuels\n` +
    `💰 Prix: ${c.prix_min || 0} € - ${c.prix_max || "∞"} €\n` +
    `🛏️ Chambres min: ${c.chambres_min || 0}\n` +
    `🌳 Terrain min: ${c.superficie_terrain_min_m2 || 0} m²\n` +
    `🏠 Surface habitable min: ${c.superficie_habitable_min_m2 || 0} m²\n` +
    `📍 Localités: ${c.localites.join(", ")}\n` +
    `🚫 Mots exclus: ${c.mots_cles_exclus?.join(", ") || "aucun"}\n` +
    `🌐 Sites actifs: ${Object.entries(c.sites_actifs || {})
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ")}`
  );
}

const HELP_TEXT =
  `🤖 Commandes disponibles\n\n` +
  `/prix_max 225000 — prix maximum\n` +
  `/prix_min 100000 — prix minimum\n` +
  `/chambres_min 4 — nombre de chambres minimum\n` +
  `/superficie_terrain 500 — superficie de terrain minimum (m²)\n` +
  `/superficie_habitable 90 — surface habitable minimum (m²)\n` +
  `/localites Liège, Flémalle, Seraing — remplace la liste des villes (séparées par des virgules)\n` +
  `/mots_exclus ruine, à rénover — annonces contenant un de ces mots dans le titre sont ignorées (vide = aucun filtre)\n` +
  `/criteres — affiche les critères actuels\n` +
  `/aide — affiche ce message`;

async function handleCommand(text) {
  const criteria = loadCriteria();
  const [rawCmd, ...rest] = text.trim().split(/\s+/);
  const cmd = rawCmd.toLowerCase();
  const arg = rest.join(" ").trim();

  switch (cmd) {
    case "/prix_max": {
      const val = parseInt(arg.replace(/[^\d]/g, ""), 10);
      if (isNaN(val)) return sendReply("⚠️ Donne un nombre, ex: /prix_max 225000");
      criteria.prix_max = val;
      saveCriteria(criteria);
      return sendReply(`✅ Prix max mis à jour: ${val} €`);
    }

    case "/prix_min": {
      const val = parseInt(arg.replace(/[^\d]/g, ""), 10);
      if (isNaN(val)) return sendReply("⚠️ Donne un nombre, ex: /prix_min 100000");
      criteria.prix_min = val;
      saveCriteria(criteria);
      return sendReply(`✅ Prix min mis à jour: ${val} €`);
    }

    case "/chambres_min": {
      const val = parseInt(arg.replace(/[^\d]/g, ""), 10);
      if (isNaN(val)) return sendReply("⚠️ Donne un nombre, ex: /chambres_min 4");
      criteria.chambres_min = val;
      saveCriteria(criteria);
      return sendReply(`✅ Chambres minimum mises à jour: ${val}`);
    }

    case "/superficie_terrain": {
      const val = parseInt(arg.replace(/[^\d]/g, ""), 10);
      if (isNaN(val)) return sendReply("⚠️ Donne un nombre, ex: /superficie_terrain 500");
      criteria.superficie_terrain_min_m2 = val;
      saveCriteria(criteria);
      return sendReply(`✅ Superficie terrain minimum mise à jour: ${val} m²`);
    }

    case "/superficie_habitable": {
      const val = parseInt(arg.replace(/[^\d]/g, ""), 10);
      if (isNaN(val)) return sendReply("⚠️ Donne un nombre, ex: /superficie_habitable 90");
      criteria.superficie_habitable_min_m2 = val;
      saveCriteria(criteria);
      return sendReply(`✅ Surface habitable minimum mise à jour: ${val} m²`);
    }

    case "/localites": {
      if (!arg) return sendReply("⚠️ Donne une liste, ex: /localites Liège, Flémalle, Seraing");
      const villes = arg.split(",").map((v) => v.trim()).filter(Boolean);
      if (!villes.length) return sendReply("⚠️ Liste vide, rien de change.");
      criteria.localites = villes;
      saveCriteria(criteria);
      return sendReply(`✅ Localités mises à jour: ${villes.join(", ")}`);
    }

    case "/mots_exclus": {
      const mots = arg
        ? arg.split(",").map((m) => m.trim()).filter(Boolean)
        : [];
      criteria.mots_cles_exclus = mots;
      saveCriteria(criteria);
      return sendReply(
        mots.length
          ? `✅ Mots exclus mis à jour: ${mots.join(", ")}`
          : `✅ Mots exclus vidés — plus aucun mot-clé n'est filtré.`
      );
    }

    case "/criteres":
      return sendReply(formatCriteres(criteria));

    case "/aide":
    case "/start":
    case "/help":
      return sendReply(HELP_TEXT);

    default:
      return sendReply(`❓ Commande inconnue. Envoie /aide pour la liste des commandes.`);
  }
}

async function pollOnce() {
  const { data } = await axios.get(`${API}/getUpdates`, {
    params: { offset, timeout: 25 },
    timeout: 30000,
  });

  for (const update of data.result || []) {
    offset = update.update_id + 1;
    const message = update.message;
    if (!message || !message.text) continue;

    // Securite: on ignore tout message qui ne vient pas du chat configure,
    // pour eviter que n'importe qui puisse changer tes criteres.
    if (String(message.chat.id) !== String(CHAT_ID)) {
      console.warn(`[telegram-commands] message ignore, chat_id inconnu: ${message.chat.id}`);
      continue;
    }

    if (message.text.startsWith("/")) {
      await handleCommand(message.text).catch((err) =>
        console.error("[telegram-commands] erreur traitement commande:", err.message)
      );
    }
  }
}

async function startCommandListener() {
  if (!TOKEN || !CHAT_ID) {
    console.warn("[telegram-commands] TOKEN/CHAT_ID manquant, ecouteur de commandes desactive.");
    return;
  }

  // Au demarrage, on saute tout l'historique de messages en attente (evite de
  // rejouer de vieilles commandes apres un redeploiement)
  try {
    const { data } = await axios.get(`${API}/getUpdates`, { params: { offset: -1 } });
    if (data.result?.length) {
      offset = data.result[data.result.length - 1].update_id + 1;
    }
  } catch (err) {
    console.error("[telegram-commands] echec init offset:", err.message);
  }

  console.log("[telegram-commands] ecouteur de commandes demarre");

  // Boucle de long-polling infinie
  while (true) {
    try {
      await pollOnce();
    } catch (err) {
      console.error("[telegram-commands] erreur polling:", err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

module.exports = { startCommandListener };
