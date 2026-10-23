/* IA de bataille. Elle raisonne comme un officier de l'époque : une ligne de feu
   au centre, l'artillerie derrière, la cavalerie aux ailes qui attend le moment
   où la ligne adverse est fixée pour tomber sur son flanc. */
(function (G) {
  'use strict';

  const U = G.util;
  const B = () => G.bataille;

  const PORTEE_LIGNE = 88;     // distance à laquelle une ligne s'arrête pour faire feu

  function creerControleur(camp, difficulte) {
    return {
      camp,
      difficulte: difficulte || 'normal',
      prochainCalcul: 0,
      phase: 'approche',       // approche | feu | assaut | poursuite
      roles: new Map(),
    };
  }

  function majIA(b, ctrl, dt) {
    if (b.phase !== 'combat' || b.resultat) return;
    ctrl.prochainCalcul -= dt;
    if (ctrl.prochainCalcul > 0) return;
    ctrl.prochainCalcul = 1.6 + Math.random() * 0.8;

    const bb = B();
    const mes = b.unites.filter((u) => u.camp === ctrl.camp && bb.vivants(u) && u.etat !== 'fuite');
    const eux = b.unites.filter((u) => u.camp !== ctrl.camp && bb.vivants(u) && u.etat !== 'fuite');
    if (!mes.length || !eux.length) return;

    const monInf = mes.filter((u) => u.classe === 'infanterie');
    const maCav = mes.filter((u) => u.classe === 'cavalerie' && !u.general);
    const monArt = mes.filter((u) => u.classe === 'artillerie');
    const leurInf = eux.filter((u) => u.classe === 'infanterie');
    const leurCav = eux.filter((u) => u.classe === 'cavalerie' && !u.general);
    const leurArt = eux.filter((u) => u.classe === 'artillerie');

    const forceMoi = mes.reduce((s, u) => s + bb.vivants(u), 0);
    const forceEux = eux.reduce((s, u) => s + bb.vivants(u), 0);
    const centreEnnemi = barycentre(eux);
    const centreMoi = barycentre(mes);

    // Phase générale : on presse quand on domine, on tient quand on souffre.
    if (forceMoi > forceEux * 1.35) ctrl.phase = 'assaut';
    else if (forceMoi < forceEux * 0.7) ctrl.phase = 'feu';
    else ctrl.phase = ctrl.phase === 'assaut' ? 'assaut' : 'approche';

    /* --- Infanterie --- */
    for (const u of monInf) {
      const menaceCav = cavalerieMenacante(b, u, leurCav);
      if (menaceCav && u.formation !== 'carre' && !u.def.tirailleur && !u.contact) {
        bb.ordreFormation(u, 'carre');
        bb.ordreHalte(u);
        continue;
      }
      if (!menaceCav && u.formation === 'carre') bb.ordreFormation(u, 'ligne');
      if (u.contact) continue;

      const proche = plusProche(u, leurInf.length ? leurInf : eux);
      if (!proche) continue;
      const d = U.dist(u.x, u.y, proche.x, proche.y);

      if (ctrl.phase === 'assaut' && (d < 60 || proche.moral < proche.moralMax * 0.4)) {
        bb.ordreAttaque(u, proche);
        continue;
      }
      if (d > PORTEE_LIGNE + 14) {
        // Avancer en gardant l'alignement sur le centre de la ligne ennemie.
        const angle = Math.atan2(proche.y - u.y, proche.x - u.x);
        const tx = proche.x - Math.cos(angle) * PORTEE_LIGNE;
        const ty = proche.y - Math.sin(angle) * PORTEE_LIGNE;
        if (!u.cible || U.dist(u.cible.x, u.cible.y, tx, ty) > 45) {
          bb.ordreDeplacement(u, tx, ty, angle, d > 260);
        }
      } else if (d < PORTEE_LIGNE - 30) {
        // Trop près sans vouloir charger : on se replie de quelques pas.
        const angle = Math.atan2(proche.y - u.y, proche.x - u.x);
        bb.ordreDeplacement(u, u.x - Math.cos(angle) * 25, u.y - Math.sin(angle) * 25, angle, false);
      } else if (u.etat !== 'melee') {
        bb.ordreHalte(u);
        u.angle = U.turnToward(u.angle, Math.atan2(proche.y - u.y, proche.x - u.x), 1);
      }
    }

    /* --- Cavalerie --- */
    for (const u of maCav) {
      if (u.contact) continue;
      // Priorité : l'artillerie découverte, puis un flanc, puis les fuyards.
      const artExposee = leurArt.find((a) => !protege(b, a, leurInf.concat(leurCav)));
      const fuyard = b.unites.find((e) => e.camp !== ctrl.camp && e.etat === 'fuite' && bb.vivants(e)
        && U.dist(u.x, u.y, e.x, e.y) < 260);

      if (artExposee && U.dist(u.x, u.y, artExposee.x, artExposee.y) < 420) {
        bb.ordreAttaque(u, artExposee);
        continue;
      }
      if (fuyard && ctrl.phase !== 'feu') { bb.ordreAttaque(u, fuyard); continue; }

      // Une fois les lignes aux prises, la cavalerie cherche franchement le flanc.
      const lignesEngagees = leurInf.some((e) => e.contact || e.etat === 'melee')
        || monInf.some((e) => e.contact || e.etat === 'melee');
      const cibleFlanc = meilleurFlanc(b, u, leurInf, lignesEngagees);
      if (cibleFlanc && cibleFlanc.formation !== 'carre') {
        const d = U.dist(u.x, u.y, cibleFlanc.x, cibleFlanc.y);
        if (d < 190 && (cibleFlanc.contact || cibleFlanc.etat === 'melee' || ctrl.phase === 'assaut')) {
          bb.ordreAttaque(u, cibleFlanc);
        } else {
          // Contourner : on se porte sur le flanc avant de charger.
          const pos = pointDeFlanc(cibleFlanc, u);
          if (!u.cible || U.dist(u.cible.x, u.cible.y, pos.x, pos.y) > 60) {
            bb.ordreDeplacement(u, pos.x, pos.y, Math.atan2(cibleFlanc.y - pos.y, cibleFlanc.x - pos.x), true);
          }
        }
        continue;
      }
      // Sinon, charger la cavalerie adverse ou rester en couverture.
      const cavEnnemie = plusProche(u, leurCav);
      if (cavEnnemie && U.dist(u.x, u.y, cavEnnemie.x, cavEnnemie.y) < 220) {
        bb.ordreAttaque(u, cavEnnemie);
      } else {
        // Sans objectif, on se tient en couverture sur l'aile, à distance fixe du centre.
        const cote = u.x < centreMoi.x ? -1 : 1;
        const garde = {
          x: U.clamp(centreMoi.x + cote * 180, 70, B().TERRAIN_W - 70),
          y: centreMoi.y + (centreMoi.y < centreEnnemi.y ? -25 : 25),
        };
        if (!u.cible || U.dist(u.cible.x, u.cible.y, garde.x, garde.y) > 70) {
          bb.ordreDeplacement(u, garde.x, garde.y, Math.atan2(centreEnnemi.y - u.y, centreEnnemi.x - u.x), false);
        }
      }
    }

    /* --- Artillerie --- */
    for (const u of monArt) {
      const menace = eux.find((e) => U.dist(u.x, u.y, e.x, e.y) < 120);
      if (menace) {
        // On décroche : une batterie prise de front est perdue.
        const fuite = { x: u.x + (centreMoi.x - centreEnnemi.x) * 0.12, y: u.y + (centreMoi.y - centreEnnemi.y) * 0.12 };
        bb.ordreDeplacement(u, fuite.x, fuite.y, Math.atan2(centreEnnemi.y - u.y, centreEnnemi.x - u.x), true);
      } else if (!u.cible) {
        u.angle = U.turnToward(u.angle, Math.atan2(centreEnnemi.y - u.y, centreEnnemi.x - u.x), 0.5);
      }
    }

    /* --- État-major --- */
    for (const u of mes.filter((x) => x.general)) {
      if (u.contact) continue;
      const cible = { x: centreMoi.x, y: centreMoi.y + (centreMoi.y < centreEnnemi.y ? -55 : 55) };
      if (!u.cible || U.dist(u.cible.x, u.cible.y, cible.x, cible.y) > 50) {
        bb.ordreDeplacement(u, cible.x, cible.y, Math.atan2(centreEnnemi.y - u.y, centreEnnemi.x - u.x), false);
      }
    }
  }

  function barycentre(liste) {
    let x = 0, y = 0, n = 0;
    for (const u of liste) { x += u.x; y += u.y; n++; }
    return n ? { x: x / n, y: y / n } : { x: 0, y: 0 };
  }

  function plusProche(u, liste) {
    let best = null, bd = Infinity;
    for (const e of liste) {
      const d = U.dist2(u.x, u.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function cavalerieMenacante(b, u, cavs) {
    for (const c of cavs) {
      const d = U.dist(u.x, u.y, c.x, c.y);
      if (d < 165 && (c.cibleEnnemi === u || d < 110)) return c;
    }
    return null;
  }

  function protege(b, unite, gardes) {
    for (const g of gardes) {
      if (U.dist(unite.x, unite.y, g.x, g.y) < 95) return true;
    }
    return false;
  }

  /** Cherche l'unité dont le flanc est le plus accessible. */
  function meilleurFlanc(b, cav, infEnnemie, pressant) {
    let best = null, bestScore = -Infinity;
    for (const e of infEnnemie) {
      const d = U.dist(cav.x, cav.y, e.x, e.y);
      if (d > 460) continue;
      if (pressant) { /* on accepte des cibles moins idéales */ }
      const rel = Math.abs(U.angleDiff(Math.atan2(cav.y - e.y, cav.x - e.x), e.angle));
      let score = rel * 60 - d * 0.35;
      if (e.contact) score += 55;                 // déjà fixée de front
      if (e.formation === 'carre') score -= 120;
      if (e.moral < e.moralMax * 0.5) score += 40;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return bestScore > (pressant ? -90 : -20) ? best : null;
  }

  function pointDeFlanc(cible, cav) {
    const cote = U.angleDiff(Math.atan2(cav.y - cible.y, cav.x - cible.x), cible.angle) > 0 ? 1 : -1;
    const a = cible.angle + cote * Math.PI / 2;
    const r = 120;
    return { x: cible.x + Math.cos(a) * r, y: cible.y + Math.sin(a) * r };
  }

  G.iaBataille = { creerControleur, majIA };
})(window.Grande = window.Grande || {});
