import {
  BONE_VALUE,
  CENTER_LANE,
  CLOSURE_ESCAPE_GRACE,
  CLOSURE_WARNING,
  COIN_VALUE,
  COLLISION_Z,
  DEFENDER_WALL_BAND,
  DODGE_DURATION,
  FEET_PER_POSSESSION,
  FIRST_CLOSURE_POSSESSION,
  FOUL_INVULNERABILITY,
  HEAT_DURATION,
  HEAT_SPEED_BONUS,
  HEAT_TOKENS,
  JUMP_DURATION,
  LANES,
  MAX_FOULS,
  OBSTACLE_POOL,
  PICKUP_POOL,
  PICKUP_SPACING,
  RECYCLE_Z,
  REQUIRED_ACTION,
  SAME_LANE_SPACING,
  SHOVE_GRACE,
  SLIDE_DURATION,
  type Lane,
  type ObstacleKind,
  type PickupKind,
} from "./config";
import { createRng, type Rng } from "./random";

/**
 * The game model is a plain state object plus pure-ish functions that
 * advance it by a fixed time step. It never touches the DOM, audio, or React,
 * which keeps it testable and keeps the simulation independent of frame rate.
 */

export type PlayerAction = "run" | "jump" | "slide";
export type InputCommand = "left" | "right" | "jump" | "slide";

export interface Obstacle {
  active: boolean;
  kind: ObstacleKind;
  lane: Lane;
  z: number;
  prevZ: number;
  /** Harmless obstacles keep moving for continuity but can no longer foul. */
  harmless: boolean;
  /** True once the player has cleared or hit it, as opposed to a lane closure neutralising it. */
  passed: boolean;
}

export interface Pickup {
  active: boolean;
  kind: PickupKind;
  lane: Lane;
  z: number;
  prevZ: number;
  spin: number;
}

export interface Closure {
  /** Lane that is currently closed, or -1. */
  closed: Lane | -1;
  /** Lane that is about to close, or -1. */
  pending: Lane | -1;
  /** Seconds left in the warning phase. */
  warning: number;
  nextSide: 0 | 2;
}

export type GameEvent =
  | { type: "move" }
  | { type: "blocked" }
  | { type: "jump" }
  | { type: "slide" }
  | { type: "foul"; fouls: number; by: ObstacleKind }
  | { type: "coin" }
  | { type: "bone" }
  | { type: "heat" }
  | { type: "possession"; possession: number }
  | { type: "laneClosing"; lane: Lane }
  | { type: "laneClosed"; lane: Lane; shoved: boolean }
  | { type: "gameOver" };

export interface Rules {
  maxFouls: number;
}

export interface GameState {
  status: "running" | "over";
  rules: Rules;
  rng: Rng;
  elapsed: number;
  /** Depth units per second that obstacles travel this step. */
  speed: number;

  lane: Lane;
  laneVisual: number;
  prevLaneVisual: number;
  dodgeDir: -1 | 0 | 1;
  dodgeT: number;
  action: PlayerAction;
  actionT: number;

  fouls: number;
  score: number;
  distance: number;
  possession: number;
  heat: number;
  heatActive: boolean;
  heatLeft: number;
  heatChecks: number;
  invulnerable: number;

  spawnTimer: number;
  coinTimer: number;
  boneTimer: number;
  closure: Closure;

  obstacles: Obstacle[];
  pickups: Pickup[];
  /** Drained by the runtime after every step. */
  events: GameEvent[];
}

export interface CreateOptions {
  seed?: number;
  rules?: Partial<Rules>;
}

export function createState(options: CreateOptions = {}): GameState {
  const seed = options.seed ?? (Math.random() * 0xffffffff) >>> 0;
  const rng = createRng(seed);
  return {
    status: "running",
    rules: { maxFouls: MAX_FOULS, ...options.rules },
    rng,
    elapsed: 0,
    speed: 0,
    lane: CENTER_LANE,
    laneVisual: CENTER_LANE,
    prevLaneVisual: CENTER_LANE,
    dodgeDir: 0,
    dodgeT: 0,
    action: "run",
    actionT: 0,
    fouls: 0,
    score: 0,
    distance: 0,
    possession: 1,
    heat: 0,
    heatActive: false,
    heatLeft: 0,
    heatChecks: 0,
    invulnerable: 0,
    spawnTimer: 1.1,
    coinTimer: 0.8,
    boneTimer: rng.range(3.5, 5),
    closure: { closed: -1, pending: -1, warning: 0, nextSide: 0 },
    obstacles: Array.from({ length: OBSTACLE_POOL }, () => ({
      active: false,
      kind: "cone",
      lane: CENTER_LANE,
      z: 0,
      prevZ: 0,
      harmless: false,
      passed: false,
    })),
    pickups: Array.from({ length: PICKUP_POOL }, () => ({
      active: false,
      kind: "coin",
      lane: CENTER_LANE,
      z: 0,
      prevZ: 0,
      spin: 0,
    })),
    events: [],
  };
}

