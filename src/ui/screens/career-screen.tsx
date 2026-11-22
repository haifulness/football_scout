import { motion } from 'motion/react';
import { useState } from 'react';
import { formatDate } from '../../engine/core/calendar';
import type { ClubId } from '../../engine/core/ids';
import { formatUSD } from '../../engine/core/money';
import type { CareerView, MentorOfferView, MentorView, OfferView } from '../../engine/views';
import { Portrait } from '../visuals/portrait';
import { Loading, Money, Panel, StatTile, useCultureLookup } from '../components/ui';
import { Crest } from '../visuals/crest';
import { ClubLink } from '../components/club-link';
import { SeasonReviewsPanel } from '../components/season-review';
import { TrackRecordPanel } from '../components/report-panel';
import { RetirePanel } from '../components/career-end';
import { CampaignPanel } from '../components/campaign-panel';
import { YourPlayersPanel } from '../components/your-players';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';


export function CareerScreen() {
  const c = useEngineQuery(() => engine.getCareer(), []);
  if (!c) return <Loading label="Reading your CV" />;
  return (
    <div className="flex flex-col gap-4">
      <header>
        <div className="panel-title text-flood-400">
          {c.backgroundLabel} · {c.difficulty} · based in {c.homeCity}
        </div>
        <h1 className="font-display text-5xl font-bold uppercase leading-none">{c.name}</h1>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Reputation" accent="var(--color-flood-400)" sub="Opens doors at bigger clubs">
          {c.reputation}
          <span className="text-sm text-mist-400">/100</span>
        </StatTile>
        <StatTile label="Signings" accent="var(--color-good-400)" sub={`${c.stats.placementsActive} still paying`}>
          {c.stats.signings}
        </StatTile>
        <StatTile label="Earned from scouting" accent="var(--color-sky-400)" sub="Signing + match bonuses">
          <Money value={c.stats.earned} animated />
        </StatTile>
        <StatTile
          label="Status"
          accent="var(--color-mist-300)"
          sub={c.employment.mode === 'fulltime' ? c.employment.club.name : `${c.employment.clients.length}/${c.employment.slots} clients`}
        >
          <span className="text-xl">{c.employment.mode === 'fulltime' ? c.employment.title : 'Freelance'}</span>
        </StatTile>
      </div>

      {c.mentorOffer && <MentorOfferCard o={c.mentorOffer} />}
      {c.offers.length > 0 && <OffersPanel offers={c.offers} career={c} />}
      {c.mentor && <MentorPanel m={c.mentor} />}
      <CampaignPanel />
      <YourPlayersPanel c={c} />

      <SeasonReviewsPanel />
      <TrackRecordPanel />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <EmploymentPanel c={c} />
        <ReputationPanel c={c} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <TrustPanel c={c} />
        <Panel title={`Your background · ${c.backgroundLabel}`}>
          <div className="space-y-2 p-4">
            <ul className="space-y-1 text-[12px]">
              {c.perks.good.map((t) => (
                <li key={t} className="text-grass-300">
                  + {t}
                </li>
              ))}
              {c.perks.bad.map((t) => (
                <li key={t} className="text-alert-400">
                  − {t}
                </li>
              ))}
            </ul>
            <div className="panel-title pt-3 text-[11px]">Markets you know</div>
            {c.markets.map((m) => (
              <div key={m.countryId} className="grid grid-cols-[120px_1fr_24px] items-center gap-2 text-[12px]">
                <span className="truncate text-mist-300">{m.name}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className="block h-full rounded-full bg-grass-400" style={{ width: `${m.level}%` }} />
                </span>
                <span className="num text-right">{m.level}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <RetirePanel />
    </div>
  );
}

function MentorOfferCard({ o }: { o: MentorOfferView }) {
  const { careerAction } = useGame();
  const cultureOf = useCultureLookup();
  const [error, setError] = useState<string>();
  const act = (fn: () => Promise<unknown>) => careerAction(fn).catch((e) => setError(e instanceof Error ? e.message : 'That did not work.'));
  return (
    <motion.section initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="panel border-sky-400/30 bg-sky-500/[0.05] p-4">
      <div className="flex items-start gap-3">
        <Portrait seed={o.portraitSeed} culture={cultureOf(o.nationalityId)} size={44} age={50} className="rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="panel-title text-[11px] text-sky-300">
            An offer · {o.daysLeft === 0 ? 'answer today' : `${o.daysLeft} day${o.daysLeft === 1 ? '' : 's'} to answer`}
          </div>
          <h3 className="font-display text-xl font-bold uppercase leading-tight">{o.name} wants you on his team</h3>
          <p className="mt-1 text-sm text-mist-300">
            One of the best-known scouts in the country (reputation {o.reputation}). Work under him and his clubs take your calls: you can pitch to them, they
            treat you as known, phone pitches open sooner, and he passes you briefs he can't take. He keeps {o.cutPct}% of everything you earn. Leave inside a
            year and he'll come after your players.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {o.clients.map((cl) => (
              <span key={cl.id} className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 text-[12px]">
                <Crest club={cl} size={16} />
                {cl.name}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="btn-primary flex-1 text-xs" onClick={() => void act(() => engine.acceptMentorOffer())}>
          Join him
        </button>
        <button className="btn-ghost flex-1 text-xs" onClick={() => void act(() => engine.declineMentorOffer())}>
          Stay on my own
        </button>
      </div>
      {error && <div className="pt-2 text-sm text-alert-400">{error}</div>}
    </motion.section>
  );
}

function MentorPanel({ m }: { m: MentorView }) {
  const { careerAction } = useGame();
  const cultureOf = useCultureLookup();
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string>();
  return (
    <Panel title="Your mentor" right={<span className="text-[11px] text-mist-400">since {formatDate(m.since)}</span>}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <Portrait seed={m.portraitSeed} culture={cultureOf(m.nationalityId)} size={44} age={50} className="rounded-md" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{m.name}</div>
            <div className="text-[12px] text-mist-400">
              Reputation {m.reputation} · {m.signings} signing{m.signings === 1 ? '' : 's'} on his record
            </div>
            <ul className="mt-2 list-disc pl-4 text-[12px] text-mist-300">
              <li>His clubs take your pitches and treat you as at least known (standing {m.standingFloor}).</li>
              <li>
                Clubs take a pitch by phone from standing {m.phoneTrust} (normally {m.normalPhoneTrust}).
              </li>
              <li>He passes you briefs from his clubs that he can't take.</li>
              <li>
                He keeps {m.cutPct}% of what you earn: <Money value={m.taken} /> so far.
              </li>
            </ul>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {m.clients.map((cl) => (
            <span key={cl.id} className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 text-[12px]">
              <Crest club={cl} size={16} />
              <ClubLink club={cl} />
              <TrustBar value={cl.trust} />
            </span>
          ))}
        </div>
        {message ? (
          <div className="text-sm text-mist-200">{message}</div>
        ) : confirm ? (
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className={m.earlyLeave ? 'text-alert-400' : 'text-mist-300'}>
              {m.earlyLeave
                ? `It's not a year yet (that's ${formatDate(m.termEndsOn)}). He'll take it badly, talk you down at his clubs and go after your players.`
                : 'You part on good terms, and his clubs will still take your call in person.'}
            </span>
            <button
              className="btn-ghost text-xs"
              onClick={() =>
                void careerAction(async () => {
                  setMessage((await engine.leaveMentor()).message);
                })
              }
            >
              Leave anyway
            </button>
            <button className="btn-ghost text-xs" onClick={() => setConfirm(false)}>
              Stay
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-[11px] text-mist-400">
            <button className="btn-ghost text-xs" onClick={() => setConfirm(true)}>
              Go it alone
            </button>
            {m.earlyLeave ? `Stay until ${formatDate(m.termEndsOn)} to part on good terms.` : 'You have done your year: you can leave on good terms.'}
          </div>
        )}
      </div>
    </Panel>
  );
}

function OffersPanel({ offers, career }: { offers: OfferView[]; career: CareerView }) {
  const { careerAction } = useGame();
  const [error, setError] = useState<string>();
  const act = (fn: () => Promise<unknown>) => careerAction(fn).catch((e) => setError(e instanceof Error ? e.message : 'That did not work.'));
  return (
    <Panel title={`Offers (${offers.length})`} right={<span className="text-[11px] text-mist-400">Each offer stands for three weeks</span>}>
      <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
        {offers.map((o, i) => (
          <motion.div
            key={o.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-xl border border-flood-400/30 bg-flood-500/5 p-4"
          >
            <div className="flex items-center gap-3">
              <Crest club={o.club} size={36} />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-flood-300">
                  {o.kind === 'client' ? 'Freelance client' : o.renewal ? 'Contract renewal' : 'Full-time job'}
                </div>
                <ClubLink club={o.club} className="block max-w-full font-semibold" />
                <div className="truncate text-[11px] text-mist-400">
                  {o.club.leagueName} · {o.club.cityName}, {o.club.countryName}
                </div>
              </div>
            </div>
            {o.kind === 'fulltime' ? (
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Mini label="Role" value={o.title!} />
                <Mini label="Salary" value={`${formatUSD(o.salary!)}/yr`} />
                <Mini label="Expenses paid" value={`${Math.round(o.expenseCover * 100)}%`} />
              </div>
            ) : (
              <div className="mt-3 text-[12px] text-mist-300">Work for them alongside your other clients, at freelance rates.</div>
            )}
            <div className="mt-2 text-[11px] text-mist-400">
              {o.kind === 'fulltime' &&
                `${o.seasons} season${o.seasons === 1 ? '' : 's'} · full-time means pitching only to them, at full-time rates (1.5% signing bonus, ×1 match bonuses). `}
              {o.kind === 'fulltime' &&
                career.employment.mode === 'freelance' &&
                career.employment.clients.length > 0 &&
                'You would give up your freelance clients. '}
              Expires {formatDate(o.expiresOn)}.
            </div>
            <div className="mt-3 flex gap-2">
              <button className="btn-primary flex-1 text-xs" onClick={() => void act(() => engine.acceptOffer(o.id))}>
                Accept
              </button>
              <button className="btn-ghost flex-1 text-xs" onClick={() => void act(() => engine.declineOffer(o.id))}>
                Decline
              </button>
            </div>
          </motion.div>
        ))}
      </div>
      {error && <div className="px-4 pb-3 text-sm text-alert-400">{error}</div>}
    </Panel>
  );
}

const Mini = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md bg-white/[0.04] px-1 py-1.5">
    <div className="truncate text-[12px] font-bold">{value}</div>
    <div className="text-[9px] uppercase tracking-wider text-mist-400">{label}</div>
  </div>
);

function TrustBar({ value }: { value: number }) {
  const c = value >= 60 ? 'var(--color-scale-2)' : value >= 30 ? 'var(--color-scale-3)' : value >= 12 ? 'var(--color-scale-4)' : 'var(--color-scale-6)';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.06]">
        <span className="block h-full rounded-full" style={{ width: `${value}%`, background: c }} />
      </span>
      <span className="num text-[11px] text-mist-300">{value}</span>
    </span>
  );
}

function EmploymentPanel({ c }: { c: CareerView }) {
  const { careerAction, navigate } = useGame();
  const [confirm, setConfirm] = useState<string>();
  const e = c.employment;
  if (e.mode === 'fulltime') {
    return (
      <Panel title="Employment">
        <div className="flex flex-wrap items-center gap-4 p-4">
          <Crest club={e.club} size={56} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wider text-flood-300">{e.title}</div>
            <ClubLink club={e.club} className="block font-display text-3xl font-bold uppercase leading-none" />
            <div className="mt-1 text-sm text-mist-300">
              {formatUSD(e.salary)} a year · {Math.round(e.expenseCover * 100)}% of expenses paid · since {formatDate(e.since)}
            </div>
            <div className="mt-1 text-[12px] text-mist-400">
              Contract until {formatDate(e.until)} · standing <TrustBar value={e.trust} />{' '}
              {e.trust < 20 && <span className="text-alert-400">· below 12 you'll be dismissed</span>}
            </div>
          </div>
          {e.leavingOn ? (
            <span className="chip border-alert-500/40 text-alert-400">Leaving {formatDate(e.leavingOn)}</span>
          ) : confirm === 'resign' ? (
            <span className="flex gap-2">
              <button
                className="btn-ghost border-alert-500/50 text-xs text-alert-400"
                onClick={() => void careerAction(() => engine.resign()).then(() => setConfirm(undefined))}
              >
                Confirm: 4 weeks' notice
              </button>
              <button className="btn-ghost text-xs" onClick={() => setConfirm(undefined)}>
                Cancel
              </button>
            </span>
          ) : (
            <button className="btn-ghost text-xs" onClick={() => setConfirm('resign')}>
              Resign…
            </button>
          )}
        </div>
      </Panel>
    );
  }
  return (
    <Panel
      title={`Freelance · ${e.clients.length}/${e.slots} clients`}
      right={<span className="text-[11px] text-mist-400">You can only recommend to clients</span>}
    >
      {e.clients.length === 0 ? (
        <div className="p-6 text-sm text-mist-400">
          No clients yet. Meet a club's Head Coach a few times, then propose a scouting agreement from the club page or the recommend dialog. Clubs also invite
          you as your name grows.
        </div>
      ) : (
        <ul>
          {e.clients.map((cl) => (
            <li key={cl.id} className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2.5">
              <Crest club={cl} size={24} />
              <button className="min-w-0 flex-1 text-left hover:text-grass-300" onClick={() => navigate({ screen: 'club', id: cl.id })}>
                <span className="block truncate font-semibold">{cl.name}</span>
                <span className="block text-[11px] text-mist-400">{cl.cityName}</span>
              </button>
              <TrustBar value={cl.trust} />
              {confirm === cl.id ? (
                <span className="flex gap-1">
                  <button
                    className="rounded bg-alert-500 px-2 py-1 text-[11px] font-bold text-white"
                    onClick={() => void careerAction(() => engine.dropClient(cl.id as ClubId)).then(() => setConfirm(undefined))}
                  >
                    Drop
                  </button>
                  <button className="rounded px-2 py-1 text-[11px] text-mist-300" onClick={() => setConfirm(undefined)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  className="rounded px-2 py-1 text-[11px] text-mist-400 hover:text-alert-400"
                  onClick={() => setConfirm(cl.id)}
                  title="Ends open negotiations with this club"
                >
                  Drop…
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ReputationPanel({ c }: { c: CareerView }) {
  return (
    <Panel title="Reputation">
      <div className="p-4">
        <div className="relative h-2 rounded-full bg-white/[0.06]">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-flood-500 to-flood-300"
            initial={{ width: 0 }}
            animate={{ width: `${c.reputation}%` }}
            transition={{ duration: 0.9 }}
          />
          {c.milestones.map((m) => (
            <span
              key={m.reputation}
              className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2"
              style={{ left: `${m.reputation}%`, background: m.reached ? 'var(--color-flood-400)' : 'var(--color-night-500)' }}
            />
          ))}
        </div>
        <ul className="mt-3 space-y-1.5">
          {c.milestones.map((m) => (
            <li key={m.reputation} className={`flex gap-2 text-[12px] ${m.reached ? 'text-mist-200' : 'text-mist-400/70'}`}>
              <span className={`num w-6 text-right font-bold ${m.reached ? 'text-flood-300' : ''}`}>{m.reputation}</span>
              <span>
                {m.reached ? '✓ ' : ''}
                {m.label}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 text-[11px] text-mist-400">Reputation grows with every completed signing: more for bigger clubs and bigger upgrades.</div>
      </div>
    </Panel>
  );
}

function TrustPanel({ c }: { c: CareerView }) {
  const navigate = useGame((s) => s.navigate);
  return (
    <Panel title="Standing by club" right={<span className="text-[11px] text-mist-400">How well the coach knows you, plus your record there</span>}>
      {c.clubs.length === 0 ? (
        <div className="p-6 text-sm text-mist-400">You haven't met anyone yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-mist-400">
              <th className="py-2 pl-4 font-medium">Club</th>
              <th className="font-medium">Standing</th>
              <th className="num text-right font-medium">Signings</th>
              <th className="pr-4 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {c.clubs.map((r) => (
              <tr key={r.club.id} className="data-row" onClick={() => navigate({ screen: 'club', id: r.club.id })}>
                <td className="py-2 pl-4">
                  <span className="flex items-center gap-2">
                    <Crest club={r.club} size={18} />
                    {r.club.name}
                  </span>
                </td>
                <td>
                  <TrustBar value={r.trust} />
                </td>
                <td className="num text-right">
                  {r.signings}
                  {r.weakPitches ? <span className="text-alert-400"> · {r.weakPitches}✕</span> : ''}
                </td>
                <td className="pr-4 text-right text-[12px]">
                  {r.status === 'employer' ? (
                    <span className="text-flood-300">Employer</span>
                  ) : r.status === 'client' ? (
                    <span className="text-grass-300">Client</span>
                  ) : r.status === 'mentor' ? (
                    <span className="text-sky-300">Mentor’s client</span>
                  ) : (
                    <span className="text-mist-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
