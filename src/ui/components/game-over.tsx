import { motion } from 'motion/react';
import { formatDate } from '../../engine/core/calendar';
import { useGame } from '../store/game-store';

/** Bankruptcy ends the career: show it plainly and offer the way back to the menu. */
export function GameOver() {
  const { scout, quitToMenu } = useGame();
  if (!scout?.careerOver) return null;
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night-950/90 p-6 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="panel w-full max-w-md p-8 text-center"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 160, damping: 18 }}
      >
        <div className="panel-title text-alert-400">{formatDate(scout.careerOver.date)}</div>
        <h2 className="mt-1 font-display text-5xl font-bold uppercase leading-none">Career over</h2>
        <p className="mt-4 text-mist-300">{scout.careerOver.reason}</p>
        <p className="mt-2 text-sm text-mist-400">
          {scout.name} · {scout.backgroundLabel} · reputation {scout.reputation}
        </p>
        <button className="btn-primary mt-6 w-full" onClick={() => void quitToMenu()}>
          Back to the main menu
        </button>
      </motion.div>
    </motion.div>
  );
}
