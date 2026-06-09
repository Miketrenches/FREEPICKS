# FREEPICKS

**World Cup 2026 × Pump.fun bounties.**
Pre-set parlays. Free to play. Winners split the pump.fun bounty pool.

## Run locally

No build step. Just open `index.html` in a browser.
(Or serve the folder with any static server: `python -m http.server`, `npx serve`, etc.)

## Files

```
Parlay/
├── index.html     single page, all views
├── styles.css     full stylesheet, sectioned
├── script.js      single IIFE, sectioned
├── data.js        editable copy + seed parlays + leaderboard
└── README.md
```

All editable copy lives in `data.js` under `window.FREEPICKS_DATA`. Edit there, refresh.

## Views

- `home`    — logo + tagline + 3 CTAs + stat strip
- `play`    — grid of open parlays (cards with bounty pool, legs, kickoff)
- `board`   — leaderboard
- `bounty`  — how the pump.fun bounty system works + steps
- modal     — parlay detail (legs + entry form)
- mod       — admin panel (Shift+M or `#mod`)

## Mod console

Press **Shift+M** anywhere on the site (or visit `/#mod`) to open the local mod console.
Tabs:

- **BOUNTIES** — open / lock / mark won / mark lost / delete each parlay
- **ENTRIES**  — view & remove user picks
- **LEADERBOARD** — bump bounties / hits / remove rows
- **DANGER**   — wipe local state and reload seed

All state is stored in `localStorage` under `parlay:state:v1` — no backend required.

## Adding a new parlay

Edit `data.js` → `parlays[]`. Each parlay:

```js
{
  id: "wc26-009",                    // unique
  title: "MY NEW CARD",
  subtitle: "GROUP F · 3 LEGS",
  legs: 3,
  difficulty: "MEDIUM",              // EASY | MEDIUM | HARD | DEGEN
  bountyPool: 5,
  bountyToken: "SOL",
  pumpfunUrl: "https://pump.fun/...",
  kickoff: "2026-06-22T19:00:00Z",   // ISO
  status: "open",                    // open | locked | won | lost
  legsList: [
    { match: "BRA vs ARG", pick: "BRAZIL TO WIN", odds: "+150" },
    ...
  ],
  accent: "pink",                    // pink | cyan | green | yellow
}
```

To pick up new defaults after editing `data.js`, open mod (Shift+M) → DANGER → WIPE LOCAL STATE.

## Going multi-user (later)

The site currently runs entirely client-side. To add shared state across visitors:

1. Add `api/state.js` and `api/submit.js` as Vercel serverless functions backed by Upstash Redis.
2. Replace `loadState` / `saveState` in `script.js` with `fetch("/api/state")` and `fetch("/api/submit", ...)`.
3. Single Redis key `parlay:state:v1` storing the full state blob keeps it atomic.
4. Required env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `MOD_PASSWORD`.

## Deploy

1. Push to GitHub.
2. Vercel → Import → framework preset **Other**, no build, no output dir.
3. Auto-deploys on every push to `main`.

### Gotchas

- Vercel runs Linux — keep all asset filenames lowercase.
- GitHub web upload caps at 25MB — use GitHub Desktop for media.
- After editing env vars in Vercel you must **redeploy** manually.
- Hard-refresh (Ctrl+F5) to bypass browser cache when testing.

## Disclaimer

Free to play. No money in. Bounties paid out via pump.fun. 18+ for entertainment.
