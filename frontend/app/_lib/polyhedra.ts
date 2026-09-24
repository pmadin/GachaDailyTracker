/**
 * Geometry for the CSS 3D streak-badge polyhedra (see _components/PolyhedronBadge.tsx).
 *
 * v2 design. v1 placed each face using only its outward NORMAL (2 of the 3 rotational degrees
 * of freedom — which direction it points). That's enough to size and position a face, but not
 * enough to ROLL it correctly around that normal, so neighboring faces' edges didn't reliably
 * line up — confirmed live (Claude in Chrome, /dev/badges): every solid except the
 * roll-symmetric cube showed visible gaps between faces and didn't read as an enclosed solid.
 *
 * This version derives each face from its REAL 3D VERTICES instead, which fixes all 3 degrees
 * of freedom by construction — there's no missing roll to get wrong. The face-vertex lookup
 * itself is generic and computed, not hand-authored: for a convex solid, the vertices of the
 * face with outward normal N are exactly the vertices that maximize dot(vertex, N) — a
 * standard, robust computational-geometry technique (support-plane extremity) that needs only
 * the solid's plain vertex list and its (already-normal-verified) face normals, not a
 * hand-typed face->vertex-index adjacency table, which would have been a much easier place to
 * introduce a silent, hard-to-see error, especially for the dodecahedron's 12 pentagons.
 *
 * Vertex coordinates are the standard textbook ones for Platonic solids centered at the origin
 * (see e.g. Wikipedia's "Platonic solid", "Regular icosahedron", "Regular dodecahedron"
 * Cartesian-coordinate tables) — the same ones v1 already used (as face normals for one solid
 * are the OTHER solid's vertex directions, since dodecahedron/icosahedron are duals).
 */

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export type SolidName = 'tetrahedron' | 'cube' | 'octahedron' | 'dodecahedron' | 'icosahedron';

const PHI = (1 + Math.sqrt(5)) / 2; // golden ratio
const INV_PHI = 1 / PHI; // = PHI - 1
const PHI2 = PHI * PHI; // golden ratio squared — see greatStellatedDodecahedronFor

function sub(a: Vec3, b: Vec3): Vec3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function length(a: Vec3): number { return Math.sqrt(dot(a, a)); }
function normalize(a: Vec3): Vec3 { const l = length(a); return [a[0] / l, a[1] / l, a[2] / l]; }
function average(vs: Vec3[]): Vec3 {
  const s: Vec3 = [0, 0, 0];
  for (const v of vs) { s[0] += v[0]; s[1] += v[1]; s[2] += v[2]; }
  return [s[0] / vs.length, s[1] / vs.length, s[2] / vs.length];
}

// Any number reaching an inline style string (px sizes, matrix components) must be rounded to a
// fixed precision before it's stringified. Next.js SSRs the initial HTML with these baked into
// style="..." text; on hydration React recomputes the same JS floats client-side and does a
// plain string comparison against what the browser parsed from that server HTML. Full float
// precision doesn't reliably round-trip through the browser's HTML parser byte-for-byte, which
// threw a real, reproducible hydration mismatch (confirmed live via Claude in Chrome's
// console). 4 decimal places is far more precision than a small badge needs visually, and is
// stable across the SSR/hydrate boundary.
export function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ---------------------------------------------------------------------------------------------
// Vertex lists — the only hand-authored geometry data left. Each solid's own circumradius
// (needed to scale it into the badge box) is measured directly off these same coordinates
// rather than from a separately-derived formula, so there's nothing else that could disagree.
// ---------------------------------------------------------------------------------------------

// 4 alternating vertices of a cube.
const TETRAHEDRON_VERTICES: Vec3[] = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];

