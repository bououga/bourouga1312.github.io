# Grande Ligne

Jeu de stratégie dans le navigateur, situé en Europe au printemps 1700 : une campagne
au tour par tour sur une carte de provinces, et des batailles rangées en temps réel
que vous commandez vous-même.

Rien à installer. Ouvrez `game/index.html` (ou l'URL du site) et jouez.

## La campagne

Une saison par tour, quatre saisons par an, de 1700 à 1760.

- **62 provinces** d'Europe, du Maghreb et du Levant, avec leur population, leur
  richesse, leur terrain et leur religion.
- **Dix nations jouables** — France, Grande-Bretagne, Autriche, Prusse, Espagne,
  Russie, Suède, Empire ottoman, Provinces-Unies, Pologne-Lituanie — chacune avec
  ses forces et ses faiblesses. La Prusse entretient une grande armée pour pas cher
  et rentre peu d'impôts ; les Provinces-Unies vivent du commerce et tiennent mal au feu.
- **Économie** : impôt, commerce, industrie, corruption, entretien des troupes et des
  bâtiments. Le trésor vide, les régiments se débandent.
- **Ordre public** : une province lourdement taxée, de religion étrangère, loin de la
  capitale et récemment conquise finit par se soulever.
- **Dix chaînes de bâtiments** et **seize technologies** réparties en art militaire,
  administration et industrie.
- **Diplomatie** : guerres, paix, trêves, alliances, appels à l'alliance.
- **Sièges** : une place forte ne tombe pas en un tour. On l'investit, ou on donne l'assaut.
- **Hiver** : les armées qui campent en pays ennemi fondent.

## Les batailles

Temps réel, vue de dessus, jusqu'à quelques milliers d'hommes à l'écran.

- **Feu** : la précision du mousquet s'effondre avec la distance. Une salve à cent
  mètres coûte quelques hommes ; à trente mètres, elle brise une ligne.
- **Formations** : ligne (tous les rangs font feu), colonne (rapide, mais un boulet
  l'enfile), carré (arrête la cavalerie, fond sous le canon), tirailleurs (dispersés,
  difficiles à toucher).
- **Moral** : les régiments ne se battent pas jusqu'au dernier homme, ils rompent.
  Les pertes, le flanc découvert, une charge de cavalerie, les voisins qui s'enfuient
  font céder une ligne. L'état-major à proximité la retient. Un régiment qui a rompu
  deux fois ne revient plus.
- **Charges** : la cavalerie vaut par son élan et par l'angle. De flanc, une charge
  compte double ; de dos, bien davantage. Contre un carré, elle se casse les dents.
- **Artillerie** : boulet plein à longue portée, mitraille à moins de deux cents mètres,
  obus explosif pour les obusiers. Une batterie découverte est perdue.
- **Terrain** : relief, bois, champs, rivières et villages. La hauteur allonge la portée,
  le bois désorganise la cavalerie, la pente ralentit tout le monde.
- **Fatigue** : courir, charger et se battre épuisent, et un homme épuisé tire mal.

Vous pouvez aussi laisser vos généraux régler l'affaire : la résolution automatique
est proposée avant chaque bataille.

## Commandes

| Action | Commande |
|---|---|
| Sélectionner | clic gauche · rectangle · Maj + clic |
| Se porter quelque part | clic droit |
| Régler le front et la largeur | clic droit maintenu, puis glisser |
| Attaquer | clic droit sur l'ennemi |
| Pas de course | Maj + clic droit |
| Formations | L ligne · C colonne · Y carré · T tirailleurs |
| Feu à volonté | F |
| Halte | H |
| Portées de tir | P |
| Pause et vitesse | Espace · 1 2 3 4 |
| Tout sélectionner · unité suivante | A · Tab |

Sur la carte de campagne : clic gauche pour sélectionner une province ou une armée,
clic droit pour donner un ordre de marche, molette pour zoomer, glisser pour déplacer
la vue. Un clic droit sur la province où se trouve déjà l'armée sélectionnée fusionne
deux armées.

## Sous le capot

JavaScript sans dépendances, rendu en canvas 2D. Dix fichiers, aucun outil de build.

| Fichier | Rôle |
|---|---|
| `js/util.js` | maths, aléatoire déterministe, Voronoï, file de priorité |
| `js/data_world.js` | nations et provinces de 1700 |
| `js/data_army.js` | régiments, bâtiments, technologies |
| `js/campaign.js` | carte, économie, tours, sièges, diplomatie |
| `js/campaign_ia.js` | IA de campagne |
| `js/campaign_vue.js` | rendu et commandes de la carte |
| `js/battle.js` | simulation de bataille |
| `js/battle_ia.js` | IA de bataille |
| `js/battle_vue.js` | rendu et commandes du champ de bataille |
| `js/main.js` | écrans, panneaux, sauvegarde |

La carte est un diagramme de Voronoï borné, calculé à partir des coordonnées réelles
des villes, puis lissé et bruité. Terres et mers sont issues du même découpage : les
côtes naissent de la frontière entre les deux.

La sauvegarde tient dans le `localStorage` du navigateur : seule la partie mutable de
l'état est stockée, la carte étant régénérée depuis sa graine.
