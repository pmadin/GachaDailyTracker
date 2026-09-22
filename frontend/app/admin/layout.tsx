'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../_context/AuthContext';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && (!user || user.role < 3)) {
      router.replace('/');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || user.role < 3) return null;

  const navLink = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`text-sm transition-colors ${active ? 'text-white' : 'text-zinc-400 hover:text-white'}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen">
      <div className="border-b" style={{ borderColor: 'rgba(200,155,60,0.10)', background: 'rgba(13,11,8,0.6)' }}>
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
          <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: 'rgba(200,155,60,0.12)', color: 'var(--gold-bright)' }}>
            Admin
          </span>
          {navLink('/admin', 'Overview')}
          {navLink('/admin/analytics', 'Analytics')}
          {navLink('/admin/games', 'Games')}
          {navLink('/admin/users', 'Users')}
          {navLink('/admin/submissions', 'Submissions')}
          {navLink('/admin/settings', 'Settings')}
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8">{children}</div>
    </div>
  );
}
