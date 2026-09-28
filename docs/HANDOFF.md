# Handoff: Coyote's Fast Break

Branch: `claude/code-review-production-ready-fgibao` in `Raghavin13/Project-coyote`.

Everything is in the repository. There are no separate files to copy.

## Get it running (five minutes)

```bash
git clone https://github.com/Raghavin13/Project-coyote.git
cd Project-coyote
git checkout claude/code-review-production-ready-fgibao
npm install
npm run verify      # lint + typecheck + unit tests + production build + phone e2e
npm run preview     # serves the production build at http://127.0.0.1:4173
```

Requirements: Node 20 or newer. Nothing else. Python is only needed to regenerate artwork from `art-source/`, and the generated sprites are already committed.

`npm run test:e2e` looks for Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. On another machine run `npx playwright install chromium` and remove the `executablePath` line in `e2e/run.mjs`, or set `PW_CHROMIUM_PATH`.

## What to deploy

`npm run build` writes `dist/`. Deploy that folder to any static host, CDN, or app bundle. Asset paths are relative, so it works at a domain root, under a sub path, or from local files inside a WebView. Total size about 2 MB; file names are content hashed, so caches never serve a stale sprite.

## How to embed

- **Web (React):** import `CoyoteFastBreak` from `src/game` and render it inside a positioned container. Props: `seed` (reproducible runs), `onGameOver(summary)`, `qaHook`.
- **React Native:** load the deployed `dist/` in a `WebView`. Wire `onGameOver` to `window.ReactNativeWebView.postMessage(JSON.stringify(summary))` in `src/main.tsx` to get the score in the app. Snippet in `README.md`.

## What is verified on the current commit

| Area | Result |
| --- | --- |
| Lint, strict TypeScript | clean |
| Unit tests: lane closure fairness, defender walls, sprite containment, determinism | 15 pass |
| Headless Chromium at iPhone 13, Pixel 5, 320 px, landscape, desktop | pass: no errors, no overflow, HUD contained, swipe and keys work, bot survives two lane closures with zero fouls |
| Frame cadence during play | 16.6 ms average, zero frames over 34 ms, on every phone profile |
| Art | production sprite sheets, eight frame run cycle, stadium plate, prepared at build time |

## What is not verified and is yours to close

1. **A physical phone.** All device runs above were emulated. Please spend an hour on one iPhone and one Android: touch feel, audio after tapping Play, battery.
2. **Your WebView.** Mount `dist/` in the app shell and confirm the score bridge.
3. **Your hosting.** Serve `dist/` from wherever it will live and open it once.

## Where to look

- `README.md`: commands, code map, integration.
- `docs/REVIEW.md`: what was wrong in the previous build and how each item is handled now.
- `docs/ART-SPEC.md`: requirements for any future artwork.
- `docs/screenshots/`: frames from the verified build.
- `?seed=7` on the URL replays a fixed run; `?qa=1` exposes read only state for automation.
