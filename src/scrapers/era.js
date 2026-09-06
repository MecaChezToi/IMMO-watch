const axios = require("axios");
const cheerio = require("cheerio");
const { isIrrelevantHref, resolveUrl } = require("../urlUtil");
const { extractLocalityFromUrl, extractLocalityFromPostalCode } = require("../localityUtil");

// ERA (confirme): URLs sans ID numerique, juste des slugs texte
// (ex: /fr/a-vendre/ivoz-ramet/maison/a-vendre-le-bonheur-en-grand-a-ivoz-ramet).
// On utilise le chemin complet comme identifiant plutot qu'un ID numerique.

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "fr-BE,fr;q=0.9",
};

const LIST_URL = "https://www.era.be/fr/a-vendre";

async function scrapeEra(criteria) {
  const results = [];

  try {
    const { data: html } = await axios.get(LIST_URL, { headers: HEADERS, timeout: 15000, maxRedirects: 5 });
    const $ = cheerio.load(html);
    const seenIdsThisPage = new Set();

    $("a[href*='/a-vendre/']").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      if (isIrrelevantHref(href)) return;
      const path = href.split("?")[0];
      if (path === "/fr/a-vendre" || path === "/fr/a-vendre/") return;
      const segments = path.split("/").filter(Boolean);
      if (segments.length < 4) return; // veut /fr/a-vendre/<ville>/<type>/<titre>

      const idMatch = path.match(/(\d{4,})/);
      const id = idMatch ? `era-${idMatch[1]}` : `era-${path}`;
      if (seenIdsThisPage.has(id)) return;
      seenIdsThisPage.add(id);

      const card = $(el).parent().parent();
      const cardText = card.text().replace(/\s+/g, " ").trim();
      const priceMatch = cardText.match(/€\s*([\d][\d.,]{3,})/);
      const bedroomMatch = cardText.match(/(\d+)\s*chbre/i);
      const terrainMatch = cardText.match(/(\d[\d.,]*)\s*m²\s*de\s*surface\s*de\s*terrain/i);

      const locality =
        extractLocalityFromUrl(href, criteria.localites) ||
        extractLocalityFromPostalCode(cardText, criteria.localites) ||
        null;

      results.push({
        id,
        source: "era",
        title: $(el).text().trim().slice(0, 120) || cardText.slice(0, 80),
        url: resolveUrl("www.era.be", href),
        price: priceMatch ? priceMatch[1] + " €" : null,
        bedrooms: bedroomMatch ? bedroomMatch[1] : null,
        landArea: terrainMatch ? terrainMatch[1] : null,
        locality,
      });
    });
  } catch (err) {
    console.error("[era] erreur:", err.response?.status || err.message);
  }

  return results;
}

module.exports = { scrapeEra };
