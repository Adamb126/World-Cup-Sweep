import { NextResponse } from 'next/server';
import { getMatches } from '@/lib/football-api';
import { calculateScores } from '@/lib/scoring';
import type { StandingsResponse } from '@/lib/types';
import participants from '@/config/participants.json';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<StandingsResponse>> {
  try {
    const matches = await getMatches();
    const standings = calculateScores(matches, participants);

    return NextResponse.json({
      standings,
      matches,
      lastUpdated: new Date().toISOString(),
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/standings] Error:', message);

    return NextResponse.json({
      standings: [],
      matches: [],
      lastUpdated: null,
      error: message,
    });
  }
}
