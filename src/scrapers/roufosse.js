const axios = require("axios");
const cheerio = require("cheerio");
const { isIrrelevantHref, resolveUrl } = require("../urlUtil");
const { extractLocalityFromUrl, extractLocalityFromPostalCode } = require("../localityUtil");

// ATTENTION: contrairement aux autres scrapers, celui-ci n'a pas pu etre verifie
// contre le vrai HTML du site (probleme de redirection lors des tests). C'est un
// scraper "best effort" base sur les patterns standards des sites d'agences immo
// belges. A TESTER en premier avec `npm run once` et a ajuster si 0 resultat ne
// remonte alors que tu sais qu'il y a des biens en vente sur le site.
//
// Piste de debug si ca ne marche pas: le site fait peut-etre une redirection
// (www vs non-www, ou langue par defaut) qui bloque un client HTTP simple.
// Essaie de changer ROUFOSSE_URL ci-dessous par l'URL exacte que ton navigateur
// affiche une fois la page chargee.

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "fr-BE,fr;q=0.9",
};

const ROUFOSSE_URL = "https://www.roufosse.be/fr/a-vendre/";

async function scrapeRoufosse(criteria) {
  const results = [];

  try {
    const { data: html } = await axios.get(ROUFOSSE_URL, {
      headers: HEADERS,
      timeout: 15000,
      maxRedirects: 5,
    });
    const $ = cheerio.load(html);
    const seenIdsThisPage = new Set();

    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      if (isIrrelevantHref(href)) return;
      if (/\/(contact|estimation|about|nos-services|equipe)/i.test(href)) return;
      const path = href.split("?")[0];
      const idMatch = path.match(/(\d{4,})/);
      const id = idMatch ? `roufosse-${idMatch[1]}` : `roufosse-${path}`;
      if (seenIdsThisPage.has(id)) return;
      seenIdsThisPage.add(id);

      const card = $(el).parent().parent(); // scope borne (2 niveaux) plutot qu'un closest() qui peut remonter trop large
      const cardText = card.text().replace(/\s+/g, " ").trim();
      const priceMatch = cardText.match(/([\d.,]{4,})\s*€/);
      const bedroomMatch = cardText.match(/(\d+)\s*(ch\.|chambre)/i);
      const locality =
        extractLocalityFromUrl(href, criteria.localites) ||
        extractLocalityFromPostalCode(cardText, criteria.localites) ||
        null;

      results.push({
        id,
        source: "roufosse",
        title: $(el).text().trim().slice(0, 120) || cardText.slice(0, 80),
        url: resolveUrl("www.roufosse.be", href),
        price: priceMatch ? priceMatch[1] + " €" : null,
        bedrooms: bedroomMatch ? bedroomMatch[1] : null,
        landArea: null,
        locality,
      });
    });
  } catch (err) {
    console.error("[roufosse] erreur:", err.response?.status || err.message);
  }

  return results;
}

module.exports = { scrapeRoufosse };
