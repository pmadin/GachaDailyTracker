'use client';

import { useEffect, useRef, useState, FormEvent } from 'react';
import { useAuth } from '../_context/AuthContext';
import { verifyEmail, resendVerificationCode } from '../_lib/api';
import { formatVerifyDeadline } from '../_lib/verifyDeadline';

const RESEND_COOLDOWN = 60;

interface Props {
  /** Seconds before "Resend" unlocks. Pass 60 right after a code was sent, 0 otherwise. */
  initialCooldown?: number;
  onVerified: () => void;
  /** Shows a "Skip for now" link when provided. */
  onSkip?: () => void;
}

export default function VerifyEmailForm({ initialCooldown = 0, onVerified, onSkip }: Props) {
  const { token, user, login } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(initialCooldown);
  const submittedFor = useRef('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const submit = async (value: string) => {
    if (!token || !user || loading) return;
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await verifyEmail(token, value);
      login(token, { ...user, email_verified: true });
      onVerified();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    // Auto-submit once all six digits are in (typed or pasted), but only once per value.
    if (digits.length === 6 && submittedFor.current !== digits) {
      submittedFor.current = digits;
      submit(digits);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (code.length === 6) {
      submittedFor.current = code;
      submit(code);
    }
  };

  const handleResend = async () => {
    if (!token || cooldown > 0 || resending) return;
    setError('');
    setNotice('');
    setResending(true);
    try {
      const res = await resendVerificationCode(token);
      setNotice(res.message);
      setCode('');
      submittedFor.current = '';
      setCooldown(RESEND_COOLDOWN);
    } catch (err: unknown) {
      const body = (err as { body?: { retry_after?: number; email_verified?: boolean } }).body;
      if (body?.email_verified && user) {
        login(token, { ...user, email_verified: true });
        onVerified();
        return;
      }
      if (body?.retry_after) setCooldown(body.retry_after);
      setError(err instanceof Error ? err.message : 'Could not send a new code');
    } finally {
      setResending(false);
    }
  };

  return (
    <div>
      <div
        className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl"
        style={{ background: 'rgba(200,155,60,0.10)', border: '1px solid rgba(200,155,60,0.20)' }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="6" width="18" height="13" rx="2" stroke="#c8913c" strokeWidth="1.5"/>
          <path d="M3 10l9 6 9-6" stroke="#c8913c" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <h1 className="mb-2 text-center text-xl font-bold text-white">Check your email</h1>
      <p className="mb-6 text-center text-sm" style={{ color: 'var(--text2)' }}>
        We sent a 6-digit code to{' '}
        <span style={{ color: 'var(--text)' }}>{user?.email ?? 'your email'}</span>.
        It expires in 10 minutes.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          value={code}
          onChange={e => handleChange(e.target.value)}
          aria-label="6-digit verification code"
          placeholder="000000"
          className="w-full rounded-lg px-4 py-3 text-center text-2xl outline-none font-jetbrains-mono"
          style={{
            background: 'rgba(8,8,8,0.8)',
            border: '1px solid rgba(200,155,60,0.18)',
            color: 'var(--gold-bright)',
            letterSpacing: '0.5em',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.18)')}
        />

        {error && (
          <p className="rounded-lg bg-red-950 px-4 py-2.5 text-sm text-red-400">{error}</p>
        )}
        {notice && !error && (
          <p className="text-center text-sm" style={{ color: 'var(--gold-bright)' }}>{notice}</p>
        )}

        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="rounded-lg py-2.5 text-sm font-medium transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
        >
          {loading ? 'Verifying…' : 'Verify email'}
        </button>
      </form>

      <div className="mt-5 flex items-center justify-center gap-4 text-sm">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          className="disabled:cursor-not-allowed"
          style={{ color: cooldown > 0 || resending ? 'var(--text3)' : 'var(--gold-bright)' }}
        >
          {resending ? 'Sending…' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
        {onSkip && (
          <>
            <span style={{ color: 'var(--text3)' }}>·</span>
            <button type="button" onClick={onSkip} style={{ color: 'var(--text2)' }}>
              Skip for now
            </button>
          </>
        )}
      </div>
      <p className="mt-4 text-center text-xs" style={{ color: 'var(--text3)' }}>
        Can&apos;t find it? Check your spam folder.
        {formatVerifyDeadline(user?.email_verify_deadline) && (
          <> Unverified accounts are deleted on {formatVerifyDeadline(user?.email_verify_deadline)}.</>
        )}
      </p>
    </div>
  );
}
