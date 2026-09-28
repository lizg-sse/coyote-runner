import { describe, expect, it } from "vitest";
import {
  BARRIER_SIZING,
  GATE_OVERHANG,
  LANES,
  OBSTACLE_SIZING,
  PICKUP_SIZING,
  PLAYER_Z,
  RECYCLE_Z,
  type ObstacleKind,
  type PickupKind,
} from "../src/game/config";
import { laneBounds, laneCenterX, laneCenterXFractional, laneWidth, spriteBox } from "../src/game/geometry";

const ART_ASPECTS: Record<ObstacleKind, number> = { defender: 560 / 439, cone: 520 / 406, gate: 520 / 736 };
const DEPTHS = Array.from({ length: 151 }, (_, i) => (i / 150) * RECYCLE_Z);

describe("sprites stay inside their lane", () => {
  it("never draws an obstacle wider than its lane at any depth, including past the player", () => {
    for (const lane of LANES) {
      for (const kind of Object.keys(OBSTACLE_SIZING) as ObstacleKind[]) {
        for (const z of DEPTHS) {
          const box = spriteBox(lane, z, OBSTACLE_SIZING[kind], ART_ASPECTS[kind]);
          const bounds = laneBounds(lane, z);
          // The gate alone may straddle the lane lines by a bounded overhang.
          const slack = kind === "gate" ? laneWidth(z) * GATE_OVERHANG : 0;
          expect(box.x - box.width / 2).toBeGreaterThanOrEqual(bounds.left - slack - 1e-9);
          expect(box.x + box.width / 2).toBeLessThanOrEqual(bounds.right + slack + 1e-9);
        }
      }
    }
  });

  it("stops growing once an item reaches the player plane", () => {
    for (const kind of Object.keys(OBSTACLE_SIZING) as ObstacleKind[]) {
      const atPlayer = spriteBox(1, PLAYER_Z, OBSTACLE_SIZING[kind], ART_ASPECTS[kind]);
      const past = spriteBox(1, RECYCLE_Z, OBSTACLE_SIZING[kind], ART_ASPECTS[kind]);
      expect(past.width).toBeCloseTo(atPlayer.width, 6);
      expect(past.height).toBeCloseTo(atPlayer.height, 6);
    }
  });

  it("keeps pickups and barriers inside the lane as well", () => {
    for (const lane of LANES) {
      for (const z of DEPTHS) {
        for (const kind of Object.keys(PICKUP_SIZING) as PickupKind[]) {
          const box = spriteBox(lane, z, PICKUP_SIZING[kind], 366 / 400);
          const bounds = laneBounds(lane, z);
          expect(box.x - box.width / 2).toBeGreaterThanOrEqual(bounds.left - 1e-9);
          expect(box.x + box.width / 2).toBeLessThanOrEqual(bounds.right + 1e-9);
        }
        const barrier = spriteBox(lane, z, BARRIER_SIZING, 100 / 127);
        expect(barrier.width).toBeLessThanOrEqual(laneWidth(z) + 1e-9);
      }
    }
  });

  it("uses monotonic perspective: lanes widen toward the viewer and never overlap", () => {
    let previous = 0;
    for (const z of DEPTHS) {
      const width = laneWidth(z);
      expect(width).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = width;
      expect(laneBounds(0, z).right).toBeLessThanOrEqual(laneBounds(1, z).left + 1e-9);
      expect(laneBounds(1, z).right).toBeLessThanOrEqual(laneBounds(2, z).left + 1e-9);
    }
  });

  it("interpolates the player position smoothly between lanes", () => {
    expect(laneCenterXFractional(0, PLAYER_Z)).toBeCloseTo(laneCenterX(0, PLAYER_Z));
    expect(laneCenterXFractional(2, PLAYER_Z)).toBeCloseTo(laneCenterX(2, PLAYER_Z));
    const mid = laneCenterXFractional(0.5, PLAYER_Z);
    expect(mid).toBeGreaterThan(laneCenterX(0, PLAYER_Z));
    expect(mid).toBeLessThan(laneCenterX(1, PLAYER_Z));
  });
});
