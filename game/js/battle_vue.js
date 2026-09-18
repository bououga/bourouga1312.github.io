/* Rendu et commandes de la bataille.
   Le terrain est pré-dessiné une fois ; chaque image ne recompose que les
   hommes, la fumée et les tracés d'ordres. */
(function (G) {
  'use strict';

  const U = G.util;
  const B = () => G.bataille;

  const COULEURS_CAMP = [
    { corps: '#d8d2c4', habit: null, selection: '#ffe9a8' },
    { corps: '#d8d2c4', habit: null, selection: '#ffc9a8' },
  ];

  function creerVue(canvas, bataille, campJoueur) {
    const v = {
      canvas, ctx: canvas.getContext('2d'), b: bataille, camp: campJoueur,
      camera: { x: G.bataille.TERRAIN_W / 2, y: G.bataille.TERRAIN_H * (campJoueur === 0 ? 0.62 : 0.38), zoom: 1.45 },
      terrainRendu: null,
      selection: [],
      boite: null,
      ordreGlisse: null,
      souris: { x: 0, y: 0, monde: { x: 0, y: 0 } },
      survol: null,
      messageFlash: null,
      afficherPortees: false,
    };
    ajusterTaille(v);
    brancher(v);
    return v;
  }

  function ajusterTaille(v) {
    const r = v.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    v.canvas.width = Math.max(320, Math.round(r.width * dpr));
    v.canvas.height = Math.max(240, Math.round(r.height * dpr));
    v.dpr = dpr; v.largeur = r.width; v.hauteur = r.height;
    // Le terrain couvre toujours la fenêtre : pas de bordure noire.
    v.zoomMin = Math.max(r.width / G.bataille.TERRAIN_W, r.height / G.bataille.TERRAIN_H);
    v.camera.zoom = U.clamp(v.camera.zoom, v.zoomMin, 5);
    contraindre(v);
  }

  function versMonde(v, x, y) {
    return { x: (x - v.largeur / 2) / v.camera.zoom + v.camera.x,
             y: (y - v.hauteur / 2) / v.camera.zoom + v.camera.y };
  }
  function versEcran(v, x, y) {
    return { x: (x - v.camera.x) * v.camera.zoom + v.largeur / 2,
             y: (y - v.camera.y) * v.camera.zoom + v.hauteur / 2 };
  }

  /* ------------------------------------------------------------- entrées */

  function brancher(v) {
    const c = v.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    c.addEventListener('mousedown', (e) => {
      const p = pos(v, e);
      const m = versMonde(v, p.x, p.y);
      if (e.button === 0 && v.b.phase === 'deploiement') {
        // Pendant le déploiement, le clic gauche saisit un régiment pour le déplacer.
        const u = uniteSous(v, m.x, m.y);
        if (u && u.camp === v.camp) {
          v.glisseDeploiement = { u, dx: u.x - m.x, dy: u.y - m.y };
          v.selection = [u];
          if (v.onSelection) v.onSelection(v.selection);
          return;
        }
      }
      if (e.button === 0) {
        v.boite = { x0: m.x, y0: m.y, x1: m.x, y1: m.y, ajout: e.shiftKey, ecran0: p };
      } else if (e.button === 2 && v.selection.length) {
        v.ordreGlisse = { x0: m.x, y0: m.y, x1: m.x, y1: m.y };
      } else if (e.button === 1) {
        v.pan = { x: p.x, y: p.y, camX: v.camera.x, camY: v.camera.y };
      }
    });

    window.addEventListener('mousemove', (e) => {
      const p = pos(v, e);
      const m = versMonde(v, p.x, p.y);
      v.souris.x = p.x; v.souris.y = p.y; v.souris.monde = m;
      if (v.glisseDeploiement) {
        const gd = v.glisseDeploiement;
        const z = v.b.zonesDeploiement[v.camp];
        const demiL = G.bataille.largeurUnite(gd.u) / 2;
        gd.u.x = U.clamp(m.x + gd.dx, z.x + demiL, z.x + z.w - demiL);
        gd.u.y = U.clamp(m.y + gd.dy, z.y + 12, z.y + z.h - 12);
        G.bataille.placerInitial(gd.u);
        return;
      }
      if (v.boite) { v.boite.x1 = m.x; v.boite.y1 = m.y; }
      if (v.ordreGlisse) { v.ordreGlisse.x1 = m.x; v.ordreGlisse.y1 = m.y; }
      if (v.pan) {
        v.camera.x = v.pan.camX - (p.x - v.pan.x) / v.camera.zoom;
        v.camera.y = v.pan.camY - (p.y - v.pan.y) / v.camera.zoom;
        contraindre(v);
      }
      v.survol = uniteSous(v, m.x, m.y);
    });

    window.addEventListener('mouseup', (e) => {
      const p = pos(v, e);
      const m = versMonde(v, p.x, p.y);
      if (v.glisseDeploiement) { v.glisseDeploiement = null; return; }
      if (v.pan) { v.pan = null; return; }
      if (e.button === 0 && v.boite) {
        const bo = v.boite; v.boite = null;
        const largeur = Math.abs(bo.x1 - bo.x0), hauteur = Math.abs(bo.y1 - bo.y0);
        if (largeur * v.camera.zoom < 6 && hauteur * v.camera.zoom < 6) {
          const u = uniteSous(v, m.x, m.y);
          if (u && u.camp === v.camp) {
            if (bo.ajout) basculer(v, u); else v.selection = [u];
          } else if (!bo.ajout) v.selection = [];
        } else {
          const dans = v.b.unites.filter((u) => u.camp === v.camp && B().vivants(u) && !u.sorti
            && u.x >= Math.min(bo.x0, bo.x1) && u.x <= Math.max(bo.x0, bo.x1)
            && u.y >= Math.min(bo.y0, bo.y1) && u.y <= Math.max(bo.y0, bo.y1));
          v.selection = bo.ajout ? v.selection.concat(dans.filter((u) => v.selection.indexOf(u) < 0)) : dans;
        }
        if (v.onSelection) v.onSelection(v.selection);
      }
      if (e.button === 2 && v.ordreGlisse) {
        const o = v.ordreGlisse; v.ordreGlisse = null;
        donnerOrdre(v, o, e);
      }
    });

    v.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = pos(v, e);
      const avant = versMonde(v, p.x, p.y);
      v.camera.zoom = U.clamp(v.camera.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), v.zoomMin, 5);
      const apres = versMonde(v, p.x, p.y);
      v.camera.x += avant.x - apres.x; v.camera.y += avant.y - apres.y;
      contraindre(v);
    }, { passive: false });
  }

  function pos(v, e) {
    const r = v.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function contraindre(v) {
    const T = G.bataille;
    const dl = v.largeur / 2 / v.camera.zoom, dh = v.hauteur / 2 / v.camera.zoom;
    v.camera.x = U.clamp(v.camera.x, Math.min(dl, T.TERRAIN_W / 2), Math.max(T.TERRAIN_W - dl, T.TERRAIN_W / 2));
    v.camera.y = U.clamp(v.camera.y, Math.min(dh, T.TERRAIN_H / 2), Math.max(T.TERRAIN_H - dh, T.TERRAIN_H / 2));
  }

  function basculer(v, u) {
    const i = v.selection.indexOf(u);
    if (i >= 0) v.selection.splice(i, 1); else v.selection.push(u);
  }

  function uniteSous(v, x, y) {
    const bb = B();
    let best = null, bd = Infinity;
    for (const u of v.b.unites) {
      if (!bb.vivants(u) || u.sorti) continue;
      const l = bb.largeurUnite(u) / 2 + 6, p = bb.profondeurUnite(u) / 2 + 6;
      const dx = x - u.x, dy = y - u.y;
      const cos = Math.cos(-u.angle), sin = Math.sin(-u.angle);
      const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
      // repère local : l'axe « avant » est u.angle
      if (Math.abs(ly) <= l && Math.abs(lx) <= p) {
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = u; }
      }
    }
    return best;
  }

  function donnerOrdre(v, o, e) {
    const bb = B();
    if (v.b.phase === 'deploiement') {
      const angle = Math.atan2(o.y1 - o.y0, o.x1 - o.x0);
      for (const u of v.selection) { u.angle = angle; bb.placerInitial(u); }
      return;
    }
    const cible = uniteSous(v, o.x1, o.y1);
    if (cible && cible.camp !== v.camp) {
      for (const u of v.selection) bb.ordreAttaque(u, cible);
      v.messageFlash = { texte: 'À l’attaque !', t: 0 };
      return;
    }
    const glisse = U.dist(o.x0, o.y0, o.x1, o.y1) > 18;
    const angle = glisse ? Math.atan2(o.y1 - o.y0, o.x1 - o.x0) + Math.PI / 2 : null;
    const courir = e.shiftKey;
    // Plusieurs unités : on les répartit sur la ligne tracée, dans l'ordre où elles sont placées.
    if (v.selection.length > 1 && glisse) {
      const liste = v.selection.slice().sort((a, b2) => {
        const pa = (a.x - o.x0) * (o.x1 - o.x0) + (a.y - o.y0) * (o.y1 - o.y0);
        const pb = (b2.x - o.x0) * (o.x1 - o.x0) + (b2.y - o.y0) * (o.y1 - o.y0);
        return pa - pb;
      });
      const total = liste.reduce((s, u) => s + bb.largeurUnite(u) + 10, 0);
      const dir = Math.atan2(o.y1 - o.y0, o.x1 - o.x0);
      let curseur = -total / 2;
      const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
      for (const u of liste) {
        const w = bb.largeurUnite(u);
        const d = curseur + w / 2;
        bb.ordreDeplacement(u, cx + Math.cos(dir) * d, cy + Math.sin(dir) * d, angle, courir);
        curseur += w + 10;
      }
    } else {
      const n = v.selection.length;
      v.selection.forEach((u, i) => {
        const dec = n > 1 ? (i - (n - 1) / 2) * (bb.largeurUnite(u) + 12) : 0;
        const a = angle !== null ? angle : u.angle;
        bb.ordreDeplacement(u, o.x1 + Math.cos(a + Math.PI / 2) * dec, o.y1 + Math.sin(a + Math.PI / 2) * dec, a, courir);
      });
    }
  }

  /* ---------------------------------------------------------- pré-rendu */

  function rendreTerrain(v) {
    const T = G.bataille, t = v.b.terrain;
    const c = document.createElement('canvas');
    c.width = T.TERRAIN_W; c.height = T.TERRAIN_H;
    const g = c.getContext('2d');
    const palette = [
      { herbe: '#6d8348', herbe2: '#5d7540', labour: '#8a7346', bois: '#31552a', feuille: '#3d6b31' },
      { herbe: '#77863f', herbe2: '#66793a', labour: '#9c8245', bois: '#2f5327', feuille: '#3a682d' },
      { herbe: '#8a7c42', herbe2: '#776b39', labour: '#9a7f42', bois: '#6b4a1e', feuille: '#8a5a22' },
      { herbe: '#9aa0a4', herbe2: '#878d92', labour: '#b7bcc0', bois: '#48544a', feuille: '#5a675a' },
    ][t.saison || 0];

    g.fillStyle = palette.herbe;
    g.fillRect(0, 0, c.width, c.height);

    // Ombrage du relief calculé en basse résolution puis étiré : les pentes restent douces.
    const ech = 6;
    const oc = document.createElement('canvas');
    oc.width = Math.ceil(T.TERRAIN_W / ech); oc.height = Math.ceil(T.TERRAIN_H / ech);
    const og = oc.getContext('2d');
    const img = og.createImageData(oc.width, oc.height);
    for (let j = 0; j < oc.height; j++) {
      for (let i = 0; i < oc.width; i++) {
        const x = i * ech, y = j * ech;
        const h = T.altitude(t, x, y);
        const hx = T.altitude(t, x + ech, y) - h;
        const hy = T.altitude(t, x, y + ech) - h;
        const pente = (hx + hy) / ech;
        const lum = U.clamp(0.5 - pente * 1.5, 0, 1);
        const k = (j * oc.width + i) * 4;
        const clair = lum > 0.5;
        img.data[k] = clair ? 255 : 12;
        img.data[k + 1] = clair ? 250 : 18;
        img.data[k + 2] = clair ? 220 : 10;
        img.data[k + 3] = Math.min(88, Math.abs(lum - 0.5) * 250);
      }
    }
    og.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(oc, 0, 0, T.TERRAIN_W, T.TERRAIN_H);

    // Texture d'herbe : petites touches irrégulières pour casser l'aplat.
    const rng = U.makeRng(t.seed + 55);
    for (let i = 0; i < 9000; i++) {
      const x = rng() * T.TERRAIN_W, y = rng() * T.TERRAIN_H;
      g.fillStyle = rng() < 0.5 ? palette.herbe2 : palette.herbe;
      g.globalAlpha = 0.25 + rng() * 0.3;
      g.fillRect(x, y, 1.6 + rng() * 2.4, 1 + rng());
    }
    g.globalAlpha = 1;

    // Champs labourés
    for (const ch of t.champs) {
      g.save();
      g.translate(ch.x, ch.y); g.rotate(ch.a);
      g.globalAlpha = 0.34;
      g.fillStyle = palette.labour;
      g.fillRect(-ch.w / 2, -ch.h / 2, ch.w, ch.h);
      g.globalAlpha = 0.25;
      g.strokeStyle = '#3b3020'; g.lineWidth = 1;
      for (let x = -ch.w / 2; x < ch.w / 2; x += 5) {
        g.beginPath(); g.moveTo(x, -ch.h / 2); g.lineTo(x, ch.h / 2); g.stroke();
      }
      g.globalAlpha = 0.35;
      g.strokeStyle = '#4a3f28'; g.lineWidth = 2;
      g.strokeRect(-ch.w / 2, -ch.h / 2, ch.w, ch.h);
      g.restore();
    }
    g.globalAlpha = 1;

    // Rivière
    if (t.riviere) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = '#4c6a4a'; g.lineWidth = t.riviere.largeur + 8;
      traceLigne(g, t.riviere.pts); g.stroke();
      g.strokeStyle = '#3f6a80'; g.lineWidth = t.riviere.largeur;
      traceLigne(g, t.riviere.pts); g.stroke();
      g.strokeStyle = 'rgba(200,228,240,0.30)'; g.lineWidth = t.riviere.largeur * 0.35;
      traceLigne(g, t.riviere.pts); g.stroke();
    }

    // Bois : contour irrégulier plutôt qu'un disque net.
    for (const bo of t.bosquets) {
      g.save();
      g.beginPath();
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = bo.r * (0.78 + 0.34 * Math.abs(Math.sin(a * 2.3 + bo.x)));
        const x = bo.x + Math.cos(a) * r, y = bo.y + Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = palette.bois; g.globalAlpha = 0.9; g.fill();
      g.clip();
      g.globalAlpha = 1;
      const nb = Math.round(bo.r * 1.6);
      for (let i = 0; i < nb; i++) {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * bo.r;
        const x = bo.x + Math.cos(a) * r, y = bo.y + Math.sin(a) * r;
        const taille = 3 + rng() * 3;
        g.fillStyle = 'rgba(0,0,0,0.28)';
        g.beginPath(); g.arc(x + 1.8, y + 2.2, taille, 0, Math.PI * 2); g.fill();
        g.fillStyle = palette.feuille;
        g.beginPath(); g.arc(x, y, taille, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }

    // Village
    for (const bt of t.batiments) {
      g.save(); g.translate(bt.x, bt.y); g.rotate(bt.a);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-bt.w / 2 + 2.5, -bt.h / 2 + 3, bt.w, bt.h);
      g.fillStyle = '#cbbb9e'; g.fillRect(-bt.w / 2, -bt.h / 2, bt.w, bt.h);
      g.fillStyle = '#8e4c33'; g.fillRect(-bt.w / 2, -bt.h / 2, bt.w, bt.h * 0.5);
      g.strokeStyle = 'rgba(50,40,30,0.6)'; g.lineWidth = 0.8;
      g.strokeRect(-bt.w / 2, -bt.h / 2, bt.w, bt.h);
      g.restore();
    }

    // Assombrissement des bords : le regard reste au centre du champ.
    const vign = g.createRadialGradient(T.TERRAIN_W / 2, T.TERRAIN_H / 2, T.TERRAIN_H * 0.35,
      T.TERRAIN_W / 2, T.TERRAIN_H / 2, T.TERRAIN_W * 0.75);
    vign.addColorStop(0, 'rgba(0,0,0,0)');
    vign.addColorStop(1, 'rgba(0,0,0,0.30)');
    g.fillStyle = vign;
    g.fillRect(0, 0, T.TERRAIN_W, T.TERRAIN_H);

    v.terrainRendu = c;
  }

  function traceLigne(g, pts) {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  }

  /* ------------------------------------------------------------- rendu */

  function dessiner(v, dt) {
    const bb = B(), T = G.bataille, g = v.ctx, b = v.b;
    if (!v.terrainRendu) rendreTerrain(v);

    g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    g.fillStyle = '#10130f';
    g.fillRect(0, 0, v.largeur, v.hauteur);
    g.save();
    g.translate(v.largeur / 2, v.hauteur / 2);
    g.scale(v.camera.zoom, v.camera.zoom);
    g.translate(-v.camera.x, -v.camera.y);

    g.drawImage(v.terrainRendu, 0, 0);

    if (b.phase === 'deploiement') dessinerZones(g, b);

    // Corps au sol
    g.fillStyle = 'rgba(40,26,22,0.55)';
    for (const e of b.effets) {
      if (e.type !== 'corps') continue;
      g.fillRect(e.x - 1.4, e.y - 1.4, 2.8, 2.8);
    }

    // Tracés d'ordres des unités sélectionnées
    for (const u of v.selection) dessinerOrdre(g, v, u);

    // Unités
    const tri = b.unites.slice().sort((a, c) => a.y - c.y);
    for (const u of tri) dessinerUnite(g, v, u);

    // Projectiles
    for (const p of b.projectiles) {
      g.fillStyle = p.type === 'mitraille' ? 'rgba(255,220,160,0.9)' : '#1b1b1b';
      const r = p.type === 'boulet' ? 1.9 : 1.3;
      g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
    }

    dessinerEffets(g, b);

    // Boîte de sélection et ordre en cours
    if (v.boite) {
      g.strokeStyle = 'rgba(255,240,190,0.9)'; g.lineWidth = 1.5 / v.camera.zoom;
      g.setLineDash([5 / v.camera.zoom, 4 / v.camera.zoom]);
      g.strokeRect(Math.min(v.boite.x0, v.boite.x1), Math.min(v.boite.y0, v.boite.y1),
        Math.abs(v.boite.x1 - v.boite.x0), Math.abs(v.boite.y1 - v.boite.y0));
      g.setLineDash([]);
    }
    if (v.ordreGlisse) {
      const o = v.ordreGlisse;
      g.strokeStyle = 'rgba(255,240,190,0.95)'; g.lineWidth = 2 / v.camera.zoom;
      g.beginPath(); g.moveTo(o.x0, o.y0); g.lineTo(o.x1, o.y1); g.stroke();
      const a = Math.atan2(o.y1 - o.y0, o.x1 - o.x0) + Math.PI / 2;
      g.beginPath();
      g.moveTo((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2);
      g.lineTo((o.x0 + o.x1) / 2 + Math.cos(a) * 22, (o.y0 + o.y1) / 2 + Math.sin(a) * 22);
      g.strokeStyle = 'rgba(160,230,255,0.95)'; g.stroke();
    }

    g.restore();

    // Passe en coordonnées écran : les bandeaux gardent la même taille à tout zoom.
    for (const u of b.unites) dessinerEtiquette(v.ctx, v, u);
    dessinerHud(v, g);
  }

  function dessinerZones(g, b) {
    b.zonesDeploiement.forEach((z, i) => {
      g.strokeStyle = i === 0 ? 'rgba(120,180,255,0.5)' : 'rgba(255,140,120,0.5)';
      g.lineWidth = 3; g.setLineDash([12, 9]);
      g.strokeRect(z.x, z.y, z.w, z.h);
      g.setLineDash([]);
    });
  }

  function couleurUnite(v, u) {
    const nation = G.campagne.factionById[u.nation];
    return nation ? nation.couleur : (u.camp === 0 ? '#4a6fb0' : '#a8443c');
  }

  /** Teinte plus sombre ou plus claire d'une couleur hexadécimale. */
  const cacheTeinte = {};
  function teinter(hex, f) {
    const clef = hex + '|' + f;
    if (cacheTeinte[clef]) return cacheTeinte[clef];
    const n = parseInt(hex.slice(1), 16);
    const m = (c) => Math.round(U.clamp(f < 0 ? c * (1 + f) : c + (255 - c) * f, 0, 255));
    const v = `rgb(${m((n >> 16) & 255)},${m((n >> 8) & 255)},${m(n & 255)})`;
    cacheTeinte[clef] = v;
    return v;
  }

  /** Corps des hommes et matériel — dessiné dans le repère du terrain. */
  function dessinerUnite(g, v, u) {
    const bb = B();
    const n = bb.vivants(u);
    if (!n || u.sorti) return;
    const couleur = couleurUnite(v, u);
    const zoom = v.camera.zoom;
    const selectionne = v.selection.indexOf(u) >= 0;

    if (zoom < 0.7) {
      // Vue d'ensemble : un pavé par régiment, on ne voit plus les hommes.
      g.save();
      g.translate(u.x, u.y); g.rotate(u.angle);
      const l = bb.largeurUnite(u), p = bb.profondeurUnite(u);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(-p / 2 + 1.5, -l / 2 + 1.5, p, l);
      g.globalAlpha = u.etat === 'fuite' ? 0.5 : 0.95;
      g.fillStyle = couleur;
      g.fillRect(-p / 2, -l / 2, p, l);
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(p / 2 - 1.2, -l / 2, 1.2, l);   // le front, plus clair
      g.restore();
    } else {
      const monte = u.def.monte;
      const taille = monte ? 2.2 : 1.5;
      const sombre = teinter(couleur, -0.45);
      const cos = Math.cos(u.angle), sin = Math.sin(u.angle);

      // Emprise de la formation : le bloc reste lisible même quand les hommes sont minuscules.
      if (!u.def.canon && u.formation !== 'tirailleur') {
        g.save();
        g.translate(u.x, u.y); g.rotate(u.angle);
        const l = bb.largeurUnite(u) / 2 + 1, p = bb.profondeurUnite(u) / 2 + 1;
        g.globalAlpha = u.etat === 'fuite' ? 0.35 : 0.85;
        g.fillStyle = teinter(couleur, 0.22);
        g.fillRect(-p, -l, p * 2, l * 2);
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.fillRect(p - 0.9, -l, 0.9, l * 2);      // le front
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(-p, -l, 0.7, l * 2);           // l'arrière
        g.restore();
      }

      if (monte) {
        g.fillStyle = 'rgba(18,24,14,0.4)';
        for (const s of u.soldats) {
          if (!s.vivant) continue;
          g.beginPath(); g.ellipse(s.x + 1, s.y + 1.4, taille * 1.6, taille * 0.9, u.angle, 0, Math.PI * 2); g.fill();
        }
      }
      for (const s of u.soldats) {
        if (!s.vivant) continue;
        if (monte) {
          g.fillStyle = '#4b3524';
          g.beginPath(); g.ellipse(s.x, s.y, taille * 1.6, taille * 0.9, u.angle, 0, Math.PI * 2); g.fill();
          g.fillStyle = couleur;
          g.beginPath(); g.arc(s.x - cos * 0.5, s.y - sin * 0.5, taille * 0.68, 0, Math.PI * 2); g.fill();
        } else {
          // Les hommes se détachent en sombre sur l'emprise claire du régiment.
          g.fillStyle = sombre;
          g.fillRect(s.x - taille / 2, s.y - taille / 2, taille, taille);
        }
        if (s.feu > 0) {
          g.fillStyle = 'rgba(255,225,140,0.95)';
          g.fillRect(s.x + cos * 2.2 - 0.8, s.y + sin * 2.2 - 0.8, 1.8, 1.8);
          s.feu -= 0.02;
        }
      }
      if (u.def.canon) {
        const pieces = u.def.pieces || 4;
        for (let i = 0; i < pieces; i++) {
          const dec = (i - (pieces - 1) / 2) * 10;
          const dx = Math.cos(u.angle + Math.PI / 2) * dec, dy = Math.sin(u.angle + Math.PI / 2) * dec;
          g.save();
          g.translate(u.x + dx, u.y + dy); g.rotate(u.angle);
          g.fillStyle = 'rgba(20,26,16,0.35)'; g.fillRect(-4, -2.6, 12, 5.2);
          g.fillStyle = '#4a3b2c'; g.fillRect(-5, -2.6, 9, 5.2);
          g.fillStyle = '#23282c'; g.fillRect(1, -1.1, 9, 2.2);
          g.fillStyle = '#5c4a36';
          g.beginPath(); g.arc(-2, -3, 2.4, 0, Math.PI * 2); g.arc(-2, 3, 2.4, 0, Math.PI * 2); g.fill();
          g.restore();
        }
      }
    }

    if (selectionne) {
      g.save(); g.translate(u.x, u.y); g.rotate(u.angle);
      const l = bb.largeurUnite(u) / 2 + 3.5, p = bb.profondeurUnite(u) / 2 + 3.5;
      g.strokeStyle = '#ffe9a8'; g.lineWidth = 1.5 / zoom;
      g.strokeRect(-p, -l, p * 2, l * 2);
      g.beginPath(); g.moveTo(p, -l); g.lineTo(p + 8 / zoom + 3, 0); g.lineTo(p, l);
      g.strokeStyle = 'rgba(255,233,168,0.55)'; g.stroke();
      g.restore();
    }
  }

  /** Bandeaux d'état — dessinés en pixels écran pour rester lisibles à tout zoom. */
  function dessinerEtiquette(g, v, u) {
    const bb = B();
    const n = bb.vivants(u);
    if (!n || u.sorti) return;
    const centre = versEcran(v, u.x, u.y);
    const demi = (bb.profondeurUnite(u) / 2) * v.camera.zoom;
    const y = centre.y - demi - 13;
    if (centre.x < -60 || centre.x > v.largeur + 60 || y < -20 || y > v.hauteur + 20) return;

    const w = 34, h = 4;
    const moral = U.clamp(u.moral / u.moralMax, 0, 1);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(centre.x - w / 2 - 1, y - 1, w + 2, h + 5.5);
    g.fillStyle = u.etat === 'fuite' ? '#c03a2c' : (moral > 0.55 ? '#6fb468' : moral > 0.3 ? '#d6ab42' : '#c4563a');
    g.fillRect(centre.x - w / 2, y, w * moral, h);
    g.fillStyle = 'rgba(226,220,204,0.85)';
    g.fillRect(centre.x - w / 2, y + h + 1, w * (n / u.hommesMax), 2.5);

    if (u.camp === v.camp) {
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(centre.x - w / 2 - 1, y - 3, w + 2, 1.5);
    }
    if (u.etat === 'fuite') {
      g.fillStyle = '#ef7a68'; g.font = 'bold 10px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText('EN DÉROUTE', centre.x, y - 5);
    } else if (u.formation === 'carre') {
      g.fillStyle = '#d6dee6'; g.font = 'bold 9px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText('CARRÉ', centre.x, y - 5);
    } else if (!u.feuLibre && u.def.portee > 0) {
      g.fillStyle = '#d6c07a'; g.font = 'bold 9px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText('NE PAS TIRER', centre.x, y - 5);
    }
  }

  function dessinerOrdre(g, v, u) {
    const bb = B();
    if (u.cibleEnnemi) {
      g.strokeStyle = 'rgba(230,90,70,0.8)';
      g.lineWidth = 2 / v.camera.zoom;
      g.setLineDash([6 / v.camera.zoom, 5 / v.camera.zoom]);
      g.beginPath(); g.moveTo(u.x, u.y); g.lineTo(u.cibleEnnemi.x, u.cibleEnnemi.y); g.stroke();
      g.setLineDash([]);
    } else if (u.cible) {
      g.strokeStyle = 'rgba(255,240,190,0.65)';
      g.lineWidth = 1.6 / v.camera.zoom;
      g.setLineDash([6 / v.camera.zoom, 5 / v.camera.zoom]);
      g.beginPath(); g.moveTo(u.x, u.y); g.lineTo(u.cible.x, u.cible.y); g.stroke();
      g.setLineDash([]);
      const l = bb.largeurUnite(u) / 2;
      const a = (u.cible.angle === null || u.cible.angle === undefined) ? u.angle : u.cible.angle;
      const dx = Math.cos(a + Math.PI / 2) * l, dy = Math.sin(a + Math.PI / 2) * l;
      g.strokeStyle = 'rgba(255,240,190,0.9)'; g.lineWidth = 2 / v.camera.zoom;
      g.beginPath();
      g.moveTo(u.cible.x - dx, u.cible.y - dy);
      g.lineTo(u.cible.x + dx, u.cible.y + dy);
      g.stroke();
    }
    if (v.afficherPortees && u.def.portee > 0) {
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1 / v.camera.zoom;
      g.beginPath(); g.arc(u.x, u.y, bb.porteeEffective(u), 0, Math.PI * 2); g.stroke();
    }
  }

  function dessinerEffets(g, b) {
    for (const e of b.effets) {
      const k = e.duree > 9000 ? 0 : e.t / e.duree;
      if (e.type === 'fumee') {
        g.fillStyle = `rgba(226,226,220,${0.30 * (1 - k)})`;
        g.beginPath(); g.arc(e.x, e.y, e.taille * (1 + k * 1.6), 0, Math.PI * 2); g.fill();
      } else if (e.type === 'salve') {
        g.strokeStyle = `rgba(255,220,140,${0.8 * (1 - k)})`;
        g.lineWidth = 2;
        g.beginPath(); g.arc(e.x, e.y, 6 + k * 10, e.angle - 0.6, e.angle + 0.6); g.stroke();
      } else if (e.type === 'canon') {
        g.fillStyle = `rgba(255,210,120,${0.85 * (1 - k)})`;
        g.beginPath();
        g.moveTo(e.x, e.y);
        g.arc(e.x, e.y, 22 * (0.4 + k), e.angle - 0.28, e.angle + 0.28);
        g.closePath(); g.fill();
      } else if (e.type === 'impact') {
        g.fillStyle = `rgba(120,100,80,${0.7 * (1 - k)})`;
        g.beginPath(); g.arc(e.x, e.y, 3 + k * 9, 0, Math.PI * 2); g.fill();
      } else if (e.type === 'explosion') {
        g.fillStyle = `rgba(255,170,60,${0.85 * (1 - k)})`;
        g.beginPath(); g.arc(e.x, e.y, 6 + k * 26, 0, Math.PI * 2); g.fill();
      } else if (e.type === 'poussiere') {
        g.fillStyle = `rgba(170,150,120,${0.45 * (1 - k)})`;
        g.beginPath(); g.arc(e.x, e.y, e.taille * (1 + k * 2.2), 0, Math.PI * 2); g.fill();
      } else if (e.type === 'melee') {
        g.strokeStyle = `rgba(255,255,255,${0.5 * (1 - k)})`;
        g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(e.x - 5, e.y - 4); g.lineTo(e.x + 5, e.y + 4); g.stroke();
      } else if (e.type === 'choc') {
        g.strokeStyle = `rgba(255,230,180,${0.8 * (1 - k)})`;
        g.lineWidth = 3 * (1 - k);
        g.beginPath(); g.arc(e.x, e.y, 10 + k * 40, 0, Math.PI * 2); g.stroke();
      }
    }
  }

  /* --------------------------------------------------------------- HUD */

  function dessinerHud(v, g) {
    const b = v.b;
    // Mini-carte en haut à droite
    const T = G.bataille;
    const mw = 168, mh = mw * T.TERRAIN_H / T.TERRAIN_W;
    const mx = v.largeur - mw - 14, my = 14;
    g.fillStyle = 'rgba(10,12,10,0.86)';
    g.fillRect(mx - 3, my - 3, mw + 6, mh + 6);
    g.fillStyle = 'rgba(110,130,90,0.22)';
    g.fillRect(mx, my, mw, mh);
    g.strokeStyle = 'rgba(200,190,160,0.35)'; g.lineWidth = 1;
    g.strokeRect(mx - 3, my - 3, mw + 6, mh + 6);
    const sx = mw / T.TERRAIN_W, sy = mh / T.TERRAIN_H;
    const bb = B();
    for (const u of b.unites) {
      if (!bb.vivants(u) || u.sorti) continue;
      g.fillStyle = u.camp === v.camp ? '#8fd08a' : '#d07a6a';
      g.fillRect(mx + u.x * sx - 1.5, my + u.y * sy - 1.5, 3, 3);
    }
    // cadre de la vue
    const c0 = versMonde(v, 0, 0), c1 = versMonde(v, v.largeur, v.hauteur);
    const rx0 = U.clamp(c0.x, 0, T.TERRAIN_W), ry0 = U.clamp(c0.y, 0, T.TERRAIN_H);
    const rx1 = U.clamp(c1.x, 0, T.TERRAIN_W), ry1 = U.clamp(c1.y, 0, T.TERRAIN_H);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1;
    g.strokeRect(mx + rx0 * sx, my + ry0 * sy, (rx1 - rx0) * sx, (ry1 - ry0) * sy);

    // Message éphémère
    if (v.messageFlash) {
      v.messageFlash.t += 1 / 60;
      if (v.messageFlash.t > 1.6) v.messageFlash = null;
      else {
        g.font = '600 15px Georgia'; g.textAlign = 'center';
        g.fillStyle = `rgba(255,240,200,${1 - v.messageFlash.t / 1.6})`;
        g.fillText(v.messageFlash.texte, v.largeur / 2, 44);
      }
    }
  }

  G.vueBataille = {
    creerVue, dessiner, ajusterTaille, versMonde, versEcran, uniteSous, rendreTerrain,
  };
})(window.Grande = window.Grande || {});
