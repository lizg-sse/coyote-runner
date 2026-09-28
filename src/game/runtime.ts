import type { GameAssets } from "./assets";
import { MAX_FRAME_TIME, SIM_STEP } from "./config";
import {
  applyInput,
  createState,
  drainEvents,
  step,
  type GameEvent,
  type GameState,
  type InputCommand,
} from "./model";
import { createRenderer, type Renderer } from "./renderer";

/**
 * The runtime owns the animation loop. Simulation advances in fixed SIM_STEP
 * increments no matter how fast the display refreshes; rendering happens once
 * per animation frame with the leftover time used to interpolate positions.
 * That is what makes motion identical at 60 Hz and 120 Hz and free of the
 * judder a variable time step produces on phones.
 */
export interface HudSnapshot {
  score: number;
  fouls: number;
  possession: number;
  heat: number;
  heatActive: boolean;
}

export interface GameSummary extends HudSnapshot {
  heatChecks: number;
  distance: number;
}

export interface RuntimeCallbacks {
  onHud(snapshot: HudSnapshot): void;
  onEvent(event: GameEvent, state: GameState): void;
  onGameOver(summary: GameSummary): void;
}

export interface Runtime {
  start(seed?: number): void;
  stop(): void;
  input(command: InputCommand): void;
  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void;
  destroy(): void;
  isRunning(): boolean;
  /** Read-only access to the live state for QA tooling. Do not mutate. */
  getState(): GameState;
}

/** Split a real frame into fixed simulation steps. Pure, so it is unit tested. */
export function splitFrame(accumulator: number, frameSeconds: number): { steps: number; remainder: number } {
  const total = accumulator + Math.min(MAX_FRAME_TIME, Math.max(0, frameSeconds));
  const steps = Math.floor(total / SIM_STEP);
  return { steps, remainder: total - steps * SIM_STEP };
}

export function snapshotOf(state: GameState): HudSnapshot {
  return {
    score: state.score,
    fouls: state.fouls,
    possession: state.possession,
    heat: state.heat,
    heatActive: state.heatActive,
  };
}

function sameSnapshot(a: HudSnapshot | null, b: HudSnapshot): boolean {
  return (
    a !== null &&
    a.score === b.score &&
    a.fouls === b.fouls &&
    a.possession === b.possession &&
    a.heat === b.heat &&
    a.heatActive === b.heatActive
  );
}

export function createRuntime(
  canvas: HTMLCanvasElement,
  assets: GameAssets,
  callbacks: RuntimeCallbacks,
): Runtime {
  const renderer: Renderer = createRenderer(canvas, assets);
  let state: GameState = createState();
  let frameHandle = 0;
  let running = false;
  let lastTime = 0;
  let accumulator = 0;
  let lastHud: HudSnapshot | null = null;

  function publishHud(): void {
    const snapshot = snapshotOf(state);
    if (sameSnapshot(lastHud, snapshot)) return;
    lastHud = snapshot;
    callbacks.onHud(snapshot);
  }

  function finish(): void {
    running = false;
    cancelAnimationFrame(frameHandle);
    callbacks.onGameOver({ ...snapshotOf(state), heatChecks: state.heatChecks, distance: state.distance });
  }

  function frame(now: number): void {
    if (!running) return;
    const frameSeconds = lastTime === 0 ? SIM_STEP : (now - lastTime) / 1000;
    lastTime = now;
    const split = splitFrame(accumulator, frameSeconds);
    accumulator = split.remainder;

    for (let i = 0; i < split.steps && state.status === "running"; i++) {
      step(state, SIM_STEP);
      for (const event of drainEvents(state)) callbacks.onEvent(event, state);
    }
    renderer.draw(state, accumulator / SIM_STEP);
    publishHud();

    if (state.status === "over") {
      finish();
      return;
    }
    frameHandle = requestAnimationFrame(frame);
  }

  function resume(): void {
    if (!running) return;
    cancelAnimationFrame(frameHandle);
    lastTime = 0;
    accumulator = 0;
    frameHandle = requestAnimationFrame(frame);
  }

  function onVisibility(): void {
    if (document.hidden) cancelAnimationFrame(frameHandle);
    else resume();
  }
  document.addEventListener("visibilitychange", onVisibility);

  return {
    start(seed?: number): void {
      cancelAnimationFrame(frameHandle);
      state = createState(seed === undefined ? {} : { seed });
      lastHud = null;
      running = true;
      lastTime = 0;
      accumulator = 0;
      publishHud();
      frameHandle = requestAnimationFrame(frame);
    },
    stop(): void {
      running = false;
      cancelAnimationFrame(frameHandle);
    },
    input(command: InputCommand): void {
      if (!running) return;
      applyInput(state, command);
      for (const event of drainEvents(state)) callbacks.onEvent(event, state);
    },
    resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
      renderer.resize(cssWidth, cssHeight, devicePixelRatio);
      renderer.draw(state, 0);
    },
    destroy(): void {
      running = false;
      cancelAnimationFrame(frameHandle);
      document.removeEventListener("visibilitychange", onVisibility);
    },
    isRunning: () => running,
    getState: () => state,
  };
}
