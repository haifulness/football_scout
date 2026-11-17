import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { formatDate, type GameDate } from '../../engine/core/calendar';
import { useGame } from '../store/game-store';

function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** Small save-state line: saving, saved (when), unsaved changes, or an error. */
export function SaveIndicator() {
  const save = useGame((s) => s.save);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  let tone = 'text-mist-400';
  let dot = 'bg-grass-400';
  let text: string;
  if (save.error) {
    tone = 'text-alert-400';
    dot = 'bg-alert-500';
    text = `Save failed: ${save.error}`;
  } else if (save.saving) {
    dot = 'bg-flood-400 animate-pulse';
    text = 'Saving…';
  } else if (save.dirty) {
    dot = 'bg-flood-400';
    text = save.savedGameDate !== undefined ? `Last saved ${formatDate(save.savedGameDate as GameDate)}` : 'Not saved yet';
  } else {
    text = save.savedAt ? `Saved ${ago(save.savedAt, now)}` : 'Saved';
  }

  return (
    <div className={`flex items-center gap-2 px-1 text-[11px] ${tone}`} title={save.dirty ? 'Autosaves every in-game week. ⌘S to save now.' : undefined}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={text}
          className="truncate"
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.15 }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
