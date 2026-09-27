'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { fetchNotificationPrefs, fetchEmailPreferences } from '../../_lib/api';
import { hasBrowserPushSubscription } from '../../_lib/push';

const DISMISS_KEY = 'gdt_setup_dismissed';

const noopSubscribe = () => () => {};
function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

interface Props {
  token: string;
  /** null while the schedule is still loading. */
  hasSchedule: boolean | null;
}

interface Item {
  key: string;
  label: string;
  hint: string;
  href: string;
  done: boolean;
}

export default function SetupChecklist({ token, hasSchedule }: Props) {
  const [push, setPush] = useState<boolean | null>(null);
  const [digest, setDigest] = useState<boolean | null>(null);
  // Hidden on the server render; the stored flag is read on the client without a setState-in-effect.
  const storedDismissed = useSyncExternalStore(noopSubscribe, readDismissed, () => true);
  const [justDismissed, setJustDismissed] = useState(false);
  const dismissed = storedDismissed || justDismissed;

  useEffect(() => {
    fetchNotificationPrefs(token)
      .then(async p => setPush(p.enabled ? await hasBrowserPushSubscription() : false))
      .catch(() => setPush(false));
    fetchEmailPreferences(token)
      .then(p => setDigest(p.email_digest_enabled))
      .catch(() => setDigest(false));
  }, [token]);

  // Wait for every check so the list never flashes a wrong state.
  if (dismissed || push === null || digest === null || hasSchedule === null) return null;

  const items: Item[] = [
    { key: 'push', label: 'Turn on reset reminders', hint: 'Push notifications on this device before a game resets', href: '/profile', done: push },
    { key: 'digest', label: 'Get the daily email digest', hint: 'One email a day with what resets today', href: '/profile', done: digest },
    { key: 'schedule', label: 'Plan your play times', hint: 'Pick windows for each game and get pinged when they open', href: '/schedule', done: hasSchedule },
  ];
  const doneCount = items.filter(i => i.done).length;
  if (doneCount === items.length) return null;

  function dismiss() {
    setJustDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // storage unavailable: hidden for this visit only
    }
  }

  return (
    <section
      style={{
        marginTop: 32,
        padding: '16px 18px',
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'var(--bg2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 11,
            letterSpacing: '0.08em',
            color: 'var(--gold-bright)',
            textTransform: 'uppercase',
          }}
        >
          Get more out of it · {doneCount}/{items.length}
        </span>
        <button
          onClick={dismiss}
          aria-label="Hide setup checklist"
          title="Hide"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text3)',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: 4,
          }}
        >
          ×
        </button>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map(item => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="popular-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 10px',
                textDecoration: 'none',
                opacity: item.done ? 0.5 : 1,
                pointerEvents: item.done ? 'none' : undefined,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 20,
                  height: 20,
                  flexShrink: 0,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: item.done ? '1px solid transparent' : '1px solid var(--border2)',
                  background: item.done ? 'linear-gradient(135deg, #c8913c, #e8c86a)' : 'transparent',
                  color: '#0a0808',
                }}
              >
                {item.done && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <polyline points="2,6 4.5,8.5 10,3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text)',
                    textDecoration: item.done ? 'line-through' : 'none',
                  }}
                >
                  {item.label}
                </span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)' }}>{item.hint}</span>
              </span>
              {!item.done && <span style={{ color: 'var(--gold-bright)', fontSize: 14, flexShrink: 0 }}>→</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
