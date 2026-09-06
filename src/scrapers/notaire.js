const axios = require("axios");
const cheerio = require("cheerio");
const { isIrrelevantHref, resolveUrl } = require("../urlUtil");
const { extractLocalityFromUrl, extractLocalityFromPostalCode } = require("../localityUtil");

// ATTENTION: scraper "best effort", structure HTML non verifiee en detail (pas de
// fetch de test reussi/complet sur ce site). A TESTER avec /scan ou npm run once -
// si 0 resultat en continu alors que tu sais qu'il y a des biens en vente, ouvre le
// site dans ton navigateur, F12 > Elements, et adapte les selecteurs ci-dessous.
//
// RISQUE SUPPLEMENTAIRE ICI: notaire.be semble utiliser du rendu cote client (JS)
// pour afficher les resultats de recherche - un simple fetch HTML pourrait ne
// renvoyer qu'une coquille vide sans les annonces. Si ce scraper renvoie
// systematiquement 0 resultat, c'est la cause la plus probable, et ca demanderait
// un navigateur headless (Playwright/Puppeteer) pour contourner - hors scope pour
// l'instant vu la complexite que ca ajouterait au projet.
// Le parametre "province=Liège" dans l'URL ci-dessous est une supposition, pas
// confirme comme fonctionnel.

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "fr-BE,fr;q=0.9",
};

const LIST_URL = "https://immo.notaire.be/fr/biens-a-vendre?gender=SALE&province=Li%C3%A8ge";

async function scrapeNotaire(criteria) {
  const results = [];

  try {
    const { data: html } = await axios.get(LIST_URL, { headers: HEADERS, timeout: 15000, maxRedirects: 5 });
    const $ = cheerio.load(html);
    const seenIdsThisPage = new Set();

    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      if (isIrrelevantHref(href)) return;
      if (/\/(contact|estimation|about|nos-services|equipe|a-louer|mentions-legales|cookies)/i.test(href)) return;
      const idMatch = href.match(/(\d{4,})(?:[/?#]|$)/);
      if (!idMatch) return;
      const id = `notaire-${idMatch[1]}`;
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
        source: "notaire",
        title: $(el).text().trim().slice(0, 120) || cardText.slice(0, 80),
        url: resolveUrl("immo.notaire.be", href),
        price: priceMatch ? priceMatch[1] + " €" : null,
        bedrooms: bedroomMatch ? bedroomMatch[1] : null,
        landArea: terrainMatch ? terrainMatch[1] : null,
        locality,
      });
    });
  } catch (err) {
    console.error("[notaire] erreur:", err.response?.status || err.message);
  }

  return results;
}

module.exports = { scrapeNotaire };
