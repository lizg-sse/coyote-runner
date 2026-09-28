import { CENTER_LANE, COLLISION_Z, SIM_STEP, type Lane } from "../src/game/config";
import {
  applyInput,
  createState,
  drainEvents,
  liveLanes,
  step,
  type GameEvent,
  type GameState,
} from "../src/game/model";
import { createRng } from "../src/game/random";

/**
 * A simple bot that plays the way a person would: jump cones, slide gates,
 * and dodge defenders into a live lane. It is not perfect on purpose; it
 * exists to drive long simulations through every possession and closure.
 */
export function botPolicy(state: GameState, rng: () => number): void {
  const lane = state.lane;
  const threat = state.obstacles.find(
    (o) => o.active && !o.harmless && o.lane === lane && o.z > 0.58 && o.z < COLLISION_Z.start,
  );
  if (!threat) return;
  if (threat.kind === "cone") applyInput(state, "jump");
  else if (threat.kind === "gate") applyInput(state, "slide");
  else {
    const options = liveLanes(state).filter(
      (l) =>
        Math.abs(l - lane) === 1 &&
        !state.obstacles.some((o) => o.active && !o.harmless && o.lane === l && o.z > 0.5 && o.z < 0.98 && o.kind === "defender"),
    );
    const target = options[Math.floor(rng() * options.length)];
    if (target !== undefined) applyInput(state, target < lane ? "left" : "right");
  }
}

/** Sits in a side lane whenever possible so every closure shoves the player. */
export function sideHuggerPolicy(state: GameState, preferred: Lane): void {
  const live = liveLanes(state);
  const target = live.includes(preferred) ? preferred : live.includes(CENTER_LANE) ? CENTER_LANE : live[0];
  if (target === undefined || target === state.lane) return;
  applyInput(state, target < state.lane ? "left" : "right");
}

export interface SimulationOptions {
  seed: number;
  seconds: number;
  policy?: (state: GameState, rng: () => number, events: GameEvent[]) => void;
  onStep?: (state: GameState, events: GameEvent[]) => void;
  maxFouls?: number;
}

export function simulate(options: SimulationOptions): GameState {
  const state = createState({ seed: options.seed, rules: { maxFouls: options.maxFouls ?? Infinity } });
  const rng = createRng(options.seed ^ 0x9e3779b9);
  const steps = Math.round(options.seconds / SIM_STEP);
  for (let i = 0; i < steps && state.status === "running"; i++) {
    step(state, SIM_STEP);
    const events = drainEvents(state);
    options.onStep?.(state, events);
    options.policy?.(state, rng.next, events);
    drainEvents(state);
  }
  return state;
}
