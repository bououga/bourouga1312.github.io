/* Rendu et pilotage de la carte de campagne.
   La carte est dessinée une fois dans un canevas hors écran, puis recomposée
   à chaque image avec les armées, la sélection et les tracés de marche. */
(function (G) {
  'use strict';

  const U = G.util;
  const W = G.world;
  const A = G.army;
  const K = () => G.campagne;

  function creerVue(canvas, etat) {
    const v = {
      canvas, ctx: canvas.getContext('2d'), etat,
      camera: { x: W.MAP_W / 2, y: W.MAP_H / 2, zoom: 0.75 },
      fond: null, fondSale: true,
      survol: null, selection: null, armeeSelection: null,
      cheminApercu: null,
      souris: { x: 0, y: 0, glisse: false, x0: 0, y0: 0, deplace: false },
      temps: 0,
      onSelection: null,
      onFinTour: null,
    };
    ajusterTaille(v);
    brancherEntrees(v);
    return v;
  }

  function ajusterTaille(v) {
    const r = v.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    v.canvas.width = Math.max(320, Math.round(r.width * dpr));
    v.canvas.height = Math.max(240, Math.round(r.height * dpr));
    v.dpr = dpr;
    v.largeur = r.width; v.hauteur = r.height;
    v.zoomMin = Math.max(0.28, Math.min(r.width / W.MAP_W, r.height / W.MAP_H) * 0.9);
    v.camera.zoom = Math.max(v.camera.zoom, v.zoomMin);
    // La fenêtre a changé de taille : la caméra doit revenir dans les bornes.
    if (v.largeur > 0) contraindreCamera(v);
  }

  function versEcran(v, x, y) {
    return {
      x: (x - v.camera.x) * v.camera.zoom + v.largeur / 2,
      y: (y - v.camera.y) * v.camera.zoom + v.hauteur / 2,
    };
  }
  function versMonde(v, x, y) {
    return {
      x: (x - v.largeur / 2) / v.camera.zoom + v.camera.x,
      y: (y - v.hauteur / 2) / v.camera.zoom + v.camera.y,
    };
  }

  /* ------------------------------------------------------------- entrées */

  function brancherEntrees(v) {
    const c = v.canvas;
    c.addEventListener('mousedown', (e) => {
      const p = pos(v, e);
      v.souris.glisse = true; v.souris.deplace = false;
      v.souris.x0 = p.x; v.souris.y0 = p.y;
      v.souris.camX = v.camera.x; v.souris.camY = v.camera.y;
      v.souris.bouton = e.button;
    });
    window.addEventListener('mouseup', (e) => {
      if (!v.souris.glisse) return;
      v.souris.glisse = false;
      if (v.souris.deplace) return;
      const p = pos(v, e);
      const m = versMonde(v, p.x, p.y);
      const prov = provinceSous(v, m.x, m.y);
      if (e.button === 2) clicDroit(v, prov, m);
      else clicGauche(v, prov, m);
    });
    c.addEventListener('mousemove', (e) => {
      const p = pos(v, e);
      v.souris.x = p.x; v.souris.y = p.y;
      if (v.souris.glisse) {
        const dx = p.x - v.souris.x0, dy = p.y - v.souris.y0;
        if (Math.abs(dx) + Math.abs(dy) > 5) v.souris.deplace = true;
        if (v.souris.deplace) {
          v.camera.x = v.souris.camX - dx / v.camera.zoom;
          v.camera.y = v.souris.camY - dy / v.camera.zoom;
          contraindreCamera(v);
        }
        return;
      }
      const m = versMonde(v, p.x, p.y);
      const prov = provinceSous(v, m.x, m.y);
      v.survol = prov ? prov.id : null;
      majApercuChemin(v, prov);
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = pos(v, e);
      const avant = versMonde(v, p.x, p.y);
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      v.camera.zoom = U.clamp(v.camera.zoom * f, v.zoomMin, 3.2);
      const apres = versMonde(v, p.x, p.y);
      v.camera.x += avant.x - apres.x;
      v.camera.y += avant.y - apres.y;
      contraindreCamera(v);
    }, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function pos(v, e) {
    const r = v.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function contraindreCamera(v) {
    const demiL = v.largeur / 2 / v.camera.zoom;
    const demiH = v.hauteur / 2 / v.camera.zoom;
    v.camera.x = U.clamp(v.camera.x, Math.min(demiL, W.MAP_W / 2), Math.max(W.MAP_W - demiL, W.MAP_W / 2));
    v.camera.y = U.clamp(v.camera.y, Math.min(demiH, W.MAP_H / 2), Math.max(W.MAP_H - demiH, W.MAP_H / 2));
  }

  function provinceSous(v, x, y) {
    for (const id of v.etat.ordreProvinces) {
      const p = v.etat.provinces[id];
      if (U.pointInPoly(x, y, p.poly)) return p;
    }
    return null;
  }

  function armeeSous(v, x, y) {
    let best = null, bd = 26 / v.camera.zoom;
    for (const a of v.etat.armees) {
      const p = positionArmee(v.etat, a);
      const d = U.dist(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  /** Décale les armées empilées sur une même province pour qu'elles restent lisibles. */
  function positionArmee(etat, armee) {
    const prov = etat.provinces[armee.province];
    const memeCase = etat.armees.filter((a) => a.province === armee.province);
    const i = memeCase.indexOf(armee);
    const n = memeCase.length;
    const base = { x: prov.x + (prov.capitaleNationale ? 12 : 0), y: prov.y + 6 };
    if (n <= 1) return base;
    const angle = (i / n) * Math.PI * 2;
    return { x: base.x + Math.cos(angle) * 19, y: base.y + Math.sin(angle) * 14 };
  }

  function clicGauche(v, prov, m) {
    const armee = armeeSous(v, m.x, m.y);
    if (armee && armee.nation === v.etat.joueur) {
      v.armeeSelection = armee;
      v.selection = armee.province;
    } else if (prov) {
      v.selection = prov.id;
      if (!armee) v.armeeSelection = null;
    } else {
      v.selection = null; v.armeeSelection = null;
    }
    if (v.onSelection) v.onSelection(v.selection, v.armeeSelection);
  }

  function clicDroit(v, prov, m) {
    if (!v.armeeSelection || v.armeeSelection.nation !== v.etat.joueur) return;
    if (!prov) return;
    const armee = v.armeeSelection;
    // Clic droit sur la province où l'on est déjà : on fusionne avec une autre armée.
    if (prov.id === armee.province) {
      const autre = v.etat.armees.find((a) => a.province === prov.id && a.nation === armee.nation && a !== armee);
      if (autre) { K().fusionnerArmees(v.etat, armee.id, autre.id); v.fondSale = true; }
      return;
    }
    const ok = K().ordonnerMarche(v.etat, armee, prov.id);
    if (!ok && v.onMessage) v.onMessage('Aucun itinéraire praticable vers ' + prov.nom + '.');
    v.cheminApercu = null;
  }

  function majApercuChemin(v, prov) {
    v.cheminApercu = null;
    if (!v.armeeSelection || !prov || v.armeeSelection.nation !== v.etat.joueur) return;
    if (prov.id === v.armeeSelection.province) return;
    const chemin = K().trouverChemin(v.etat, v.armeeSelection.province, prov.id, v.armeeSelection.nation);
    if (chemin) v.cheminApercu = chemin;
  }

  /* -------------------------------------------------------------- rendu */

  function couleurNation(etat, id) {
    const n = etat.nations[id];
    return n ? n.couleur : '#777';
  }

  function eclaircir(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = U.clamp(((n >> 16) & 255) + 255 * f, 0, 255);
    const g = U.clamp(((n >> 8) & 255) + 255 * f, 0, 255);
    const b = U.clamp((n & 255) + 255 * f, 0, 255);
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  /** Éclaircit ou assombrit une couleur hexadécimale. */
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

  const CONTOUR = 'rgba(18,20,16,0.8)';

  function dessinerFond(v) {
    const etat = v.etat;
    const c = document.createElement('canvas');
    c.width = W.MAP_W; c.height = W.MAP_H;
    const g = c.getContext('2d');
    const rng = U.makeRng(etat.seed + 313);

    /* --- la mer, à plat --- */
    g.fillStyle = '#2f5568';
    g.fillRect(0, 0, W.MAP_W, W.MAP_H);
    for (let i = 0; i < 40; i++) {
      const x = rng() * W.MAP_W, y = rng() * W.MAP_H, r = 90 + rng() * 240;
      const d = g.createRadialGradient(x, y, 0, x, y, r);
      d.addColorStop(0, rng() < 0.5 ? 'rgba(90,150,175,0.10)' : 'rgba(20,45,60,0.12)');
      d.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = d;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }

    /* --- ombre portée des terres, comme les objets du champ de bataille --- */
    const silhouette = document.createElement('canvas');
    silhouette.width = W.MAP_W; silhouette.height = W.MAP_H;
    const sg = silhouette.getContext('2d');
    sg.fillStyle = '#000';
    for (const id of etat.ordreProvinces) {
      const p = etat.provinces[id];
      if (p.poly.length) { trace(sg, p.poly); sg.fill(); }
    }
    g.save();
    g.globalAlpha = 0.45;
    g.drawImage(silhouette, 6, 8);
    g.restore();

    /* --- provinces, en aplats --- */
    for (const id of etat.ordreProvinces) {
      const p = etat.provinces[id];
      if (!p.poly.length) continue;
      trace(g, p.poly);
      g.fillStyle = teinter(couleurNation(etat, p.nation), -0.2);
      g.fill();

      g.save();
      trace(g, p.poly); g.clip();
      // Une pointe de variation pour que l'aplat ne soit pas mort.
      const b = boite(p.poly);
      for (let i = 0; i < 5; i++) {
        const x = rng.range(b.x0, b.x1), y = rng.range(b.y0, b.y1), r = 40 + rng() * 90;
        const d = g.createRadialGradient(x, y, 0, x, y, r);
        d.addColorStop(0, rng() < 0.5 ? 'rgba(255,255,230,0.12)' : 'rgba(0,0,0,0.12)');
        d.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = d;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      motifTerrain(g, p);
      g.restore();

      g.strokeStyle = 'rgba(20,22,18,0.45)';
      g.lineWidth = 1.4;
      trace(g, p.poly); g.stroke();
    }

    /* --- frontières entre nations : trait franc --- */
    for (const id of etat.ordreProvinces) {
      const p = etat.provinces[id];
      for (const vid of p.voisins) {
        const q = etat.provinces[vid];
        if (q.nation === p.nation || vid < id) continue;
        const seg = areteCommune(p.poly, q.poly);
        if (!seg) continue;
        g.strokeStyle = CONTOUR;
        g.lineWidth = 3.2;
        g.lineCap = 'round';
        g.beginPath(); g.moveTo(seg[0][0], seg[0][1]); g.lineTo(seg[1][0], seg[1][1]); g.stroke();
      }
    }

    /* --- côtes : liseré sombre autour de chaque terre --- */
    g.strokeStyle = 'rgba(16,30,38,0.55)';
    g.lineWidth = 2.4;
    for (const id of etat.ordreProvinces) {
      const p = etat.provinces[id];
      if (!p.mersAdj.length || !p.poly.length) continue;
      trace(g, p.poly); g.stroke();
    }

    v.fond = c;
    v.fondSale = false;
  }

  /** Décor de province : mêmes formes que sur le champ de bataille, en plus petit. */
  function motifTerrain(g, p) {
    const rng = U.makeRng(Math.round(p.x * 131 + p.y * 17));
    const b = boite(p.poly);
    const aire = (b.x1 - b.x0) * (b.y1 - b.y0);
    const places = (n, f) => {
      let poses = 0;
      for (let i = 0; i < n * 6 && poses < n; i++) {
        const x = rng.range(b.x0, b.x1), y = rng.range(b.y0, b.y1);
        if (!U.pointInPoly(x, y, p.poly)) continue;
        if (U.dist2(x, y, p.x, p.y) < 1900) continue;    // on laisse la place au nom et au jeton
        f(x, y); poses++;
      }
    };
    const densite = Math.max(5, Math.round(aire / 1250));

    const arbre = (x, y, r) => {
      g.fillStyle = 'rgba(12,18,10,0.30)';
      g.beginPath(); g.ellipse(x + r * 0.35, y + r * 0.4, r, r * 0.85, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3c6630'; g.strokeStyle = CONTOUR; g.lineWidth = 0.9;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#4e7d3c';
      g.beginPath(); g.arc(x - r * 0.28, y - r * 0.3, r * 0.5, 0, Math.PI * 2); g.fill();
    };
    const mont = (x, y, h) => {
      g.fillStyle = 'rgba(12,18,10,0.30)';
      g.beginPath(); g.moveTo(x - h + 2, y + h * 0.6 + 2); g.lineTo(x + 2, y - h + 2); g.lineTo(x + h + 2, y + h * 0.6 + 2); g.closePath(); g.fill();
      g.fillStyle = '#8b8378'; g.strokeStyle = CONTOUR; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(x - h, y + h * 0.6); g.lineTo(x, y - h); g.lineTo(x + h, y + h * 0.6); g.closePath();
      g.fill(); g.stroke();
      g.fillStyle = '#cfd2d0';
      g.beginPath(); g.moveTo(x - h * 0.34, y - h * 0.35); g.lineTo(x, y - h); g.lineTo(x + h * 0.34, y - h * 0.35); g.closePath(); g.fill();
    };
    const colline = (x, y, r) => {
      g.fillStyle = 'rgba(12,18,10,0.22)';
      g.beginPath(); g.ellipse(x + 1.5, y + 1.5, r, r * 0.55, 0, Math.PI, 0); g.fill();
      g.fillStyle = '#7e8a52'; g.strokeStyle = CONTOUR; g.lineWidth = 0.9;
      g.beginPath(); g.ellipse(x, y, r, r * 0.55, 0, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
    };

    if (p.terrain === 'foret') places(densite, (x, y) => arbre(x, y, 6 + rng() * 3.5));
    else if (p.terrain === 'montagne') places(Math.round(densite * 0.8), (x, y) => mont(x, y, 9 + rng() * 5));
    else if (p.terrain === 'collines') places(densite, (x, y) => colline(x, y, 8 + rng() * 4));
    else if (p.terrain === 'marais') {
      places(densite, (x, y) => {
        g.strokeStyle = 'rgba(32,62,62,0.7)'; g.lineWidth = 2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 6, y);
        g.moveTo(x - 4, y + 4.5); g.lineTo(x + 4, y + 4.5);
        g.stroke();
      });
    } else if (p.terrain === 'desert') {
      places(densite, (x, y) => {
        g.fillStyle = 'rgba(206,182,120,0.5)';
        g.beginPath(); g.ellipse(x, y, 11, 3.8, 0, 0, Math.PI * 2); g.fill();
      });
    } else {
      places(Math.round(densite * 0.7), (x, y) => {
        g.strokeStyle = 'rgba(48,66,32,0.55)'; g.lineWidth = 1.7; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x - 3.6, y + 3); g.lineTo(x - 1.6, y - 2.4);
        g.moveTo(x, y + 3); g.lineTo(x, y - 3.6);
        g.moveTo(x + 3.6, y + 3); g.lineTo(x + 1.6, y - 2.4);
        g.stroke();
      });
    }
  }

  function boite(poly) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    return { x0, y0, x1, y1 };
  }

  function areteCommune(a, b) {
    const points = [];
    for (const p of a) {
      for (const q of b) {
        if (U.dist2(p[0], p[1], q[0], q[1]) < 12) { points.push(p); break; }
      }
    }
    if (points.length < 2) return null;
    let best = null, bd = -1;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = U.dist2(points[i][0], points[i][1], points[j][0], points[j][1]);
        if (d > bd) { bd = d; best = [points[i], points[j]]; }
      }
    }
    return best;
  }

  function trace(g, poly) {
    g.beginPath();
    g.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) g.lineTo(poly[i][0], poly[i][1]);
    g.closePath();
  }

  function dessiner(v, dt) {
    v.temps += dt;
    const g = v.ctx, etat = v.etat;
    if (v.fondSale || !v.fond) dessinerFond(v);

    g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    // Au-delà des bords de la carte, on prolonge l'océan plutôt que de laisser du noir.
    g.fillStyle = '#1c2f3f';
    g.fillRect(0, 0, v.largeur, v.hauteur);
    g.save();
    g.translate(v.largeur / 2, v.hauteur / 2);
    g.scale(v.camera.zoom, v.camera.zoom);
    g.translate(-v.camera.x, -v.camera.y);

    g.imageSmoothingEnabled = true;
    g.drawImage(v.fond, 0, 0);

    // Survol et sélection
    if (v.survol && v.survol !== v.selection) surligner(g, etat.provinces[v.survol], 'rgba(255,255,255,0.13)', null);
    if (v.selection) surligner(g, etat.provinces[v.selection], 'rgba(255,240,190,0.12)', '#ffe9a8');

    // Provinces en guerre avec le joueur : liseré rouge
    for (const id of etat.ordreProvinces) {
      const p = etat.provinces[id];
      if (p.nation !== etat.joueur && K().enGuerre(etat, p.nation, etat.joueur)) {
        trace(g, p.poly);
        g.strokeStyle = 'rgba(210,60,50,0.55)';
        g.lineWidth = 2 / v.camera.zoom + 1;
        g.stroke();
      }
      if (p.capitaleNationale) dessinerCapitale(g, p, couleurNation(etat, p.nation));
      if (p.siege) {
        g.fillStyle = '#e8b93f'; g.strokeStyle = CONTOUR; g.lineWidth = 1.2;
        g.beginPath(); g.arc(p.x + 15, p.y - 15, 6.5, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = '#231a08'; g.font = 'bold 9px system-ui, sans-serif'; g.textAlign = 'center';
        g.fillText('S', p.x + 15, p.y - 11.8);
      }
    }

    // Tracé de marche
    if (v.cheminApercu && v.armeeSelection) dessinerChemin(g, v, v.cheminApercu, v.armeeSelection, 'rgba(255,235,170,0.85)');
    for (const a of etat.armees) {
      if (a.nation === etat.joueur && a.chemin && a.chemin.length) {
        dessinerChemin(g, v, a.chemin, a, 'rgba(150,220,255,0.6)');
      }
    }

    // Noms de provinces
    if (v.camera.zoom > 0.5) {
      g.textAlign = 'center';
      const taille = Math.round(11 / Math.max(0.75, v.camera.zoom) + 3.5);
      g.font = `600 ${taille}px system-ui, "Segoe UI", sans-serif`;
      g.lineJoin = 'round';
      for (const id of etat.ordreProvinces) {
        const p = etat.provinces[id];
        const y = p.y - 22;
        g.lineWidth = 4;
        g.strokeStyle = 'rgba(14,16,12,0.85)';
        g.strokeText(p.nom, p.x, y);
        g.fillStyle = '#f4f1e6';
        g.fillText(p.nom, p.x, y);
      }
    }

    // Armées
    for (const a of etat.armees) dessinerArmee(g, v, a);

    g.restore();
  }

  function surligner(g, p, remplissage, contour) {
    if (!p) return;
    trace(g, p.poly);
    g.fillStyle = remplissage; g.fill();
    if (contour) { g.strokeStyle = contour; g.lineWidth = 2.5; g.stroke(); }
  }

  function dessinerChemin(g, v, chemin, armee, couleur) {
    const etat = v.etat;
    let prev = etat.provinces[armee.province];
    g.strokeStyle = couleur;
    g.lineWidth = 2.5 / Math.max(0.6, v.camera.zoom) + 1;
    g.setLineDash([7, 6]);
    g.beginPath();
    g.moveTo(prev.x, prev.y);
    for (const id of chemin) {
      const p = etat.provinces[id];
      g.lineTo(p.x, p.y);
      prev = p;
    }
    g.stroke();
    g.setLineDash([]);
    const fin = etat.provinces[chemin[chemin.length - 1]];
    g.fillStyle = couleur;
    g.beginPath(); g.arc(fin.x, fin.y, 4.5, 0, Math.PI * 2); g.fill();
  }

  /** Petite icône de ville pour les capitales. */
  function dessinerCapitale(g, p, couleur) {
    const x = p.x - 17, y = p.y + 3;
    g.fillStyle = 'rgba(12,16,10,0.35)';
    g.fillRect(x - 7, y - 3, 16, 12);
    g.fillStyle = '#d9cdb2'; g.strokeStyle = CONTOUR; g.lineWidth = 1.2;
    g.fillRect(x - 9, y - 5, 16, 12); g.strokeRect(x - 9, y - 5, 16, 12);
    g.fillStyle = teinter(couleur, -0.3);
    g.fillRect(x - 9, y - 5, 16, 5); g.strokeRect(x - 9, y - 5, 16, 5);
    g.fillStyle = '#5b4a33';
    g.fillRect(x - 2.5, y + 2, 3.5, 5);
    g.strokeStyle = CONTOUR; g.lineWidth = 0.9;
    g.strokeRect(x - 2.5, y + 2, 3.5, 5);
  }

  function dessinerArmee(g, v, armee) {
    const etat = v.etat;
    const p = positionArmee(etat, armee);
    const couleur = couleurNation(etat, armee.nation);
    const sel = v.armeeSelection === armee;
    const r = 11;

    g.save();
    g.translate(p.x, p.y);

    // Ombre, puis le jeton lui-même.
    g.fillStyle = 'rgba(12,16,10,0.35)';
    rectArrondi(g, -r + 2.5, -r + 3.5, r * 2, r * 2, 4); g.fill();

    g.fillStyle = couleur;
    g.strokeStyle = sel ? '#ffe9a8' : CONTOUR;
    g.lineWidth = sel ? 2.4 : 1.6;
    rectArrondi(g, -r, -r, r * 2, r * 2, 4); g.fill(); g.stroke();

    // Reflet en haut à gauche, comme sur tout le reste du décor.
    g.fillStyle = 'rgba(255,255,255,0.18)';
    rectArrondi(g, -r + 1.5, -r + 1.5, r * 1.1, r * 0.8, 2.5); g.fill();

    // Symbole : deux fusils croisés pour l'infanterie, un fer à cheval pour la cavalerie.
    const cav = armee.unites.filter((u) => {
      const d = K().unitById[u.type];
      return A.CATEGORIES[d.cat].classe === 'cavalerie';
    }).length;
    const cavalerieDominante = cav > armee.unites.length / 2;
    g.strokeStyle = 'rgba(22,20,16,0.85)'; g.lineWidth = 1.8; g.lineCap = 'round';
    if (cavalerieDominante) {
      g.beginPath(); g.arc(0, 0.5, 4.6, Math.PI * 0.18, Math.PI * 0.82, true); g.stroke();
      g.beginPath(); g.moveTo(-3.6, 3.4); g.lineTo(-3.6, 5.2);
      g.moveTo(3.6, 3.4); g.lineTo(3.6, 5.2); g.stroke();
    } else {
      g.beginPath(); g.moveTo(-4.6, 4.6); g.lineTo(4.6, -4.6);
      g.moveTo(4.6, 4.6); g.lineTo(-4.6, -4.6); g.stroke();
    }

    // Effectif, sur une pastille sous le jeton.
    const hommes = K().effectif(armee);
    const texte = hommes >= 1000 ? (hommes / 1000).toFixed(1).replace('.0', '') + 'k' : String(hommes);
    g.font = '600 10px system-ui, sans-serif';
    const larg = Math.max(22, g.measureText(texte).width + 9);
    g.fillStyle = 'rgba(16,18,14,0.92)';
    rectArrondi(g, -larg / 2, r - 1, larg, 12, 3); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
    rectArrondi(g, -larg / 2, r - 1, larg, 12, 3); g.stroke();
    g.fillStyle = '#f1ede1'; g.textAlign = 'center';
    g.fillText(texte, 0, r + 8);

    if (armee.enSiege) {
      g.fillStyle = '#e8b93f'; g.strokeStyle = CONTOUR; g.lineWidth = 1.1;
      g.beginPath(); g.arc(r - 1, -r + 1, 4.4, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    g.restore();
  }

  function rectArrondi(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  /* ----------------------------------------------------------- utilitaires */

  function centrerSur(v, provId, zoom) {
    const p = v.etat.provinces[provId];
    if (!p) return;
    v.camera.x = p.x; v.camera.y = p.y;
    if (zoom) v.camera.zoom = zoom;
    contraindreCamera(v);
  }

  G.vueCampagne = {
    creerVue, dessiner, ajusterTaille, centrerSur, positionArmee,
    versEcran, versMonde, couleurNation, eclaircir,
  };
})(window.Grande = window.Grande || {});
