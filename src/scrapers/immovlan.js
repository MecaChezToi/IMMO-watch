const axios = require("axios");
const cheerio = require("cheerio");
const { isIrrelevantHref, resolveUrl } = require("../urlUtil");
const { extractLocalityFromUrl } = require("../localityUtil");

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "fr-BE,fr;q=0.9,en;q=0.8",
};

function buildSearchUrl(criteria, localite) {
  const params = new URLSearchParams({
    noindex: "1",
    transactiontypes: criteria.transaction === "for-rent" ? "2" : "1",
    towns: localite,
    maxprice: criteria.prix_max || "",
    minprice: criteria.prix_min || "",
    noofbedrooms: criteria.chambres_min || "",
  });
  return `https://www.immovlan.be/fr/recherche/te-koop/huis/${encodeURIComponent(
    localite
  )}?${params.toString()}`;
}

async function scrapeImmovlan(criteria) {
  const results = [];

  for (const localite of criteria.localites) {
    const url = buildSearchUrl(criteria, localite);
    try {
      const { data: html } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
      const $ = cheerio.load(html);
      const seenIdsThisPage = new Set();

      $("a[href*='/detail/'], a[href*='/te-koop/']").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
      if (isIrrelevantHref(href)) return;
        const idMatch = href.match(/(\d{6,})/);
        if (!idMatch) return;
        const id = `immovlan-${idMatch[1]}`;
        if (seenIdsThisPage.has(id)) return;
        seenIdsThisPage.add(id);

        const card = $(el).parent().parent(); // scope borne (2 niveaux) plutot qu'un closest() qui peut remonter trop large
        const cardText = card.text().replace(/\s+/g, " ").trim();
        const priceMatch = cardText.match(/([\d.,]{4,})\s*€/);
        const bedroomMatch = cardText.match(/(\d+)\s*(ch\.|chambre)/i);

        results.push({
          id,
          source: "immovlan",
          title: $(el).text().trim().slice(0, 120) || cardText.slice(0, 80),
          url: resolveUrl("www.immovlan.be", href),
          price: priceMatch ? priceMatch[1] + " €" : null,
          bedrooms: bedroomMatch ? bedroomMatch[1] : null,
          landArea: null,
          locality: extractLocalityFromUrl(href, criteria.localites) || null,
        });
      });
    } catch (err) {
      console.error(`[immovlan] erreur sur ${localite}:`, err.response?.status || err.message);
    }
  }

  return results;
}

module.exports = { scrapeImmovlan };
