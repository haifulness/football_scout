import { motion } from 'motion/react';
import { useState } from 'react';
import { formatUSD } from '../../engine/core/money';
import type { ConsultationAnswer } from '../../engine/model/consultation';
import type { ConsultationView } from '../../engine/views';
import { Crest } from '../visuals/crest';
import { Portrait } from '../visuals/portrait';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';
import { useCultureLookup } from './ui';

/** Players asking whether to join a club, and what you told them. */
export function ConsultationCards() {
  const asks = useEngineQuery(() => engine.getConsultations(), []);
  const [done, setDone] = useState<{ id: number; message: string }[]>([]);
  if (!asks?.length && !done.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {(asks ?? []).map((c) => (
        <Card key={c.id} c={c} onDone={(message) => setDone((d) => [...d, { id: c.id, message }])} />
      ))}
      {done.map((d) => (
        <div key={d.id} className="panel border-white/10 px-4 py-3 text-sm text-mist-200">
          <span className="panel-title mr-2 text-[11px] text-sky-300">Your advice</span>
          {d.message}
        </div>
      ))}
    </div>
  );
}

const ANSWERS: { key: ConsultationAnswer; label: string; hint: string }[] = [
  { key: 'go', label: 'Go', hint: 'He signs. Right if he plays there.' },
  { key: 'if-starts', label: 'Only if he starts', hint: 'He goes only with a promise. Safer, earns less trust.' },
  { key: 'stay', label: 'Stay away', hint: 'He stays. Right if he’d have sat on the bench.' },
];

function Card({ c, onDone }: { c: ConsultationView; onDone: (message: string) => void }) {
  const { careerAction, navigate } = useGame();
  const cultureOf = useCultureLookup();
  const [busy, setBusy] = useState(false);
  const answer = async (key: ConsultationAnswer) => {
    setBusy(true);
    let message = '';
    await careerAction(async () => {
      message = (await engine.answerConsultation(c.id, key)).message;
    });
    onDone(message);
    setBusy(false);
  };
  const sure = c.marketKnowledge >= 50 ? 'You know that market well.' : c.marketKnowledge >= 20 ? 'You half know that market.' : 'You barely know that market: this is a guess.';
  return (
    <motion.section
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel overflow-hidden border-sky-400/30 bg-gradient-to-br from-sky-500/[0.08] via-night-900/60 to-night-900/60"
    >
      <div className="flex items-start gap-3 px-4 pb-2 pt-3">
        <button onClick={() => navigate({ screen: 'player', id: c.player.id })} title={`Open ${c.player.name}`}>
          <Portrait seed={c.player.portraitSeed} culture={cultureOf(c.player.nationalityId)} size={40} age={c.player.age} className="rounded-md" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="panel-title text-[11px] text-sky-300">
            A player asks · {c.daysLeft === 0 ? 'answer today' : `${c.daysLeft} day${c.daysLeft === 1 ? '' : 's'} to answer`} · pays {formatUSD(c.fee)}
          </div>
          <h3 className="font-display text-xl font-bold uppercase leading-tight">Should {c.player.name} join {c.to.name}?</h3>
          <p className="mt-1 text-sm text-mist-300">
            {c.player.name} ({c.player.position}, {c.player.age}) is at {c.from.name}. {c.to.name} ({c.to.leagueName}, they play {c.to.formation}) have come in
            for him, and he wants to know if he'd play.{' '}
            <span className="text-mist-100">
              Your read: {c.read === 'starter' ? 'he’d start' : 'he’d be a squad player'}.
            </span>{' '}
            {sure}{' '}
            <button className="inline-flex items-center gap-1 text-[12px] text-grass-300 hover:underline" onClick={() => navigate({ screen: 'club', id: c.to.id })}>
              <Crest club={c.to} size={14} /> Check their squad →
            </button>
          </p>
          {c.finderFee !== undefined && (
            <p className="mt-1 text-[12px] text-flood-300">
              {c.to.name} are your club: if he goes, they pay you a {formatUSD(c.finderFee)} finder's fee. Steer him wrong and he'll feel used.
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 px-4 pb-4 pt-1 sm:grid-cols-3">
        {ANSWERS.map((a) => (
          <button
            key={a.key}
            disabled={busy}
            onClick={() => void answer(a.key)}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left hover:border-sky-300/50 hover:bg-sky-500/[0.08] disabled:opacity-50"
          >
            <span className="block text-sm font-semibold text-mist-100">{a.label}</span>
            <span className="block text-[11px] text-mist-400">{a.hint}</span>
          </button>
        ))}
      </div>
    </motion.section>
  );
}
