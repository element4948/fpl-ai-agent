import { createHmac, timingSafeEqual } from 'node:crypto';
import type { UserSettings } from '@/types/fpl';

const PROFILE_KEY = 'fpl-ai-agent:profile:v1';
const SESSION_VALUE = 'fpl-ai-agent-owner';

function config() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
    password: process.env.FPL_APP_PASSWORD || '',
    secret: process.env.FPL_SESSION_SECRET || '',
  };
}

export function cloudProfileConfigured() {
  const value = config();
  return Boolean(value.url && value.token && value.password && value.secret);
}

function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function passwordIsValid(password: string) {
  return cloudProfileConfigured() && equal(password, config().password);
}

export function sessionToken() {
  return createHmac('sha256', config().secret).update(SESSION_VALUE).digest('hex');
}

export function sessionIsValid(token?: string) {
  return Boolean(token && cloudProfileConfigured() && equal(token, sessionToken()));
}

async function redis(command: unknown[]) {
  const value = config();
  const response = await fetch(value.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${value.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Cloud profile storage failed (${response.status})`);
  return (await response.json()) as { result?: unknown };
}

export async function readCloudProfile(): Promise<UserSettings | null> {
  const response = await redis(['GET', PROFILE_KEY]);
  if (typeof response.result !== 'string') return null;
  return JSON.parse(response.result) as UserSettings;
}

export async function writeCloudProfile(settings: UserSettings) {
  await redis(['SET', PROFILE_KEY, JSON.stringify(settings)]);
}

export async function resetCloudProfile() {
  await redis(['DEL', PROFILE_KEY]);
}
