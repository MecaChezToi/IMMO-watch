const axios = require("axios");
const cheerio = require("cheerio");
const { extractLocalityFromPostalCode } = require("../localityUtil");

// AG Immobilière (WordPress) - structure confirmee: page /a-vendre/ liste les biens
// avec prix, code postal+ville, chambres directement en texte. Les liens de fiche
// suivent le format /biens-a-vendre/<type>-<postal>-<ville>-ref<id>/, le code postal
// est donc directement dans l'URL.

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "fr-BE,fr;q=0.9",
};

const LIST_URL = "https://www.agimmobiliere.be/a-vendre/";

async function scrapeAgImmobiliere(criteria) {
  const results = [];

  try {
    const { data: html } = await axios.get(LIST_URL, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(html);
    const seenIdsThisPage = new Set();

    $("a[href*='/biens-a-vendre/']").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const idMatch = href.match(/ref(\d+)/i);
      if (!idMatch) return;
      const id = `agimmobiliere-${idMatch[1]}`;
      if (seenIdsThisPage.has(id)) return;
      seenIdsThisPage.add(id);

      const card = $(el).parent().parent();
      const cardText = card.text().replace(/\s+/g, " ").trim();
      const priceMatch = cardText.match(/([\d.,]{4,})\s*€/);
      const bedroomMatch = cardText.match(/(\d+)\s*(ch\.|chambre)/i);
      const terrainMatch = cardText.match(/(\d[\d.,]*)\s*m²(?!.*m²)/); // dernier m² mentionne = souvent le terrain

      results.push({
        id,
        source: "agimmobiliere",
        title: $(el).text().trim().slice(0, 120) || cardText.slice(0, 80),
        url: href.startsWith("http") ? href : `https://www.agimmobiliere.be${href}`,
        price: priceMatch ? priceMatch[1] + " €" : null,
        bedrooms: bedroomMatch ? bedroomMatch[1] : null,
        landArea: terrainMatch ? terrainMatch[1] : null,
        locality: extractLocalityFromPostalCode(href, criteria.localites) || null,
      });
    });
  } catch (err) {
    console.error("[agimmobiliere] erreur:", err.response?.status || err.message);
  }

  return results;
}

module.exports = { scrapeAgImmobiliere };
