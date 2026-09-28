import type { GameAssets } from "./assets";
import {
  BARRIER_SIZING,
  JUMP_DURATION,
  JUMP_FRAMES,
  JUMP_HEIGHT,
  OBSTACLE_SIZING,
  PICKUP_SIZING,
  PLAYER_HEIGHT,
  PLAYER_Z,
  RUN_FPS,
  SIM_STEP,
  SLIDE_DURATION,
  SLIDE_FRAMES,
  VIEW,
} from "./config";
import {
  clamp,
  groundY,
  laneBounds,
  laneCenterXFractional,
  lerp,
  spriteBox,
  type SpriteBox,
} from "./geometry";
import type { GameState, Obstacle, Pickup } from "./model";

/**
 * Canvas renderer. It reads the model and draws; it never mutates game state.
 *
 * Performance rules that keep phones smooth:
 *  - The stadium background is drawn once into an offscreen canvas and then
 *    blitted each frame.
 *  - No `shadowBlur`, no per-frame text, and no per-frame gradients. Glows,
 *    coins, and bones are pre-rendered sprites.
 *  - Every obstacle is sized from its lane width (see geometry.ts), so nothing
 *    grows past the player plane or spills into a neighboring lane.
 */
export interface Renderer {
  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void;
  draw(state: GameState, alpha: number): void;
}



interface Layer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

const MAX_DPR = 2;
const CLOSED_LANE_TINT = "rgba(8, 10, 18, 0.5)";

function makeLayer(width: number, height: number): Layer {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  return { canvas, ctx };
}

export function createRenderer(canvas: HTMLCanvasElement, assets: GameAssets): Renderer {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("2D canvas is not available");
  const ctx: CanvasRenderingContext2D = context;

  let scaleX = 1;
  let scaleY = 1;
  let background: Layer | null = null;
  const coin = renderCoin();
  const glow = renderGlow();

  function resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
    const dpr = clamp(devicePixelRatio || 1, 1, MAX_DPR);
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    scaleX = width / VIEW.width;
    scaleY = height / VIEW.height;
    background = renderBackground(assets.stadium, width, height, scaleX, scaleY);
  }

  function draw(state: GameState, alpha: number): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (background) ctx.drawImage(background.canvas, 0, 0);
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const time = state.elapsed + alpha * SIM_STEP;
    drawClosure(ctx, assets, state, time);

    const obstacles = state.obstacles.filter((o) => o.active).sort((a, b) => a.z - b.z);
    const pickups = state.pickups.filter((p) => p.active).sort((a, b) => a.z - b.z);
    const frontGates: Obstacle[] = [];
    for (const o of obstacles) {
      const z = lerp(o.prevZ, o.z, alpha);
      if (o.kind === "gate" && z > 0.82) frontGates.push(o);
      else drawObstacle(ctx, assets, o, z);
    }
    for (const p of pickups) drawPickup(ctx, coin, assets.bone, p, lerp(p.prevZ, p.z, alpha));
    drawPlayer(ctx, assets, glow, state, alpha, time);
    for (const o of frontGates) drawObstacle(ctx, assets, o, lerp(o.prevZ, o.z, alpha));
  }

  return { resize, draw };
}

/* ------------------------------------------------------------------------ */
/* Background                                                               */
/* ------------------------------------------------------------------------ */

function renderBackground(stadium: HTMLImageElement, width: number, height: number, sx: number, sy: number): Layer {
  const layer = makeLayer(width, height);
  const g = layer.ctx;
  g.setTransform(sx, 0, 0, sy, 0, 0);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  // The plate is pre-cropped to the view's aspect with its far court on the horizon line.
  g.drawImage(stadium, 0, 0, VIEW.width, VIEW.height);
  return layer;
}

/* ------------------------------------------------------------------------ */
/* Pre-rendered sprites                                                     */
/* ------------------------------------------------------------------------ */

