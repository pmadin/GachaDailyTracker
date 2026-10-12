'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../_context/AuthContext';
import { fetchProfile } from '../_lib/api';
import VerifyEmailForm from '../_components/VerifyEmailForm';

export default function VerifyEmailPage() {
  const router = useRouter();
  const { token, user, login, isLoading: authLoading } = useAuth();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!token) { router.replace('/login'); return; }

    // The stored user can be stale (verified on another device), so ask the API.
    fetchProfile(token)
      .then(({ user: fresh }) => {
        if (user && fresh.email_verified !== user.email_verified) {
          login(token, { ...user, email_verified: fresh.email_verified });
        }
      })
      .catch(() => {})
      .finally(() => setChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, token]);

  if (authLoading || !token || !checked) {
    return <div className="min-h-[calc(100vh-3.5rem)]" />;
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {user?.email_verified === false ? (
          <VerifyEmailForm onVerified={() => router.push('/dashboard')} />
        ) : (
          <div className="text-center">
            <h1 className="mb-2 text-xl font-bold text-white">Email verified</h1>
            <p className="mb-6 text-sm" style={{ color: 'var(--text2)' }}>
              {user?.email} is confirmed. You&apos;re all set.
            </p>
            <Link
              href="/dashboard"
              className="inline-block rounded-lg px-6 py-2.5 text-sm font-medium hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
            >
              Go to My List
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
