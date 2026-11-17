import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { formatDate } from '../../engine/core/calendar';
import { formatUSD } from '../../engine/core/money';
import type { HuntView } from '../../engine/views';
import { ClubLink } from '../components/club-link';
import { Collapsible, Loading, Panel, PosBadge, useCultureLookup } from '../components/ui';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';
import { Crest } from '../visuals/crest';
import { Portrait } from '../visuals/portrait';

/** "a 16-year-old", "an 18-year-old". */
const aYearOld = (age: number) => `${age === 8 || age === 11 || age === 18 ? 'an' : 'a'} ${age}-year-old`;
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

const chanceWord = (c: number) => (c >= 0.75 ? 'good odds' : c >= 0.5 ? 'fair odds' : 'long shot');

const BAND_WIDTH = { behind: 22, 'on the trail': 50, 'closing in': 80, 'found him': 100 } as const;
const BAND_COLOR = { behind: 'bg-mist-400', 'on the trail': 'bg-flood-400', 'closing in': 'bg-alert-500', 'found him': 'bg-alert-500' } as const;

const STATUS = {
  found: { label: 'Found', className: 'border-grass-400/40 text-grass-300' },
  lost: { label: 'Beaten to it', className: 'border-alert-400/40 text-alert-400' },
  cold: { label: 'Went cold', className: 'border-white/10 text-mist-400' },
  active: { label: 'Open', className: 'border-violet-400/40 text-violet-300' },
} as const;

export function HuntsScreen() {
  const hunts = useEngineQuery(() => engine.getHunts(), []);
  if (!hunts) return <Loading label="Listening for whispers" />;
  const open = hunts.filter((h) => h.status === 'active');
  const ended = hunts.filter((h) => h.status !== 'active');
  return (
    <div className="flex flex-col gap-4">
      <header>
        <div className="panel-title text-violet-300">Wonderkid hunts</div>
        <h1 className="font-display text-5xl font-bold uppercase leading-none">Hunts</h1>
        <p className="mt-2 max-w-2xl text-sm text-mist-400">
          Now and then a contact whispers about a hidden talent: a real prodigy nobody has looked at properly. Narrow it down from the country to the region,
          the city and finally his name, by phoning your contacts from anywhere or asking around in person. Other scouts heard the same story. Whoever finds him
          first gets the head start, and a search that turns him up counts too. Trails go cold after six weeks.
        </p>
      </header>

      {open.length ? (
        open.map((h) => <HuntCard key={h.id} h={h} />)
      ) : (
        <Panel>
          <div className="p-8 text-center text-sm text-mist-400">
            No whispers right now. They arrive every few months, more often once people know your name. Keep playing and watch your Inbox.
          </div>
        </Panel>
      )}

      {ended.length > 0 && (
        <Collapsible id="hunts-ended" title="Past hunts" count={ended.length}>
          <ul>
            {ended.map((h) => (
              <EndedRow key={h.id} h={h} />
            ))}
          </ul>
        </Collapsible>
      )}
    </div>
  );
}

