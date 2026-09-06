const { scrapeImmoweb } = require("./scrapers/immoweb");
const { scrapeImmovlan } = require("./scrapers/immovlan");
const { scrapeZimmo } = require("./scrapers/zimmo");
const { scrapeImmoDeMarneffe } = require("./scrapers/immodemarneffe");
const { scrapeRoufosse } = require("./scrapers/roufosse");
const { scrapeBhsImmo } = require("./scrapers/bhsimmo");
const { scrapeElImmo } = require("./scrapers/elimmo");
const { scrapeAgImmobiliere } = require("./scrapers/agimmobiliere");
const { scrapeEra } = require("./scrapers/era");
const { scrapeInfinityImmo } = require("./scrapers/infinityimmo");
const { scrapeEcoImmo } = require("./scrapers/ecoimmo");
const { scrapeIgg } = require("./scrapers/igg");
const { scrapeSkyImmo } = require("./scrapers/skyimmo");
const { scrapeNotaire } = require("./scrapers/notaire");
const { loadSeenIds, saveSeenIds } = require("./store");
const { notifyListing } = require("./telegram");
const { enrichFromDetailPage } = require("./detailFetcher");
const { loadCriteria } = require("./criteriaStore");

function parsePrice(priceStr) {
  if (!priceStr) return null;
  const digits = priceStr.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : null;
}

function wordMatches(haystack, needle) {
  if (!haystack) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^a-zà-ÿ])${escaped}([^a-zà-ÿ]|$)`, "i");
  return re.test(haystack);
}

function passesExclusionAndLocality(listing, criteria) {
  if (criteria.mots_cles_exclus?.length) {
    const lowerTitle = (listing.title || "").toLowerCase();
    if (criteria.mots_cles_exclus.some((mot) => lowerTitle.includes(mot.toLowerCase()))) {
      return false;
    }
  }

  // Localite : on ne fait plus confiance a un texte de carte ambigu. Si l'URL de
  // l'annonce ne contient pas explicitement une des villes voulues, on rejette -
  // pas de deuxieme chance via le titre (source de faux positifs constates: Binche,
  // Ingelmunster etc. remontaient a cause de ca).
  if (!listing.locality) return false;
  const matchLocalite = criteria.localites.some((loc) => wordMatches(listing.locality, loc));
  if (!matchLocalite) return false;

  return true;
}

function passesPriceAndRooms(listing, criteria) {
  // Prix : on exige un prix reellement detecte et dans les bornes. Une annonce
  // sans prix identifiable est rejetee plutot que laissee passer par defaut.
  const prix = parsePrice(listing.price);
  if (prix === null) return false;
  if (criteria.prix_max && prix > criteria.prix_max) return false;
  if (criteria.prix_min && prix < criteria.prix_min) return false;

  if (listing.bedrooms && criteria.chambres_min) {
    const chambres = parseInt(listing.bedrooms, 10);
    if (!isNaN(chambres) && chambres < criteria.chambres_min) return false;
  }

  if (listing.landArea && criteria.superficie_terrain_min_m2) {
    const terrain = parseInt(String(listing.landArea).replace(/[^\d]/g, ""), 10);
    if (!isNaN(terrain) && terrain < criteria.superficie_terrain_min_m2) return false;
  }

  return true;
}

let scanEnCours = false;

async function runScan() {
  if (scanEnCours) {
    console.warn("[scan] scan deja en cours, on saute ce declenchement");
    return { skipped: true };
  }
  scanEnCours = true;
  try {
    return await runScanInterne();
  } finally {
    scanEnCours = false;
  }
}

async function runScanInterne() {
  const criteria = loadCriteria();
  console.log(`[scan] demarrage - ${new Date().toLocaleString("fr-BE")}`);

  const seenIds = loadSeenIds();
  let allListings = [];

  if (criteria.sites_actifs?.immoweb) {
    allListings = allListings.concat(await scrapeImmoweb(criteria));
  }
  if (criteria.sites_actifs?.immovlan) {
    allListings = allListings.concat(await scrapeImmovlan(criteria));
  }
  if (criteria.sites_actifs?.zimmo) {
    allListings = allListings.concat(await scrapeZimmo(criteria));
  }
  if (criteria.sites_actifs?.immodemarneffe) {
    allListings = allListings.concat(await scrapeImmoDeMarneffe(criteria));
  }
  if (criteria.sites_actifs?.roufosse) {
    allListings = allListings.concat(await scrapeRoufosse(criteria));
  }
  if (criteria.sites_actifs?.bhsimmo) {
    allListings = allListings.concat(await scrapeBhsImmo(criteria));
  }
  if (criteria.sites_actifs?.elimmo) {
    allListings = allListings.concat(await scrapeElImmo(criteria));
  }
  if (criteria.sites_actifs?.agimmobiliere) {
    allListings = allListings.concat(await scrapeAgImmobiliere(criteria));
  }
  if (criteria.sites_actifs?.era) {
    allListings = allListings.concat(await scrapeEra(criteria));
  }
  if (criteria.sites_actifs?.infinityimmo) {
    allListings = allListings.concat(await scrapeInfinityImmo(criteria));
  }
  if (criteria.sites_actifs?.ecoimmo) {
    allListings = allListings.concat(await scrapeEcoImmo(criteria));
  }
  if (criteria.sites_actifs?.igg) {
    allListings = allListings.concat(await scrapeIgg(criteria));
  }
  if (criteria.sites_actifs?.skyimmo) {
    allListings = allListings.concat(await scrapeSkyImmo(criteria));
  }
  if (criteria.sites_actifs?.notaire) {
    allListings = allListings.concat(await scrapeNotaire(criteria));
  }

  console.log(`[scan] ${allListings.length} annonces recuperees au total`);

  const sansPrix = allListings.filter((l) => !l.price).length;
  const sansChambres = allListings.filter((l) => !l.bedrooms).length;
  const sansLocalite = allListings.filter((l) => !l.locality).length;
  console.log(
    `[scan] extraction incomplete - sans prix: ${sansPrix}, sans chambres: ${sansChambres}, sans localite: ${sansLocalite}`
  );

  const nouvelles = allListings.filter(
    (l) => !seenIds.has(l.id) && passesExclusionAndLocality(l, criteria)
  );

  console.log(`[scan] ${nouvelles.length} candidate(s) apres filtre localite`);

  for (const listing of nouvelles) {
    await enrichFromDetailPage(listing);
  }

  const sansPrixApresEnrichissement = nouvelles.filter((l) => !l.price).length;
  console.log(
    `[scan] apres enrichissement: ${sansPrixApresEnrichissement}/${nouvelles.length} candidat(s) toujours sans prix detecte`
  );

  const aNotifier = nouvelles.filter((l) => passesPriceAndRooms(l, criteria));

  console.log(`[scan] ${aNotifier.length} annonce(s) a notifier apres verification prix/chambres`);

  for (const listing of aNotifier) {
    await notifyListing(listing);
    seenIds.add(listing.id);
    await new Promise((r) => setTimeout(r, 1200));
  }

  for (const listing of allListings) {
    seenIds.add(listing.id);
  }

  saveSeenIds(seenIds);
  console.log(`[scan] termine - ${new Date().toLocaleString("fr-BE")}`);

  return {
    total: allListings.length,
    candidats: nouvelles.length,
    notifiees: aNotifier.length,
  };
}

module.exports = { runScan };
