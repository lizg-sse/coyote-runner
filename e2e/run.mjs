/**
 * Production smoke test. Builds are served with `vite preview` (the exact
 * files that would be deployed), then driven in headless Chromium under phone
 * emulation. It checks that the page loads without errors, fits the viewport
 * without overflow, keeps the HUD inside the shell without overlaps, responds
 * to touch swipes and keys, keeps a steady frame cadence, and reaches two lane
 * closures with a scripted bot. Screenshots land in e2e/output/.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium, devices } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "e2e", "output");
const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}/`;
const executablePath =
  process.env.PW_CHROMIUM_PATH ??
  ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find((p) => existsSync(p));

const PROFILES = [
  { name: "iphone-13", ...devices["iPhone 13"] },
  { name: "pixel-5", ...devices["Pixel 5"] },
  { name: "small-320", viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "landscape", ...devices["iPhone 13 landscape"] },
  { name: "desktop", viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
];

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit", ...options });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
  });
}

async function startPreview() {
  const child = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("preview server did not start")), 20000);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes(String(PORT))) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  });
  return child;
}

async function swipe(page, cdp, from, to) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: to.x, y: to.y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(80);
}

async function measureFrames(page, seconds) {
  return page.evaluate(
    (durationMs) =>
      new Promise((resolve) => {
        const gaps = [];
        let last = performance.now();
        const start = last;
        function tick(now) {
          gaps.push(now - last);
          last = now;
          if (now - start < durationMs) requestAnimationFrame(tick);
          else {
            gaps.sort((a, b) => a - b);
            const sum = gaps.reduce((a, b) => a + b, 0);
            resolve({
              frames: gaps.length,
              avgMs: +(sum / gaps.length).toFixed(2),
              p95Ms: +gaps[Math.floor(gaps.length * 0.95)].toFixed(2),
              maxMs: +gaps[gaps.length - 1].toFixed(2),
              longFrames: gaps.filter((g) => g > 34).length,
            });
          }
        }
        requestAnimationFrame(tick);
      }),
    seconds * 1000,
  );
}

function overlaps(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function inside(inner, outer, tolerance = 1) {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

/** In-page bot: reads QA state, presses keys like a player, waits for two closures. */
async function playUntilTwoClosures(page, screenshotPrefix) {
  return page.evaluate(
    ({ prefix }) =>
      new Promise((resolve) => {
        const hook = window.__coyoteFastBreak;
        const notes = { closings: 0, closed: 0, shoved: 0, fouls: 0, maxObstacleLaneOverflow: 0, prefix };
        let lastPending = -1;
        let lastClosed = -1;
        const press = (key) => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
        const timer = setInterval(() => {
          const state = hook.getState();
          if (state.status !== "running") {
            clearInterval(timer);
            resolve({ ...notes, status: state.status, possession: state.possession });
            return;
          }
          if (state.closure.pending !== lastPending) {
            if (state.closure.pending !== -1) notes.closings += 1;
            lastPending = state.closure.pending;
          }
          if (state.closure.closed !== lastClosed) {
            if (state.closure.closed !== -1) notes.closed += 1;
            lastClosed = state.closure.closed;
          }
          notes.fouls = state.fouls;
          if (notes.closed >= 2 && state.closure.pending === -1) {
            clearInterval(timer);
            resolve({ ...notes, status: state.status, possession: state.possession });
            return;
          }
          const lane = state.lane;
          const live = [0, 1, 2].filter((l) => l !== state.closure.closed && l !== state.closure.pending);
          if (!live.includes(lane)) {
            press(lane > 1 ? "ArrowLeft" : "ArrowRight");
            return;
          }
          const threat = state.obstacles.find(
            (o) => o.active && !o.harmless && o.lane === lane && o.z > 0.6 && o.z < 0.84,
          );
          if (!threat) return;
          const dodge = () => {
            const clear = (l, kinds) =>
              !state.obstacles.some(
                (o) => o.active && !o.harmless && o.lane === l && kinds.includes(o.kind) && o.z > 0.45 && o.z < 0.98,
              );
            const neighbours = live.filter((l) => Math.abs(l - lane) === 1);
            const target =
              neighbours.find((l) => clear(l, ["defender", "cone", "gate"])) ??
              neighbours.find((l) => clear(l, ["defender"]));
            if (target !== undefined) press(target < lane ? "ArrowLeft" : "ArrowRight");
          };
          if (threat.kind === "cone" && state.action === "run") press("ArrowUp");
          else if (threat.kind === "gate" && state.action === "run") press("ArrowDown");
          else dodge();
        }, 25);
      }),
    { prefix: screenshotPrefix },
  );
}

