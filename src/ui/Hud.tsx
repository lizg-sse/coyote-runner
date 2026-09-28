import { HEAT_TOKENS, MAX_FOULS } from "../game/config";
import type { HudSnapshot } from "../game/runtime";

interface HudProps {
  hud: HudSnapshot;
  message: string;
}

/**
 * Heads-up display rendered by React. The runtime only publishes a new
 * snapshot when a value changes, so this component re-renders a few times a
 * second at most and never competes with the canvas for frame time.
 */
export function Hud({ hud, message }: HudProps) {
  return (
    <>
      <div className="cfb-hud" aria-live="polite">
        <div className="cfb-hud-box">
          <small>SCORE</small>
          <b data-testid="score">{hud.score.toLocaleString()}</b>
        </div>
        <div className={`cfb-heat${hud.heatActive ? " is-hot" : ""}`}>
          <div className="cfb-heat-label">{hud.heatActive ? "🔥 HEAT CHECK! 🔥" : "🔥 HEAT CHECK"}</div>
          <div className="cfb-bits">
            {Array.from({ length: HEAT_TOKENS }, (_, i) => (
              <i key={i} className={`cfb-bit${hud.heatActive || i < hud.heat ? " is-on" : ""}`} />
            ))}
          </div>
        </div>
        <div className="cfb-hud-box">
          <small>FOULS · P{hud.possession}</small>
          <b data-testid="fouls">
            {hud.fouls} / {MAX_FOULS}
          </b>
          <div className="cfb-foul-bits">
            {Array.from({ length: MAX_FOULS }, (_, i) => (
              <i key={i} className={`cfb-foul-dot${i < hud.fouls ? " is-on" : ""}`} />
            ))}
          </div>
        </div>
      </div>
      <div className={`cfb-message${message ? " is-visible" : ""}`} data-testid="message">
        {message}
      </div>
    </>
  );
}
