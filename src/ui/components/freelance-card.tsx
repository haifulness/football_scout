import { motion } from 'motion/react';
import { useState } from 'react';
import { formatUSD } from '../../engine/core/money';
import type { PlayerView } from '../../engine/views';
import { Crest } from '../visuals/crest';
import { ClubLink } from './club-link';
import { engine } from '../store/engine-client';
import { useGame } from '../store/game-store';

/** Player-page card for freelance work on this player: a client's sale, or representing him as a free agent. */
export function FreelanceCard({ player }: { player: PlayerView }) {
  const { careerAction, openRecommend, navigate } = useGame();
  const [error, setError] = useState<string>();
  const act = (fn: () => Promise<unknown>) => careerAction(fn).catch((e) => setError(e instanceof Error ? e.message : 'That did not work.'));
  const { mandate, representation: rep } = player;
  if (!mandate && !rep) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-4 rounded-xl border border-flood-400/25 bg-gradient-to-r from-flood-500/10 to-transparent px-5 py-4"
    >
      {mandate ? (
        <>
          <Crest club={mandate.club} size={34} />
          <div className="min-w-0 flex-1">
            <div className="panel-title text-[11px] text-flood-400">
              Selling mandate · {mandate.status === 'offered' ? 'awaiting your answer' : `${mandate.daysLeft} days left`}
            </div>
            <div className="text-sm">
              <ClubLink club={mandate.club} className="font-semibold" /> want him sold for <b className="num">{formatUSD(mandate.askingFee)}</b>. Your
              commission:{' '}
              <b className="num text-flood-300">
                {mandate.commissionPct}% ({formatUSD(Math.round((mandate.askingFee * mandate.commissionPct) / 100))})
              </b>
              .
            </div>
          </div>
          {mandate.status === 'active' ? (
            <button className="btn-primary px-4 py-2 text-sm" onClick={() => openRecommend({ playerId: player.id })}>
              Find a buyer
            </button>
          ) : (
            <button className="btn-ghost px-4 py-2 text-sm" onClick={() => navigate({ screen: 'missions' })}>
              Answer in Missions
            </button>
          )}
        </>
      ) : rep?.status === 'represented' ? (
        <>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-flood-500/20 text-lg text-flood-300">✍</div>
          <div className="min-w-0 flex-1">
            <div className="panel-title text-[11px] text-flood-400">You represent him</div>
            <div className="text-sm text-mist-200">Pitch him to any club. AI clubs leave him to you while you act for him.</div>
          </div>
          <button className="btn-primary px-4 py-2 text-sm" onClick={() => openRecommend({ playerId: player.id })}>
            Pitch to a club
          </button>
          <button className="btn-ghost px-3 py-2 text-xs" onClick={() => void act(() => engine.stopRepresenting(player.id))}>
            Stop representing
          </button>
        </>
      ) : (
        <>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] text-lg text-mist-300">✍</div>
          <div className="min-w-0 flex-1">
            <div className="panel-title text-[11px] text-mist-300">Free agent · representation</div>
            <div className="text-sm text-mist-200">
              {rep?.status === 'available' ? 'He trusts you enough to let you act for him. You could then pitch him to any club.' : rep?.reason}
            </div>
          </div>
          <button
            className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
            disabled={rep?.status !== 'available'}
            onClick={() => void act(() => engine.represent(player.id))}
          >
            Represent him
          </button>
        </>
      )}
      {error && <div className="w-full text-[12px] text-alert-400">{error}</div>}
    </motion.div>
  );
}
