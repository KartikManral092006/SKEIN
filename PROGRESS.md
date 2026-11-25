# Skein · progress

Daily flight game for Reddit's Game of the Day hackathon (Devvit Web, due 2026-12-08, judging Dec 9–16).
Started 2026-11-25. Replaces NIGHTSHIFT (`~/Desktop/RedditGame 2`), whose core idea (players build tomorrow's level)
has Reddit prior art (fiLLr, Noriara).

## The hook
"Ride the wake of everyone who flew before you."
- One migration leg per UTC day: fly a goose from the fields to the lake before dark (100 s).
- Hold to flap toward your finger (fast, tiring). Let go to glide (free, slow).
- Every goose in your sky is a real player's recorded flight from earlier today. A goose's wingtip wake gives real lift:
  glide there and you keep speed and regain strength. Straight behind is rough air (downwash).
- Your flight joins the sky for everyone after you. Each player who rides your wake for 1.5 s+ credits you once
  ("carried"). The flock gets faster through the day.
- The wild skein (7 scripted geese in a V that steers round storms) means a solo judge always has wakes to ride.

Prior-art check (2026-11-25): flocking games exist (Flocc, several "Murmuration" jam games), visual-only replay ghosts
exist (Phantom Abyss, racing ghosts). No game found where async ghosts physically carry you.

## Rules (src/shared/skein)
- `rules.ts`: W 40 × LENGTH 1200, 20 Hz, TMAX 100 s, flap 21 / glide 11 / wild V 17, par = wild V time (70.0 s).
- `sky.ts`: seeded storms (drain + push), thermals (regen), crosswind bands, biome + region/lake names.
- `sim.ts`: deterministic physics. Only + − × ÷ and sqrt, so Safari, Chrome and Node agree. Input per tick:
  0 = glide, 1..201 = flap toward x = (v−1)/5.
- `codec.ts`: ghost track ≈ 2 bytes per 0.1 s (base64url), inputs run-length encoded.
- `flock.ts`: wild V via DP path around storms; `buildGhosts` = wild + player ghosts.
- `bots.ts`: AI flyers for preview crowds, tests, balance.

## Server (src/server)
- `/api/flight`: client sends `{wave, inputs}`; server replays against the exact ghost set of that wave.
- Ghost tracks are immutable per version (`d:{day}:track` field `name#n`), so replays stay valid after improvements.
- Waves: up to 24 player ghosts (top carriers, fastest, most recent), rebuilt at most every 5 min when new landings.
- Best time per user per day, tries, streak (landing on the day), carried counts, flair, share-to-comments,
  subscribe button, daily post at 00:01 UTC, mod menu item, install trigger.

## Client (src/client)
- Look: field guide at dusk. Young Serif + DM Mono, cream paper cards, rust accent, painted farmland from above
  (5 biomes), long shadows, darkness creeping in as the clock runs.
- Splash: today's flock flying live over today's map, one CTA, stats line.
- Game: ready card (3 lines + V diagram), HUD (time/par, strength bar, riding chip, progress rail), first-flight
  contextual hints, landing among the flock on the lake, one result card, dark-fell card with a tip.
- Synth audio: wind, wingbeats, honk on catching a wake, splash.

## Run
- `npm run preview` → http://localhost:5320/game.html and /splash.html (offline mode, localStorage).
  Params: `?day=N`, `?crowd=1` (14 fake flyers) or `?crowd=20`, `?autopilot=1`, `?speed=4` (preview only).
- `npm run test:unit` (12 tests), `npx tsc --build`, `npm run lint`, `npm run balance [days]`, `npm run build`.

## Balance (npm run balance)
Glide only: dark at ~92%. Flap only ~77 s. Solo smart ~75 s. Ride the wild V + sprint ~66 s (par 70).
Late in a busy day, drafting 30 flyers: ~60 s.

## Deployed
- App renamed to `skein-flow` (`skein-daily` was not used). Uploaded as v0.0.1, installed in r/skein_flow_dev.
- `devvit logs skein_flow_dev --since 2d` (checked 2026-11-25): no errors. The server logs only failures.
- Do not run `devvit publish` before judging. Upload is enough (app stays private, sub < 200 members).

## Hackathon submission (deadline reportedly 2026-12-08 18:00 PST; verify on Devpost rules page)
- Devpost form: app listing link (developers.reddit.com), public demo post link, description. Video < 1 min and repo optional.
- Draft text: `docs/devpost-submission.md`. Tester script: `docs/playtest-guide.md`.

## Not done yet
- Confirm r/skein_flow_dev is public and has a game post judges can open.
- Untested inside Reddit: flair, comment as user, subscribe (`asUser` flags in devvit.json), scheduler post.
- Real-phone playtest: touch feel, frame rate, sound on device.
- Seed the demo sub with real flights over several days before judging so judges see named ghosts.
- Fairness: late flyers have more wakes. Maybe show "first flyers" credit, or rank by carried as well as time.
