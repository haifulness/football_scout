import { useMemo, useState, type ReactNode } from 'react';
import { formatUSD } from '../../engine/core/money';
import type { PlayerRow } from '../../engine/views';
import { Crest } from '../visuals/crest';
import { ClubLink } from './club-link';
import { Portrait } from '../visuals/portrait';
import { useGame } from '../store/game-store';
import { KnowledgeMeter, OvrBadge, PosBadge, ratingColor, useCultureLookup } from './ui';

type Row = PlayerRow & { ask?: number; wageFits?: boolean };
type Key = 'name' | 'age' | 'ovr' | 'potential' | 'value' | 'wage' | 'ask' | 'knowledge' | 'seen';
const SORT: Record<Key, (p: Row) => number | string> = {
  name: (p) => p.name,
  age: (p) => p.age,
  ovr: (p) => p.ovr,
  potential: (p) => (p.potential ? (p.potential[0] + p.potential[1]) / 2 : -1),
  value: (p) => p.value,
  wage: (p) => p.wage || (p.expectedWage ?? 0),
  ask: (p) => p.ask ?? Infinity,
  knowledge: (p) => p.knowledge,
  // Oldest read first when sorted descending; public-only players last.
  seen: (p) => (p.freshness === 'stale' && p.staleReason ? 10_000 : (p.seenMonthsAgo ?? -1)),
};

/** How current your read is: nothing when fresh, an amber or red tag when ageing or stale. */
export function FreshnessTag({ p }: { p: Pick<PlayerRow, 'freshness' | 'seenMonthsAgo' | 'staleReason'> }) {
  if (p.freshness !== 'ageing' && p.freshness !== 'stale') return null;
  const months = p.seenMonthsAgo ?? 0;
  const text = p.staleReason ? 'out of date' : `${months} mo`;
  return (
    <span
      className={`rounded border px-1 text-[10px] font-semibold ${p.freshness === 'stale' ? 'border-alert-500/40 text-alert-400' : 'border-flood-400/40 text-flood-300'}`}
      title={p.staleReason ? `Your read is out of date: ${p.staleReason}` : `You last looked at him ${months} months ago: he may have changed`}
    >
      {text}
    </span>
  );
}

