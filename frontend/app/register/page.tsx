'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../_context/AuthContext';
import { getAnonGameIds, clearAnonGames } from '../_lib/storage';
import VerifyEmailForm from '../_components/VerifyEmailForm';

const PASSWORD_RULES = [
  { label: 'At least 15 characters',        test: (p: string) => p.length >= 15 },
  { label: 'Lowercase letter (a–z)',         test: (p: string) => /[a-z]/.test(p) },
  { label: 'Uppercase letter (A–Z)',         test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Number (0–9)',                   test: (p: string) => /[0-9]/.test(p) },
  { label: 'Special character (!@#$%…)',     test: (p: string) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

export default function RegisterPage() {
  const router = useRouter();
  const { login: authLogin } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);
  // After the account is created, the same page swaps to the code entry step.
  const [verifyStep, setVerifyStep] = useState<null | { codeSent: boolean }>(null);

  const showChecklist = pwFocused || password.length > 0;
  const allRulesMet = PASSWORD_RULES.every(r => r.test(password));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setError('');
    setLoading(true);
    try {
      const anonGameIds = getAnonGameIds();

      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, confirmPassword: confirm, anonGameIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Registration failed');

      authLogin(data.token, data.user);

      if (data.synced) clearAnonGames();

      if (data.user?.email_verified === false) {
        setVerifyStep({ codeSent: data.verification_sent === true });
      } else {
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-8" style={{ position: 'relative', overflow: 'hidden' }}>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: "url('/kintsugi-veins-login-reg.svg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transform: 'rotate(-17deg) scale(1.5)',
          maskImage: 'radial-gradient(ellipse 60% 55% at 50% 50%, transparent 0%, rgba(0,0,0,0.6) 45%, black 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 60% 55% at 50% 50%, transparent 0%, rgba(0,0,0,0.6) 45%, black 75%)',
          opacity: 0.25,
          pointerEvents: 'none',
        }}
      />
      <div className="w-full max-w-sm" style={{ position: 'relative', zIndex: 1 }}>
        {verifyStep ? (
          <VerifyEmailForm
            initialCooldown={verifyStep.codeSent ? 60 : 0}
            onVerified={() => router.push('/dashboard')}
            onSkip={() => router.push('/dashboard')}
          />
        ) : (
        <>
        <h1 className="mb-6 text-center text-2xl font-bold text-white">Create account</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              minLength={5}
              maxLength={50}
              pattern="[a-zA-Z0-9_\-]+"
              title="Letters, numbers, underscores, and hyphens only"
              className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none"
              style={{ background: 'rgba(8,8,8,0.8)', border: '1px solid rgba(200,155,60,0.18)', color: 'var(--text)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.18)')}
              placeholder="Min 5 chars, letters/numbers/_-"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none"
              style={{ background: 'rgba(8,8,8,0.8)', border: '1px solid rgba(200,155,60,0.18)', color: 'var(--text)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.18)')}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none"
              style={{ background: 'rgba(8,8,8,0.8)', border: '1px solid rgba(200,155,60,0.18)', color: 'var(--text)' }}
              onFocus={e => { setPwFocused(true); e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)'; }}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.18)')}
              placeholder="Min 15 characters"
            />
            {showChecklist && (
              <ul className="mt-2 space-y-1 rounded-lg px-3 py-2" style={{ border: '1px solid rgba(200,155,60,0.10)', background: 'rgba(13,11,8,0.6)' }}>
                {PASSWORD_RULES.map(rule => {
                  const met = rule.test(password);
                  return (
                    <li key={rule.label} className="flex items-center gap-2 text-xs transition-colors" style={{ color: met ? 'var(--gold-bright)' : 'var(--text3)' }}>
                      <span className="text-[10px]">{met ? '✓' : '○'}</span>
                      {rule.label}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none"
              style={{ background: 'rgba(8,8,8,0.8)', border: '1px solid rgba(200,155,60,0.18)', color: 'var(--text)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.18)')}
              placeholder="••••••••"
            />
            {confirm.length > 0 && (
              <p className={`mt-1 text-xs ${confirm !== password ? 'text-red-400' : ''}`} style={confirm === password ? { color: 'var(--gold-bright)' } : undefined}>
                {confirm === password ? '✓ Passwords match' : '✗ Passwords do not match'}
              </p>
            )}
          </div>

          {error && (
            <p className="rounded-lg bg-red-950 px-4 py-2.5 text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !allRulesMet}
            className="rounded-lg py-2.5 text-sm font-medium transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--gold-bright)' }}>
            Sign in
          </Link>
        </p>
        </>
        )}
      </div>
    </div>
  );
}