/* ------------------------------------------------------------------------ */
/* Queries                                                                  */
/* ------------------------------------------------------------------------ */

/** Lanes the player may occupy or that may receive new spawns. */
export function liveLanes(state: GameState): Lane[] {
  const { closed, pending } = state.closure;
  return LANES.filter((lane) => lane !== closed && lane !== pending);
}

export function isLaneLegal(state: GameState, lane: Lane): boolean {
  return lane !== state.closure.closed && lane !== state.closure.pending;
}

/** Lane used for collisions: only when the player is visually settled in it. */
export function collisionLane(state: GameState): Lane | -1 {
  const lane = Math.round(state.laneVisual) as Lane;
  return Math.abs(state.laneVisual - lane) < 0.32 ? lane : -1;
}

export function jumpProgress(state: GameState): number {
  return state.action === "jump" ? 1 - state.actionT / JUMP_DURATION : 0;
}

export function slideProgress(state: GameState): number {
  return state.action === "slide" ? 1 - state.actionT / SLIDE_DURATION : 0;
}

function hasObstacleNear(
  state: GameState,
  lane: Lane,
  z: number,
  gap: number,
  kind?: ObstacleKind,
): boolean {
  return state.obstacles.some(
    (o) =>
      o.active &&
      !o.harmless &&
      o.lane === lane &&
      (kind === undefined || o.kind === kind) &&
      Math.abs(o.z - z) < gap,
  );
}

function hasPickupNear(
  state: GameState,
  lane: Lane,
  z: number,
  gap: number,
  kind?: PickupKind,
): boolean {
  return state.pickups.some(
    (p) =>
      p.active &&
      p.lane === lane &&
      (kind === undefined || p.kind === kind) &&
      Math.abs(p.z - z) < gap,
  );
}

/**
 * A defender wall is a depth band where every live lane holds a defender.
 * Cones and gates can be jumped or slid, so only defenders count. Returns
 * true when placing a defender in `lane` at depth `z` would leave the player
 * without a defender-free live lane.
 */
export function wouldFormDefenderWall(state: GameState, lane: Lane, z: number): boolean {
  return liveLanes(state)
    .filter((other) => other !== lane)
    .every((other) => hasObstacleNear(state, other, z, DEFENDER_WALL_BAND, "defender"));
}

/* ------------------------------------------------------------------------ */
/* Input                                                                    */
/* ------------------------------------------------------------------------ */

export function applyInput(state: GameState, command: InputCommand): void {
  if (state.status !== "running") return;
  switch (command) {
    case "left":
      moveLane(state, -1);
      break;
    case "right":
      moveLane(state, 1);
      break;
    case "jump":
      startAction(state, "jump", JUMP_DURATION);
      break;
    case "slide":
      startAction(state, "slide", SLIDE_DURATION);
      break;
  }
}

function moveLane(state: GameState, dir: -1 | 1): void {
  const next = Math.max(0, Math.min(2, state.lane + dir)) as Lane;
  if (next === state.lane) return;
  if (!isLaneLegal(state, next)) {
    state.events.push({ type: "blocked" });
    return;
  }
  state.lane = next;
  state.dodgeDir = dir;
  state.dodgeT = DODGE_DURATION;
  state.events.push({ type: "move" });
}

function startAction(state: GameState, action: "jump" | "slide", duration: number): void {
  if (state.action !== "run") return;
  state.action = action;
  state.actionT = duration;
  state.events.push({ type: action });
}

/* ------------------------------------------------------------------------ */
/* Spawning                                                                 */
/* ------------------------------------------------------------------------ */

function allocate<T extends { active: boolean }>(pool: T[]): T | null {
  for (const item of pool) if (!item.active) return item;
  return null;
}

function spawnObstacle(state: GameState, kind: ObstacleKind, lane: Lane, z = 0): boolean {
  if (!isLaneLegal(state, lane)) return false;
  if (hasObstacleNear(state, lane, z, SAME_LANE_SPACING)) return false;
  if (hasPickupNear(state, lane, z, PICKUP_SPACING, "bone")) return false;
  if (kind === "defender") {
    if (hasPickupNear(state, lane, z, SAME_LANE_SPACING)) return false;
    if (wouldFormDefenderWall(state, lane, z)) return false;
  }
  const slot = allocate(state.obstacles);
  if (!slot) return false;
  slot.active = true;
  slot.kind = kind;
  slot.lane = lane;
  slot.z = z;
  slot.prevZ = z;
  slot.harmless = false;
  slot.passed = false;
  return true;
}

