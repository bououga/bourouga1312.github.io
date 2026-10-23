/* Moteur de bataille temps réel.
   Unités de mesure : le mètre et la seconde. Un bataillon de ligne recharge en
   une vingtaine de secondes, tire à cent mètres, et rompt quand son moral cède —
   pas quand ses points de vie tombent à zéro. */
(function (G) {
  'use strict';

  const U = G.util;
  const A = G.army;

  const TERRAIN_W = 1500, TERRAIN_H = 800;
  const GRID = 20;               // pas de la grille de relief, en mètres
  const ESPACE_X = 2.0;          // intervalle latéral entre deux hommes
  const ESPACE_Y = 2.7;          // profondeur d'un rang
  const ESPACE_CAV_X = 3.0, ESPACE_CAV_Y = 4.6;

  const FORMATIONS = {
    ligne:      { nom: 'Ligne',       rangs: 3, ecart: 1.0, touche: 1.0 },
    colonne:    { nom: 'Colonne',     rangs: 6, ecart: 0.85, touche: 1.0 },
    carre:      { nom: 'Carré',       rangs: 4, ecart: 1.0, touche: 1.0 },
    tirailleur: { nom: 'Tirailleurs', rangs: 2, ecart: 2.6, touche: 0.55 },
  };

  /* ------------------------------------------------------------- terrain */

  function genererTerrain(seed, typeTerrain, saison) {
    const rng = U.makeRng(seed);
    const cols = Math.ceil(TERRAIN_W / GRID) + 1;
    const rows = Math.ceil(TERRAIN_H / GRID) + 1;
    const hauteur = new Float32Array(cols * rows);

    // Relief : quelques collines gaussiennes, plus ou moins marquées selon la province.
    const ampli = { plaine: 6, collines: 18, montagne: 34, foret: 10, marais: 3, desert: 8 }[typeTerrain] || 10;
    const nbCollines = { plaine: 2, collines: 5, montagne: 7, foret: 3, marais: 1, desert: 3 }[typeTerrain] || 3;
    const collines = [];
    for (let i = 0; i < nbCollines; i++) {
      collines.push({
        x: rng.range(120, TERRAIN_W - 120), y: rng.range(120, TERRAIN_H - 120),
        r: rng.range(110, 320), h: rng.range(ampli * 0.5, ampli),
      });
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        let h = 0;
        const x = i * GRID, y = j * GRID;
        for (const c of collines) {
          const d2 = U.dist2(x, y, c.x, c.y);
          h += c.h * Math.exp(-d2 / (2 * c.r * c.r));
        }
        h += rng.range(-0.6, 0.6);
        hauteur[j * cols + i] = h;
      }
    }

    // Couvert : bois, champs, marécages, villages.
    const bosquets = [];
    const nbBois = { foret: 8, collines: 4, plaine: 3, montagne: 3, marais: 5, desert: 0 }[typeTerrain] || 3;
    for (let i = 0; i < nbBois; i++) {
      bosquets.push({ x: rng.range(80, TERRAIN_W - 80), y: rng.range(80, TERRAIN_H - 80), r: rng.range(40, 85) });
    }
    const champs = [];
    for (let i = 0; i < 6; i++) {
      champs.push({ x: rng.range(60, TERRAIN_W - 60), y: rng.range(60, TERRAIN_H - 60), w: rng.range(70, 165), h: rng.range(55, 120), a: rng.range(0, Math.PI) });
    }
    const batiments = [];
    if (rng.chance(0.7)) {
      const vx = rng.range(350, TERRAIN_W - 350), vy = rng.range(300, TERRAIN_H - 300);
      const n = 4 + Math.floor(rng() * 6);
      for (let i = 0; i < n; i++) {
        batiments.push({ x: vx + rng.range(-70, 70), y: vy + rng.range(-55, 55),
          w: rng.range(10, 18), h: rng.range(8, 14), a: rng.range(0, Math.PI) });
      }
    }
    const riviere = rng.chance(0.35) ? genererRiviere(rng) : null;

    return { cols, rows, hauteur, bosquets, champs, batiments, riviere, type: typeTerrain, saison, seed };
  }

  function genererRiviere(rng) {
    const pts = [];
    const vertical = rng.chance(0.5);
    let t = vertical ? rng.range(TERRAIN_W * 0.3, TERRAIN_W * 0.7) : rng.range(TERRAIN_H * 0.3, TERRAIN_H * 0.7);
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      t += rng.range(-40, 40);
      pts.push(vertical ? [t, u * TERRAIN_H] : [u * TERRAIN_W, t]);
    }
    return { pts, largeur: rng.range(12, 22), vertical };
  }

  function altitude(terrain, x, y) {
    const i = U.clamp(Math.floor(x / GRID), 0, terrain.cols - 2);
    const j = U.clamp(Math.floor(y / GRID), 0, terrain.rows - 2);
    const fx = U.clamp(x / GRID - i, 0, 1), fy = U.clamp(y / GRID - j, 0, 1);
    const h = terrain.hauteur;
    const a = h[j * terrain.cols + i], b = h[j * terrain.cols + i + 1];
    const c = h[(j + 1) * terrain.cols + i], d = h[(j + 1) * terrain.cols + i + 1];
    return U.lerp(U.lerp(a, b, fx), U.lerp(c, d, fx), fy);
  }

  function dansBois(terrain, x, y) {
    for (const b of terrain.bosquets) if (U.dist2(x, y, b.x, b.y) < b.r * b.r) return true;
    return false;
  }

  /* -------------------------------------------------------------- unités */

  let prochainId = 1;

  function creerUniteBataille(typeId, camp, nation, options) {
    const def = G.campagne.unitById[typeId];
    const opt = options || {};
    const hommes = opt.hommes || def.hommes;
    const classe = A.CATEGORIES[def.cat].classe;
    const u = {
      id: prochainId++,
      type: typeId, def, camp, nation, classe,
      nom: def.nom,
      x: 0, y: 0, angle: 0,
      cible: null,             // { x, y, angle } destination ordonnée
      cibleEnnemi: null,       // unité visée
      formation: def.tirailleur ? 'tirailleur' : 'ligne',
      etat: 'attente',         // attente | marche | charge | melee | fuite | rallie
      hommesMax: hommes,
      soldats: [],
      moral: 100, moralMax: 100,
      fatigue: 0,
      munitions: def.portee > 0 ? 24 : 0,
      rechargement: 0,   // décalé au déploiement pour que les salves ne soient pas synchrones
      exp: opt.exp || 0,
      feuLibre: true,
      tenirPosition: false,
      contact: null,           // unité en corps à corps
      tempsCharge: 0,
      derniereSalve: 0,
      pertesRecentes: 0,
      ralliementTimer: 0,
      selectionne: false,
      general: !!def.general,
      bonusNation: opt.bonusNation || {},
      techBonus: opt.techBonus || {},
      idCampagne: opt.idCampagne || null,
      pertes: 0,
      touchesInfligees: 0,
      routes: 0,          // nombre de fois que l'unité a rompu
      sorti: false,       // a quitté le champ de bataille
    };
    u.moralMax = 40 + def.moral * 3.4 + u.exp * 2.2
      + (u.bonusNation.moral || 0) * 40 + (u.techBonus.moral || 0) * 40;
    u.moral = u.moralMax;
    u.rechargement = def.rechargement * (opt.decalage !== undefined ? opt.decalage : 0.3);
    for (let i = 0; i < hommes; i++) {
      u.soldats.push({ x: 0, y: 0, tx: 0, ty: 0, vivant: true, feu: 0, ecart: 0 });
    }
    return u;
  }

  function vivants(u) {
    let n = 0;
    for (const s of u.soldats) if (s.vivant) n++;
    return n;
  }

  function largeurUnite(u) {
    const n = Math.max(1, vivants(u));
    const f = FORMATIONS[u.formation];
    const ex = (u.def.monte ? ESPACE_CAV_X : ESPACE_X) * f.ecart;
    if (u.formation === 'carre') return Math.ceil(Math.sqrt(n)) * ex;
    const files = Math.ceil(n / f.rangs);
    return files * ex;
  }

  function profondeurUnite(u) {
    const n = Math.max(1, vivants(u));
    const f = FORMATIONS[u.formation];
    const ey = (u.def.monte ? ESPACE_CAV_Y : ESPACE_Y) * f.ecart;
    if (u.formation === 'carre') return Math.ceil(Math.sqrt(n)) * ey;
    return f.rangs * ey;
  }

  /** Place chaque homme sur son emplacement dans la formation. */
  function calculerPlaces(u) {
    const f = FORMATIONS[u.formation];
    const ex = (u.def.monte ? ESPACE_CAV_X : ESPACE_X) * f.ecart;
    const ey = (u.def.monte ? ESPACE_CAV_Y : ESPACE_Y) * f.ecart;
    const liste = u.soldats.filter((s) => s.vivant);
    const n = liste.length;
    if (!n) return;
    const cos = Math.cos(u.angle), sin = Math.sin(u.angle);
    const droite = [-sin, cos];
    const avant = [cos, sin];

    if (u.formation === 'carre') {
      const cote = Math.ceil(Math.sqrt(n));
      const demi = (cote - 1) / 2;
      let k = 0;
      // Carré creux : on remplit le pourtour d'abord, puis l'intérieur.
      const cases = [];
      for (let r = 0; r < cote; r++) {
        for (let c = 0; c < cote; c++) {
          const bord = r === 0 || c === 0 || r === cote - 1 || c === cote - 1;
          cases.push({ r, c, bord });
        }
      }
      cases.sort((a, b) => (a.bord === b.bord ? 0 : a.bord ? -1 : 1));
      for (const cel of cases) {
        if (k >= n) break;
        const lx = (cel.c - demi) * ex, ly = (cel.r - demi) * ey;
        const s = liste[k++];
        s.tx = u.x + droite[0] * lx - avant[0] * ly;
        s.ty = u.y + droite[1] * lx - avant[1] * ly;
      }
      return;
    }

    const rangs = Math.min(f.rangs, n);
    const files = Math.ceil(n / rangs);
    const demiF = (files - 1) / 2;
    const demiR = (rangs - 1) / 2;
    for (let i = 0; i < n; i++) {
      const rang = Math.floor(i / files);
      const file = i % files;
      const lx = (file - demiF) * ex;
      const ly = (rang - demiR) * ey;
      const s = liste[i];
      s.tx = u.x + droite[0] * lx - avant[0] * ly;
      s.ty = u.y + droite[1] * lx - avant[1] * ly;
    }
  }

  /* ------------------------------------------------------------- bataille */

  function creerBataille(config) {
    prochainId = 1;
    const seed = config.seed || 1234;
    const terrain = genererTerrain(seed, config.terrain || 'plaine', config.saison || 0);
    const bataille = {
      terrain, seed,
      temps: 0, vitesse: 1, pause: true, phase: 'deploiement',
      unites: [],
      projectiles: [],
      effets: [],
      camps: config.camps,      // [{ nation, joueur, nom }, ...]
      resultat: null,
      rng: U.makeRng(seed ^ 0x5f3a),
      messages: [],
      zonesDeploiement: [
        { x: 60, y: TERRAIN_H - 230, w: TERRAIN_W - 120, h: 170 },
        { x: 60, y: 60, w: TERRAIN_W - 120, h: 170 },
      ],
      duree: config.duree || 25 * 60,
      statistiques: [{ tues: 0, perdus: 0 }, { tues: 0, perdus: 0 }],
    };

    for (let camp = 0; camp < 2; camp++) {
      const liste = config.armees[camp];
      const zone = bataille.zonesDeploiement[camp];
      const n = liste.length;
      let x = zone.x + zone.w / 2 - (n - 1) * 45;
      for (let i = 0; i < n; i++) {
        const spec = liste[i];
        const u = creerUniteBataille(spec.type, camp, config.camps[camp].nation,
          Object.assign({ decalage: bataille.rng() * 0.6 }, spec));
        u.x = U.clamp(x, 80, TERRAIN_W - 80);
        u.y = zone.y + zone.h * (camp === 0 ? 0.62 : 0.38);
        u.angle = camp === 0 ? -Math.PI / 2 : Math.PI / 2;
        placerInitial(u);
        bataille.unites.push(u);
        x += 90;
      }
    }
    trierDeploiement(bataille);
    return bataille;
  }

  /** Range les unités par type : artillerie derrière, infanterie au centre, cavalerie aux ailes. */
  function trierDeploiement(bataille, campSeul) {
    for (let camp = 0; camp < 2; camp++) {
      if (campSeul !== undefined && camp !== campSeul) continue;
      const zone = bataille.zonesDeploiement[camp];
      const mes = bataille.unites.filter((u) => u.camp === camp);
      const inf = mes.filter((u) => u.classe === 'infanterie');
      const cav = mes.filter((u) => u.classe === 'cavalerie' && !u.general);
      const art = mes.filter((u) => u.classe === 'artillerie');
      const qg = mes.filter((u) => u.general);
      const devant = camp === 0 ? -1 : 1;
      const yBase = camp === 0 ? zone.y + zone.h * 0.75 : zone.y + zone.h * 0.25;

      let largeurTotale = inf.reduce((s, u) => s + largeurUnite(u) + 14, 0);
      let x = TERRAIN_W / 2 - largeurTotale / 2;
      for (const u of inf) {
        const w = largeurUnite(u);
        u.x = U.clamp(x + w / 2, 70, TERRAIN_W - 70);
        u.y = yBase;
        x += w + 14;
      }
      // Cavalerie répartie sur les deux ailes.
      cav.forEach((u, i) => {
        const aile = i % 2 === 0 ? -1 : 1;
        const rang = Math.floor(i / 2);
        u.x = U.clamp(TERRAIN_W / 2 + aile * (largeurTotale / 2 + 60 + rang * 70), 60, TERRAIN_W - 60);
        u.y = yBase + devant * 15;
      });
      art.forEach((u, i) => {
        u.x = U.clamp(TERRAIN_W / 2 - (art.length - 1) * 45 + i * 90, 70, TERRAIN_W - 70);
        u.y = yBase - devant * 55;
      });
      qg.forEach((u, i) => {
        u.x = TERRAIN_W / 2 + (i - (qg.length - 1) / 2) * 40;
        u.y = yBase - devant * 90;
      });
      for (const u of mes) { u.angle = camp === 0 ? -Math.PI / 2 : Math.PI / 2; placerInitial(u); }
    }
  }

  function placerInitial(u) {
    calculerPlaces(u);
    for (const s of u.soldats) { s.x = s.tx; s.y = s.ty; }
  }

  /* ---------------------------------------------------------------- ordres */

  function ordreDeplacement(u, x, y, angle, courir) {
    if (u.etat === 'fuite') return;
    u.cible = { x: U.clamp(x, 20, TERRAIN_W - 20), y: U.clamp(y, 20, TERRAIN_H - 20), angle: angle };
    u.cibleEnnemi = null;
    u.contact = null;
    u.tenirPosition = false;
    u.courir = !!courir;
    u.etat = 'marche';
  }

  function ordreAttaque(u, cible) {
    if (u.etat === 'fuite') return;
    u.cibleEnnemi = cible;
    u.cible = null;
    u.tenirPosition = false;
    u.etat = u.def.monte ? 'charge' : 'marche';
    u.tempsCharge = 0;
  }

  function ordreFormation(u, formation) {
    if (u.etat === 'fuite') return;
    if (formation === 'tirailleur' && !u.def.tirailleur) return;
    if (formation === 'carre' && (u.classe !== 'infanterie' || u.def.canon)) return;
    if (u.def.canon) return;
    u.formation = formation;
  }

  function ordreHalte(u) {
    u.cible = null; u.cibleEnnemi = null; u.contact = null;
    if (u.etat !== 'fuite') u.etat = 'attente';
  }

  /* ------------------------------------------------------------ simulation */

  function pas(b, dt) {
    if (b.phase !== 'combat' || b.resultat) return;
    b.temps += dt;

    for (const u of b.unites) {
      if (!vivants(u)) continue;
      majMoral(b, u, dt);
      if (u.etat === 'fuite') { majFuite(b, u, dt); continue; }
      majOrdres(b, u, dt);
      majMouvement(b, u, dt);
      majTir(b, u, dt);
      majMelee(b, u, dt);
      majFatigue(b, u, dt);
    }
    separerUnites(b, dt);
    majProjectiles(b, dt);
    majEffets(b, dt);
    verifierFin(b);
  }

  function majFatigue(b, u, dt) {
    let delta = -0.35;                              // récupération au repos
    if (u.etat === 'marche') delta = u.courir ? 2.2 : 0.9;
    if (u.etat === 'charge') delta = 3.4;
    if (u.etat === 'melee') delta = 2.8;
    if (u.def.monte) delta *= 1.25;
    u.fatigue = U.clamp(u.fatigue + delta * dt / 6, 0, 100);
  }

  function facteurFatigue(u) { return 1 - (u.fatigue / 100) * 0.35; }

  function vitesseUnite(b, u) {
    let v = u.def.vitesse;
    if (u.etat === 'charge') v *= 1.55;
    else if (u.courir) v *= 1.35;
    v *= facteurFatigue(u);
    v *= 1 + (u.techBonus.mouvement || 0);
    if (u.formation === 'carre') v *= 0.45;
    if (u.formation === 'colonne') v *= 1.15;
    if (dansBois(b.terrain, u.x, u.y)) v *= u.def.monte ? 0.55 : 0.8;
    // Monter une pente coûte cher.
    if (u.cible || u.cibleEnnemi) {
      const dx = (u.cible ? u.cible.x : u.cibleEnnemi.x) - u.x;
      const dy = (u.cible ? u.cible.y : u.cibleEnnemi.y) - u.y;
      const d = Math.hypot(dx, dy) || 1;
      const pente = (altitude(b.terrain, u.x + dx / d * 12, u.y + dy / d * 12) - altitude(b.terrain, u.x, u.y)) / 12;
      v *= U.clamp(1 - pente * 1.8, 0.55, 1.15);
    }
    return v;
  }

  function majOrdres(b, u, dt) {
    if (u.cibleEnnemi) {
      const e = u.cibleEnnemi;
      const poursuite = u.def.monte && e.etat === 'fuite' && !e.sorti && vivants(e);
      if (poursuite) {
        u.etat = U.dist(u.x, u.y, e.x, e.y) < 140 ? 'charge' : 'marche';
        if (U.dist(u.x, u.y, e.x, e.y) < (largeurUnite(u) + profondeurUnite(e)) * 0.5 + 8) {
          u.contact = e; u.etat = 'melee';
        }
        return;
      }
      if (!vivants(e) || e.etat === 'fuite') {
        u.cibleEnnemi = null; u.contact = null;
        if (u.etat !== 'melee') u.etat = 'attente';
        return;
      }
      const d = U.dist(u.x, u.y, e.x, e.y);
      const portee = (largeurUnite(u) + profondeurUnite(e)) * 0.5;
      if (d < portee + 6) {
        u.contact = e;
        u.etat = 'melee';
      } else if (u.def.monte && d < 140) {
        u.etat = 'charge';
        u.tempsCharge += dt;
      } else if (u.etat !== 'melee') {
        u.etat = 'marche';
      }
    }
    if (u.contact && (!vivants(u.contact) || u.contact.etat === 'fuite')) {
      u.contact = null;
      u.etat = u.cibleEnnemi ? 'marche' : 'attente';
    }
  }

  function majMouvement(b, u, dt) {
    let dest = null, angleVise = u.angle;
    if (u.etat === 'melee' && u.contact) {
      dest = null;
      angleVise = Math.atan2(u.contact.y - u.y, u.contact.x - u.x);
    } else if (u.cibleEnnemi) {
      const e = u.cibleEnnemi;
      dest = { x: e.x, y: e.y };
      angleVise = Math.atan2(e.y - u.y, e.x - u.x);
    } else if (u.cible) {
      dest = u.cible;
      const d = U.dist(u.x, u.y, dest.x, dest.y);
      if (dest.angle !== null && dest.angle !== undefined && d < 25) angleVise = dest.angle;
      else if (d > 3) angleVise = Math.atan2(dest.y - u.y, dest.x - u.x);
    }

    // Une unité au contact ou à l'arrêt pivote lentement ; en marche elle suit son cap.
    const vitesseRot = (u.def.monte ? 1.1 : 0.55) * (0.4 + u.def.discipline) * facteurFatigue(u);
    u.angle = U.turnToward(u.angle, angleVise, vitesseRot * dt);

    if (dest) {
      const d = U.dist(u.x, u.y, dest.x, dest.y);
      const arret = u.cibleEnnemi ? (largeurUnite(u) + profondeurUnite(u.cibleEnnemi)) * 0.5 + 4 : 3;
      if (d > arret) {
        const v = vitesseUnite(b, u);
        // On n'avance pas de front tant qu'on n'est pas à peu près orienté.
        const align = Math.max(0, Math.cos(U.angleDiff(Math.atan2(dest.y - u.y, dest.x - u.x), u.angle)));
        const pas = v * dt * (0.35 + 0.65 * align);
        u.x += (dest.x - u.x) / d * pas;
        u.y += (dest.y - u.y) / d * pas;
        if (u.etat !== 'charge' && u.etat !== 'melee') u.etat = 'marche';
      } else if (u.cible) {
        u.cible = null;
        u.etat = 'attente';
        u.courir = false;
      }
    }

    u.x = U.clamp(u.x, 30, TERRAIN_W - 30);
    u.y = U.clamp(u.y, 30, TERRAIN_H - 30);

    calculerPlaces(u);
    const vitesseHomme = vitesseUnite(b, u) * 1.5 + 0.6;
    for (const s of u.soldats) {
      if (!s.vivant) continue;
      const dx = s.tx - s.x, dy = s.ty - s.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.05) {
        const pas = Math.min(d, vitesseHomme * dt);
        s.x += dx / d * pas; s.y += dy / d * pas;
      }
    }
  }

  /* Les unités ne se traversent pas : on les écarte doucement. */
  function separerUnites(b, dt) {
    const liste = b.unites.filter((u) => vivants(u) && u.etat !== 'fuite');
    for (let i = 0; i < liste.length; i++) {
      for (let j = i + 1; j < liste.length; j++) {
        const a = liste[i], c = liste[j];
        if (a.contact === c || c.contact === a) continue;
        const rA = (largeurUnite(a) + profondeurUnite(a)) * 0.22;
        const rC = (largeurUnite(c) + profondeurUnite(c)) * 0.22;
        const min = rA + rC;
        const d = U.dist(a.x, a.y, c.x, c.y);
        if (d < min && d > 0.01) {
          const f = (min - d) / d * 0.5 * Math.min(1, dt * 4);
          const dx = (c.x - a.x) * f, dy = (c.y - a.y) * f;
          a.x -= dx; a.y -= dy; c.x += dx; c.y += dy;
        }
      }
    }
  }

  /* ------------------------------------------------------------------ tir */

  function chercherCibleTir(b, u) {
    if (u.def.portee <= 0 || u.munitions <= 0) return null;
    let meilleure = null, meilleurScore = -Infinity;
    const portee = porteeEffective(u);
    for (const e of b.unites) {
      if (e.camp === u.camp || !vivants(e)) continue;
      if (e.etat === 'fuite' && !u.def.canon) continue;
      const d = U.dist(u.x, u.y, e.x, e.y);
      if (d > portee) continue;
      const arc = Math.abs(U.angleDiff(Math.atan2(e.y - u.y, e.x - u.x), u.angle));
      if (arc > (u.def.canon ? 0.32 : 0.55)) continue;
      // On préfère ce qui est proche, gros, et menaçant.
      let score = (portee - d) / portee * 100 + vivants(e) * 0.2;
      if (u.def.canon && e.formation === 'colonne') score += 25;
      if (e.contact === u) score += 60;
      if (e.classe === 'cavalerie' && d < 200) score += 40;
      if (u.cibleEnnemi === e) score += 80;
      if (score > meilleurScore) { meilleurScore = score; meilleure = e; }
    }
    return meilleure;
  }

  function porteeEffective(u) {
    let p = u.def.portee * (1 + (u.techBonus.artillerie_portee || 0) * (u.def.canon ? 1 : 0));
    return p;
  }

  function delaiRechargement(u) {
    let r = u.def.rechargement;
    r /= 1 + (u.def.canon ? (u.techBonus.artillerie_cadence || 0) : (u.techBonus.cadence || 0));
    r /= 0.75 + u.def.discipline * 0.35;
    r *= 1 + (u.fatigue / 100) * 0.25;
    r *= u.exp ? (1 - Math.min(0.15, u.exp * 0.017)) : 1;
    return r;
  }

  function majTir(b, u, dt) {
    if (u.def.portee <= 0 || u.munitions <= 0) return;
    if (u.etat === 'charge') return;
    if (u.etat === 'melee' && !u.def.canon) return;
    u.rechargement -= dt * (u.etat === 'marche' ? 0.45 : 1);
    if (u.rechargement > 0) return;
    if (!u.feuLibre) return;

    const cible = u.cibleEnnemi && U.dist(u.x, u.y, u.cibleEnnemi.x, u.cibleEnnemi.y) <= porteeEffective(u)
      ? u.cibleEnnemi : chercherCibleTir(b, u);
    if (!cible) return;

    u.rechargement = delaiRechargement(u);
    u.munitions--;
    u.derniereSalve = b.temps;
    if (u.def.canon) tirArtillerie(b, u, cible);
    else salveMousquets(b, u, cible);
  }

  function tireurs(u) {
    // En ligne, les trois rangs font feu ; en colonne, seuls les premiers.
    const n = vivants(u);
    const f = FORMATIONS[u.formation];
    if (u.formation === 'colonne') {
      const files = Math.ceil(n / f.rangs);
      return Math.min(n, files * 2);
    }
    if (u.formation === 'carre') return Math.round(n * 0.4);
    return n;
  }

  function salveMousquets(b, tireur, cible) {
    const d = U.dist(tireur.x, tireur.y, cible.x, cible.y);
    const portee = porteeEffective(tireur);
    const n = tireurs(tireur);
    if (!n) return;

    // Chute de précision avec la distance : le mousquet lisse ne vaut rien au-delà de 100 m.
    let p = tireur.def.precision * U.clamp(1 - Math.pow(d / portee, 1.5) * 0.75, 0.08, 1);
    p *= facteurFatigue(tireur);
    p *= 0.75 + tireur.def.discipline * 0.35;
    p *= 1 + tireur.exp * 0.02;
    p *= FORMATIONS[cible.formation].touche;            // les tirailleurs offrent peu de prise
    if (cible.formation === 'colonne' || cible.formation === 'carre') p *= 1.25;
    if (dansBois(b.terrain, cible.x, cible.y)) p *= 0.6;
    if (tireur.etat === 'marche') p *= 0.55;
    const deniv = altitude(b.terrain, tireur.x, tireur.y) - altitude(b.terrain, cible.x, cible.y);
    p *= U.clamp(1 + deniv * 0.012, 0.85, 1.2);
    p *= 1 + (tireur.bonusNation.infanterie || 0);

    const attendus = n * p * tireur.def.degats * 0.5;
    const touches = tirageBinomial(b.rng, attendus);
    appliquerPertes(b, cible, touches, tireur, false);
    tireur.touchesInfligees += touches;

    // Fumée : on n'anime qu'un échantillon, sinon le champ de bataille disparaît.
    const liste = tireur.soldats.filter((s) => s.vivant);
    const echantillon = Math.min(liste.length, Math.max(6, Math.round(n / 6)));
    for (let i = 0; i < echantillon; i++) {
      const s = liste[Math.floor(b.rng() * liste.length)];
      b.effets.push({ type: 'fumee', x: s.x + b.rng.range(-2, 2), y: s.y + b.rng.range(-2, 2),
        t: 0, duree: 4.5 + b.rng() * 2.5, taille: 5 + b.rng() * 4,
        dx: b.rng.range(-0.6, 1.4), dy: b.rng.range(-1.1, 0.2) });
      s.feu = 0.25;
    }
    b.effets.push({ type: 'salve', x: tireur.x, y: tireur.y, angle: tireur.angle, t: 0, duree: 0.35 });
  }

  function tirArtillerie(b, canon, cible) {
    const d = U.dist(canon.x, canon.y, cible.x, cible.y);
    const pieces = canon.def.pieces || 4;
    const portee = porteeEffective(canon);
    const mitraille = d < 180 && !canon.def.explosif;

    // Chaque pièce tire son coup : on décide tout de suite si elle touche,
    // le projectile ne sert qu'à montrer la trajectoire.
    let p = canon.def.precision * U.clamp(1 - Math.pow(d / portee, 1.2), 0.04, 1);
    p *= facteurFatigue(canon);
    if (cible.formation === 'colonne' || cible.formation === 'carre') p *= 1.5;
    if (dansBois(b.terrain, cible.x, cible.y)) p *= 0.55;
    if (mitraille) p = Math.min(0.95, p * 2.2);

    for (let i = 0; i < pieces; i++) {
      const touche = b.rng() < p;
      let degats = 0;
      if (touche) {
        if (mitraille) degats = Math.round((6 + b.rng() * 10) * canon.def.degats);
        else if (canon.def.explosif) degats = Math.round((2 + b.rng() * 5) * canon.def.degats);
        else {
          // Un boulet plein enfile la profondeur de la formation.
          degats = Math.round((1 + b.rng() * 2.4) * canon.def.degats);
          if (cible.formation === 'colonne') degats *= 2;
          if (cible.formation === 'carre') degats = Math.round(degats * 1.6);
        }
      }
      const eparpille = touche ? 6 : 14 + d * 0.05;
      const tx = cible.x + b.rng.range(-eparpille, eparpille);
      const ty = cible.y + b.rng.range(-eparpille, eparpille);
      b.projectiles.push({
        type: canon.def.explosif ? 'obus' : (mitraille ? 'mitraille' : 'boulet'),
        x: canon.x, y: canon.y, x0: canon.x, y0: canon.y, tx, ty,
        t: 0, duree: Math.max(0.35, d / 430),
        source: canon, cible, degats, camp: canon.camp,
      });
    }
    b.effets.push({ type: 'canon', x: canon.x, y: canon.y, angle: canon.angle, t: 0, duree: 0.5 });
    for (let i = 0; i < 4; i++) {
      b.effets.push({ type: 'fumee', x: canon.x + b.rng.range(-10, 10), y: canon.y + b.rng.range(-10, 10),
        t: 0, duree: 6 + b.rng() * 2.5, taille: 11 + b.rng() * 8,
        dx: b.rng.range(-0.4, 1.6), dy: b.rng.range(-1.3, 0.2) });
    }
  }

  function majProjectiles(b, dt) {
    for (let i = b.projectiles.length - 1; i >= 0; i--) {
      const p = b.projectiles[i];
      p.t += dt;
      const k = U.clamp(p.t / p.duree, 0, 1);
      p.x = U.lerp(p.x0, p.tx, k);
      p.y = U.lerp(p.y0, p.ty, k);
      if (k >= 1) {
        impact(b, p);
        b.projectiles.splice(i, 1);
      }
    }
  }

  function impact(b, p) {
    if (p.degats > 0 && p.cible && vivants(p.cible) && !p.cible.sorti) {
      const touches = Math.min(p.degats, vivants(p.cible));
      appliquerPertes(b, p.cible, touches, p.source, true);
      b.effets.push({ type: 'poussiere', x: p.x, y: p.y, t: 0, duree: 1.4, taille: 6 });
    }
    b.effets.push({
      type: p.type === 'obus' ? 'explosion' : 'impact',
      x: p.x, y: p.y, t: 0, duree: p.type === 'obus' ? 0.7 : 0.4,
    });
  }

  function tirageBinomial(rng, attendus) {
    // Approximation suffisante : partie entière plus un tirage sur le reste.
    const base = Math.floor(attendus);
    return base + (rng() < attendus - base ? 1 : 0);
  }

  function appliquerPertes(b, u, nombre, source, ignoreArmure) {
    if (nombre <= 0) return 0;
    let reste = nombre;
    if (!ignoreArmure && u.def.armure > 0) {
      reste = Math.round(reste * (1 - Math.min(0.4, u.def.armure * 0.08)));
    }
    const liste = u.soldats.filter((s) => s.vivant);
    reste = Math.min(reste, liste.length);
    for (let i = 0; i < reste; i++) {
      const s = liste[Math.floor(b.rng() * liste.length)];
      if (!s.vivant) { i--; continue; }
      s.vivant = false;
      b.effets.push({ type: 'corps', x: s.x, y: s.y, t: 0, duree: 9999, camp: u.camp });
    }
    u.pertes += reste;
    u.pertesRecentes += reste;
    b.statistiques[u.camp].perdus += reste;
    if (source) b.statistiques[source.camp].tues += reste;
    // Perdre des hommes ébranle : l'effet est proportionnel à la part de l'unité fauchée.
    const part = reste / Math.max(1, u.hommesMax);
    u.moral -= part * 140;
    if (source && source.def.canon) u.moral -= part * 40;
    return reste;
  }

  /* -------------------------------------------------------------- mêlée */

  function majMelee(b, u, dt) {
    if (u.etat !== 'melee' || !u.contact) return;
    const e = u.contact;
    if (!vivants(e) || e.sorti) { u.contact = null; u.etat = 'attente'; return; }

    const chargeEnCours = u.tempsCharge > 0.6 && u.def.monte;
    // Choc de cavalerie : un seul gros coup, puis mêlée ordinaire.
    if (chargeEnCours) {
      u.tempsCharge = 0;
      choc(b, u, e);
      return;
    }

    const frontA = Math.min(largeurUnite(u), largeurUnite(e));
    const engagesA = Math.max(4, Math.round(frontA / ESPACE_X));
    const angleAttaque = Math.abs(U.angleDiff(Math.atan2(u.y - e.y, u.x - e.x), e.angle));
    const flanc = angleAttaque > 1.05 ? (angleAttaque > 2.2 ? 2.0 : 1.45) : 1.0;

    let force = u.def.melee * (1 + u.exp * 0.03) * facteurFatigue(u);
    force *= 1 + (u.bonusNation[u.classe === 'cavalerie' ? 'cavalerie' : 'infanterie'] || 0);
    force *= 1 + (u.techBonus.infanterie_melee || 0);
    force *= flanc;
    if (u.moral < 35) force *= 0.7;
    if (e.formation === 'carre' && u.def.monte) force *= 0.3;
    if (dansBois(b.terrain, e.x, e.y) && u.def.monte) force *= 0.65;
    const deniv = altitude(b.terrain, u.x, u.y) - altitude(b.terrain, e.x, e.y);
    force *= U.clamp(1 + deniv * 0.02, 0.8, 1.25);

    let defense = e.def.defense * (1 + e.exp * 0.03) * facteurFatigue(e) * (1 + e.def.armure * 0.05);
    if (e.etat === 'fuite') { defense *= 0.35; force *= 2.4; }   // sabrer des fuyards
    const taux = force / (force + defense * 1.15);
    const morts = taux * engagesA * 0.09 * dt;
    const infliges = tirageBinomial(b.rng, morts);
    if (infliges > 0) appliquerPertes(b, e, infliges, u, false);

    e.moral -= dt * (flanc > 1.2 ? 2.4 : 0.9);
    if (b.rng() < dt * 1.5) {
      b.effets.push({ type: 'melee', x: (u.x + e.x) / 2 + b.rng.range(-14, 14), y: (u.y + e.y) / 2 + b.rng.range(-10, 10), t: 0, duree: 0.45 });
    }
    // Le défenseur riposte s'il n'a pas déjà sa propre cible.
    if (!e.contact) { e.contact = u; e.etat = 'melee'; }
  }

  function choc(b, cavalerie, cible) {
    const angleAttaque = Math.abs(U.angleDiff(Math.atan2(cavalerie.y - cible.y, cavalerie.x - cible.x), cible.angle));
    let mult = 1;
    if (angleAttaque > 2.2) mult = 2.6;            // dans le dos
    else if (angleAttaque > 1.05) mult = 1.8;      // sur le flanc
    if (cible.formation === 'carre') mult *= 0.18;
    if (cible.classe === 'artillerie') mult *= 2.2;
    if (cible.etat === 'marche') mult *= 1.25;
    if (dansBois(b.terrain, cible.x, cible.y)) mult *= 0.6;

    let charge = cavalerie.def.charge * (1 + cavalerie.exp * 0.04) * facteurFatigue(cavalerie);
    charge *= 1 + (cavalerie.bonusNation.cavalerie || 0) + (cavalerie.techBonus.charge || 0);
    const front = Math.min(largeurUnite(cavalerie), largeurUnite(cible));
    const impactHommes = charge * mult * (front / 30) * 0.42;
    const morts = tirageBinomial(b.rng, impactHommes);
    appliquerPertes(b, cible, morts, cavalerie, false);
    cible.moral -= 14 * mult;
    cavalerie.moral += 4;

    // La cavalerie qui charge un carré ou une ligne intacte se casse les dents.
    if (cible.formation === 'carre') {
      const retour = tirageBinomial(b.rng, cible.def.melee * 0.55);
      appliquerPertes(b, cavalerie, retour, cible, false);
      cavalerie.moral -= 12;
    }
    b.effets.push({ type: 'choc', x: (cavalerie.x + cible.x) / 2, y: (cavalerie.y + cible.y) / 2, t: 0, duree: 0.8 });
    cavalerie.etat = 'melee';
    cible.contact = cible.contact || cavalerie;
    if (cible.etat !== 'fuite') cible.etat = 'melee';
  }

  /* -------------------------------------------------------------- moral */

  function majMoral(b, u, dt) {
    const vivantsN = vivants(u);
    if (!vivantsN) return;

    let regen = 1.1 * dt;
    // Présence du général : le moral remonte dans un rayon de 180 m.
    const qg = b.unites.find((g) => g.general && g.camp === u.camp && vivants(g));
    if (qg && U.dist(u.x, u.y, qg.x, qg.y) < 180) regen += 1.8 * dt;
    if (u.etat === 'melee') regen -= 1.4 * dt;

    // Les voisins qui s'enfuient entraînent le reste de la ligne.
    let panique = 0;   // plafonnée plus bas : une ligne ne se volatilise pas d'un coup
    for (const v of b.unites) {
      if (v === u || v.camp !== u.camp) continue;
      if (v.etat === 'fuite' && U.dist(u.x, u.y, v.x, v.y) < 200) panique += 1.6 * dt;
    }
    // Se faire prendre à revers.
    let menaceArriere = 0;
    for (const e of b.unites) {
      if (e.camp === u.camp || !vivants(e) || e.etat === 'fuite') continue;
      const d = U.dist(u.x, u.y, e.x, e.y);
      if (d > 220) continue;
      const rel = Math.abs(U.angleDiff(Math.atan2(e.y - u.y, e.x - u.x), u.angle));
      if (rel > 1.9) menaceArriere += 2.2 * dt;
    }

    const proportion = vivantsN / u.hommesMax;
    // Plus le régiment a fondu, moins il tient : c'est l'usure qui finit par emporter la ligne.
    const usure = Math.pow(1 - proportion, 1.3) * 3.2 * dt;
    u.moral += regen - Math.min(panique, 4.0 * dt) - Math.min(menaceArriere, 3.2 * dt) - usure;
    u.moral -= (u.fatigue / 100) * 1.2 * dt;
    u.moral = U.clamp(u.moral, 0, u.moralMax);
    u.pertesRecentes = Math.max(0, u.pertesRecentes - dt * 4);

    const seuil = 14 + (1 - u.def.discipline) * 12;
    if (u.etat !== 'fuite' && u.moral <= seuil) {
      u.etat = 'fuite';
      u.routes++;
      u.moralMax *= 0.85;      // un régiment qui a rompu une fois rompt plus vite ensuite
      u.contact = null; u.cible = null; u.cibleEnnemi = null;
      u.formation = u.def.tirailleur ? 'tirailleur' : 'ligne';
      u.ralliementTimer = 0;
      b.messages.push({ t: b.temps, texte: `${u.nom} rompt les rangs !`, camp: u.camp });
    }
    if (proportion < 0.12 && u.etat !== 'fuite') {
      u.etat = 'fuite';
      b.messages.push({ t: b.temps, texte: `${u.nom} est détruit.`, camp: u.camp });
    }
  }

  function majFuite(b, u, dt) {
    if (u.sorti) return;
    // On fuit vers son propre bord de carte.
    const cibleY = u.camp === 0 ? TERRAIN_H + 60 : -60;
    const dy = Math.sign(cibleY - u.y);
    const v = u.def.vitesse * 1.35 * facteurFatigue(u);
    u.y += dy * v * dt;
    u.x += Math.sin(b.temps * 0.7 + u.id) * 6 * dt;
    u.angle = dy > 0 ? Math.PI / 2 : -Math.PI / 2;
    u.fatigue = U.clamp(u.fatigue + dt * 0.5, 0, 100);
    calculerPlaces(u);
    for (const s of u.soldats) {
      if (!s.vivant) continue;
      s.x += (s.tx - s.x) * Math.min(1, dt * 2.5) + b.rng.range(-0.4, 0.4);
      s.y += (s.ty - s.y) * Math.min(1, dt * 2.5);
    }

    // Ralliement : loin de l'ennemi, le moral remonte et l'unité peut revenir.
    let ennemiProche = false;
    for (const e of b.unites) {
      if (e.camp === u.camp || !vivants(e)) continue;
      if (U.dist(u.x, u.y, e.x, e.y) < 190) { ennemiProche = true; break; }
    }
    const qg = b.unites.find((g) => g.general && g.camp === u.camp && vivants(g));
    const aide = qg && U.dist(u.x, u.y, qg.x, qg.y) < 200 ? 2.5 : 0;
    if (!ennemiProche) {
      u.moral += (3.0 + aide + u.def.discipline * 4) * dt;
      u.ralliementTimer += dt;
      // On ne rallie pas indéfiniment : après deux ruptures, le régiment est hors de combat.
      if (u.routes < 2 && u.moral > u.moralMax * 0.42 && u.ralliementTimer > 12) {
        u.etat = 'attente';
        u.ralliementTimer = 0;
        b.messages.push({ t: b.temps, texte: `${u.nom} se reforme.`, camp: u.camp });
      }
    } else {
      u.ralliementTimer = 0;
      u.moral = Math.max(0, u.moral - dt * 1.5);
    }
    if (!u.sorti && (u.y < -110 || u.y > TERRAIN_H + 110)) {
      // L'unité a quitté le champ : ses hommes ne sont pas morts, ils sont dispersés.
      u.sorti = true;
      u.disperses = vivants(u);
    }
  }

  function majEffets(b, dt) {
    for (let i = b.effets.length - 1; i >= 0; i--) {
      const e = b.effets[i];
      if (e.duree > 9000) continue;                     // les corps restent au sol
      e.t += dt;
      if (e.type === 'fumee') { e.x += (e.dx || 1) * dt * 2.2; e.y += (e.dy || -0.5) * dt * 2.2; e.taille += dt * 2.6; }
      if (e.t >= e.duree) b.effets.splice(i, 1);
    }
    if (b.effets.length > 2600) b.effets.splice(0, b.effets.length - 2600);
    if (b.messages.length > 40) b.messages.splice(0, b.messages.length - 40);
  }

  /* ------------------------------------------------------------ conclusion */

  function forceRestante(b, camp) {
    let f = 0;
    for (const u of b.unites) {
      if (u.camp !== camp || u.general || u.sorti) continue;
      if (u.etat === 'fuite') continue;
      f += vivants(u);
    }
    return f;
  }

  function forceInitiale(b, camp) {
    let f = 0;
    for (const u of b.unites) {
      if (u.camp !== camp || u.general) continue;
      f += u.hommesMax;
    }
    return f;
  }

  /* Une armée du XVIIIe siècle ne se bat pas jusqu'au dernier homme : elle cède.
     Le seuil de rupture met fin à la bataille bien avant l'anéantissement. */
  function verifierFin(b) {
    if (!b.forceDepart) b.forceDepart = [forceInitiale(b, 0), forceInitiale(b, 1)];
    const a = forceRestante(b, 0), d = forceRestante(b, 1);
    const seuilA = b.forceDepart[0] * 0.22, seuilD = b.forceDepart[1] * 0.22;
    const briseA = a <= seuilA, briseD = d <= seuilD;
    if (briseA && briseD) { terminer(b, a / Math.max(1, b.forceDepart[0]) >= d / Math.max(1, b.forceDepart[1]) ? 0 : 1); return; }
    if (briseA) { terminer(b, 1); return; }
    if (briseD) { terminer(b, 0); return; }
    if (b.temps > b.duree) terminer(b, a / b.forceDepart[0] >= d / b.forceDepart[1] ? 0 : 1);
  }

  function terminer(b, vainqueur) {
    if (b.resultat) return;
    const pertes = [0, 1].map((c) => {
      let morts = 0, total = 0, disperses = 0;
      for (const u of b.unites) {
        if (u.camp !== c) continue;
        morts += u.hommesMax - vivants(u);
        total += u.hommesMax;
        if (u.sorti) disperses += u.disperses || 0;
      }
      return { morts, total, disperses, ratio: total ? morts / total : 0 };
    });
    b.resultat = {
      vainqueur,
      pertes,
      duree: b.temps,
      unites: b.unites.map((u) => ({ id: u.idCampagne, camp: u.camp, type: u.type,
        restants: vivants(u), initial: u.hommesMax, etat: u.etat, sorti: !!u.sorti })),
    };
    b.phase = 'fin';
  }

  G.bataille = {
    TERRAIN_W, TERRAIN_H, GRID, FORMATIONS,
    creerBataille, genererTerrain, altitude, dansBois,
    creerUniteBataille, calculerPlaces, placerInitial, vivants, largeurUnite, profondeurUnite,
    ordreDeplacement, ordreAttaque, ordreFormation, ordreHalte,
    pas, terminer, forceRestante, forceInitiale, porteeEffective, trierDeploiement,
  };
})(window.Grande = window.Grande || {});
