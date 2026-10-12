import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const REGISTRATION_TOKEN = process.env.REGISTRATION_TOKEN ?? '';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { anonGameIds, ...registrationFields } = body;

    // 1. Register — inject the token server-side so it's never in the client bundle
    const registerRes = await fetch(`${API_URL}/gdt/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...registrationFields, registrationToken: REGISTRATION_TOKEN }),
    });

    const registerData = await registerRes.json();

    if (!registerRes.ok) {
      return NextResponse.json(registerData, { status: registerRes.status });
    }

    // 2. Auto-login to get JWT (register endpoint doesn't return a token)
    const loginRes = await fetch(`${API_URL}/gdt/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: registrationFields.email, password: registrationFields.password }),
    });

    const loginData = await loginRes.json();

    if (!loginRes.ok) {
      return NextResponse.json({ error: 'Account created but login failed. Please sign in manually.' }, { status: 500 });
    }

    // 3. Bulk-sync anon games server-side (avoids any CORS issues on the client)
    let synced = false;
    if (Array.isArray(anonGameIds) && anonGameIds.length > 0) {
      try {
        await fetch(`${API_URL}/gdt/tracker/games/bulk`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${loginData.token}`,
          },
          body: JSON.stringify({ gameIds: anonGameIds }),
        });
        synced = true;
      } catch {
        // Non-fatal — client still gets a valid token and can retry
      }
    }

    return NextResponse.json({
      token: loginData.token,
      user: loginData.user,
      synced,
      verification_sent: registerData.verification_sent === true,
    });
  } catch {
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
