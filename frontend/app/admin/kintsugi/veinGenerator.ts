/**
 * Procedural kintsugi background generator. Pure TS, no DOM, deterministic for a given seed + params.
 *
 * Islands are the only shapes. The output is a solid gold canvas with a handful of dark islands on
 * top; the veins are simply the gold showing through the gaps. Each island outline is fitted with
 * smooth curves, so both edges of every vein stay clean.
 *
 * The islands come from sequential cracking, the way real pottery breaks: repeatedly take the
 * biggest island and grow a smooth crack through its middle, in both directions, until each end
 * runs into an older crack (or the canvas edge). That gives T-junctions instead of Voronoi-style
 * Y-junctions. The island on the straight-through side of a T keeps one smooth edge, a crack that
 * arrives at an angle gives its neighbour a sharp acute tip, and older cracks are thicker than
 * newer ones, which reads like a river delta.
 *
 * Pipeline:
 *  1. Grow cracks one by one on a grid slightly bigger than the canvas.
 *  2. Rasterise each crack's width into a field; sample it through a domain warp for organic bends.
 *  3. Marching squares traces each island outline, tagged with which crack each stretch borders.
 *  4. Outlines are cut into sides at sharp tips only (where the bordering crack changes AND the
 *     outline really turns); each side is fitted with as few cubic Béziers as possible (Schneider).
 */

export const CANVAS = { width: 1376, height: 768 } as const;

export interface VeinParams {
  seed: number;
  /** About how many islands land on the canvas (5..20). */
  islands: number;
  /** 0..0.9, how strongly cracks follow `angle` instead of splitting islands evenly. */
  flow: number;
  /** Degrees, direction cracks lean toward. */
  angle: number;
  /** Domain-warp amplitude in px. Higher = curvier. */
  warp: number;
  /** Domain-warp noise scale in px. Lower = tighter bends. */
  warpScale: number;
  /** Typical vein width in px. */
  veinWidth: number;
  /** 0..1, how much thicker the first cracks are than the last ones. */
  hierarchy: number;
  /** 0..0.8, random per-crack width and slow swelling along each crack. */
  widthVariation: number;
  /** Island sides shorter than this (px) are absorbed into their neighbours: fewer, cleaner tips. */
  tipMerge: number;
  /** Degrees the outline must turn at a corner to stay a sharp tip; gentler corners are rounded. */
  tipAngle: number;
  /** Curve-fit tolerance in px. Higher = fewer, longer, smoother curves. */
  smoothness: number;
}

/** Slider ranges, also used to clamp incoming params (URL values included). */
export const RANGES: Record<Exclude<keyof VeinParams, 'seed'>, [number, number]> = {
  islands: [5, 20],
  flow: [0, 0.9],
  angle: [-90, 90],
  warp: [0, 90],
  warpScale: [150, 600],
  veinWidth: [2, 20],
  hierarchy: [0, 1],
  widthVariation: [0, 0.8],
  tipMerge: [10, 160],
  tipAngle: [20, 150],
  smoothness: [0.5, 4],
};

type P = [number, number];

export interface VeinResult {
  /** Island outlines only (closed Bézier loops). */
  islandsD: string;
  islands: number;
  /** Sharp tip positions, for the outline preview. */
  tips: P[];
  curves: number;
  ms: number;
}