function spawnPickup(state: GameState, kind: PickupKind, lane: Lane, z = 0): boolean {
  if (!isLaneLegal(state, lane)) return false;
  if (hasObstacleNear(state, lane, z, SAME_LANE_SPACING, "defender")) return false;
  if (hasPickupNear(state, lane, z, PICKUP_SPACING)) return false;
  if (kind === "bone" && hasObstacleNear(state, lane, z, SAME_LANE_SPACING)) return false;
  const slot = allocate(state.pickups);
  if (!slot) return false;
  slot.active = true;
  slot.kind = kind;
  slot.lane = lane;
  slot.z = z;
  slot.prevZ = z;
  slot.spin = state.rng.range(0, Math.PI * 2);
  return true;
}

function spawnPickupInSafeLane(state: GameState, kind: PickupKind): boolean {
  const lanes = liveLanes(state).filter((lane) => {
    if (hasPickupNear(state, lane, 0, PICKUP_SPACING)) return false;
    return kind === "bone"
      ? !hasObstacleNear(state, lane, 0, SAME_LANE_SPACING)
      : !hasObstacleNear(state, lane, 0, SAME_LANE_SPACING, "defender");
  });
  if (lanes.length === 0) return false;
  return spawnPickup(state, kind, state.rng.pick(lanes), 0);
}

function weightedKind(rng: Rng, defender: number, cone: number): ObstacleKind {
  const roll = rng.next();
  return roll < defender ? "defender" : roll < defender + cone ? "cone" : "gate";
}

/** Difficulty tier once lane closures begin. */
function closureTier(state: GameState): 0 | 1 | 2 {
  const p = state.possession;
  return p < FIRST_CLOSURE_POSSESSION ? 0 : p < FIRST_CLOSURE_POSSESSION + 2 ? 1 : 2;
}

/** Spawn one wave of obstacles according to the current possession. */
function spawnWave(state: GameState): void {
  const { rng, possession } = state;
  const lanes = liveLanes(state);
  if (lanes.length < 2) return;

  if (possession === 1) {
    spawnObstacle(state, weightedKind(rng, 0.45, 0.31), rng.pick(lanes));
    return;
  }
  if (possession === 2) {
    if (rng.next() < 0.58) {
      const open = rng.pick(lanes);
      lanes
        .filter((lane) => lane !== open)
        .forEach((lane, i) => spawnObstacle(state, i ? "cone" : "defender", lane, -i * 0.04));
    } else {
      spawnObstacle(state, rng.next() < 0.55 ? "cone" : "gate", rng.pick(lanes));
    }
    return;
  }
  if (closureTier(state) === 0) {
    const open = rng.pick(lanes);
    lanes
      .filter((lane) => lane !== open)
      .forEach((lane, i) =>
        spawnObstacle(state, rng.pick<ObstacleKind>(["defender", "cone", "gate"]), lane, -i * 0.035),
      );
    return;
  }
  if (closureTier(state) === 1) {
    // First closures: one readable choice per wave.
    spawnObstacle(state, weightedKind(rng, 0.4, 0.32), rng.pick(lanes));
    return;
  }
  // Later closures: paired-lane decisions with a guaranteed clear lane.
  const first = lanes[0];
  const second = lanes[1];
  if (first === undefined || second === undefined) return;
  const roll = rng.int(6);
  if (roll === 0) spawnObstacle(state, "defender", first);
  else if (roll === 1) spawnObstacle(state, "cone", second);
  else if (roll === 2) spawnObstacle(state, "gate", first);
  else {
    const pairs: [ObstacleKind, ObstacleKind][] = [
      ["cone", "defender"],
      ["cone", "gate"],
      ["defender", "gate"],
    ];
    const pair = pairs[roll - 3];
    if (pair) {
      spawnObstacle(state, pair[0], first);
      spawnObstacle(state, pair[1], second, -0.045);
    }
  }
}

function nextSpawnDelay(state: GameState, pace: number, difficulty: number): number {
  const tier = closureTier(state);
  if (tier === 1) return state.rng.range(1.1, 1.22);
  if (tier === 2) return state.rng.range(0.86, 0.98);
  return Math.max(0.58, 0.88 / (difficulty * pace)) + state.rng.range(-0.04, 0.1);
}

