'use client';

import { solidFor, greatStellatedDodecahedronFor, clipPathFor, boxSizeFor, round, type FaceGeometry, type SolidName } from '../_lib/polyhedra';
import type { StreakTier } from '../_lib/badges';

// A fixed upper-left-front light direction (in the same local XYZ space matrix3d's faces live
// in), pre-normalized. Real per-face lighting, not an index-based alternation: each face's own
// outward normal — already sitting in matrix3d's 3rd column (indices 8-10), no extra geometry
// needed — is dot-producted against this to get a genuine "how lit is this face" factor, so a
// badge at rest (paused spin, or just between animation frames) reads as a real faceted gem
// from whichever angle it happens to be at, not a fixed light/dark checkerboard.
const LIGHT_DIR: [number, number, number] = [-0.379, -0.531, 0.758];

// Diamond tier only: cycle through 3 warm gold/cream pairs across the great stellated
// dodecahedron's 12 faces instead of one flat colorDark/colorLight. Per-face lighting alone
// (shadeFor below) wasn't enough to make the foreground star point read as distinct from the
// rest of the shape — confirmed live and by direct user feedback — since it only varies
// brightness, and neighboring/overlapping facets can land at similar brightness anyway. Actual
// hue variation is a much more robust separator, and doubles as a genuine "sparkle/gem" look
// fitting for the top tier. Stays within the site's warm gold/cream family (no blue/purple).
const DIAMOND_PALETTE: [string, string][] = [
  ['#f8e8a0', '#fdf0c0'], // the tier's own base pair
  ['#e8c86a', '#f8e8a0'], // one shade richer, borrowed from Platinum's own ramp
  ['#fdf0c0', '#ffffff'], // brightest — the sparkle glints
];

function shadeFor(face: FaceGeometry, dark: string, light: string): string {
  const nx = face.matrix3d[8];
  const ny = face.matrix3d[9];
  const nz = face.matrix3d[10];
  const dot = nx * LIGHT_DIR[0] + ny * LIGHT_DIR[1] + nz * LIGHT_DIR[2];
  // A face pointing most directly at the viewer (normal.z near 1) gets an extra brightness
  // boost on top of the fixed-light term. Without this, the point of a star that's popping
  // straight out toward the camera isn't necessarily the brightest face on the solid (that
  // depends only on alignment with LIGHT_DIR), so on an overlapping shape like the great
  // stellated dodecahedron the foreground point didn't read as distinct from what's behind/
  // around it — confirmed live, it visually blended into the rest of the star.
  const viewBoost = Math.max(0, nz) * 0.3;
  const t = Math.max(0.12, Math.min(1, ((dot + 1) / 2) * 1.15 + viewBoost));
  return `color-mix(in srgb, ${light} ${round(t * 100)}%, ${dark})`;
}

function FaceDiv({ face, boxSize, dark, light, locked }: {
  face: FaceGeometry;
  boxSize: number;
  dark: string;
  light: string;
  locked: boolean;
}) {
  const background = locked
    ? shadeFor(face, 'rgba(42,37,28,0.35)', 'rgba(74,61,42,0.35)')
    : `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.18), transparent 55%), ${shadeFor(face, dark, light)}`;

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: boxSize,
        height: boxSize,
        marginLeft: round(-boxSize / 2),
        marginTop: round(-boxSize / 2),
        clipPath: clipPathFor(face, boxSize),
        background,
        border: locked ? '1px solid rgba(154,133,112,0.15)' : '1px solid rgba(200,155,60,0.45)',
        // Follows the face's own clipped silhouette (unlike box-shadow, which would draw a
        // rectangle) — gives every face a real dark edge against whatever sits behind it, so
        // overlapping facets (a star's foreground point over its background arms, on the great
        // stellated dodecahedron especially) read as separate depth layers instead of merging
        // into one flat-colored blob.
        filter: locked ? undefined : 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))',
        transform: `matrix3d(${face.matrix3d.join(',')})`,
        backfaceVisibility: 'hidden',
        // Hints the browser to keep a stable dedicated compositing layer for this face instead
        // of repeatedly promoting/demoting it during a long-running animation — the standard
        // mitigation for a real, confirmed Chrome bug where a 3D-transformed, backface-hidden
        // element inside a continuously-animating preserve-3d parent randomly drops out for a
        // frame or two after 30s-1min of spinning. Applied to every face (not just the animated
        // group) since it's the individually-transformed leaf elements that were flickering.
        willChange: 'transform',
      }}
    />
  );
}

function FaceGroup({ faces, tier, locked, spin, reverse }: {
  faces: FaceGeometry[];
  tier: StreakTier;
  locked: boolean;
  spin: boolean;
  reverse?: boolean;
}) {
  const boxSize = Math.max(...faces.map(boxSizeFor));
  const isDiamond = tier.solid === 'great-stellated-dodecahedron';
  return (
    <div
      className={spin ? 'gdt-badge-spin' : undefined}
      style={{
        position: 'absolute',
        inset: 0,
        transformStyle: 'preserve-3d',
        animationDirection: reverse ? 'reverse' : 'normal',
        animationPlayState: locked || !spin ? 'paused' : 'running',
        willChange: spin ? 'transform' : undefined,
      }}
    >
      {faces.map((face, i) => {
        const [dark, light] = isDiamond ? DIAMOND_PALETTE[i % DIAMOND_PALETTE.length] : [tier.colorDark, tier.colorLight];
        return <FaceDiv key={i} face={face} boxSize={boxSize} dark={dark} light={light} locked={locked} />;
      })}
    </div>
  );
}

/**
 * A real CSS 3D polyhedron per streak tier — complexity scales with tier (tetrahedron -> cube
 * -> octahedron -> dodecahedron -> icosahedron -> great stellated dodecahedron), all face
 * placement driven by the verified geometry in _lib/polyhedra.ts (v2 — full vertex-derived
 * matrix3d transforms, so every face's roll around its own normal is correct and neighboring
 * faces share edges, not just point the right general direction). No WebGL.
 *
 * Each face's box size is the solid's own `boxSizeFor` maximum across its faces, not one
 * constant for every solid — a dodecahedron's 12 faces or an icosahedron's 20 are naturally
 * much smaller relative to the sphere they sit on than a tetrahedron's 4.
 *
 * `locked`: desaturated grey faces, dimmed opacity, and the spin PAUSED (not just recolored) —
 * a static, dead badge reads as "not earned" more clearly than a still-spinning grey one.
 * `spin`: defaults to true (used on /profile). /dev/badges can pass false for a stable, static
 * render — much easier to check the raw geometry against, since it isn't a moving target.
 */
export default function PolyhedronBadge({
  tier,
  locked,
  size = 64,
  spin = true,
}: {
  tier: StreakTier;
  locked: boolean;
  size?: number;
  spin?: boolean;
}) {
  const isGSD = tier.solid === 'great-stellated-dodecahedron';
  const faces = isGSD ? greatStellatedDodecahedronFor(size) : solidFor(tier.solid as SolidName, size);

  return (
    <div
      role="img"
      aria-label={`${tier.label} badge${locked ? ` (locked — reach a ${tier.days}-day streak to earn it)` : ' (earned)'}`}
      style={{
        width: size,
        height: size,
        perspective: size * 3,
        opacity: locked ? 0.45 : 1,
      }}
    >
      <div style={{ width: '100%', height: '100%', position: 'relative', transformStyle: 'preserve-3d' }}>
        <FaceGroup faces={faces} tier={tier} locked={locked} spin={spin} />
      </div>
    </div>
  );
}
