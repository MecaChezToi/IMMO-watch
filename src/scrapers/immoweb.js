const axios = require("axios");
const cheerio = require("cheerio");
const { extractLocalityFromUrl } = require("../localityUtil");

// NOTE IMPORTANTE:
// Immoweb est protege par Cloudflare et peut bloquer les IP de serveur/VPS
// (contrairement a une IP residentielle "normale"). Si ce scraper renvoie
// 0 resultat ou une erreur 403, deux options:
//   1) Reduire la frequence de scan (ex: 1x/heure au lieu de toutes les 20 min)
//   2) Passer par un service de proxy residentiel (ScraperAPI, Zyte, Bright Data...)
//      et l'injecter dans l'URL axios ci-dessous.
// Les selecteurs HTML ci-dessous sont bases sur la structure connue du site
// et sur les patterns d'URL (/classified/) qui sont plus stables que les
// classes CSS. Si Immoweb change sa structure, c'est ici qu'il faut ajuster.

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "fr-BE,fr;q=0.9,en;q=0.8",
};

function buildSearchUrl(criteria, localite) {
  const params = new URLSearchParams({
    countries: "BE",
    maxPrice: criteria.prix_max || "",
    minPrice: criteria.prix_min || "",
    minBedroomCount: criteria.chambres_min || "",
    minSurface: criteria.superficie_habitable_min_m2 || "",
    orderBy: "newest",
  });
  return `https://www.immoweb.be/fr/recherche/${criteria.type_bien || "house"}/${
    criteria.transaction || "for-sale"
  }/${encodeURIComponent(localite)}?${params.toString()}`;
}

async function scrapeImmoweb(criteria) {
  const results = [];

  for (const localite of criteria.localites) {
    const url = buildSearchUrl(criteria, localite);
    try {
      const { data: html } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
      const $ = cheerio.load(html);

      const seenIdsThisPage = new Set();

      $("a[href*='/classified/'], a[href*='/annonce/']").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        const idMatch = href.match(/(\d{6,})/);
        if (!idMatch) return;
        const id = `immoweb-${idMatch[1]}`;
        if (seenIdsThisPage.has(id)) return;
        seenIdsThisPage.add(id);

        const card = $(el).parent().parent(); // scope borne (2 niveaux) plutot qu'un closest() qui peut remonter trop large
        const cardText = card.text().replace(/\s+/g, " ").trim();

        const priceMatch = cardText.match(/([\d.,]{4,})\s*€/);
        const bedroomMatch = cardText.match(/(\d+)\s*(ch\.|chambre)/i);

        results.push({
          id,
          source: "immoweb",
          title: $(el).text().trim().slice(0, 120) || cardText.slice(0, 80),
          url: href.startsWith("http") ? href : `https://www.immoweb.be${href}`,
          price: priceMatch ? priceMatch[1] + " €" : null,
          bedrooms: bedroomMatch ? bedroomMatch[1] : null,
          landArea: null,
          // On ne fait plus confiance au fait que la recherche par URL ait vraiment
          // filtre sur cette ville (constat: Immoweb renvoie parfois des resultats
          // hors zone). On verifie la vraie localite dans l'URL de l'annonce.
          locality: extractLocalityFromUrl(href, criteria.localites) || null,
        });
      });
    } catch (err) {
      console.error(`[immoweb] erreur sur ${localite}:`, err.response?.status || err.message);
    }
  }

  return results;
}

module.exports = { scrapeImmoweb };
