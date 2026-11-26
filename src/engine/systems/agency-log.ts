import type { AgencyLogEntry } from '../model/agency';
import type { GameState } from '../model/world-state';

const KEEP = 60;

/** Note something the agency's staff did (no-op without an agency). */
export function agencyLog(state: GameState, entry: Omit<AgencyLogEntry, 'date'>) {
  const agency = state.agency;
  if (!agency) return;
  agency.log = [{ date: state.date, ...entry }, ...(agency.log ?? [])].slice(0, KEEP);
}
