const axios = require("axios");
const cheerio = require("cheerio");
const { extractLocalityFromUrl, POSTAL_CODES } = require("../localityUtil");

// NOTE IMPORTANTE:
// Immoweb est protege par Cloudflare et BLOQUE LES IP DE DATACENTER (confirme:
// plusieurs outils de scraping tiers documentent explicitement ce blocage et
// recommandent un proxy residentiel belge pour passer). Ton VPS (Hetzner,
// datacenter allemand) tombe dans la categorie bloquee. Meme avec l'URL de
// recherche correcte ci-dessous, il est possible que ce scraper ne remonte
// jamais de resultats utilisables depuis ton VPS. Si les logs montrent "0
// candidats" en continu pour immoweb specifiquement (alors que roufosse/bhsimmo/
// immodemarneffe remontent des choses), c'est probablement ce blocage - la seule
// solution fiable est un service de proxy residentiel payant (ScraperAPI, Zyte,
// Bright Data, Apify...), pas quelque chose qu'on peut resoudre gratuitement.
//
// Parametre de recherche confirme fonctionnel: postalCodes (codes postaux BE,
// separes par des virgules), sur /en/search/<type>/<transaction>?countries=BE.

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "fr-BE,fr;q=0.9,en;q=0.8",
};

// Codes postaux pour les communes courantes de la region de Liege. Complete cette
// liste si tu ajoutes des localites via /localites qui n'y figurent pas encore.
function resolvePostalCodes(localites) {
  const codes = localites
    .map((loc) => POSTAL_CODES[loc.toLowerCase()])
    .filter(Boolean);
  return [...new Set(codes)];
}

function buildSearchUrl(criteria) {
  const codes = resolvePostalCodes(criteria.localites);
  const params = new URLSearchParams({
    countries: "BE",
    orderBy: "newest",
  });
  if (codes.length) params.set("postalCodes", codes.join(","));
  if (criteria.prix_max) params.set("maxPrice", criteria.prix_max);
  if (criteria.prix_min) params.set("minPrice", criteria.prix_min);
  if (criteria.chambres_min) params.set("minBedroomCount", criteria.chambres_min);

  return `https://www.immoweb.be/fr/search/${criteria.type_bien || "house"}/${
    criteria.transaction || "for-sale"
  }?${params.toString()}`;
}

async function scrapeImmoweb(criteria) {
  const results = [];
  const url = buildSearchUrl(criteria);

  const inconnues = criteria.localites.filter((loc) => !POSTAL_CODES[loc.toLowerCase()]);
  if (inconnues.length) {
    console.warn(
      `[immoweb] code postal inconnu pour: ${inconnues.join(", ")} - ces villes ne seront pas cherchees sur Immoweb tant qu'un code postal n'est pas ajoute dans src/scrapers/immoweb.js`
    );
  }

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
        locality: extractLocalityFromUrl(href, criteria.localites) || null,
      });
    });
  } catch (err) {
    console.error(`[immoweb] erreur:`, err.response?.status || err.message);
  }

  return results;
}

module.exports = { scrapeImmoweb };

