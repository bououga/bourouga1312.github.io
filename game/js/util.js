/* Outils communs : maths, aléatoire déterministe, géométrie, Voronoï. */
(function (G) {
  'use strict';

  /* ---- Aléatoire déterministe (mulberry32) ---- */
  function makeRng(seed) {
    let a = seed >>> 0;
    const rng = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.range = (lo, hi) => lo + rng() * (hi - lo);
    rng.int = (lo, hi) => Math.floor(lo + rng() * (hi - lo + 1));
    rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
    rng.chance = (p) => rng() < p;
    return rng;
  }

  /* ---- Maths ---- */
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

  /** Différence d'angle repliée dans [-PI, PI]. */
  function angleDiff(a, b) {
    let d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /** Rapproche `from` de `to` d'au plus `maxStep` radians. */
  function turnToward(from, to, maxStep) {
    const d = angleDiff(to, from);
    if (Math.abs(d) <= maxStep) return to;
    return from + Math.sign(d) * maxStep;
  }

  /* ---- Géométrie ---- */
  function polyCentroid(pts) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const f = p[0] * q[1] - q[0] * p[1];
      a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f;
    }
    if (Math.abs(a) < 1e-9) return [pts[0][0], pts[0][1]];
    a *= 0.5;
    return [cx / (6 * a), cy / (6 * a)];
  }

  function polyArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2;
  }

  function pointInPoly(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /**
   * Découpe un polygone convexe par le demi-plan { p | (p-c)·n <= 0 }.
   * Renvoie le polygone restant, ou null si tout est coupé.
   */
  function clipHalfPlane(poly, nx, ny, c) {
    const out = [];
    const side = (p) => nx * p[0] + ny * p[1] - c;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const sp = side(p), sq = side(q);
      if (sp <= 0) out.push(p);
      if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
        const t = sp / (sp - sq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    return out.length >= 3 ? out : null;
  }

  /**
   * Diagramme de Voronoï borné par un rectangle, par découpe en demi-plans.
   * Lent en O(n²) mais exact et robuste — on l'appelle une seule fois au chargement.
   * Renvoie { cells: [[x,y]...], neighbors: [Set] }.
   */
  function voronoi(sites, w, h) {
    const cells = [], neighbors = [];
    for (let i = 0; i < sites.length; i++) {
      let poly = [[0, 0], [w, 0], [w, h], [0, h]];
      const nb = new Set();
      for (let j = 0; j < sites.length && poly; j++) {
        if (i === j) continue;
        const dx = sites[j][0] - sites[i][0];
        const dy = sites[j][1] - sites[i][1];
        const mx = (sites[i][0] + sites[j][0]) / 2;
        const my = (sites[i][1] + sites[j][1]) / 2;
        const before = poly.length;
        const clipped = clipHalfPlane(poly, dx, dy, dx * mx + dy * my);
        if (clipped && (clipped.length !== before || !samePoly(poly, clipped))) nb.add(j);
        poly = clipped;
      }
      cells.push(poly || []);
      neighbors.push(nb);
    }
    // Un voisinage n'est réel que si l'arête survit au découpage final : on revalide
    // en cherchant deux sommets partagés entre les deux cellules.
    const real = sites.map(() => new Set());
    for (let i = 0; i < sites.length; i++) {
      for (const j of neighbors[i]) {
        if (j < i) continue;
        if (sharedEdge(cells[i], cells[j])) { real[i].add(j); real[j].add(i); }
      }
    }
    return { cells, neighbors: real };
  }

  function samePoly(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i][0] - b[i][0]) > 1e-6 || Math.abs(a[i][1] - b[i][1]) > 1e-6) return false;
    }
    return true;
  }

  function sharedEdge(a, b) {
    if (!a.length || !b.length) return false;
    let shared = 0;
    for (const p of a) {
      for (const q of b) {
        if (dist2(p[0], p[1], q[0], q[1]) < 1.0) { shared++; break; }
      }
      if (shared >= 2) return true;
    }
    return false;
  }

  /** Arrondit les angles d'un polygone (coupe de coin itérative, façon Chaikin). */
  function smoothPoly(pts, iterations) {
    let cur = pts;
    for (let k = 0; k < iterations; k++) {
      const next = [];
      for (let i = 0; i < cur.length; i++) {
        const p = cur[i], q = cur[(i + 1) % cur.length];
        next.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25]);
        next.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
      }
      cur = next;
    }
    return cur;
  }

  /** Bruite le contour d'un polygone pour casser l'aspect « Voronoï ». */
  function jitterPoly(pts, amp, rng) {
    return pts.map((p) => [p[0] + rng.range(-amp, amp), p[1] + rng.range(-amp, amp)]);
  }

  /* ---- Divers ---- */
  function formatNumber(n) {
    const v = Math.round(n);
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function formatSigned(n) {
    const v = Math.round(n);
    return (v > 0 ? '+' : '') + formatNumber(v);
  }

  /** File de priorité binaire minimale — utilisée par le pathfinding de campagne. */
  class MinHeap {
    constructor() { this.items = []; }
    get size() { return this.items.length; }
    push(item, prio) {
      this.items.push({ item, prio });
      let i = this.items.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (this.items[p].prio <= this.items[i].prio) break;
        [this.items[p], this.items[i]] = [this.items[i], this.items[p]];
        i = p;
      }
    }
    pop() {
      const top = this.items[0];
      const last = this.items.pop();
      if (this.items.length) {
        this.items[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < this.items.length && this.items[l].prio < this.items[m].prio) m = l;
          if (r < this.items.length && this.items[r].prio < this.items[m].prio) m = r;
          if (m === i) break;
          [this.items[m], this.items[i]] = [this.items[i], this.items[m]];
          i = m;
        }
      }
      return top ? top.item : undefined;
    }
  }

  G.util = {
    makeRng, clamp, lerp, dist, dist2, angleDiff, turnToward,
    polyCentroid, polyArea, pointInPoly, clipHalfPlane, voronoi,
    smoothPoly, jitterPoly, formatNumber, formatSigned, MinHeap,
  };
})(window.Grande = window.Grande || {});
