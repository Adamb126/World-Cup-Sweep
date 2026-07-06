import { NextResponse } from 'next/server';
import { getMatches } from '@/lib/football-api';

export const dynamic = 'force-dynamic';

// Debug endpoint — shows raw stage names and statuses coming from the API.
// Visit /api/debug in your browser to see what Football-Data.org is actually returning.
export async function GET() {
  try {
    const matches = await getMatches();

    const stages = [...new Set(matches.map(m => m.stage))].sort();
    const statuses = [...new Set(matches.map(m => m.status))].sort();

    const byStage = stages.map(stage => ({
      stage,
      count: matches.filter(m => m.stage === stage).length,
      sample: matches
        .filter(m => m.stage === stage)
        .slice(0, 2)
        .map(m => ({
          id: m.id,
          status: m.status,
          home: m.homeTeam.name,
          away: m.awayTeam.name,
          score: m.score.fullTime,
        })),
    }));

    const response = NextResponse.json({ stages, statuses, byStage, total: matches.length });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
