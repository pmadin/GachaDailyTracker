import Link from 'next/link';

/**
 * Root not-found. Handles notFound() calls and every unmatched URL (single root layout, so no
 * global-not-found needed). Renders inside the normal Navbar/Footer. Server Component, no JS.
 *
 * Background reuses the kintsugi vein texture from the auth pages with its own rotation (180°)
 * so it doesn't mirror login (scaleX) / register (scaleY). Planned upgrade is a dazed chibi mascot
 * face with swirly eyes, see "404 mascot" in gdt-v5-notes.md.
 */
export default function NotFound() {
  return (
    <div
      className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-16"
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: "url('/kintsugi-veins-login-reg.svg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transform: 'rotate(180deg)',
          maskImage: 'radial-gradient(ellipse 60% 55% at 50% 50%, transparent 0%, rgba(0,0,0,0.6) 45%, black 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 60% 55% at 50% 50%, transparent 0%, rgba(0,0,0,0.6) 45%, black 75%)',
          opacity: 0.25,
          pointerEvents: 'none',
        }}
      />

      <div className="w-full max-w-md text-center" style={{ position: 'relative', zIndex: 1 }}>
        <p className="mb-4 text-xs tracking-[0.3em]" style={{ color: 'var(--text2)', fontFamily: 'var(--font-jetbrains-mono)' }}>
          — ERROR 404 —
        </p>

        {/* "404" with a gold kintsugi seam running through it */}
        <div className="relative mx-auto mb-6 w-fit select-none" aria-hidden="true">
          <span
            className="block text-[7rem] font-extrabold leading-none sm:text-[9rem]"
            style={{
              fontFamily: 'var(--font-display)',
              background: 'linear-gradient(135deg, #8a6020 0%, #c8913c 45%, #e8c86a 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            404
          </span>
          <svg
            viewBox="0 0 300 120"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <polyline
              points="14,62 31,58 44,66 63,61 78,71 96,55 104,58 121,47 139,63 152,60 166,49 181,57 197,70 214,64 229,52 246,61 263,57 286,66"
              fill="none"
              stroke="#e8c86a"
              strokeWidth="2"
              strokeLinejoin="round"
              style={{ filter: 'drop-shadow(0 0 4px rgba(232,200,106,0.7))' }}
            />
            <polyline
              points="121,47 126,36 134,30"
              fill="none"
              stroke="#c8913c"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <polyline
              points="197,70 203,81 212,86"
              fill="none"
              stroke="#c8913c"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="mb-2 text-2xl font-bold text-white">This banner has already ended.</h1>
        <p className="mb-8 text-sm" style={{ color: 'var(--text2)' }}>
          The page you&apos;re looking for doesn&apos;t exist or has moved. No pity counter here, but
          your dailies are still waiting.
        </p>

        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="w-full rounded-lg px-5 py-2.5 text-sm font-medium transition-colors hover:opacity-90 sm:w-auto"
            style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
          >
            Back to home
          </Link>
          <Link
            href="/games"
            className="w-full rounded-lg px-5 py-2.5 text-sm font-medium transition-colors hover:bg-[rgba(200,155,60,0.08)] sm:w-auto"
            style={{ border: '1px solid rgba(200,155,60,0.28)', color: 'var(--gold-bright)' }}
          >
            Browse games
          </Link>
        </div>
      </div>
    </div>
  );
}
