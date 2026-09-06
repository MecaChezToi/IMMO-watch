const axios = require("axios");
const cheerio = require("cheerio");
const { extractLocalityFromUrl, extractLocalityFromPostalCode } = require("../localityUtil");

// ATTENTION: scraper "best effort", structure HTML non verifiee en detail (pas de
// fetch de test reussi/complet sur ce site). A TESTER avec /scan ou npm run once -
// si 0 resultat en continu alors que tu sais qu'il y a des biens en vente, ouvre le
// site dans ton navigateur, F12 > Elements, et adapte les selecteurs ci-dessous.

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "fr-BE,fr;q=0.9",
};

const LIST_URL = "https://www.skyimmo.be/a-vendre/";

async function scrapeSkyImmo(criteria) {
  const results = [];

  try {
    const { data: html } = await axios.get(LIST_URL, { headers: HEADERS, timeout: 15000, maxRedirects: 5 });
    const $ = cheerio.load(html);
    const seenIdsThisPage = new Set();

    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      if (/\/(contact|estimation|about|nos-services|equipe|a-louer|mentions-legales|cookies)/i.test(href)) return;
      const idMatch = href.match(/(\d{4,})(?:[/?#]|$)/);
      if (!idMatch) return;
      const id = `skyimmo-${idMatch[1]}`;
      if (seenIdsThisPage.has(id)) return;
      seenIdsThisPage.add(id);

      const card = $(el).parent().parent();
      const cardText = card.text().replace(/\s+/g, " ").trim();
      const priceMatch = cardText.match(/([\d.,]{4,})\s*€/);
      const bedroomMatch = cardText.match(/(\d+)\s*(ch\.|chambre)/i);
      const terrainMatch = cardText.match(/terrain[^\d]{0,15}(\d[\d.,]*)\s*m²/i);

      const locality =
        extractLocalityFromUrl(href, criteria.localites) ||
        extractLocalityFromPostalCode(cardText, criteria.localites) ||
        null;

      results.push({
        id,
        source: "skyimmo",
        title: $(el).text().trim().slice(0, 120) || cardText.slice(0, 80),
        url: href.startsWith("http") ? href : `https://www.skyimmo.be${href}`,
        price: priceMatch ? priceMatch[1] + " €" : null,
        bedrooms: bedroomMatch ? bedroomMatch[1] : null,
        landArea: terrainMatch ? terrainMatch[1] : null,
        locality,
      });
    });
  } catch (err) {
    console.error("[skyimmo] erreur:", err.response?.status || err.message);
  }

  return results;
}

module.exports = { scrapeSkyImmo };
