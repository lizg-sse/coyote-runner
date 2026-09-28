# Coyote's Fast Break: character and obstacle art spec

What the game needs from an illustrator so the Coyote looks right on a phone. The production art in `art-source/` already meets most of this; keep this spec for any future replacement or additional poses. Every size below is measured from the engine.

**The one thing that matters most:** deliver the Coyote as clean layered art at least 1024 px tall, with a plain black jersey and no number, on a transparent background.

## 1. How the game uses the art

Three lane runner, portrait. The Coyote stays near the bottom of the screen and obstacles approach from the far end of the court. On a phone the Coyote is drawn about 500 px tall and obstacles scale up as they approach, so small source images look blurry and flaws are magnified three to four times.

The only Coyote art on hand is a 121 x 150 px side view cutout with a number pasted on and a grey fringe. It is a style reference, not a usable asset. See `docs/screenshots/reference-run-source.png` and `docs/screenshots/reference-game.png`.

## 2. Deliverables

| Asset | Frames | Minimum size | Drawn on screen at | Notes |
| --- | --- | --- | --- | --- |
| Coyote run cycle (required) | 8 | 1024 px tall | about 500 px tall | Loops at 13.5 fps. Dribbling. |
| Coyote jump (required) | 1, 3 preferred | 1024 px tall | about 500 px tall | Tuck jump. Take off, apex, landing. |
| Coyote slide (required) | 1, 3 preferred | 1024 px wide | about 360 px tall | Low slide under a padded gate. |
| Coyote start pose (optional) | 1 | 1024 px tall | about 450 px tall | Title screen hero pose. |
| Defender (required) | 1 | 768 px tall | about 285 px wide | Upright blocker to dodge. |
| Cone (required) | 1 | 512 px tall | about 190 px wide | Jump over. |
| Slide gate (optional) | 1 | 1024 px wide | about 360 px wide | Padded crossbar on posts. Currently vector drawn. |
| Lane barrier (required) | 1 | 1024 px wide | about 350 px wide | Striped road barrier for closed lanes. |
| Dog bone (optional) | 1 | 512 px wide | about 170 px wide | 3 point pickup. Currently vector drawn. |
| Stadium backdrop (optional) | 1 | 1440 x 2610 px | full screen | Portrait 430:780. Court from 19% down; crowd and scoreboard above. Lane lines are drawn on top, so keep the court plain. |

## 3. The Coyote

**Orientation.** The camera sits behind and above the player; the Coyote runs into the screen. Preferred: rear three quarter view about 30 degrees off straight behind, face partly visible. Acceptable fallback: side view facing right (the game can mirror it). All poses in the same view.

**Jersey.** Plain black basketball tank with thin white piping on armholes and neckline. No number, no wordmark, no lettering. Black shorts with the same piping. Keep the jersey on its own layer in the working file.

**Style.** Match the existing mascot: soft cel shading, clean outline, saturated fur, expressive face. Light from the upper left, consistent everywhere. No drop shadow under the character; the game draws its own.

## 4. Technical requirements

- PNG, 32 bit with real transparency. No checkerboard baked in, no fringe. Export from the layered file, never from a screenshot.
- One canvas size per set: every frame of a run, jump or slide set shares the same canvas, ground line and horizontal center, so frames do not jitter.
- Ground registration: the lowest contact point sits on a fixed pixel row 4% above the bottom edge. Report that row.
- At least 16 px of empty padding around the drawing at 1024 px scale.
- No captions in the image.
- Obstacle proportions: each obstacle fits inside one lane. At the player's distance a lane is 128 units wide and the Coyote is 168 units tall. A defender about 0.75 lane wide and 1.0 Coyote tall, and a cone about 0.5 lane wide and 0.5 Coyote tall, look right.
- Also send the layered source file (PSD, Procreate, Affinity, Krita or Illustrator).

## 5. File names

Place flat PNGs in `art-source/`:

| File | Content |
| --- | --- |
| `run-01.png` to `run-08.png` | Run cycle in play order |
| `jump-01.png` to `jump-03.png` | Take off, apex, landing (or only `jump-01.png`) |
| `slide-01.png` to `slide-03.png` | Drop, full slide, recovery (or only `slide-01.png`) |
| `hero.png` | Title screen pose |
| `defender.png`, `cone.png`, `gate.png`, `barrier.png`, `bone.png` | Obstacles and pickups |
| `stadium.png` | Backdrop, 1440 x 2610 |

## 6. Acceptance checklist

- [ ] Transparent background with clean edges; no fringe on orange.
- [ ] Jersey plain black with piping; no number or text on the character.
- [ ] All frames of a set share one canvas size, ground row and center line.
- [ ] Character at least 1024 px tall; obstacles at least the sizes in section 2.
- [ ] Same lighting direction across every file.
- [ ] No captions, watermarks or baked drop shadows.
- [ ] Layered working file included.

## 7. What happens next

Once the files land in `art-source/`, the build step trims, resamples and packages them. No game code, framework or platform changes are needed. A run cycle replaces the single bobbing frame, and the rear view makes the Coyote run down the court instead of across it.
