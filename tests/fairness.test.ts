import { describe, expect, it } from "vitest";
import {
  CENTER_LANE,
  CLOSURE_ESCAPE_GRACE,
  COLLISION_Z,
  DEFENDER_WALL_BAND,
  SHOVE_GRACE,
} from "../src/game/config";
import { isLaneLegal, liveLanes, type GameState } from "../src/game/model";
import { botPolicy, sideHuggerPolicy, simulate } from "./helpers";

const SEEDS = Array.from({ length: 12 }, (_, i) => 1000 + i * 7919);
const LONG_RUN_SECONDS = 150;

function assertAlwaysTwoLiveLanes(state: GameState): void {
  expect(liveLanes(state).length).toBeGreaterThanOrEqual(2);
}

function assertNoDefenderWall(state: GameState): void {
  const defenders = state.obstacles.filter((o) => o.active && !o.harmless && o.kind === "defender");
  for (const d of defenders) {
    const escape = liveLanes(state).some(
      (lane) =>
        lane !== d.lane &&
        !defenders.some((other) => other.lane === lane && Math.abs(other.z - d.z) < DEFENDER_WALL_BAND),
    );
    expect(escape, `defender wall at z=${d.z.toFixed(2)} t=${state.elapsed.toFixed(2)}`).toBe(true);
  }
}

function assertEscapeLaneClearDuringWarning(state: GameState): void {
  const { pending, warning } = state.closure;
  if (pending === -1) return;
  const horizon = warning + CLOSURE_ESCAPE_GRACE;
  for (const o of state.obstacles) {
    if (!o.active || o.harmless || o.lane !== CENTER_LANE) continue;
    if (o.z >= COLLISION_Z.end) continue;
    const seconds = (COLLISION_Z.start - o.z) / state.speed;
    expect(seconds, `center-lane ${o.kind} arrives in ${seconds.toFixed(2)}s during warning`).toBeGreaterThanOrEqual(
      horizon - 1e-6,
    );
  }
}

describe("lane closures are always survivable", () => {
  it("keeps at least two legal lanes open at every step, in every run", () => {
    for (const seed of SEEDS) {
      let closures = 0;
      simulate({
        seed,
        seconds: LONG_RUN_SECONDS,
        policy: botPolicy,
        onStep: (state, events) => {
          assertAlwaysTwoLiveLanes(state);
          closures += events.filter((e) => e.type === "laneClosed").length;
        },
      });
      expect(closures, `seed ${seed} never reached a lane closure`).toBeGreaterThan(0);
    }
  });

  it("reopens the previously closed lane before a new warning begins", () => {
    for (const seed of SEEDS) {
      simulate({
        seed,
        seconds: LONG_RUN_SECONDS,
        policy: botPolicy,
        onStep: (state) => {
          if (state.closure.pending !== -1) expect(state.closure.closed).toBe(-1);
        },
      });
    }
  });

  it("never lets a live obstacle reach the escape lane during the warning", () => {
    for (const seed of SEEDS) {
      simulate({
        seed,
        seconds: LONG_RUN_SECONDS,
        policy: botPolicy,
        onStep: assertEscapeLaneClearDuringWarning,
      });
    }
  });

  it("shoves a player who stays in the closing lane without charging a foul", () => {
    for (const seed of SEEDS) {
      let shoves = 0;
      let foulsAtWarning = 0;
      let shovedAt = -Infinity;
      simulate({
        seed,
        seconds: LONG_RUN_SECONDS,
        policy: (state) => {
          // Sit in the lane that closes next and refuse to leave during the warning.
          if (state.closure.pending !== -1) return;
          sideHuggerPolicy(state, state.closure.nextSide);
        },
        onStep: (state, events) => {
          for (const event of events) {
            if (event.type === "laneClosing") foulsAtWarning = state.fouls;
            if (event.type === "foul") {
              expect(state.elapsed - shovedAt, `foul ${(state.elapsed - shovedAt).toFixed(2)}s after a shove`).toBeGreaterThanOrEqual(SHOVE_GRACE);
            }
            if (event.type !== "laneClosed") continue;
            expect(isLaneLegal(state, state.lane)).toBe(true);
            if (event.shoved) {
              shoves += 1;
              shovedAt = state.elapsed;
              expect(state.lane).toBe(CENTER_LANE);
              expect(state.invulnerable).toBeGreaterThanOrEqual(SHOVE_GRACE - 1e-9);
              expect(state.fouls).toBe(foulsAtWarning);
            }
          }
        },
      });
      expect(shoves, `seed ${seed} never exercised a shove`).toBeGreaterThan(0);
    }
  });

  it("never spawns anything in a closed or closing lane", () => {
    for (const seed of SEEDS) {
      simulate({
        seed,
        seconds: LONG_RUN_SECONDS,
        policy: botPolicy,
        onStep: (state) => {
          for (const o of state.obstacles) {
            if (o.active && !o.harmless) expect(isLaneLegal(state, o.lane)).toBe(true);
          }
        },
      });
    }
  });
});

describe("waves always leave a way through", () => {
  it("never forms a defender wall across the live lanes", () => {
    for (const seed of SEEDS) {
      simulate({ seed, seconds: LONG_RUN_SECONDS, policy: botPolicy, onStep: assertNoDefenderWall });
    }
  });

  it("is beatable by a simple bot for the full run", () => {
    for (const seed of SEEDS) {
      const state = simulate({ seed, seconds: LONG_RUN_SECONDS, policy: botPolicy });
      expect(state.possession).toBeGreaterThanOrEqual(9);
      expect(state.score).toBeGreaterThan(0);
    }
  });
});
