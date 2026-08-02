import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  cloudProfileConfigured,
  passwordIsValid,
  sessionIsValid,
  sessionToken,
} from '@/lib/cloud-profile-server';

const COOKIE_NAME = 'fpl-ai-session';

export async function GET() {
  const store = await cookies();
  return NextResponse.json({
    configured: cloudProfileConfigured(),
    authenticated: sessionIsValid(store.get(COOKIE_NAME)?.value),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!passwordIsValid(String(body.password || ''))) {
    return NextResponse.json({ error: 'Нууц үг буруу байна.' }, { status: 401 });
  }
  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(COOKIE_NAME, sessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return response;
}