function Breadcrumb({ h }: { h: HuntView }) {
  const steps = [h.area.country.name, h.area.region, h.area.city?.name, h.player?.name];
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      {steps.map((s, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-mist-400">›</span>}
          <motion.span
            key={s ?? `unknown-${i}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={s ? 'rounded-md bg-white/[0.06] px-2 py-0.5 font-semibold' : 'rounded-md border border-dashed border-white/15 px-2 py-0.5 text-mist-400'}
          >
            {s ?? '?'}
          </motion.span>
        </span>
      ))}
    </div>
  );
}

function HuntCard({ h }: { h: HuntView }) {
  const { huntAction, advancing, openTravel } = useGame();
  const cultureOf = useCultureLookup();
  const [last, setLast] = useState<{ success: boolean; text: string }>();
  const [error, setError] = useState<string>();
  const act = (method: 'calls' | 'visit') => {
    setError(undefined);
    huntAction(h.id, method)
      .then(setLast)
      .catch((e) => setError(e instanceof Error ? e.message : 'That did not work.'));
  };
  const o = h.options;
  const warmth = h.daysLeft / 42;
  const visitWhere = h.stage === 0 ? h.area.country.name : h.stage === 1 ? `the ${h.area.region} area` : h.area.city?.name;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl border border-violet-400/20 bg-[radial-gradient(600px_200px_at_0%_0%,rgba(167,139,250,0.12),transparent_70%)] bg-night-900"
    >
      <div className="flex flex-wrap items-start gap-5 p-5">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/[0.04] font-display text-5xl text-violet-300/70">
          ?
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <PosBadge pos={h.position} />
            <span className="font-display text-3xl font-bold uppercase leading-none">{cap(aYearOld(h.age))} wonderkid</span>
          </div>
          <div className="mt-3">
            <Breadcrumb h={h} />
          </div>
        </div>
        <div className="w-44 text-right">
          <div className="panel-title text-[10px]">Trail goes cold in</div>
          <div className={`num font-display text-4xl font-bold leading-none ${h.daysLeft <= 7 ? 'text-alert-400' : 'text-mist-100'}`}>{h.daysLeft}d</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-violet-400" style={{ width: `${Math.max(0, Math.min(1, warmth)) * 100}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-mist-400">{formatDate(h.expiresOn)}</div>
        </div>
      </div>

      <div className="grid gap-4 border-t border-white/[0.05] p-5 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="panel-title mb-2 text-[11px]">Work the trail</div>
          {o && (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left hover:bg-white/[0.06] disabled:opacity-40"
                disabled={advancing}
                onClick={() => act('calls')}
              >
                <div className="font-semibold">☎ Phone your contacts</div>
                <div className="text-[12px] text-mist-400">
                  From anywhere · {formatUSD(o.calls.cost)} · {o.calls.days} days · {chanceWord(o.calls.chance)}
                </div>
              </button>
              {o.visit.inArea ? (
                <button
                  className="rounded-xl border border-violet-400/30 bg-violet-500/10 p-3 text-left hover:bg-violet-500/15 disabled:opacity-40"
                  disabled={advancing}
                  onClick={() => act('visit')}
                >
                  <div className="font-semibold">⌖ Ask around in person</div>
                  <div className="text-[12px] text-mist-400">
                    You're in {visitWhere} · {formatUSD(o.visit.cost)} · {o.visit.days} day · {chanceWord(o.visit.chance)}
                  </div>
                </button>
              ) : (
                <button
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left hover:bg-white/[0.06] disabled:opacity-40"
                  disabled={advancing || !o.visit.destination}
                  onClick={() =>
                    o.visit.destination &&
                    openTravel(o.visit.destination.id, { label: `Following a whisper: the ${h.age}-year-old ${h.position}`, route: { screen: 'hunts' } })
                  }
                >
                  <div className="font-semibold">✈ Go to {visitWhere}</div>
                  <div className="text-[12px] text-mist-400">
                    Travel to {o.visit.destination?.name} to ask around in person ({chanceWord(o.visit.chance)})
                  </div>
                </button>
              )}
            </div>
          )}
          <AnimatePresence mode="wait">
            {(last || error) && (
              <motion.div
                key={(last?.text ?? '') + (error ?? '')}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-3 rounded-lg border px-3 py-2 text-sm ${error ? 'border-alert-400/40 text-alert-400' : last?.success ? 'border-grass-400/40 text-grass-300' : 'border-white/10 text-mist-300'}`}
              >
                {error ?? last?.text}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="panel-title mb-2 mt-4 text-[11px]">What you've heard</div>
          <ol className="space-y-1.5">
            {h.clues.map((c, i) => (
              <li
                key={i}
                className={`flex gap-3 border-l-2 pl-3 text-sm ${c.tone === 'rival' ? 'border-alert-400/60' : c.tone === 'miss' ? 'border-white/10 text-mist-400' : 'border-violet-400/60'}`}
              >
                <span className="num w-16 shrink-0 text-[12px] text-mist-400">{formatDate(c.date).replace(/, \d{4}$/, '')}</span>
                <span>{c.text}</span>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <div className="panel-title mb-2 text-[11px]">Also on the trail</div>
          {h.rivals.length ? (
            <ul className="space-y-3">
              {h.rivals.map((r) => (
                <li key={r.id} className="flex items-center gap-3">
                  <Portrait seed={r.portraitSeed} culture={cultureOf(r.nationalityId)} size={36} age={45} className="rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{r.name}</div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <motion.div className={`h-full rounded-full ${BAND_COLOR[r.band]}`} initial={false} animate={{ width: `${BAND_WIDTH[r.band]}%` }} />
                    </div>
                    <div className="mt-0.5 text-[11px] capitalize text-mist-400">{r.band}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-mist-400">Nobody else has heard. Take your time, but not too much.</div>
          )}
        </div>
      </div>
    </motion.section>
  );
}

function EndedRow({ h }: { h: HuntView }) {
  const { navigate } = useGame();
  const s = STATUS[h.status];
  return (
    <li className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2.5 text-sm last:border-0">
      <span className={`chip ${s.className}`}>{s.label}</span>
      <PosBadge pos={h.position} />
      {h.player ? (
        <>
          <button className="font-semibold hover:underline" onClick={() => navigate({ screen: 'player', id: h.player!.id })}>
            {h.player.name}
          </button>
          <span className="flex items-center gap-1.5 text-mist-400">
            <Crest club={h.player.club} size={14} /> <ClubLink club={h.player.club} />
          </span>
        </>
      ) : (
        <span className="text-mist-400">
          {cap(aYearOld(h.age))} in {h.area.country.name}
        </span>
      )}
      <span className="ml-auto text-[12px] text-mist-400">{h.winner ? `${h.winner} got there first` : formatDate(h.clues[0]?.date ?? h.startedOn)}</span>
    </li>
  );
}
