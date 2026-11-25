# Devpost submission draft: Skein

Fill in the [brackets] before submitting. Check every field against the official rules page.

## Name
Skein

## Tagline
Ride the wake of everyone who flew before you.

## Links
- App listing: [https://developers.reddit.com/apps/skein-flow]  (confirm the exact URL while logged in)
- Demo post: [link to today's post in r/skein_flow_dev]
- Video (optional, under 1 min): [link]
- Repo (optional): https://github.com/KartikManral092006/SKEIN

## What it is
Skein is a daily flight game. Each UTC day there is one new migration leg: fly a goose from the fields to the lake
before dark (100 seconds).

- Hold to flap toward your finger. Flapping is fast but tiring.
- Let go to glide. Gliding is free but slow.
- Every other goose in your sky is a real Redditor's recorded flight from earlier that day.

The key mechanic: a goose's wingtip wake gives real lift. Glide in it and you keep your speed and regain strength.
Fly straight behind it and you hit rough air. Riding other players' wakes is the fastest way home.

## Why it belongs on Reddit
- **Other players are the level.** Your flight is added to the sky for everyone who plays after you. Each player who
  rides your wake for 1.5 seconds or more credits you once ("carried"). The flock gets faster as the day goes on.
- **Recurring content.** A new leg, map and weather are generated every day. A scheduled task creates the daily post at
  00:01 UTC. Streaks reward landing every day.
- **Community, not just a leaderboard.** You help strangers by flying, and they help you. Players can share their
  result to the comments and earn flair.
- **Works with no one else around.** A scripted wild skein of 7 geese flies a V around the storms every day, so even
  the first player of the day has wakes to ride.

## How it works
- Built with Devvit Web: React client, Hono server, Redis storage.
- Deterministic physics (only + − × ÷ and square root), so the same inputs give the same flight on Safari, Chrome and
  the server.
- The client sends only its inputs. The server replays the flight against the exact set of ghosts that player saw, so
  times can't be faked.
- Ghost tracks are about 2 bytes per 0.1 s, so a day's sky stays small.
- Ghost sets are rebuilt at most every 5 minutes from the top carriers, fastest and most recent flyers (up to 24).

## What we built during the hackathon
The whole project was started on 2026-11-25, after the hackathon opened on 2026-11-11.

## Challenges
[Write 2–3 sentences in your own words: for example, making physics match exactly across browsers and the server, or
tuning the game so wake riding matters without being required.]

## What's next
[For example: a fairness change so early flyers aren't disadvantaged, weekly routes, subreddit-vs-subreddit flocks.]