// ── seeded randomness ────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless hash of up to 4 ints to [0, 1). */
function hash(a: number, b: number, c: number, d = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1) ^ Math.imul(d | 0, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const smooth5 = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** 2D value noise in [-1, 1]. */
function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const u = smooth5(x - ix);
  const v = smooth5(y - iy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  const top = a + (b - a) * u;
  const bot = c + (d - c) * u;
  return (top + (bot - top) * v) * 2 - 1;
}

/** Two-octave fractal noise, roughly [-1, 1]. */
function fbm(x: number, y: number, seed: number): number {
  return valueNoise(x, y, seed) * 0.72 + valueNoise(x * 2.07 + 17.3, y * 2.07 - 9.1, seed + 101) * 0.28;
}

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

export function clampParams(p: VeinParams): VeinParams {
  const out = { ...p, seed: Math.floor(Number.isFinite(p.seed) ? p.seed : 1) };
  for (const k of Object.keys(RANGES) as (keyof typeof RANGES)[]) out[k] = clamp(p[k], RANGES[k]);
  out.islands = Math.round(out.islands);
  return out;
}

// ── generator ────────────────────────────────────────────────────────────────────────────────

const RING = -1; // side id for the canvas border
const FAR = 60; // crack field value far away from any crack (deep inside an island)

export function generateVeins(input: VeinParams): VeinResult {
  const started = performance.now();
  const p = clampParams(input);
  const W = CANVAS.width;
  const H = CANVAS.height;
  const seed = p.seed;
  const rng = mulberry32(seed);

  // ── 1. grow cracks on a grid that extends M px past every canvas edge ──
  const M = Math.ceil(p.warp) + 24;
  const EW = W + 2 * M;
  const EH = H + 2 * M;
  const occ = new Int16Array(EW * EH); // crack id + 1 along each centreline, 0 = empty
  const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < EW && y < EH;
  const inCanvas = (x: number, y: number) => x >= M && y >= M && x < M + W && y < M + H;
  const cracks: P[][] = [];

  // Grow one half of a crack from (x, y) until it hits another crack or leaves the grid.
  const growHalf = (x0: number, y0: number, heading: number, id: number, salt: number): P[] => {
    const pts: P[] = [];
    let x = x0, y = y0, h = heading;
    for (let s = 0; s < 4000; s++) {
      // Gentle wander with a spring back to the starting direction, so cracks stay fracture-like
      // instead of curling. The domain warp adds the larger bends later.
      h += fbm(s / 90, id * 7.7 + salt, seed + 91) * 0.012 + (heading - h) * 0.02;
      const nx = x + Math.cos(h) * 2;
      const ny = y + Math.sin(h) * 2;
      pts.push([nx, ny]);
      if (!inGrid(nx, ny)) break;
      const o = occ[Math.floor(ny) * EW + Math.floor(nx)];
      if (o !== 0 && o !== id + 1) break; // ran into an older crack: T-junction
      x = nx;
      y = ny;
    }
    return pts;
  };

  const markCrack = (pts: P[], id: number) => {
    for (const [x, y] of pts) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const gx = Math.floor(x) + dx, gy = Math.floor(y) + dy;
          if (inGrid(gx, gy) && occ[gy * EW + gx] === 0) occ[gy * EW + gx] = id + 1;
        }
      }
    }
  };

  // Flood-fill the canvas's empty regions. Returns how many real islands exist, plus the biggest
  // one's centroid, covariance and 50 random interior points (taken straight from the fill queue,
  // so no extra passes over the grid).
  const label = new Int32Array(EW * EH);
  const queue = new Int32Array(W * H);
  const findLargest = () => {
    label.fill(0);
    let count = 0, bestArea = 0, islands = 0;
    let best = { mx: 0, my: 0, cxx: 0, cyy: 0, cxy: 0, candidates: [] as P[] };
    for (let gy = M; gy < M + H; gy++) {
      for (let gx = M; gx < M + W; gx++) {
        const start = gy * EW + gx;
        if (occ[start] || label[start]) continue;
        const lab = ++count;
        let head = 0, tail = 0, area = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
        queue[tail++] = start;
        label[start] = lab;
        while (head < tail) {
          const c = queue[head++];
          area++;
          const cx = c % EW, cy = (c - cx) / EW;
          sx += cx; sy += cy; sxx += cx * cx; syy += cy * cy; sxy += cx * cy;
          if (cx > M && !occ[c - 1] && !label[c - 1]) { label[c - 1] = lab; queue[tail++] = c - 1; }
          if (cx < M + W - 1 && !occ[c + 1] && !label[c + 1]) { label[c + 1] = lab; queue[tail++] = c + 1; }
          if (cy > M && !occ[c - EW] && !label[c - EW]) { label[c - EW] = lab; queue[tail++] = c - EW; }
          if (cy < M + H - 1 && !occ[c + EW] && !label[c + EW]) { label[c + EW] = lab; queue[tail++] = c + EW; }
        }
        if (area > 1500) islands++;
        if (area > bestArea) {
          bestArea = area;
          const mx = sx / area, my = sy / area;
          const candidates: P[] = [];
          for (let k = 0; k < 50; k++) {
            const c = queue[Math.floor(rng() * tail)];
            const x = c % EW;
            candidates.push([x, (c - x) / EW]);
          }
          best = { mx, my, cxx: sxx / area - mx * mx, cyy: syy / area - my * my, cxy: sxy / area - mx * my, candidates };
        }
      }
    }
    return { best, found: bestArea > 0, islands };
  };

  for (let attempt = 0; attempt < 60; attempt++) {
    const { best, found, islands } = findLargest();
    if (islands >= p.islands || !found) break;

    // shape of the biggest island: covariance -> its long axis
    const { mx, my, cxx, cyy, cxy, candidates } = best;
    const major = 0.5 * Math.atan2(2 * cxy, cxx - cyy);

    // start where the island is widest: the candidate with the most clearance in every direction
    let sx = mx, sy = my, bestClear = -1;
    for (const [x, y] of candidates) {
      let clear = Infinity;
      for (let k = 0; k < 16 && clear > bestClear; k++) {
        const a = (k / 16) * Math.PI * 2;
        let d = 0;
        for (; d < 400; d += 3) {
          const rx = Math.floor(x + Math.cos(a) * d), ry = Math.floor(y + Math.sin(a) * d);
          if (!inCanvas(rx, ry) || occ[ry * EW + rx]) break;
        }
        clear = Math.min(clear, d);
      }
      if (clear > bestClear) { bestClear = clear; sx = x; sy = y; }
    }

    // split across the long axis, leaning toward the flow angle, with a little randomness
    const minor = major + Math.PI / 2;
    const flowAng = (p.angle * Math.PI) / 180;
    let diff = flowAng - minor;
    diff = Math.atan2(Math.sin(2 * diff), Math.cos(2 * diff)) / 2; // wrap to (-90°, 90°]: lines have no direction
    const heading = minor + diff * p.flow + (rng() - 0.5) * 0.5;

    const id = cracks.length;
    const a = growHalf(sx, sy, heading, id, 0);
    const b = growHalf(sx, sy, heading + Math.PI, id, 13);
    const crack: P[] = [...b.reverse(), [sx, sy], ...a];
    cracks.push(crack);
    markCrack(crack, id);
  }

  // ── 2. crack width field (older cracks thicker), sampled through a domain warp ──
  const Fc = new Float32Array(EW * EH).fill(FAR);
  const cid = new Int16Array(EW * EH).fill(-1);
  const N = cracks.length;
  cracks.forEach((pts, k) => {
    const order = N > 1 ? k / (N - 1) : 0;
    const base = p.veinWidth * (1 + p.hierarchy * (0.8 - 1.3 * order)) * (1 - p.widthVariation * 0.4 * rng());
    const widthAt = (s: number) => Math.max(1.5, base * (1 + p.widthVariation * 0.45 * fbm(s / 220, k * 5.3, seed + 31)));
    let s = 0;
    for (let i = 0; i + 3 < pts.length; i += 3) {
      const a = pts[i], b = pts[i + 3];
      const wa = widthAt(s), wb = widthAt(s + 6);
      s += 6;
      const pad = Math.max(wa, wb) / 2 + 3;
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - pad));
      const x1 = Math.min(EW - 1, Math.ceil(Math.max(a[0], b[0]) + pad));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - pad));
      const y1 = Math.min(EH - 1, Math.ceil(Math.max(a[1], b[1]) + pad));
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy || 1;
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          const u = Math.min(1, Math.max(0, ((gx - a[0]) * dx + (gy - a[1]) * dy) / l2));
          const v = 2 * Math.hypot(gx - (a[0] + dx * u), gy - (a[1] + dy * u)) - (wa + (wb - wa) * u);
          const idx = gy * EW + gx;
          if (v < Fc[idx]) { Fc[idx] = v; cid[idx] = k; }
        }
      }
    }
  });

  const gw = W + 3; // canvas samples from x = -1 .. W + 1
  const gh = H + 3;
  const F = new Float32Array(gw * gh); // > 0 inside an island, < 0 in a vein
  const side = new Int16Array(gw * gh); // which crack (or the border) a sample is nearest
  const ws = p.warpScale;
  for (let j = 0; j < gh; j++) {
    const y = j - 1;
    for (let i = 0; i < gw; i++) {
      const idx = j * gw + i;
      if (i === 0 || j === 0 || i === gw - 1 || j === gh - 1) {
        // Border ring counts as vein, so every island closes just outside the canvas edge.
        F[idx] = -10;
        side[idx] = RING;
        continue;
      }
      const x = i - 1;
      const ex = x + p.warp * fbm(x / ws, y / ws, seed + 11) + M;
      const ey = y + p.warp * fbm(x / ws + 31.7, y / ws - 12.3, seed + 23) + M;
      const fx = Math.floor(ex), fy = Math.floor(ey);
      let v = FAR;
      if (fx >= 0 && fy >= 0 && fx + 1 < EW && fy + 1 < EH) {
        const tx = ex - fx, ty = ey - fy;
        const o = fy * EW + fx;
        v = (Fc[o] * (1 - tx) + Fc[o + 1] * tx) * (1 - ty) + (Fc[o + EW] * (1 - tx) + Fc[o + EW + 1] * tx) * ty;
        side[idx] = cid[Math.round(ey) * EW + Math.round(ex)];
      }
      F[idx] = v === 0 ? 1e-6 : v;
    }
  }

  // ── 4. marching squares -> one closed outline per island ──
  // Edge ids: horizontal edge from sample (i,j) to (i+1,j) = 2*(j*gw+i); vertical (i,j)->(i,j+1) = +1.
  const adj = new Map<number, number[]>();
  const link = (e1: number, e2: number) => {
    const a = adj.get(e1); if (a) a.push(e2); else adj.set(e1, [e2]);
    const b = adj.get(e2); if (b) b.push(e1); else adj.set(e2, [e1]);
  };
  for (let j = 0; j < gh - 1; j++) {
    for (let i = 0; i < gw - 1; i++) {
      const tl = F[j * gw + i], tr = F[j * gw + i + 1];
      const bl = F[(j + 1) * gw + i], br = F[(j + 1) * gw + i + 1];
      const c = (tl > 0 ? 8 : 0) | (tr > 0 ? 4 : 0) | (br > 0 ? 2 : 0) | (bl > 0 ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const T = 2 * (j * gw + i);
      const L = T + 1;
      const B = 2 * ((j + 1) * gw + i);
      const R = 2 * (j * gw + i + 1) + 1;
      const centerIn = tl + tr + bl + br > 0;
      switch (c) {
        case 1: case 14: link(L, B); break;
        case 2: case 13: link(B, R); break;
        case 3: case 12: link(L, R); break;
        case 4: case 11: link(T, R); break;
        case 6: case 9: link(T, B); break;
        case 7: case 8: link(L, T); break;
        case 5: if (centerIn) { link(L, T); link(B, R); } else { link(L, B); link(T, R); } break;
        case 10: if (centerIn) { link(T, R); link(L, B); } else { link(L, T); link(B, R); } break;
      }
    }
  }

  // A crossing point, plus the id of whatever this stretch of island edge borders.
  const edgePoint = (e: number): { p: P; id: number } => {
    const a = e >> 1;
    const b = e & 1 ? a + gw : a + 1;
    const t = F[a] / (F[a] - F[b]);
    const i = a % gw, j = (a - i) / gw;
    const island = F[a] > 0 ? a : b;
    const vein = island === a ? b : a;
    const id = side[vein] === RING ? RING : side[island];
    return { p: e & 1 ? [i - 1, j - 1 + t] : [i - 1 + t, j - 1], id };
  };

  const visited = new Set<number>();
  const outlines: { pts: P[]; ids: number[] }[] = [];
  for (const startEdge of adj.keys()) {
    if (visited.has(startEdge)) continue;
    const pts: P[] = [];
    const ids: number[] = [];
    let prev = -1;
    let cur = startEdge;
    for (let guard = 0; guard < 1_000_000; guard++) {
      visited.add(cur);
      const { p: pt, id } = edgePoint(cur);
      pts.push(pt);
      ids.push(id);
      const n = adj.get(cur)!;
      const next = n[0] !== prev ? n[0] : n[1];
      if (next === undefined || next === startEdge) break;
      prev = cur;
      cur = next;
    }
    if (pts.length >= 8 && Math.abs(polygonArea(pts)) > 400) outlines.push({ pts, ids });
  }

  // ── 5. split each outline into sides, fit each side with smooth Béziers ──
  const fmt = (n: number) => {
    const s = n.toFixed(1);
    return s.endsWith('.0') ? s.slice(0, -2) : s === '-0' ? '0' : s;
  };
  let islandsD = '';
  let curves = 0;
  const tips: P[] = [];
  // Rounding radius (in outline points, ~1 px each) for everywhere that isn't a sharp tip.
  const round = Math.round(3 + p.smoothness * 3);
  for (const { pts, ids } of outlines) {
    const { sides, sharp } = splitSides(pts, ids, p.tipMerge, p.tipAngle, round);
    let d = '';
    for (const s of sides) {
      const beziers = fitCurve(s.pts, p.smoothness, s.t1, s.t2);
      for (const [p0, c1, c2, p3] of beziers) {
        if (!d) d = `M${fmt(p0[0])} ${fmt(p0[1])}`;
        d += `C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(p3[0])} ${fmt(p3[1])}`;
        curves++;
      }
      if (sharp) tips.push(s.pts[0]);
    }
    if (d) islandsD += `${d}Z`;
  }

  return { islandsD, islands: outlines.length, tips, curves, ms: Math.round(performance.now() - started) };
}

