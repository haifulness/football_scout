import { useState } from 'react';
import { formatDate } from '../../engine/core/calendar';
import type { ClubId, CountryId } from '../../engine/core/ids';
import { formatUSD } from '../../engine/core/money';
import type { AcademyKidView, AcademyView } from '../../engine/views';
import { ClubLink } from '../components/club-link';
import { Loading, Panel, PosBadge, StatTile, useCultureLookup } from '../components/ui';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';
import { Crest } from '../visuals/crest';
import { Portrait } from '../visuals/portrait';

/** Academies: the ones you sponsor, and your own. */
export function AcademyScreen() {
  const a = useEngineQuery(() => engine.getAcademy(), []);
  if (!a) return <Loading label="Walking round the training ground" />;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="panel-title text-flood-300">The long game</div>
        <h1 className="font-display text-5xl font-bold uppercase leading-none">Academy</h1>
        <p className="mt-2 max-w-2xl text-sm text-mist-300">
          Sponsor a club&apos;s academy and its best kids come to you first. With an agency, build your own: recruit 15-year-olds, train them, and place them. Every
          club that signs one pays for his training, and you keep a share of his next transfer.
        </p>
      </div>
      {!a.unlocked && (
        <div className="panel p-4 text-sm text-mist-300">Clubs take academy money from a known name. Reach reputation {a.unlockReputation} to sponsor one.</div>
      )}
      <OwnPanel a={a} />
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

function OwnPanel({ a }: { a: AcademyView }) {
  const { careerAction, advancing } = useGame();
  const own = a.own;
  if (!own) {
    return (
      <Panel title="Your own academy">
        {!a.hasAgency ? (
          <div className="p-4 text-sm text-mist-400">Your own academy needs an agency behind it (Agency › Agency).</div>
        ) : (
          <div className="flex flex-col gap-2 p-4">
            <p className="text-sm text-mist-300">Build it where your agency has a base. The first kids arrive straight away, and a new intake every July.</p>
            <div className="flex flex-wrap gap-2">
              {a.sites.map((s) => (
                <button
                  key={s.id}
                  className="btn-ghost px-3 py-1.5 text-xs"
                  disabled={!s.ok || advancing}
                  title={s.reason}
                  onClick={() => void careerAction(() => engine.openAcademy(s.id as CountryId))}
                >
                  Build in {s.name} · {formatUSD(s.cost)}
                </button>
              ))}
            </div>
            {a.sites.some((s) => !s.ok) && <p className="text-[11px] text-mist-400">{a.sites.find((s) => !s.ok)?.reason}</p>}
          </div>
        )}
      </Panel>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={own.name} accent="var(--color-flood-400)" sub={`${own.city}, ${own.country}`}>
          <span className="text-xl">Level {own.level}</span>
        </StatTile>
        <StatTile label="Kids" accent="var(--color-grass-400)" sub={`Room for ${own.capacity}`}>
          {own.kids.length}
        </StatTile>
        <StatTile label="Upkeep" accent="var(--color-alert-400)" sub="Coaches, pitches, dormitory">
          {formatUSD(own.upkeepWeekly)}
          <span className="text-sm text-mist-400">/wk</span>
        </StatTile>
        <StatTile label="Earned" accent="var(--color-good-400)" sub={`Training fees and ${own.sellOnPct}% sell-ons`}>
          {formatUSD(own.earned)}
        </StatTile>
      </div>
      {own.upgrade && (
        <div className="panel flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="min-w-[220px] flex-1 text-[12px] text-mist-300">
            Level {own.upgrade.level}: better coaching (kids grow faster), room for more, a bigger intake that also reaches nearby countries, and more prodigies.
          </span>
          <button className="btn-primary px-4 py-1.5 text-xs" disabled={advancing} onClick={() => void careerAction(() => engine.upgradeAcademy())}>
            Upgrade · {formatUSD(own.upgrade.cost)}
          </button>
        </div>
      )}
      <Panel title="The kids" right={<span className="text-[11px] text-mist-400">Place them from {own.placeAge}: open a kid and recommend him to a club</span>}>
        {own.kids.length === 0 ? (
          <div className="p-6 text-center text-sm text-mist-400">Nobody yet. The next intake arrives {formatDate(a.nextIntake)}.</div>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {own.kids.map((k) => (
              <Kid key={k.id} k={k} />
            ))}
          </ul>
        )}
      </Panel>
      {own.graduates.length > 0 && (
        <Panel title={`Graduates (${own.graduates.length})`}>
          <ul className="divide-y divide-white/[0.04]">
            {own.graduates.map((g) => (
              <li key={g.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="flex-1 font-semibold">{g.name}</span>
                {g.club && (
                  <span className="flex items-center gap-1.5">
                    <Crest club={g.club} size={16} />
                    <ClubLink club={g.club} />
                  </span>
                )}
                <span className="text-[11px] text-mist-400">{g.sellOnPaid ? 'Sell-on paid' : 'Sell-on pending'}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

function Kid({ k }: { k: AcademyKidView }) {
  const cultureOf = useCultureLookup();
  const navigate = useGame((s) => s.navigate);
  return (
    <li>
      <button className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-left hover:bg-white/[0.03]" onClick={() => navigate({ screen: 'player', id: k.id })}>
        <span className="flex min-w-[200px] flex-1 items-center gap-2.5">
          <Portrait seed={k.portraitSeed} culture={cultureOf(k.nationality.id)} size={30} age={k.age} className="rounded" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {k.name}
              {k.prodigy && <span className="ml-1.5 text-[11px] text-flood-300">Prodigy</span>}
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-mist-400">
              <PosBadge pos={k.position} /> {k.age} · {k.nationality.name}
            </span>
          </span>
        </span>
        <span className="num w-[110px] text-[12px] text-mist-300">
          Now {k.ovr}
          {k.potential && <span className="text-mist-400"> · pot. {k.potential[0]}–{k.potential[1]}</span>}
        </span>
        <span className="flex w-[180px] flex-wrap gap-1">
          {k.traits.map((t) => (
            <span key={t.id} className="chip text-[10px]" title={t.effect}>
              {t.label}
            </span>
          ))}
        </span>
        <span className={`w-[90px] text-right text-[11px] ${k.placeable ? 'text-good-300' : 'text-mist-400'}`}>{k.placeable ? 'Ready to place' : 'Too young'}</span>
      </button>
    </li>
  );
}
