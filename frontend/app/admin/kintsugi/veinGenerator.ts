/**
 * Procedural kintsugi vein generator. Pure TS, no DOM, deterministic for a given seed + params.
 *
 * Idea: generate the dark "islands" and let the gold veins be the gaps between them. Islands
 * never touch, so every vein is simply the space between two neighbours, and its width is how far
 * apart those two islands sit.
 *
 * Pipeline:
 *  1. Island seeds scattered with a noise-driven density (mix of big and small islands), in a
 *     rotated + stretched "island space" so islands can elongate in one direction.
 *  2. Every canvas sample is domain-warped by noise before the nearest-seed lookup, which bends
 *     the straight Voronoi borders into smooth organic curves.
 *  3. Vein field F = gap - width, where gap is twice the exact distance to the border between the
 *     two nearest islands (even width, no wedges at junctions). Width varies per island pair
 *     (hashed), swells with noise, and can taper to 0 along a border for dead-end tips. Some
 *     borders are dropped entirely so islands merge, and a vein left with no continuation tapers
 *     to a point at its junction. Optional trunk cracks (long random walks) join in with min().
 *  4. Marching squares traces F = 0, then Ramer-Douglas-Peucker simplifies and Catmull-Rom turns
 *     the points into cubic Béziers. Output is one even-odd filled path: gold veins, empty islands.
 */

export const CANVAS = { width: 1376, height: 768 } as const;

export interface VeinParams {
  seed: number;
  /** Average island spacing in px (island space). */
  islandSize: number;
  /** 0..1, how much island size varies across the canvas. */
  sizeVariation: number;
  /** >= 1, stretches islands along `angle`. */
  anisotropy: number;
  /** Degrees, direction islands (and so most veins) run. */
  angle: number;
  /** Domain-warp amplitude in px. Higher = curvier borders. */
  warp: number;
  /** Domain-warp noise scale in px. Lower = tighter wiggles. */
  warpScale: number;
  /** Typical vein width in px. */
  veinWidth: number;
  /** 0..1, how much widths differ between veins and along a vein. */
  widthVariation: number;
  /** 0..1, share of veins that taper out to a dead-end tip. */
  deadEnds: number;
  /** 0..1, share of borders removed entirely so neighbouring islands merge into bigger shapes. */
  merge: number;
  /** Number of long trunk cracks crossing the canvas. */
  trunks: number;
  /** Max trunk width in px. */
  trunkWidth: number;
  /** RDP tolerance in px. Higher = fewer points, smaller file, softer detail. */
  smoothing: number;
}

export interface VeinResult {
  d: string;
  contours: number;
  points: number;
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

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

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
  return valueNoise(x, y, seed) * 0.68 + valueNoise(x * 2.07 + 17.3, y * 2.07 - 9.1, seed + 101) * 0.32;
}

// ── generator ────────────────────────────────────────────────────────────────────────────────

