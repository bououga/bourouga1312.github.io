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
    const rng = U.makeRng(t.seed + 55);
    const contour = 'rgba(20,22,16,0.75)';

    // Palettes plates et chaudes, une par saison.
    const pal = [
      { sol: '#6f7d41', sol2: '#657338', sol3: '#7b8949', terre: '#755c3a', pierre: '#8d8a80',
        feuille: '#3f6b2e', feuilleClair: '#4f7f38', tronc: '#4a3524', eau: '#3f6f86' },
      { sol: '#7b8340', sol2: '#6e7638', sol3: '#88904c', terre: '#846741', pierre: '#918e84',
        feuille: '#3a6529', feuilleClair: '#4b7a34', tronc: '#4a3524', eau: '#427490' },
      { sol: '#8a7d42', sol2: '#7c703a', sol3: '#968a4e', terre: '#8a6a3e', pierre: '#8f8b80',
        feuille: '#8a5a20', feuilleClair: '#a4712a', tronc: '#4a3524', eau: '#436a80' },
      { sol: '#b3bcc0', sol2: '#a1abb0', sol3: '#c9d2d4', terre: '#8a8279', pierre: '#8e8c88',
        feuille: '#3b4a3a', feuilleClair: '#d2dcda', tronc: '#3a3026', eau: '#557c92' },
    ][t.saison || 0];

    g.fillStyle = pal.sol;
    g.fillRect(0, 0, c.width, c.height);

    // Le sol est fait de petites dalles légèrement différentes : c'est ce qui
    // donne sa matière au terrain sans le charger de détails.
    const dalle = 20;
    for (let y = 0; y < T.TERRAIN_H; y += dalle) {
      for (let x = 0; x < T.TERRAIN_W; x += dalle) {
        const r = rng();
        if (r < 0.30) g.fillStyle = pal.sol2;
        else if (r < 0.58) g.fillStyle = pal.sol3;
        else continue;
        g.globalAlpha = 0.08 + rng() * 0.10;
        g.fillRect(x, y, dalle, dalle);
      }
    }
    // Grain fin par-dessus les dalles : le sol cesse d'être un damier.
    for (let y = 0; y < T.TERRAIN_H; y += 5) {
      for (let x = 0; x < T.TERRAIN_W; x += 5) {
        const r = rng();
        if (r > 0.45) continue;
        g.fillStyle = r < 0.22 ? pal.sol2 : pal.sol3;
        g.globalAlpha = 0.10 + rng() * 0.12;
        g.fillRect(x, y, 5, 5);
      }
    }
    // Variation lente par-dessus : le pré n'est pas un damier régulier.
    for (let i = 0; i < 26; i++) {
      const x = rng() * T.TERRAIN_W, y = rng() * T.TERRAIN_H, r = 70 + rng() * 180;
      const d = g.createRadialGradient(x, y, 0, x, y, r);
      d.addColorStop(0, rng() < 0.5 ? 'rgba(255,250,210,0.06)' : 'rgba(40,50,25,0.07)');
      d.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 1; g.fillStyle = d;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;

    // Relief : ombrage doux, juste assez pour lire les pentes.
    const ech = 8;
    const oc = document.createElement('canvas');
    oc.width = Math.ceil(T.TERRAIN_W / ech); oc.height = Math.ceil(T.TERRAIN_H / ech);
    const og = oc.getContext('2d');
    const img = og.createImageData(oc.width, oc.height);
    for (let j = 0; j < oc.height; j++) {
      for (let i = 0; i < oc.width; i++) {
        const x = i * ech, y = j * ech;
        const h = T.altitude(t, x, y);
        const pente = ((T.altitude(t, x + ech, y) - h) + (T.altitude(t, x, y + ech) - h)) / ech;
        const k = (j * oc.width + i) * 4;
        const clair = pente < 0;
        img.data[k] = clair ? 255 : 20;
        img.data[k + 1] = clair ? 246 : 24;
        img.data[k + 2] = clair ? 208 : 16;
        img.data[k + 3] = Math.min(70, Math.abs(pente) * 190);
      }
    }
    og.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(oc, 0, 0, T.TERRAIN_W, T.TERRAIN_H);

    // Plaques de terre nue et de cailloux, aux contours irréguliers.
    const cheminTache = (cx, cy, r) => {
      g.beginPath();
      const n = 13;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = r * (0.65 + 0.45 * Math.abs(Math.sin(a * 2.7 + cx * 0.05)));
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.8;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
    };
    const tache = (cx, cy, r, couleur, alpha) => {
      g.save();
      g.globalAlpha = alpha;
      g.fillStyle = couleur;
      cheminTache(cx, cy, r);
      g.fill();
      g.restore();
    };
    for (const ch of t.champs) ch.rayon = Math.max(ch.w, ch.h) * 0.45;
    for (const ch of t.champs) tache(ch.x, ch.y, ch.rayon, pal.terre, 0.55);
    for (let i = 0; i < 16; i++) {
      tache(rng() * T.TERRAIN_W, rng() * T.TERRAIN_H, 20 + rng() * 45, pal.terre, 0.22);
    }

    // Sillons sur les champs, découpés au contour de la parcelle.
    for (const ch of t.champs) {
      g.save();
      cheminTache(ch.x, ch.y, ch.rayon);
      g.clip();
      g.translate(ch.x, ch.y); g.rotate(ch.a);
      g.globalAlpha = 0.3;
      g.strokeStyle = 'rgba(52,40,24,0.9)'; g.lineWidth = 1.5;
      const demi = ch.rayon * 1.3;
      for (let x = -demi; x < demi; x += 8) {
        g.beginPath(); g.moveTo(x, -demi); g.lineTo(x, demi); g.stroke();
      }
      g.restore();
    }
    g.globalAlpha = 1;

    // La rivière : bande plate, berge marquée, reflet clair au milieu.
    if (t.riviere) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = pal.terre; g.lineWidth = t.riviere.largeur + 10;
      traceLigne(g, t.riviere.pts); g.stroke();
      g.strokeStyle = contour; g.lineWidth = t.riviere.largeur + 3;
      traceLigne(g, t.riviere.pts); g.stroke();
      g.strokeStyle = pal.eau; g.lineWidth = t.riviere.largeur;
      traceLigne(g, t.riviere.pts); g.stroke();
      g.strokeStyle = 'rgba(210,235,245,0.22)'; g.lineWidth = t.riviere.largeur * 0.3;
      traceLigne(g, t.riviere.pts); g.stroke();
    }

    // Les arbres : houppier rond, cerné de noir, avec une ombre décalée.
    const arbre = (x, y, r) => {
      g.fillStyle = 'rgba(16,20,12,0.30)';
      g.beginPath(); g.ellipse(x + r * 0.35, y + r * 0.45, r * 0.95, r * 0.8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = pal.feuille;
      g.strokeStyle = contour; g.lineWidth = 1.2;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = pal.feuilleClair;
      g.beginPath(); g.arc(x - r * 0.28, y - r * 0.3, r * 0.55, 0, Math.PI * 2); g.fill();
      g.fillStyle = pal.tronc;
      g.beginPath(); g.arc(x + r * 0.05, y + r * 0.1, r * 0.17, 0, Math.PI * 2); g.fill();
    };

    for (const bo of t.bosquets) {
      // Litière sous le bois, puis les arbres un par un.
      tache(bo.x, bo.y, bo.r * 1.05, pal.terre, 0.30);
      const n = Math.round(bo.r * 0.30);
      const places = [];
      for (let i = 0; i < n * 5 && places.length < n; i++) {
        const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * bo.r;
        const x = bo.x + Math.cos(a) * rr, y = bo.y + Math.sin(a) * rr;
        if (places.some((q) => U.dist2(q[0], q[1], x, y) < 150)) continue;
        places.push([x, y]);
      }
      places.sort((a, b) => a[1] - b[1]);
      for (const [x, y] of places) arbre(x, y, 7 + rng() * 5);
    }

    // Quelques rochers isolés.
    for (let i = 0; i < 14; i++) {
      const x = rng() * T.TERRAIN_W, y = rng() * T.TERRAIN_H, r = 4 + rng() * 5;
      g.fillStyle = 'rgba(16,20,12,0.28)';
      g.beginPath(); g.ellipse(x + r * 0.4, y + r * 0.4, r, r * 0.8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = pal.pierre; g.strokeStyle = contour; g.lineWidth = 1.1;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const rr = r * (0.75 + rng() * 0.4);
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.85;
        if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.25, r * 0.4, r * 0.3, 0, 0, Math.PI * 2); g.fill();
    }

    // Le hameau : toits plats, murs clairs, contour net.
    for (const bt of t.batiments) {
      g.save(); g.translate(bt.x, bt.y); g.rotate(bt.a);
      g.fillStyle = 'rgba(16,20,12,0.32)';
      g.fillRect(-bt.w / 2 + 3, -bt.h / 2 + 3.5, bt.w, bt.h);
      g.fillStyle = '#c9b492'; g.strokeStyle = contour; g.lineWidth = 1.3;
      g.fillRect(-bt.w / 2, -bt.h / 2, bt.w, bt.h);
      g.strokeRect(-bt.w / 2, -bt.h / 2, bt.w, bt.h);
      g.fillStyle = '#9a5138';
      g.fillRect(-bt.w / 2, -bt.h / 2, bt.w, bt.h * 0.46);
      g.strokeRect(-bt.w / 2, -bt.h / 2, bt.w, bt.h * 0.46);
      g.restore();
    }

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

    // Corps au sol : une tache sombre et un point rouge, pour lire où la ligne a saigné.
    for (const e of b.effets) {
      if (e.type !== 'corps') continue;
      g.fillStyle = 'rgba(46,34,26,0.5)';
      g.beginPath(); g.ellipse(e.x, e.y, 2.6, 1.8, e.x % 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(112,32,26,0.4)';
      g.beginPath(); g.arc(e.x + 0.6, e.y + 0.4, 1.1, 0, Math.PI * 2); g.fill();
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

  /* ------------------------------------------------- silhouettes des hommes
     Les hommes sont dessinés une fois par couleur et par orientation dans de
     petits canevas, puis simplement recopiés : une ligne de cent vingt hommes
     ne coûte alors qu'une centaine de copies d'image. */

  const NB_ORIENTATIONS = 24;
  const SPRITE_PX = 48;
  const SPRITE_M = 7.6;             // ce que représente le canevas, en mètres
  const SPRITE_CAV_M = 11.4;
  const cacheSprites = {};

  function sprite(couleur, genre, indexAngle) {
    const clef = couleur + '|' + genre + '|' + indexAngle;
    let c = cacheSprites[clef];
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = SPRITE_PX;
    const g = c.getContext('2d');
    g.translate(SPRITE_PX / 2, SPRITE_PX / 2);
    g.rotate((indexAngle / NB_ORIENTATIONS) * Math.PI * 2);
    dessinerSilhouette(g, couleur, genre);
    cacheSprites[clef] = c;
    return c;
  }

  const PEAU = '#e0ab7d';

  function dessinerSilhouette(g, couleur, genre) {
    const sombre = teinter(couleur, -0.45);
    const clair = teinter(couleur, 0.18);
    const contour = 'rgba(18,16,14,0.85)';
    g.lineJoin = 'round'; g.lineCap = 'round';

    // Ombre portée, décalée vers le bas à droite comme tout le reste du décor.
    g.fillStyle = 'rgba(16,20,12,0.32)';
    g.beginPath();
    g.ellipse(1.6, 2.4, genre === 'cavalier' ? 12 : 7.5, genre === 'cavalier' ? 6 : 6.5, 0, 0, Math.PI * 2);
    g.fill();

    if (genre === 'cavalier') {
      // Le cheval, vu de dessus : croupe, encolure, tête.
      g.fillStyle = '#6b4a30'; g.strokeStyle = contour; g.lineWidth = 1.1;
      g.beginPath(); g.ellipse(-1, 0, 11, 5, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(9, 0, 3.4, 2.6, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#4a3220';
      g.beginPath(); g.ellipse(-10.5, 0, 2.6, 2.2, 0, 0, Math.PI * 2); g.fill();
      // Le cavalier.
      g.fillStyle = couleur; g.strokeStyle = contour; g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(-0.5, 0, 5.2, 4.4, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = clair;
      g.beginPath(); g.ellipse(-1.6, -1.4, 3, 2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = PEAU; g.strokeStyle = contour; g.lineWidth = 1;
      g.beginPath(); g.arc(1.6, 0, 3.2, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = sombre;
      g.beginPath(); g.moveTo(4.6, 0); g.lineTo(-0.4, -3.4); g.lineTo(-0.4, 3.4); g.closePath(); g.fill();
      // Le sabre.
      g.strokeStyle = '#cfd4d8'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(1, 5); g.lineTo(7.5, 9.5); g.stroke();
      return;
    }

    // Fantassin : les épaules d'abord, la tête ensuite, puis le fusil.
    g.fillStyle = couleur; g.strokeStyle = contour; g.lineWidth = 1.2;
    g.beginPath(); g.ellipse(-1, 0, 6, 7, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = clair;
    g.beginPath(); g.ellipse(-2, -2, 3.4, 3.6, 0, 0, Math.PI * 2); g.fill();
    // Buffleteries croisées.
    g.strokeStyle = 'rgba(238,232,214,0.75)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(-5, -4.5); g.lineTo(2, 3); g.stroke();

    g.fillStyle = PEAU; g.strokeStyle = contour; g.lineWidth = 1;
    g.beginPath(); g.arc(2.4, 0, 3.6, 0, Math.PI * 2); g.fill(); g.stroke();

    if (genre === 'officier') {
      g.fillStyle = '#d8c46a'; g.strokeStyle = contour; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(6, 0); g.lineTo(-0.6, -4.4); g.lineTo(-0.6, 4.4); g.closePath();
      g.fill(); g.stroke();
      g.fillStyle = '#e8e2d0';
      g.beginPath(); g.ellipse(-1, -4.6, 2.2, 1.4, 0, 0, Math.PI * 2); g.fill();
    } else {
      // Tricorne.
      g.fillStyle = sombre; g.strokeStyle = contour; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(6.2, 0); g.lineTo(-0.4, -4.2); g.lineTo(-0.4, 4.2); g.closePath();
      g.fill(); g.stroke();
    }

    if (genre !== 'canonnier') {
      g.strokeStyle = '#3a2c1e'; g.lineWidth = 1.7;
      g.beginPath(); g.moveTo(1, -5.4); g.lineTo(13.5, -7.2); g.stroke();
      g.strokeStyle = '#c8ccd0'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(13.5, -7.2); g.lineTo(17.4, -7.8); g.stroke();
    }
  }

  function indexOrientation(angle) {
    let i = Math.round((angle / (Math.PI * 2)) * NB_ORIENTATIONS) % NB_ORIENTATIONS;
    if (i < 0) i += NB_ORIENTATIONS;
    return i;
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
      const genre = u.general ? 'officier' : (monte ? 'cavalier' : (u.def.canon ? 'canonnier' : 'soldat'));
      // Tous les hommes d'un régiment regardent dans la même direction : une seule
      // silhouette suffit pour toute l'unité.
      const img = sprite(couleur, genre, indexOrientation(u.angle));
      const taille = monte ? SPRITE_CAV_M : SPRITE_M;
      const demi = taille / 2;
      const cos = Math.cos(u.angle), sin = Math.sin(u.angle);
      for (const s of u.soldats) {
        if (!s.vivant) continue;
        g.drawImage(img, s.x - demi, s.y - demi, taille, taille);
        if (s.feu > 0) {
          g.fillStyle = 'rgba(255,228,150,0.95)';
          g.beginPath(); g.arc(s.x + cos * 3.2, s.y + sin * 3.2, 1.5, 0, Math.PI * 2); g.fill();
          s.feu -= 0.02;
        }
      }
      if (u.def.canon) {
        const pieces = u.def.pieces || 4;
        for (let i = 0; i < pieces; i++) {
          const dec = (i - (pieces - 1) / 2) * 12;
          const dx = Math.cos(u.angle + Math.PI / 2) * dec, dy = Math.sin(u.angle + Math.PI / 2) * dec;
          g.save();
          g.translate(u.x + dx, u.y + dy); g.rotate(u.angle);
          g.fillStyle = 'rgba(16,20,12,0.32)';
          g.beginPath(); g.ellipse(1.5, 2, 8, 4.5, 0, 0, Math.PI * 2); g.fill();
          g.strokeStyle = 'rgba(18,16,14,0.85)'; g.lineWidth = 0.9;
          g.fillStyle = '#7a5a3a';                       // l'affût
          g.beginPath(); g.moveTo(-7, -2.6); g.lineTo(3, -2.2); g.lineTo(3, 2.2); g.lineTo(-7, 2.6); g.closePath();
          g.fill(); g.stroke();
          g.fillStyle = '#2b3136';                       // le tube
          g.beginPath(); g.moveTo(-1, -1.5); g.lineTo(9.5, -1.1); g.lineTo(9.5, 1.1); g.lineTo(-1, 1.5); g.closePath();
          g.fill(); g.stroke();
          g.fillStyle = '#5c4630';                       // les roues
          g.beginPath(); g.arc(-1.5, -3.6, 2.8, 0, Math.PI * 2); g.fill(); g.stroke();
          g.beginPath(); g.arc(-1.5, 3.6, 2.8, 0, Math.PI * 2); g.fill(); g.stroke();
          g.restore();
        }
      }
    }

    // Trait au sol : bleu pour vos régiments, rouge pour l'adversaire. C'est ce
    // qui permet de distinguer les deux camps d'un seul regard.
    {
      g.save();
      g.translate(u.x, u.y); g.rotate(u.angle);
      const l = bb.largeurUnite(u) / 2, p = bb.profondeurUnite(u) / 2;
      g.strokeStyle = u.camp === v.camp ? 'rgba(120,180,240,0.55)' : 'rgba(224,96,74,0.6)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(-p - 2, -l - 1.5); g.lineTo(-p - 2, l + 1.5);
      g.stroke();
      g.restore();
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

    g.fillStyle = u.camp === v.camp ? '#6ba3e0' : '#d05a4a';
    g.fillRect(centre.x - w / 2 - 1, y - 3.5, w + 2, 2);
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
        // La fumée s'ouvre et se délave : deux disques imbriqués suffisent à la rendre.
        const r = e.taille * (1 + k * 1.5);
        const a = 0.34 * (1 - k) * (1 - k * 0.35);
        g.fillStyle = `rgba(228,228,222,${a * 0.55})`;
        g.beginPath(); g.arc(e.x, e.y, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = `rgba(246,246,242,${a})`;
        g.beginPath(); g.arc(e.x - r * 0.18, e.y - r * 0.18, r * 0.62, 0, Math.PI * 2); g.fill();
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
