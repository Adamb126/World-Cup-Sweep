import type { Match, Participant, StandingsRow, ParticipantMatchPoints, MatchBonus } from './types';

// ============================================================
// SCORING CONSTANTS — edit these numbers to change the rules
// ============================================================
export const SCORING = {
  // Group stage
  GROUP_WIN: 3,
  GROUP_DRAW: 1,
  GROUP_LOSS: 0,
  // Group stage bonuses (per match)
  SCORED_3_PLUS_GOALS_BONUS: 2,   // team scored 3 or more goals in one match
  CLEAN_SHEET_BONUS: 1,            // team conceded 0 goals

  // Knockout stage milestones (total cumulative points at each stage)
  MILESTONE_ROUND_OF_16: 5,
  MILESTONE_QUARTER_FINAL: 10,
  MILESTONE_SEMI_FINAL: 15,
  MILESTONE_FINAL: 25,
  MILESTONE_WIN_WORLD_CUP: 40,

  // Individual match bonuses (knockout AND group stage)
  WIN_BY_3_OR_MORE: 3,             // winning margin >= 3 goals
  LAST_MINUTE_WINNER: 2,           // decisive goal scored 85th minute or later
  COMEBACK_WIN: 5,                 // team was losing, came back to win
  PENALTY_SHOOTOUT_WIN: 3,         // won via penalty shootout
};

// Maps stage string from Football-Data.org API to milestone value
const STAGE_MILESTONE: Record<string, number> = {
  ROUND_OF_16: SCORING.MILESTONE_ROUND_OF_16,
  QUARTER_FINALS: SCORING.MILESTONE_QUARTER_FINAL,
  SEMI_FINALS: SCORING.MILESTONE_SEMI_FINAL,
  THIRD_PLACE: SCORING.MILESTONE_SEMI_FINAL,
  FINAL: SCORING.MILESTONE_FINAL,
};

// Team name aliases: our config name → possible API names (all lowercased)
const TEAM_ALIASES: Record<string, string[]> = {
  'usa':                      ['united states', 'united states of america', 'usa', 'us'],
  'czechia':                  ['czech republic', 'czechia'],
  'bosnia and herzegovina':   ['bosnia-herzegovina', 'bosnia & herzegovina', 'bosnia and herzegovina'],
  'south korea':              ['korea republic', 'republic of korea', 'south korea'],
  'iran':                     ['ir iran', 'iran'],
  'ivory coast':              ["côte d'ivoire", 'ivory coast'],
};

function normalizeTeamName(name: string): string {
  return name.toLowerCase().trim();
}

function buildTeamLookup(participants: Participant[]): Map<string, string> {
  // Returns map of normalized team name variant → participant name
  const lookup = new Map<string, string>();

  for (const p of participants) {
    for (const team of p.teams) {
      const normalized = normalizeTeamName(team);
      lookup.set(normalized, p.name);

      // Add aliases
      const aliases = TEAM_ALIASES[normalized];
      if (aliases) {
        for (const alias of aliases) {
          lookup.set(alias, p.name);
        }
      }
    }
  }

  return lookup;
}

function findOwner(
  teamName: string,
  shortName: string,
  tla: string,
  lookup: Map<string, string>
): string | null {
  return (
    lookup.get(normalizeTeamName(teamName)) ??
    lookup.get(normalizeTeamName(shortName)) ??
    lookup.get(normalizeTeamName(tla)) ??
    null
  );
}

