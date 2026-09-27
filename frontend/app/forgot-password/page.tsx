'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/gdt/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Ignore errors — always show success to prevent enumeration
    }
    setSubmitted(true);
    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div
            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl"
            style={{ background: 'rgba(200,155,60,0.10)', border: '1px solid rgba(200,155,60,0.20)' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="6" width="18" height="13" rx="2" stroke="#c8913c" strokeWidth="1.5"/>
              <path d="M3 10l9 6 9-6" stroke="#c8913c" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="mb-2 text-xl font-bold text-white">Check your email</h1>
          <p className="mb-1 text-sm" style={{ color: 'var(--text2)' }}>
            If an account exists for{' '}
            <span className="text-white">{email}</span>,
          </p>
          <p className="mb-4 text-sm" style={{ color: 'var(--text2)' }}>
            a reset link has been sent. It expires in 30 minutes.
          </p>
          <div
            className="mb-6 rounded-lg px-4 py-3 text-left text-sm"
            style={{ border: '1px solid rgba(200,155,60,0.28)', background: 'rgba(200,155,60,0.06)', color: 'var(--text)' }}
          >
            <span className="font-semibold" style={{ color: 'var(--gold-bright)' }}>Not in your inbox?</span>{' '}
            Check your spam or junk folder. Some providers (Gmail especially) filter it there. Marking it
            as &quot;Not spam&quot; helps future emails arrive normally.
          </div>
          <Link
            href="/login"
            className="text-sm transition-colors"
            style={{ color: 'var(--text3)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text2)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}
          >
            &larr; Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4" style={{ position: 'relative', overflow: 'hidden' }}>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: "url('/kintsugi-veins-login-reg.svg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          maskImage: 'radial-gradient(ellipse 60% 55% at 50% 50%, transparent 0%, rgba(0,0,0,0.6) 45%, black 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 60% 55% at 50% 50%, transparent 0%, rgba(0,0,0,0.6) 45%, black 75%)',
          opacity: 0.25,
          pointerEvents: 'none',
        }}
      />
      <div className="w-full max-w-sm" style={{ position: 'relative', zIndex: 1 }}>
        <h1 className="mb-2 text-center text-2xl font-bold text-white">Forgot password?</h1>
        <p className="mb-6 text-center text-sm" style={{ color: 'var(--text2)' }}>
          Enter your email and we&apos;ll send you a reset link. If it doesn&apos;t show up, check your spam folder.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-sm" style={{ color: 'var(--text2)' }}>Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none"
              style={{ background: 'rgba(8,8,8,0.8)', border: '1px solid rgba(200,155,60,0.18)', color: 'var(--text)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.18)')}
            />
          </div>

          <button
            type="submit"
            disabled={!email || loading}
            className="rounded-lg py-2.5 text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
          >
            {loading ? 'Sending…' : 'Send Reset Link'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--text3)' }}>
          <Link
            href="/login"
            className="transition-colors"
            style={{ color: 'var(--text3)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text2)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}
          >
            &larr; Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
