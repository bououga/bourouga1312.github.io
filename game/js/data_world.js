/* Données du monde : nations et provinces à l'ouverture, printemps 1700.
   Coordonnées projetées grossièrement depuis les longitudes/latitudes réelles
   (x : 10°O à 45°E, y : 62°N à 34°N) sur une carte de 1680 x 1000. */
(function (G) {
  'use strict';

  const MAP_W = 1680, MAP_H = 1000;

  /* ---- Nations ----
     couleur : teinte de la nation sur la carte de campagne et sur les drapeaux.
     doctrine : influence l'IA et les bonus nationaux. */
  const FACTIONS = [
    { id: 'fra', nom: 'France', gentile: 'français', art: "La France", de: "de la France", couleur: '#3b6bbd', culture: 'occident', religion: 'catholique',
      doctrine: 'hegemonie', playable: true, tresor: 14000,
      bonus: { infanterie: 0.05, diplomatie: -5, revenu: 0.05 },
      description: "La première puissance d'Europe. Armée nombreuse, finances tendues, et tout le continent qui se ligue contre vous." },
    { id: 'gbr', nom: 'Grande-Bretagne', gentile: 'britannique', art: "La Grande-Bretagne", de: "de la Grande-Bretagne", couleur: '#b03a3a', culture: 'occident', religion: 'protestante',
      doctrine: 'maritime', playable: true, tresor: 16000,
      bonus: { commerce: 0.20, artillerie: 0.05, recrutement: -0.10 },
      description: "Peu de terres, beaucoup d'or. Financez les guerres des autres et prenez leurs colonies." },
    { id: 'aut', nom: 'Autriche', gentile: 'autrichien', art: "L'Autriche", de: "de l'Autriche", couleur: '#d6c9a0', culture: 'occident', religion: 'catholique',
      doctrine: 'defensif', playable: true, tresor: 11000,
      bonus: { cavalerie: 0.05, ordre: 5, revenu: -0.05, entretien: -0.12 },
      description: "Les Habsbourg tiennent un empire cousu de fil blanc : Vienne, Prague, Buda, et les Turcs à la porte." },
    { id: 'pru', nom: 'Prusse', gentile: 'prussien', art: "La Prusse", de: "de la Prusse", couleur: '#2f3d4f', culture: 'occident', religion: 'protestante',
      doctrine: 'militariste', playable: true, tresor: 8000,
      bonus: { infanterie: 0.12, moral: 0.08, recrutement: -0.15, revenu: -0.10, entretien: -0.35 },
      description: "Un petit État avec une très grande armée. Tout repose sur la discipline de l'infanterie." },
    { id: 'esp', nom: 'Espagne', gentile: 'espagnol', art: "L'Espagne", de: "de l'Espagne", couleur: '#c9a227', culture: 'occident', religion: 'catholique',
      doctrine: 'defensif', playable: true, tresor: 12000,
      bonus: { commerce: 0.10, ordre: -5, moral: -0.05 },
      description: "Un empire immense et un trône vacant. Charles II se meurt sans héritier : l'Europe s'apprête à se battre pour sa succession." },
    { id: 'rus', nom: 'Russie', gentile: 'russe', art: "La Russie", de: "de la Russie", couleur: '#4e7a4e', culture: 'orient', religion: 'orthodoxe',
      doctrine: 'expansionniste', playable: true, tresor: 9000,
      bonus: { recrutement: -0.20, moral: -0.10, ordre: -5, revenu: -0.15, entretien: -0.30 },
      description: "Pierre le Grand veut une armée européenne, des ports chauds, et une fenêtre sur la Baltique. Tout est à construire." },
    { id: 'swe', nom: 'Suède', gentile: 'suédois', art: "La Suède", de: "de la Suède", couleur: '#5aa0c8', culture: 'occident', religion: 'protestante',
      doctrine: 'militariste', playable: true, tresor: 9500,
      bonus: { infanterie: 0.08, cavalerie: 0.08, moral: 0.10, revenu: -0.10, entretien: -0.25 },
      description: "L'empire du Nord au sommet. Charles XII a dix-huit ans et la meilleure armée du continent — pour l'instant." },
    { id: 'ott', nom: 'Empire ottoman', gentile: 'ottoman', art: "L'Empire ottoman", de: "de l'Empire ottoman", couleur: '#3f7d63', culture: 'ottoman', religion: 'musulmane',
      doctrine: 'defensif', playable: true, tresor: 13000,
      bonus: { cavalerie: 0.10, artillerie: 0.08, infanterie: -0.05, diplomatie: -10, entretien: -0.15 },
      description: "Refoulé de Hongrie à Karlowitz, l'Empire reste le plus vaste d'Europe. Les janissaires ne pardonnent pas les sultans faibles." },
    { id: 'ned', nom: 'Provinces-Unies', gentile: 'néerlandais', art: "Les Provinces-Unies", de: "des Provinces-Unies", couleur: '#d98032', culture: 'occident', religion: 'protestante',
      doctrine: 'maritime', playable: true, tresor: 15000,
      bonus: { commerce: 0.25, revenu: 0.10, recrutement: 0.10, moral: -0.05 },
      description: "La plus riche république d'Europe, et la plus exposée : Louis XIV est à une semaine de marche d'Amsterdam." },
    { id: 'pol', nom: 'Pologne-Lituanie', gentile: 'polonais', art: "La Pologne-Lituanie", de: "de la Pologne-Lituanie", couleur: '#a14f8e', culture: 'orient', religion: 'catholique',
      doctrine: 'defensif', playable: true, tresor: 7000,
      bonus: { cavalerie: 0.15, ordre: -10, revenu: -0.10, entretien: -0.20 },
      description: "Une république nobiliaire que le liberum veto paralyse. Les hussards restent la meilleure cavalerie du monde." },
    { id: 'por', nom: 'Portugal', gentile: 'portugais', art: "Le Portugal", de: "du Portugal", couleur: '#5d8c5d', culture: 'occident', religion: 'catholique',
      doctrine: 'maritime', playable: false, tresor: 6000, bonus: { commerce: 0.15 } },
    { id: 'sav', nom: 'Savoie', gentile: 'savoyard', art: "La Savoie", de: "de la Savoie", couleur: '#8d5b9e', culture: 'occident', religion: 'catholique',
      doctrine: 'opportuniste', playable: false, tresor: 4000, bonus: { defense: 0.10 } },
    { id: 'ven', nom: 'Venise', gentile: 'vénitien', art: "Venise", de: "de Venise", couleur: '#b5563f', culture: 'occident', religion: 'catholique',
      doctrine: 'maritime', playable: false, tresor: 7000, bonus: { commerce: 0.20 } },
    { id: 'dan', nom: 'Danemark-Norvège', gentile: 'danois', art: "Le Danemark-Norvège", de: "du Danemark-Norvège", couleur: '#c06a7a', culture: 'occident', religion: 'protestante',
      doctrine: 'opportuniste', playable: false, tresor: 6500, bonus: { commerce: 0.10 } },
    { id: 'bav', nom: 'Bavière', gentile: 'bavarois', art: "La Bavière", de: "de la Bavière", couleur: '#7ba6d0', culture: 'occident', religion: 'catholique',
      doctrine: 'opportuniste', playable: false, tresor: 4500, bonus: {} },
    { id: 'sax', nom: 'Saxe', gentile: 'saxon', art: "La Saxe", de: "de la Saxe", couleur: '#9aa84f', culture: 'occident', religion: 'protestante',
      doctrine: 'opportuniste', playable: false, tresor: 4500, bonus: {} },
    { id: 'hre', nom: 'États du Rhin', gentile: 'rhénan', art: "Les États du Rhin", de: "des États du Rhin", couleur: '#b8a9c9', culture: 'occident', religion: 'catholique',
      doctrine: 'defensif', playable: false, tresor: 3500, bonus: {} },
    { id: 'pap', nom: 'États pontificaux', gentile: 'pontifical', art: "Les États pontificaux", de: "des États pontificaux", couleur: '#e0d8c0', culture: 'occident', religion: 'catholique',
      doctrine: 'defensif', playable: false, tresor: 5000, bonus: {} },
    { id: 'tos', nom: 'Toscane', gentile: 'toscan', art: "La Toscane", de: "de la Toscane", couleur: '#cfae7b', culture: 'occident', religion: 'catholique',
      doctrine: 'defensif', playable: false, tresor: 4000, bonus: { commerce: 0.10 } },
    { id: 'sui', nom: 'Confédération suisse', gentile: 'suisse', art: "La Confédération suisse", de: "de la Confédération suisse", couleur: '#d05a5a', culture: 'occident', religion: 'protestante',
      doctrine: 'defensif', playable: false, tresor: 4000, bonus: { defense: 0.20 } },
    { id: 'han', nom: 'Hanovre', gentile: 'hanovrien', art: "Le Hanovre", de: "du Hanovre", couleur: '#8fb896', culture: 'occident', religion: 'protestante',
      doctrine: 'opportuniste', playable: false, tresor: 4000, bonus: {} },
    { id: 'mar', nom: 'Maroc', gentile: 'marocain', art: "Le Maroc", de: "du Maroc", couleur: '#9c6b3f', culture: 'ottoman', religion: 'musulmane',
      doctrine: 'defensif', playable: false, tresor: 5000, bonus: { cavalerie: 0.10 } },
    { id: 'reb', nom: 'Rebelles', gentile: 'rebelle', art: "Les insurgés", de: "des insurgés", couleur: '#6b6b6b', culture: 'occident', religion: 'catholique',
      doctrine: 'defensif', playable: false, tresor: 0, bonus: {} },
  ];

  /* ---- Provinces ----
     [id, nom, x, y, propriétaire, population (milliers), richesse, terrain, port, religion, capitale?] */
  const P = [
    // Îles Britanniques
    ['ecosse', 'Écosse', 346, 279, 'gbr', 1100, 0.7, 'collines', 1, 'protestante'],
    ['angleterre', 'Angleterre', 420, 400, 'gbr', 5100, 1.6, 'plaine', 1, 'protestante', 1],
    ['irlande', 'Irlande', 268, 372, 'gbr', 2000, 0.6, 'marais', 1, 'catholique'],
    // France
    ['bretagne', 'Bretagne', 332, 512, 'fra', 1900, 0.8, 'collines', 1, 'catholique'],
    ['normandie', 'Normandie', 424, 500, 'fra', 2300, 1.1, 'plaine', 1, 'catholique'],
    ['iledefrance', 'Île-de-France', 495, 512, 'fra', 3000, 1.7, 'plaine', 0, 'catholique', 1],
    ['aquitaine', 'Aquitaine', 405, 636, 'fra', 2600, 1.0, 'plaine', 1, 'catholique'],
    ['languedoc', 'Languedoc', 500, 700, 'fra', 2200, 1.0, 'collines', 1, 'catholique'],
    ['bourgogne', 'Bourgogne', 552, 585, 'fra', 2100, 1.1, 'collines', 0, 'catholique'],
    ['lorraine', 'Lorraine', 580, 492, 'fra', 1400, 1.0, 'foret', 0, 'catholique'],
    // Pays-Bas
    ['hollande', 'Provinces-Unies', 552, 402, 'ned', 1900, 2.2, 'marais', 1, 'protestante', 1],
    ['flandre', 'Pays-Bas espagnols', 518, 445, 'esp', 2000, 1.8, 'plaine', 1, 'catholique'],
    // Ibérie
    ['galice', 'León et Galice', 240, 712, 'esp', 1200, 0.6, 'montagne', 1, 'catholique'],
    ['castille', 'Castille', 338, 768, 'esp', 2600, 1.0, 'plaine', 0, 'catholique', 1],
    ['catalogne', 'Catalogne', 478, 742, 'esp', 1300, 1.2, 'collines', 1, 'catholique'],
    ['andalousie', 'Andalousie', 282, 862, 'esp', 1700, 1.3, 'plaine', 1, 'catholique'],
    ['portugal', 'Portugal', 200, 822, 'por', 2000, 1.1, 'collines', 1, 'catholique', 1],
    // Italie
    ['savoie', 'Piémont-Savoie', 604, 626, 'sav', 1300, 1.0, 'montagne', 0, 'catholique', 1],
    ['milanais', 'Milanais', 655, 608, 'esp', 1400, 1.4, 'plaine', 0, 'catholique'],
    ['venise', 'Vénétie', 728, 606, 'ven', 1500, 1.5, 'marais', 1, 'catholique', 1],
    ['toscane', 'Toscane', 692, 668, 'tos', 900, 1.3, 'collines', 1, 'catholique', 1],
    ['rome', 'États pontificaux', 733, 726, 'pap', 1200, 1.0, 'collines', 1, 'catholique', 1],
    ['naples', 'Naples', 782, 768, 'esp', 2200, 0.9, 'collines', 1, 'catholique'],
    ['sicile', 'Sicile', 742, 848, 'esp', 1100, 0.9, 'collines', 1, 'catholique'],
    // Empire
    ['rhin', 'Cercle du Rhin', 636, 468, 'hre', 1600, 1.2, 'foret', 0, 'catholique', 1],
    ['baviere', 'Bavière', 712, 530, 'bav', 1400, 1.0, 'collines', 0, 'catholique', 1],
    ['hanovre', 'Hanovre', 658, 388, 'han', 1200, 1.0, 'plaine', 1, 'protestante', 1],
    ['saxe', 'Saxe', 760, 440, 'sax', 1500, 1.2, 'collines', 0, 'protestante', 1],
    ['suisse', 'Confédération suisse', 598, 566, 'sui', 1000, 0.9, 'montagne', 0, 'protestante', 1],
    ['boheme', 'Bohême', 792, 470, 'aut', 2000, 1.2, 'foret', 0, 'catholique'],
    ['autriche', 'Autriche', 824, 528, 'aut', 1800, 1.3, 'montagne', 0, 'catholique', 1],
    ['hongrie', 'Hongrie', 892, 552, 'aut', 2300, 0.8, 'plaine', 0, 'catholique'],
    ['transylvanie', 'Transylvanie', 968, 596, 'aut', 1200, 0.6, 'montagne', 0, 'catholique'],
    // Baltique / Nord
    ['brandebourg', 'Brandebourg', 752, 392, 'pru', 1700, 1.0, 'plaine', 0, 'protestante', 1],
    ['pomeranie', 'Poméranie suédoise', 806, 340, 'swe', 700, 0.9, 'plaine', 1, 'protestante'],
    ['prusse', 'Prusse orientale', 928, 322, 'pru', 1000, 0.9, 'foret', 1, 'protestante'],
    ['danemark', 'Danemark', 730, 292, 'dan', 900, 1.1, 'plaine', 1, 'protestante', 1],
    ['norvege', 'Norvège', 682, 152, 'dan', 600, 0.6, 'montagne', 1, 'protestante'],
    ['suede', 'Suède', 866, 178, 'swe', 1600, 0.9, 'foret', 1, 'protestante', 1],
    ['finlande', 'Finlande', 1030, 148, 'swe', 400, 0.5, 'foret', 1, 'protestante'],
    ['livonie', 'Livonie', 1014, 256, 'swe', 700, 1.0, 'plaine', 1, 'protestante'],
    // Pologne-Lituanie / Russie
    ['pologne', 'Grande-Pologne', 930, 404, 'pol', 2400, 0.8, 'plaine', 0, 'catholique', 1],
    ['lituanie', 'Lituanie', 1054, 336, 'pol', 1500, 0.6, 'foret', 0, 'catholique'],
    ['ukraine', 'Ukraine', 1168, 456, 'pol', 1600, 0.7, 'plaine', 0, 'orthodoxe'],
    ['novgorod', 'Novgorod', 1196, 210, 'rus', 800, 0.7, 'foret', 0, 'orthodoxe'],
    ['moscovie', 'Moscovie', 1342, 288, 'rus', 4200, 0.8, 'foret', 0, 'orthodoxe', 1],
    ['kazan', 'Kazan', 1500, 336, 'rus', 900, 0.5, 'plaine', 0, 'orthodoxe'],
    ['cosaques', 'Pays cosaque', 1320, 512, 'rus', 700, 0.5, 'plaine', 0, 'orthodoxe'],
    // Balkans et Levant ottomans
    ['bosnie', 'Bosnie', 862, 648, 'ott', 900, 0.5, 'montagne', 0, 'musulmane'],
    ['serbie', 'Serbie', 942, 654, 'ott', 1000, 0.6, 'collines', 0, 'orthodoxe'],
    ['valachie', 'Valachie', 1066, 648, 'ott', 1100, 0.7, 'plaine', 0, 'orthodoxe'],
    ['roumelie', 'Roumélie', 1046, 764, 'ott', 1200, 0.8, 'montagne', 1, 'musulmane'],
    ['grece', 'Grèce', 1002, 848, 'ott', 900, 0.7, 'montagne', 1, 'orthodoxe'],
    ['constantinople', 'Constantinople', 1136, 756, 'ott', 2000, 1.8, 'collines', 1, 'musulmane', 1],
    ['anatolie', 'Anatolie', 1268, 806, 'ott', 2600, 0.9, 'montagne', 1, 'musulmane'],
    ['crimee', 'Khanat de Crimée', 1252, 630, 'ott', 500, 0.6, 'plaine', 1, 'musulmane'],
    ['syrie', 'Syrie', 1390, 912, 'ott', 1400, 0.9, 'desert', 1, 'musulmane'],
    ['egypte', 'Égypte', 1150, 962, 'ott', 2800, 1.2, 'desert', 1, 'musulmane'],
    // Maghreb
    ['tripolitaine', 'Tripolitaine', 852, 950, 'ott', 400, 0.5, 'desert', 1, 'musulmane'],
    ['tunis', 'Tunis', 690, 916, 'ott', 700, 0.7, 'desert', 1, 'musulmane'],
    ['alger', 'Alger', 508, 908, 'ott', 900, 0.7, 'montagne', 1, 'musulmane'],
    ['maroc', 'Maroc', 252, 946, 'mar', 1500, 0.7, 'montagne', 1, 'musulmane', 1],
  ];

  /* Mers : non possédées, servent au commerce, aux flottes et au dessin des côtes. */
  const SEAS = [
    ['atl_nord', 'Atlantique Nord', 150, 130],
    ['mer_norvege', 'Mer de Norvège', 560, 60],
    ['mer_nord', 'Mer du Nord', 570, 285],
    ['manche', 'La Manche', 430, 455],
    ['atl_ouest', 'Atlantique', 86, 480],
    ['gascogne', 'Golfe de Gascogne', 322, 616],
    ['atl_sud', 'Atlantique Sud', 80, 800],
    ['baltique', 'Mer Baltique', 890, 268],
    ['botnie', 'Golfe de Botnie', 950, 118],
    ['med_ouest', 'Méditerranée occidentale', 440, 812],
    ['tyrrhenienne', 'Mer Tyrrhénienne', 664, 780],
    ['adriatique', 'Adriatique', 836, 706],
    ['ionienne', 'Mer Ionienne', 880, 854],
    ['egee', 'Mer Égée', 1116, 868],
    ['med_est', 'Méditerranée orientale', 1264, 952],
    ['mer_noire', 'Mer Noire', 1188, 570],
  ];

  G.world = { MAP_W, MAP_H, FACTIONS, PROVINCES: P, SEAS };
})(window.Grande = window.Grande || {});