function renderCoin(): Layer {
  const size = 64;
  const layer = makeLayer(size, size);
  const g = layer.ctx;
  const c = size / 2;
  const halo = g.createRadialGradient(c, c, c * 0.5, c, c, c);
  halo.addColorStop(0, "rgba(255, 242, 126, 0.6)");
  halo.addColorStop(1, "rgba(255, 242, 126, 0)");
  g.fillStyle = halo;
  g.fillRect(0, 0, size, size);
  g.fillStyle = "#ffc61c";
  g.beginPath();
  g.arc(c, c, c * 0.66, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#fff2a5";
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = "#fff";
  g.font = `900 ${size * 0.6}px Arial, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("★", c, c + 2);
  return layer;
}

function renderGlow(): Layer {
  const size = 256;
  const layer = makeLayer(size, size);
  const g = layer.ctx;
  const c = size / 2;
  const fire = g.createRadialGradient(c, c, 10, c, c, c);
  fire.addColorStop(0, "rgba(255, 170, 40, 0.75)");
  fire.addColorStop(0.45, "rgba(255, 110, 20, 0.35)");
  fire.addColorStop(1, "rgba(255, 80, 0, 0)");
  g.fillStyle = fire;
  g.fillRect(0, 0, size, size);
  return layer;
}

/* ------------------------------------------------------------------------ */
/* Scene elements                                                           */
/* ------------------------------------------------------------------------ */

/**
 * Contact shadow. The camera looks down at the court, so the shadow sits
 * under the object's footprint: its centre is pulled up from the sprite's
 * bottom edge so the base overlaps the shadow instead of hovering above it.
 */
function drawShadow(g: CanvasRenderingContext2D, x: number, y: number, width: number, alpha: number): void {
  const ry = width * 0.11;
  g.globalAlpha = alpha;
  g.fillStyle = "#000";
  g.beginPath();
  g.ellipse(x, y - ry * 0.7, width * 0.5, ry, 0, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
}

function drawBoxImage(g: CanvasRenderingContext2D, image: CanvasImageSource, box: SpriteBox): void {
  g.drawImage(image, box.x - box.width / 2, box.y - box.height, box.width, box.height);
}

function drawClosure(g: CanvasRenderingContext2D, assets: GameAssets, state: GameState, time: number): void {
  const { pending, closed } = state.closure;
  const lane = pending !== -1 ? pending : closed;
  if (lane === -1) return;
  const pulse = pending !== -1 ? 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(time * 14)) : 0.6;

  const far = laneBounds(lane, 0);
  const near = laneBounds(lane, 1.3);
  g.globalAlpha = pulse;
  g.fillStyle = CLOSED_LANE_TINT;
  g.beginPath();
  g.moveTo(far.left, groundY(0));
  g.lineTo(far.right, groundY(0));
  g.lineTo(near.right, groundY(1.3));
  g.lineTo(near.left, groundY(1.3));
  g.closePath();
  g.fill();

  const aspect = assets.barrier.height / assets.barrier.width;
  for (const z of [0.15, 0.5, 0.85]) {
    const box = spriteBox(lane, z, BARRIER_SIZING, aspect);
    drawBoxImage(g, assets.barrier, box);
  }
  g.globalAlpha = 1;
}

/** Items fade in over the first stretch of court so they never pop into view. */
function spawnFade(z: number): number {
  return clamp(z / 0.08, 0, 1);
}

function drawObstacle(g: CanvasRenderingContext2D, assets: GameAssets, o: Obstacle, z: number): void {
  const image = o.kind === "defender" ? assets.defender : o.kind === "cone" ? assets.cone : assets.gate;
  const box = spriteBox(o.lane, z, OBSTACLE_SIZING[o.kind], image.height / image.width);
  const alpha = (o.harmless && !o.passed ? 0.45 : 1) * spawnFade(z);
  if (alpha <= 0) return;
  drawShadow(g, box.x, box.y, box.width * 1.05, 0.24 * alpha);
  g.globalAlpha = alpha;
  drawBoxImage(g, image, box);
  g.globalAlpha = 1;
}

function drawPickup(g: CanvasRenderingContext2D, coin: Layer, bone: HTMLImageElement, p: Pickup, z: number): void {
  const sizing = PICKUP_SIZING[p.kind];
  const box = spriteBox(p.lane, z, sizing, bone.height / bone.width);
  const lift = box.width * 0.9;
  const alpha = spawnFade(z);
  if (alpha <= 0) return;
  g.globalAlpha = alpha;
  if (p.kind === "bone") {
    const bob = Math.sin(p.spin * 0.3) * box.height * 0.15;
    g.drawImage(bone, box.x - box.width / 2, box.y - lift - box.height / 2 + bob, box.width, box.height);
  } else {
    // Spin the coin by squashing it horizontally. Cheap and reads as 3D.
    const squash = Math.max(0.18, Math.abs(Math.cos(p.spin)));
    const w = box.width * squash;
    g.drawImage(coin.canvas, box.x - w / 2, box.y - lift - box.width / 2, w, box.width);
  }
  g.globalAlpha = 1;
}

function jumpAir(progress: number): number {
  const u = clamp((progress - 0.06) / 0.84, 0, 1);
  return Math.pow(Math.sin(Math.PI * u), 1.18);
}

function stageFrame(stages: readonly { until: number; frame: number }[], progress: number): number {
  return (stages.find((stage) => progress < stage.until) ?? stages[stages.length - 1])?.frame ?? 0;
}

function drawPlayer(
  g: CanvasRenderingContext2D,
  assets: GameAssets,
  glow: Layer,
  state: GameState,
  alpha: number,
  time: number,
): void {
  const laneIndex = lerp(state.prevLaneVisual, state.laneVisual, alpha);
  const x = laneCenterXFractional(laneIndex, PLAYER_Z);
  const groundLine = groundY(PLAYER_Z);
  // Both strips were registered at the same source scale, so one factor sizes both.
  const scale = PLAYER_HEIGHT / assets.runMeta.height;

  let strip = assets.run;
  let meta = assets.runMeta;
  let frame = Math.floor(time * RUN_FPS) % meta.frames;
  let y = groundLine;
  let rotation = 0;
  let air = 0;

  if (state.action === "jump") {
    const progress = 1 - Math.max(0, state.actionT - alpha * SIM_STEP) / JUMP_DURATION;
    frame = stageFrame(JUMP_FRAMES, progress);
    air = jumpAir(progress);
    y -= air * JUMP_HEIGHT;
    rotation = (0.46 - progress) * 0.25;
  } else if (state.action === "slide") {
    strip = assets.slide;
    meta = assets.slideMeta;
    const progress = 1 - Math.max(0, state.actionT - alpha * SIM_STEP) / SLIDE_DURATION;
    frame = stageFrame(SLIDE_FRAMES, progress);
  }
  const dodge = state.dodgeT > 0 ? Math.sin(Math.PI * (1 - state.dodgeT / 0.22)) : 0;
  if (dodge > 0 && state.action === "run") rotation = state.dodgeDir * dodge * 0.18;

  const width = meta.width * scale;
  const height = meta.height * scale;
  const groundOffset = meta.groundMargin * scale;

  if (state.heatActive) {
    const size = width * 2.2;
    g.drawImage(glow.canvas, x - size / 2, groundLine - height * 0.55 - size / 2, size, size);
    drawFlames(g, x, groundLine, time);
  }
  drawShadow(g, x, groundLine + 6, width * (state.action === "slide" ? 0.9 : 0.55) * (1 - air * 0.4), state.action === "jump" ? 0.12 : 0.26);

  const blinking = state.invulnerable > 0 && Math.floor(state.invulnerable * 14) % 2 === 0;
  g.save();
  g.translate(x, y + groundOffset);
  g.rotate(rotation);
  g.globalAlpha = blinking ? 0.35 : 1;
  g.drawImage(strip, frame * meta.width, 0, meta.width, meta.height, -width / 2, -height, width, height);
  g.restore();

  if (dodge > 0 && state.action === "run") drawSwoosh(g, x, y, state.dodgeDir, dodge);
  if (state.action === "slide") drawSlideDust(g, x, groundLine, time);
}

function drawFlames(g: CanvasRenderingContext2D, x: number, y: number, time: number): void {
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 4; i++) {
    const wobble = Math.sin(time * 21 + i * 1.7) * 12;
    g.fillStyle = `rgba(255, ${110 + i * 25}, 10, ${0.16 - i * 0.03})`;
    g.beginPath();
    g.ellipse(x + wobble, y + 40 + i * 12, 20 - i * 2, 40 - i * 5, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function drawSwoosh(g: CanvasRenderingContext2D, x: number, y: number, dir: number, strength: number): void {
  g.save();
  g.strokeStyle = "#fff";
  g.globalAlpha = 0.4 * strength;
  g.lineWidth = 4;
  g.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const yy = y - 90 + i * 16;
    g.beginPath();
    g.moveTo(x - dir * (40 + i * 12), yy);
    g.lineTo(x - dir * (74 + i * 16), yy);
    g.stroke();
  }
  g.restore();
}

function drawSlideDust(g: CanvasRenderingContext2D, x: number, y: number, time: number): void {
  g.save();
  g.strokeStyle = "#f5d29a";
  g.globalAlpha = 0.3 + 0.1 * Math.sin(time * 30);
  g.lineWidth = 3;
  g.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.moveTo(x + 22 + i * 9, y + 2 - i * 5);
    g.lineTo(x + 66 + i * 13, y + 2 - i * 5);
    g.stroke();
  }
  g.restore();
}