interface Side { pts: P[]; t1?: P; t2?: P }

/**
 * Cuts a closed outline into sides at its sharp tips. Candidate tips are where the bordering
 * neighbour changes (a vein junction). A candidate survives only if the side on each end is at
 * least `minLen` px and the outline really turns there by `minTurn` degrees or more: in a junction
 * only the island in the narrow wedge gets a sharp tip, the others keep a smooth rounded side.
 *
 * Each side is smoothed with its tip end points pinned, and runs from its tip to the next tip
 * (inclusive). An island with no sharp tips comes back as two halves joined with shared tangents,
 * which fits as one smooth closed curve.
 */
function splitSides(pts: P[], ids: number[], minLen: number, minTurn: number, round: number): { sides: Side[]; sharp: boolean } {
  const n = pts.length;
  const segLen = (a: number, b: number) => Math.hypot(pts[b][0] - pts[a][0], pts[b][1] - pts[a][1]);

  // cyclic runs of equal id: [start index, length]
  let runs: { start: number; len: number; id: number }[] = [];
  let first = 0;
  while (first < n && ids[first] === ids[(first - 1 + n) % n]) first++;
  if (first === n) {
    runs = [{ start: 0, len: n, id: ids[0] }];
  } else {
    let s = first;
    for (let k = 1; k <= n; k++) {
      const idx = (first + k) % n;
      if (k === n || ids[idx] !== ids[s]) {
        runs.push({ start: s, len: (idx - s + n) % n || n, id: ids[s] });
        s = idx;
      }
    }
  }
  const arc = (r: { start: number; len: number }) => {
    let l = 0;
    for (let k = 0; k < r.len; k++) l += segLen((r.start + k) % n, (r.start + k + 1) % n);
    return l;
  };

  // absorb short sides, shortest first, while more than 2 remain
  while (runs.length > 2) {
    let shortest = -1, shortLen = Infinity;
    runs.forEach((r, k) => { const l = arc(r); if (l < shortLen) { shortLen = l; shortest = k; } });
    if (shortLen >= minLen) break;
    // Split the short side between its two neighbours so the surviving tip lands in its middle.
    const r = runs[shortest];
    const half = Math.floor(r.len / 2);
    const prev = runs[(shortest - 1 + runs.length) % runs.length];
    const next = runs[(shortest + 1) % runs.length];
    prev.len += half;
    next.start = (r.start + half) % n;
    next.len += r.len - half;
    runs.splice(shortest, 1);
  }

  // Keep only tips where the outline genuinely turns (measured ~12 px either side of the corner).
  const turnAt = (i: number) => {
    const k = 12;
    const a = pts[(i - k + n) % n], b = pts[i], c = pts[(i + k) % n];
    const v1 = unit(sub(b, a)), v2 = unit(sub(c, b));
    return (Math.acos(Math.max(-1, Math.min(1, dot(v1, v2)))) * 180) / Math.PI;
  };
  if (runs.length > 1) {
    const kept = runs.filter(r => turnAt(r.start) >= minTurn);
    // Dropping a tip joins its two sides: each kept run now extends to the next kept tip.
    runs = kept.map((r, k) => {
      const next = kept[(k + 1) % kept.length];
      return { ...r, len: kept.length === 1 ? n : (next.start - r.start + n) % n };
    });
  }

  if (runs.length <= 1) {
    // No sharp tips: smooth the whole closed outline, then split at its two farthest points with
    // matching tangents so the fit is one seamless curve.
    const sm = smoothClosed(pts, round);
    let a = 0, b = 0, best = -1;
    for (let i = 0; i < n; i += 4) {
      for (let j = i + 4; j < n; j += 4) {
        const dd = (sm[i][0] - sm[j][0]) ** 2 + (sm[i][1] - sm[j][1]) ** 2;
        if (dd > best) { best = dd; a = i; b = j; }
      }
    }
    const tangent = (i: number) => unit(sub(sm[(i + 4) % n], sm[(i - 4 + n) % n]));
    const ta = tangent(a), tb = tangent(b);
    const half = (from: number, len: number): P[] => Array.from({ length: len + 1 }, (_, k) => sm[(from + k) % n]);
    return {
      sharp: false,
      sides: [
        { pts: half(a, b - a), t1: ta, t2: mul(tb, -1) },
        { pts: half(b, n - (b - a)), t1: tb, t2: mul(ta, -1) },
      ],
    };
  }

  return {
    sharp: true,
    sides: runs.map(r => {
      const out: P[] = [];
      for (let k = 0; k <= r.len; k++) out.push(pts[(r.start + k) % n]);
      return { pts: smoothOpen(out, round) };
    }),
  };
}

