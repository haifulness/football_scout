import { motion } from 'motion/react';
import { useState } from 'react';
import type { BoardAskView } from '../../engine/views';
import { Crest } from '../visuals/crest';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';

/** Presidents asking who should coach their club next, and what came of your answers. */
export function BoardAskCards() {
  const asks = useEngineQuery(() => engine.getBoardAsks(), []);
  const [done, setDone] = useState<{ id: number; message: string }[]>([]);
  if (!asks?.length && !done.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {(asks ?? []).map((a) => (
        <Card key={a.id} a={a} onDone={(message) => setDone((d) => [...d, { id: a.id, message }])} />
      ))}
      {done.map((d) => (
        <div key={d.id} className="panel border-white/10 px-4 py-3 text-sm text-mist-200">
          <span className="panel-title mr-2 text-[11px] text-flood-300">Boardroom</span>
          {d.message}
        </div>
      ))}
    </div>
  );
}

function Card({ a, onDone }: { a: BoardAskView; onDone: (message: string) => void }) {
  const { careerAction, navigate } = useGame();
  const [busy, setBusy] = useState(false);
  const answer = async (coachId: BoardAskView['candidates'][number]['id'] | null) => {
    setBusy(true);
    let message = '';
    await careerAction(async () => {
      message = (await engine.answerBoardAsk(a.id, coachId)).message;
    });
    onDone(message);
    setBusy(false);
  };
  return (
    <motion.section
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel overflow-hidden border-flood-400/30 bg-gradient-to-br from-flood-500/[0.08] via-night-900/60 to-night-900/60"
    >
      <div className="flex items-start gap-3 px-4 pb-2 pt-3">
        <button onClick={() => navigate({ screen: 'club', id: a.club.id })} title={`Open ${a.club.name}`}>
          <Crest club={a.club} size={34} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="panel-title text-[11px] text-flood-300">
            The boardroom · {a.daysLeft === 0 ? 'answer today' : `${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'} to answer`}
          </div>
          <h3 className="font-display text-xl font-bold uppercase leading-tight">Who should coach {a.club.name}?</h3>
          <p className="mt-1 text-sm text-mist-300">
            President {a.president} is parting with {a.outgoing} {a.reason}, and wants your advice before he appoints anyone. The man you name will know who
            put him forward.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 px-4 pb-4 pt-1 sm:grid-cols-2 lg:grid-cols-4">
        {a.candidates.map((c) => (
          <button
            key={c.id}
            disabled={busy}
            onClick={() => void answer(c.id)}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left hover:border-flood-300/50 hover:bg-flood-500/[0.08] disabled:opacity-50"
          >
            <span className="block text-sm font-semibold text-mist-100">{c.name}</span>
            <span className="block text-[11px] text-mist-400">
              {c.age} · you know him ({c.relationship})
              {c.lastClub ? ` · last at ${c.lastClub}` : ''}
              {c.formation ? ` · plays ${c.formation}` : ''}
            </span>
          </button>
        ))}
        <button
          disabled={busy}
          onClick={() => void answer(null)}
          className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-left hover:border-white/25 disabled:opacity-50"
        >
          <span className="block text-sm font-semibold text-mist-200">Leave it to the board</span>
          <span className="block text-[11px] text-mist-400">No favour owed either way</span>
        </button>
      </div>
    </motion.section>
  );
}
