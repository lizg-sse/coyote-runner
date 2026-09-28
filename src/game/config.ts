/**
 * Gameplay constants and lane geometry.
 *
 * All coordinates are in a fixed logical space (VIEW.width x VIEW.height).
 * The renderer scales that space to whatever pixel size the canvas has, so
 * gameplay and layout never depend on the device.
 */

export const VIEW = { width: 430, height: 780 } as const;

export const LANE_COUNT = 3;
export type Lane = 0 | 1 | 2;
export const LANES: readonly Lane[] = [0, 1, 2];
export const CENTER_LANE: Lane = 1;

/** Screen-space lane centers at the horizon (z = 0) and at the near edge (z = 1). */
export const LANE_CENTER_FAR: readonly number[] = [179, 215, 251];
export const LANE_CENTER_NEAR: readonly number[] = [74, 215, 356];

/** Vertical extent of the court, in logical pixels. */
export const HORIZON_Y = 150;
export const GROUND_Y = 705;

/**
 * Depth is a 0..1 value from the horizon to the bottom of the court. The
 * player stands at PLAYER_Z; objects "pass" the player when they move beyond
 * PASS_Z and are recycled once they leave the screen at RECYCLE_Z.
 */
export const PLAYER_Z = 0.92;
export const COLLISION_Z = { start: 0.84, end: 0.98 } as const;
export const RECYCLE_Z = 1.25;

/** Perspective curve: how quickly depth 0..1 maps to screen distance. */
export const DEPTH_CURVE = 1.55;

/** Simulation runs at a fixed rate regardless of display refresh. */
export const SIM_STEP = 1 / 120;
export const MAX_FRAME_TIME = 0.1;

export const MAX_FOULS = 3;
export const HEAT_TOKENS = 5;
export const HEAT_DURATION = 5.2;
export const HEAT_SPEED_BONUS = 1.06;

export const JUMP_DURATION = 0.7;
export const SLIDE_DURATION = 0.78;
export const JUMP_HEIGHT = 110;
export const DODGE_DURATION = 0.22;

/** Seconds of protection after a foul or after a lane-closure shove. */
export const FOUL_INVULNERABILITY = 0.42;
export const SHOVE_GRACE = 0.8;

export const FEET_PER_POSSESSION = 900;
export const FIRST_CLOSURE_POSSESSION = 5;
/** Seconds between the "lane closing" warning and the lane actually closing. */
export const CLOSURE_WARNING = 1.5;
/** Extra time after the warning during which the escape lane must be clear. */
export const CLOSURE_ESCAPE_GRACE = 0.5;

/** Two defenders in different live lanes closer than this form a "wall". */
export const DEFENDER_WALL_BAND = 0.12;
/** Minimum depth spacing between things spawned in the same lane. */
export const SAME_LANE_SPACING = 0.34;
export const PICKUP_SPACING = 0.22;

export const OBSTACLE_POOL = 34;
export const PICKUP_POOL = 26;

export const BONE_VALUE = 3;
export const COIN_VALUE = 1;

export type ObstacleKind = "defender" | "cone" | "gate";
export type PickupKind = "coin" | "bone";

/** Player response required to pass each obstacle without a foul. */
export const REQUIRED_ACTION: Record<ObstacleKind, "dodge" | "jump" | "slide"> = {
  defender: "dodge",
  cone: "jump",
  gate: "slide",
};

/**
 * Every drawable is sized as a fraction of the lane width at its depth, so an
 * item can never be wider than the lane it occupies. Height follows the
 * artwork's aspect ratio unless overridden.
 */
export interface SpriteSizing {
  /** Width as a fraction of the lane width at the sprite's depth. */
  laneFraction: number;
  /** Optional height/width override; artwork aspect is used when omitted. */
  aspect?: number;
}

/** Distance between the gate's post centres as a fraction of its image width (printed by prepare-assets.py). */
export const GATE_POST_SPACING = 0.6497;
/** Fraction of a lane width the gate's bar and feet overhang on each side. */
export const GATE_OVERHANG = (1 / GATE_POST_SPACING - 1) / 2;

export const OBSTACLE_SIZING: Record<ObstacleKind, SpriteSizing> = {
  // Nearly the full lane, so a defender stands as tall as the Coyote and
  // obviously cannot be jumped.
  defender: { laneFraction: 0.95 },
  cone: { laneFraction: 0.5 },
  // The gate's posts stand exactly on the lane lines: its width is one lane
  // divided by the post spacing measured in the artwork. Only the bar and
  // the feet extend past the lines, by GATE_OVERHANG on each side.
  gate: { laneFraction: 1 / GATE_POST_SPACING },
};

export const PICKUP_SIZING: Record<PickupKind, SpriteSizing> = {
  coin: { laneFraction: 0.2, aspect: 1 },
  bone: { laneFraction: 0.44 },
};

export const BARRIER_SIZING: SpriteSizing = { laneFraction: 0.9 };

/** Height of one run-cycle cell in logical pixels. Slide cells use the same scale. */
export const PLAYER_HEIGHT = 160;
/** Run cycle playback rate, frames per second of game time. */
export const RUN_FPS = 13.5;
/** Run-cycle frame shown at each stage of a jump: crouch, launch, tuck, fall, land. */
export const JUMP_FRAMES: readonly { until: number; frame: number }[] = [
  { until: 0.06, frame: 1 },
  { until: 0.24, frame: 2 },
  { until: 0.45, frame: 3 },
  { until: 0.66, frame: 7 },
  { until: 0.9, frame: 5 },
  { until: 1, frame: 0 },
];
/** Slide-sheet frame shown at each stage of a slide: drop, full slide, recovery. */
export const SLIDE_FRAMES: readonly { until: number; frame: number }[] = [
  { until: 0.08, frame: 0 },
  { until: 0.18, frame: 2 },
  { until: 0.78, frame: 3 },
  { until: 0.9, frame: 4 },
  { until: 1, frame: 5 },
];
