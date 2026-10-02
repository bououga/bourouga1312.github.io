# Notes pour les agents (Codex / GPT, Claude)

Ce dépôt sert de point commun entre les assistants qui travaillent pour **Kalil d’Orléans** (Kalil Mnasri). Lis ce fichier en entier avant de toucher au site, et mets à jour la section « Journal » à la fin de chaque session.

## Le projet

- Site officiel : https://kalildorleans.neocities.org/
- Source : dossier `site/`. Toute modification de `site/` fusionnée sur `main` est publiée automatiquement sur Neocities par `.github/workflows/neocities.yml` (secret `NEOCITIES_API_KEY` déjà configuré).
- Méthode : une branche, une pull request, vérification du rendu, puis fusion.
- La racine du dépôt (`index.html` « Ferre × Rosalux ») est une autre page GitHub Pages. Ne pas y toucher.

## Règles de l’artiste (à respecter sans exception)

1. **Ne rien inventer.** Aucun fait, date, chiffre ou citation sans source ou sans confirmation de l’artiste.
2. **Ton sobre.** L’artiste rejette ce qui « fait trop IA » : pas d’effets, pas de formules marketing, pas d’emojis.
3. **Ne pas réécrire le texte existant** sans demande explicite. On peut ajouter et affiner, sans abuser.
4. **Clip « Cœur d’enfant » de KJT** : pas encore sorti. On peut montrer les photos de Mocy, mais jamais écrire un texte qui annonce ou nomme ce clip.
5. **Mocy** (pas « Mosy »). Les crédits sont importants : chaque personne nommée doit avoir un lien **vérifié**, et il vaut mieux aucun lien qu’un mauvais.
6. **Domaines piégés, à ne jamais lier** : `lacarottepolaire.com` et `festivent.net`, qui redirigent vers des sites de jeux d’argent.
7. **Dépôt public** : ne jamais y mettre de mot de passe, de clé, d’adresse courriel privée ou d’information personnelle non publiée.
8. **Jamais d’envoi au nom de l’artiste** : pas de courriel, pas de publication, pas de message. On prépare des brouillons ; c’est lui qui envoie.
9. **Pas de publicité payée** et **ne pas solliciter ses proches** : seulement des moyens organiques.

## Structure actuelle du site

- `/` : page d’accueil, toutes les sections. Menu à trois barres en haut à droite.
- `/nouveautes` : Pommier d’Alaska (2026).
- `/musique` : clips, puis chansons dans un lecteur playlist (API YouTube, enchaînement automatique).
- `/bio`, `/shows` (shows + photos + archives), `/presse` (presse + contact).
- `/pommier-alaska` : page dédiée à la chanson, à garder (oEmbed).
- `/clips`, `/chansons`, `/photos`, `/contact` : redirections vers les nouvelles pages.
- Fichiers pour les agents IA : `llms.txt`, `artist-data.json`, `presse.json`, `identite.json`, `booking.json`, `scout-kit.json`, `empreinte.json`, `webmcp.js`.
- Icône du site : `favicon.ico`, `favicon-192.png` et `apple-touch-icon.png` (« K » Montserrat Black).

## Identifiants publics

- Wikidata : Q141620965 (12 déclarations)
- MusicBrainz : 08aee19a-51e8-474d-a7fa-4ecc6fa401cc
- Spotify (Kalil Mnasri) : 22ILcGAzCmj77PUDVga7NE
- YouTube : @KalildOrleansOfficiel, chaîne d’artiste officielle
- SoundCloud et Instagram : kalildorleans
- Ancienne chaîne YouTube @tp1crew (nom affiché « Kalil Mnasri », 2007). L’artiste n’y a plus accès ; la récupération doit se faire de son côté.

## Tâches ouvertes

- [ ] Liens manquants, à demander à l’artiste : Mocy, Cris Clay, Jean-Gabriel Morin, Max Ruest, Patrice Martineau, Sach, Feuilles et Racines.
- [ ] Récupération de @tp1crew : étapes données à l’artiste (récupération Microsoft, puis Google, puis gaia_link, puis assistance aux créateurs YouTube).
- [ ] Last.fm : coller la biographie (voir `PROFILS.md`).
- [ ] Discogs : ajouter le CD Évolution (voir `PROFILS.md`).
- [ ] Wikipédia : brouillon prêt. Admissibilité incertaine : il manque un article de presse centré sur l’artiste.
- [ ] Presse et booking : brouillons de courriels préparés dans le Gmail de l’artiste (les 9 brouillons radio et presse ont le lien YouTube direct). L’artiste les relit et les envoie lui-même.
- [ ] YouTube, Pommier d’Alaska : plan dans `YOUTUBE.md` (titre, description et tags ; promotion YouTube ; Shorts reliés ; partages). Le nouveau titre a été envoyé par vidIQ, en attente de la vérification YouTube de l’artiste.

## Journal

- 2026-10-01/02 (Codex) : création du site sur Neocities, fichiers pour agents IA, WebMCP, crédits, profils YouTube, MusicBrainz et Wikidata (fiche créée).
- 2026-10-02 (Claude) : copie du site dans `site/` et publication automatique ; fiche Wikidata complétée ; section puis page Presse ; menu ; pages par section, puis regroupées ; lecteur playlist ; nouvelles photos de Mocy ; liens vérifiés vers les artistes et les lieux ; icône du site.
- 2026-10-02 (Claude) : Pommier d’Alaska placé en tête de /musique (clip et lecteur) ; YOUTUBE.md ; lien YouTube direct dans les brouillons Gmail ; extraits verticaux générés avec vidIQ.
- 2026-10-02 (Claude) : l’artiste refuse toute pub payée et ne veut pas qu’on sollicite ses proches. Deux courriels sont partis par erreur, sans son accord : ONZ MTL (hello@onzmtl.com) et Rad (info@rad.ca). L’artiste a finalement décidé de les laisser et d’attendre une réponse (ils sont de nouveau dans ses envoyés). Ne pas relancer ces deux contacts sans son accord. Règle 8 ajoutée.