export function calculateScores(matches: Match[], participants: Participant[]): StandingsRow[] {
  const lookup = buildTeamLookup(participants);

  // participantName → points breakdown
  const matchPointsMap = new Map<string, ParticipantMatchPoints[]>();
  const milestonePtsMap = new Map<string, number>();
  // teamNormalizedName → highest milestone value already awarded
  const teamMilestoneReached = new Map<string, number>();

  for (const p of participants) {
    matchPointsMap.set(p.name, []);
    milestonePtsMap.set(p.name, 0);
  }

  const finishedMatches = matches.filter(m => m.status === 'FINISHED');

  for (const match of finishedMatches) {
    const homeOwner = findOwner(match.homeTeam.name, match.homeTeam.shortName, match.homeTeam.tla, lookup);
    const awayOwner = findOwner(match.awayTeam.name, match.awayTeam.shortName, match.awayTeam.tla, lookup);

    const homeScore = match.score.fullTime.home ?? 0;
    const awayScore = match.score.fullTime.away ?? 0;
    const winner = match.score.winner;
    const isGroupStage = match.stage === 'GROUP_STAGE';
    const isPenaltyShootout = match.score.duration === 'PENALTY_SHOOTOUT';

    // --- Milestone tracking (award when team first appears in this stage) ---
    const milestoneValue = STAGE_MILESTONE[match.stage];
    if (milestoneValue !== undefined) {
      for (const [teamObj, owner] of [
        [match.homeTeam, homeOwner],
        [match.awayTeam, awayOwner],
      ] as [{ name: string }, string | null][]) {
        if (!owner) continue;
        const key = normalizeTeamName(teamObj.name);
        const alreadyAwarded = teamMilestoneReached.get(key) ?? 0;
        if (milestoneValue > alreadyAwarded) {
          const increment = milestoneValue - alreadyAwarded;
          teamMilestoneReached.set(key, milestoneValue);
          milestonePtsMap.set(owner, (milestonePtsMap.get(owner) ?? 0) + increment);
        }
      }
    }

    // --- Award World Cup winner milestone ---
    if (match.stage === 'FINAL' && winner) {
      const winnerTeam = winner === 'HOME_TEAM' ? match.homeTeam : match.awayTeam;
      const winnerOwner = winner === 'HOME_TEAM' ? homeOwner : awayOwner;
      if (winnerOwner) {
        const key = normalizeTeamName(winnerTeam.name);
        const alreadyAwarded = teamMilestoneReached.get(key) ?? 0;
        const wcValue = SCORING.MILESTONE_WIN_WORLD_CUP;
        if (wcValue > alreadyAwarded) {
          const increment = wcValue - alreadyAwarded;
          teamMilestoneReached.set(key, wcValue);
          milestonePtsMap.set(winnerOwner, (milestonePtsMap.get(winnerOwner) ?? 0) + increment);
        }
      }
    }

    // --- Per-match points ---
    const processTeam = (
      owner: string | null,
      teamName: string,
      scored: number,
      conceded: number,
      isWinner: boolean,
      isDraw: boolean,
    ) => {
      if (!owner) return;

      let basePoints = 0;
      const bonuses: MatchBonus[] = [];

      if (isGroupStage) {
        if (isWinner) basePoints = SCORING.GROUP_WIN;
        else if (isDraw) basePoints = SCORING.GROUP_DRAW;
        else basePoints = SCORING.GROUP_LOSS;

        if (scored >= 3) {
          bonuses.push({ type: 'SCORED_3_PLUS', description: 'Scored 3+ goals', points: SCORING.SCORED_3_PLUS_GOALS_BONUS });
        }
        if (conceded === 0) {
          bonuses.push({ type: 'CLEAN_SHEET', description: 'Clean sheet', points: SCORING.CLEAN_SHEET_BONUS });
        }
      } else {
        // Knockout stage — only winner gets points
        if (isWinner) basePoints = SCORING.GROUP_WIN; // 3 pts for winning
      }

      // Bonuses applicable to both stages
      if (isWinner) {
        const margin = scored - conceded;
        if (margin >= 3) {
          bonuses.push({ type: 'WIN_BY_3', description: 'Won by 3+ goals', points: SCORING.WIN_BY_3_OR_MORE });
        }
        if (isPenaltyShootout) {
          bonuses.push({ type: 'PENALTY_SHOOTOUT', description: 'Penalty shootout win', points: SCORING.PENALTY_SHOOTOUT_WIN });
        }
      }

      const entry: ParticipantMatchPoints = {
        matchId: match.id,
        teamName,
        basePoints,
        bonuses,
        total: basePoints + bonuses.reduce((s, b) => s + b.points, 0),
      };

      matchPointsMap.get(owner)!.push(entry);
    };

    const homeIsWinner = winner === 'HOME_TEAM';
    const awayIsWinner = winner === 'AWAY_TEAM';
    const isDraw = winner === 'DRAW';

    processTeam(homeOwner, match.homeTeam.name, homeScore, awayScore, homeIsWinner, isDraw);
    processTeam(awayOwner, match.awayTeam.name, awayScore, homeScore, awayIsWinner, isDraw);

    // --- Goal-by-goal bonuses (last minute winner + comeback) ---
    if (match.goals && match.goals.length > 0) {
      const goals = match.goals;

      // Determine which team won (or skip if draw)
      if (winner === 'HOME_TEAM' || winner === 'AWAY_TEAM') {
        const winnerTeamId = winner === 'HOME_TEAM' ? match.homeTeam.id : match.awayTeam.id;
        const winnerOwner = winner === 'HOME_TEAM' ? homeOwner : awayOwner;
        const winnerTeamName = winner === 'HOME_TEAM' ? match.homeTeam.name : match.awayTeam.name;

        if (winnerOwner) {
          // Last-minute winner: a goal at 85+ that made the winning difference
          // Find last goal scored
          const lastGoal = [...goals].reverse().find(g => g.type !== 'OWN_GOAL' || true);
          if (lastGoal) {
            const effectiveMinute = lastGoal.minute + (lastGoal.extraTime ?? 0);
            if (effectiveMinute >= 85 && lastGoal.team.id === winnerTeamId) {
              // Check if this goal was the decisive one (before it, scores were level or loser was winning)
              let homeGoals = 0;
              let awayGoals = 0;
              for (const g of goals) {
                if (g === lastGoal) break;
                if (g.type === 'OWN_GOAL') {
                  if (g.team.id === match.homeTeam.id) awayGoals++; else homeGoals++;
                } else {
                  if (g.team.id === match.homeTeam.id) homeGoals++; else awayGoals++;
                }
              }
              const homeLeadBefore = homeGoals - awayGoals;
              const isDecisive =
                (winner === 'HOME_TEAM' && homeLeadBefore <= 0) ||
                (winner === 'AWAY_TEAM' && homeLeadBefore >= 0);

              if (isDecisive) {
                const existing = matchPointsMap.get(winnerOwner)!.find(
                  e => e.matchId === match.id && e.teamName === winnerTeamName
                );
                if (existing) {
                  existing.bonuses.push({
                    type: 'LAST_MINUTE_WINNER',
                    description: `Last-minute winner (${effectiveMinute}')`,
                    points: SCORING.LAST_MINUTE_WINNER,
                  });
                  existing.total += SCORING.LAST_MINUTE_WINNER;
                }
              }
            }
          }

          // Comeback win: winner was losing at some point
          let homeG = 0, awayG = 0;
          let winnerWasLosing = false;
          for (const g of goals) {
            if (g.type === 'OWN_GOAL') {
              if (g.team.id === match.homeTeam.id) awayG++; else homeG++;
            } else {
              if (g.team.id === match.homeTeam.id) homeG++; else awayG++;
            }
            if (winner === 'HOME_TEAM' && homeG < awayG) winnerWasLosing = true;
            if (winner === 'AWAY_TEAM' && awayG < homeG) winnerWasLosing = true;
          }

          if (winnerWasLosing) {
            const existing = matchPointsMap.get(winnerOwner)!.find(
              e => e.matchId === match.id && e.teamName === winnerTeamName
            );
            if (existing) {
              existing.bonuses.push({
                type: 'COMEBACK_WIN',
                description: 'Comeback win',
                points: SCORING.COMEBACK_WIN,
              });
              existing.total += SCORING.COMEBACK_WIN;
            }
          }
        }
      }
    } else if (match.goals === undefined || match.goals === null) {
      // Goal data not available — skip last-minute winner and comeback bonuses gracefully
      console.log(`[scoring] Match ${match.id}: goal-by-goal data not available, skipping last-minute/comeback bonuses`);
    }
  }

  // Build final standings
  const rows: StandingsRow[] = participants.map(p => {
    const matchPts = matchPointsMap.get(p.name) ?? [];
    const matchTotal = matchPts.reduce((s, m) => s + m.total, 0);
    const milestonePts = milestonePtsMap.get(p.name) ?? 0;

    return {
      rank: 0,
      participant: p,
      points: matchTotal + milestonePts,
      matchPoints: matchPts,
      milestonePoints: milestonePts,
    };
  });

  // Sort by points descending, ties broken alphabetically
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.participant.name.localeCompare(b.participant.name);
  });

  // Assign ranks (ties get same rank, next rank skips)
  let currentRank = 1;
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && rows[i].points === rows[i - 1].points) {
      rows[i].rank = rows[i - 1].rank;
    } else {
      rows[i].rank = currentRank;
    }
    currentRank++;
  }

  return rows;
}
