import { describe, expect, it } from 'vitest';
import type { CountryId, PlayerId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';
import { attributeLevel, attributeRanges, knowledgeLevel, learn, learnAttribute } from '../../src/engine/systems/knowledge';
import { nextLiveOption } from '../../src/engine/systems/fieldwork';
import { advanceDays } from '../../src/engine/tick';

const eng = 'eng' as CountryId;

const stateOf = (e: Engine) => (e as unknown as { state: GameState }).state;

/** A world in the season, a scout with money, and a player whose next match is coming up (scout at the venue). */
async function setup(seed = 4321) {
  const e = new Engine();
  e.generate(seed);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'easy' });
  const s = stateOf(e);
  advanceDays(s, 45); // into the season
  s.scout!.money = usd(100_000);
  const p = Object.values(s.players).find((x) => x.clubId && s.clubs[x.clubId]!.countryId === eng && nextLiveOption(s, x) && x.naturalPosition !== 'GK')!;
  const opt = nextLiveOption(s, p)!;
  s.scout!.location = opt.venue;
  return { e, s, p, opt };
}

describe('attending a match', () => {
  it('writes a play-by-play of the real match and teaches far more about the players you watch closely', async () => {
    const { e, s, p, opt } = await setup();
    const money = s.scout!.money;
    const before = knowledgeLevel(s, p);
    const { match } = e.attendMatch(p.id, [p.id]);
    const fixture = s.fixtures[opt.fixture.leagueId]!.find((f) => f.id === opt.fixture.id)!;
    expect(s.date).toBe(opt.fixture.date);
    expect(s.scout!.money).toBeLessThanOrEqual(money - opt.ticket); // plus any hotel nights while waiting
    expect(s.ledger.some((l) => l.kind === 'ticket' && l.amount === -opt.ticket)).toBe(true);
    expect(match.homeGoals).toBe(fixture.result!.homeGoals);
    expect(match.awayGoals).toBe(fixture.result!.awayGoals);
    expect(match.events.filter((x) => x.kind === 'goal')).toHaveLength(fixture.result!.goals.length);
    expect(match.events[0]!.text).toMatch(/Kick-off/);
    expect(match.events.at(-1)!.text).toMatch(/Full-time/);
    const out = match.focus[0]!;
    if (out.played) {
      expect(out.after).toBeGreaterThan(before);
      expect(out.seen.length).toBeGreaterThan(0);
      // Attributes you watched up close are known better than the rest.
      for (const x of out.seen) expect(attributeLevel(s, p, x.attribute as never)).toBeGreaterThanOrEqual(knowledgeLevel(s, p));
      expect(match.events.some((x) => x.focus && x.playerId === p.id)).toBe(true);
    }
    expect(match.others).toBeGreaterThan(10);
  }, 120_000);

  it('never changes the result: the same world plays out the same with or without you there', async () => {
    const a = await setup(777);
    const b = await setup(777);
    a.e.attendMatch(a.p.id, [a.p.id]);
    advanceDays(b.s, b.opt.daysAway);
    const ra = a.s.fixtures[a.opt.fixture.leagueId]!.find((f) => f.id === a.opt.fixture.id)!.result;
    const rb = b.s.fixtures[b.opt.fixture.leagueId]!.find((f) => f.id === b.opt.fixture.id)!.result;
    expect(ra).toEqual(rb);
  }, 180_000);

  it('lets you watch up to three players closely, from the two teams only', async () => {
    const { e, s, p, opt } = await setup();
    const own = s.clubs[p.clubId!]!.squad.filter((id) => id !== p.id) as PlayerId[];
    expect(() => e.attendMatch(p.id, [p.id, ...own.slice(0, 3)])).toThrow(/at most 3/);
    const stranger = Object.values(s.players).find((x) => x.clubId && x.clubId !== opt.fixture.homeId && x.clubId !== opt.fixture.awayId)!;
    expect(() => e.attendMatch(p.id, [stranger.id])).toThrow(/two teams/);
    expect(s.scout!.money).toBe(usd(100_000)); // nothing charged for a refused visit
  }, 120_000);

  it('keeps what you saw of single attributes when overall knowledge changes, and narrows just those ranges', async () => {
    const { s, p } = await setup();
    const wide = attributeRanges(s, p).passing;
    learnAttribute(s, p, 'passing', 60, 100, s.date);
    learn(s, p, 5, 100, s.date);
    const narrow = attributeRanges(s, p).passing;
    expect(narrow[1] - narrow[0]).toBeLessThan(wide[1] - wide[0]);
    expect(s.knowledge[p.id]!.attrs?.passing).toBeGreaterThan(knowledgeLevel(s, p));
  }, 120_000);
});
