import { DilemmaCards } from '../components/dilemma-cards';
import { BoardAskCards } from '../components/board-ask-cards';
import { ConsultationCards } from '../components/consultation-cards';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { formatDate } from '../../engine/core/calendar';
import type { NewsItem, NewsKind } from '../../engine/model/season';
import { FixtureRow } from '../components/match';
import { Loading, Panel } from '../components/ui';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';

const KIND_META: Record<NewsKind, { label: string; color: string; icon: string }> = {
  'season-review': { label: 'Season review', color: '#ffc933', icon: '🏆' },
  coaching: { label: 'Coaching', color: '#38bdf8', icon: '📋' },
  retirement: { label: 'Retirement', color: '#a9bec7', icon: '👟' },
  'season-start': { label: 'Season', color: '#2fcf73', icon: '📅' },
  milestone: { label: 'Hat-tricks', color: '#f87171', icon: '⚽' },
  transfer: { label: 'Transfers', color: '#a3e635', icon: '⇄' },
  finance: { label: 'Money', color: '#ef4444', icon: '$' },
  career: { label: 'Career', color: '#ffc933', icon: '★' },
  rumour: { label: 'Rumours', color: '#c084fc', icon: '👁' },
  board: { label: 'Boardroom', color: '#f59e0b', icon: '🏛' },
};

const INBOX_KINDS: NewsKind[] = ['career', 'finance', 'rumour'];
const NEWS_KINDS: NewsKind[] = ['transfer', 'milestone', 'coaching', 'board', 'retirement', 'rumour', 'season-review', 'season-start'];

/** Your messages: deals, offers, missions, money, rumours about your players. */
export function InboxScreen() {
  const news = useEngineQuery(() => engine.getNews('inbox'), []);
  const unread = useGame((s) => s.scout?.unreadInbox ?? 0);
  const touch = useGame((s) => s.touch);
  const [newFrom, setNewFrom] = useState<number>();
  // Opening the inbox reads it; anything arriving while it is open is read too. Keep highlighting what was new.
  useEffect(() => {
    if (newFrom !== undefined && unread === 0) return;
    void engine.markInboxRead().then((before) => {
      setNewFrom((prev) => (prev === undefined ? before : Math.min(prev, before)));
      void touch();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread]);
  if (!news) return <Loading label="Sorting the post" />;
  const fresh = newFrom === undefined ? 0 : news.filter((n) => n.id >= newFrom).length;
  return (
    <div className="flex flex-col gap-4">
      <header>
        <div className="panel-title text-flood-400">{fresh ? `${fresh} new` : 'All caught up'}</div>
        <h1 className="font-display text-5xl font-bold uppercase leading-none">Inbox</h1>
        <p className="mt-2 max-w-2xl text-sm text-mist-400">
          Messages for you: deals, offers, missions, money, and rumours about players you are working on. World news is under News.
        </p>
      </header>
      <BoardAskCards />
      <ConsultationCards />
      <DilemmaCards />
      <NewsFeed news={news} kinds={INBOX_KINDS} newFrom={newFrom} empty="No messages yet. Deals, offers and missions will land here." />
    </div>
  );
}

/** World news, plus the latest results. */
export function NewsScreen() {
  const news = useEngineQuery(() => engine.getNews('news'), []);
  const featured = useEngineQuery(() => engine.getFeaturedResults(), []);
  const clock = useGame((s) => s.clock);
  const [leagueIdx, setLeagueIdx] = useState(0);
  if (!news || !featured) return <Loading label="Reading the papers" />;
  const league = featured[leagueIdx];
  return (
    <div className="flex flex-col gap-4">
      <header>
        <div className="panel-title text-flood-400">{clock?.seasonLabel} season</div>
        <h1 className="font-display text-5xl font-bold uppercase leading-none">News</h1>
      </header>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_460px]">
        <NewsFeed news={news} kinds={NEWS_KINDS} empty="Nothing yet. Advance time. Transfers, season reviews, coaching changes and retirements land here." />
        <Panel
          title={league?.round ? `Latest results · Round ${league.round}` : 'Latest results'}
          right={
            <select
              value={leagueIdx}
              onChange={(e) => setLeagueIdx(Number(e.target.value))}
              className="rounded-md border border-white/10 bg-night-950 px-2 py-1 text-xs text-mist-100 outline-none"
            >
              {featured.map((f, i) => (
                <option key={f.leagueId} value={i}>
                  {f.countryName} · {f.leagueName}
                </option>
              ))}
            </select>
          }
        >
          {league && league.fixtures.length ? (
            league.fixtures.map((f) => <FixtureRow key={f.id} f={f} />)
          ) : (
            <div className="p-10 text-center text-sm text-mist-400">No matches played yet this season.</div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function NewsFeed({ news, kinds, newFrom, empty }: { news: NewsItem[]; kinds: NewsKind[]; newFrom?: number; empty: string }) {
  const navigate = useGame((s) => s.navigate);
  const setPoolFilters = useGame((s) => s.setPoolFilters);
  const [filter, setFilter] = useState<NewsKind | 'all'>('all');
  const shown = news.filter((n) => filter === 'all' || n.kind === filter);
  // The most useful place to go from a message: the player, else the club, else the country.
  const open = (n: NewsItem) =>
    n.link === 'pool-assistants'
      ? (setPoolFilters({}), setPoolFilters({ assistant: true }), navigate({ screen: 'pool' }))
      : n.link
        ? navigate({ screen: n.link })
        : n.playerIds?.[0]
          ? navigate({ screen: 'player', id: n.playerIds[0] })
          : n.clubIds?.[0]
            ? navigate({ screen: 'club', id: n.clubIds[0] })
            : n.countryId && navigate({ screen: 'country', id: n.countryId });
  return (
    <Panel
      title="Messages"
      right={
        <span className="flex flex-wrap gap-1">
          {(['all', ...kinds] as (NewsKind | 'all')[]).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded px-2 py-0.5 text-[11px] font-semibold ${filter === k ? 'bg-grass-500 text-night-950' : 'text-mist-400 hover:bg-white/[0.06]'}`}
            >
              {k === 'all' ? 'All' : KIND_META[k].label}
            </button>
          ))}
        </span>
      }
    >
      {shown.length === 0 ? (
        <div className="p-10 text-center text-sm text-mist-400">{empty}</div>
      ) : (
        <ul>
          {shown.map((n, i) => {
            const meta = KIND_META[n.kind];
            const isNew = newFrom !== undefined && n.id >= newFrom;
            const target = !!(n.link || n.playerIds?.[0] || n.clubIds?.[0] || n.countryId);
            return (
              <motion.li
                key={n.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
                className={`flex gap-3 border-b border-white/[0.04] px-4 py-3 ${isNew ? 'bg-flood-500/[0.05]' : ''}`}
              >
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm"
                  style={{ background: `${meta.color}1a`, boxShadow: `inset 0 0 0 1px ${meta.color}40` }}
                >
                  {meta.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <button onClick={() => open(n)} className={`text-left text-sm font-semibold ${target ? 'hover:text-grass-300' : ''}`}>
                      {isNew && <span className="mr-1.5 rounded bg-flood-500 px-1 py-px text-[9px] font-bold uppercase text-night-950">New</span>}
                      {n.title}
                    </button>
                    <span className="num shrink-0 text-[11px] text-mist-400">{formatDate(n.date)}</span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-mist-300">{n.body}</p>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