/* ------------------------------------------------------------------------ */
/* Lane closures                                                            */
/* ------------------------------------------------------------------------ */

/** Seconds until an obstacle at depth z reaches the collision window. */
function secondsToCollision(state: GameState, z: number): number {
  return (COLLISION_Z.start - z) / Math.max(state.speed, 1e-6);
}

/**
 * Make the escape lane safe: anything in the center lane that would reach the
 * player before the warning ends (plus a grace period) becomes harmless. The
 * player in a closing side lane can only escape through the center lane, so
 * this is what guarantees a closure never forces a foul.
 */
function clearEscapeLane(state: GameState, horizon: number): void {
  for (const o of state.obstacles) {
    if (!o.active || o.harmless || o.lane !== CENTER_LANE) continue;
    if (o.z < COLLISION_Z.end && secondsToCollision(state, o.z) < horizon) {
      o.harmless = true;
    }
  }
}

function beginClosure(state: GameState): void {
  const closure = state.closure;
  // The previous lane reopens before the new warning begins so the player
  // always has at least two legal lanes.
  closure.closed = -1;
  const side = closure.nextSide;
  closure.nextSide = side === 0 ? 2 : 0;
  closure.pending = side;
  closure.warning = CLOSURE_WARNING;

  for (const o of state.obstacles) {
    if (o.active && o.lane === side) o.harmless = true;
  }
  clearEscapeLane(state, CLOSURE_WARNING + CLOSURE_ESCAPE_GRACE);
  // Hold new waves until the closure has resolved and the player has settled.
  state.spawnTimer = Math.max(state.spawnTimer, CLOSURE_WARNING + 0.35);
  state.events.push({ type: "laneClosing", lane: side });
}

function finishClosure(state: GameState): void {
  const closure = state.closure;
  const lane = closure.pending;
  if (lane === -1) return;
  closure.closed = lane;
  closure.pending = -1;
  closure.warning = 0;

  for (const p of state.pickups) if (p.active && p.lane === lane) p.active = false;

  const shoved = state.lane === lane;
  if (shoved) {
    // A referee shove, not a foul: the player is pushed into the center lane
    // and protected long enough to react to whatever is coming next.
    state.lane = CENTER_LANE;
    state.dodgeDir = lane === 0 ? 1 : -1;
    state.dodgeT = DODGE_DURATION;
    state.invulnerable = Math.max(state.invulnerable, SHOVE_GRACE);
    clearEscapeLane(state, SHOVE_GRACE);
  }
  state.events.push({ type: "laneClosed", lane, shoved });
}

function shouldCloseThisPossession(possession: number): boolean {
  if (possession < FIRST_CLOSURE_POSSESSION) return false;
  return (possession - FIRST_CLOSURE_POSSESSION) % 2 === 0;
}

/* ------------------------------------------------------------------------ */
/* Scoring                                                                  */
/* ------------------------------------------------------------------------ */

function foul(state: GameState, by: ObstacleKind): void {
  if (state.invulnerable > 0) return;
  state.invulnerable = FOUL_INVULNERABILITY;
  state.fouls += 1;
  state.events.push({ type: "foul", fouls: state.fouls, by });
  if (state.fouls >= state.rules.maxFouls) {
    state.status = "over";
    state.events.push({ type: "gameOver" });
  }
}

function collect(state: GameState, kind: PickupKind): void {
  if (kind === "bone") {
    state.score += BONE_VALUE;
    state.events.push({ type: "bone" });
    return;
  }
  state.score += COIN_VALUE;
  state.events.push({ type: "coin" });
  if (state.heatActive) return;
  state.heat += 1;
  if (state.heat >= HEAT_TOKENS) {
    state.heat = 0;
    state.heatActive = true;
    state.heatLeft = HEAT_DURATION;
    state.heatChecks += 1;
    state.events.push({ type: "heat" });
  }
}

function resolveCollision(state: GameState, o: Obstacle): void {
  const need = REQUIRED_ACTION[o.kind];
  const jp = jumpProgress(state);
  const sp = slideProgress(state);
  const jumpSafe = state.action === "jump" && jp > 0.06 && jp < 0.9;
  const slideSafe = state.action === "slide" && sp > 0.08 && sp < 0.9;
  const safe = (need === "jump" && jumpSafe) || (need === "slide" && slideSafe);
  if (!safe) foul(state, o.kind);
  o.harmless = true;
  o.passed = true;
}

/* ------------------------------------------------------------------------ */
/* Step                                                                     */
/* ------------------------------------------------------------------------ */

