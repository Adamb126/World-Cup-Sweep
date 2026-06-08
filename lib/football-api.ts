import type { Match } from './types';

interface Cache {
  data: Match[] | null;
  fetchedAt: number | null;
}

const CACHE_TTL_DEFAULT = 60_000;  // 60 seconds normally
const CACHE_TTL_LIVE    = 30_000;  // 30 seconds when a match is in progress

const cache: Cache = {
  data: null,
  fetchedAt: null,
};

function isLiveMatch(m: Match): boolean {
  return m.status === 'IN_PLAY' || m.status === 'PAUSED';
}

function currentTTL(): number {
  if (cache.data && cache.data.some(isLiveMatch)) return CACHE_TTL_LIVE;
  return CACHE_TTL_DEFAULT;
}

export async function getMatches(): Promise<Match[]> {
  const now = Date.now();

  if (cache.data && cache.fetchedAt && now - cache.fetchedAt < currentTTL()) {
    return cache.data;
  }

  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    if (cache.data) {
      console.warn('[football-api] FOOTBALL_DATA_API_KEY not set, returning stale cache');
      return cache.data;
    }
    throw new Error('FOOTBALL_DATA_API_KEY environment variable is not set');
  }

  try {
    const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
      headers: { 'X-Auth-Token': apiKey },
      next: { revalidate: 0 }, // no Next.js cache — we manage TTL ourselves
    });

    if (!res.ok) {
      throw new Error(`Football-Data API returned ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();
    const matches: Match[] = json.matches ?? [];

    cache.data = matches;
    cache.fetchedAt = now;

    return matches;
  } catch (err) {
    if (cache.data) {
      console.error('[football-api] Fetch failed, returning stale cache:', err);
      return cache.data;
    }
    throw err;
  }
}