/** Moving-average smoothing (3 box passes, ~Gaussian) with both end points pinned: they are tips. */
function smoothOpen(pts: P[], radius: number): P[] {
  let cur = pts;
  for (let pass = 0; pass < 3; pass++) {
    const next: P[] = [];
    for (let i = 0; i < cur.length; i++) {
      // shrink the window near the pinned ends so tips stay exactly in place
      const r = Math.min(radius, i, cur.length - 1 - i);
      let x = 0, y = 0;
      for (let k = -r; k <= r; k++) { x += cur[i + k][0]; y += cur[i + k][1]; }
      next.push([x / (2 * r + 1), y / (2 * r + 1)]);
    }
    cur = next;
  }
  return cur;
}

/** Same smoothing on a closed loop (no pinned points). */
function smoothClosed(pts: P[], radius: number): P[] {
  const n = pts.length;
  let cur = pts;
  for (let pass = 0; pass < 3; pass++) {
    const next: P[] = [];
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0;
      for (let k = -radius; k <= radius; k++) { const q = cur[(i + k + n) % n]; x += q[0]; y += q[1]; }
      next.push([x / (2 * radius + 1), y / (2 * radius + 1)]);
    }
    cur = next;
  }
  return cur;
}

function polygonArea(pts: P[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return a / 2;
}

// ── Schneider curve fitting ("An Algorithm for Automatically Fitting Digitized Curves") ──────

type Bez = [P, P, P, P];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P, s: number): P => [a[0] * s, a[1] * s];
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (a: P): P => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };

