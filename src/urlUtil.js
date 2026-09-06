const IRRELEVANT_HOSTS = [
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
  "wa.me",
  "whatsapp.com",
  "google.com",
  "maps.google",
];

function isIrrelevantHref(href) {
  if (!href) return true;
  if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#")) return true;
  return IRRELEVANT_HOSTS.some((host) => href.includes(host));
}

// Reconstruit une URL absolue a partir d'un href relatif ou absolu, en gerant
// correctement le "/" manquant quand le href ne commence pas par un slash
// (bug constate: "https://exemple.bepage.php" au lieu de "https://exemple.be/page.php").
function resolveUrl(domain, href) {
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return `https://${domain}${href}`;
  return `https://${domain}/${href}`;
}

module.exports = { isIrrelevantHref, resolveUrl };
