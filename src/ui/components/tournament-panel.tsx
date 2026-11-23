import { formatDate } from '../../engine/core/calendar';
import type { TournamentPlayerView, TournamentView } from '../../engine/views';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';
import { Panel } from './ui';

/** The summer's international tournament: groups, knockouts, your players, and who shone. */
export function TournamentPanel() {
  const t = useEngineQuery(() => engine.getTournament(), []);
  if (!t) return null;
  return (
    <Panel
      title={t.name}
      right={
        <span className="text-[11px] text-mist-400">
          {t.host} · {formatDate(t.start)} – {formatDate(t.end)}
        </span>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <Status t={t} />
        {t.yours.length > 0 && <Players title="Your players in the squads" players={t.yours} />}
        {t.standouts.length > 0 && <Players title="Who shone (now famous, and pricier)" players={t.standouts} />}
        {t.status !== 'upcoming' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {t.groups.map((g) => (
              <div key={g.name} className="rounded-lg border border-white/[0.06] p-2">
                <div className="panel-title mb-1 text-[11px]">{g.name}</div>
                <table className="w-full text-[12px]">
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.country} className={r.through ? 'text-mist-100' : 'text-mist-300'}>
                        <td className="truncate py-0.5">
                          {r.through && <span className="mr-1 text-good-400">●</span>}
                          {r.country}
                        </td>
                        <td className="num w-6 text-right text-mist-400">{r.played}</td>
                        <td className="num w-8 text-right text-mist-400">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                        <td className="num w-6 text-right font-semibold">{r.pts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
        {t.knockout.length > 0 && (
          <div className="flex flex-col gap-2">
            {t.knockout.map((r) => (
              <div key={r.round}>
                <div className="panel-title mb-1 text-[11px]">{r.round}</div>
                <div className="flex flex-wrap gap-1.5">
                  {r.matches.map((m, i) => (
                    <span key={i} className="chip text-[12px]">
                      <span className={m.winner === m.home ? 'font-semibold text-mist-50' : 'text-mist-300'}>{m.home}</span>
                      <span className="num mx-1.5 text-mist-200">{m.score ?? 'v'}</span>
                      <span className={m.winner === m.away ? 'font-semibold text-mist-50' : 'text-mist-300'}>{m.away}</span>
                      {m.penalties && <span className="ml-1 text-mist-400">(pens)</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

function Status({ t }: { t: TournamentView }) {
  const text =
    t.status === 'done'
      ? `${t.winner} are champions. Its stars are famous now: everyone knows them, and their prices have jumped.`
      : t.status === 'on'
        ? `Under way in ${t.host}. Players who shine here will cost far more by August.`
        : t.status === 'squads'
          ? `Squads are named. The group stage opens in ${t.city} on ${formatDate(t.start)}: a scouting event where you can see many of them at once.`
          : `Squads are named on ${formatDate(t.squadsOn)}. The best time to scout its players is now, before they become famous.`;
  return <p className="text-sm text-mist-300">{text}</p>;
}

function Players({ title, players }: { title: string; players: TournamentPlayerView[] }) {
  const navigate = useGame((s) => s.navigate);
  return (
    <div>
      <div className="panel-title mb-1 text-[11px]">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {players.map((p) => (
          <button key={p.id} className="chip text-[12px] hover:border-white/25" onClick={() => navigate({ screen: 'player', id: p.id })}>
            {p.yours === 'placed' && <span className="text-good-300">★</span>}
            <span className="font-semibold text-mist-100">{p.name}</span>
            <span className="text-mist-400">{p.country}</span>
            {p.apps > 0 && (
              <span className="num text-mist-300">
                {p.apps} apps · {p.goals} g{p.avg !== undefined ? ` · ${p.avg.toFixed(1)}` : ''}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