function bezAt(b: Bez, t: number): P {
  const mt = 1 - t;
  const b0 = mt * mt * mt, b1 = 3 * t * mt * mt, b2 = 3 * t * t * mt, b3 = t * t * t;
  return [b[0][0] * b0 + b[1][0] * b1 + b[2][0] * b2 + b[3][0] * b3, b[0][1] * b0 + b[1][1] * b1 + b[2][1] * b2 + b[3][1] * b3];
}

function fitCurve(pts: P[], error: number, startTangent?: P, endTangent?: P): Bez[] {
  const n = pts.length;
  if (n < 2) return [];
  const out: Bez[] = [];
  const t1 = startTangent ?? unit(sub(pts[Math.min(4, n - 1)], pts[0]));
  const t2 = endTangent ?? unit(sub(pts[Math.max(n - 5, 0)], pts[n - 1]));
  fitCubic(pts, 0, n - 1, t1, t2, error * error, out, 0);
  return out;
}

function fitCubic(d: P[], first: number, last: number, t1: P, t2: P, err2: number, out: Bez[], depth: number): void {
  const nPts = last - first + 1;
  if (nPts <= 3) {
    const l = dist(d[first], d[last]) / 3;
    out.push([d[first], add(d[first], mul(t1, l)), add(d[last], mul(t2, l)), d[last]]);
    return;
  }
  let u = chordLength(d, first, last);
  let bez = generateBezier(d, first, last, u, t1, t2);
  let [maxErr, split] = maxError(d, first, last, bez, u);
  if (maxErr < err2) { out.push(bez); return; }
  if (maxErr < err2 * 16) {
    for (let k = 0; k < 6; k++) {
      u = reparameterize(d, first, u, bez);
      bez = generateBezier(d, first, last, u, t1, t2);
      [maxErr, split] = maxError(d, first, last, bez, u);
      if (maxErr < err2) { out.push(bez); return; }
    }
  }
  if (depth > 8) { out.push(bez); return; }
  const tc = unit(sub(d[split - 1], d[split + 1]));
  fitCubic(d, first, split, t1, tc, err2, out, depth + 1);
  fitCubic(d, split, last, mul(tc, -1), t2, err2, out, depth + 1);
}

