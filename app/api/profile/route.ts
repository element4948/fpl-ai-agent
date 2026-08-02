import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { defaultSettings } from '@/lib/storage';
import {
  cloudProfileConfigured,
  readCloudProfile,
  resetCloudProfile,
  sessionIsValid,
  writeCloudProfile,
} from '@/lib/cloud-profile-server';
import type { UserSettings } from '@/types/fpl';

async function authorized() {
  const store = await cookies();
  return sessionIsValid(store.get('fpl-ai-session')?.value);
}

function unavailable() {
  return NextResponse.json({ error: 'Cloud sync тохируулаагүй байна.' }, { status: 503 });
}

export async function GET() {
  if (!cloudProfileConfigured()) return unavailable();
  if (!(await authorized())) return NextResponse.json({ error: 'Нэвтэрнэ үү.' }, { status: 401 });
  return NextResponse.json({ settings: await readCloudProfile() });
}

export async function PUT(request: Request) {
  if (!cloudProfileConfigured()) return unavailable();
  if (!(await authorized())) return NextResponse.json({ error: 'Нэвтэрнэ үү.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const settings: UserSettings = { ...defaultSettings, ...(body.settings || {}) };
  await writeCloudProfile(settings);
  return NextResponse.json({ saved: true, settings });
}

export async function DELETE() {
  if (!cloudProfileConfigured()) return unavailable();
  if (!(await authorized())) return NextResponse.json({ error: 'Нэвтэрнэ үү.' }, { status: 401 });
  await resetCloudProfile();
  return NextResponse.json({ reset: true, settings: defaultSettings });
}
