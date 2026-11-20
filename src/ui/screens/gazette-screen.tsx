import type { ReactNode } from 'react';
import { formatDate } from '../../engine/core/calendar';
import { formatUSD } from '../../engine/core/money';
import type { GazetteNeed, GazetteView } from '../../engine/views';
import { Loading, OvrBadge, PosBadge, ratingColor } from '../components/ui';
import { Crest } from '../visuals/crest';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';

const POSITION_NAME: Record<string, string> = {
  GK: 'goalkeeper',
  CB: 'centre-back',
  LB: 'left-back',
  RB: 'right-back',
  DM: 'holding midfielder',
  CM: 'central midfielder',
  AM: 'playmaker',
  LM: 'left midfielder',
  RM: 'right midfielder',
  LW: 'left winger',
  RW: 'right winger',
  ST: 'striker',
};
const posName = (p: string) => POSITION_NAME[p] ?? p;

const urgency = (sev: number) => (sev >= 0.7 ? 'desperate for' : sev >= 0.45 ? 'short of' : 'could use');
const severityColor = (sev: number) => (sev >= 0.45 ? '#ef4444' : sev >= 0.2 ? '#f5b301' : '#2fcf73');

function headline(n: GazetteNeed): string {
  const name = posName(n.position);
  if (n.mission) return `${n.club.name} post a brief for a ${name}`;
  return `${n.club.name} ${urgency(n.severity)} a ${name}`;
}

function standfirst(n: GazetteNeed): string {
  const depth = n.depth === 0 ? 'no natural cover' : n.depth === 1 ? 'one natural option' : `${n.depth} natural options`;
  const money = n.transferBudget > 0 ? `${formatUSD(n.transferBudget, { compact: true })} to spend` : 'no transfer budget, so think free agents and loans';
  return `With ${depth} at ${n.position} and an average of ${n.average || '–'} there, anyone rated ${(n.average || 0) + 1}+ gets a hearing. They have ${money}.`;
}

