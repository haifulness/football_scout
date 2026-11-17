import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatUSD } from '../../engine/core/money';
import type { GlobalSearchResults } from '../../engine/views';
import { Crest } from '../visuals/crest';
import { PosBadge } from './ui';
import { engine } from '../store/engine-client';
import { useGame, type Route } from '../store/game-store';

interface Item {
  key: string;
  route: Route;
  render: () => React.ReactNode;
}

/** One box to jump anywhere: players, clubs, leagues, countries. "/" or ⌘K focuses it. */
export function GlobalSearch() {
  const navigate = useGame((s) => s.navigate);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<GlobalSearchResults>();
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setResults(undefined);
    let alive = true;
    const t = setTimeout(() => engine.searchEverything(term).then((r) => alive && (setResults(r), setActive(0))), 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const groups = useMemo(() => {
    if (!results) return [];
    const out: { title: string; items: Item[] }[] = [];
    if (results.players.length)
      out.push({
        title: 'Players',
        items: results.players.map((p) => ({
          key: `p:${p.id}`,
          route: { screen: 'player', id: p.id },
          render: () => (
            <>
              <PosBadge pos={p.position} />
              <span className="min-w-0 flex-1 truncate">
                {p.inPool && <span className="text-flood-400">☰ </span>}
                {p.name} <span className="text-[11px] text-mist-400">{p.age}</span>
              </span>
              {p.club ? (
                <span className="flex items-center gap-1 text-[11px] text-mist-400">
                  <Crest club={p.club} size={14} /> {p.club.name}
                </span>
              ) : (
                <span className="text-[11px] text-mist-400">Free agent</span>
              )}
              <span className="num w-14 text-right text-[11px] text-mist-400">{formatUSD(p.value)}</span>
            </>
          ),
        })),
      });
    if (results.clubs.length)
      out.push({
        title: 'Clubs',
        items: results.clubs.map((c) => ({
          key: `c:${c.club.id}`,
          route: { screen: 'club', id: c.club.id },
          render: () => (
            <>
              <Crest club={c.club} size={18} />
              <span className="min-w-0 flex-1 truncate">{c.club.name}</span>
              <span className="truncate text-[11px] text-mist-400">
                {c.cityName} · {c.leagueName}
              </span>
            </>
          ),
        })),
      });
    if (results.leagues.length)
      out.push({
        title: 'Leagues',
        items: results.leagues.map((l) => ({
          key: `l:${l.id}`,
          route: { screen: 'country', id: l.countryId, leagueId: l.id },
          render: () => (
            <>
              <span className="w-[18px] text-center text-mist-400">🏆</span>
              <span className="min-w-0 flex-1 truncate">{l.name}</span>
              <span className="text-[11px] text-mist-400">{l.countryName}</span>
            </>
          ),
        })),
      });
    if (results.countries.length)
      out.push({
        title: 'Countries',
        items: results.countries.map((c) => ({
          key: `n:${c.id}`,
          route: { screen: 'country', id: c.id },
          render: () => (
            <>
              <span className="w-[18px] text-center text-mist-400">◍</span>
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="text-[11px] text-mist-400">{c.continentName}</span>
            </>
          ),
        })),
      });
    if (results.cities.length)
      out.push({
        title: 'Cities',
        items: results.cities.map((c) => ({
          key: `t:${c.id}`,
          route: c.clubId ? { screen: 'club', id: c.clubId } : { screen: 'country', id: c.countryId },
          render: () => (
            <>
              <span className="w-[18px] text-center text-mist-400">⌖</span>
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="text-[11px] text-mist-400">
                {c.countryName}
                {c.clubs ? ` · ${c.clubs} club${c.clubs > 1 ? 's' : ''}` : ''}
              </span>
            </>
          ),
        })),
      });
    return out;
  }, [results]);
  const flat = groups.flatMap((g) => g.items);

  const go = (item: Item | undefined) => {
    if (!item) return;
    navigate(item.route);
    setOpen(false);
    setQ('');
    input.current?.blur();
  };

  return (
    <div className="relative w-full max-w-sm">
      <input
        ref={input}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, flat.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') go(flat[active]);
          else if (e.key === 'Escape') {
            setOpen(false);
            input.current?.blur();
          }
        }}
        placeholder="Search players, clubs, places…"
        aria-label="Search everything"
        className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-1.5 pl-8 pr-10 text-sm text-mist-100 outline-none placeholder:text-mist-400 focus:border-grass-400/60 focus:bg-night-950/80"
      />
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-mist-400">⌕</span>
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-white/10 px-1.5 text-[10px] text-mist-400">/</kbd>
      <AnimatePresence>
        {open && q.trim().length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] min-w-[26rem] overflow-y-auto rounded-xl border border-white/10 bg-night-900 py-1 shadow-2xl"
          >
            {!results ? (
              <div className="px-4 py-3 text-sm text-mist-400">Searching…</div>
            ) : !flat.length ? (
              <div className="px-4 py-3 text-sm text-mist-400">Nothing matches “{q.trim()}”.</div>
            ) : (
              groups.map((g) => (
                <div key={g.title}>
                  <div className="px-4 pb-1 pt-2 text-[10px] uppercase tracking-wider text-mist-400">{g.title}</div>
                  {g.items.map((item) => {
                    const i = flat.indexOf(item);
                    return (
                      <button
                        key={item.key}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(item)}
                        className={`flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm ${i === active ? 'bg-white/[0.07]' : ''}`}
                      >
                        {item.render()}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
