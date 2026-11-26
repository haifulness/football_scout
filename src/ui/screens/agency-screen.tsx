import { motion } from 'motion/react';
import { useState } from 'react';
import { formatDate } from '../../engine/core/calendar';
import type { CountryId } from '../../engine/core/ids';
import { formatUSD } from '../../engine/core/money';
import type { AgencyLogo } from '../../engine/model/agency';
import type { CrestShape } from '../../engine/model/club';
import type { AgencyBaseView, AgencyStaffView, AgencyView } from '../../engine/views';
import { ClubLink } from '../components/club-link';
import { Loading, Panel, StatTile, useCultureLookup } from '../components/ui';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';
import { Crest } from '../visuals/crest';
import { Portrait } from '../visuals/portrait';

function useAct() {
  const careerAction = useGame((s) => s.careerAction);
  const [error, setError] = useState<string>();
  const act = (fn: () => Promise<unknown>) => {
    setError(undefined);
    return careerAction(fn).catch((e) => setError(e instanceof Error ? e.message : 'That did not work.'));
  };
  return { act, error };
}

const FIELD = 'rounded-lg border border-white/10 bg-night-950/70 px-2.5 py-1.5 text-sm text-mist-100 outline-none focus:border-violet-400/60';

const SHAPES: CrestShape[] = ['shield', 'round', 'heater', 'diamond', 'badge'];
const EMBLEMS: AgencyLogo['crest']['emblem'][] = ['star', 'eagle', 'lion', 'crown', 'castle', 'ball', 'none'];
const PALETTES: AgencyLogo['colors'][] = [
  { primary: '#0f2a4a', secondary: '#e8edf5', accent: '#f2b632' },
  { primary: '#7a1020', secondary: '#f5efe6', accent: '#d9a441' },
  { primary: '#0d4d3a', secondary: '#f1f5ef', accent: '#9fe870' },
  { primary: '#1d1d24', secondary: '#f4f4f6', accent: '#ff5a36' },
  { primary: '#3b1f6b', secondary: '#f3eefb', accent: '#46d4c6' },
  { primary: '#f2f2ee', secondary: '#13233d', accent: '#d6322e' },
];

export function AgencyScreen() {
  const v = useEngineQuery(() => engine.getAgency(), []);
  if (!v) return <Loading label="Unlocking the office" />;
  return (
    <div className="flex flex-col gap-4">
      <header>
        <div className="panel-title text-violet-300">Late game</div>
        <h1 className="font-display text-5xl font-bold uppercase leading-none">{v.agency ? v.agency.name : 'Your agency'}</h1>
        <p className="mt-2 max-w-2xl text-sm text-mist-400">
          Once your name carries weight, set up your own scouting agency. Your headquarters and each office abroad give you room for more clients and staff
          than reputation alone. Where you have a base you sleep for free, and searches there are cheaper, quicker and reach further. Staff you place at a
          base pick up briefs you haven't started within a week, line up deals between windows, and broker transfers into its country for a cut. Every base costs money each month, so staff them well.
        </p>
      </header>
      {v.agency ? <Running v={v} /> : <Founding v={v} />}
    </div>
  );
}

/* ---------------------------------------------------------------- founding */

