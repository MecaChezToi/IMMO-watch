# Immo Watch

Scanne Immoweb, Immovlan et Zimmo selon tes critères, et t'envoie une notif Telegram dès qu'une nouvelle annonce correspond. Zéro recherche manuelle.

## 1. Configurer tes critères

**Via Telegram (recommandé)** — une fois le bot déployé, envoie-lui directement dans la conversation :

```
/prix_max 225000
/prix_min 100000
/chambres_min 4
/superficie_terrain 500
/superficie_habitable 90
/localites Liège, Flémalle, Seraing, Herstal, Ans, Grâce-Hollogne
/criteres          → affiche les critères actuels
/scan              → lance un scan immédiat, sans attendre les 30 min
/reset             → efface l'historique des annonces vues (le prochain scan retraite tout)
/aide              → liste des commandes
```

Chaque commande prend effet immédiatement, sans redeploiement. Seul le chat configuré via `TELEGRAM_CHAT_ID` peut changer les critères — les autres messages sont ignorés.

**Via fichier (pour le tout premier déploiement, ou changer les sites actifs)** — édite `config/criteria.json` :

- `localites` : liste des villes/communes à surveiller
- `prix_min` / `prix_max`
- `chambres_min`
- `superficie_terrain_min_m2`
- `mots_cles_exclus` : titres à ignorer (ex: "à rénover complètement")
- `sites_actifs` : active/désactive chaque site indépendamment (Immoweb, Immovlan, Zimmo, Immo de Marneffe, Roufosse, BHS Immo)

Ce fichier ne sert que de **valeurs par défaut au tout premier démarrage**. Une fois le bot lancé, les critères vivent sur le volume persistant (`data/criteria.json`) et se modifient via les commandes Telegram ci-dessus — éditer `config/criteria.json` après coup n'aura plus d'effet tant que le volume existe.

Le fichier est relu à chaque scan — pas besoin de redémarrer pour changer un critère.

## 2. Créer ton bot Telegram (5 min, gratuit)

1. Ouvre Telegram, cherche **@BotFather**, envoie `/newbot`, suis les instructions → tu reçois un **token**.
2. Cherche **@userinfobot**, démarre une conversation avec lui → il te donne ton **chat ID**.
3. Envoie n'importe quel message à ton nouveau bot (obligatoire, sinon il ne peut pas t'écrire).

## 3. Configurer l'environnement

```bash
cp .env.example .env
```

Remplis `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID` dans `.env`.

## 4. Tester en local

```bash
npm install
npm run once
```

Ça lance un seul scan immédiat (sans cron) — pratique pour vérifier que les critères et le bot fonctionnent avant de déployer.

## 5. Déployer sur ton VPS (Coolify)

1. Pousse ce projet sur un repo GitHub.
2. Dans Coolify : nouvelle application → source Git → sélectionne le repo → build type **Dockerfile**.
3. Ajoute les variables d'environnement (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CRON_SCHEDULE`).
4. **Monte un volume persistant sur `/app/data`** — sinon l'historique des annonces déjà vues est perdu à chaque redeploiement et tu reçois un déluge de "nouvelles" annonces à chaque déploiement.
5. Déploie. Le process tourne en continu et scanne selon `CRON_SCHEDULE` (défaut: toutes les 30 min).

## Limites à connaître

- **Immoweb est protégé par Cloudflare** et peut bloquer les IP de serveur. Si le scraper Immoweb renvoie 0 résultat après plusieurs scans (regarde les logs Coolify), c'est probablement ça — solution : passer par un proxy résidentiel (ScraperAPI, Zyte...) ou se contenter d'Immovlan/Zimmo qui sont généralement moins agressifs.
- **Les sites changent régulièrement leur structure HTML.** Les scrapers extraient les annonces via les patterns d'URL (`/classified/`, `/detail/`, etc.) qui sont plus stables que les classes CSS, mais une casse ponctuelle reste possible — surveille les logs de temps en temps.
- **Usage strictement personnel.** Le scraping de ces sites viole leurs CGU ; c'est un non-sujet pour un usage perso à fréquence raisonnable (30 min), mais ne pas en faire un produit commercial revendu à d'autres sans revoir la légalité.
- **Pas de doublons entre sites** : chaque annonce est identifiée par `source-id`, donc si le même bien est publié sur 2 sites (fréquent avec les agences), tu recevras 2 notifs — c'est voulu pour rester simple.
- **Filtrage strict** : une annonce est rejetée si sa localité n'est pas clairement identifiée dans son URL comme faisant partie de tes villes cibles, ou si son prix n'a pas pu être déterminé (même après vérification sur la fiche détaillée). Tu ne verras donc jamais de "prix non précisé" ni d'annonce hors zone — au prix, potentiellement, de rater une annonce si l'extraction échoue complètement sur un site donné (plutôt que de la montrer à tort).
- **Scraper Roufosse non vérifié** : le fetch de test a buté sur une boucle de redirection, donc ce scraper est du "best effort" basé sur les patterns habituels. Lance `npm run once` et regarde les logs — si `[roufosse] 0 résultat` alors que tu sais qu'il y a des biens en vente, ouvre le site dans ton navigateur, copie l'URL exacte affichée, et remplace `ROUFOSSE_URL` dans `src/scrapers/roufosse.js`.
- **Immo de Marneffe** utilise le CMS "Whise" (répandu chez les agences belges) — le scraper appelle directement leur endpoint de liste triée par date, plus fiable qu'un parsing de page classique.
- **Scraper BHS Immo non vérifié non plus** : leur `robots.txt` bloque explicitement l'accès automatisé, donc impossible d'inspecter la page à l'avance pour caler les sélecteurs. Best effort comme Roufosse — teste avec `npm run once`, ajuste `src/scrapers/bhsimmo.js` si besoin. Contrairement aux autres sites, ici le robots.txt interdit explicitement le scraping (pas juste absence d'API) ; risque mineur pour un usage perso à fréquence raisonnable, mais désactive `bhsimmo` dans `criteria.json` si tu préfères ne pas y toucher.
