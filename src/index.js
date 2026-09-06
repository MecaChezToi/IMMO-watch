require("dotenv").config();
const cron = require("node-cron");

const { scrapeImmoweb } = require("./scrapers/immoweb");
const { scrapeImmovlan } = require("./scrapers/immovlan");
const { scrapeZimmo } = require("./scrapers/zimmo");
const { scrapeImmoDeMarneffe } = require("./scrapers/immodemarneffe");
const { scrapeRoufosse } = require("./scrapers/roufosse");
const { scrapeBhsImmo } = require("./scrapers/bhsimmo");
const { loadSeenIds, saveSeenIds } = require("./store");
const { notifyListing } = require("./telegram");
const { enrichFromDetailPage } = require("./detailFetcher");
const { loadCriteria } = require("./criteriaStore");
const { startCommandListener } = require("./telegramCommands");

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "*/30 * * * *"; // toutes les 30 min par defaut

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
    return;
  }
  scanEnCours = true;
  try {
    await runScanInterne();
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

  console.log(`[scan] ${allListings.length} annonces recuperees au total`);

  // Debug: aide a comprendre pourquoi une annonce passe ou pas le filtre
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

  // On enrichit systematiquement chaque candidat via sa fiche detaillee: le prix/chambres
  // extraits depuis la page de recherche ne sont pas assez fiables pour qu'on leur fasse
  // confiance telles quelles (risque de recuperer la mauvaise valeur si le HTML de la
  // carte de recherche est imbrique de facon inattendue).
  for (const listing of nouvelles) {
    await enrichFromDetailPage(listing);
  }

  const aNotifier = nouvelles.filter((l) => passesPriceAndRooms(l, criteria));

  console.log(`[scan] ${aNotifier.length} annonce(s) a notifier apres verification prix/chambres`);

  for (const listing of aNotifier) {
    await notifyListing(listing);
    seenIds.add(listing.id);
    // Petite pause entre chaque envoi pour rester sous la limite de debit Telegram
    // (~1 message/seconde par chat), evite les erreurs 429 en cas de beaucoup de resultats.
    await new Promise((r) => setTimeout(r, 1200));
  }

  // Marque aussi les annonces deja vues mais filtrees (mots-cles exclus) comme "vues"
  // pour ne pas les re-tester a chaque scan
  for (const listing of allListings) {
    seenIds.add(listing.id);
  }

  saveSeenIds(seenIds);
  console.log(`[scan] termine - ${new Date().toLocaleString("fr-BE")}`);
}

async function main() {
  const runOnce = process.argv.includes("--once");

  if (runOnce) {
    await runScan();
    process.exit(0);
  }

  console.log(`[immo-watch] demarre. Frequence de scan: ${CRON_SCHEDULE}`);
  // Ecouteur de commandes Telegram en parallele (fire-and-forget, boucle infinie)
  startCommandListener().catch((err) =>
    console.error("[telegram-commands] erreur fatale:", err.message)
  );
  // Premier scan immediat au demarrage, puis selon le planning cron
  runScan().catch((err) => console.error("[scan] erreur:", err));
  cron.schedule(CRON_SCHEDULE, () => {
    runScan().catch((err) => console.error("[scan] erreur:", err));
  });
}

main();
