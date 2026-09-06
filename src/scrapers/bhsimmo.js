const axios = require("axios");
const cheerio = require("cheerio");
const { isIrrelevantHref, resolveUrl } = require("../urlUtil");

// ATTENTION: ce scraper n'a pas pu etre verifie contre le vrai HTML du site -
// bhsimmo.be a un robots.txt qui bloque explicitement l'acces automatise, donc
// impossible d'inspecter la page a l'avance. C'est un scraper "best effort" base
// sur les patterns standards des sites d'agences immo belges.
//
// Note ethique: contrairement aux autres sites de ce projet, ici le robots.txt
// interdit explicitement le scraping (pas juste une absence d'API officielle).
// Pour un usage strictement personnel a frequence raisonnable (30 min) c'est un
// risque mineur, mais si jamais le site bloque l'IP du VPS ou envoie un mail,
// c'est la raison la plus probable - desactive `bhsimmo` dans criteria.json si besoin.
//
// A TESTER en premier avec `npm run once`. Si 0 resultat, ouvre le site dans ton
// navigateur, F12 > Elements, et adapte les selecteurs ci-dessous a la vraie structure.

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "fr-BE,fr;q=0.9",
};

const BHS_URL = "https://bhsimmo.be/nos-biens-a-vendre";

async function scrapeBhsImmo(criteria) {
  const results = [];

  try {
    const { data: html } = await axios.get(BHS_URL, {
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
      if (/\/(contact|estimation|about|nos-services|equipe|a-louer)/i.test(href)) return;
      const idMatch = href.match(/(\d{4,})(?:[/?#]|$)/);
      if (!idMatch) return;
      const id = `bhsimmo-${idMatch[1]}`;
      if (seenIdsThisPage.has(id)) return;
      seenIdsThisPage.add(id);

      const card = $(el).parent().parent(); // scope borne (2 niveaux) plutot qu'un closest() qui peut remonter trop large
      const cardText = card.text().replace(/\s+/g, " ").trim();
      const priceMatch = cardText.match(/([\d.,]{4,})\s*€/);
      const bedroomMatch = cardText.match(/(\d+)\s*(ch\.|chambre)/i);
      const localityMatch = cardText.match(
        new RegExp(`(${criteria.localites.join("|")})`, "i")
      );

      results.push({
        id,
        source: "bhsimmo",
        title: $(el).text().trim().slice(0, 120) || cardText.slice(0, 80),
        url: resolveUrl("bhsimmo.be", href),
        price: priceMatch ? priceMatch[1] + " €" : null,
        bedrooms: bedroomMatch ? bedroomMatch[1] : null,
        landArea: null,
        locality: localityMatch ? localityMatch[1] : null,
      });
    });
  } catch (err) {
    console.error("[bhsimmo] erreur:", err.response?.status || err.message);
  }

  return results;
}

module.exports = { scrapeBhsImmo };