function Founding({ v }: { v: AgencyView }) {
  const { act, error } = useAct();
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [shape, setShape] = useState<CrestShape>('shield');
  const [emblem, setEmblem] = useState<AgencyLogo['crest']['emblem']>('star');
  const [palette, setPalette] = useState(0);
  const initials = (shortName.trim() || name.trim().split(/\s+/).map((w) => w[0] ?? '').join('')).slice(0, 4).toUpperCase() || 'AG';
  const logo: AgencyLogo = { colors: PALETTES[palette]!, crest: { shape, pattern: 'plain', emblem } };
  const req = v.requirements;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <Panel title="What it takes">
        <ul className="flex flex-col gap-2 p-4 text-sm">
          <Req ok={req.yourReputation >= req.reputation} text={`Reputation ${req.reputation}`} detail={`you have ${req.yourReputation}`} />
          <Req ok={req.money >= req.cost} text={`${formatUSD(req.cost)} to set up`} detail={`you have ${formatUSD(req.money)}`} />
          <Req ok={!v.check.reason?.includes('club job')} text="Working freelance" detail="a club job and an agency don't mix" />
        </ul>
        <div className="border-t border-white/[0.06] px-4 py-3 text-[12px] text-mist-400">
          Today you can work for {v.clients.capacity} clubs and employ {v.staff.capacity} assistant{v.staff.capacity === 1 ? '' : 's'}. With an agency it's 2 clients and 2
          staff for every base, never fewer than your reputation already allows.
        </div>
      </Panel>
      <Panel title="Found your agency">
        <div className="grid gap-4 p-4 md:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-3">
            <label className="text-[11px] text-mist-400">
              Name
              <input className={`${FIELD} mt-1 w-full`} maxLength={32} placeholder="e.g. North Star Scouting" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="text-[11px] text-mist-400">
              Initials on the logo
              <input className={`${FIELD} mt-1 w-28 uppercase`} maxLength={4} placeholder={initials} value={shortName} onChange={(e) => setShortName(e.target.value)} />
            </label>
            <div>
              <div className="mb-1 text-[11px] text-mist-400">Shape</div>
              <div className="flex flex-wrap gap-1">
                {SHAPES.map((s) => (
                  <button key={s} className={`chip capitalize ${s === shape ? 'border-violet-400/60 text-violet-200' : 'text-mist-300'}`} onClick={() => setShape(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[11px] text-mist-400">Emblem</div>
              <div className="flex flex-wrap gap-1">
                {EMBLEMS.map((e) => (
                  <button key={e} className={`chip capitalize ${e === emblem ? 'border-violet-400/60 text-violet-200' : 'text-mist-300'}`} onClick={() => setEmblem(e)}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[11px] text-mist-400">Colours</div>
              <div className="flex flex-wrap gap-2">
                {PALETTES.map((p, i) => (
                  <button
                    key={i}
                    aria-label={`Colours ${i + 1}`}
                    className={`flex overflow-hidden rounded-md ring-2 ${i === palette ? 'ring-violet-400' : 'ring-transparent'}`}
                    onClick={() => setPalette(i)}
                  >
                    {[p.primary, p.secondary, p.accent].map((c) => (
                      <span key={c} className="block h-6 w-4" style={{ background: c }} />
                    ))}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Crest club={{ colors: logo.colors, crest: logo.crest, shortName: initials }} size={120} />
            <div className="max-w-40 text-center font-display text-lg font-bold uppercase leading-tight">{name.trim() || 'Your agency'}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-3">
          {(error || (!v.check.ok && v.check.reason)) && <span className="text-[12px] text-alert-400">{error ?? v.check.reason}</span>}
          <span className="ml-auto" />
          <button
            className="btn-primary px-4 py-1.5 text-xs"
            disabled={!v.check.ok || name.trim().length < 2}
            onClick={() => void act(() => engine.foundAgency({ name, shortName: shortName || undefined, logo }))}
          >
            Found it · {formatUSD(req.cost)}
          </button>
        </div>
      </Panel>
    </div>
  );
}

function Req({ ok, text, detail }: { ok: boolean; text: string; detail: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={ok ? 'text-good-300' : 'text-mist-400'}>{ok ? '✓' : '○'}</span>
      <span className={ok ? '' : 'text-mist-300'}>{text}</span>
      <span className="ml-auto text-[12px] text-mist-400">{detail}</span>
    </li>
  );
}

/* ----------------------------------------------------------------- running */

function Running({ v }: { v: AgencyView }) {
  const ag = v.agency!;
  const net = ag.season.cuts + ag.season.costs;
  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <Crest club={{ colors: ag.logo.colors, crest: ag.logo.crest, shortName: ag.shortName }} size={72} />
        <div className="text-sm text-mist-400">
          Founded {formatDate(ag.foundedOn)} · {ag.bases.length} base{ag.bases.length === 1 ? '' : 's'} · {ag.brokered} deals brokered, {formatUSD(ag.earned)} earned
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={`Deals ${ag.season.label}`} accent="text-grass-300" sub="the agency's cuts">
          {formatUSD(ag.season.cuts)}
        </StatTile>
        <StatTile label="Running costs" sub={`${formatUSD(ag.weeklyUpkeep)}/wk HQ · ${formatUSD(ag.monthlyRent)}/mo rent`}>
          {formatUSD(ag.season.costs)}
        </StatTile>
        <StatTile label="Agency net" accent={net >= 0 ? 'text-good-300' : 'text-alert-400'} sub="this season, before staff wages">
          {formatUSD(net)}
        </StatTile>
        <StatTile label="Capacity" sub={`${v.staff.used}/${v.staff.capacity} staff`}>
          {v.clients.used}/{v.clients.capacity} clients
        </StatTile>
      </div>
      <Activity v={v} />
      <Bases v={v} />
      <OpenOffice v={v} />
      {ag.deals.length > 0 && <Deals v={v} />}
    </>
  );
}

function Bases({ v }: { v: AgencyView }) {
  const ag = v.agency!;
  return (
    <Panel title="Bases" right={<span className="text-[12px] text-mist-400">Staff at a base take briefs you haven't started within a week, and broker deals into its country</span>}>
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {ag.bases.map((b) => (
          <BaseCard key={b.officeId} b={b} free={ag.unplaced.filter((a) => !a.onTask)} />
        ))}
      </div>
      {ag.unplaced.length === 0 && v.staff.used < v.staff.capacity && (
        <div className="px-4 pb-4 text-[12px] text-mist-400">
          Room for {v.staff.capacity - v.staff.used} more assistant{v.staff.capacity - v.staff.used === 1 ? '' : 's'}: hire them on the Staff screen.
        </div>
      )}
    </Panel>
  );
}

function BaseCard({ b, free }: { b: AgencyBaseView; free: AgencyStaffView[] }) {
  const { act, error } = useAct();
  const cultureOf = useCultureLookup();
  const [confirmClose, setConfirmClose] = useState(false);
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="flex items-center gap-2">
        <span className="font-semibold">{b.country.name}</span>
        {b.hq && <span className="chip border-violet-400/50 text-violet-200">HQ</span>}
        <span className="ml-auto text-[12px] text-mist-400">{b.hq ? b.cityName : `${b.cityName} · ${formatUSD(b.rent)}/mo`}</span>
      </div>
      <div className="text-[12px] text-mist-400">
        This season: {b.dealsThisSeason} deal{b.dealsThisSeason === 1 ? '' : 's'}, {formatUSD(b.earnedThisSeason)}
      </div>
      <ul className="flex flex-col gap-1.5">
        {b.staff.map((a) => (
          <li key={a.id} className="flex items-start gap-2 text-sm">
            <Portrait seed={a.portraitSeed} culture={cultureOf(a.nationalityId)} size={28} className="mt-0.5 rounded-md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate">{a.name}</span>
                <span className="text-[11px] text-mist-400">skill {a.skill}</span>
              </div>
              <div className="text-[11px] text-mist-400">
                {a.working ? (
                  <span className="text-sky-300">{a.working}</span>
                ) : (
                  <span>
                    {a.leads}/{a.maxLeads} deals lined up
                  </span>
                )}
              </div>
              {a.canTakeBriefs ? (
                <label className="mt-0.5 flex items-center gap-1.5 text-[11px] text-mist-300">
                  <input type="checkbox" checked={a.takesBriefs} onChange={(e) => void act(() => engine.setStaffTakesBriefs(a.id, e.target.checked))} />
                  Picks up your briefs
                </label>
              ) : (
                <div className="text-[11px] text-mist-500">Needs skill 12 to take briefs</div>
              )}
            </div>
            <button className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => void act(() => engine.placeAssistant(a.id, null))}>
              Remove
            </button>
          </li>
        ))}
        {!b.staff.length && <li className="text-[12px] text-mist-400">Nobody works here yet: no deals will come from {b.country.name}.</li>}
      </ul>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {free.length > 0 && (
          <select
            className={`${FIELD} py-1 text-xs`}
            value=""
            onChange={(e) => e.target.value && void act(() => engine.placeAssistant(Number(e.target.value), b.officeId))}
          >
            <option value="">Place an assistant…</option>
            {free.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} (skill {a.skill})
              </option>
            ))}
          </select>
        )}
        {!b.hq &&
          (confirmClose ? (
            <>
              <button className="btn-ghost border-alert-500/40 px-2 py-1 text-[11px] text-alert-400" onClick={() => void act(() => engine.closeOffice(b.officeId))}>
                Close it: no refund
              </button>
              <button className="btn-ghost px-2 py-1 text-[11px]" onClick={() => setConfirmClose(false)}>
                Keep
              </button>
            </>
          ) : (
            <button className="btn-ghost ml-auto px-2 py-1 text-[11px] text-mist-400" onClick={() => setConfirmClose(true)}>
              Close office
            </button>
          ))}
      </div>
      {error && <div className="text-[11px] text-alert-400">{error}</div>}
    </motion.div>
  );
}

const LOG_ICON: Record<'brief' | 'lead' | 'deal' | 'pitch', string> = { brief: '📋', lead: '🤝', deal: '💰', pitch: '🎯' };

function Activity({ v }: { v: AgencyView }) {
  const ag = v.agency!;
  const staffed = ag.bases.some((b) => b.staff.length > 0);
  return (
    <Panel
      title="At the agency"
      right={
        <span className="text-[12px] text-mist-400">
          {ag.staffBriefs} brief{ag.staffBriefs === 1 ? '' : 's'} with staff · {ag.untouchedBriefs} nobody is working
        </span>
      }
    >
      {ag.log.length ? (
        <ul className="max-h-72 overflow-y-auto">
          {ag.log.map((e, i) => (
            <li key={i} className="flex items-start gap-2 border-b border-white/[0.04] px-4 py-1.5 text-sm last:border-0">
              <span className="num w-24 shrink-0 text-[12px] text-mist-400">{formatDate(e.date)}</span>
              <span aria-hidden>{LOG_ICON[e.kind]}</span>
              <span className={`min-w-0 ${e.kind === 'deal' ? 'text-grass-300' : ''}`}>{e.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-4 py-3 text-[12px] text-mist-400">
          {staffed
            ? 'Nothing yet. Each Monday your office staff pick up briefs you haven’t started, or line up deals that close when the window opens.'
            : 'Place assistants at a base below: they pick up your briefs and broker deals for the agency.'}
        </div>
      )}
    </Panel>
  );
}

function OpenOffice({ v }: { v: AgencyView }) {
  const { act, error } = useAct();
  const [all, setAll] = useState(false);
  const full = v.agency!.bases.length - 1 >= v.maxOffices;
  const rows = all ? v.openable : v.openable.slice(0, 10);
  return (
    <Panel
      title="Open an office"
      right={
        <span className="text-[12px] text-mist-400">
          {v.agency!.bases.length - 1}/{v.maxOffices} offices · each adds 2 clients and 2 staff
        </span>
      }
    >
      {error && <div className="px-4 pt-3 text-[12px] text-alert-400">{error}</div>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] text-mist-400">
            <th className="px-4 py-2 font-normal">Country</th>
            <th className="font-normal">Continent</th>
            <th className="text-right font-normal">Clubs</th>
            <th className="text-right font-normal">Your market</th>
            <th className="text-right font-normal">Setup</th>
            <th className="text-right font-normal">Rent / month</th>
            <th className="px-4" />
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-t border-white/[0.04]">
              <td className="px-4 py-1.5 font-semibold">{c.name}</td>
              <td className="text-mist-400">{c.continent}</td>
              <td className="num text-right">{c.clubs}</td>
              <td className="num text-right">{c.market}</td>
              <td className="num text-right">{formatUSD(c.setup)}</td>
              <td className="num text-right">{formatUSD(c.rent)}</td>
              <td className="px-4 py-1.5 text-right">
                <button className="btn-ghost px-3 py-0.5 text-xs" disabled={full} onClick={() => void act(() => engine.openOffice(c.id as CountryId))}>
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {v.openable.length > 10 && (
        <button className="btn-ghost m-3 px-3 py-1 text-xs" onClick={() => setAll((x) => !x)}>
          {all ? 'Show fewer' : `Show all ${v.openable.length} countries`}
        </button>
      )}
    </Panel>
  );
}

function Deals({ v }: { v: AgencyView }) {
  const { navigate } = useGame();
  return (
    <Panel title="Deals your staff brokered">
      <ul>
        {v.agency!.deals.map((d, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 border-b border-white/[0.04] px-4 py-2 text-sm last:border-0">
            <span className="num w-24 text-[12px] text-mist-400">{formatDate(d.date)}</span>
            <button className="font-semibold hover:underline" onClick={() => navigate({ screen: 'player', id: d.playerId })}>
              {d.playerName}
            </button>
            <span className="text-mist-400">to</span>
            <Crest club={d.club} size={16} />
            <ClubLink club={d.club} />
            <span className="text-[12px] text-mist-400">
              {d.fee ? formatUSD(d.fee) : 'free'} · by {d.by}
            </span>
            <span className="num ml-auto font-semibold text-grass-300">+{formatUSD(d.cut)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
