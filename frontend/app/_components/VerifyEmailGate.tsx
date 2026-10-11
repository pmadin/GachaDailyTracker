import Link from 'next/link';

interface Props {
  title: string;
  message: string;
}

/** Shown in place of a feature that needs a confirmed email. */
export default function VerifyEmailGate({ title, message }: Props) {
  return (
    <div
      className="mx-auto max-w-md rounded-xl p-6 text-center"
      style={{ border: '1px solid var(--border2)', background: 'var(--bg2)' }}
    >
      <div
        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ background: 'rgba(200,155,60,0.10)', border: '1px solid rgba(200,155,60,0.20)' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="2" stroke="#c8913c" strokeWidth="1.5" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="#c8913c" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <h2 className="mb-2 text-base font-semibold text-white">{title}</h2>
      <p className="mb-5 text-sm" style={{ color: 'var(--text2)' }}>{message}</p>
      <Link
        href="/verify-email"
        className="inline-block rounded-lg px-5 py-2 text-sm font-medium hover:opacity-90"
        style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
      >
        Verify email
      </Link>
    </div>
  );
}
