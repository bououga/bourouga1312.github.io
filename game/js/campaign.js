/* Cœur de la campagne : génération de la carte, économie, tours, sièges.
   Le déroulement d'un tour est repris pas à pas (voir `continuer`) pour pouvoir
   s'interrompre dès qu'une bataille concerne le joueur. */
(function (G) {
  'use strict';

  const U = G.util;
  const W = G.world;
  const A = G.army;

  const SAISONS = ['Printemps', 'Été', 'Automne', 'Hiver'];

  const COUT_TERRAIN = {
    plaine: 1.0, collines: 1.35, foret: 1.5, marais: 1.8, montagne: 2.2, desert: 1.5,
  };

  const unitById = {};
  A.UNITS.forEach((u) => { unitById[u.id] = u; });
  const factionById = {};
  W.FACTIONS.forEach((f) => { factionById[f.id] = f; });

  /* ---------------------------------------------------------------- carte */

  function genererCarte(seed) {
    const rng = U.makeRng(seed);
    const sites = [];
    const meta = [];
    for (const p of W.PROVINCES) { sites.push([p[2], p[3]]); meta.push({ type: 'terre', def: p }); }
    for (const s of W.SEAS) { sites.push([s[2], s[3]]); meta.push({ type: 'mer', def: s }); }

    const { cells, neighbors } = U.voronoi(sites, W.MAP_W, W.MAP_H);

    const provinces = {}, mers = {};
    const ordre = [];
    const parIndex = [];

    for (let i = 0; i < meta.length; i++) {
      const poly = U.smoothPoly(U.jitterPoly(cells[i], 5, rng), 2);
      if (meta[i].type === 'terre') {
        const d = meta[i].def;
        const prov = {
          id: d[0], nom: d[1], x: d[2], y: d[3], poly,
          nation: d[4], pop: d[5] * 1000, richesse: d[6], terrain: d[7],
          cotier: !!d[8], religion: d[9], capitaleNationale: !!d[10],
          voisins: [], mersAdj: [],
          batiments: {}, chantier: null, recrutement: [],
          ordre: 62, occupation: 0, revolte: 0,
          garnison: 0, siege: null,
        };
        provinces[prov.id] = prov;
        ordre.push(prov.id);
        parIndex[i] = prov.id;
      } else {
        const d = meta[i].def;
        mers[d[0]] = { id: d[0], nom: d[1], x: d[2], y: d[3], poly, voisins: [], cotes: [] };
        parIndex[i] = d[0];
      }
    }

    // Voisinages : terre-terre pour les armées, terre-mer pour les flottes et le commerce.
    for (let i = 0; i < meta.length; i++) {
      const idA = parIndex[i];
      for (const j of neighbors[i]) {
        const idB = parIndex[j];
        const aTerre = meta[i].type === 'terre', bTerre = meta[j].type === 'terre';
        if (aTerre && bTerre) {
          provinces[idA].voisins.push(idB);
        } else if (aTerre && !bTerre) {
          provinces[idA].mersAdj.push(idB);
          mers[idB].cotes.push(idA);
        } else if (!aTerre && !bTerre) {
          mers[idA].voisins.push(idB);
        }
      }
    }

    // Une province déclarée côtière mais enclavée par le découpage garde quand même
    // un port possible si elle touche une mer ; sinon on retire l'attribut.
    for (const id of ordre) {
      const p = provinces[id];
      if (p.cotier && p.mersAdj.length === 0) p.cotier = false;
    }

    return { provinces, mers, ordre };
  }

  /* --------------------------------------------------------- état initial */

  function dotationInitiale(prov, nation) {
    const b = prov.batiments;
    b.ferme = 1;
    if (prov.richesse >= 1.2) b.marche = 1;
    if (prov.cotier && prov.richesse >= 1.0) b.port = 1;
    if (prov.capitaleNationale) {
      b.caserne = 2; b.ecuries = 1; b.fort = 2; b.marche = Math.max(b.marche || 0, 2);
      if (['fra', 'gbr', 'aut', 'esp', 'ott', 'swe'].indexOf(nation) >= 0) b.fonderie = 1;
      if (['fra', 'gbr', 'ned'].indexOf(nation) >= 0) b.universite = 1;
    } else {
      b.fort = prov.richesse >= 1.2 ? 1 : 0;
      if (b.fort === 0) delete b.fort;
      if (prov.pop > 2000000) b.caserne = 1;
    }
  }

  function creerNation(def) {
    return {
      id: def.id, nom: def.nom, couleur: def.couleur, culture: def.culture,
      religion: def.religion, doctrine: def.doctrine, bonus: def.bonus || {},
      tresor: def.tresor, revenus: 0, depenses: 0,
      techs: [], recherche: null, points: 0,
      vivante: true, prestige: 0, lassitude: 0,
      ia: true,
    };
  }

  function creerEtat(seed, joueurId) {
    const rng = U.makeRng(seed + 7919);
    const carte = genererCarte(seed);
    const nations = {};
    W.FACTIONS.forEach((f) => { nations[f.id] = creerNation(f); });
    nations[joueurId].ia = false;

    const etat = {
      seed, joueur: joueurId, tour: 1, annee: 1700, saison: 0,
      provinces: carte.provinces, mers: carte.mers, ordreProvinces: carte.ordre,
      nations, armees: [], prochainId: 1,
      relations: {}, journal: [], file: null, bataille: null,
      tauxImpot: {}, rng: seed + 7919,
      fin: null,
    };

    for (const id of etat.ordreProvinces) {
      const p = etat.provinces[id];
      dotationInitiale(p, p.nation);
      p.ordre = 58 + Math.round(rng.range(-6, 10));
    }

    for (const fid of Object.keys(nations)) etat.tauxImpot[fid] = 1.0;

    initRelations(etat);
    armeesInitiales(etat, rng);
    recalculerGarnisons(etat);
    for (const fid of Object.keys(nations)) majFinances(etat, fid);

    journal(etat, 'Printemps 1700. Charles II d’Espagne se meurt sans héritier ; les chancelleries d’Europe préparent déjà leurs armées.', 'monde');
    return etat;
  }

  /* Situation diplomatique de 1700, simplifiée mais pas arbitraire. */
  function initRelations(etat) {
    const ids = Object.keys(etat.nations);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        setRel(etat, ids[i], ids[j], { etat: 'paix', opinion: 0, treve: 0, guerreDepuis: 0 });
      }
    }
    const opinions = [
      ['fra', 'esp', 40], ['fra', 'gbr', -45], ['fra', 'aut', -50], ['fra', 'ned', -40],
      ['gbr', 'ned', 45], ['gbr', 'aut', 30], ['gbr', 'por', 40],
      ['aut', 'ott', -60], ['aut', 'pru', -10], ['aut', 'bav', -20],
      ['pru', 'swe', -15], ['pru', 'pol', -10],
      ['rus', 'swe', -55], ['rus', 'ott', -50], ['rus', 'pol', -20],
      ['pol', 'swe', -45], ['dan', 'swe', -50],
      ['ott', 'ven', -35], ['ott', 'pol', -30], ['esp', 'por', -25],
      ['fra', 'bav', 35], ['fra', 'sav', 15], ['fra', 'pap', 10],
      ['sax', 'pol', 50], ['esp', 'aut', -20],
    ];
    for (const [a, b, v] of opinions) {
      const r = rel(etat, a, b); if (r) r.opinion = v;
    }
    // La Grande Guerre du Nord vient d'éclater.
    declarerGuerre(etat, 'rus', 'swe', true);
    declarerGuerre(etat, 'dan', 'swe', true);
    declarerGuerre(etat, 'pol', 'swe', true);
  }

  function clefRel(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
  function rel(etat, a, b) { return a === b ? null : etat.relations[clefRel(a, b)]; }
  function setRel(etat, a, b, v) { etat.relations[clefRel(a, b)] = v; }
  function enGuerre(etat, a, b) { const r = rel(etat, a, b); return !!r && r.etat === 'guerre'; }
  function allies(etat, a, b) { const r = rel(etat, a, b); return !!r && r.etat === 'alliance'; }

  function declarerGuerre(etat, a, b, silencieux) {
    const r = rel(etat, a, b); if (!r || r.etat === 'guerre') return;
    r.etat = 'guerre'; r.opinion = Math.min(r.opinion, -40); r.guerreDepuis = etat.tour;
    if (!silencieux) {
      journal(etat, `${art(a)} ${verbe(a, 'déclare', 'déclarent')} la guerre ${nomA(b)}.`, 'guerre', [a, b]);
      // Les alliés de la victime sont appelés ; ils suivent selon leur opinion.
      for (const c of Object.keys(etat.nations)) {
        if (c === a || c === b) continue;
        if (allies(etat, b, c) && !enGuerre(etat, a, c)) {
          const rc = rel(etat, a, c);
          if (rc.opinion < 25) {
            rc.etat = 'guerre'; rc.guerreDepuis = etat.tour;
            journal(etat, `${art(c)} ${verbe(c, 'honore', 'honorent')} son alliance et ${verbe(c, 'entre', 'entrent')} en guerre contre ${nomMin(a)}.`, 'guerre', [c, a]);
          }
        }
      }
    }
  }

  function signerPaix(etat, a, b) {
    const r = rel(etat, a, b); if (!r || r.etat !== 'guerre') return;
    r.etat = 'paix'; r.treve = 8; r.opinion = Math.max(r.opinion, -20);
    journal(etat, `Paix signée entre ${nomMin(a)} et ${nomMin(b)}.`, 'diplomatie', [a, b]);
  }

  /* ------------------------------------------------------------- armées */

  function creerArmee(etat, nationId, provinceId, composition, nom) {
    const a = {
      id: etat.prochainId++, nation: nationId, province: provinceId, nom: nom || null,
      unites: composition.map((u) => creerUnite(etat, nationId, u)),
      pm: 0, chemin: null, destination: null, enSiege: false, fatigue: 0,
    };
    etat.armees.push(a);
    return a;
  }

  function creerUnite(etat, nationId, typeId) {
    const def = unitById[typeId];
    return { type: typeId, hommes: def.hommes, exp: 0, moralBonus: 0 };
  }

  function unitesDisponibles(etat, nationId, prov) {
    const nation = etat.nations[nationId];
    const out = [];
    for (const u of A.UNITS) {
      if (u.general) continue;
      if (u.cultures.indexOf(nation.culture) < 0) continue;
      if (u.national && u.national.indexOf(nationId) < 0) continue;
      let ok = true;
      for (const b of Object.keys(u.requis)) {
        if ((prov.batiments[b] || 0) < u.requis[b]) { ok = false; break; }
      }
      if (ok) out.push(u);
    }
    return out;
  }

  function armeesDans(etat, provId, nationId) {
    return etat.armees.filter((a) => a.province === provId && (!nationId || a.nation === nationId));
  }

  function effectif(armee) {
    let n = 0; for (const u of armee.unites) n += u.hommes; return n;
  }

  function forceArmee(etat, armee) {
    let f = 0;
    const nation = etat.nations[armee.nation];
    for (const u of armee.unites) {
      const d = unitById[u.type];
      const ratio = u.hommes / d.hommes;
      let v = (d.melee + d.defense + d.charge * 0.4) * 1.6;
      if (d.portee > 0) v += d.portee * 0.05 * d.precision * 6;
      if (d.canon) v += 70;
      v *= ratio * (1 + u.exp * 0.06);
      f += v;
    }
    f *= 1 + (nation.bonus.moral || 0) * 0.5;
    f *= 1 + bonusTech(nation, 'discipline') * 0.5;
    return f;
  }

  function armeeDoitAvoirGeneral(etat, armee) {
    const aGeneral = armee.unites.some((u) => unitById[u.type].general);
    if (!aGeneral && armee.unites.length >= 4) {
      armee.unites.unshift(creerUnite(etat, armee.nation, 'general'));
    }
  }

  function armeesInitiales(etat, rng) {
    const plans = {
      fra: [['iledefrance', 8], ['lorraine', 5], ['languedoc', 3]],
      gbr: [['angleterre', 6], ['irlande', 2]],
      esp: [['castille', 5], ['flandre', 4], ['milanais', 3], ['naples', 2]],
      aut: [['autriche', 6], ['hongrie', 4], ['boheme', 3]],
      pru: [['brandebourg', 5], ['prusse', 2]],
      rus: [['moscovie', 6], ['novgorod', 3]],
      swe: [['suede', 4], ['livonie', 4], ['pomeranie', 2]],
      ott: [['constantinople', 7], ['serbie', 4], ['anatolie', 3], ['egypte', 2]],
      ned: [['hollande', 5]],
      pol: [['pologne', 5], ['lituanie', 2]],
      por: [['portugal', 3]],
      sav: [['savoie', 2]],
      ven: [['venise', 3]],
      dan: [['danemark', 3]],
      bav: [['baviere', 3]],
      sax: [['saxe', 3]],
      hre: [['rhin', 2]],
      pap: [['rome', 2]],
      tos: [['toscane', 2]],
      sui: [['suisse', 2]],
      han: [['hanovre', 2]],
      mar: [['maroc', 3]],
    };
    for (const nid of Object.keys(plans)) {
      for (const [provId, taille] of plans[nid]) {
        if (taille === 0) continue;
        const prov = etat.provinces[provId];
        if (!prov || prov.nation !== nid) continue;
        let dispo = unitesDisponibles(etat, nid, prov);
        // Une armée royale n'est pas faite de milices : on les écarte dès qu'il y a mieux.
        const sansMilice = dispo.filter((u) => u.cat !== 'milice');
        if (sansMilice.some((u) => A.CATEGORIES[u.cat].classe === 'infanterie')) dispo = sansMilice;
        const inf = dispo.filter((u) => A.CATEGORIES[u.cat].classe === 'infanterie');
        const cav = dispo.filter((u) => A.CATEGORIES[u.cat].classe === 'cavalerie');
        const art = dispo.filter((u) => A.CATEGORIES[u.cat].classe === 'artillerie');
        const comp = [];
        // Proportions d'une armée de 1700 : la ligne fait le gros, l'élite reste rare.
        const poidsCat = {
          ligne: 0.62, legere: 0.13, grenadiers: 0.16, garde: 0.05, milice: 0.04,
          cavalerie: 0.42, dragons: 0.30, lourde: 0.18, hussards: 0.10,
          canon: 0.82, obusier: 0.18,
        };
        const tirer = (pool) => {
          if (!pool.length) return null;
          let total = 0;
          for (const u of pool) total += poidsCat[u.cat] || 0.1;
          let seuil = rng() * total;
          for (const u of pool) {
            seuil -= poidsCat[u.cat] || 0.1;
            if (seuil <= 0) return u.id;
          }
          return pool[pool.length - 1].id;
        };
        for (let i = 0; i < taille; i++) {
          const r = rng();
          let choix = null;
          if (r > 0.90 && art.length) choix = tirer(art);
          else if (r > 0.68 && cav.length) choix = tirer(cav);
          if (!choix) choix = tirer(inf);
          if (choix) comp.push(choix);
        }
        if (!comp.length) continue;
        const a = creerArmee(etat, nid, provId, comp);
        armeeDoitAvoirGeneral(etat, a);
      }
    }
  }

  /* ----------------------------------------------------------- économie */

  function bonusTech(nation, clef) {
    let v = 0;
    for (const t of nation.techs) {
      const def = A.TECHS.find((x) => x.id === t);
      if (def && def.effets[clef]) v += def.effets[clef];
    }
    return v;
  }
  function aTech(nation, id) { return nation.techs.indexOf(id) >= 0; }

  function revenuProvince(etat, prov) {
    const nation = etat.nations[prov.nation];
    if (!nation) return { brut: 0, impot: 0, commerce: 0, industrie: 0 };
    const b = prov.batiments;
    const taux = etat.tauxImpot[prov.nation] || 1;
    const base = (prov.pop / 1000) * 0.26 * prov.richesse;
    let impot = base * taux * (1 + bonusTech(nation, 'impot') + (nation.bonus.revenu || 0));
    let commerce = base * (0.12 * (b.marche || 0) + 0.20 * (b.port || 0))
      * (1 + bonusTech(nation, 'commerce') + (nation.bonus.commerce || 0));
    let industrie = (b.manufacture || 0) * 70 * prov.richesse * (1 + bonusTech(nation, 'industrie'));
    // Une province mal tenue ou récemment conquise rapporte mal.
    const rendement = U.clamp(0.35 + prov.ordre / 130, 0.35, 1.05) * (prov.occupation > 0 ? 0.6 : 1);
    impot *= rendement; commerce *= rendement; industrie *= rendement;
    return { brut: impot + commerce + industrie, impot, commerce, industrie };
  }

  function entretienArmees(etat, nationId) {
    let total = 0;
    for (const a of etat.armees) {
      if (a.nation !== nationId) continue;
      for (const u of a.unites) {
        const d = unitById[u.type];
        total += d.entretien * (0.35 + 0.65 * (u.hommes / d.hommes));
      }
    }
    // Certains États entretiennent leurs troupes à bien meilleur compte :
    // cantons prussiens, timars ottomans, serfs-soldats russes.
    const n = etat.nations[nationId];
    if (n) total *= 1 + (n.bonus.entretien || 0);
    return total;
  }

  function entretienBatiments(etat, nationId) {
    let total = 0;
    for (const id of etat.ordreProvinces) {
      const p = etat.provinces[id];
      if (p.nation !== nationId) continue;
      for (const b of Object.keys(p.batiments)) total += (p.batiments[b] || 0) * 18;
    }
    return total;
  }

  function majFinances(etat, nationId) {
    const nation = etat.nations[nationId];
    let brut = 0;
    for (const id of etat.ordreProvinces) {
      const p = etat.provinces[id];
      if (p.nation === nationId) brut += revenuProvince(etat, p).brut;
    }
    const corruption = brut * Math.max(0, 0.10 + bonusTech(nation, 'corruption'));
    nation.revenus = brut - corruption;
    nation.depenses = entretienArmees(etat, nationId) + entretienBatiments(etat, nationId);
    nation.solde = nation.revenus - nation.depenses;
    return nation.solde;
  }

  function ordrePublicCible(etat, prov) {
    const nation = etat.nations[prov.nation];
    if (!nation) return 50;
    let o = 52;
    o += (prov.batiments.fort || 0) * 7;
    o += prov.garnison * 0.004;
    o += (1 - (etat.tauxImpot[prov.nation] || 1)) * 34;
    o += bonusTech(nation, 'ordre') || 0;
    o += (nation.bonus.ordre || 0);
    if (prov.religion !== nation.religion) o -= 16;
    if (prov.capitaleNationale) o += 8;
    o -= prov.occupation * 2.2;
    const dCap = distanceCapitale(etat, prov);
    o -= Math.min(14, dCap * 0.012);
    let guerres = 0;
    for (const autre of Object.keys(etat.nations)) if (enGuerre(etat, prov.nation, autre)) guerres++;
    o -= Math.min(12, guerres * 2.5);
    o -= nation.lassitude * 0.4;
    return U.clamp(o, 0, 100);
  }

  function distanceCapitale(etat, prov) {
    const nation = etat.nations[prov.nation];
    if (!nation) return 0;
    let best = Infinity;
    for (const id of etat.ordreProvinces) {
      const p = etat.provinces[id];
      if (p.nation === prov.nation && p.capitaleNationale) {
        best = Math.min(best, U.dist(p.x, p.y, prov.x, prov.y));
      }
    }
    return best === Infinity ? 300 : best;
  }

  function recalculerGarnisons(etat) {
    for (const id of etat.ordreProvinces) {
      const p = etat.provinces[id];
      p.garnison = Math.round(200 + (p.batiments.fort || 0) * 450 + (p.pop / 1000) * 0.06);
    }
  }

  /* ------------------------------------------------- déplacements & chemins */

  function coutEntree(etat, prov, nationId) {
    let c = COUT_TERRAIN[prov.terrain] || 1;
    if (prov.nation !== nationId && !allies(etat, prov.nation, nationId)) c += 0.35;
    return c;
  }

  function pointsMouvement(etat, nationId) {
    const n = etat.nations[nationId];
    return 2.6 * (1 + bonusTech(n, 'mouvement'));
  }

  /** Dijkstra sur le graphe des provinces terrestres. */
  function trouverChemin(etat, depart, arrivee, nationId) {
    if (depart === arrivee) return [];
    const dist = { [depart]: 0 }, prev = {};
    const heap = new U.MinHeap();
    heap.push(depart, 0);
    const vus = {};
    while (heap.size) {
      const cur = heap.pop();
      if (vus[cur]) continue;
      vus[cur] = true;
      if (cur === arrivee) break;
      for (const v of etat.provinces[cur].voisins) {
        const p = etat.provinces[v];
        // On ne traverse pas le territoire d'une nation neutre sans y être autorisé.
        const hostile = p.nation !== nationId && !allies(etat, p.nation, nationId) && !enGuerre(etat, p.nation, nationId);
        if (hostile && v !== arrivee) continue;
        const nd = dist[cur] + coutEntree(etat, p, nationId);
        if (dist[v] === undefined || nd < dist[v]) { dist[v] = nd; prev[v] = cur; heap.push(v, nd); }
      }
    }
    if (dist[arrivee] === undefined) return null;
    const chemin = [];
    let c = arrivee;
    while (c !== depart) { chemin.unshift(c); c = prev[c]; }
    return chemin;
  }

  function ordonnerMarche(etat, armee, destination) {
    if (destination === armee.province) { armee.chemin = null; armee.destination = null; return true; }
    const chemin = trouverChemin(etat, armee.province, destination, armee.nation);
    if (!chemin) return false;
    armee.chemin = chemin; armee.destination = destination; armee.enSiege = false;
    return true;
  }

  /* --------------------------------------------------------- déroulé du tour */

  function journal(etat, texte, type, nations) {
    etat.journal.unshift({ tour: etat.tour, annee: etat.annee, saison: etat.saison, texte, type: type || 'info', nations: nations || [], lu: false });
    if (etat.journal.length > 200) etat.journal.length = 200;
  }

  /** Prépare la file d'actions du tour : IA, puis mouvements de toutes les armées. */
  function commencerTour(etat) {
    G.ia.jouerTour(etat);
    const file = [];
    for (const a of etat.armees) {
      if (a.chemin && a.chemin.length) file.push({ type: 'marche', armee: a.id });
    }
    // Le joueur bouge en premier, puis les autres : ses ordres ne sont pas préemptés.
    file.sort((x, y) => {
      const ax = etat.armees.find((a) => a.id === x.armee);
      const ay = etat.armees.find((a) => a.id === y.armee);
      const px = ax && ax.nation === etat.joueur ? 0 : 1;
      const py = ay && ay.nation === etat.joueur ? 0 : 1;
      return px - py;
    });
    etat.file = file;
    for (const a of etat.armees) a.pm = pointsMouvement(etat, a.nation);
  }

  /**
   * Fait avancer le tour jusqu'au prochain événement qui demande le joueur.
   * Renvoie { type: 'bataille', ... } ou { type: 'fin' }.
   */
  function continuer(etat) {
    if (etat.file === null) commencerTour(etat);

    while (etat.file.length) {
      const tache = etat.file.shift();
      const armee = etat.armees.find((a) => a.id === tache.armee);
      if (!armee || !armee.unites.length) continue;
      const res = avancerArmee(etat, armee);
      if (res && res.type === 'bataille_joueur') return res;
      if (armee.chemin && armee.chemin.length && armee.pm > 0.01) etat.file.push(tache);
    }

    finDeTour(etat);
    return { type: 'fin' };
  }

  function avancerArmee(etat, armee) {
    if (!armee.chemin || !armee.chemin.length) return null;
    const suivant = armee.chemin[0];
    const prov = etat.provinces[suivant];
    const cout = coutEntree(etat, prov, armee.nation);
    if (armee.pm < cout * 0.5) { armee.pm = 0; return null; }
    armee.pm -= cout;
    armee.chemin.shift();

    // Rencontre : une armée ennemie stationnée dans la province déclenche la bataille.
    const ennemis = etat.armees.filter((a) => a.province === suivant && enGuerre(etat, a.nation, armee.nation) && a.unites.length);
    if (ennemis.length) {
      armee.chemin = null; armee.destination = null;
      return engager(etat, armee, ennemis);
    }

    armee.province = suivant;
    if (!armee.chemin.length) { armee.chemin = null; armee.destination = null; }

    // Province ennemie sans armée : occupation immédiate, ou siège s'il y a une place forte.
    if (enGuerre(etat, prov.nation, armee.nation)) {
      if ((prov.batiments.fort || 0) > 0) {
        return commencerSiege(etat, armee, prov);
      }
      capturerProvince(etat, prov, armee.nation);
    }
    return null;
  }

  function commencerSiege(etat, armee, prov) {
    if (!prov.siege || prov.siege.nation !== armee.nation) {
      prov.siege = { nation: armee.nation, tours: 0, duree: 2 + (prov.batiments.fort || 1) * 2 };
      journal(etat, `Les troupes ${nomDe(armee.nation)} mettent le siège devant ${prov.nom}.`, 'siege', [armee.nation, prov.nation]);
    }
    armee.enSiege = true;
    armee.chemin = null; armee.destination = null;
    return null;
  }

  function capturerProvince(etat, prov, nationId) {
    const ancien = prov.nation;
    prov.nation = nationId;
    prov.occupation = 6;
    prov.ordre = Math.max(12, prov.ordre - 30);
    prov.siege = null;
    prov.chantier = null;
    prov.recrutement = [];
    // Un sac de ville rapporte, mais laisse la province exsangue.
    const butin = Math.round((prov.pop / 1000) * 0.6 * prov.richesse + (prov.batiments.marche || 0) * 200);
    etat.nations[nationId].tresor += butin;
    prov.pop = Math.round(prov.pop * 0.96);
    journal(etat, `${prov.nom} tombe aux mains ${nomDe(nationId)} (butin : ${U.formatNumber(butin)} écus).`, 'capture', [nationId, ancien]);
    verifierElimination(etat, ancien);
  }

  function verifierElimination(etat, nationId) {
    // Les insurgés n'ont pas de territoire : ils ne « disparaissent » jamais de ce fait.
    if (nationId === 'reb') return;
    if (!etat.nations[nationId] || !etat.nations[nationId].vivante) return;
    const reste = etat.ordreProvinces.some((id) => etat.provinces[id].nation === nationId);
    if (!reste) {
      etat.nations[nationId].vivante = false;
      etat.armees = etat.armees.filter((a) => a.nation !== nationId);
      journal(etat, `${art(nationId)} ${verbe(nationId, 'disparaît', 'disparaissent')} de la carte.`, 'elimination', [nationId]);
      if (nationId === etat.joueur) etat.fin = { victoire: false, raison: 'Votre nation a cessé d’exister.' };
    }
  }

  /* Petites formes françaises : « La France », « la France », « à la France »,
     « de la France ». L'article se déduit de la forme sujet stockée dans les données. */
  function art(nationId) { const f = factionById[nationId]; return f ? f.art : '?'; }
  function nomDe(nationId) { const f = factionById[nationId]; return f ? f.de : '?'; }
  function nomMin(nationId) {
    const a = art(nationId);
    if (a.startsWith('L\'')) return 'l\'' + a.slice(2);
    if (a.startsWith('La ') || a.startsWith('Le ') || a.startsWith('Les ')) {
      return a.charAt(0).toLowerCase() + a.slice(1);
    }
    return a;
  }
  function nomA(nationId) {
    const a = art(nationId);
    if (a.startsWith('Les ')) return 'aux ' + a.slice(4);
    if (a.startsWith('Le ')) return 'au ' + a.slice(3);
    if (a.startsWith('La ')) return 'à la ' + a.slice(3);
    if (a.startsWith('L\'')) return 'à l\'' + a.slice(2);
    return 'à ' + a;
  }
  /** « Les Provinces-Unies déclarent » contre « La France déclare ». */
  function estPluriel(nationId) { return art(nationId).startsWith('Les '); }
  function verbe(nationId, singulier, pluriel) { return estPluriel(nationId) ? pluriel : singulier; }

  function adj(etat, nationId) {
    const f = factionById[nationId];
    return f ? f.gentile : '?';
  }

  /* ------------------------------------------------------------- batailles */

  function engager(etat, attaquant, defenseurs) {
    const prov = etat.provinces[attaquant.chemin ? attaquant.chemin[0] : defenseurs[0].province] || etat.provinces[defenseurs[0].province];
    const defenseur = defenseurs.reduce((a, b) => (forceArmee(etat, a) >= forceArmee(etat, b) ? a : b));
    // Les autres armées amies présentes renforcent le défenseur.
    const renforts = defenseurs.filter((a) => a !== defenseur);

    const contexte = {
      province: prov.id,
      attaquant: attaquant.id,
      defenseur: defenseur.id,
      renforts: renforts.map((a) => a.id),
      terrain: prov.terrain,
      saison: etat.saison,
      assaut: false,
    };

    if (attaquant.nation === etat.joueur || defenseur.nation === etat.joueur) {
      etat.bataille = contexte;
      return { type: 'bataille_joueur', contexte };
    }
    const res = autoResolution(etat, contexte);
    appliquerResultatBataille(etat, contexte, res);
    return null;
  }

  /** Résolution automatique : rapport de forces bruité, pertes proportionnelles. */
  function autoResolution(etat, ctx) {
    const rng = U.makeRng(etat.rng++ | 0);
    const att = etat.armees.find((a) => a.id === ctx.attaquant);
    const def = etat.armees.find((a) => a.id === ctx.defenseur);
    if (!att || !def) return null;
    let fa = forceArmee(etat, att);
    let fd = forceArmee(etat, def);
    for (const id of ctx.renforts) {
      const r = etat.armees.find((a) => a.id === id);
      if (r) fd += forceArmee(etat, r);
    }
    const prov = etat.provinces[ctx.province];
    // Le défenseur connaît le terrain.
    fd *= 1.08;
    if (prov.terrain === 'montagne' || prov.terrain === 'foret') fd *= 1.10;
    if (prov.nation === def.nation) fd *= 1.05;
    if (ctx.assaut) fd *= 1 + (prov.batiments.fort || 0) * 0.30 * (1 + bonusTech(etat.nations[prov.nation], 'defense_siege'));
    fa *= rng.range(0.82, 1.18);
    fd *= rng.range(0.82, 1.18);

    const ratio = fa / (fa + fd);
    const attGagne = ratio > 0.5;
    // Une bataille serrée saigne les deux camps ; une déroute épargne le vainqueur.
    const ecart = Math.abs(ratio - 0.5) * 2;
    const perteVainqueur = U.clamp(0.28 * (1 - ecart) + 0.04, 0.04, 0.32);
    const perteVaincu = U.clamp(0.35 + 0.45 * ecart, 0.35, 0.82);

    return {
      attaquantVainqueur: attGagne,
      perteAttaquant: attGagne ? perteVainqueur : perteVaincu,
      perteDefenseur: attGagne ? perteVaincu : perteVainqueur,
      auto: true,
    };
  }

  function appliquerPertes(etat, armee, ratio) {
    let morts = 0;
    for (const u of armee.unites) {
      const d = unitById[u.type];
      const perdus = Math.round(u.hommes * ratio * (d.general ? 0.5 : 1));
      u.hommes = Math.max(0, u.hommes - perdus);
      morts += perdus;
      if (u.hommes > 0) u.exp = Math.min(9, u.exp + 0.35);
    }
    armee.unites = armee.unites.filter((u) => u.hommes >= 8);
    return morts;
  }

  function appliquerResultatBataille(etat, ctx, res) {
    if (!res) { etat.bataille = null; return; }
    const att = etat.armees.find((a) => a.id === ctx.attaquant);
    const def = etat.armees.find((a) => a.id === ctx.defenseur);
    const prov = etat.provinces[ctx.province];
    if (!att || !def) { etat.bataille = null; return; }

    const mortsA = appliquerPertes(etat, att, res.perteAttaquant);
    let mortsD = appliquerPertes(etat, def, res.perteDefenseur);
    for (const id of ctx.renforts) {
      const r = etat.armees.find((a) => a.id === id);
      if (r) mortsD += appliquerPertes(etat, r, res.perteDefenseur * 0.9);
    }

    const vainqueur = res.attaquantVainqueur ? att.nation : def.nation;
    const nomProv = prov ? prov.nom : 'la frontière';
    journal(etat,
      `Bataille de ${nomProv} : victoire ${nomDe(vainqueur)}. ` +
      `Pertes : ${U.formatNumber(mortsA)} (${etat.nations[att.nation].nom}) ` +
      `contre ${U.formatNumber(mortsD)} (${etat.nations[def.nation].nom}).`,
      'bataille', [att.nation, def.nation]);

    etat.nations[vainqueur].prestige += 3;
    etat.nations[att.nation].lassitude += 1;
    etat.nations[def.nation].lassitude += 1;

    if (res.attaquantVainqueur) {
      // Le vaincu se replie vers une province amie adjacente.
      replier(etat, def);
      for (const id of ctx.renforts) {
        const r = etat.armees.find((a) => a.id === id); if (r) replier(etat, r);
      }
      if (att.unites.length && prov) {
        att.province = prov.id;
        if (enGuerre(etat, prov.nation, att.nation)) {
          if ((prov.batiments.fort || 0) > 0 && !ctx.assaut) commencerSiege(etat, att, prov);
          else capturerProvince(etat, prov, att.nation);
        }
      }
    } else {
      replier(etat, att);
    }

    etat.armees = etat.armees.filter((a) => a.unites.length > 0);
    etat.bataille = null;
    verifierElimination(etat, att.nation);
    verifierElimination(etat, def.nation);
  }

  function replier(etat, armee) {
    if (!armee.unites.length) return;
    armee.chemin = null; armee.destination = null; armee.enSiege = false; armee.pm = 0;
    const prov = etat.provinces[armee.province];
    const refuges = prov.voisins
      .map((id) => etat.provinces[id])
      .filter((p) => p.nation === armee.nation || allies(etat, p.nation, armee.nation));
    if (refuges.length) {
      refuges.sort((a, b) => (b.batiments.fort || 0) - (a.batiments.fort || 0));
      armee.province = refuges[0].id;
    }
  }

  /* ------------------------------------------------------------- fin de tour */

  function finDeTour(etat) {
    const rng = U.makeRng(etat.rng++ | 0);

    // Sièges
    for (const id of etat.ordreProvinces) {
      const p = etat.provinces[id];
      if (!p.siege) continue;
      const assiegeants = armeesDans(etat, id, p.siege.nation).filter((a) => a.enSiege);
      if (!assiegeants.length) { p.siege = null; continue; }
      p.siege.tours++;
      if (p.siege.tours >= p.siege.duree) {
        journal(etat, `${p.nom} capitule après ${p.siege.tours} saisons de siège.`, 'siege', [p.siege.nation, p.nation]);
        const n = p.siege.nation;
        capturerProvince(etat, p, n);
        for (const a of assiegeants) a.enSiege = false;
      }
    }

    // Chantiers et recrutement
    for (const id of etat.ordreProvinces) {
      const p = etat.provinces[id];
      if (p.chantier) {
        p.chantier.tours--;
        if (p.chantier.tours <= 0) {
          p.batiments[p.chantier.batiment] = p.chantier.niveau;
          if (p.nation === etat.joueur) {
            journal(etat, `${A.BUILDINGS[p.chantier.batiment].nom} (niveau ${p.chantier.niveau}) achevé à ${p.nom}.`, 'construction', [p.nation]);
          }
          p.chantier = null;
        }
      }
      if (p.recrutement.length) {
        const r = p.recrutement[0];
        r.tours--;
        if (r.tours <= 0) {
          p.recrutement.shift();
          let cible = armeesDans(etat, id, p.nation).find((a) => !a.enSiege && a.unites.length < 20);
          if (!cible) cible = creerArmee(etat, p.nation, id, []);
          cible.unites.push(creerUnite(etat, p.nation, r.unite));
          armeeDoitAvoirGeneral(etat, cible);
          if (p.nation === etat.joueur) {
            journal(etat, `${unitById[r.unite].nom} rejoint les rangs à ${p.nom}.`, 'recrutement', [p.nation]);
          }
        }
      }
    }

    // Population, ordre public, révoltes
    for (const id of etat.ordreProvinces) {
      const p = etat.provinces[id];
      const cible = ordrePublicCible(etat, p);
      p.ordre += U.clamp(cible - p.ordre, -6, 4);
      p.ordre = U.clamp(p.ordre, 0, 100);
      if (p.occupation > 0) p.occupation--;

      const croissance = 0.004 * (1 + (p.batiments.ferme || 0) * 0.25) * (p.ordre / 60)
        * (etat.saison === 3 ? 0.4 : 1);
      p.pop = Math.max(20000, Math.round(p.pop * (1 + croissance - 0.0012)));

      if (p.ordre < 22 && rng.chance((22 - p.ordre) / 90)) declencherRevolte(etat, p, rng);
    }

    // Finances, recherche, lassitude
    for (const nid of Object.keys(etat.nations)) {
      const n = etat.nations[nid];
      if (!n.vivante) continue;
      const solde = majFinances(etat, nid);
      n.tresor += solde;
      if (n.tresor < 0) {
        // Faillite : les régiments se débandent faute de solde.
        const armees = etat.armees.filter((a) => a.nation === nid && a.unites.length);
        if (armees.length) {
          const a = armees[Math.floor(rng() * armees.length)];
          a.unites.pop();
          if (nid === etat.joueur) journal(etat, 'Trésor vide : un régiment se débande faute de solde.', 'crise', [nid]);
        }
        n.tresor = Math.max(n.tresor, -2000);
      }
      const universites = etat.ordreProvinces.reduce((acc, id) => {
        const p = etat.provinces[id];
        return acc + (p.nation === nid ? (p.batiments.universite || 0) : 0);
      }, 0);
      const provs = etat.ordreProvinces.filter((id) => etat.provinces[id].nation === nid).length;
      const gain = (4 + provs * 0.6 + universites * 7) * (1 + bonusTech(n, 'recherche'));
      n.points += gain;
      if (n.recherche) {
        const def = A.TECHS.find((t) => t.id === n.recherche);
        if (def && n.points >= def.cout) {
          n.points -= def.cout;
          n.techs.push(def.id);
          n.recherche = null;
          if (nid === etat.joueur) journal(etat, `Découverte : ${def.nom}.`, 'science', [nid]);
        }
      }
      let enGuerreQte = 0;
      for (const autre of Object.keys(etat.nations)) if (enGuerre(etat, nid, autre)) enGuerreQte++;
      n.lassitude = U.clamp(n.lassitude + (enGuerreQte ? 0.5 * enGuerreQte : -1.2), 0, 30);
    }

    // Attrition hivernale : les armées en campagne fondent.
    if (etat.saison === 3) {
      for (const a of etat.armees) {
        const p = etat.provinces[a.province];
        const chezSoi = p.nation === a.nation || allies(etat, p.nation, a.nation);
        if (chezSoi && !a.enSiege) continue;
        const taux = a.enSiege ? 0.05 : 0.03;
        for (const u of a.unites) u.hommes = Math.max(4, Math.round(u.hommes * (1 - taux)));
      }
      journal(etat, 'L’hiver s’installe : les armées en campagne perdent des hommes au froid et à la maladie.', 'monde');
    }

    // Trêves, opinions
    for (const k of Object.keys(etat.relations)) {
      const r = etat.relations[k];
      if (r.treve > 0) r.treve--;
      if (r.etat === 'paix' && r.opinion < 0) r.opinion = Math.min(0, r.opinion + 0.6);
      if (r.etat === 'alliance') r.opinion = Math.min(100, r.opinion + 0.4);
    }

    recalculerGarnisons(etat);
    for (const a of etat.armees) { a.enSiege = a.enSiege && !!etat.provinces[a.province].siege; }
    etat.armees = etat.armees.filter((a) => a.unites.length > 0);

    etat.saison = (etat.saison + 1) % 4;
    if (etat.saison === 0) etat.annee++;
    etat.tour++;
    etat.file = null;
    verifierVictoire(etat);
  }

  function declencherRevolte(etat, prov, rng) {
    const nb = 2 + Math.floor(rng() * 3);
    const dispo = unitesDisponibles(etat, prov.nation, { batiments: {} });
    const comp = [];
    for (let i = 0; i < nb; i++) comp.push(dispo.length ? dispo[0].id : 'milice');
    const a = creerArmee(etat, 'reb', prov.id, comp, 'Insurgés de ' + prov.nom);
    declarerGuerre(etat, 'reb', prov.nation, true);
    prov.ordre += 12;
    journal(etat, `Révolte à ${prov.nom} : ${U.formatNumber(effectif(a))} insurgés prennent les armes.`, 'revolte', [prov.nation]);
  }

  function verifierVictoire(etat) {
    if (etat.fin) return;
    const total = etat.ordreProvinces.length;
    const miennes = etat.ordreProvinces.filter((id) => etat.provinces[id].nation === etat.joueur).length;
    if (miennes >= Math.ceil(total * 0.45)) {
      etat.fin = { victoire: true, raison: `Vous contrôlez ${miennes} provinces sur ${total} : l’Europe est à vous.` };
    }
    if (etat.annee >= 1760 && etat.saison === 0) {
      etat.fin = { victoire: miennes >= 12, raison: `1760. Fin de la partie avec ${miennes} provinces.` };
    }
  }

  /* ------------------------------------------------------------- actions joueur */

  function peutConstruire(etat, prov, batiment) {
    const def = A.BUILDINGS[batiment];
    if (!def) return { ok: false, raison: 'Bâtiment inconnu' };
    if (prov.chantier) return { ok: false, raison: 'Un chantier est déjà en cours' };
    if (def.cotier && !prov.cotier) return { ok: false, raison: 'Province sans accès à la mer' };
    const niveau = (prov.batiments[batiment] || 0) + 1;
    if (niveau > def.max) return { ok: false, raison: 'Niveau maximal atteint' };
    const cout = def.cout[niveau - 1];
    if (etat.nations[prov.nation].tresor < cout) return { ok: false, raison: 'Trésor insuffisant' };
    if (prov.siege) return { ok: false, raison: 'Province assiégée' };
    return { ok: true, niveau, cout, tours: def.tours[niveau - 1] };
  }

  function lancerConstruction(etat, provId, batiment) {
    const prov = etat.provinces[provId];
    const c = peutConstruire(etat, prov, batiment);
    if (!c.ok) return c;
    etat.nations[prov.nation].tresor -= c.cout;
    prov.chantier = { batiment, niveau: c.niveau, tours: c.tours, total: c.tours };
    return { ok: true };
  }

  function coutRecrutement(etat, nationId, unitId) {
    const n = etat.nations[nationId];
    const d = unitById[unitId];
    let c = d.cout * (1 + (n.bonus.recrutement || 0));
    if (A.CATEGORIES[d.cat].classe === 'artillerie') c *= 1 + bonusTech(n, 'cout_artillerie');
    return Math.round(c);
  }

  function lancerRecrutement(etat, provId, unitId) {
    const prov = etat.provinces[provId];
    const nation = etat.nations[prov.nation];
    const dispo = unitesDisponibles(etat, prov.nation, prov);
    if (!dispo.some((u) => u.id === unitId)) return { ok: false, raison: 'Bâtiment requis manquant' };
    if (prov.siege) return { ok: false, raison: 'Province assiégée' };
    if (prov.recrutement.length >= 4) return { ok: false, raison: 'File de recrutement pleine' };
    const cout = coutRecrutement(etat, prov.nation, unitId);
    if (nation.tresor < cout) return { ok: false, raison: 'Trésor insuffisant' };
    nation.tresor -= cout;
    const d = unitById[unitId];
    const tours = A.CATEGORIES[d.cat].classe === 'artillerie' ? 3 : (d.cat === 'garde' ? 3 : 2);
    prov.recrutement.push({ unite: unitId, tours, total: tours });
    return { ok: true };
  }

  function fusionnerArmees(etat, aId, bId) {
    const a = etat.armees.find((x) => x.id === aId);
    const b = etat.armees.find((x) => x.id === bId);
    if (!a || !b || a.nation !== b.nation || a.province !== b.province) return false;
    for (const u of b.unites) {
      if (unitById[u.type].general && a.unites.some((x) => unitById[x.type].general)) continue;
      a.unites.push(u);
    }
    etat.armees = etat.armees.filter((x) => x.id !== b.id);
    return true;
  }

  G.campagne = {
    SAISONS, COUT_TERRAIN, unitById, factionById,
    creerEtat, genererCarte, continuer, commencerTour,
    rel, enGuerre, allies, declarerGuerre, signerPaix, clefRel,
    armeesDans, effectif, forceArmee, creerArmee, creerUnite, unitesDisponibles,
    trouverChemin, ordonnerMarche, pointsMouvement, coutEntree,
    revenuProvince, majFinances, ordrePublicCible, entretienArmees, entretienBatiments,
    peutConstruire, lancerConstruction, lancerRecrutement, coutRecrutement, fusionnerArmees,
    appliquerResultatBataille, autoResolution, appliquerPertes, capturerProvince,
    bonusTech, aTech, journal, distanceCapitale, armeeDoitAvoirGeneral,
    art, nomDe, nomMin, nomA, adj, verbe, estPluriel,
  };
})(window.Grande = window.Grande || {});
