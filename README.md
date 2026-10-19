# Dumpling Duel

A 1v1 first-person browser game: two players stand on opposite sides of a small studio flat's living room and throw a squishy white dumpling at each other. Built with Three.js (graphics), cannon-es (physics) and PeerJS (online play). Fully static, so it deploys to Vercel with zero config.

## Modes

| Mode | Rules |
| --- | --- |
| Classic | Endless catch with no penalties. Random clutter behind each player (pots, bottles, a rubber duck, a guitar, a wind chime...) clangs, rattles and squeaks when hit. A new random layout every game. |
| Penalty | If a catchable throw reaches you and you don't catch it, your opponent gets a free shot at your head. During the free shot nobody can move; the target can only brace or close their eyes. Dodging a catchable throw counts as a drop. A throw that was never catchable is just a miss. Headshots from free shots score; first to 3/5/7 wins. |
| Hot Potato | A random player starts with it. It explodes after 40 seconds. If it's in your hands, or lying on your side because you didn't pick it up, you lose the round. If it's between the blue tape lines in the middle, the round is a draw. First to 3 rounds. |

Shared rules: a missed or dropped dumpling has to be picked up by whoever is closer to it. You can walk and duck to dodge. If it gets stuck somewhere unreachable it returns to that player's hands.

Players pick **Male** or **Female** on the title screen. P1 always plays from the kitchen side, P2 from the balcony side.

## Controls

| Desktop | Phone |
| --- | --- |
| WASD move, mouse aim | Left thumb moves, drag on the right to aim |
| Hold left click to charge, release to throw (click without the dumpling to catch) | Hold THROW and drag to aim while charging |
| Space / right click: catch | CATCH |
| E: pick up | PICK UP |
| C / Ctrl: duck | DUCK |
| F / Shift: brace, Q: close eyes (only when you're the free-shot target) | BRACE / CLOSE EYES |
| Esc / P: pause, H: hide key help, M: mute | II button |

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL. To try online play on one computer, open two tabs with `?net=tabs` added to the URL (for example `http://localhost:5173/?net=tabs`); the tabs talk through BroadcastChannel instead of the internet. Add `&lag=120` to simulate a 120 ms round trip.

## Deploy to Vercel

Option A, from GitHub: push this folder to a repo, then in Vercel choose **Add New > Project**, import the repo and click **Deploy**. Vercel detects Vite automatically (build command `npm run build`, output folder `dist`).

Option B, from the terminal:

```bash
npm i -g vercel
vercel        # first time: answer the prompts, accept the detected Vite settings
vercel --prod
```

## How online play works

- One player clicks **Create a room** and gets a 5-letter code plus an invite link (`?room=CODE`). The other joins with the code or opens the link.
- PeerJS's free public server is used only for the handshake. After that, game data flows directly between the two browsers over WebRTC, so nothing runs on Vercel besides static files.
- The host runs the physics and rules and streams snapshots 30 times a second. Each player moves their own character locally, and catches are decided on the catcher's screen, so lag doesn't steal catches.
- Some networks (strict NATs, some mobile carriers) block direct peer connections. If two players can't connect, add a TURN server to `NET.iceServers` in `src/config.js`.

## Project layout

```
index.html          menus, HUD, styles
src/main.js         renderer, game loop, menus, host/guest glue
src/sim.js          authoritative simulation and the three rule sets
src/physics.js      cannon-es world, materials, player hitboxes
src/room.js         the studio flat: geometry, colliders, walkable areas
src/props.js        Classic-mode noisy clutter and where it can spawn
src/avatar.js       Male and Female characters
src/dumpling.js     the squishy dumpling and its jelly squash
src/bot.js          solo opponent (Easy / Normal / Hard)
src/net.js          PeerJS link and the two-tab test link
src/audio.js        all sounds, synthesized with WebAudio (no audio files)
src/config.js       room size, zones, rules, throw speeds, network settings
```

Tuning lives in `src/config.js` (`RULES`, `PHYS`). Room furniture positions are in `src/room.js`, clutter spawn areas in `src/props.js` (`SURF`).
