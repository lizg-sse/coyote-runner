import type { GameSummary } from "../game/runtime";

interface GameOverScreenProps {
  summary: GameSummary;
  onPlayAgain: () => void;
}

export function GameOverScreen({ summary, onPlayAgain }: GameOverScreenProps) {
  return (
    <div className="cfb-overlay" data-testid="gameover">
      <div className="cfb-eyebrow">🚨 FINAL BUZZER 🚨</div>
      <div>FINAL SCORE</div>
      <div className="cfb-final-score" data-testid="final-score">
        {summary.score.toLocaleString()}
      </div>
      <div className="cfb-stats">
        🚨 {summary.fouls} FOULS
        <br />
        🔥 {summary.heatChecks} HEAT CHECKS
        <br />
        📏 {Math.floor(summary.distance).toLocaleString()} FT
        <br />
        POSSESSION {summary.possession}
      </div>
      <button className="cfb-play" onClick={onPlayAgain} data-testid="play-again">
        PLAY AGAIN
      </button>
    </div>
  );
}
