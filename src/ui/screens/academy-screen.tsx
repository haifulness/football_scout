import { useState } from 'react';
import { formatDate } from '../../engine/core/calendar';
import type { ClubId } from '../../engine/core/ids';
import { formatUSD } from '../../engine/core/money';
import type { AcademyView } from '../../engine/views';
import { ClubLink } from '../components/club-link';
import { Loading, Panel } from '../components/ui';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';
import { Crest } from '../visuals/crest';

/** Academies you sponsor. */
export function AcademyScreen() {
  const a = useEngineQuery(() => engine.getAcademy(), []);
  if (!a) return <Loading label="Walking round the training ground" />;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="panel-title text-flood-300">The long game</div>
        <h1 className="font-display text-5xl font-bold uppercase leading-none">Academy</h1>
        <p className="mt-2 max-w-2xl text-sm text-mist-300">
          Sponsor a club&apos;s academy: its youth intake grows better, comes to you first already scouted, and the club values you more.
        </p>
      </div>
      {!a.unlocked && (
        <div className="panel p-4 text-sm text-mist-300">Clubs take academy money from a known name. Reach reputation {a.unlockReputation} to sponsor one.</div>
      )}
      <SponsorPanel a={a} />
    </div>
  );
}

function SponsorPanel({ a }: { a: AcademyView }) {
  const { careerAction, advancing } = useGame();
  const [confirm, setConfirm] = useState<string>();
  return (
    <Panel
      title={`Sponsored academies (${a.sponsorships.length}/${a.maxSponsorships})`}
      right={<span className="text-[11px] text-mist-400">Next intake {formatDate(a.nextIntake)}</span>}
    >
      {a.sponsorships.length > 0 && (
        <ul className="divide-y divide-white/[0.04]">
          {a.sponsorships.map((s) => (
            <li key={s.club.id} className="flex items-center gap-3 px-4 py-2.5">
              <Crest club={s.club} size={24} />
              <span className="min-w-0 flex-1">
                <ClubLink club={s.club} />
                <span className="block text-[11px] text-mist-400">
                  Since {formatDate(s.since)} · {formatUSD(s.fee)} a year · their intake is scouted for you each July
                </span>
              </span>
              {confirm === s.club.id ? (
                <span className="flex gap-1">
                  <button
                    className="rounded bg-alert-500 px-2 py-1 text-[11px] font-bold text-white"
                    onClick={() => void careerAction(() => engine.stopSponsoring(s.club.id as ClubId)).then(() => setConfirm(undefined))}
                  >
                    Stop
                  </button>
                  <button className="rounded px-2 py-1 text-[11px] text-mist-300" onClick={() => setConfirm(undefined)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button className="rounded px-2 py-1 text-[11px] text-mist-400 hover:text-alert-400" onClick={() => setConfirm(s.club.id)} title="This year's fee is not refunded">
                  Stop…
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-white/[0.05] px-4 py-2 text-[11px] text-mist-400">
        Sponsor a club you know: the president needs to trust you. Their intake grows bigger and better, you see it first, and your standing there rises.
      </div>
      {a.candidates.length === 0 ? (
        <div className="p-4 text-sm text-mist-400">No club knows you well enough yet. Work with a club, or get to know its coach, first.</div>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {a.candidates.map((c) => (
            <li key={c.club.id} className="flex items-center gap-3 px-4 py-2">
              <Crest club={c.club} size={20} />
              <span className="min-w-0 flex-1">
                <ClubLink club={c.club} />
                <span className="block text-[11px] text-mist-400">
                  Standing {c.trust} · {formatUSD(c.fee)} a year{c.reason ? ` · ${c.reason}` : ''}
                </span>
              </span>
              <button className="btn-ghost px-3 py-1 text-xs" disabled={!c.ok || advancing} onClick={() => void careerAction(() => engine.sponsorAcademy(c.club.id as ClubId))}>
                Sponsor
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
