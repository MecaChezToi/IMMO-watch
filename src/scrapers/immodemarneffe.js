const axios = require("axios");
const cheerio = require("cheerio");
const { isIrrelevantHref, resolveUrl } = require("../urlUtil");
const { extractLocalityFromUrl, extractLocalityFromPostalCode } = require("../localityUtil");

// Immobilière de Marneffe tourne sur le CMS "Whise" (tres repandu chez les agences
// immo belges). Ce CMS expose un endpoint AJAX qui renvoie directement les biens
// tries par date de creation (le plus recent en premier) - ideal pour notre cas
// d'usage, pas besoin de parser la page d'accueil.
//
// Si un jour ce endpoint casse (structure Whise mise a jour cote agence), le
// point de depart pour retrouver la nouvelle URL: ouvrir
// https://www.immodemarneffe.be/fr/2/chercher-bien/a-vendre dans un navigateur,
// ouvrir les DevTools > Network > filtrer "InfiniteScroll", scroller la page.

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "fr-BE,fr;q=0.9",
};

// json= construit a partir de ce qui a ete observe sur le site: StatusIDList [1] =
// biens actifs, PurposeIDList [1] = a vendre (vs a louer), trie par CreateDateTime DESC.
const LIST_URL =
  "https://www.immodemarneffe.be/fr/List/InfiniteScroll?json=" +
  encodeURIComponent(
    JSON.stringify({
      SliderList: false,
      SliderMultiAgencies: false,
      IsProject: false,
      PageMaximum: 0,
      FirstPage: true,
      CanGetNextPage: false,
      CMSListType: 99,
      SortParameter: 0,
      MaxItemsPerPage: 30,
      PageNumber: 0,
      EstateSearchParams: [
        { FieldName: "StatusIDList", FieldValue: [1] },
        { FieldName: "ShowDetails", FieldValue: true },
        { FieldName: "ShowRepresentatives", FieldValue: true },
        { FieldName: "CanHaveChildren", FieldValue: false },
      ],
      CustomQuery:
        '"StatusIDList":[1],"DisplayStatusIdList":[2,3,4],"SubDetailIdList":[57,1912,2056,2086,2087,2089,2090,2091,2390,2391,1914,2601,998,999,1849,1850,19],"PurposeIDList":[1],"PurposeStatusIDList":[1,5,15,22],"OrderByFields":["CreateDateTime DESC"]',
      jsonEstateParams: null,
      BaseEstateID: 0,
    })
  );

async function scrapeImmoDeMarneffe(criteria) {
  const results = [];

  try {
    const { data: html } = await axios.get(LIST_URL, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(html);
    const seenIdsThisPage = new Set();

    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      if (isIrrelevantHref(href)) return;
      // Cherche un ID numerique en fin d'URL (pattern classique Whise pour une fiche bien),
      // en excluant les liens de nav statiques du site (page/, Contact, Estimation...)
      if (/\/(page|Contact|Estimation|immobilier-neuf)/i.test(href)) return;
      const idMatch = href.match(/(\d{4,})(?:[/?#]|$)/);
      if (!idMatch) return;
      const id = `immodemarneffe-${idMatch[1]}`;
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
        source: "immodemarneffe",
        title: $(el).text().trim().slice(0, 120) || cardText.slice(0, 80),
        url: resolveUrl("www.immodemarneffe.be", href),
        price: priceMatch ? priceMatch[1] + " €" : null,
        bedrooms: bedroomMatch ? bedroomMatch[1] : null,
        landArea: null,
        locality,
      });
    });
  } catch (err) {
    console.error("[immodemarneffe] erreur:", err.response?.status || err.message);
  }

  return results;
}

module.exports = { scrapeImmoDeMarneffe };
