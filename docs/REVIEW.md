# Engineering review: build 50 single-file game vs. this React build

This document records what was wrong in the previous single-file `index.html` (build 50), why each problem produced the symptoms the app team reported, and how this build addresses it. It is written for engineers who will own the code.

## Findings in build 50

### 1. Obstacles grew without bound and spilled across lanes

Sprite scale was `0.20 + 1.04 * z^1.45` and objects lived until `z = 1.22` (cones) or `z = 1.46` (gates). At `z = 1.46` that is a 2.0x scale, versus 1.24x at the player. Lane x-position also extrapolated past the near lane centers. Sprite width was `image.width * constant`, unrelated to lane width, so a defender at the player plane was already wider than a lane and kept growing while it passed.

**Now:** width is a fraction of the lane width at the sprite's depth, depth used for scale is clamped at the player plane, and a unit test asserts containment for every kind at every depth in every lane.

### 2. Lane closures could force a foul

- A new closure was scheduled while the previous lane was still closed, so during the 0.9 s warning only the center lane was legal.
- Nothing cleared the center lane of arriving obstacles, so the escape lane could contain a defender exactly when the player had to enter it.
- If the player was still in the lane when it closed, `hit()` charged a foul and teleported the player to the center.

**Now:** the old lane reopens before the new warning; the warning is 1.5 s; spawning pauses; the escape lane is cleared for the warning plus a grace period; and a player still in the lane is shoved to the center with protection and no foul. Twelve seeded 150 s replays assert these rules at every step.

### 3. Motion was frame-rate dependent

The loop used a variable `dt` capped at 34 ms, and lane easing was `renderLane += (lane - renderLane) * min(1, dt * 16)`, which behaves differently at 60 Hz, 90 Hz, and 120 Hz and stutters whenever a frame is late.

**Now:** fixed 1/120 s simulation steps with an accumulator, render-time interpolation of positions, a clamp on long frames so a backgrounded tab cannot fast-forward the game, and a pause while the document is hidden.

### 4. Expensive per-frame drawing

Every sprite, coin, and the player were drawn with `shadowBlur` (one of the slowest canvas operations on mobile GPUs); the coin star was rendered as text every frame; the HUD did DOM writes on every frame (`toLocaleString`, ten `classList.toggle` calls); the backing store was allowed up to 3x device pixel ratio.

**Now:** no `shadowBlur`, pre-rendered coin, bone, and glow sprites, a cached background layer, HUD updates only on change, and a 2x backing-store cap.

### 5. Startup pixel processing on the device

`removeCheckerboard` flood-filled full sprite sheets with `getImageData` on the main thread at load, which is a multi-hundred-millisecond stall on phones.

**Now:** artwork is prepared once by `scripts/prepare-assets.py`; the browser only decodes PNGs.

### 6. Phone layout

The HUD used fixed pixel widths (two 94 px boxes plus a 184 px heat panel) that exceed a 360 px viewport; the shell relied on `100vh`, which misbehaves behind mobile browser chrome.

**Now:** the shell is sized by a `ResizeObserver` against its container and publishes a scale variable used by every HUD dimension. Verified at 320 px wide and in landscape.

### 7. Readability

Roughly 30 kB of logic on 140 lines, with single lines over 1,000 characters, no types, and global mutable state shared between simulation, rendering, and DOM.

**Now:** typed modules with one responsibility each, strict TypeScript, ESLint with React Hooks rules, and tests that document the rules.

## Design decisions worth knowing

- **Lane closure is a shove, not a foul.** This is deliberate. The app team's complaint was that closures felt like unavoidable fouls. Making the closure itself never cost a foul, while keeping obstacles as the only source of fouls, preserves difficulty without unfairness.
- **Pickups vanish in a closed lane; obstacles fade instead.** A closed lane keeps its obstacles moving at 45% opacity so nothing pops out of existence, but they can no longer foul.
- **QA hooks are URL-gated.** `?qa=1` and `?seed=` are inert unless present.
- **React Native integration is a WebView.** One tested implementation across web and app. A native Skia renderer would be a separate project.

## Artwork

The build 50 package handed over at first contained only tiny embedded sprites; the real art (run and slide sheets, stadium plate, obstacles, bone) arrived later as a separate archive and now lives in `art-source/`. The asset pipeline in `scripts/prepare-assets.py` replaces the browser-side checkerboard removal the prototype did at startup and registers the animation frames so the character does not jitter between cells.
