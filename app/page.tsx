'use client';

import { useEffect, useState, useCallback } from 'react';
import type { StandingsResponse, Match, StandingsRow } from '@/lib/types';

const POLL_INTERVAL_DEFAULT = 60_000;  // 60 seconds normally
const POLL_INTERVAL_LIVE    = 30_000;  // 30 seconds when a match is live

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 minute ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return '1 hour ago';
  return `${hours} hours ago`;
}

function getRankStyle(rank: number): string {
  if (rank === 1) return 'bg-yellow-50 border-l-4 border-yellow-400';
  if (rank === 2) return 'bg-gray-50 border-l-4 border-gray-400';
  if (rank === 3) return 'bg-orange-50 border-l-4 border-amber-600';
  return '';
}

function getRankBadge(rank: number) {
  if (rank === 1) return <span className="text-yellow-500 font-bold text-lg">🥇</span>;
  if (rank === 2) return <span className="text-gray-400 font-bold text-lg">🥈</span>;
  if (rank === 3) return <span className="text-amber-700 font-bold text-lg">🥉</span>;
  return <span className="text-gray-600 font-semibold">{rank}</span>;
}

function MatchStatusBadge({ status }: { status: string }) {
  if (status === 'FINISHED') {
    return <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">FT</span>;
  }
  if (status === 'IN_PLAY' || status === 'PAUSED') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-500 text-white animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />
        LIVE
      </span>
    );
  }
  return <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">{status === 'TIMED' ? 'Soon' : 'Sched.'}</span>;
}

// Human-readable labels for each bonus/base point type
const POINT_TYPE_LABELS: Record<string, string> = {
  WIN:              'Match win',
  DRAW:             'Draw',
  SCORED_3_PLUS:    'Scored 3+ goals',
  CLEAN_SHEET:      'Clean sheet',
  WIN_BY_3:         'Won by 3+ goals',
  PENALTY_SHOOTOUT: 'Penalty shootout win',
  COMEBACK_WIN:     'Comeback win',
  LAST_MINUTE_WINNER: 'Last-minute winner',
};

function summariseBreakdown(row: StandingsRow): { label: string; pts: number }[] {
  const totals = new Map<string, number>();

  for (const mp of row.matchPoints) {
    if (mp.basePoints > 0) {
      const key = mp.basePoints === 1 ? 'DRAW' : 'WIN';
      totals.set(key, (totals.get(key) ?? 0) + mp.basePoints);
    }
    for (const b of mp.bonuses) {
      totals.set(b.type, (totals.get(b.type) ?? 0) + b.points);
    }
  }

  if (row.milestonePoints > 0) {
    totals.set('MILESTONE', row.milestonePoints);
  }

  return [...totals.entries()]
    .map(([type, pts]) => ({
      label: type === 'MILESTONE' ? 'Knockout stage milestones' : (POINT_TYPE_LABELS[type] ?? type),
      pts,
    }))
    .sort((a, b) => b.pts - a.pts);
}