const CUBE_VERTICES: Vec3[] = [
  [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
  [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
];

const OCTAHEDRON_VERTICES: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// (±1,±1,±1) plus (0,±PHI,±1/PHI), (±1/PHI,0,±PHI), (±PHI,±1/PHI,0) — all 20 lie on the same
// sphere. Verified against Wikipedia's "Regular dodecahedron" Cartesian-coordinates table
// directly (WebFetch, not memory) after an earlier version of this list had PHI and 1/PHI
// swapped between axes — an exact-tie edge-adjacency failure caught that (see polyhedra
// verification), not a visual guess.
const DODECAHEDRON_VERTICES: Vec3[] = [
  [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
  [0, PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, INV_PHI], [0, -PHI, -INV_PHI],
  [INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, PHI], [-INV_PHI, 0, -PHI],
  [PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, INV_PHI, 0], [-PHI, -INV_PHI, 0],
];

// Cyclic permutations of (0, ±1, ±PHI) — the dodecahedron's dual vertex directions.
const ICOSAHEDRON_VERTICES: Vec3[] = [
  [0, 1, PHI], [0, 1, -PHI], [0, -1, PHI], [0, -1, -PHI],
  [1, PHI, 0], [1, -PHI, 0], [-1, PHI, 0], [-1, -PHI, 0],
  [PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, 1], [-PHI, 0, -1],
];

// Face normals — same values already numerically verified in v1 (each faceTransform(normal, r)
// reproduced its input normal to within float error; kept here as the plan for which vertices
// belong together, not as the sole source of a face's orientation anymore).
const TETRAHEDRON_NORMALS: Vec3[] = [
  normalize([-1, -1, -1]), normalize([-1, 1, 1]), normalize([1, -1, 1]), normalize([1, 1, -1]),
];
const CUBE_NORMALS: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const OCTAHEDRON_NORMALS: Vec3[] = [
  normalize([1, 1, 1]), normalize([1, 1, -1]), normalize([1, -1, 1]), normalize([1, -1, -1]),
  normalize([-1, 1, 1]), normalize([-1, 1, -1]), normalize([-1, -1, 1]), normalize([-1, -1, -1]),
];
const DODECAHEDRON_NORMALS: Vec3[] = ICOSAHEDRON_VERTICES.map(normalize);
const ICOSAHEDRON_NORMALS: Vec3[] = DODECAHEDRON_VERTICES.map(normalize);

const SOLID_DATA: Record<SolidName, { vertices: Vec3[]; normals: Vec3[]; sides: number }> = {
  tetrahedron: { vertices: TETRAHEDRON_VERTICES, normals: TETRAHEDRON_NORMALS, sides: 3 },
  cube: { vertices: CUBE_VERTICES, normals: CUBE_NORMALS, sides: 4 },
  octahedron: { vertices: OCTAHEDRON_VERTICES, normals: OCTAHEDRON_NORMALS, sides: 3 },
  dodecahedron: { vertices: DODECAHEDRON_VERTICES, normals: DODECAHEDRON_NORMALS, sides: 5 },
  icosahedron: { vertices: ICOSAHEDRON_VERTICES, normals: ICOSAHEDRON_NORMALS, sides: 3 },
};

/** How far this solid's own raw vertex coordinates reach from its center — used to scale it. */
function rawCircumradius(vertices: Vec3[]): number {
  return Math.max(...vertices.map(length));
}

/**
 * The vertices of the face whose outward normal is `normal`: for a convex solid, exactly the
 * vertices maximizing dot(vertex, normal) (they lie on that face's supporting plane; every
 * other vertex sits strictly closer to the center in that direction). Sorted into proper
 * cyclic (edge-adjacent) order afterward via orderCyclically. Throws if the boundary between
 * "in this face" and "not in this face" isn't clearly separated, so a genuine ambiguity fails
 * loudly at module load instead of silently producing a wrong shape.
 */
function findFaceVertices(allVertices: Vec3[], normal: Vec3, count: number): Vec3[] {
  const scored = allVertices.map(v => ({ v, d: dot(v, normal) })).sort((a, b) => b.d - a.d);
  const boundaryGap = scored[count - 1].d - scored[count].d;
  const spread = scored[0].d - scored[scored.length - 1].d;
  if (boundaryGap < spread * 0.01) {
    throw new Error(`findFaceVertices: ambiguous face boundary for normal ${normal.join(',')} (gap too small — vertex data or normal is probably wrong)`);
  }
  return orderCyclically(scored.slice(0, count).map(s => s.v), normal);
}

/** Sorts a face's vertices into cyclic (edge-adjacent) order by angle around their centroid. */
function orderCyclically(vertices: Vec3[], normal: Vec3): Vec3[] {
  const centroid = average(vertices);
  const u = normalize(sub(vertices[0], centroid));
  const v = cross(normal, u);
  return [...vertices].sort((a, b) => {
    const angle = (p: Vec3) => Math.atan2(dot(sub(p, centroid), v), dot(sub(p, centroid), u));
    return angle(a) - angle(b);
  });
}

export interface FaceGeometry {
  sides: number;
  /** The face's own flat outline, in local 2D px, centered on its own centroid — for clip-path. */
  outline2D: Vec2[];
  /** Column-major 4x4 matrix, ready for `matrix3d(...)` — maps a local XY-plane template
   *  (Z = outward normal) straight onto this face's real position AND orientation, roll
   *  included, so neighboring faces are guaranteed to share edges. */
  matrix3d: number[];
}

/**
 * Builds every face of a solid, scaled so its vertices sit at `circumradiusPx` from center —
 * every solid's actual outermost point (not just its face centers) then fits the badge
 * consistently regardless of shape, exactly like v1's circumradius fix, but now measured
 * directly off the same real vertex data used for the rest of the geometry rather than a
 * second, separately-derived formula that could disagree with it.
 */
function buildSolid(vertices: Vec3[], normals: Vec3[], sides: number, circumradiusPx: number): FaceGeometry[] {
  const scale = circumradiusPx / rawCircumradius(vertices);
  return normals.map(normal => {
    const faceVerts = findFaceVertices(vertices, normal, sides);
    const centroid = average(faceVerts);
    const u = normalize(sub(faceVerts[0], centroid));
    const v = cross(normal, u);
    const outline2D: Vec2[] = faceVerts.map(p => {
      const d = sub(p, centroid);
      return [round(dot(d, u) * scale), round(dot(d, v) * scale)];
    });
    const t: Vec3 = [centroid[0] * scale, centroid[1] * scale, centroid[2] * scale];
    const matrix3d = [
      ...u, 0,
      ...v, 0,
      ...normal, 0,
      ...t, 1,
    ].map(round);
    return { sides, outline2D, matrix3d };
  });
}

/**
 * All 6 faces/8/12/20 of a solid, scaled to fit a badge of the given CSS `size`. Circumradius
 * is capped at a fraction of the box so vertices don't touch its very edge — tuned by eye on
 * /dev/badges.
 */
export function solidFor(solid: SolidName, size: number): FaceGeometry[] {
  const { vertices, normals, sides } = SOLID_DATA[solid];
  return buildSolid(vertices, normals, sides, size * 0.42);
}

/** `clip-path: polygon(...)` string for a face, given the div box it'll be centered in. */
export function clipPathFor(face: FaceGeometry, boxSize: number): string {
  const pts = face.outline2D
    .map(([x, y]) => `${round((x / boxSize + 0.5) * 100)}% ${round((y / boxSize + 0.5) * 100)}%`)
    .join(', ');
  return `polygon(${pts})`;
}

/** The div box a face's outline needs (its own local bounding diameter, plus a small margin). */
export function boxSizeFor(face: FaceGeometry): number {
  const r = Math.max(...face.outline2D.map(([x, y]) => Math.sqrt(x * x + y * y)));
  return round(r * 2.05);
}

/**
 * Great stellated dodecahedron ("Diamond" tier, replacing the stella octangula): not new
 * geometry either — each of the 12 faces is the dodecahedron's own pentagon, in the exact same
 * plane, extended outward into a pentagram. Because the star lies in the SAME plane as the
 * pentagon it stellates, it needs the dodecahedron's already-verified per-face position AND
 * orientation (matrix3d) completely unchanged — only outline2D grows from 5 points to 10.
 *
 * The outer/inner radius ratio is derived here, not recalled: extend a regular pentagon's edge
 * (vertex radius R) until it crosses the next-but-one edge — solving that intersection (checked
 * numerically) lands exactly on the angular bisector between the two vertices the extended edge
 * passes near, at distance R * PHI^2 from center. So each star point is
 * `normalize(vertex_k + vertex_k+1) * avg(|vertex_k|, |vertex_k+1|) * PHI^2`, alternated with
 * the pentagon's own 5 vertices (the star's inner notches) in cyclic order.
 */
export function greatStellatedDodecahedronFor(size: number): FaceGeometry[] {
  // The star's points reach PHI^2 (~2.618x) further out than the underlying pentagon's own
  // vertices, so the pentagon itself is built smaller than solidFor's dodecahedron — tuned by
  // eye on /dev/badges so the finished star fits the badge box like every other tier.
  const pentagonFaces = buildSolid(DODECAHEDRON_VERTICES, DODECAHEDRON_NORMALS, 5, size * 0.2);
  return pentagonFaces.map(face => {
    const inner = face.outline2D;
    const outline2D: Vec2[] = [];
    for (let k = 0; k < inner.length; k++) {
      const a = inner[k];
      const b = inner[(k + 1) % inner.length];
      const ra = Math.sqrt(a[0] * a[0] + a[1] * a[1]);
      const rb = Math.sqrt(b[0] * b[0] + b[1] * b[1]);
      const sum: Vec2 = [a[0] + b[0], a[1] + b[1]];
      const sumLen = Math.sqrt(sum[0] * sum[0] + sum[1] * sum[1]);
      const outerR = ((ra + rb) / 2) * PHI2;
      const outer: Vec2 = [round((sum[0] / sumLen) * outerR), round((sum[1] / sumLen) * outerR)];
      outline2D.push(a, outer);
    }
    return { sides: 10, outline2D, matrix3d: face.matrix3d };
  });
}