/** Advance the simulation by a fixed time step (seconds). */
export function step(state: GameState, dt: number): void {
  if (state.status !== "running") return;
  state.elapsed += dt;
  stepPlayer(state, dt);
  stepClosure(state, dt);
  const { speed, pace, difficulty } = stepPace(state, dt);
  stepSpawning(state, dt, pace, difficulty);
  stepObstacles(state, dt, speed);
  stepPickups(state, dt, speed);
}

function stepPlayer(state: GameState, dt: number): void {
  if (state.invulnerable > 0) state.invulnerable -= dt;
  if (state.dodgeT > 0) state.dodgeT = Math.max(0, state.dodgeT - dt);
  state.prevLaneVisual = state.laneVisual;
  // Exponential ease that is frame-rate independent because dt is fixed.
  state.laneVisual += (state.lane - state.laneVisual) * Math.min(1, dt * 16);
  if (Math.abs(state.lane - state.laneVisual) < 0.002) state.laneVisual = state.lane;
  if (state.actionT > 0) {
    state.actionT -= dt;
    if (state.actionT <= 0) {
      state.actionT = 0;
      state.action = "run";
    }
  }
  if (state.heatActive) {
    state.heatLeft -= dt;
    if (state.heatLeft <= 0) state.heatActive = false;
  }
}

function stepClosure(state: GameState, dt: number): void {
  const closure = state.closure;
  if (closure.pending === -1) return;
  closure.warning -= dt;
  if (closure.warning <= 0) finishClosure(state);
}

function stepPace(state: GameState, dt: number): { speed: number; pace: number; difficulty: number } {
  const difficulty = 1 + (state.possession - 1) * 0.09;
  const rampT = Math.min(1, state.elapsed / 60);
  const ramp = rampT * rampT * (3 - 2 * rampT);
  const pace = 0.54 + 0.4 * ramp;
  const baseSpeed = Math.min(0.72, 0.52 * difficulty * pace);
  const speed = baseSpeed * (state.heatActive ? HEAT_SPEED_BONUS : 1);
  state.speed = speed;

  const previous = state.distance;
  state.distance += dt * 78 * difficulty * pace;
  const crossed =
    Math.floor(state.distance / FEET_PER_POSSESSION) > Math.floor(previous / FEET_PER_POSSESSION);
  if (crossed) {
    state.possession += 1;
    state.events.push({ type: "possession", possession: state.possession });
    if (shouldCloseThisPossession(state.possession)) beginClosure(state);
  }
  return { speed, pace, difficulty };
}

function stepSpawning(state: GameState, dt: number, pace: number, difficulty: number): void {
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    if (state.closure.pending === -1) spawnWave(state);
    state.spawnTimer = nextSpawnDelay(state, pace, difficulty);
  }
  state.coinTimer -= dt;
  if (state.coinTimer <= 0) {
    const placed = spawnPickupInSafeLane(state, "coin");
    const base = state.possession >= FIRST_CLOSURE_POSSESSION ? 0.53 : 0.66;
    state.coinTimer = placed ? base / pace + state.rng.range(0, 0.16) : 0.12;
  }
  state.boneTimer -= dt;
  if (state.boneTimer <= 0) {
    const placed = spawnPickupInSafeLane(state, "bone");
    state.boneTimer = placed ? state.rng.range(14, 20) : 0.18;
  }
}

function stepObstacles(state: GameState, dt: number, speed: number): void {
  const hitLane = collisionLane(state);
  for (const o of state.obstacles) {
    if (!o.active) continue;
    if (o.lane === state.closure.closed) o.harmless = true;
    o.prevZ = o.z;
    o.z += dt * speed;
    const inWindow = o.z > COLLISION_Z.start && o.z < COLLISION_Z.end;
    if (!o.harmless && inWindow && o.lane === hitLane) resolveCollision(state, o);
    if (o.z > RECYCLE_Z) o.active = false;
  }
}

function stepPickups(state: GameState, dt: number, speed: number): void {
  const hitLane = collisionLane(state);
  for (const p of state.pickups) {
    if (!p.active) continue;
    if (p.lane === state.closure.closed) {
      p.active = false;
      continue;
    }
    p.prevZ = p.z;
    p.z += dt * speed;
    p.spin += dt * 8;
    if (p.z > 0.86 && p.z < 0.99 && p.lane === hitLane) {
      collect(state, p.kind);
      p.active = false;
    } else if (p.z > 1.16) {
      p.active = false;
    }
  }
}

/** Remove and return all queued events. */
export function drainEvents(state: GameState): GameEvent[] {
  const events = state.events;
  state.events = [];
  return events;
}
