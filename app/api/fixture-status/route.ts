import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getFixtures } from '@/lib/fpl';

const getFixtureStatus = unstable_cache(
  async () => {
    const fixtures = await getFixtures();
    const scheduled = (fixtures || []).filter((fixture) => !fixture.finished);
    return {
      fixtureReady: Boolean(fixtures?.length),
      fixtureCount: fixtures?.length || 0,
      scheduledFixtureCount: scheduled.length,
      fixtureSource: 'Official FPL fixtures API',
      fixtureUpdatedAt: new Date().toISOString(),
    };
  },
  ['fpl-fixture-status-v1'],
  { revalidate: 900 },
);

export async function GET() {
  return NextResponse.json(await getFixtureStatus(), {
    headers: {
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
    },
  });
}
