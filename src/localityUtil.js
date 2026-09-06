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

// Codes postaux pour les communes courantes de la region de Liege. Sert de filet
// de secours quand le nom de ville n'apparait pas tel quel dans l'URL/texte, mais
// que le code postal (souvent plus stable) y figure.
const POSTAL_CODES = {
  "liège": "4000",
  liege: "4000",
  flémalle: "4400",
  flemalle: "4400",
  seraing: "4100",
  herstal: "4040",
  ans: "4430",
  "grâce-hollogne": "4460",
  "grace-hollogne": "4460",
};

function extractLocalityFromPostalCode(text, localites) {
  for (const loc of localites) {
    const code = POSTAL_CODES[loc.toLowerCase()];
    if (code && text.includes(code)) return loc;
  }
  return null;
}

module.exports = { normalize, extractLocalityFromUrl, POSTAL_CODES, extractLocalityFromPostalCode };
