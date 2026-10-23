/* Assemblage : écrans, panneaux, passage de la campagne à la bataille et retour. */
(function (G) {
  'use strict';

  const U = G.util;
  const W = G.world;
  const A = G.army;
  const K = G.campagne;
  const BT = G.bataille;

  const jeu = {
    ecran: 'menu',
    etat: null, vueCarte: null,
    bataille: null, vueBataille: null, iaBataille: null,
    contexteBataille: null,
    nationChoisie: null,
    dernierTemps: 0,
    enTraitement: false,
  };

  const $ = (id) => document.getElementById(id);

  /* ------------------------------------------------------------- écrans */

  function montrer(nom) {
    for (const id of ['menu', 'campagne', 'bataille']) {
      $(id).classList.toggle('actif', id === nom);
    }
    jeu.ecran = nom;
    if (nom === 'campagne' && jeu.vueCarte) G.vueCampagne.ajusterTaille(jeu.vueCarte);
    if (nom === 'bataille' && jeu.vueBataille) G.vueBataille.ajusterTaille(jeu.vueBataille);
  }

  /* --------------------------------------------------------------- menu */

  function construireMenu() {
    const grille = $('choixNations');
    grille.innerHTML = '';
    for (const f of W.FACTIONS) {
      if (!f.playable) continue;
      const b = document.createElement('button');
      b.className = 'carte-nation';
      b.innerHTML = `<span class="drapeau" style="background:${f.couleur}"></span><span class="nom">${f.nom}</span>`;
      b.addEventListener('click', () => choisirNation(f.id));
      b.dataset.nation = f.id;
      grille.appendChild(b);
    }
    $('btnCommencer').addEventListener('click', () => {
      if (jeu.nationChoisie) demarrerCampagne(jeu.nationChoisie);
    });
    $('btnCharger').addEventListener('click', charger);
    $('btnEscarmouche').addEventListener('click', escarmouche);
    $('btnCharger').disabled = !localStorage.getItem('grandeligne.sauvegarde');
    choisirNation('fra');
  }

  function choisirNation(id) {
    jeu.nationChoisie = id;
    for (const el of document.querySelectorAll('.carte-nation')) {
      el.classList.toggle('choisie', el.dataset.nation === id);
    }
    const f = W.FACTIONS.find((x) => x.id === id);
    $('ficheNom').textContent = f.nom;
    $('ficheTexte').textContent = f.description || '';
    const ul = $('ficheBonus');
    ul.innerHTML = '';
    const etiquettes = {
      infanterie: "Infanterie", cavalerie: "Cavalerie", artillerie: "Artillerie",
      commerce: "Commerce", revenu: "Revenus", recrutement: "Coût de recrutement",
      entretien: "Entretien des troupes", moral: "Moral", ordre: "Ordre public",
      diplomatie: "Diplomatie", defense: "Défense",
    };
    for (const clef of Object.keys(f.bonus || {})) {
      const val = f.bonus[clef];
      const li = document.createElement('li');
      const pourcent = Math.abs(val) < 1 ? Math.round(val * 100) + ' %' : (val > 0 ? '+' + val : val);
      const signe = val > 0 ? '+' : '';
      // Un coût ou un entretien en baisse est un avantage : on colore selon l'effet réel.
      const inverse = clef === 'recrutement' || clef === 'entretien';
      const bon = inverse ? val < 0 : val > 0;
      li.className = bon ? 'plus' : 'moins';
      li.textContent = `${etiquettes[clef] || clef} ${signe}${pourcent}`;
      ul.appendChild(li);
    }
    $('btnCommencer').disabled = false;
  }

  /* ---------------------------------------------------------- campagne */

  function demarrerCampagne(nationId, etatCharge) {
    jeu.etat = etatCharge || K.creerEtat(Math.floor(Math.random() * 1e9), nationId);
    jeu.vueCarte = G.vueCampagne.creerVue($('carte'), jeu.etat);
    jeu.vueCarte.onSelection = () => majPanneau();
    jeu.vueCarte.onMessage = (m) => alerte(m);
    const cap = jeu.etat.ordreProvinces.find((id) => {
      const p = jeu.etat.provinces[id];
      return p.nation === jeu.etat.joueur && p.capitaleNationale;
    });
    if (cap) G.vueCampagne.centrerSur(jeu.vueCarte, cap, 1.0);
    montrer('campagne');
    majHud();
    majPanneau();
  }

  function alerte(texte) {
    const el = $('alerte');
    el.textContent = texte;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.textContent = ''; }, 4200);
  }

  function majHud() {
    const e = jeu.etat;
    if (!e) return;
    const n = e.nations[e.joueur];
    K.majFinances(e, e.joueur);
    const f = K.factionById[e.joueur];
    $('hudDrapeau').style.background = f.couleur;
    $('hudNation').textContent = f.nom;
    $('hudDate').textContent = `${K.SAISONS[e.saison]} ${e.annee} — tour ${e.tour}`;
    $('hudTresor').textContent = U.formatNumber(n.tresor);
    const solde = $('hudSolde');
    solde.textContent = U.formatSigned(n.solde);
    solde.className = 'valeur ' + (n.solde >= 0 ? 'positif' : 'negatif');
    $('hudProvinces').textContent = e.ordreProvinces.filter((id) => e.provinces[id].nation === e.joueur).length;
    $('hudRegiments').textContent = e.armees.reduce((s, a) => s + (a.nation === e.joueur ? a.unites.length : 0), 0);
  }

  /* --------------------------------------------------------- panneaux */

  function majPanneau() {
    const v = jeu.vueCarte, e = jeu.etat;
    const c = $('panneauContenu');
    if (!v || (!v.selection && !v.armeeSelection)) {
      c.innerHTML = '<p class="vide">Cliquez sur une province ou une armée.</p>';
      return;
    }
    if (v.armeeSelection && e.armees.indexOf(v.armeeSelection) >= 0) {
      c.innerHTML = htmlArmee(v.armeeSelection) + htmlProvince(e.provinces[v.selection]);
    } else {
      c.innerHTML = htmlProvince(e.provinces[v.selection]);
    }
    brancherPanneau();
  }

  function htmlArmee(a) {
    const e = jeu.etat;
    const nation = K.factionById[a.nation];
    const hommes = K.effectif(a);
    const parCat = {};
    for (const u of a.unites) {
      const d = K.unitById[u.type];
      const cl = A.CATEGORIES[d.cat].classe;
      parCat[cl] = (parCat[cl] || 0) + 1;
    }
    let html = `<h3>Armée ${nation.de}</h3>
      <p class="sous">${a.unites.length} régiments · ${U.formatNumber(hommes)} hommes`
      + (a.enSiege ? ' · <b>au siège</b>' : '') + '</p>';
    html += `<div class="ligne-info"><span>Infanterie</span><span>${parCat.infanterie || 0}</span></div>`;
    html += `<div class="ligne-info"><span>Cavalerie</span><span>${parCat.cavalerie || 0}</span></div>`;
    html += `<div class="ligne-info"><span>Artillerie</span><span>${parCat.artillerie || 0}</span></div>`;
    if (a.destination) {
      html += `<div class="ligne-info"><span>En marche vers</span><span>${e.provinces[a.destination].nom}</span></div>`;
    }
    html += '<h4>Régiments</h4><div class="liste-items">';
    for (const u of a.unites) {
      const d = K.unitById[u.type];
      const part = u.hommes / d.hommes;
      html += `<div class="item"><span><span class="titre">${d.nom}</span>
        <span class="detail">${U.formatNumber(u.hommes)} h.${u.exp >= 1 ? ' · expérience ' + Math.floor(u.exp) : ''}</span></span>
        <span class="droite">${Math.round(part * 100)} %</span></div>`;
    }
    html += '</div>';
    if (a.nation === e.joueur) {
      html += `<div class="liste-items" style="margin-top:10px">
        <div class="item cliquable" data-action="dissoudre">Dissoudre un régiment épuisé<span class="droite">rembourse peu</span></div>`;
      const prov = e.provinces[a.province];
      if (prov.nation !== e.joueur && K.enGuerre(e, prov.nation, e.joueur) && (prov.batiments.fort || 0) > 0) {
        html += `<div class="item cliquable" data-action="assaut">Donner l'assaut<span class="droite">bataille</span></div>`;
      }
      html += '</div>';
    }
    return html;
  }

  function htmlProvince(p) {
    if (!p) return '';
    const e = jeu.etat;
    const nation = K.factionById[p.nation];
    const aMoi = p.nation === e.joueur;
    const rev = K.revenuProvince(e, p);
    const terrainNom = { plaine: 'Plaine', collines: 'Collines', montagne: 'Montagne', foret: 'Forêt', marais: 'Marais', desert: 'Désert' }[p.terrain];

    let html = `<h3>${p.nom}</h3>
      <p class="sous"><span class="drapeau" style="background:${nation.couleur};width:14px;height:10px;display:inline-block;margin-right:5px"></span>
      ${nation.nom} · ${terrainNom}${p.cotier ? ' · côtière' : ''}</p>`;

    if (p.siege) {
      html += `<p class="sous" style="color:#e0b070">Assiégée par ${K.factionById[p.siege.nation].nom} — ${p.siege.tours}/${p.siege.duree} saisons</p>`;
    }
    html += `<div class="ligne-info"><span>Population</span><span>${U.formatNumber(p.pop)}</span></div>`;
    html += `<div class="ligne-info"><span>Richesse</span><span>${p.richesse.toFixed(2)}</span></div>`;
    html += `<div class="ligne-info"><span>Religion</span><span>${p.religion}</span></div>`;
    if (aMoi) {
      html += `<div class="ligne-info"><span>Revenu par saison</span><span>${U.formatNumber(rev.brut)}</span></div>`;
      html += `<h4>Ordre public</h4><div class="jauge ${p.ordre < 35 ? 'rouge' : ''}"><div style="width:${p.ordre}%"></div></div>`;
      if (p.ordre < 30) html += '<p class="sous" style="color:#d98c7e">La province est au bord de la révolte.</p>';
      if (p.occupation > 0) html += `<p class="sous">Conquête récente : ${p.occupation} saisons avant apaisement.</p>`;
    }

    html += '<h4>Bâtiments</h4><div class="liste-items">';
    for (const id of Object.keys(A.BUILDINGS)) {
      const def = A.BUILDINGS[id];
      const niveau = p.batiments[id] || 0;
      if (!aMoi) {
        if (niveau > 0) html += `<div class="item"><span>${def.nom}</span><span class="droite">niv. ${niveau}</span></div>`;
        continue;
      }
      const c = K.peutConstruire(e, p, id);
      const enCours = p.chantier && p.chantier.batiment === id;
      let droite, classe = 'item';
      if (enCours) {
        droite = `chantier ${p.chantier.total - p.chantier.tours + 1}/${p.chantier.total}`;
      } else if (c.ok) {
        droite = `${U.formatNumber(c.cout)} écus · ${c.tours} saisons`;
        classe += ' cliquable';
      } else {
        droite = c.raison;
        classe += ' indispo';
      }
      html += `<div class="${classe}" data-batiment="${id}">
        <span><span class="titre">${def.nom}${niveau ? ' · niveau ' + niveau : ''}</span>
        <span class="detail">${def.desc}</span></span>
        <span class="droite">${droite}</span></div>`;
    }
    html += '</div>';

    if (aMoi && !p.siege) {
      const dispo = K.unitesDisponibles(e, e.joueur, p);
      html += '<h4>Recrutement</h4>';
      if (p.recrutement.length) {
        html += '<div class="liste-items">';
        for (const r of p.recrutement) {
          html += `<div class="item"><span>${K.unitById[r.unite].nom}</span><span class="droite">${r.tours} saison(s)</span></div>`;
        }
        html += '</div>';
      }
      if (!dispo.length) {
        html += '<p class="sous">Aucun bâtiment militaire : construisez une caserne.</p>';
      } else {
        html += '<div class="liste-items">';
        for (const u of dispo) {
          const cout = K.coutRecrutement(e, e.joueur, u.id);
          const abordable = e.nations[e.joueur].tresor >= cout && p.recrutement.length < 4;
          html += `<div class="item ${abordable ? 'cliquable' : 'indispo'}" data-unite="${u.id}">
            <span><span class="titre">${u.nom}</span>
            <span class="detail">${u.hommes} h. · entretien ${u.entretien}</span></span>
            <span class="droite">${U.formatNumber(cout)} écus</span></div>`;
        }
        html += '</div>';
      }
    }

    const armees = K.armeesDans(e, p.id);
    if (armees.length) {
      html += '<h4>Forces présentes</h4><div class="liste-items">';
      for (const a of armees) {
        html += `<div class="item"><span>${K.factionById[a.nation].nom}</span>
          <span class="droite">${a.unites.length} rég. · ${U.formatNumber(K.effectif(a))} h.</span></div>`;
      }
      html += '</div>';
    }
    return html;
  }

  function brancherPanneau() {
    const e = jeu.etat, v = jeu.vueCarte;
    for (const el of document.querySelectorAll('#panneauContenu [data-batiment].cliquable')) {
      el.addEventListener('click', () => {
        const r = K.lancerConstruction(e, v.selection, el.dataset.batiment);
        if (!r.ok) alerte(r.raison);
        majHud(); majPanneau();
      });
    }
    for (const el of document.querySelectorAll('#panneauContenu [data-unite].cliquable')) {
      el.addEventListener('click', () => {
        const r = K.lancerRecrutement(e, v.selection, el.dataset.unite);
        if (!r.ok) alerte(r.raison);
        majHud(); majPanneau();
      });
    }
    for (const el of document.querySelectorAll('#panneauContenu [data-action]')) {
      el.addEventListener('click', () => {
        if (el.dataset.action === 'dissoudre') dissoudre();
        if (el.dataset.action === 'assaut') lancerAssaut();
      });
    }
  }

  function dissoudre() {
    const a = jeu.vueCarte.armeeSelection;
    if (!a || !a.unites.length) return;
    let pire = null;
    for (const u of a.unites) {
      const d = K.unitById[u.type];
      if (d.general) continue;
      if (!pire || u.hommes / d.hommes < pire.hommes / K.unitById[pire.type].hommes) pire = u;
    }
    if (!pire) return;
    a.unites.splice(a.unites.indexOf(pire), 1);
    jeu.etat.nations[jeu.etat.joueur].tresor += Math.round(K.unitById[pire.type].cout * 0.15);
    majHud(); majPanneau();
  }

  function lancerAssaut() {
    const a = jeu.vueCarte.armeeSelection;
    const prov = jeu.etat.provinces[a.province];
    if (!prov.siege) return;
    // L'assaut se joue comme une bataille contre la garnison.
    const garnison = construireGarnison(jeu.etat, prov);
    ouvrirPreBataille({
      province: prov.id, attaquant: a.id, defenseur: null, renforts: [],
      terrain: prov.terrain, saison: jeu.etat.saison, assaut: true, garnison,
    });
  }

  function construireGarnison(etat, prov) {
    const dispo = K.unitesDisponibles(etat, prov.nation, prov);
    const n = 2 + (prov.batiments.fort || 0) * 2;
    const unites = [];
    for (let i = 0; i < n; i++) {
      const d = dispo.length ? dispo[Math.min(dispo.length - 1, i % dispo.length)] : K.unitById.milice;
      unites.push({ type: d.id, hommes: d.hommes });
    }
    return unites;
  }

  /* ------------------------------------------------------- fin de tour */

  function finDeTour() {
    if (jeu.enTraitement) return;
    jeu.enTraitement = true;
    $('btnFinTour').disabled = true;
    poursuivreTour();
  }

  function poursuivreTour() {
    const e = jeu.etat;
    const r = K.continuer(e);
    if (r.type === 'bataille_joueur') {
      jeu.enTraitement = false;
      ouvrirPreBataille(r.contexte);
      return;
    }
    jeu.enTraitement = false;
    $('btnFinTour').disabled = false;
    jeu.vueCarte.fondSale = true;
    majHud(); majPanneau();
    const nouveaux = e.journal.filter((j) => j.tour === e.tour - 1 && !j.lu);
    if (nouveaux.length) alerte(nouveaux[0].texte);
    if (e.fin) finDePartie(e.fin);
  }

  function finDePartie(fin) {
    $('resultatTitre').textContent = fin.victoire ? 'Victoire' : 'Fin de partie';
    $('resultatContenu').innerHTML = `<p>${fin.raison}</p>`;
    $('resultat').classList.add('ouverte');
    $('resultatOk').onclick = () => {
      $('resultat').classList.remove('ouverte');
      montrer('menu');
    };
  }

  /* --------------------------------------------------- avant la bataille */

  function ouvrirPreBataille(ctx) {
    const e = jeu.etat;
    jeu.contexteBataille = ctx;
    const att = e.armees.find((a) => a.id === ctx.attaquant);
    const def = ctx.defenseur ? e.armees.find((a) => a.id === ctx.defenseur) : null;
    const prov = e.provinces[ctx.province];
    const jeSuisAttaquant = att && att.nation === e.joueur;

    const mesUnites = jeSuisAttaquant ? listeUnites(att) : listeUnites(def).concat(
      (ctx.renforts || []).flatMap((id) => listeUnites(e.armees.find((a) => a.id === id))));
    const leurs = jeSuisAttaquant
      ? (ctx.garnison ? ctx.garnison.map((u) => ({ nom: K.unitById[u.type].nom, hommes: u.hommes })) : listeUnites(def).concat(
          (ctx.renforts || []).flatMap((id) => listeUnites(e.armees.find((a) => a.id === id)))))
      : listeUnites(att);

    const nomEnnemi = jeSuisAttaquant ? (def ? K.factionById[def.nation].nom : K.factionById[prov.nation].nom) : K.factionById[att.nation].nom;

    $('modaleTitre').textContent = `Bataille de ${prov.nom}`;
    $('modaleContenu').innerHTML = `
      <div class="colonnes">
        <div><h4>${K.factionById[e.joueur].nom} — ${jeSuisAttaquant ? 'attaque' : 'défense'}</h4>
          ${mesUnites.map((u) => `<div class="ligne-info"><span>${u.nom}</span><span>${u.hommes}</span></div>`).join('')}
          <div class="ligne-info"><b>Total</b><b>${U.formatNumber(mesUnites.reduce((s, u) => s + u.hommes, 0))}</b></div></div>
        <div><h4>${nomEnnemi}</h4>
          ${leurs.map((u) => `<div class="ligne-info"><span>${u.nom}</span><span>${u.hommes}</span></div>`).join('')}
          <div class="ligne-info"><b>Total</b><b>${U.formatNumber(leurs.reduce((s, u) => s + u.hommes, 0))}</b></div></div>
      </div>
      <p class="sous" style="margin-top:14px">Terrain : ${prov.terrain} · ${K.SAISONS[e.saison]}${ctx.assaut ? ' · assaut de place forte' : ''}</p>
      <div class="modale-actions" style="padding-top:14px">
        <button class="bouton" id="btnAuto">Laisser faire les généraux</button>
        <button class="bouton principal" id="btnCombattre">Livrer bataille</button>
      </div>`;
    $('modale').classList.add('ouverte');
    $('modaleFermer').style.display = 'none';
    $('btnAuto').onclick = () => {
      $('modale').classList.remove('ouverte');
      $('modaleFermer').style.display = '';
      const res = K.autoResolution(e, ctx);
      K.appliquerResultatBataille(e, ctx, res);
      jeu.vueCarte.fondSale = true;
      poursuivreTour();
    };
    $('btnCombattre').onclick = () => {
      $('modale').classList.remove('ouverte');
      $('modaleFermer').style.display = '';
      demarrerBataille(ctx);
    };
  }

  function listeUnites(armee) {
    if (!armee) return [];
    return armee.unites.map((u) => ({ nom: K.unitById[u.type].nom, hommes: u.hommes, ref: u }));
  }

  /* ------------------------------------------------------------ bataille */

  function bonusDeNation(etat, nationId) {
    const n = etat.nations[nationId];
    const tech = {};
    for (const clef of ['moral', 'discipline', 'cadence', 'charge', 'infanterie_melee',
      'artillerie_portee', 'artillerie_cadence', 'mouvement']) {
      tech[clef] = K.bonusTech(n, clef);
    }
    return { bonus: n.bonus || {}, tech };
  }

  function demarrerBataille(ctx) {
    const e = jeu.etat;
    const att = e.armees.find((a) => a.id === ctx.attaquant);
    const def = ctx.defenseur ? e.armees.find((a) => a.id === ctx.defenseur) : null;
    const prov = e.provinces[ctx.province];
    const jeSuisAttaquant = att && att.nation === e.joueur;

    // Camp 0 : le joueur, toujours en bas de l'écran.
    const mesArmees = jeSuisAttaquant ? [att] : [def].concat((ctx.renforts || []).map((id) => e.armees.find((a) => a.id === id)));
    const leursArmees = jeSuisAttaquant
      ? (def ? [def].concat((ctx.renforts || []).map((id) => e.armees.find((a) => a.id === id))) : [])
      : [att];

    const nationMoi = e.joueur;
    const nationEux = jeSuisAttaquant ? (def ? def.nation : prov.nation) : att.nation;
    const bMoi = bonusDeNation(e, nationMoi), bEux = bonusDeNation(e, nationEux);

    const specs = (armees, bn, nation) => {
      const out = [];
      for (const a of armees) {
        if (!a) continue;
        a.unites.forEach((u, i) => {
          out.push({ type: u.type, hommes: u.hommes, exp: u.exp,
            bonusNation: bn.bonus, techBonus: bn.tech, idCampagne: a.id + ':' + i });
        });
      }
      return out;
    };

    let listeMoi = specs(mesArmees, bMoi, nationMoi);
    let listeEux = specs(leursArmees, bEux, nationEux);
    if (ctx.garnison) {
      listeEux = ctx.garnison.map((u, i) => ({ type: u.type, hommes: u.hommes, exp: 1,
        bonusNation: bEux.bonus, techBonus: bEux.tech, idCampagne: 'garnison:' + i }));
    }
    if (!listeEux.length) { poursuivreTour(); return; }

    const b = BT.creerBataille({
      seed: (e.seed + e.tour * 131 + ctx.province.length * 17) | 0,
      terrain: prov.terrain, saison: e.saison,
      armees: [listeMoi, listeEux],
      camps: [
        { nation: nationMoi, nom: K.factionById[nationMoi].nom, joueur: true },
        { nation: nationEux, nom: K.factionById[nationEux].nom, joueur: false },
      ],
    });
    b.assaut = !!ctx.assaut;
    jeu.bataille = b;
    jeu.iaBataille = G.iaBataille.creerControleur(1);
    jeu.vueBataille = G.vueBataille.creerVue($('champ'), b, 0);
    jeu.vueBataille.onSelection = majCartesUnites;

    $('campGauche').innerHTML = `${K.factionById[nationMoi].nom}<span class="petit-texte">vos forces</span>`;
    $('campDroite').innerHTML = `${K.factionById[nationEux].nom}<span class="petit-texte">${jeSuisAttaquant ? 'défenseur' : 'attaquant'}</span>`;
    $('barreDeploiement').style.display = 'flex';
    montrer('bataille');
    majCartesUnites();
    if (!localStorage.getItem('grandeligne.aideVue')) {
      localStorage.setItem('grandeligne.aideVue', '1');
      ouvrirAide();
    }
  }

  function escarmouche() {
    // Bataille libre, hors campagne : deux corps équilibrés tirés au sort.
    const etat = K.creerEtat(Math.floor(Math.random() * 1e9), 'fra');
    jeu.etat = etat;
    const typesOcc = ['ligne', 'ligne', 'ligne', 'grenadiers', 'fusiliers', 'cavalerie', 'cuirassiers', 'canon6', 'canon12', 'general'];
    const spec = (nation) => typesOcc.map((t, i) => ({ type: t, hommes: K.unitById[t].hommes, exp: 1,
      bonusNation: etat.nations[nation].bonus, techBonus: {}, idCampagne: null }));
    const b = BT.creerBataille({
      seed: Math.floor(Math.random() * 1e9),
      terrain: ['plaine', 'collines', 'foret'][Math.floor(Math.random() * 3)],
      saison: Math.floor(Math.random() * 4),
      armees: [spec('fra'), spec('aut')],
      camps: [{ nation: 'fra', nom: 'France', joueur: true }, { nation: 'aut', nom: 'Autriche', joueur: false }],
    });
    jeu.bataille = b;
    jeu.contexteBataille = null;
    jeu.iaBataille = G.iaBataille.creerControleur(1);
    jeu.vueBataille = G.vueBataille.creerVue($('champ'), b, 0);
    jeu.vueBataille.onSelection = majCartesUnites;
    $('campGauche').innerHTML = 'France<span class="petit-texte">vos forces</span>';
    $('campDroite').innerHTML = 'Autriche<span class="petit-texte">adversaire</span>';
    $('barreDeploiement').style.display = 'flex';
    montrer('bataille');
    majCartesUnites();
  }

  function engager() {
    const b = jeu.bataille;
    if (!b || b.phase !== 'deploiement') return;
    b.phase = 'combat';
    b.pause = false;
    b.vitesse = 1;
    $('barreDeploiement').style.display = 'none';
    majBoutonsVitesse(1);
  }

  function majCartesUnites() {
    const b = jeu.bataille, v = jeu.vueBataille;
    if (!b) return;
    const c = $('cartesUnites');
    c.innerHTML = '';
    for (const u of b.unites) {
      if (u.camp !== 0) continue;
      const n = BT.vivants(u);
      const div = document.createElement('div');
      div.className = 'carte-unite' + (v.selection.indexOf(u) >= 0 ? ' choisie' : '') + (u.etat === 'fuite' ? ' deroute' : '');
      const moral = U.clamp(u.moral / u.moralMax, 0, 1);
      div.innerHTML = `<span class="nom-unite">${u.nom}</span>
        <span class="chiffres">${n}/${u.hommesMax}${u.def.portee > 0 ? ' · ' + u.munitions + ' c.' : ''}</span>
        <div class="mini-jauge"><div style="width:${moral * 100}%;background:${moral > 0.55 ? '#68b064' : moral > 0.3 ? '#d0a840' : '#c05038'}"></div></div>`;
      div.addEventListener('click', (ev) => {
        if (ev.shiftKey) {
          const i = v.selection.indexOf(u);
          if (i >= 0) v.selection.splice(i, 1); else v.selection.push(u);
        } else v.selection = [u];
        majCartesUnites();
      });
      c.appendChild(div);
    }
  }

  function majBoutonsVitesse(vit) {
    for (const el of document.querySelectorAll('.controles-temps .bouton')) {
      el.classList.toggle('actif', Number(el.dataset.vitesse) === vit);
    }
  }

  function terminerBataille() {
    const b = jeu.bataille, e = jeu.etat, ctx = jeu.contexteBataille;
    const res = b.resultat;
    const gagne = res.vainqueur === 0;

    $('resultatTitre').textContent = gagne ? 'Victoire' : 'Défaite';
    const p0 = res.pertes[0], p1 = res.pertes[1];
    $('resultatContenu').innerHTML = `
      <p>${gagne ? 'Le champ de bataille vous reste.' : "Vos lignes ont cédé."}</p>
      <div class="ligne-info"><span>Durée</span><span>${Math.floor(res.duree / 60)} min ${Math.round(res.duree % 60)} s</span></div>
      <div class="ligne-info"><span>Vos pertes</span><span>${U.formatNumber(p0.morts)} sur ${U.formatNumber(p0.total)}</span></div>
      <div class="ligne-info"><span>Pertes ennemies</span><span>${U.formatNumber(p1.morts)} sur ${U.formatNumber(p1.total)}</span></div>`;
    $('resultat').classList.add('ouverte');
    $('resultatOk').onclick = () => {
      $('resultat').classList.remove('ouverte');
      if (!ctx) { montrer('menu'); return; }
      appliquerBatailleACampagne(res, ctx, gagne);
      montrer('campagne');
      jeu.vueCarte.fondSale = true;
      majHud(); majPanneau();
      poursuivreTour();
    };
  }

  /** Reporte les effectifs survivants sur les armées de campagne. */
  function appliquerBatailleACampagne(res, ctx, gagne) {
    const e = jeu.etat;
    const restants = {};
    for (const u of res.unites) {
      if (!u.id) continue;
      // Les hommes d'une unité sortie du champ se rallient en partie derrière.
      restants[u.id] = u.sorti ? Math.round(u.restants * 0.6) : u.restants;
    }
    for (const a of e.armees) {
      let touchee = false;
      a.unites.forEach((u, i) => {
        const clef = a.id + ':' + i;
        if (restants[clef] !== undefined) {
          u.hommes = restants[clef];
          u.exp = Math.min(9, u.exp + (gagne ? 0.6 : 0.3));
          touchee = true;
        }
      });
      if (touchee) a.unites = a.unites.filter((u) => u.hommes >= 8);
    }
    e.armees = e.armees.filter((a) => a.unites.length > 0);

    const att = e.armees.find((a) => a.id === ctx.attaquant);
    const jeSuisAttaquant = att && att.nation === e.joueur;
    const attaquantVainqueur = jeSuisAttaquant ? gagne : !gagne;
    const prov = e.provinces[ctx.province];

    K.journal(e, `Bataille de ${prov.nom} : ${gagne ? 'victoire' : 'défaite'}. `
      + `${U.formatNumber(res.pertes[0].morts)} pertes contre ${U.formatNumber(res.pertes[1].morts)}.`,
      'bataille', [e.joueur]);

    if (ctx.assaut) {
      if (attaquantVainqueur && att) K.capturerProvince(e, prov, att.nation);
      else if (att) { for (const u of att.unites) u.hommes = Math.round(u.hommes * 0.95); }
      e.bataille = null;
      return;
    }

    const def = ctx.defenseur ? e.armees.find((a) => a.id === ctx.defenseur) : null;
    if (attaquantVainqueur) {
      if (def) replierArmee(e, def);
      for (const id of (ctx.renforts || [])) {
        const r = e.armees.find((a) => a.id === id); if (r) replierArmee(e, r);
      }
      if (att) {
        att.province = prov.id;
        att.chemin = null; att.destination = null;
        if (K.enGuerre(e, prov.nation, att.nation)) {
          if ((prov.batiments.fort || 0) > 0) {
            prov.siege = { nation: att.nation, tours: 0, duree: 2 + (prov.batiments.fort || 1) * 2 };
            att.enSiege = true;
            K.journal(e, `Vos troupes mettent le siège devant ${prov.nom} (${prov.siege.duree} saisons).`, 'siege', [att.nation]);
          } else {
            K.capturerProvince(e, prov, att.nation);
          }
        }
      }
    } else if (att) {
      replierArmee(e, att);
    }
    e.bataille = null;
  }

  function replierArmee(e, armee) {
    armee.chemin = null; armee.destination = null; armee.enSiege = false; armee.pm = 0;
    const prov = e.provinces[armee.province];
    const refuges = prov.voisins.map((id) => e.provinces[id])
      .filter((p) => p.nation === armee.nation || K.allies(e, p.nation, armee.nation));
    if (refuges.length) {
      refuges.sort((a, b) => (b.batiments.fort || 0) - (a.batiments.fort || 0));
      armee.province = refuges[0].id;
    }
  }

  /* --------------------------------------------------------- modales */

  function ouvrirModale(titre, html) {
    $('modaleTitre').textContent = titre;
    $('modaleContenu').innerHTML = html;
    $('modale').classList.add('ouverte');
  }

  function ouvrirRecherche() {
    const e = jeu.etat, n = e.nations[e.joueur];
    const branches = { militaire: 'Art militaire', civile: 'Administration', industrielle: 'Industrie' };
    let html = `<p class="sous">Points accumulés : <b>${Math.round(n.points)}</b>`
      + (n.recherche ? ` · en cours : <b>${A.TECHS.find((t) => t.id === n.recherche).nom}</b>` : ' · aucun programme en cours') + '</p>';
    html += '<div class="colonnes">';
    for (const br of Object.keys(branches)) {
      html += `<div><h4>${branches[br]}</h4>`;
      for (const t of A.TECHS.filter((x) => x.branche === br)) {
        const acquise = n.techs.indexOf(t.id) >= 0;
        const prete = t.requis.every((r) => n.techs.indexOf(r) >= 0);
        const encours = n.recherche === t.id;
        const cls = acquise ? 'acquise' : encours ? 'encours' : prete ? 'dispo' : 'bloquee';
        html += `<div class="tech ${cls}" data-tech="${t.id}">
          <span class="cout">${acquise ? 'acquise' : t.cout + ' pts'}</span>
          <b>${t.nom}</b><div class="desc">${t.desc}</div>
          ${!prete && !acquise ? `<div class="desc" style="color:#c08a6a">Requiert : ${t.requis.map((r) => A.TECHS.find((x) => x.id === r).nom).join(', ')}</div>` : ''}
        </div>`;
      }
      html += '</div>';
    }
    html += '</div>';
    ouvrirModale('Recherche', html);
    for (const el of document.querySelectorAll('.tech.dispo')) {
      el.addEventListener('click', () => {
        n.recherche = el.dataset.tech;
        ouvrirRecherche();
      });
    }
  }

  function ouvrirDiplomatie() {
    const e = jeu.etat;
    let html = '<table class="diplo"><tr><th>Nation</th><th>Relation</th><th>Opinion</th><th>Provinces</th><th></th></tr>';
    const nations = Object.keys(e.nations)
      .filter((id) => id !== e.joueur && id !== 'reb' && e.nations[id].vivante)
      .sort((a, b) => G.ia.provincesDe(e, b).length - G.ia.provincesDe(e, a).length);
    for (const id of nations) {
      const r = K.rel(e, e.joueur, id);
      const provs = G.ia.provincesDe(e, id).length;
      const etatRel = r.etat === 'guerre' ? 'guerre' : r.etat === 'alliance' ? 'alliance' : 'paix';
      let actions = '';
      if (r.etat === 'guerre') actions = `<button class="bouton petit" data-paix="${id}">Proposer la paix</button>`;
      else if (r.etat === 'paix' && r.treve === 0) {
        actions = `<button class="bouton petit" data-alliance="${id}">Alliance</button>
                   <button class="bouton petit danger" data-guerre="${id}">Déclarer la guerre</button>`;
      } else if (r.treve > 0) actions = `<span class="sous">trêve (${r.treve})</span>`;
      html += `<tr><td><span class="drapeau" style="background:${e.nations[id].couleur};width:13px;height:9px;display:inline-block;margin-right:6px"></span>${e.nations[id].nom}</td>
        <td><span class="etiquette ${etatRel}">${etatRel}</span></td>
        <td>${Math.round(r.opinion)}</td><td>${provs}</td><td>${actions}</td></tr>`;
    }
    html += '</table>';
    ouvrirModale('Diplomatie', html);

    for (const el of document.querySelectorAll('[data-guerre]')) {
      el.addEventListener('click', () => { K.declarerGuerre(e, e.joueur, el.dataset.guerre); jeu.vueCarte.fondSale = true; ouvrirDiplomatie(); });
    }
    for (const el of document.querySelectorAll('[data-paix]')) {
      el.addEventListener('click', () => {
        const cible = el.dataset.paix;
        const nAutre = e.nations[cible];
        const moi = G.ia.puissance(e, e.joueur), lui = G.ia.puissance(e, cible);
        // L'adversaire accepte s'il est fatigué ou s'il est nettement le plus faible.
        if (nAutre.lassitude > 6 || lui < moi * 0.75) { K.signerPaix(e, e.joueur, cible); alerte('La paix est signée.'); }
        else alerte(`${nAutre.nom} refuse de traiter.`);
        ouvrirDiplomatie();
      });
    }
    for (const el of document.querySelectorAll('[data-alliance]')) {
      el.addEventListener('click', () => {
        const cible = el.dataset.alliance;
        const r = K.rel(e, e.joueur, cible);
        const seuil = 35 - K.bonusTech(e.nations[e.joueur], 'diplomatie');
        if (r.opinion >= seuil) { r.etat = 'alliance'; alerte('Alliance conclue.'); }
        else alerte(`${e.nations[cible].nom} décline : opinion trop basse (${Math.round(r.opinion)} / ${Math.round(seuil)}).`);
        ouvrirDiplomatie();
      });
    }
  }

  function ouvrirJournal() {
    const e = jeu.etat;
    let html = '';
    for (const j of e.journal.slice(0, 80)) {
      html += `<div class="journal-entree ${j.type}">
        <span class="quand">${K.SAISONS[j.saison]} ${j.annee}</span><br>${j.texte}</div>`;
    }
    ouvrirModale('Journal de la cour', html || '<p class="sous">Rien à signaler.</p>');
  }

  function ouvrirImpots() {
    const e = jeu.etat;
    const taux = e.tauxImpot[e.joueur];
    ouvrirModale('Pression fiscale', `
      <p class="sous">Un impôt lourd remplit le trésor et vide la patience des provinces.</p>
      <input type="range" min="60" max="140" step="5" value="${Math.round(taux * 100)}" id="curseurImpot" class="curseur-impot">
      <div class="ligne-info"><span>Taux</span><span id="valTaux">${Math.round(taux * 100)} %</span></div>
      <div class="ligne-info"><span>Revenu estimé par saison</span><span id="valRevenu">—</span></div>
      <div class="ligne-info"><span>Effet sur l'ordre public</span><span id="valOrdre">—</span></div>`);
    const curseur = $('curseurImpot');
    const rafraichir = () => {
      const t = Number(curseur.value) / 100;
      e.tauxImpot[e.joueur] = t;
      K.majFinances(e, e.joueur);
      $('valTaux').textContent = Math.round(t * 100) + ' %';
      $('valRevenu').textContent = U.formatSigned(e.nations[e.joueur].solde) + ' écus';
      const delta = Math.round((1 - t) * 34);
      $('valOrdre').textContent = (delta >= 0 ? '+' : '') + delta;
      majHud();
    };
    curseur.addEventListener('input', rafraichir);
    rafraichir();
  }

  /* ------------------------------------------------- sauvegarde locale */

  function sauver() {
    const e = jeu.etat;
    const provinces = {};
    for (const id of e.ordreProvinces) {
      const p = e.provinces[id];
      provinces[id] = {
        nation: p.nation, pop: p.pop, ordre: p.ordre, occupation: p.occupation,
        batiments: p.batiments, chantier: p.chantier, recrutement: p.recrutement,
        siege: p.siege, garnison: p.garnison,
      };
    }
    const donnees = {
      version: 1, seed: e.seed, joueur: e.joueur, tour: e.tour, annee: e.annee, saison: e.saison,
      provinces, nations: e.nations, armees: e.armees, relations: e.relations,
      tauxImpot: e.tauxImpot, journal: e.journal.slice(0, 60), prochainId: e.prochainId, rng: e.rng,
    };
    try {
      localStorage.setItem('grandeligne.sauvegarde', JSON.stringify(donnees));
      alerte('Partie sauvegardée.');
    } catch (err) {
      alerte('Sauvegarde impossible (espace insuffisant).');
    }
  }

  function charger() {
    const brut = localStorage.getItem('grandeligne.sauvegarde');
    if (!brut) return;
    let d;
    try { d = JSON.parse(brut); } catch (err) { alerte('Sauvegarde illisible.'); return; }
    const e = K.creerEtat(d.seed, d.joueur);
    e.tour = d.tour; e.annee = d.annee; e.saison = d.saison;
    e.nations = d.nations; e.armees = d.armees; e.relations = d.relations;
    e.tauxImpot = d.tauxImpot; e.journal = d.journal; e.prochainId = d.prochainId; e.rng = d.rng;
    for (const id of Object.keys(d.provinces)) {
      Object.assign(e.provinces[id], d.provinces[id]);
    }
    e.file = null;
    demarrerCampagne(d.joueur, e);
    alerte('Partie reprise.');
  }

  /* ------------------------------------------------------ boucle & liens */

  function boucle(t) {
    const dt = Math.min(0.05, (t - jeu.dernierTemps) / 1000 || 0.016);
    jeu.dernierTemps = t;

    if (jeu.ecran === 'campagne' && jeu.vueCarte) {
      G.vueCampagne.dessiner(jeu.vueCarte, dt);
    } else if (jeu.ecran === 'bataille' && jeu.bataille) {
      const b = jeu.bataille;
      if (b.phase === 'combat' && !b.pause) {
        const total = dt * b.vitesse;
        // On découpe les pas rapides pour que la simulation reste stable.
        const nbPas = Math.min(8, Math.ceil(total / 0.06));
        for (let i = 0; i < nbPas; i++) {
          BT.pas(b, total / nbPas);
          G.iaBataille.majIA(b, jeu.iaBataille, total / nbPas);
        }
        if (b.resultat) terminerBataille();
      }
      G.vueBataille.dessiner(jeu.vueBataille, dt);
      majChrono();
      if (Math.floor(t / 400) !== jeu._tickCartes) { jeu._tickCartes = Math.floor(t / 400); majCartesUnites(); majMessages(); }
    }
    requestAnimationFrame(boucle);
  }

  function majChrono() {
    const b = jeu.bataille;
    const s = Math.floor(b.temps);
    $('chronoBataille').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function majMessages() {
    const b = jeu.bataille;
    const el = $('messagesBataille');
    const recents = b.messages.filter((m) => b.temps - m.t < 9).slice(-5);
    el.innerHTML = recents.map((m) => `<div>${m.texte}</div>`).join('');
  }

  function brancherBataille() {
    for (const el of document.querySelectorAll('.controles-temps .bouton')) {
      el.addEventListener('click', () => {
        const vit = Number(el.dataset.vitesse);
        const b = jeu.bataille;
        if (!b) return;
        if (vit === 0) b.pause = !b.pause;
        else { b.pause = false; b.vitesse = vit; }
        majBoutonsVitesse(b.pause ? 0 : b.vitesse);
      });
    }
    $('btnEngager').addEventListener('click', engager);
    $('btnAutoDeploiement').addEventListener('click', () => {
      if (jeu.bataille) BT.trierDeploiement(jeu.bataille, 0);
    });
    $('btnRefuser').addEventListener('click', () => {
      if (!jeu.bataille) return;
      BT.terminer(jeu.bataille, 1);
      terminerBataille();
    });
    for (const el of document.querySelectorAll('.ordres [data-ordre]')) {
      el.addEventListener('click', () => appliquerOrdre(el.dataset.ordre));
    }
    $('btnAide').addEventListener('click', ouvrirAide);
  }

  const AIDE = `
    <div class="colonnes">
      <div>
        <h4>Commander</h4>
        <div class="ligne-info"><span>Sélectionner</span><span>clic gauche</span></div>
        <div class="ligne-info"><span>Sélectionner plusieurs</span><span>rectangle, ou Maj + clic</span></div>
        <div class="ligne-info"><span>Se porter quelque part</span><span>clic droit</span></div>
        <div class="ligne-info"><span>Choisir le front et la largeur</span><span>clic droit maintenu, puis glisser</span></div>
        <div class="ligne-info"><span>Attaquer une unité</span><span>clic droit dessus</span></div>
        <div class="ligne-info"><span>Marcher au pas de course</span><span>Maj + clic droit</span></div>
        <div class="ligne-info"><span>Tout sélectionner</span><span>A</span></div>
        <div class="ligne-info"><span>Passer d'un régiment à l'autre</span><span>Tab</span></div>
      </div>
      <div>
        <h4>Formations et feu</h4>
        <div class="ligne-info"><span>Ligne</span><span>L</span></div>
        <div class="ligne-info"><span>Colonne</span><span>C</span></div>
        <div class="ligne-info"><span>Carré</span><span>Y</span></div>
        <div class="ligne-info"><span>Tirailleurs</span><span>T</span></div>
        <div class="ligne-info"><span>Feu à volonté / cesser le feu</span><span>F</span></div>
        <div class="ligne-info"><span>Halte</span><span>H</span></div>
        <div class="ligne-info"><span>Portées de tir</span><span>P</span></div>
        <div class="ligne-info"><span>Pause · vitesse</span><span>Espace · 1 2 3 4</span></div>
      </div>
      <div>
        <h4>Ce qu'il faut savoir</h4>
        <p class="sous">La ligne tire de tous ses rangs mais se fait enfoncer de flanc. La colonne
        marche vite et charge bien, mais un boulet la traverse de part en part.</p>
        <p class="sous">Le carré arrête la cavalerie et rien d'autre : sous le canon, il fond.</p>
        <p class="sous">Une charge de cavalerie ne vaut que par son élan, et surtout par l'angle :
        de flanc, elle rapporte le double ; de dos, bien plus.</p>
        <p class="sous">Les régiments ne meurent pas, ils rompent. Surveillez la barre de moral,
        gardez votre état-major derrière la ligne, et poursuivez les fuyards avec la cavalerie.</p>
      </div>
    </div>`;

  function ouvrirAide() { ouvrirModale('Commandes', AIDE); }

  function appliquerOrdre(ordre) {
    const v = jeu.vueBataille;
    if (!v) return;
    if (ordre === 'portees') { v.afficherPortees = !v.afficherPortees; return; }
    if (ordre === 'retraite') {
      for (const u of jeu.bataille.unites) if (u.camp === 0) { u.moral = 0; u.etat = 'fuite'; }
      return;
    }
    for (const u of v.selection) {
      if (ordre === 'halte') BT.ordreHalte(u);
      else if (ordre === 'feu') u.feuLibre = !u.feuLibre;
      else BT.ordreFormation(u, ordre);
    }
    majCartesUnites();
  }

  function brancherClavier() {
    window.addEventListener('keydown', (e) => {
      if (jeu.ecran !== 'bataille' || !jeu.bataille) return;
      const b = jeu.bataille, v = jeu.vueBataille;
      const touche = e.key.toLowerCase();
      if (touche === ' ') { e.preventDefault(); b.pause = !b.pause; majBoutonsVitesse(b.pause ? 0 : b.vitesse); }
      else if (touche >= '1' && touche <= '4') { b.pause = false; b.vitesse = [1, 2, 4, 8][Number(touche) - 1]; majBoutonsVitesse(b.vitesse); }
      else if (touche === 'l') appliquerOrdre('ligne');
      else if (touche === 'c') appliquerOrdre('colonne');
      else if (touche === 'y') appliquerOrdre('carre');
      else if (touche === 't') appliquerOrdre('tirailleur');
      else if (touche === 'f') appliquerOrdre('feu');
      else if (touche === 'h') appliquerOrdre('halte');
      else if (touche === 'p') appliquerOrdre('portees');
      else if (touche === 'a') { v.selection = b.unites.filter((u) => u.camp === 0 && BT.vivants(u) && !u.sorti); majCartesUnites(); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        const mes = b.unites.filter((u) => u.camp === 0 && BT.vivants(u) && !u.sorti);
        if (!mes.length) return;
        const i = mes.indexOf(v.selection[0]);
        v.selection = [mes[(i + 1) % mes.length]];
        const c = v.selection[0];
        v.camera.x = c.x; v.camera.y = c.y;
        majCartesUnites();
      } else if (e.key === 'Enter' && b.phase === 'deploiement') engager();
    });
  }

  function brancherCampagne() {
    $('btnFinTour').addEventListener('click', finDeTour);
    $('btnRecherche').addEventListener('click', ouvrirRecherche);
    $('btnDiplomatie').addEventListener('click', ouvrirDiplomatie);
    $('btnJournal').addEventListener('click', ouvrirJournal);
    $('btnImpots').addEventListener('click', ouvrirImpots);
    $('btnSauver').addEventListener('click', sauver);
    $('btnQuitter').addEventListener('click', () => {
      if (confirm('Revenir au menu ? La partie en cours sera perdue si elle n’est pas sauvegardée.')) montrer('menu');
    });
    $('modaleFermer').addEventListener('click', () => $('modale').classList.remove('ouverte'));
    window.addEventListener('resize', () => {
      if (jeu.vueCarte) G.vueCampagne.ajusterTaille(jeu.vueCarte);
      if (jeu.vueBataille) G.vueBataille.ajusterTaille(jeu.vueBataille);
    });
  }

  function init() {
    construireMenu();
    brancherCampagne();
    brancherBataille();
    brancherClavier();
    requestAnimationFrame(boucle);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  G.jeu = jeu;
})(window.Grande = window.Grande || {});
