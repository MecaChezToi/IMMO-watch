const axios = require("axios");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function notifyListing(listing, attempt = 0) {
  if (!TOKEN || !CHAT_ID) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manquant, notification ignoree.");
    console.log("[nouvelle annonce]", listing.title, listing.price, listing.url);
    return;
  }

  const text =
    `🏠 Nouvelle annonce (${listing.source})\n` +
    `${listing.title}\n` +
    `💰 ${listing.price || "prix non precise"}\n` +
    (listing.bedrooms ? `🛏️ ${listing.bedrooms} chambre(s)\n` : "") +
    (listing.landArea ? `🌳 Terrain: ${listing.landArea} m²\n` : "") +
    (listing.locality ? `📍 ${listing.locality}\n` : "") +
    `${listing.url}`;

  try {
    await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text,
      disable_web_page_preview: false,
    });
  } catch (err) {
    const retryAfter = err.response?.data?.parameters?.retry_after;
    if (retryAfter && attempt < 3) {
      // Telegram limite le debit d'envoi (~1 msg/sec par chat). On respecte le
      // delai indique et on reessaie, plutot que de perdre la notification.
      console.warn(`[telegram] rate limit, nouvelle tentative dans ${retryAfter}s`);
      await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
      return notifyListing(listing, attempt + 1);
    }
    console.error("[telegram] Echec envoi notification:", err.response?.data || err.message);
  }
}

module.exports = { notifyListing };