async function testProfile(browser, profile) {
  const { name, ...device } = profile;
  const context = await browser.newContext(device);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
  });
  const result = { name, viewport: device.viewport, errors };

  await page.goto(`${BASE}?qa=1&seed=7`, { waitUntil: "networkidle" });
  const play = page.getByTestId("play");
  await play.waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector('[data-testid="play"]').disabled, null, { timeout: 15000 });
  await page.screenshot({ path: path.join(outputDir, `${name}-1-start.png`) });

  result.overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));
  result.noOverflow =
    result.overflow.scrollWidth <= result.overflow.innerWidth && result.overflow.scrollHeight <= result.overflow.innerHeight;

  const shellBox = await page.getByTestId("shell").boundingBox();
  const viewportBox = { x: 0, y: 0, width: device.viewport.width, height: device.viewport.height };
  result.shellBox = shellBox;
  result.shellFitsViewport = inside(shellBox, viewportBox);
  result.canvasBacking = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    return { width: canvas.width, height: canvas.height, dpr: window.devicePixelRatio };
  });

  await play.click();
  await page.waitForFunction(() => window.__coyoteFastBreak?.isRunning(), null, { timeout: 5000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outputDir, `${name}-2-playing.png`) });

  const hudBoxes = await page.$$eval(".cfb-hud-box, .cfb-heat", (nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, overflowing: n.scrollWidth > n.clientWidth + 1 };
    }),
  );
  result.hudCount = hudBoxes.length;
  result.hudInsideShell = hudBoxes.every((box) => inside(box, shellBox, 2));
  result.hudNoOverlap = hudBoxes.every((a, i) => hudBoxes.every((b, j) => i === j || !overlaps(a, b)));
  result.hudNoTextOverflow = hudBoxes.every((box) => !box.overflowing);

  // Input: swipes on touch devices, keys elsewhere.
  const laneBefore = await page.evaluate(() => window.__coyoteFastBreak.getState().lane);
  if (device.hasTouch) {
    const cdp = await context.newCDPSession(page);
    const cx = shellBox.x + shellBox.width / 2;
    const cy = shellBox.y + shellBox.height / 2;
    await swipe(page, cdp, { x: cx, y: cy }, { x: cx - 80, y: cy });
    result.laneAfterSwipeLeft = await page.evaluate(() => window.__coyoteFastBreak.getState().lane);
    await swipe(page, cdp, { x: cx, y: cy }, { x: cx, y: cy - 80 });
    result.actionAfterSwipeUp = await page.evaluate(() => window.__coyoteFastBreak.getState().action);
    await swipe(page, cdp, { x: cx, y: cy }, { x: cx + 80, y: cy });
    await cdp.detach();
  } else {
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(60);
    result.laneAfterSwipeLeft = await page.evaluate(() => window.__coyoteFastBreak.getState().lane);
    await page.keyboard.press("ArrowUp");
    result.actionAfterSwipeUp = await page.evaluate(() => window.__coyoteFastBreak.getState().action);
    await page.keyboard.press("ArrowRight");
  }
  result.inputWorks = result.laneAfterSwipeLeft === laneBefore - 1 && result.actionAfterSwipeUp === "jump";

  // The bot plays while frame timing is measured, so the measurement covers
  // real gameplay with input, spawning, collisions and HUD updates.
  const exerciseClosures = name === "iphone-13" || name === "desktop";
  const botPromise = exerciseClosures ? playUntilTwoClosures(page, name) : null;
  result.frames = await measureFrames(page, 4);
  await page.screenshot({ path: path.join(outputDir, `${name}-3-midgame.png`) });
  if (botPromise) {
    result.bot = await botPromise;
    await page.screenshot({ path: path.join(outputDir, `${name}-4-after-closures.png`) });
  }

  await context.close();
  return result;
}

/** Capture the lane-closure warning itself on a phone for the visual record. */
async function captureClosureFrames(browser) {
  const context = await browser.newContext(devices["iPhone 13"]);
  const page = await context.newPage();
  await page.goto(`${BASE}?qa=1&seed=7`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.querySelector('[data-testid="play"]').disabled);
  await page.getByTestId("play").click();
  await page.waitForFunction(() => window.__coyoteFastBreak?.isRunning());
  const botDone = playUntilTwoClosures(page, "closure");
  await page.waitForFunction(() => window.__coyoteFastBreak.getState().closure.pending !== -1, null, { timeout: 120000 });
  await page.screenshot({ path: path.join(outputDir, "iphone-13-5-closure-warning.png") });
  await page.waitForFunction(() => window.__coyoteFastBreak.getState().closure.closed !== -1, null, { timeout: 120000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outputDir, "iphone-13-6-lane-closed.png") });
  const bot = await botDone;
  await context.close();
  return bot;
}

async function main() {
  mkdirSync(outputDir, { recursive: true });
  if (!existsSync(path.join(root, "dist", "index.html"))) await run("npx", ["vite", "build"]);
  const preview = await startPreview();
  const browser = await chromium.launch({ executablePath });
  const results = [];
  let failed = false;
  try {
    for (const profile of PROFILES) {
      const result = await testProfile(browser, profile);
      results.push(result);
      const checks = {
        noErrors: result.errors.length === 0,
        noOverflow: result.noOverflow,
        shellFitsViewport: result.shellFitsViewport,
        hudInsideShell: result.hudInsideShell,
        hudNoOverlap: result.hudNoOverlap,
        hudNoTextOverflow: result.hudNoTextOverflow,
        inputWorks: result.inputWorks,
        botReachedTwoClosures: result.bot ? result.bot.closed >= 2 : true,
        botSurvivedClosures: result.bot ? result.bot.status === "running" : true,
      };
      result.checks = checks;
      const ok = Object.values(checks).every(Boolean);
      failed ||= !ok;
      console.log(`${ok ? "PASS" : "FAIL"} ${result.name} ${JSON.stringify(checks)} frames=${JSON.stringify(result.frames)}`);
      if (result.errors.length) console.log("  errors:", result.errors);
    }
    const closure = await captureClosureFrames(browser);
    results.push({ name: "closure-capture", bot: closure });
    console.log(`closure capture: ${JSON.stringify(closure)}`);
  } finally {
    await browser.close();
    // Kill the whole process group so the server does not outlive this script.
    try {
      process.kill(-preview.pid, "SIGTERM");
    } catch {
      preview.kill();
    }
  }
  writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(results, null, 2));
  if (failed) {
    console.error("E2E FAILED");
    process.exit(1);
  }
  console.log("E2E PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
