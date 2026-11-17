import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { generateWorld } from '../../src/engine/generation/world-generator';
import { HQ } from '../../src/engine/model/agency';
import { foundAgency, openOffice, placeAssistant, staffCapacity } from '../../src/engine/systems/agency';
import { hireAssistant, refreshMarket } from '../../src/engine/systems/assistants';
import { createCareer } from '../../src/engine/systems/scouting';
import { addDays } from '../../src/engine/core/calendar';
import { advanceDays } from '../../src/engine/tick';

export interface AgencySeason {
  label: string;
  offices: number;
  staff: number;
  avgSkill: number;
  brokered: number;
  cuts: number;
  upkeep: number;
  wages: number;
  net: number;
}

/**
 * One season of an agency's books, with no scouting of your own: headquarters at home,
 * the given offices abroad, and the staff capacity filled with assistants placed two per base.
 * Shows whether offices pay for themselves (cuts against upkeep, rent and wages).
 */
export function runAgencySeason(seed: number, offices: CountryId[], staffPerBase = 2, minSkill = 0): AgencySeason {
  const w = generateWorld(seed);
  const eng = 'eng' as CountryId;
  createCareer(w, { name: 'Sim', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'normal' });
  w.scout!.reputation = 65;
  w.scout!.money = usd(2_000_000);
  foundAgency(w, { name: 'Sim Agency', logo: { colors: { primary: '#000', secondary: '#fff', accent: '#f00' }, crest: { shape: 'round', pattern: 'plain', emblem: 'star' } } });
  for (const c of offices) openOffice(w, c);
  const bases = [HQ, ...w.agency!.offices.map((o) => o.id)];
  const want = Math.min(staffCapacity(w), bases.length * staffPerBase);
  for (let day = 0; w.assistants.length < want && day < 4000; day += 30) {
    refreshMarket(w, addDays(w.date, day));
    for (const c of [...w.assistantMarket].sort((a, b) => b.skill - a.skill)) if (w.assistants.length < want && c.skill >= minSkill) hireAssistant(w, c.id);
  }
  w.assistants.forEach((a, i) => placeAssistant(w, a.id, bases[i % bases.length]!));
  const year = w.season.year;
  advanceDays(w, 365, undefined, { stopAtDeadline: false });
  const t = w.ledgerTotals[year] ?? {};
  const cuts = t['agency-cut'] ?? 0;
  const upkeep = t.agency ?? 0; // running costs: upkeep and rent (setup is separate)
  const wages = t.assistant ?? 0;
  return {
    label: `${offices.length ? `HQ + ${offices.join(', ')}` : 'HQ only'}${minSkill ? ` (staff ${minSkill}+)` : ''}`,
    offices: offices.length,
    staff: w.assistants.length,
    avgSkill: Math.round((w.assistants.reduce((n, a) => n + a.skill, 0) / Math.max(1, w.assistants.length)) * 10) / 10,
    brokered: w.agency!.brokered,
    cuts,
    upkeep,
    wages,
    net: cuts + upkeep + wages,
  };
}