/** Scouting list: fogged ratings, potential once revealed, and how well you know each player. */
/** `askFor`: the club a search was made for; adds the wage each player would ask it (red when its wage budget has no room). */
export function PlayerTable<T extends Row>({
  rows,
  showClub,
  actions,
  askFor,
}: {
  rows: T[];
  showClub?: boolean;
  actions?: (p: T) => ReactNode;
  askFor?: string;
}) {
  const navigate = useGame((s) => s.navigate);
  const cultureOf = useCultureLookup();
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 } | undefined>();
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const get = SORT[sort.key];
    return [...rows].sort((a, b) => (get(a) > get(b) ? 1 : get(a) < get(b) ? -1 : 0) * sort.dir);
  }, [rows, sort]);

  const Th = ({ k, children, right, pad, className = '' }: { k: Key; children: string; right?: boolean; pad?: boolean; className?: string }) => (
    <th
      className={`cursor-pointer select-none py-2 font-medium hover:text-mist-100 ${right ? 'text-right' : ''} ${pad ? 'pl-4' : ''} ${className}`}
      onClick={() => setSort((s) => ({ key: k, dir: s?.key === k ? (-s.dir as 1 | -1) : k === 'name' ? 1 : -1 }))}
    >
      {children}
      {sort?.key === k && <span className="ml-1 text-grass-400">{sort.dir === 1 ? '▲' : '▼'}</span>}
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-mist-400">
            <th className="w-4 pl-4" />
            <Th k="name">Player</Th>
            <th className="font-medium">Pos</th>
            <Th k="age" right>
              Age
            </Th>
            {showClub && <th className="pl-4 font-medium">Club</th>}
            <Th k="ovr" right>
              Rating
            </Th>
            {askFor && (
              <Th k="ask" right>
                Asks
              </Th>
            )}
            <Th k="potential" right>
              Potential
            </Th>
            <Th k="value" right>
              Value
            </Th>
            <Th k="wage" right>
              Wage
            </Th>
            <Th k="knowledge" pad className="hidden 2xl:table-cell">
              Knowledge
            </Th>
            <Th k="seen" right className="hidden xl:table-cell">
              Seen
            </Th>
            {actions && <th className="pr-4" />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id} className="data-row" onClick={() => navigate({ screen: 'player', id: p.id })}>
              <td className="pl-4" />
              <td className="py-1.5">
                <span className="flex items-center gap-2.5">
                  <Portrait
                    seed={p.portraitSeed}
                    culture={cultureOf(p.nationality.id)}
                    size={28}
                    age={p.age}
                    shirt={p.club?.colors.primary}
                    trim={p.club?.colors.secondary}
                    className="rounded"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {p.name}
                      {p.prodigy && (
                        <span className="ml-1.5 text-flood-400" title="Prodigy">
                          ★
                        </span>
                      )}
                    </span>
                    {p.openDeal ? (
                      <span className={`block truncate text-[11px] font-semibold ${p.openDeal.stage === 'agreed' ? 'text-grass-300' : 'text-sky-300'}`}>
                        {p.openDeal.stage === 'agreed' ? 'Agreed' : 'Deal in progress'}: {p.openDeal.club}
                      </span>
                    ) : (
                      <span className="block text-[11px] text-mist-400">{p.nationality.name}</span>
                    )}
                  </span>
                </span>
              </td>
              <td>
                <PosBadge pos={p.position} />
              </td>
              <td className="num text-right">{p.age}</td>
              {showClub && (
                <td className="pl-4">
                  {p.club ? (
                    <span className="flex items-center gap-1.5 text-mist-300">
                      <Crest club={p.club} size={16} />
                      <ClubLink club={p.club} className="max-w-[140px]" />
                    </span>
                  ) : (
                    <span className="text-grass-300">Free agent</span>
                  )}
                </td>
              )}
              <td className="text-right">
                {/* Your estimate (what the rating filter goes by), with the range it comes from. */}
                <span className="inline-flex items-center justify-end gap-1.5" title={`Your estimate ${p.ovr} (range ${p.ovrRange[0]}–${p.ovrRange[1]})`}>
                  <span className="num font-bold" style={{ color: ratingColor(p.ovr) }}>
                    {p.ovr}
                  </span>
                  <OvrBadge ovr={p.ovr} range={p.ovrRange} size="sm" />
                  <FreshnessTag p={p} />
                </span>
              </td>
              {askFor && (
                <td
                  className={`num text-right font-semibold ${p.ask === undefined ? 'text-mist-400/60' : p.wageFits ? 'text-grass-300' : 'text-alert-400'}`}
                  title={
                    p.ask === undefined
                      ? `Already at ${askFor}`
                      : p.wageFits
                        ? `What he'd ask ${askFor}. Fits their wage budget.`
                        : `What he'd ask ${askFor}. Their wage budget has no room for it.`
                  }
                >
                  {p.ask === undefined ? '–' : `${formatUSD(p.ask)}/wk`}
                </td>
              )}
              <td className="num text-right text-mist-300">
                {p.potential ? (
                  p.potential[0] === p.potential[1] ? (
                    p.potential[0]
                  ) : (
                    `${p.potential[0]}–${p.potential[1]}`
                  )
                ) : (
                  <span className="text-mist-400/60">?</span>
                )}
              </td>
              <td className="num text-right">{formatUSD(p.value)}</td>
              <td className="num text-right text-mist-300">
                {p.wage ? (
                  `${formatUSD(p.wage)}/wk`
                ) : p.expectedWage ? (
                  <span className="text-mist-400" title="Free agent: the wage he expects for his level">
                    ≈{formatUSD(p.expectedWage)}/wk
                  </span>
                ) : (
                  <span className="text-mist-400/60">–</span>
                )}
              </td>
              <td className="hidden pl-4 2xl:table-cell">
                <KnowledgeMeter level={p.knowledge} compact />
              </td>
              <td className="num hidden text-right text-[12px] text-mist-400 xl:table-cell" title="When you last looked at him yourself">
                {p.seenMonthsAgo === undefined ? '–' : p.seenMonthsAgo === 0 ? 'this month' : `${p.seenMonthsAgo} mo ago`}
              </td>
              {actions && (
                <td className="pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                  {actions(p)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
