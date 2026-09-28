import {
  DEPTH_CURVE,
  GROUND_Y,
  HORIZON_Y,
  LANE_CENTER_FAR,
  LANE_CENTER_NEAR,
  PLAYER_Z,
  type Lane,
  type SpriteSizing,
} from "./config";

/**
 * Pure perspective math shared by the renderer and the tests. Nothing here
 * touches the DOM, so the containment guarantees can be verified in Node.
 */

export function depthFraction(z: number): number {
  return Math.pow(clamp(z, 0, 2), DEPTH_CURVE);
}

/** Screen y of the ground line at depth z. */
export function groundY(z: number): number {
  return HORIZON_Y + (GROUND_Y - HORIZON_Y) * depthFraction(z);
}

export function laneCenterX(lane: Lane, z: number): number {
  const far = LANE_CENTER_FAR[lane] ?? 0;
  const near = LANE_CENTER_NEAR[lane] ?? 0;
  return far + (near - far) * depthFraction(z);
}

/** Width of one lane at depth z. Lanes are evenly spaced, so use lane 0..1. */
export function laneWidth(z: number): number {
  return laneCenterX(1, z) - laneCenterX(0, z);
}

export interface LaneBounds {
  left: number;
  right: number;
}

export function laneBounds(lane: Lane, z: number): LaneBounds {
  const half = laneWidth(z) / 2;
  const center = laneCenterX(lane, z);
  return { left: center - half, right: center + half };
}

/**
 * Objects stop growing once they reach the player's plane. Past that point
 * they keep sliding down the screen but are drawn at the player-plane size,
 * which is what keeps a passing defender from ballooning across the lanes.
 */
export function scaleDepth(z: number): number {
  return Math.min(z, PLAYER_Z);
}

export interface SpriteBox {
  /** Horizontal center in logical pixels. */
  x: number;
  /** Ground contact y in logical pixels. */
  y: number;
  width: number;
  height: number;
}

/**
 * Compute the drawn box for a lane-bound sprite. `artAspect` is the artwork's
 * height divided by width and is used when the sizing has no override.
 */
export function spriteBox(
  lane: Lane,
  z: number,
  sizing: SpriteSizing,
  artAspect: number,
): SpriteBox {
  const sz = scaleDepth(z);
  const width = laneWidth(sz) * sizing.laneFraction;
  const height = width * (sizing.aspect ?? artAspect);
  return { x: laneCenterX(lane, z), y: groundY(z), width, height };
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Lane center for a fractional lane index, used while the player slides between lanes. */
export function laneCenterXFractional(laneIndex: number, z: number): number {
  const clamped = clamp(laneIndex, 0, 2);
  const lower = Math.floor(clamped) as Lane;
  const upper = Math.min(2, lower + 1) as Lane;
  return lerp(laneCenterX(lower, z), laneCenterX(upper, z), clamped - lower);
}
