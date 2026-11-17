import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { formatDate } from '../../engine/core/calendar';
import type { ClubId } from '../../engine/core/ids';
import type { FixtureView, TableRowView } from '../../engine/views';
import { Crest } from '../visuals/crest';
import { useGame } from '../store/game-store';

const FORM_COLOR = { W: '#2fcf73', D: '#8aa2ad', L: '#ef4444' } as const;

export function FormPills({ form }: { form: ('W' | 'D' | 'L')[] }) {
  return (
    <span className="inline-flex gap-0.5">
      {form.map((r, i) => (
        <span
          key={i}
          className="num inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] font-bold text-night-950"
          style={{ background: FORM_COLOR[r] }}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

/** One fixture: score (or date), expandable to scorers. `focus` highlights a club's perspective. */
export function FixtureRow({ f, focus }: { f: FixtureView; focus?: ClubId }) {
  const [open, setOpen] = useState(false);
  const navigate = useGame((s) => s.navigate);
  const r = f.result;
  let outcome: 'W' | 'D' | 'L' | undefined;
  if (r && focus) {
    const mine = focus === f.home.id ? r.homeGoals : r.awayGoals;
    const theirs = focus === f.home.id ? r.awayGoals : r.homeGoals;
    outcome = mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
  }
  const Team = ({ side }: { side: 'home' | 'away' }) => {
    const club = f[side];
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigate({ screen: 'club', id: club.id });
        }}
        className={`flex min-w-0 flex-1 items-center gap-2 hover:text-grass-300 ${side === 'home' ? 'flex-row-reverse text-right' : ''} ${club.id === focus ? 'font-bold' : ''}`}
      >
        <Crest club={club} size={18} />
        <span className="truncate">{club.name}</span>
      </button>
    );
  };
  return (
    <div className="border-b border-white/[0.04] last:border-0">
      <div onClick={() => r && setOpen((o) => !o)} className={`flex items-center gap-3 px-4 py-2 text-sm ${r ? 'cursor-pointer hover:bg-white/[0.03]' : ''}`}>
        {outcome && <span className="h-6 w-1 rounded-full" style={{ background: FORM_COLOR[outcome] }} />}
        <Team side="home" />
        <span className={`num w-16 shrink-0 rounded-md py-0.5 text-center ${r ? 'bg-white/[0.06] text-lg font-bold' : 'text-[11px] text-mist-400'}`}>
          {r ? `${r.homeGoals} – ${r.awayGoals}` : formatDate(f.date).replace(/, \d{4}$/, '')}
        </span>
        <Team side="away" />
      </div>
      <AnimatePresence>
        {open && r && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="grid grid-cols-2 gap-6 bg-black/20 px-6 py-3 text-xs">
              {(['home', 'away'] as const).map((side) => (
                <ul key={side} className={`space-y-1 ${side === 'home' ? 'text-right' : ''}`}>
                  {r.goals
                    .filter((g) => g.clubId === f[side].id)
                    .map((g, i) => (
                      <li key={i} className="text-mist-300">
                        <span className="text-mist-100">⚽ {g.name}</span>{' '}
                        <span className="num text-mist-400">{g.minute > 90 ? `90+${g.minute - 90}` : g.minute}′</span>
                        {g.assist && <span className="block text-[10px] text-mist-400">assist {g.assist}</span>}
                      </li>
                    ))}
                </ul>
              ))}
              <div className="col-span-2 flex justify-between border-t border-white/5 pt-2 text-[11px] text-mist-400">
                <span>Attendance {r.attendance.toLocaleString('en-US')}</span>
                {r.motm && (
                  <span>
                    Player of the match: <b className="text-flood-300">{r.motm}</b>
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function LeagueTable({
  rows,
  promotionSpots,
  hasPromotion,
  hasRelegation,
  highlight,
  compact,
}: {
  rows: TableRowView[];
  promotionSpots: number;
  hasPromotion: boolean;
  hasRelegation: boolean;
  highlight?: ClubId;
  compact?: boolean;
}) {
  const navigate = useGame((s) => s.navigate);
  const zone = (pos: number) =>
    pos === 1 ? '#ffc933' : hasPromotion && pos <= promotionSpots ? '#2fcf73' : hasRelegation && pos > rows.length - promotionSpots ? '#ef4444' : undefined;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-wider text-mist-400">
          <th className="w-10 py-2 pl-4 font-medium">#</th>
          <th className="font-medium">Club</th>
          <th className="num text-right font-medium">P</th>
          {!compact && (
            <>
              <th className="num text-right font-medium">W</th>
              <th className="num text-right font-medium">D</th>
              <th className="num text-right font-medium">L</th>
            </>
          )}
          <th className="num text-right font-medium">GD</th>
          <th className="num pr-3 text-right font-medium">Pts</th>
          {!compact && <th className="pr-4 font-medium">Form</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const z = zone(r.position);
          const gd = r.goalsFor - r.goalsAgainst;
          return (
            <motion.tr
              layout
              key={r.club.id}
              onClick={() => navigate({ screen: 'club', id: r.club.id })}
              className={`data-row ${r.club.id === highlight ? 'bg-grass-500/10' : ''}`}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <td className="num relative py-1.5 pl-4 text-mist-300">
                {z && <span className="absolute inset-y-1 left-0 w-[3px] rounded-full" style={{ background: z }} />}
                {r.position}
              </td>
              <td>
                <span className="flex items-center gap-2">
                  <Crest club={r.club} size={18} />
                  <span className="truncate font-medium">{r.club.name}</span>
                </span>
              </td>
              <td className="num text-right text-mist-300">{r.played}</td>
              {!compact && (
                <>
                  <td className="num text-right text-mist-300">{r.won}</td>
                  <td className="num text-right text-mist-300">{r.drawn}</td>
                  <td className="num text-right text-mist-300">{r.lost}</td>
                </>
              )}
              <td className={`num text-right ${gd > 0 ? 'text-grass-300' : gd < 0 ? 'text-alert-400' : 'text-mist-300'}`}>{gd > 0 ? `+${gd}` : gd}</td>
              <td className="num pr-3 text-right text-base font-bold">{r.points}</td>
              {!compact && (
                <td className="pr-4">
                  <FormPills form={r.form} />
                </td>
              )}
            </motion.tr>
          );
        })}
      </tbody>
    </table>
  );
}
