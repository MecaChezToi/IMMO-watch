const axios = require("axios");
const cheerio = require("cheerio");

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "fr-BE,fr;q=0.9",
};

// Les cartes de resultats de recherche exposent rarement le prix/chambres de facon
// fiable en HTML brut. Par contre chaque fiche d'annonce a des balises meta
// og:title / og:description destinees aux apercus (Telegram, Facebook...) qui
// contiennent quasi toujours "Prix: X €", "N chambres", "Y m²" de facon structuree.
// On va chercher cette info directement sur la fiche, mais UNIQUEMENT pour les
// annonces candidates (pas encore vues) afin de ne pas multiplier les requetes.
async function enrichFromDetailPage(listing) {
  try {
    const { data: html } = await axios.get(listing.url, { headers: HEADERS, timeout: 12000 });
    const $ = cheerio.load(html);

    const ogTitle = $('meta[property="og:title"]').attr("content") || "";
    const ogDesc = $('meta[property="og:description"]').attr("content") || "";
    const combined = `${ogTitle} ${ogDesc}`;

    // On ecrase les valeurs deja presentes (potentiellement fausses, recuperees depuis
    // une carte de recherche mal delimitee) par celles, plus fiables, de la fiche elle-meme.
    const priceMatch = combined.match(/([\d][\d.,]{3,})\s*€/);
    if (priceMatch) listing.price = priceMatch[1] + " €";

    const bedroomMatch = combined.match(/(\d+)\s*(ch\.|chambre)/i);
    if (bedroomMatch) listing.bedrooms = bedroomMatch[1];

    const terrainMatch = combined.match(/terrain[^\d]{0,10}(\d[\d.,]*)\s*m²/i);
    if (terrainMatch) listing.landArea = terrainMatch[1];

    if (ogTitle) listing.title = ogTitle.slice(0, 150);
  } catch (err) {
    console.warn(`[enrich] echec sur ${listing.url}:`, err.response?.status || err.message);
  }

  return listing;
}

module.exports = { enrichFromDetailPage };
