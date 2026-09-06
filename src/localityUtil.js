function normalize(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // enleve les accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Cherche si une des localites voulues apparait dans le slug de l'URL de l'annonce
// (ex: .../a-vendre/gent/9000/12345 -> "gent"). Beaucoup plus fiable que de scanner
// le texte alentour dans le HTML, qui peut contenir des elements de navigation/widgets
// sans rapport avec la vraie localisation du bien.
function extractLocalityFromUrl(href, localites) {
  const normHref = normalize(href);
  for (const loc of localites) {
    const normLoc = normalize(loc);
    if (normLoc && normHref.includes(normLoc)) return loc;
  }
  return null;
}

module.exports = { normalize, extractLocalityFromUrl };
