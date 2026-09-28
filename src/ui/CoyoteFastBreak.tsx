import { useCallback, useEffect, useRef, useState } from "react";
import { loadAssets } from "../game/assets";
import { createBeeper } from "../game/audio";
import { MAX_FOULS, VIEW } from "../game/config";
import { attachInput } from "../game/input";
import type { GameEvent, GameState } from "../game/model";
import { createRuntime, type GameSummary, type HudSnapshot, type Runtime } from "../game/runtime";
import { GameOverScreen } from "./GameOverScreen";
import { Hud } from "./Hud";
import { StartScreen } from "./StartScreen";

export interface CoyoteFastBreakProps {
  /** Fixed seed for reproducible runs (useful for QA). Random when omitted. */
  seed?: number;
  /** Called when a run ends, for leaderboards or analytics in the host app. */
  onGameOver?: (summary: GameSummary) => void;
  /**
   * Exposes `window.__coyoteFastBreak` with read-only state access so
   * automated QA can drive and inspect a real build. Off by default.
   */
  qaHook?: boolean;
}

declare global {
  interface Window {
    __coyoteFastBreak?: { getState: () => GameState; isRunning: () => boolean };
  }
}

type Screen = "start" | "playing" | "over";

const EMPTY_HUD: HudSnapshot = { score: 0, fouls: 0, possession: 1, heat: 0, heatActive: false };

/**
 * Drop-in React component that hosts the whole game. It sizes itself to fill
 * its container while keeping the portrait aspect ratio, and exposes the CSS
 * variable `--u` (logical-to-CSS-pixel scale) so the HUD scales exactly like
 * the canvas on any phone.
 */
export function CoyoteFastBreak({ seed, onGameOver, qaHook = false }: CoyoteFastBreakProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const beeperRef = useRef(createBeeper());
  const messageTimer = useRef<number>(0);
  const onGameOverRef = useRef(onGameOver);
  useEffect(() => {
    onGameOverRef.current = onGameOver;
  }, [onGameOver]);

  const [screen, setScreen] = useState<Screen>("start");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(EMPTY_HUD);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<GameSummary | null>(null);

  const say = useCallback((text: string, seconds: number) => {
    window.clearTimeout(messageTimer.current);
    setMessage(text);
    messageTimer.current = window.setTimeout(() => setMessage(""), seconds * 1000);
  }, []);

  const handleEvent = useCallback(
    (event: GameEvent) => {
      const beep = beeperRef.current.play;
      switch (event.type) {
        case "move":
          beep(330, 0.03, 0.018);
          break;
        case "blocked":
          say("🚧 LANE CLOSED", 0.4);
          beep(180, 0.05, 0.035);
          break;
        case "jump":
          beep(570, 0.04, 0.02);
          break;
        case "slide":
          beep(260, 0.04, 0.02);
          break;
        case "foul":
          say(`🚨 FOUL ${event.fouls} / ${MAX_FOULS}`, 0.55);
          beep(110, 0.12, 0.06);
          break;
        case "coin":
          beep(850, 0.05, 0.03);
          break;
        case "bone":
          say("🦴 +3 POINTS", 0.65);
          beep(1120, 0.11, 0.05);
          break;
        case "heat":
          say("🔥 HEAT CHECK! 🔥", 1);
          beep(980, 0.15, 0.05);
          break;
        case "possession":
          say(`POSSESSION ${event.possession}`, 0.5);
          break;
        case "laneClosing":
          say("⚠️ LANE CLOSING!", 1.2);
          beep(220, 0.1, 0.04);
          break;
        case "laneClosed":
          if (event.shoved) {
            say("🚧 PUSHED TO CENTER", 0.7);
            beep(200, 0.08, 0.04);
          }
          break;
        case "gameOver":
          break;
      }
    },
    [say],
  );

  // Create the runtime once assets are ready and keep it alive for the
  // component's lifetime.
  useEffect(() => {
    const canvas = canvasRef.current;
    const shell = shellRef.current;
    if (!canvas || !shell) return;
    let disposed = false;
    let detachInput: (() => void) | null = null;

    loadAssets()
      .then((assets) => {
        if (disposed) return;
        const runtime = createRuntime(canvas, assets, {
          onHud: setHud,
          onEvent: handleEvent,
          onGameOver: (result) => {
            setSummary(result);
            setScreen("over");
            onGameOverRef.current?.(result);
          },
        });
        runtimeRef.current = runtime;
        if (qaHook) window.__coyoteFastBreak = { getState: runtime.getState, isRunning: runtime.isRunning };
        const rect = shell.getBoundingClientRect();
        runtime.resize(rect.width, rect.height, window.devicePixelRatio);
        detachInput = attachInput(shell, (command) => runtime.input(command));
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!disposed) setError(reason instanceof Error ? reason.message : "Failed to load the game.");
      });

    return () => {
      disposed = true;
      detachInput?.();
      runtimeRef.current?.destroy();
      runtimeRef.current = null;
      if (qaHook) delete window.__coyoteFastBreak;
    };
  }, [handleEvent, qaHook]);

  // Fit the portrait shell into whatever space the host gives us.
  useEffect(() => {
    const root = rootRef.current;
    const shell = shellRef.current;
    if (!root || !shell) return;
    const ratio = VIEW.width / VIEW.height;

    const fit = () => {
      const width = Math.min(root.clientWidth, root.clientHeight * ratio);
      const height = width / ratio;
      shell.style.width = `${width}px`;
      shell.style.height = `${height}px`;
      shell.style.setProperty("--u", String(width / VIEW.width));
      runtimeRef.current?.resize(width, height, window.devicePixelRatio);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => () => window.clearTimeout(messageTimer.current), []);

  const play = useCallback(() => {
    beeperRef.current.unlock();
    setHud(EMPTY_HUD);
    setMessage("");
    setScreen("playing");
    runtimeRef.current?.start(seed);
  }, [seed]);

  return (
    <div className="cfb-root" ref={rootRef}>
      <div className="cfb-shell" ref={shellRef} data-testid="shell">
        <canvas ref={canvasRef} className="cfb-canvas" width={VIEW.width} height={VIEW.height} />
        {screen === "playing" ? <Hud hud={hud} message={message} /> : null}
        {screen === "start" ? <StartScreen loading={loading} error={error} onPlay={play} /> : null}
        {screen === "over" && summary ? <GameOverScreen summary={summary} onPlayAgain={play} /> : null}
      </div>
    </div>
  );
}