function chordLength(d: P[], first: number, last: number): number[] {
  const u = [0];
  for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + dist(d[i], d[i - 1]));
  const total = u[u.length - 1] || 1;
  return u.map(v => v / total);
}

function generateBezier(d: P[], first: number, last: number, u: number[], t1: P, t2: P): Bez {
  const p0 = d[first], p3 = d[last];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < u.length; i++) {
    const t = u[i], mt = 1 - t;
    const b0 = mt * mt * mt, b1 = 3 * t * mt * mt, b2 = 3 * t * t * mt, b3 = t * t * t;
    const a1 = mul(t1, b1), a2 = mul(t2, b2);
    c00 += dot(a1, a1); c01 += dot(a1, a2); c11 += dot(a2, a2);
    const tmp = sub(d[first + i], add(mul(p0, b0 + b1), mul(p3, b2 + b3)));
    x0 += dot(a1, tmp); x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  const seg = dist(p0, p3);
  let al1 = det ? (x0 * c11 - x1 * c01) / det : 0;
  let al2 = det ? (c00 * x1 - c01 * x0) / det : 0;
  // Degenerate or wildly overshooting fits fall back to the classic 1/3 heuristic.
  if (al1 < seg * 1e-3 || al2 < seg * 1e-3 || al1 > seg * 1.2 || al2 > seg * 1.2) al1 = al2 = seg / 3;
  return [p0, add(p0, mul(t1, al1)), add(p3, mul(t2, al2)), p3];
}

