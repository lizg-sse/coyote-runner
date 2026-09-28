import { describe, expect, it } from "vitest";
import { MAX_FRAME_TIME, SIM_STEP } from "../src/game/config";
import { applyInput, createState, step } from "../src/game/model";
import { splitFrame } from "../src/game/runtime";

describe("fixed time step", () => {
  it("produces identical simulations for identical seeds and inputs", () => {
    const script: Array<[number, "left" | "right" | "jump" | "slide"]> = [
      [120, "left"],
      [300, "jump"],
      [480, "right"],
      [600, "slide"],
      [900, "right"],
    ];
    const run = () => {
      const state = createState({ seed: 42, rules: { maxFouls: Infinity } });
      for (let i = 0; i < 2400; i++) {
        for (const [at, command] of script) if (at === i) applyInput(state, command);
        step(state, SIM_STEP);
      }
      return state;
    };
    const a = run();
    const b = run();
    expect(a.score).toBe(b.score);
    expect(a.fouls).toBe(b.fouls);
    expect(a.distance).toBe(b.distance);
    expect(a.obstacles.map((o) => [o.active, o.kind, o.lane, o.z])).toEqual(
      b.obstacles.map((o) => [o.active, o.kind, o.lane, o.z]),
    );
  });

  it("advances the same number of simulation steps regardless of frame rate", () => {
    const stepsAt = (fps: number, seconds: number): number => {
      let accumulator = 0;
      let steps = 0;
      for (let i = 0; i < fps * seconds; i++) {
        const split = splitFrame(accumulator, 1 / fps);
        steps += split.steps;
        accumulator = split.remainder;
      }
      return steps;
    };
    const expected = Math.round(2 / SIM_STEP);
    expect(Math.abs(stepsAt(60, 2) - expected)).toBeLessThanOrEqual(1);
    expect(Math.abs(stepsAt(120, 2) - expected)).toBeLessThanOrEqual(1);
    expect(Math.abs(stepsAt(30, 2) - expected)).toBeLessThanOrEqual(1);
  });

  it("clamps very long frames so a background tab cannot fast-forward the game", () => {
    const split = splitFrame(0, 5);
    expect(split.steps).toBe(Math.floor(MAX_FRAME_TIME / SIM_STEP));
  });
});
