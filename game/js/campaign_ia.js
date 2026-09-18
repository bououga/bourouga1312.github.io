/* Intelligence artificielle de campagne.
   Chaque nation joue dans l'ordre : finances, construction, recrutement,
   mouvements, puis diplomatie. Les décisions restent lisibles : l'IA ne triche
   ni sur le trésor ni sur la visibilité. */
(function (G) {
  'use strict';

  const U = G.util;
  const A = G.army;
  const C = () => G.campagne;

  function jouerTour(etat) {
    const K = C();
    for (const nid of Object.keys(etat.nations)) {
      const n = etat.nations[nid];
      if (!n.vivante || !n.ia || nid === 'reb') continue;
      K.majFinances(etat, nid);
      choisirRecherche(etat, nid);
      reglerImpots(etat, nid);
      gererProvinces(etat, nid);
      gererArmees(etat, nid);
      gererDiplomatie(etat, nid);
    }
    gererRebelles(etat);
  }

  /* ------------------------------------------------------------- recherche */

  function choisirRecherche(etat, nid) {
    const n = etat.nations[nid];
    if (n.recherche) return;
    const dispo = A.TECHS.filter((t) => n.techs.indexOf(t.id) < 0 && t.requis.every((r) => n.techs.indexOf(r) >= 0));
    if (!dispo.length) return;
    const gout = { militariste: 'militaire', hegemonie: 'militaire', expansionniste: 'militaire',
      maritime: 'industrielle', defensif: 'civile', opportuniste: 'civile' };
    const pref = gout[n.doctrine] || 'civile';
    dispo.sort((a, b) => {
      const pa = (a.branche === pref ? -1000 : 0) + a.cout;
      const pb = (b.branche === pref ? -1000 : 0) + b.cout;
      return pa - pb;
    });
    n.recherche = dispo[0].id;
  }

  /* -------------------------------------------------------------- finances */

  function reglerImpots(etat, nid) {
    const n = etat.nations[nid];
    const provs = provincesDe(etat, nid);
    if (!provs.length) return;
    const ordreMoyen = provs.reduce((s, p) => s + p.ordre, 0) / provs.length;
    let taux = etat.tauxImpot[nid];
    if (ordreMoyen < 38) taux -= 0.1;
    else if (n.tresor < 2500) taux += 0.1;
    else if (ordreMoyen > 70 && n.tresor < 12000) taux += 0.05;
    else if (n.tresor > 25000) taux -= 0.05;
    etat.tauxImpot[nid] = U.clamp(taux, 0.6, 1.4);
  }

  function provincesDe(etat, nid) {
    return etat.ordreProvinces.map((id) => etat.provinces[id]).filter((p) => p.nation === nid);
  }

  /* ---------------------------------------------------- bâtiments & troupes */

  function gererProvinces(etat, nid) {
    const K = C();
    const n = etat.nations[nid];
    const provs = provincesDe(etat, nid);
    const enGuerre = nationsEnGuerreAvec(etat, nid).length > 0;

    // On garde toujours de quoi payer l'entretien de deux saisons.
    const reserve = Math.max(1500, n.depenses * 2);

    // Construction : une province à la fois, la plus rentable d'abord.
    const candidats = provs.filter((p) => !p.chantier && !p.siege);
    candidats.sort((a, b) => (b.pop * b.richesse) - (a.pop * a.richesse));
    for (const p of candidats.slice(0, 3)) {
      if (n.tresor < reserve + 800) break;
      const choix = choisirBatiment(etat, nid, p, enGuerre);
      if (choix) K.lancerConstruction(etat, p.id, choix);
    }

    // Recrutement : on vise une armée proportionnelle au territoire, plus en guerre.
    const cible = Math.round(provs.length * (enGuerre ? 3.4 : 2.0)) + 4;
    const actuel = etat.armees.reduce((s, a) => s + (a.nation === nid ? a.unites.length : 0), 0)
      + provs.reduce((s, p) => s + p.recrutement.length, 0);
    if (actuel >= cible) return;

    const casernes = provs.filter((p) => !p.siege && p.recrutement.length < 2 && (p.batiments.caserne || p.batiments.ecuries || p.batiments.fonderie));
    casernes.sort((a, b) => (b.batiments.caserne || 0) - (a.batiments.caserne || 0));
    for (const p of casernes.slice(0, 4)) {
      if (n.tresor < reserve) break;
      const dispo = K.unitesDisponibles(etat, nid, p);
      if (!dispo.length) continue;
      const u = choisirUnite(etat, nid, dispo);
      if (!u) continue;
      if (K.coutRecrutement(etat, nid, u.id) > n.tresor - reserve) continue;
      K.lancerRecrutement(etat, p.id, u.id);
    }
  }

  function choisirBatiment(etat, nid, p, enGuerre) {
    const K = C();
    const n = etat.nations[nid];
    const b = p.batiments;
    const liste = [];
    const pousser = (id, score) => {
      const c = K.peutConstruire(etat, p, id);
      if (c.ok) liste.push({ id, score: score - c.cout / 900 });
    };
    pousser('ferme', 6 + (b.ferme || 0 ? 0 : 4));
    pousser('marche', 7 * p.richesse);
    if (p.cotier) pousser('port', 6.5 * p.richesse * (n.doctrine === 'maritime' ? 1.6 : 1));
    pousser('caserne', enGuerre ? 8 : 5);
    pousser('ecuries', (n.bonus.cavalerie ? 7 : 4.5));
    pousser('fonderie', enGuerre ? 6.5 : 4);
    pousser('fort', p.ordre < 45 ? 9 : (frontiere(etat, p) ? 7.5 : 2));
    pousser('universite', 5.5);
    pousser('ecole', 4.5);
    pousser('manufacture', 6 * p.richesse);
    if (!liste.length) return null;
    liste.sort((x, y) => y.score - x.score);
    return liste[0].id;
  }

  function choisirUnite(etat, nid, dispo) {
    const n = etat.nations[nid];
    const poids = { infanterie: 0.62, cavalerie: 0.25, artillerie: 0.13 };
    if (n.doctrine === 'militariste') { poids.infanterie = 0.66; poids.cavalerie = 0.22; }
    if (n.bonus.cavalerie) { poids.cavalerie += 0.10; poids.infanterie -= 0.10; }
    const r = Math.random();
    let classe = 'infanterie';
    if (r > poids.infanterie) classe = 'cavalerie';
    if (r > poids.infanterie + poids.cavalerie) classe = 'artillerie';
    let pool = dispo.filter((u) => A.CATEGORIES[u.cat].classe === classe);
    if (!pool.length) pool = dispo.filter((u) => A.CATEGORIES[u.cat].classe === 'infanterie');
    if (!pool.length) pool = dispo;
    // Les meilleures unités abordables d'abord.
    pool.sort((a, b) => b.cout - a.cout);
    const budget = n.tresor - Math.max(1500, n.depenses * 2);
    return pool.find((u) => C().coutRecrutement(etat, nid, u.id) <= budget) || null;
  }

  function frontiere(etat, p) {
    return p.voisins.some((id) => etat.provinces[id].nation !== p.nation);
  }

  /* ------------------------------------------------------------- mouvements */

  function nationsEnGuerreAvec(etat, nid) {
    const K = C();
    return Object.keys(etat.nations).filter((o) => o !== nid && etat.nations[o].vivante && K.enGuerre(etat, nid, o));
  }

  function gererArmees(etat, nid) {
    const K = C();
    const mes = etat.armees.filter((a) => a.nation === nid && a.unites.length);
    if (!mes.length) return;
    const ennemis = nationsEnGuerreAvec(etat, nid);

    // Regrouper les détachements isolés qui se trouvent au même endroit.
    for (let i = 0; i < mes.length; i++) {
      for (let j = mes.length - 1; j > i; j--) {
        if (mes[i].province === mes[j].province && mes[i].unites.length + mes[j].unites.length <= 20) {
          K.fusionnerArmees(etat, mes[i].id, mes[j].id);
          mes.splice(j, 1);
        }
      }
    }

    for (const armee of mes) {
      if (armee.enSiege) {
        const p = etat.provinces[armee.province];
        // On lève le siège si une armée de secours nous surpasse nettement.
        const secours = etat.armees.filter((a) => K.enGuerre(etat, a.nation, nid)
          && etat.provinces[a.province].voisins.indexOf(p.id) >= 0);
        const menace = secours.reduce((s, a) => s + K.forceArmee(etat, a), 0);
        if (menace > K.forceArmee(etat, armee) * 1.4) {
          armee.enSiege = false;
          const refuge = replierVers(etat, armee);
          if (refuge) K.ordonnerMarche(etat, armee, refuge);
        }
        continue;
      }
      if (armee.chemin && armee.chemin.length) continue;

      const mission = choisirMission(etat, nid, armee, ennemis);
      if (mission) K.ordonnerMarche(etat, armee, mission);
    }
  }

  function replierVers(etat, armee) {
    const p = etat.provinces[armee.province];
    const amies = p.voisins.map((id) => etat.provinces[id]).filter((q) => q.nation === armee.nation);
    if (!amies.length) return null;
    amies.sort((a, b) => (b.batiments.fort || 0) - (a.batiments.fort || 0));
    return amies[0].id;
  }

  function choisirMission(etat, nid, armee, ennemis) {
    const K = C();
    const n = etat.nations[nid];
    const force = K.forceArmee(etat, armee);
    const ici = etat.provinces[armee.province];
    const petiteArmee = armee.unites.length < 5;

    // 1. Défendre une province menacée par une armée ennemie voisine.
    let meilleureDefense = null, scoreDefense = 0;
    for (const p of provincesDe(etat, nid)) {
      const menaces = etat.armees.filter((a) => K.enGuerre(etat, a.nation, nid)
        && (a.province === p.id || etat.provinces[a.province].voisins.indexOf(p.id) >= 0));
      if (!menaces.length) continue;
      const menace = menaces.reduce((s, a) => s + K.forceArmee(etat, a), 0);
      const defenseurs = K.armeesDans(etat, p.id, nid).reduce((s, a) => s + K.forceArmee(etat, a), 0);
      if (defenseurs > menace * 1.1) continue;
      const valeur = (p.pop / 1000) * p.richesse + (p.capitaleNationale ? 900 : 0) + (p.batiments.fort || 0) * 150;
      const dist = U.dist(ici.x, ici.y, p.x, p.y);
      const score = valeur * 1.5 / (1 + dist / 220);
      if (score > scoreDefense) { scoreDefense = score; meilleureDefense = p.id; }
    }
    if (meilleureDefense && (scoreDefense > 900 || petiteArmee)) return meilleureDefense;

    // 2. Attaquer : chercher la cible la plus faible à portée raisonnable.
    if (ennemis.length && !petiteArmee) {
      let cible = null, meilleur = 0;
      for (const id of etat.ordreProvinces) {
        const p = etat.provinces[id];
        if (ennemis.indexOf(p.nation) < 0) continue;
        const garde = K.armeesDans(etat, id).filter((a) => K.enGuerre(etat, a.nation, nid))
          .reduce((s, a) => s + K.forceArmee(etat, a), 0) + p.garnison * 0.35 + (p.batiments.fort || 0) * 220;
        if (garde > force * 0.9) continue;
        const dist = U.dist(ici.x, ici.y, p.x, p.y);
        if (dist > 460) continue;
        const valeur = (p.pop / 1000) * p.richesse + (p.capitaleNationale ? 700 : 0);
        const score = valeur / (1 + dist / 150) * (1 + (force - garde) / Math.max(force, 1));
        if (score > meilleur && K.trouverChemin(etat, armee.province, id, nid)) { meilleur = score; cible = id; }
      }
      if (cible) return cible;
    }

    // 3. Sinon, se poster sur la frontière la plus exposée ou rejoindre une armée amie.
    if (petiteArmee) {
      const grosses = etat.armees.filter((a) => a.nation === nid && a.unites.length >= 6 && a.id !== armee.id);
      if (grosses.length) {
        grosses.sort((a, b) => U.dist(ici.x, ici.y, etat.provinces[a.province].x, etat.provinces[a.province].y)
          - U.dist(ici.x, ici.y, etat.provinces[b.province].x, etat.provinces[b.province].y));
        if (grosses[0].province !== armee.province) return grosses[0].province;
      }
    }
    const fronts = provincesDe(etat, nid).filter((p) => p.voisins.some((v) => {
      const q = etat.provinces[v];
      return q.nation !== nid && (ennemis.indexOf(q.nation) >= 0 || K.rel(etat, nid, q.nation) && K.rel(etat, nid, q.nation).opinion < -15);
    }));
    if (fronts.length) {
      fronts.sort((a, b) => U.dist(ici.x, ici.y, a.x, a.y) - U.dist(ici.x, ici.y, b.x, b.y));
      if (fronts[0].id !== armee.province) return fronts[0].id;
    }
    return null;
  }

  /* ------------------------------------------------------------- diplomatie */

  function gererDiplomatie(etat, nid) {
    const K = C();
    const n = etat.nations[nid];
    const mesProvs = provincesDe(etat, nid).length;
    if (!mesProvs) return;
    const maForce = puissance(etat, nid);

    for (const autre of Object.keys(etat.nations)) {
      if (autre === nid || autre === 'reb' || !etat.nations[autre].vivante) continue;
      const r = K.rel(etat, nid, autre);
      if (!r) continue;

      if (r.etat === 'guerre') {
        // Faire la paix quand la guerre coûte plus qu'elle ne rapporte.
        const duree = etat.tour - r.guerreDepuis;
        const saForce = puissance(etat, autre);
        const envie = n.lassitude * 1.6 + duree * 0.7 + (saForce > maForce * 1.3 ? 25 : 0)
          + (n.tresor < 1500 ? 18 : 0) - (maForce > saForce * 1.6 ? 20 : 0);
        if (duree > 3 && envie > 32 && autre !== 'reb') {
          // L'autre accepte s'il est lui aussi fatigué.
          const nAutre = etat.nations[autre];
          const envieAutre = nAutre.lassitude * 1.6 + duree * 0.7 + (maForce > saForce * 1.3 ? 25 : 0);
          if (envieAutre > 22 || nAutre.ia === false) {
            if (nAutre.ia) K.signerPaix(etat, nid, autre);
          }
        }
        continue;
      }

      if (r.treve > 0) continue;

      // Alliance entre nations qui s'apprécient et partagent un ennemi.
      if (r.etat === 'paix' && r.opinion > 45 && ennemiCommun(etat, nid, autre) && Math.random() < 0.10) {
        r.etat = 'alliance';
        K.journal(etat, `${n.nom} et ${etat.nations[autre].nom} signent une alliance.`, 'diplomatie', [nid, autre]);
        continue;
      }

      // Déclaration de guerre opportuniste sur un voisin faible.
      if (r.etat === 'paix' && voisins(etat, nid, autre)) {
        const saForce = puissance(etat, autre);
        const agressivite = { hegemonie: 1.5, militariste: 1.5, expansionniste: 1.4, opportuniste: 1.1, maritime: 0.8, defensif: 0.6 }[n.doctrine] || 1;
        const guerresActuelles = nationsEnGuerreAvec(etat, nid).length;
        if (guerresActuelles >= 2) continue;
        const appetit = (maForce / Math.max(saForce, 1)) * agressivite - r.opinion / 45 - guerresActuelles * 0.8;
        if (appetit > 2.1 && n.tresor > 4000 && Math.random() < 0.12) {
          K.declarerGuerre(etat, nid, autre);
        }
      }
    }
  }

  function ennemiCommun(etat, a, b) {
    const K = C();
    return Object.keys(etat.nations).some((c) => c !== a && c !== b && K.enGuerre(etat, a, c) && K.enGuerre(etat, b, c));
  }

  function voisins(etat, a, b) {
    for (const id of etat.ordreProvinces) {
      const p = etat.provinces[id];
      if (p.nation !== a) continue;
      if (p.voisins.some((v) => etat.provinces[v].nation === b)) return true;
    }
    return false;
  }

  function puissance(etat, nid) {
    const K = C();
    let f = 0;
    for (const a of etat.armees) if (a.nation === nid) f += K.forceArmee(etat, a);
    for (const p of provincesDe(etat, nid)) f += (p.pop / 1000) * p.richesse * 0.7;
    f += etat.nations[nid].tresor * 0.04;
    return f;
  }

  /* -------------------------------------------------------------- rebelles */

  function gererRebelles(etat) {
    const K = C();
    for (const a of etat.armees) {
      if (a.nation !== 'reb' || (a.chemin && a.chemin.length)) continue;
      const ici = etat.provinces[a.province];
      // Les insurgés marchent sur la ville la plus proche du pouvoir qu'ils combattent.
      const cibles = ici.voisins.map((id) => etat.provinces[id])
        .filter((p) => K.enGuerre(etat, 'reb', p.nation));
      if (ici.nation !== 'reb' && K.enGuerre(etat, 'reb', ici.nation)) continue;
      if (cibles.length) {
        cibles.sort((x, y) => (y.pop * y.richesse) - (x.pop * x.richesse));
        K.ordonnerMarche(etat, a, cibles[0].id);
      }
    }
  }

  G.ia = { jouerTour, puissance, provincesDe, nationsEnGuerreAvec };
})(window.Grande = window.Grande || {});