function maxError(d: P[], first: number, last: number, bez: Bez, u: number[]): [number, number] {
  let max = 0, split = Math.floor((first + last) / 2);
  for (let i = first + 1; i < last; i++) {
    const q = bezAt(bez, u[i - first]);
    const e = (q[0] - d[i][0]) ** 2 + (q[1] - d[i][1]) ** 2;
    if (e >= max) { max = e; split = i; }
  }
  return [max, Math.min(last - 1, Math.max(first + 1, split))];
}

function reparameterize(d: P[], first: number, u: number[], b: Bez): number[] {
  return u.map((t, i) => {
    const pt = d[first + i];
    const q = bezAt(b, t);
    const mt = 1 - t;
    const q1: P = [
      3 * (mt * mt * (b[1][0] - b[0][0]) + 2 * mt * t * (b[2][0] - b[1][0]) + t * t * (b[3][0] - b[2][0])),
      3 * (mt * mt * (b[1][1] - b[0][1]) + 2 * mt * t * (b[2][1] - b[1][1]) + t * t * (b[3][1] - b[2][1])),
    ];
    const q2: P = [
      6 * (mt * (b[2][0] - 2 * b[1][0] + b[0][0]) + t * (b[3][0] - 2 * b[2][0] + b[1][0])),
      6 * (mt * (b[2][1] - 2 * b[1][1] + b[0][1]) + t * (b[3][1] - 2 * b[2][1] + b[1][1])),
    ];
    const diff = sub(q, pt);
    const den = dot(q1, q1) + dot(diff, q2);
    const next = den ? t - dot(diff, q1) / den : t;
    return Math.min(1, Math.max(0, next));
  });
}

