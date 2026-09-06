const axios = require("axios");
const cheerio = require("cheerio");
const { isIrrelevantHref, resolveUrl } = require("../urlUtil");
const { extractLocalityFromPostalCode } = require("../localityUtil");

// CNAL (Maison des Notaires de Liège) - structure confirmee: chaque annonce
// affiche prix, chambres et adresse complete (code postal + ville) en texte clair.
// Certaines annonces redirigent vers le site propre de l'etude notariale
// (ex: notaire-mathonet.be/immo/detail/...) plutot que de rester sur cnal.be -
// dans ce cas l'URL ne contient pas la ville, donc on se base sur le texte de
// l'adresse (code postal) plutot que sur l'URL pour determiner la localite.

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "fr-BE,fr;q=0.9",
};

const LIST_URL = "https://cnal.be/immobilier";

async function scrapeCnal(criteria) {
  const results = [];

  try {
    const { data: html } = await axios.get(LIST_URL, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(html);
    const seenIdsThisPage = new Set();

    $("a[href*='/immobilier/'], a[href*='/immo/detail/']").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      if (isIrrelevantHref(href)) return;
      if (/\/(contact|privacy)/i.test(href)) return;
      const idMatch = href.match(/(\d{5,})/);
      if (!idMatch) return;
      const id = `cnal-${idMatch[1]}`;
      if (seenIdsThisPage.has(id)) return;
      seenIdsThisPage.add(id);

      const card = $(el).parent().parent();
      const cardText = card.text().replace(/\s+/g, " ").trim();

      const priceMatch = cardText.match(/([\d][\d.,]{3,})\s*€/);
      const bedroomMatch = cardText.match(/(\d+)\s*ch\b/i);
      const terrainMatch = cardText.match(/(\d[\d.,]*)\s*m2(?!.*m2)/i); // dernier m2 mentionne

      results.push({
        id,
        source: "cnal",
        title: $(el).text().trim().slice(0, 120) || cardText.slice(0, 80),
        url: resolveUrl("cnal.be", href),
        price: priceMatch ? priceMatch[1] + " €" : null,
        bedrooms: bedroomMatch ? bedroomMatch[1] : null,
        landArea: terrainMatch ? terrainMatch[1] : null,
        locality: extractLocalityFromPostalCode(cardText, criteria.localites) || null,
      });
    });
  } catch (err) {
    console.error("[cnal] erreur:", err.response?.status || err.message);
  }

  return results;
}

module.exports = { scrapeCnal };
