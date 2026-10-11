'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../_context/AuthContext';
import { formatVerifyDeadline } from '../_lib/verifyDeadline';

const DISMISS_KEY = 'gdt_verify_banner_dismissed';
// Pages that already show the code form.
const HIDDEN_ON = ['/register', '/verify-email'];

export default function VerifyEmailBanner() {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  // Read lazily: the banner renders nothing until auth has loaded on the client, so the
  // server/client difference here never reaches the DOM.
  const [dismissed, setDismissed] = useState(() => {
    try {
      return typeof window !== 'undefined' && sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false; // storage blocked: banner just stays visible
    }
  });

  if (isLoading || !user || user.email_verified !== false || dismissed) return null;
  if (HIDDEN_ON.includes(pathname)) return null;
  // /profile shows the full deletion countdown card instead.
  if (pathname === '/profile' && user.email_verify_deadline) return null;

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  };

  const deadline = formatVerifyDeadline(user.email_verify_deadline);

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 px-4 py-2 text-xs sm:text-sm"
      style={{ background: 'rgba(200,145,60,0.08)', borderBottom: '1px solid var(--border2)', color: 'var(--text2)' }}
    >
      <span>
        {deadline ? (
          <>
            Verify <span style={{ color: 'var(--text)' }}>{user.email}</span> by{' '}
            <span style={{ color: 'var(--text)' }}>{deadline}</span> or this account will be deleted.
          </>
        ) : (
          <>Please verify <span style={{ color: 'var(--text)' }}>{user.email}</span> to unlock badges, the scheduler and email reminders.</>
        )}
      </span>
      <Link href="/verify-email" className="shrink-0 font-medium" style={{ color: 'var(--gold-bright)' }}>
        Enter code
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hide for now"
        className="shrink-0 px-1"
        style={{ color: 'var(--text3)' }}
      >
        ✕
      </button>
    </div>
  );
}