// ── SVG output ───────────────────────────────────────────────────────────────────────────────

const RECT = `M0 0H${CANVAS.width}V${CANVAS.height}H0Z`;

/** Gold veins with transparent islands (islands cut out of a gold rect). Drop-in for /public files. */
export function veinSvg(islandsD: string, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}"><path fill="${color}" fill-rule="evenodd" d="${RECT}${islandsD}"/></svg>`;
}

/** Gold canvas with dark island shapes on top, handy for editing the islands in Illustrator. */
export function twoToneSvg(islandsD: string, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}"><rect width="${CANVAS.width}" height="${CANVAS.height}" fill="${color}"/><path fill="#080808" d="${islandsD}"/></svg>`;
}

export const PRESETS: Record<'delta' | 'trunks', Omit<VeinParams, 'seed'>> = {
  // toward the homepage background: many flowing, mostly-horizontal veins
  delta: {
    islands: 16, flow: 0.6, angle: 8, warp: 45, warpScale: 280,
    veinWidth: 8, hierarchy: 0.5, widthVariation: 0.4, tipMerge: 40, tipAngle: 55, smoothness: 1.5,
  },
  // toward the login background: a few thick early cracks, thinner branches off them
  trunks: {
    islands: 11, flow: 0.35, angle: -35, warp: 40, warpScale: 300,
    veinWidth: 9, hierarchy: 0.9, widthVariation: 0.4, tipMerge: 40, tipAngle: 55, smoothness: 1.5,
  },
};
