import type { ClubId } from '../../engine/core/ids';
import { useGame } from '../store/game-store';

/** A club name that opens the club's page. Safe inside clickable rows (stops the row's click). */
export function ClubLink({ club, className = '' }: { club: { id: string; name: string }; className?: string }) {
  const navigate = useGame((s) => s.navigate);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigate({ screen: 'club', id: club.id as ClubId });
      }}
      className={`truncate text-left hover:text-grass-300 hover:underline ${className}`}
      title={`Open ${club.name}`}
    >
      {club.name}
    </button>
  );
}