/** The weekly needs magazine: who needs what, who can pay, and who in your pool fits. */
export function GazetteScreen() {
  const g = useEngineQuery(() => engine.getGazette(), []);
  const { navigate, searchFor, openRecommend } = useGame();
  if (!g) return <Loading label="Printing this week's issue" />;

  const openClub = (id: GazetteNeed['club']['id']) => navigate({ screen: 'club', id });
  const searchNeed = (n: GazetteNeed) =>
    searchFor({
      positions: [n.position],
      ratingFloors: { [n.position]: (n.average || 0) + 1 },
      maxValue: n.transferBudget > 0 ? n.transferBudget : undefined,
      countryId: n.club.countryId,
      clubId: n.club.id,
      clubName: n.club.name,
      label: `${n.club.name}: ${n.position}`,
    });
  const [lead, ...rest] = g.yourClubs;
  const poolSection = (
    <Section kicker="From your pool" title={g.noClubs ? 'Players you already know who fit those clubs' : 'Players you already know who fit'}>
      {g.poolFits.length === 0 ? (
        <p className="px-4 py-3 text-sm text-mist-400">
          {g.noClubs
            ? 'Nobody in your pool clears the bar at the clubs above. Their needs are a good place to start searching.'
            : g.yourClubs.length
              ? 'Nobody in your pool clears the bar at your clubs yet. Search the needs above to fill it.'
              : 'Matches appear here once your clubs have needs.'}
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {g.poolFits.map((f) => (
            <li key={`${f.player.id}:${f.club.id}`} className="flex items-center gap-3 px-4 py-2.5">
              <OvrBadge ovr={f.player.ovr} range={f.player.ovrRange} size="sm" />
              <button className="min-w-0 flex-1 text-left" onClick={() => navigate({ screen: 'player', id: f.player.id })}>
                <div className="truncate text-sm font-semibold hover:text-grass-300">{f.player.name}</div>
                <div className="truncate text-[11px] text-mist-400">
                  {f.player.age} · {f.player.club?.name ?? 'Free agent'} · {formatUSD(f.player.value, { compact: true })}
                </div>
              </button>
              <span className="hidden items-center gap-1.5 text-[11px] text-mist-300 sm:flex">
                <PosBadge pos={f.position} /> for <Crest club={f.club} size={16} /> {f.club.shortName}
              </span>
              <span className="num w-10 text-right text-[12px] text-grass-300" title="How far his estimate clears the bar">
                +{f.margin}
              </span>
              <button className="btn-primary shrink-0 px-2.5 py-1 text-[11px]" onClick={() => openRecommend({ playerId: f.player.id, clubId: f.club.id })}>
                Recommend
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
  const leadsSection = (
    <Section kicker={`Around ${g.countryName}`} title="Clubs short of players, with money to spend">
      {g.leads.length === 0 ? (
        <p className="px-4 py-3 text-sm text-mist-400">No club outside your books has an urgent need and a budget this week.</p>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {g.leads.map((n) => (
            <NeedLine key={`${n.club.id}:${n.position}`} n={n} onClub={openClub} onSearch={searchNeed} lead />
          ))}
        </ul>
      )}
    </Section>
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <Masthead g={g} />

      {lead ? (
        <LeadStory n={lead} onClub={openClub} onSearch={searchNeed} />
      ) : (
        <article className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 className="font-serif text-2xl font-bold leading-tight text-mist-50">{g.noClubs ? 'No clubs on your books yet' : 'All quiet at your clubs'}</h2>
          <p className="mt-2 text-sm text-mist-300">
            {g.noClubs
              ? `Win a scouting agreement and this page fills with your clients' needs. Until then, the clubs under "Around ${g.countryName}" are your best leads.`
              : 'None of your clubs has a pressing need this week. A good week to build your pool, or to court a new client.'}
          </p>
        </article>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          {rest.length > 0 && (
            <Section kicker="Your clubs" title="Also on the wish lists">
              <ul className="divide-y divide-white/[0.05]">
                {rest.map((n) => (
                  <NeedLine key={`${n.club.id}:${n.position}`} n={n} onClub={openClub} onSearch={searchNeed} />
                ))}
              </ul>
            </Section>
          )}

          {g.noClubs ? (
            <>
              {leadsSection}
              {poolSection}
            </>
          ) : (
            <>
              {poolSection}
              {leadsSection}
            </>
          )}
        </div>

        <aside className="flex flex-col gap-5">
          <Section kicker="Market watch" title="In demand">
            {g.demand.length === 0 ? (
              <p className="px-4 py-3 text-sm text-mist-400">No position is in short supply.</p>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {g.demand.map((d) => (
                  <li key={d.position} className="flex items-center gap-3 px-4 py-2.5">
                    <PosBadge pos={d.position} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-mist-100">
                        <b className="num text-base">{d.clubs}</b> club{d.clubs > 1 ? 's' : ''}
                        {d.urgent > 0 && <span className="text-alert-400"> · {d.urgent} urgent</span>}
                      </div>
                      <div className="text-[11px] text-mist-400">
                        from {d.lowestBar}+ · up to {formatUSD(d.topBudget, { compact: true })}
                      </div>
                    </div>
                    <button
                      className="btn-ghost shrink-0 px-2 py-1 text-[11px]"
                      title={`Search ${g.countryName} for ${d.position}s rated ${d.lowestBar}+`}
                      onClick={() =>
                        searchFor({
                          positions: [d.position],
                          ratingFloors: { [d.position]: d.lowestBar },
                          countryId: g.countryId,
                          label: `In demand: ${d.position} ${d.lowestBar}+`,
                        })
                      }
                    >
                      ⌕ Search
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section kicker="Rumour mill" title="What the rivals are chasing">
            {g.rumours.length === 0 ? (
              <p className="px-4 py-3 text-sm text-mist-400">No whispers this week.</p>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {g.rumours.map((r) => (
                  <li key={r.player.id} className="px-4 py-2.5 text-[13px] leading-snug text-mist-200">
                    <span className="font-semibold">{r.rival}</span> is {r.advanced ? 'close to landing' : 'said to be tracking'}{' '}
                    <button
                      className="font-semibold text-mist-50 underline decoration-white/20 underline-offset-2 hover:text-grass-300"
                      onClick={() => navigate({ screen: 'player', id: r.player.id })}
                    >
                      {r.player.name}
                    </button>{' '}
                    for {r.club.name}.
                    {r.yours && <span className="ml-1 rounded bg-alert-500/15 px-1 text-[11px] font-semibold text-alert-400">one of yours</span>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Masthead({ g }: { g: GazetteView }) {
  return (
    <header className="border-b-4 border-double border-white/20 pb-3 text-center">
      <div className="flex items-center justify-between border-b border-white/10 pb-1.5 text-[11px] uppercase tracking-[0.18em] text-mist-400">
        <span>No. {g.issue}</span>
        <span className="hidden sm:inline">Needs report · {g.countryName}</span>
        <span>{formatDate(g.date)}</span>
      </div>
      <h1 className="mt-2 font-serif text-4xl font-black uppercase tracking-tight text-mist-50 sm:text-6xl">The Scouting Weekly</h1>
      <div className="mt-1 text-[12px] italic text-mist-400">Who needs what, who can pay, and who you already know · Season {g.seasonLabel}</div>
    </header>
  );
}

function LeadStory({ n, onClub, onSearch }: { n: GazetteNeed; onClub: (id: GazetteNeed['club']['id']) => void; onSearch: (n: GazetteNeed) => void }) {
  return (
    <article className="grid grid-cols-1 gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 md:grid-cols-[auto_1fr]">
      <button onClick={() => onClub(n.club.id)} className="justify-self-center" title={`Open ${n.club.name}`}>
        <Crest club={n.club} size={88} />
      </button>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: severityColor(n.severity) }}>
          Front page · {n.mission ? 'Open brief' : n.severity >= 0.45 ? 'Urgent' : 'Wish list'}
        </div>
        <h2 className="mt-1 font-serif text-3xl font-bold leading-tight text-mist-50">{headline(n)}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-mist-300">{standfirst(n)}</p>
        {n.mission && (
          <p className="mt-1 text-[13px] text-flood-300">
            The brief is {n.mission.status === 'offered' ? 'waiting for your answer' : 'yours'}: {formatUSD(n.mission.reward)} on completion.
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => onSearch(n)}>
            ⌕ Search {n.position}s {(n.average || 0) + 1}+
          </button>
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => onClub(n.club.id)}>
            Open {n.club.shortName} · browse your pool →
          </button>
          <span className="text-[11px] text-mist-400">
            {n.club.cityName} · {n.club.leagueName}
          </span>
        </div>
      </div>
    </article>
  );
}

function NeedLine({
  n,
  onClub,
  onSearch,
  lead,
}: {
  n: GazetteNeed;
  onClub: (id: GazetteNeed['club']['id']) => void;
  onSearch: (n: GazetteNeed) => void;
  lead?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <button onClick={() => onClub(n.club.id)} title={`Open ${n.club.name}`}>
        <Crest club={n.club} size={28} />
      </button>
      <div className="min-w-0 flex-1">
        <button
          className="block max-w-full text-left font-serif text-[15px] font-semibold leading-snug text-mist-50 hover:text-grass-300"
          onClick={() => onClub(n.club.id)}
        >
          {headline(n)}
        </button>
        <div className="truncate text-[11px] text-mist-400">
          <span style={{ color: severityColor(n.severity) }}>●</span> avg{' '}
          <b className="num" style={{ color: ratingColor(n.average) }}>
            {n.average || '–'}
          </b>{' '}
          · depth {n.depth} · {n.transferBudget > 0 ? formatUSD(n.transferBudget, { compact: true }) : 'no budget'}
          {lead && ` · coach ${n.coach ? `relationship ${n.coach}` : 'never met'}`}
          {n.mission && ` · brief ${formatUSD(n.mission.reward, { compact: true })}`}
        </div>
      </div>
      <PosBadge pos={n.position} />
      <button
        className="btn-ghost shrink-0 px-2 py-1 text-[11px]"
        onClick={() => onSearch(n)}
        title={`Search for a ${n.position} rated ${(n.average || 0) + 1}+`}
      >
        ⌕
      </button>
    </li>
  );
}

function Section({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-night-900/40">
      <div className="border-b border-white/[0.06] px-4 pb-2 pt-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-grass-400">{kicker}</div>
        <h3 className="font-serif text-lg font-bold leading-tight text-mist-50">{title}</h3>
      </div>
      {children}
    </section>
  );
}