export function generateVeins(p: VeinParams): VeinResult {
  const started = performance.now();
  const W = CANVAS.width;
  const H = CANVAS.height;
  const seed = p.seed | 0;
  const rng = mulberry32(seed);

  const ang = (p.angle * Math.PI) / 180;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const an = Math.max(1, p.anisotropy);
  const cs = Math.max(20, p.islandSize);

  // canvas px (already warped) -> island space: rotate so `angle` is +x, then squash x.
  const qX = (x: number, y: number) => (x * ca + y * sa) / an;
  const qY = (x: number, y: number) => -x * sa + y * ca;

  // ── 1. island seeds on a bucketed grid in island space ──
  const margin = p.warp + cs * an * 2;
  const corners = [
    [-margin, -margin], [W + margin, -margin], [-margin, H + margin], [W + margin, H + margin],
  ];
  let minQx = Infinity, maxQx = -Infinity, minQy = Infinity, maxQy = -Infinity;
  for (const [x, y] of corners) {
    const qx = qX(x, y), qy = qY(x, y);
    minQx = Math.min(minQx, qx); maxQx = Math.max(maxQx, qx);
    minQy = Math.min(minQy, qy); maxQy = Math.max(maxQy, qy);
  }
  const gx0 = Math.floor(minQx / cs) - 1;
  const gy0 = Math.floor(minQy / cs) - 1;
  const gCols = Math.ceil(maxQx / cs) - gx0 + 2;
  const gRows = Math.ceil(maxQy / cs) - gy0 + 2;

  const sx: number[] = [];
  const sy: number[] = [];
  const cellStart = new Int32Array(gCols * gRows);
  const cellCount = new Int32Array(gCols * gRows);
  for (let r = 0; r < gRows; r++) {
    for (let c = 0; c < gCols; c++) {
      const cell = r * gCols + c;
      cellStart[cell] = sx.length;
      // density factor ~0.3..3: <1 leaves cells empty (bigger islands), >1 packs small ones
      const f = Math.pow(2, p.sizeVariation * 1.7 * fbm((c + gx0) * 0.28, (r + gy0) * 0.28, seed + 7));
      const k = Math.floor(f + rng());
      for (let n = 0; n < k; n++) {
        sx.push((c + gx0 + rng()) * cs);
        sy.push((r + gy0 + rng()) * cs);
      }
      cellCount[cell] = sx.length - cellStart[cell];
    }
  }

  // Width of the vein between islands a and b at island-space point (qx, qy).
  const pairWidth = (a: number, b: number, qx: number, qy: number): number => {
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    if (hash(lo, hi, seed, 6) < p.merge) return 0;
    let w = p.veinWidth * (1 - p.widthVariation * 0.8 * hash(lo, hi, seed, 2));
    if (hash(lo, hi, seed, 3) < p.deadEnds) {
      // position along the shared border (perpendicular to the seed-to-seed line)
      const ex = -(sy[hi] - sy[lo]);
      const ey = sx[hi] - sx[lo];
      const len = Math.hypot(ex, ey) || 1;
      const t = ((qx - (sx[lo] + sx[hi]) / 2) * ex + (qy - (sy[lo] + sy[hi]) / 2) * ey) / len;
      const tip = (hash(lo, hi, seed, 4) - 0.5) * cs * 0.6;
      const dir = hash(lo, hi, seed, 5) < 0.5 ? 1 : -1;
      w *= 1 - smoothstep(-cs * 0.7, 0, dir * (t - tip));
    }
    return w;
  };

  // ── 2. trunk cracks, rasterised into their own field ──
  const gw = W + 3; // samples from x = -1 .. W + 1
  const gh = H + 3;
  const trunkF = new Float32Array(gw * gh).fill(Infinity);
  for (let k = 0; k < p.trunks; k++) {
    const side = Math.floor(rng() * 4);
    const along = 0.15 + rng() * 0.7;
    const start: [number, number] =
      side === 0 ? [along * W, -30] : side === 1 ? [W + 30, along * H] : side === 2 ? [along * W, H + 30] : [-30, along * H];
    const back = 0.15 + rng() * 0.7;
    const target: [number, number] =
      side === 0 ? [back * W, H + 60] : side === 1 ? [-60, back * H] : side === 2 ? [back * W, -60] : [W + 60, back * H];
    let [x, y] = start;
    let heading = Math.atan2(target[1] - y, target[0] - x);
    const pts: { x: number; y: number; w: number }[] = [];
    for (let s = 0; s < 4000; s += 6) {
      const w = p.trunkWidth * (0.3 + 0.7 * (0.5 + 0.5 * fbm(s / 320, k * 9.1, seed + 55)));
      pts.push({ x, y, w });
      if (s > 60 && (x < -50 || x > W + 50 || y < -50 || y > H + 50)) break;
      const desired = Math.atan2(target[1] - y, target[0] - x);
      let diff = desired - heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      heading += fbm(s / 240, k * 3.7, seed + 77) * 0.07 + diff * 0.025;
      x += Math.cos(heading) * 6;
      y += Math.sin(heading) * 6;
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const pad = Math.max(a.w, b.w) / 2 + 3;
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - pad) + 1);
      const x1 = Math.min(gw - 1, Math.ceil(Math.max(a.x, b.x) + pad) + 1);
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - pad) + 1);
      const y1 = Math.min(gh - 1, Math.ceil(Math.max(a.y, b.y) + pad) + 1);
      const dx = b.x - a.x, dy = b.y - a.y;
      const l2 = dx * dx + dy * dy || 1;
      for (let j = y0; j <= y1; j++) {
        const py = j - 1;
        for (let i2 = x0; i2 <= x1; i2++) {
          const px = i2 - 1;
          const u = Math.min(1, Math.max(0, ((px - a.x) * dx + (py - a.y) * dy) / l2));
          const d = Math.hypot(px - (a.x + dx * u), py - (a.y + dy * u));
          const v = 2 * d - (a.w + (b.w - a.w) * u);
          const idx = j * gw + i2;
          if (v < trunkF[idx]) trunkF[idx] = v;
        }
      }
    }
  }

  // ── 3. sample the vein field ──
  const F = new Float32Array(gw * gh);
  const ws = Math.max(20, p.warpScale);
  // Short on purpose: it also sets how far a vein "bleeds" into a merged border as a tiny barb.
  const blendR = cs * 0.035;
  for (let j = 0; j < gh; j++) {
    const y = j - 1;
    for (let i = 0; i < gw; i++) {
      const idx = j * gw + i;
      if (i === 0 || j === 0 || i === gw - 1 || j === gh - 1) {
        F[idx] = 10; // outside ring counts as island, so every vein contour closes off-canvas
        continue;
      }
      const x = i - 1;
      const wx = x + p.warp * fbm(x / ws, y / ws, seed + 11);
      const wy = y + p.warp * fbm(x / ws + 31.7, y / ws - 12.3, seed + 23);
      const qx = qX(wx, wy);
      const qy = qY(wx, wy);

      const gc = Math.floor(qx / cs) - gx0;
      const gr = Math.floor(qy / cs) - gy0;
      let d1 = Infinity, d2 = Infinity, d3 = Infinity, i1 = -1, i2 = -1, i3 = -1;
      // Expanding ring search: sparse areas leave cells empty, so the 3 nearest islands can be
      // several cells away. Any seed in ring r+1 is at least r*cs away, so stop once d3 fits.
      for (let ring = 0; ring <= 8; ring++) {
        if (i3 >= 0 && d3 <= (ring - 1) * (ring - 1) * cs * cs) break;
        for (let rr = gr - ring; rr <= gr + ring; rr++) {
          if (rr < 0 || rr >= gRows) continue;
          const edgeRow = rr === gr - ring || rr === gr + ring;
          for (let cc = gc - ring; cc <= gc + ring; cc += edgeRow || ring === 0 ? 1 : 2 * ring) {
            if (cc < 0 || cc >= gCols) continue;
            const cell = rr * gCols + cc;
            const end = cellStart[cell] + cellCount[cell];
            for (let s = cellStart[cell]; s < end; s++) {
              const ddx = sx[s] - qx, ddy = sy[s] - qy;
              const dd = ddx * ddx + ddy * ddy;
              if (dd < d1) { d3 = d2; i3 = i2; d2 = d1; i2 = i1; d1 = dd; i1 = s; }
              else if (dd < d2) { d3 = d2; i3 = i2; d2 = dd; i2 = s; }
              else if (dd < d3) { d3 = dd; i3 = s; }
            }
          }
        }
      }
      let v = 10;
      if (i2 >= 0) {
        // Exact distance to the border between islands 1 and 2, times 2 (full vein width).
        // Plain d2 - d1 bulges into wedges where three islands meet, this stays even.
        const sep = Math.hypot(sx[i2] - sx[i1], sy[i2] - sy[i1]) || 1;
        const gap = (d2 - d1) / sep;
        d2 = Math.sqrt(d2);
        let w = pairWidth(i1, i2, qx, qy);
        if (i3 >= 0) {
          d3 = Math.sqrt(d3);
          let w13 = pairWidth(i1, i3, qx, qy);
          const w23 = pairWidth(i2, i3, qx, qy);
          // If only one of the junction's three borders survives, that vein dead-ends here:
          // taper it to a point on approach instead of stopping bluntly. Scaling both w and w13
          // keeps the two sides of the d2 = d3 line in agreement, so no flat cuts.
          if ((w > 0 ? 1 : 0) + (w13 > 0 ? 1 : 0) + (w23 > 0 ? 1 : 0) === 1) {
            const s = smoothstep(0, cs * 0.6, d3 - d2);
            w *= s;
            w13 *= s;
          }
          // blend toward the (1,3) pair near junctions so widths never jump
          w = w13 + (w - w13) * (0.5 + 0.5 * smoothstep(0, blendR, d3 - d2));
        }
        w *= Math.max(0.15, 1 + p.widthVariation * 0.6 * fbm(x / 200, y / 200, seed + 31));
        v = gap - w;
      }
      v = Math.min(v, trunkF[idx]);
      F[idx] = v === 0 ? 1e-6 : v;
    }
  }

  // ── 4. marching squares -> closed loops ──
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
      const c = (tl < 0 ? 8 : 0) | (tr < 0 ? 4 : 0) | (br < 0 ? 2 : 0) | (bl < 0 ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const T = 2 * (j * gw + i);
      const L = T + 1;
      const B = 2 * ((j + 1) * gw + i);
      const R = 2 * (j * gw + i + 1) + 1;
      const centerIn = tl + tr + bl + br < 0;
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

  const edgePoint = (e: number): [number, number] => {
    const cell = e >> 1;
    const i = cell % gw;
    const j = (cell - i) / gw;
    const fa = F[cell];
    const fb = e & 1 ? F[cell + gw] : F[cell + 1];
    const t = fa / (fa - fb);
    return e & 1 ? [i - 1, j - 1 + t] : [i - 1 + t, j - 1];
  };

  const visited = new Set<number>();
  const loops: [number, number][][] = [];
  for (const startEdge of adj.keys()) {
    if (visited.has(startEdge)) continue;
    const loop: [number, number][] = [];
    let prev = -1;
    let cur = startEdge;
    for (let guard = 0; guard < 1_000_000; guard++) {
      visited.add(cur);
      loop.push(edgePoint(cur));
      const n = adj.get(cur)!;
      const next = n[0] !== prev ? n[0] : n[1];
      if (next === undefined || next === startEdge) break;
      prev = cur;
      cur = next;
    }
    if (loop.length >= 4) loops.push(loop);
  }

  // ── 5. simplify + smooth into Bézier path data ──
  const fmt = (n: number) => {
    const s = n.toFixed(1);
    return s.endsWith('.0') ? s.slice(0, -2) : s === '-0' ? '0' : s;
  };
  let d = '';
  let contours = 0;
  let points = 0;
  for (const loop of loops) {
    if (Math.abs(polygonArea(loop)) < 6) continue; // specks
    const pts = simplifyClosed(loop, Math.max(0.05, p.smoothing));
    if (pts.length < 3) continue;
    contours++;
    points += pts.length;
    const n = pts.length;
    d += `M${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
    for (let k = 0; k < n; k++) {
      const p0 = pts[(k - 1 + n) % n], p1 = pts[k], p2 = pts[(k + 1) % n], p3 = pts[(k + 2) % n];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += `C${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2[0])} ${fmt(p2[1])}`;
    }
    d += 'Z';
  }

  return { d, contours, points, ms: Math.round(performance.now() - started) };
}

function polygonArea(pts: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return a / 2;
}

/** Ramer-Douglas-Peucker for a closed loop: split at the point farthest from pts[0]. */
function simplifyClosed(pts: [number, number][], eps: number): [number, number][] {
  let far = 0, best = -1;
  for (let i = 1; i < pts.length; i++) {
    const dd = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (dd > best) { best = dd; far = i; }
  }
  const a = rdp(pts.slice(0, far + 1), eps);
  const b = rdp([...pts.slice(far), pts[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function rdp(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [ax, ay] = pts[s], [bx, by] = pts[e];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let maxD = -1, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const dist = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (dist > maxD) { maxD = dist; idx = i; }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Standalone SVG: gold veins, transparent islands. Drop-in for the /public vein files. */
export function veinSvg(d: string, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}"><path fill="${color}" fill-rule="evenodd" d="${d}"/></svg>`;
}

/** Two-tone version (black islands on gold), handy for editing in Illustrator. */
export function twoToneSvg(d: string, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}"><rect width="${CANVAS.width}" height="${CANVAS.height}" fill="#080808"/><path fill="${color}" fill-rule="evenodd" d="${d}"/></svg>`;
}

export const PRESETS: Record<'network' | 'trunks', Omit<VeinParams, 'seed'>> = {
  network: {
    islandSize: 80, sizeVariation: 0.7, anisotropy: 2.4, angle: 8, warp: 70, warpScale: 200,
    veinWidth: 8, widthVariation: 0.65, deadEnds: 0.25, merge: 0.25, trunks: 0, trunkWidth: 18, smoothing: 0.6,
  },
  trunks: {
    islandSize: 105, sizeVariation: 0.8, anisotropy: 1.6, angle: -30, warp: 75, warpScale: 220,
    veinWidth: 7, widthVariation: 0.7, deadEnds: 0.35, merge: 0.22, trunks: 2, trunkWidth: 36, smoothing: 0.6,
  },
};
