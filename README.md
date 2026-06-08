# World Cup 2026 Sweepstake

Live standings website for the World Cup 2026 sweepstake, built with Next.js, TypeScript, and Tailwind CSS.

## Setup

### 1. Get a Football-Data.org API key

1. Go to [football-data.org](https://www.football-data.org)
2. Click **Client** → **Register**
3. The free tier includes access to major competitions including the World Cup
4. Copy your API key from the dashboard

### 2. Run locally

```bash
cp .env.example .env.local
# Edit .env.local and replace "your_key_here" with your actual API key
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 3. Edit participants

Open `config/participants.json` and edit the array. Each entry must have:

```json
{ "name": "PlayerName", "teams": ["Team1", "Team2"] }
```

Team names should match how Football-Data.org spells them. Known aliases already handled:
- `"USA"` -> mapped to `"United States"` in the API
- `"Czechia"` -> mapped to `"Czech Republic"` in the API
- `"Bosnia and Herzegovina"` -> mapped to `"Bosnia-Herzegovina"` in the API

### 4. Deploy to Vercel

1. Push your code to a GitHub repository
2. Go to [vercel.com](https://vercel.com) -> **New Project** -> Import from GitHub
3. In **Environment Variables**, add:
   - Key: `FOOTBALL_DATA_API_KEY`
   - Value: your API key from step 1
4. Click **Deploy**

The site polls the API every 5 minutes (cached server-side) and the browser refreshes every 3 minutes.

### 5. Adjust scoring rules

Open `lib/scoring.ts` and edit the `SCORING` constants at the top of the file:

```typescript
export const SCORING = {
  GROUP_WIN: 3,
  GROUP_DRAW: 1,
  // ... etc
};
```

No other changes needed -- the rest of the code reads from these constants.

## Scoring Rules

### Group Stage (per match)
- Team wins: **3 pts**
- Team draws: **1 pt**
- Team scores 3+ goals in a match: **+2 pts bonus**
- Team keeps clean sheet: **+1 pt bonus**

### Knockout Stage
- Winning a match: **3 pts**
- Win by 3+ goals: **+3 pts bonus**
- Penalty shootout win: **+3 pts bonus**
- Comeback win (was losing, won the match): **+5 pts bonus**
- Last-minute winner (decisive goal at 85'+): **+2 pts bonus**

### Milestones (awarded once per team)
| Stage reached | Points awarded |
|---|---|
| Round of 16 | 5 pts |
| Quarter Final | 10 pts |
| Semi Final | 15 pts |
| Final | 25 pts |
| Win World Cup | 40 pts |

Milestones are cumulative -- a team that reaches the Final earns 5+10+15+25 = 55 pts total in milestones, plus 40 for winning = 95 total milestone pts if they win.
