import type { ReactNode } from 'react';
import { formatDate } from '../../engine/core/calendar';
import { formatUSD } from '../../engine/core/money';
import type { FrontPage, GazetteNeed, GazetteView, TouchlineSection } from '../../engine/views';
import { Loading, OvrBadge, PosBadge, ratingColor } from '../components/ui';
import { Crest } from '../visuals/crest';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame, type GameStore } from '../store/game-store';

const POSITION_NAME: Record<string, string> = {
  GK: 'goalkeeper',
  CB: 'centre-back',
  LB: 'left-back',
  RB: 'right-back',
  LWB: 'left wing-back',
  RWB: 'right wing-back',
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
const severityColor = (sev: number) => (sev >= 0.45 ? 'var(--color-alert-500)' : sev >= 0.2 ? 'var(--color-flood-500)' : 'var(--color-good-400)');
const formColor = { W: 'var(--color-good-400)', D: 'var(--color-mist-400)', L: 'var(--color-alert-500)' } as const;

function needHeadline(n: GazetteNeed): string {
  const name = posName(n.position);
  if (n.mission) return `${n.club.name} post a brief for a ${name}`;
  return `${n.club.name} ${urgency(n.severity)} a ${name}`;
}

type ClubId = GazetteNeed['club']['id'];

/** The Touchline: a weekly paper written from what happened, with the needs pages at the back. */
export function GazetteScreen() {
  const g = useEngineQuery(() => engine.getGazette(), []);
  const { navigate, searchFor, openRecommend } = useGame();
  if (!g) return <Loading label="Printing this week's issue" />;

  const openClub = (id: ClubId) => navigate({ screen: 'club', id });
  const openPlayer = (id: string) => navigate({ screen: 'player', id: id as never });
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
  const by = (s: TouchlineSection) => g.bylines[s];
  const wishList = g.front.need ? g.yourClubs.slice(1) : g.yourClubs;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <Masthead g={g} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <FrontStory f={g.front} byline={by('front')} onClub={openClub} onPlayer={openPlayer} onSearch={searchNeed} />
        <Column kicker={g.leagueName ?? 'Results'} title="This week's results" byline={by('results')}>
          {g.results.length === 0 ? (
            <Empty>No league games this week.</Empty>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {g.results.map((r) => (
                <li key={`${r.home.id}:${r.away.id}`} className="flex items-center gap-2 py-1.5 text-[13px]">
                  <button className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right hover:text-grass-300" onClick={() => openClub(r.home.id)}>
                    <span className="truncate">{r.home.shortName}</span>
                    <Crest club={r.home} size={16} />
                  </button>
                  <span className="num w-12 shrink-0 text-center font-bold text-mist-50">
                    {r.score[0]}–{r.score[1]}
                  </span>
                  <button className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:text-grass-300" onClick={() => openClub(r.away.id)}>
                    <Crest club={r.away} size={16} />
                    <span className="truncate">{r.away.shortName}</span>
                  </button>
                  <span className="w-14 shrink-0 text-right text-[10px] font-semibold uppercase tracking-wide text-flood-300">
                    {r.note === 'upset' ? 'Shock' : r.note === 'thrashing' ? 'Rout' : r.note === 'goal-fest' ? 'Thriller' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Column>
      </div>

      <div className="grid grid-cols-1 gap-6 border-t border-white/10 pt-5 md:grid-cols-2 lg:grid-cols-3">
        {/* Column 1: the market. */}
        <div className="flex flex-col gap-6">
          <Column kicker="Transfer desk" title="Done deals" byline={by('transfers')}>
            {g.transfers.length === 0 ? (
              <Empty>No signings worth printing this week.</Empty>
            ) : (
              <ul className="flex flex-col gap-3">
                {g.transfers.map((t) => (
                  <li key={t.id}>
                    <div className="font-serif text-[15px] font-bold leading-snug text-mist-50">{t.title}</div>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-mist-300">{t.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Column>
          <Column kicker="Rumour mill" title="Heard on the grapevine" byline={by('rumours')}>
            {g.links.length === 0 && g.rumours.length === 0 ? (
              <Empty>No whispers this week.</Empty>
            ) : (
              <ul className="flex flex-col gap-2.5 text-[13px] leading-snug text-mist-200">
                {g.links.map((r) => (
                  <li key={`${r.club.id}:${r.player.id}`} className="flex gap-2">
                    <Crest club={r.club} size={18} />
                    <span>
                      {r.text}{' '}
                      <button className="text-[11px] text-mist-400 underline decoration-white/20 underline-offset-2 hover:text-grass-300" onClick={() => openPlayer(r.player.id)}>
                        {r.player.position}
                        {r.player.clubName ? `, ${r.player.clubName}` : ''} →
                      </button>
                    </span>
                  </li>
                ))}
                {g.rumours.map((r) => (
                  <li key={`rival:${r.player.id}`} className="flex gap-2">
                    <Crest club={r.club} size={18} />
                    <span>
                      Scout <b>{r.rival}</b> is {r.advanced ? 'close to landing' : 'said to be tracking'}{' '}
                      <button className="font-semibold text-mist-50 underline decoration-white/20 underline-offset-2 hover:text-grass-300" onClick={() => openPlayer(r.player.id)}>
                        {r.player.name}
                      </button>{' '}
                      for {r.club.name}.
                      {r.yours && <span className="ml-1 rounded bg-alert-500/15 px-1 text-[11px] font-semibold text-alert-400">one of yours</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] italic text-mist-500">Not every rumour is true. The ones with money behind them usually are.</p>
          </Column>
        </div>

        {/* Column 2: people. */}
        <div className="flex flex-col gap-6">
          <Column kicker="Interview" title={g.interview ? `${g.interview.coach} speaks` : 'No comment'} byline={by('interview')}>
            {g.interview ? (
              <div>
                <button className="mb-2 flex items-center gap-2 text-[12px] text-mist-400 hover:text-grass-300" onClick={() => openClub(g.interview!.club.id)}>
                  <Crest club={g.interview.club} size={22} /> Head Coach, {g.interview.club.name}
                </button>
                <blockquote className="border-l-4 border-grass-500/60 pl-3 font-serif text-[19px] italic leading-snug text-mist-50">“{g.interview.quote}”</blockquote>
                <p className="mt-2 text-[12px] text-mist-400">
                  Reading between the lines: a <b className="text-mist-200">{posName(g.interview.position)}</b>.{' '}
                  {g.interview.briefPosted ? 'The club has since posted a brief.' : 'No brief yet; a scout with a name ready could get in first.'}
                </p>
              </div>
            ) : (
              <Empty>Every coach we called was happy with his squad.</Empty>
            )}
          </Column>
          <Column kicker="Coach watch" title="Under pressure" byline={by('pressure')}>
            {g.pressure.length === 0 ? (
              <Empty>Every board is behind its coach, for now.</Empty>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {g.pressure.map((p) => (
                  <li key={p.club.id} className="flex items-center gap-2.5 py-2">
                    <button onClick={() => openClub(p.club.id)}>
                      <Crest club={p.club} size={24} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-mist-100">{p.coach}</div>
                      <div className="truncate text-[11px] text-mist-400">
                        {p.club.shortName} · {ordinal(p.tablePos)} · {p.recentPoints} pt{p.recentPoints === 1 ? '' : 's'} from 5
                        {p.daysInJob !== undefined && p.daysInJob < 120 && ` · ${p.daysInJob} days in the job`}
                      </div>
                      {p.president && <div className="truncate text-[11px] text-mist-500">Board: {p.president} · {p.policy}</div>}
                    </div>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                      style={{
                        color: p.heat === 'boiling' ? 'var(--color-alert-500)' : p.heat === 'hot' ? 'var(--color-flood-500)' : 'var(--color-mist-400)',
                        background: p.heat === 'boiling' ? 'rgba(239,68,68,.12)' : p.heat === 'hot' ? 'rgba(245,179,1,.12)' : 'rgba(255,255,255,.05)',
                      }}
                    >
                      {p.heat}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] italic text-mist-500">A new coach brings new ideas, and new needs.</p>
          </Column>
        </div>

        {/* Column 3: the league. */}
        <div className="flex flex-col gap-6 md:col-span-2 md:grid md:grid-cols-2 lg:col-span-1 lg:flex">
          <Column kicker={g.leagueName ?? 'Table'} title="The table" byline="">
            {g.table.length === 0 ? (
              <Empty>The season hasn't started.</Empty>
            ) : (
              <table className="w-full text-[12.5px]">
                <tbody>
                  {g.table.map((r, i) => [
                    i > 0 && g.table[i - 1]!.pos !== r.pos - 1 && (
                      <tr key={`gap:${r.pos}`}>
                        <td colSpan={5} className="py-0.5 text-center text-[10px] tracking-[0.4em] text-mist-500">
                          · · ·
                        </td>
                      </tr>
                    ),
                    <tr key={r.club.id} className={r.yours ? 'text-grass-300' : 'text-mist-200'}>
                      <td className="num w-6 py-1 text-mist-400">{r.pos}</td>
                      <td className="py-1">
                        <button className="flex items-center gap-1.5 hover:text-grass-300" onClick={() => openClub(r.club.id)}>
                          <Crest club={r.club} size={14} />
                          <span className="truncate">{r.club.shortName}</span>
                        </button>
                      </td>
                      <td className="hidden py-1 text-right sm:table-cell">
                        <span className="inline-flex gap-0.5">
                          {r.form.map((f, k) => (
                            <span key={k} className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: formColor[f] }} title={f} />
                          ))}
                        </span>
                      </td>
                      <td className="num w-7 py-1 text-right text-mist-400">{r.played}</td>
                      <td className="num w-8 py-1 text-right font-bold">{r.points}</td>
                    </tr>,
                  ])}
                </tbody>
              </table>
            )}
          </Column>
          {g.pundit && (
            <Column kicker={g.pundit.final ? 'How we did' : "Pundit's picks"} title={g.pundit.final ? 'Our predictions, graded' : 'We said it in August'} byline={by('pundit')}>
              <dl className="flex flex-col gap-2.5 text-[13px]">
                <Pick label="Champions">
                  <ClubPick club={g.pundit.title.club} onClub={openClub} />
                  <Verdict pos={g.pundit.title.pos} good={g.pundit.title.pos === 1} final={g.pundit.final} />
                </Pick>
                <Pick label="Going down">
                  <div className="flex flex-col gap-1">
                    {g.pundit.relegated.map((r) => (
                      <div key={r.club.id} className="flex items-center gap-2">
                        <ClubPick club={r.club} onClub={openClub} />
                        <Verdict pos={r.pos} good={r.pos > g.table[g.table.length - 1]!.pos - g.pundit!.drop} final={g.pundit!.final} />
                      </div>
                    ))}
                  </div>
                </Pick>
                {g.pundit.breakout && (
                  <Pick label="Breakout star">
                    <button className="font-semibold text-mist-100 hover:text-grass-300" onClick={() => openPlayer(g.pundit!.breakout!.id)}>
                      {g.pundit.breakout.name}
                    </button>
                    <span className="text-[11px] text-mist-400">
                      {g.pundit.breakout.club?.shortName ?? 'free agent'} · {g.pundit.breakout.apps} apps, {g.pundit.breakout.goals} goals
                      {g.pundit.breakout.rating ? ` · ${g.pundit.breakout.rating.toFixed(1)}` : ''}
                    </span>
                  </Pick>
                )}
              </dl>
            </Column>
          )}
        </div>
      </div>

      <Column kicker="Your corner" title="How your signings are doing" byline={by('corner')} wide>
        {g.corner.length === 0 ? (
          <Empty>Once you place a player, we follow his season here.</Empty>
        ) : (
          <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            {g.corner.map((c) => (
              <li key={c.player.id} className="flex items-center gap-2.5 border-b border-white/[0.05] py-2">
                <Crest club={c.club} size={22} />
                <button className="min-w-0 flex-1 text-left" onClick={() => openPlayer(c.player.id)}>
                  <div className="truncate text-[13px] font-semibold text-mist-100 hover:text-grass-300">
                    {c.player.name} {c.starred && <span className="ml-1 text-flood-300" title="Starred this week">★</span>}
                  </div>
                  <div className="truncate text-[11px] text-mist-400">
                    {c.player.position} · {c.club.shortName} · {c.apps} apps · {c.goals} G · {c.assists} A
                  </div>
                </button>
                <span className="num w-9 text-right text-[13px] font-bold" style={{ color: c.rating ? ratingColor(40 + (c.rating - 6) * 25) : undefined }}>
                  {c.rating?.toFixed(1) ?? '–'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Column>

      <Wanted g={g} wishList={wishList} byline={by('wanted')} onClub={openClub} onSearch={searchNeed} onPlayer={openPlayer} onRecommend={openRecommend} searchFor={searchFor} />
    </div>
  );
}

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}

function Masthead({ g }: { g: GazetteView }) {
  return (
    <header className="border-b-4 border-double border-white/20 pb-3 text-center">
      <div className="flex items-center justify-between border-b border-white/10 pb-1.5 text-[11px] uppercase tracking-[0.18em] text-mist-400">
        <span>No. {g.issue}</span>
        <span className="hidden sm:inline">
          {g.countryName} edition · Season {g.seasonLabel}
        </span>
        <span>{formatDate(g.date)}</span>
      </div>
      <h1 className="mt-2 font-serif text-5xl font-black tracking-tight text-mist-50 sm:text-7xl">The Touchline</h1>
      <div className="mt-1 text-[12px] italic text-mist-400">Results, rumours and the people who find the players</div>
    </header>
  );
}

function FrontStory({
  f,
  byline,
  onClub,
  onPlayer,
  onSearch,
}: {
  f: FrontPage;
  byline: string;
  onClub: (id: ClubId) => void;
  onPlayer: (id: string) => void;
  onSearch: (n: GazetteNeed) => void;
}) {
  const accent = f.kind === 'yours' ? 'var(--color-flood-500)' : f.kind === 'sacking' ? 'var(--color-alert-500)' : f.kind === 'board' ? 'var(--color-flood-500)' : f.need ? severityColor(f.need.severity) : 'var(--color-good-400)';
  return (
    <article className="grid grid-cols-1 content-start gap-4 sm:grid-cols-[auto_1fr]">
      {f.club && (
        <button onClick={() => onClub(f.club!.id)} className="justify-self-center sm:pt-2" title={`Open ${f.club.name}`}>
          <Crest club={f.club} size={96} />
        </button>
      )}
      <div className={f.club ? '' : 'sm:col-span-2'}>
        <div className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: accent }}>
          {f.kicker}
        </div>
        <h2 className="mt-1 font-serif text-3xl font-black leading-[1.08] text-mist-50 sm:text-[42px]">{f.headline}</h2>
        <div className="mt-2 text-[11px] uppercase tracking-[0.14em] text-mist-500">By {byline}</div>
        <p className="mt-2 font-serif text-[16px] leading-relaxed text-mist-300 first-letter:float-left first-letter:mr-1.5 first-letter:font-serif first-letter:text-5xl first-letter:font-black first-letter:leading-[0.85] first-letter:text-mist-50">
          {f.standfirst}
        </p>
        {f.need?.mission && (
          <p className="mt-1 text-[13px] text-flood-300">
            The brief is {f.need.mission.status === 'offered' ? 'waiting for your answer' : 'yours'}: {formatUSD(f.need.mission.reward)} on completion.
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {f.need && (
            <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => onSearch(f.need!)}>
              ⌕ Search {f.need.position}s {(f.need.average || 0) + 1}+
            </button>
          )}
          {f.player && (
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => onPlayer(f.player!.id)}>
              {f.player.name} →
            </button>
          )}
          {f.club && (
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => onClub(f.club!.id)}>
              {f.club.name} →
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function Wanted({
  g,
  wishList,
  byline,
  onClub,
  onSearch,
  onPlayer,
  onRecommend,
  searchFor,
}: {
  g: GazetteView;
  wishList: GazetteNeed[];
  byline: string;
  onClub: (id: ClubId) => void;
  onSearch: (n: GazetteNeed) => void;
  onPlayer: (id: string) => void;
  onRecommend: GameStore['openRecommend'];
  searchFor: GameStore['searchFor'];
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-night-900/40 p-4 sm:p-5">
      <div className="mb-4 flex items-end justify-between border-b-2 border-white/15 pb-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-grass-400">Classifieds · compiled by {byline}</div>
          <h2 className="font-serif text-3xl font-black uppercase tracking-tight text-mist-50">Wanted</h2>
        </div>
        <span className="hidden text-[11px] italic text-mist-400 sm:block">Who needs what, who can pay, and who you already know</span>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <SubHead title={g.noClubs ? 'No clubs on your books yet' : 'At your clubs'}>
            {wishList.length === 0 ? (
              <Empty>
                {g.noClubs
                  ? 'Win a scouting agreement and your clients’ needs appear here. Until then, the clubs below are your best leads.'
                  : 'Nothing else pressing at your clubs this week.'}
              </Empty>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {wishList.map((n) => (
                  <NeedLine key={`${n.club.id}:${n.position}`} n={n} onClub={onClub} onSearch={onSearch} />
                ))}
              </ul>
            )}
          </SubHead>
          <SubHead title={`Around ${g.countryName}: short of players, with money`}>
            {g.leads.length === 0 ? (
              <Empty>No club outside your books has an urgent need and a budget this week.</Empty>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {g.leads.map((n) => (
                  <NeedLine key={`${n.club.id}:${n.position}`} n={n} onClub={onClub} onSearch={onSearch} lead />
                ))}
              </ul>
            )}
          </SubHead>
        </div>
        <div className="flex flex-col gap-6">
          <SubHead title={g.noClubs ? 'From your pool: fits for those clubs' : 'From your pool: players who fit'}>
            {g.poolFits.length === 0 ? (
              <Empty>Nobody in your pool clears the bar yet. Search the needs on the left to fill it.</Empty>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {g.poolFits.map((f) => (
                  <li key={`${f.player.id}:${f.club.id}`} className="flex items-center gap-3 py-2">
                    <OvrBadge ovr={f.player.ovr} range={f.player.ovrRange} size="sm" />
                    <button className="min-w-0 flex-1 text-left" onClick={() => onPlayer(f.player.id)}>
                      <div className="truncate text-sm font-semibold hover:text-grass-300">{f.player.name}</div>
                      <div className="truncate text-[11px] text-mist-400">
                        <PosBadge pos={f.position} /> for {f.club.shortName} · {f.player.age} · {formatUSD(f.player.value, { compact: true })}
                      </div>
                    </button>
                    <span className="num w-8 text-right text-[12px] text-grass-300" title="How far his estimate clears the bar">
                      +{f.margin}
                    </span>
                    <button className="btn-primary shrink-0 px-2.5 py-1 text-[11px]" onClick={() => onRecommend({ playerId: f.player.id, clubId: f.club.id })}>
                      Recommend
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SubHead>
          <SubHead title="Positions in demand">
            {g.demand.length === 0 ? (
              <Empty>No position is in short supply.</Empty>
            ) : (
              <ul className="grid grid-cols-2 gap-2">
                {g.demand.map((d) => (
                  <li key={d.position}>
                    <button
                      className="flex w-full items-center gap-2 rounded-lg border border-white/[0.06] px-2.5 py-2 text-left hover:border-grass-500/40"
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
                      <PosBadge pos={d.position} />
                      <div className="min-w-0 text-[11px] leading-tight text-mist-400">
                        <div className="text-[13px] text-mist-100">
                          <b className="num">{d.clubs}</b> club{d.clubs > 1 ? 's' : ''}
                          {d.urgent > 0 && <span className="whitespace-nowrap text-alert-400"> · {d.urgent} urgent</span>}
                        </div>
                        {d.lowestBar}+ · to {formatUSD(d.topBudget, { compact: true })}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SubHead>
        </div>
      </div>
    </section>
  );
}

function NeedLine({ n, onClub, onSearch, lead }: { n: GazetteNeed; onClub: (id: ClubId) => void; onSearch: (n: GazetteNeed) => void; lead?: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <button onClick={() => onClub(n.club.id)} title={`Open ${n.club.name}`}>
        <Crest club={n.club} size={26} />
      </button>
      <div className="min-w-0 flex-1">
        <button className="block max-w-full text-left font-serif text-[15px] font-semibold leading-snug text-mist-50 hover:text-grass-300" onClick={() => onClub(n.club.id)}>
          {needHeadline(n)}
        </button>
        <div className="truncate text-[11px] text-mist-400">
          <span style={{ color: severityColor(n.severity) }}>●</span> avg{' '}
          <b className="num" style={{ color: ratingColor(n.average) }}>
            {n.average || '–'}
          </b>{' '}
          · depth {n.depth} · {n.transferBudget > 0 ? formatUSD(n.transferBudget, { compact: true }) : 'no budget'}
          {lead && ` · ${n.coach ? `standing ${n.coach}` : 'coach never met'}`}
          {n.mission && ` · brief ${formatUSD(n.mission.reward, { compact: true })}`}
        </div>
      </div>
      <PosBadge pos={n.position} />
      <button className="btn-ghost shrink-0 px-2 py-1 text-[11px]" onClick={() => onSearch(n)} title={`Search for a ${n.position} rated ${(n.average || 0) + 1}+`}>
        ⌕
      </button>
    </li>
  );
}

/** A newspaper column: rule, kicker, headline, byline. */
function Column({ kicker, title, byline, children, wide }: { kicker: string; title: string; byline: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`border-t-2 border-white/20 pt-2 ${wide ? '' : 'min-w-0'}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-grass-400">{kicker}</div>
      <h3 className="font-serif text-xl font-black leading-tight text-mist-50">{title}</h3>
      {byline && <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-mist-500">By {byline}</div>}
      <div className={byline ? '' : 'mt-2'}>{children}</div>
    </section>
  );
}

function SubHead({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 border-b border-white/10 pb-1 font-serif text-[15px] font-bold text-mist-100">{title}</h4>
      {children}
    </div>
  );
}

function Pick({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mist-500">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap items-center gap-2">{children}</dd>
    </div>
  );
}

function ClubPick({ club, onClub }: { club: NonNullable<FrontPage['club']>; onClub: (id: ClubId) => void }) {
  return (
    <button className="flex items-center gap-1.5 font-semibold text-mist-100 hover:text-grass-300" onClick={() => onClub(club.id)}>
      <Crest club={club} size={16} /> {club.name}
    </button>
  );
}

function Verdict({ pos, good, final }: { pos: number; good: boolean; final: boolean }) {
  if (!pos) return null;
  return (
    <span className={`text-[11px] ${good ? 'text-good-300' : final ? 'text-alert-400' : 'text-mist-400'}`}>
      {final ? (good ? '✓ ' : '✗ ') : ''}
      {final ? 'finished' : 'now'} {ordinal(pos)}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-mist-400">{children}</p>;
}
