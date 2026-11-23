import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { Player } from '../../src/engine/model/player';
import type { GameState } from '../../src/engine/model/world-state';
import { signOffProbability } from '../../src/engine/systems/deals';
import { discussMission } from '../../src/engine/systems/missions';
import { STYLES, STYLE_INFO, adoptCoachStyle, coachStyle, styleAttrs, styleFit, styleOf } from '../../src/engine/systems/styles';

const eng = 'eng' as CountryId;

function career(): GameState {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'normal' });
  return (e as unknown as { state: GameState }).state;
}

const w = career();
const clubs = Object.values(w.clubs);

describe('club styles', () => {
  it('every club has a stable style, and all six turn up', () => {
    const seen = new Set(clubs.map((c) => styleOf(w, c)));
    expect([...seen].sort()).toEqual([...STYLES].sort());
    const c = clubs[0]!;
    expect(styleOf(w, { ...c })).toBe(styleOf(w, c));
  });

  it('a player strong in the style’s attributes fits; the same man weak in them clashes, and the coach notices', () => {
    const club = clubs.find((c) => c.countryId === eng && c.tier === 3 && styleOf(w, c) !== 'defensive')!;
    const st = styleOf(w, club);
    const base = w.players[club.squad.find((id) => w.players[id]!.naturalPosition === 'ST' || w.players[id]!.naturalPosition === 'CM')!]!;
    const pos = base.naturalPosition;
    const set = (v: number): Player => ({ ...base, id: 'probe' as Player['id'], attributes: { ...base.attributes, ...Object.fromEntries(styleAttrs(st, pos).map((a) => [a, v])) } });
    const strong = set(18);
    const weak = set(4);
    expect(styleFit(w, strong, club, pos)).toBeGreaterThan(0.25);
    expect(styleFit(w, weak, club, pos)).toBeLessThan(-0.25);
    const coach = w.officials[club.headCoachId]!;
    expect(signOffProbability(w, coach, strong, club, pos, usd(0))).toBeGreaterThan(signOffProbability(w, coach, weak, club, pos, usd(0)));
  });

  it('goalkeepers are judged on goalkeeping alone', () => {
    const club = clubs[0]!;
    const gk = Object.values(w.players).find((p) => p.naturalPosition === 'GK')!;
    expect(styleFit(w, gk, club, 'GK')).toBe(0);
  });

  it('a brief from the club asks for one of the style’s attributes', () => {
    const club = clubs.find((c) => c.countryId === eng && c.tier === 3)!;
    const pos = 'CM' as const;
    const m = { id: 900, clubId: club.id, position: pos, requirements: { minOvr: 50 }, brief: '', postedOn: w.date, acceptBy: w.date, weeks: 6, reward: usd(1), status: 'offered' } as never;
    w.missions.push(m);
    const prefs = discussMission(w, 900);
    expect(prefs.keyAttributes.some((k) => styleAttrs(styleOf(w, club), pos).includes(k.attribute))).toBe(true);
  });

  it('a new coach often brings his own style, and the change is stored on the club', () => {
    let changed = 0;
    let tried = 0;
    for (const club of clubs.slice(0, 200)) {
      const coach = Object.values(w.officials).find((o) => coachStyle(w, o) !== styleOf(w, club))!;
      const copy = { ...club, style: undefined };
      tried++;
      if (adoptCoachStyle(w, copy, coach)) {
        changed++;
        expect(copy.style).toBe(coachStyle(w, coach));
      }
    }
    expect(changed / tried).toBeGreaterThan(0.4);
    expect(changed / tried).toBeLessThan(0.8);
    expect(STYLE_INFO.pressing.attrs.length).toBe(4);
  });
});
