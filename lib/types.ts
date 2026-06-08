export interface Participant {
  name: string;
  teams: string[];
}

export interface Goal {
  minute: number;
  extraTime?: number;
  team: { id: number; name: string; shortName: string; tla: string };
  scorer: { id: number; name: string };
  type: string; // "NORMAL", "OWN_GOAL", "PENALTY"
}

export interface Match {
  id: number;
  utcDate: string;
  status: string; // "SCHEDULED", "TIMED", "IN_PLAY", "PAUSED", "FINISHED", "SUSPENDED", "CANCELLED"
  stage: string; // "GROUP_STAGE", "ROUND_OF_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"
  group?: string;
  homeTeam: {
    id: number;
    name: string;
    shortName: string;
    tla: string;
    crest: string;
  };
  awayTeam: {
    id: number;
    name: string;
    shortName: string;
    tla: string;
    crest: string;
  };
  score: {
    winner: string | null; // "HOME_TEAM", "AWAY_TEAM", "DRAW", null
    duration: string; // "REGULAR", "EXTRA_TIME", "PENALTY_SHOOTOUT"
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
    regularTime?: { home: number | null; away: number | null };
    penalties?: { home: number | null; away: number | null };
  };
  goals?: Goal[];
}

export interface MatchBonus {
  type: string;
  description: string;
  points: number;
}

export interface ParticipantMatchPoints {
  matchId: number;
  teamName: string;
  basePoints: number;
  bonuses: MatchBonus[];
  total: number;
}

export interface StandingsRow {
  rank: number;
  participant: Participant;
  points: number;
  matchPoints: ParticipantMatchPoints[];
  milestonePoints: number;
}

export interface StandingsResponse {
  standings: StandingsRow[];
  matches: Match[];
  lastUpdated: string | null;
  error: string | null;
}
