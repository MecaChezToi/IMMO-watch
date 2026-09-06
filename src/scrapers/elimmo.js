const axios = require("axios");
const cheerio = require("cheerio");
const { extractLocalityFromUrl } = require("../localityUtil");

// El'Immo tourne sur le CMS "Whise" (confirme: "Powered by Whise" en pied de page).
// URL de l'endpoint de liste capturee directement depuis le HTML de la page
// (verbatim, pas une reconstruction a l'aveugle comme pour Immo de Marneffe).

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "fr-BE,fr;q=0.9",
};

const LIST_URL =
  "https://www.el-immo.be/fr/List/InfiniteScroll?json=" +
  encodeURIComponent(
    JSON.stringify({
      SliderList: false,
      SliderMultiAgencies: false,
      IsProject: false,
      PageMaximum: 0,
      FirstPage: true,
      CanGetNextPage: false,
      CMSListType: 1,
      SortParameter: 5,
      MaxItemsPerPage: 30,
      PageNumber: 0,
      EstateSearchParams: [
        { FieldName: "StatusIDList", FieldValue: [1] },
        { FieldName: "ShowDetails", FieldValue: true },
        { FieldName: "ShowRepresentatives", FieldValue: true },
        { FieldName: "CanHaveChildren", FieldValue: false },
      ],
      CustomQuery: null,
      jsonEstateParams: null,
      BaseEstateID: 0,
    })
  );

async function scrapeElImmo(criteria) {
  const results = [];

  try {
    const { data: html } = await axios.get(LIST_URL, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(html);
    const seenIdsThisPage = new Set();

    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      if (/\/(page|Contact|Estimation|immobilier-neuf)/i.test(href)) return;
      const idMatch = href.match(/(\d{4,})(?:[/?#]|$)/);
      if (!idMatch) return;
      const id = `elimmo-${idMatch[1]}`;
      if (seenIdsThisPage.has(id)) return;
      seenIdsThisPage.add(id);

      const card = $(el).parent().parent();
      const cardText = card.text().replace(/\s+/g, " ").trim();
      const priceMatch = cardText.match(/([\d.,]{4,})\s*€/);
      const bedroomMatch = cardText.match(/(\d+)\s*(ch\.|chambre)/i);

      results.push({
        id,
        source: "elimmo",
        title: $(el).text().trim().slice(0, 120) || cardText.slice(0, 80),
        url: href.startsWith("http") ? href : `https://www.el-immo.be${href}`,
        price: priceMatch ? priceMatch[1] + " €" : null,
        bedrooms: bedroomMatch ? bedroomMatch[1] : null,
        landArea: null,
        locality: extractLocalityFromUrl(href, criteria.localites) || null,
      });
    });
  } catch (err) {
    console.error("[elimmo] erreur:", err.response?.status || err.message);
  }

  return results;
}

module.exports = { scrapeElImmo };
