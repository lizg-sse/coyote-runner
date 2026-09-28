import { HERO_IMAGE_URL } from "../game/assets";

interface StartScreenProps {
  loading: boolean;
  error: string | null;
  onPlay: () => void;
}

export function StartScreen({ loading, error, onPlay }: StartScreenProps) {
  return (
    <div className="cfb-overlay">
      <div className="cfb-logo">
        COYOTE'S
        <br />
        FAST BREAK
      </div>
      <img className="cfb-hero" src={HERO_IMAGE_URL} alt="Coyote running with a basketball" />
      <button className="cfb-play" onClick={onPlay} disabled={loading || error !== null} data-testid="play">
        {loading ? "LOADING…" : "PLAY"}
      </button>
      {error ? <div className="cfb-legend cfb-error">{error}</div> : null}
      <div className="cfb-legend">
        <strong>COMPUTER:</strong> Arrow keys / WASD · <strong>PHONE:</strong> Swipe
        <br />
        <strong>DODGE</strong> defenders · <strong>JUMP</strong> cones · <strong>SLIDE</strong> under gates
        <br />
        Gold token = <strong>1 POINT</strong> · Dog Bone = <strong>3 POINTS</strong> · Three fouls end the run.
        <br />
        Collect 5 tokens to trigger <strong>🔥 HEAT CHECK</strong>.
      </div>
    </div>
  );
}