function PointsBreakdown({ row }: { row: StandingsRow }) {
  const items = summariseBreakdown(row);
  if (items.length === 0) {
    return <p className="text-xs text-gray-400 italic px-4 pb-3">No points yet — tournament hasn&apos;t started.</p>;
  }
  return (
    <div className="px-4 pb-3 pt-1">
      <div className="flex flex-wrap gap-2">
        {items.map(({ label, pts }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100"
          >
            <span className="font-bold">+{pts}</span>
            <span>{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3"><div className="h-4 w-6 bg-gray-200 rounded" /></td>
      <td className="px-4 py-3"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
      <td className="px-4 py-3"><div className="h-4 w-32 bg-gray-200 rounded" /></td>
      <td className="px-4 py-3"><div className="h-4 w-12 bg-gray-200 rounded" /></td>
    </tr>
  );
}

function groupMatchesByDate(matches: Match[]): Record<string, Match[]> {
  const groups: Record<string, Match[]> = {};
  for (const m of matches) {
    const date = new Date(m.utcDate).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    if (!groups[date]) groups[date] = [];
    groups[date].push(m);
  }
  return groups;
}

function getRecentMatches(matches: Match[]): Match[] {
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const live = matches.filter(m => m.status === 'IN_PLAY' || m.status === 'PAUSED');
  const recent = matches.filter(
    m => m.status === 'FINISHED' && new Date(m.utcDate).getTime() >= threeDaysAgo
  );
  const upcoming = matches.filter(
    m => (m.status === 'SCHEDULED' || m.status === 'TIMED') && new Date(m.utcDate).getTime() <= Date.now() + 24 * 60 * 60 * 1000
  );

  const combined = [...live, ...recent, ...upcoming];
  const seen = new Set<number>();
  return combined.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; })
    .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime());
}

export default function Home() {
  const [data, setData] = useState<StandingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(new Date());
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/standings');
      const json: StandingsResponse = await res.json();
      setData(json);
      setFetchedAt(new Date());
    } catch (err) {
      console.error('Failed to fetch standings:', err);
      setData(prev => prev ? { ...prev, error: 'Failed to refresh data' } : {
        standings: [], matches: [], lastUpdated: null, error: 'Failed to load data',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Adaptive polling: fast when a match is live, slower otherwise
  const hasLiveMatch = data?.matches.some(
    m => m.status === 'IN_PLAY' || m.status === 'PAUSED'
  ) ?? false;
  const pollInterval = hasLiveMatch ? POLL_INTERVAL_LIVE : POLL_INTERVAL_DEFAULT;

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(fetchData, pollInterval);
    return () => clearInterval(interval);
  }, [fetchData, pollInterval]);

  // Update "X minutes ago" every minute
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const recentMatches = data ? getRecentMatches(data.matches) : [];
  const matchGroups = groupMatchesByDate(recentMatches);

  const timeAgo = fetchedAt
    ? (() => {
        const diff = now.getTime() - fetchedAt.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins === 1) return '1 minute ago';
        return `${mins} minutes ago`;
      })()
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header style={{ backgroundColor: '#1a237e' }} className="text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <span className="text-4xl">⚽</span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#ffd700' }}>
                World Cup 2026 Sweepstake
              </h1>
              <p className="text-blue-200 text-sm mt-0.5">Live standings &amp; results</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-10">
        {/* Error banner */}
        {data?.error && (
          <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-lg px-4 py-3 flex items-start gap-2">
            <span className="text-yellow-500 mt-0.5">⚠</span>
            <div>
              <p className="font-medium">Data issue</p>
              <p className="text-sm">{data.error}</p>
            </div>
          </div>
        )}

        {/* Standings */}
        <section>
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span>🏆</span> Standings
          </h2>
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr style={{ backgroundColor: '#1a237e' }}>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-blue-200 uppercase tracking-wider w-12">Rank</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-blue-200 uppercase tracking-wider">Participant</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-blue-200 uppercase tracking-wider">Teams</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-blue-200 uppercase tracking-wider pr-6">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading
                    ? Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
                    : data?.standings.map(row => {
                        const isExpanded = expandedRow === row.participant.name;
                        return (
                          <>
                            <tr
                              key={row.participant.name}
                              className={`transition-colors cursor-pointer hover:brightness-95 ${getRankStyle(row.rank)}`}
                              onClick={() => setExpandedRow(isExpanded ? null : row.participant.name)}
                            >
                              <td className="px-4 py-3 text-center w-12">
                                {getRankBadge(row.rank)}
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-semibold text-gray-900">{row.participant.name}</span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {row.participant.teams.map(team => (
                                    <span
                                      key={team}
                                      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                                    >
                                      {team}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right pr-4">
                                <div className="flex items-center justify-end gap-2">
                                  <span className="text-lg font-bold text-gray-900">{row.points} pts</span>
                                  <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${row.participant.name}-breakdown`} className={getRankStyle(row.rank)}>
                                <td colSpan={4} className="pb-2">
                                  <PointsBreakdown row={row} />
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Recent Matches */}
        {recentMatches.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span>📅</span> Recent &amp; Live Matches
            </h2>
            <div className="space-y-6">
              {Object.entries(matchGroups).map(([date, dayMatches]) => (
                <div key={date}>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">{date}</h3>
                  <div className="space-y-2">
                    {dayMatches.map(match => (
                      <div key={match.id} className="bg-white rounded-lg shadow-sm border border-gray-100 px-4 py-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {match.homeTeam.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {match.status === 'FINISHED' || match.status === 'IN_PLAY' || match.status === 'PAUSED' ? (
                              <span className="text-lg font-bold text-gray-900 tabular-nums">
                                {match.score.fullTime.home ?? 0} – {match.score.fullTime.away ?? 0}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400 font-medium">
                                {new Date(match.utcDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                            <MatchStatusBadge status={match.status} />
                          </div>

                          <div className="flex items-center gap-2 min-w-0 justify-end">
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {match.awayTeam.name}
                            </span>
                          </div>
                        </div>

                        {match.group && (
                          <p className="text-xs text-gray-400 mt-1">{match.group.replace(/_/g, ' ')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between text-xs text-gray-400">
          <span>World Cup 2026 Sweepstake</span>
          <span>
            {timeAgo ? `Updated ${timeAgo}` : 'Loading...'}
            {' · '}
            <button
              onClick={fetchData}
              className="underline hover:text-gray-600 transition-colors"
            >
              Refresh
            </button>
          </span>
        </div>
      </footer>
    </div>
  );
}
