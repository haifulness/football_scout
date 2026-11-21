import { motion } from 'motion/react';
import { useState } from 'react';
import type { DilemmaView } from '../../engine/views';
import { Crest } from '../visuals/crest';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';

/** Choices waiting for your answer, and what came of the ones you just made. */
export function DilemmaCards() {
  const dilemmas = useEngineQuery(() => engine.getDilemmas(), []);
  const [justSettled, setJustSettled] = useState<Record<number, string>>({});
  const open = (dilemmas ?? []).filter((d) => d.daysLeft !== undefined);
  const recent = (dilemmas ?? []).filter((d) => d.daysLeft === undefined && justSettled[d.id]);
  if (!open.length && !recent.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {open.map((d) => (
        <Card key={d.id} d={d} onSettled={(o) => setJustSettled((x) => ({ ...x, [d.id]: o }))} />
      ))}
      {recent.map((d) => (
        <div key={d.id} className="panel border-white/10 px-4 py-3 text-sm text-mist-200">
          <span className="panel-title mr-2 text-[11px]">You chose: {d.choice}</span>
          {d.outcome}
        </div>
      ))}
    </div>
  );
}

function Card({ d, onSettled }: { d: DilemmaView; onSettled: (outcome: string) => void }) {
  const { careerAction, navigate } = useGame();
  const [busy, setBusy] = useState(false);
  const answer = async (key: string) => {
    setBusy(true);
    let outcome = '';
    await careerAction(async () => {
      outcome = (await engine.resolveDilemma(d.id, key)).outcome;
    });
    onSettled(outcome);
    setBusy(false);
  };
  return (
    <motion.section
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel overflow-hidden border-violet-400/30 bg-gradient-to-br from-violet-500/[0.08] via-night-900/60 to-night-900/60"
    >
      <div className="flex items-start gap-3 px-4 pb-2 pt-3">
        {d.club ? <Crest club={d.club} size={34} /> : <span className="text-2xl">⚖</span>}
        <div className="min-w-0 flex-1">
          <div className="panel-title text-[11px] text-violet-300">
            A choice to make · {d.daysLeft === 0 ? 'answer today' : `${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'} to answer`}
          </div>
          <h3 className="font-display text-xl font-bold uppercase leading-tight">{d.title}</h3>
          <p className="mt-1 text-sm text-mist-300">
            {d.body}
            {d.player && (
              <button className="ml-1 text-[12px] text-grass-300 hover:underline" onClick={() => navigate({ screen: 'player', id: d.player!.id })}>
                See {d.player.name} →
              </button>
            )}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 px-4 pb-4 pt-1 sm:grid-cols-3">
        {d.choices.map((c) => (
          <button
            key={c.key}
            disabled={busy}
            onClick={() => void answer(c.key)}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left hover:border-violet-300/50 hover:bg-violet-500/[0.08] disabled:opacity-50"
          >
            <span className="block text-sm font-semibold text-mist-100">{c.label}</span>
            <span className="block text-[11px] text-mist-400">{c.hint}</span>
          </button>
        ))}
      </div>
    </motion.section>
  );
}
