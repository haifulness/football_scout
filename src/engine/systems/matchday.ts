import type { PlayerId } from '../core/ids';
import { ON_THE_PITCH, revealTrait, type TraitId } from './character';
import { Rng, clamp } from '../core/rng';
import { POSITION_GROUP, type AttributeKey, type Player } from '../model/player';
import type { Fixture, PlayerMatchLine } from '../model/season';
import type { GameState } from '../model/world-state';
import { attributeLevel, knowledgeLevel, learn, learnAttribute, marketOf } from './knowledge';
import { ScoutingError } from './scouting';

/**
 * Attending a match in person: a play-by-play of key moments written from the real
 * match (the result comes from the normal match sim, so attending never changes it).
 * Up to three players you focus on reveal specific attributes through what they do.
 */

export const MAX_FOCUS = 3;
const FLAVOUR_EVENTS = 34;
/** Share of the flavour moments that involve the players you are watching closely. */
const FOCUS_SHARE = 0.5;

type Group = 'GK' | 'DEF' | 'MID' | 'ATT';

interface Action {
  attr: AttributeKey;
  groups: Group[];
  good: string[];
  bad: string[];
  /** Only late in the game. */
  late?: boolean;
}

const OUTFIELD: Group[] = ['DEF', 'MID', 'ATT'];
const ACTIONS: Action[] = [
  {
    attr: 'dribbling',
    groups: ['MID', 'ATT'],
    good: ['{p} skips past two challenges down the {side}.', '{p} beats his man with a drop of the shoulder.'],
    bad: ['{p} tries to take on his man and runs it out of play.', '{p} dribbles straight into trouble.'],
  },
  {
    attr: 'pace',
    groups: OUTFIELD,
    good: ['{p} burns his marker for pace.', '{p} gets in behind with a blistering run.'],
    bad: ['{p} is caught from behind. Not the quickest.', '{p} loses the foot race.'],
  },
  {
    attr: 'passing',
    groups: OUTFIELD,
    good: ['{p} threads a pass between the lines.', '{p} switches play with a perfect long ball.'],
    bad: ['{p} gives the ball away cheaply in midfield.', 'A loose pass from {p} invites pressure.'],
  },
  {
    attr: 'vision',
    groups: ['MID', 'ATT'],
    good: ['{p} spots a run nobody else saw and finds it.', '{p} picks out a teammate with a clever reverse pass.'],
    bad: ['{p} takes the safe option when a killer ball was on.', '{p} never looks up, and the overlap goes unused.'],
  },
  {
    attr: 'firstTouch',
    groups: OUTFIELD,
    good: ['{p} kills a long ball dead with one touch.', 'Lovely first touch from {p} to set himself.'],
    bad: ['Heavy touch from {p}, and the chance is gone.', 'The ball bounces off {p}.'],
  },
  {
    attr: 'finishing',
    groups: ['ATT', 'MID'],
    good: ['{p} forces a sharp save with a crisp low shot.', '{p} hits the inside of the post.'],
    bad: ['{p} snatches at it and blazes over.', '{p} scuffs a great chance wide.'],
  },
  {
    attr: 'longShots',
    groups: ['MID', 'ATT'],
    good: ['{p} lets fly from 25 yards, just wide of the post.', '{p} tests the keeper from distance.'],
    bad: ['{p} tries his luck from distance. Row Z.', 'A wild long-range effort from {p}.'],
  },
  {
    attr: 'crossing',
    groups: ['DEF', 'MID', 'ATT'],
    good: ['{p} whips in a dangerous cross from the {side}.', 'Inviting delivery from {p}.'],
    bad: ["{p}'s cross sails over everyone.", '{p} hits the first defender with his cross.'],
  },
  {
    attr: 'heading',
    groups: ['DEF', 'ATT'],
    good: ['{p} rises highest and heads it clear.', '{p} glances a header goalwards.'],
    bad: ['{p} misjudges the flight of a high ball.', '{p} gets nothing on a header he should win.'],
  },
  {
    attr: 'tackling',
    groups: ['DEF', 'MID'],
    good: ['{p} times a sliding tackle perfectly.', 'Crunching, clean tackle from {p}.'],
    bad: ['{p} dives in and is easily beaten.', 'A clumsy challenge from {p} gives away a free kick.'],
  },
  {
    attr: 'marking',
    groups: ['DEF'],
    good: ['{p} sticks tight to his striker and gives him nothing.', '{p} tracks the runner all the way.'],
    bad: ['{p} loses his man at a corner.', '{p} lets his striker drift free.'],
  },
  {
    attr: 'positioning',
    groups: ['DEF', 'MID'],
    good: ['{p} is in exactly the right place to cut out the danger.', '{p} steps across to block the shot.'],
    bad: ['{p} is caught out of position on the break.', '{p} drifts too far forward and leaves a gap.'],
  },
  {
    attr: 'anticipation',
    groups: OUTFIELD,
    good: ['{p} reads the pass and intercepts.', '{p} senses the loose ball before anyone.'],
    bad: ['{p} is a step behind the play.', '{p} is slow to react to a second ball.'],
  },
  {
    attr: 'offTheBall',
    groups: ['ATT', 'MID'],
    good: ['{p} drifts into space and demands the ball.', 'Clever movement from {p} drags a defender away.'],
    bad: ['{p} stands still, waiting for the ball.', '{p} keeps running offside.'],
  },
  {
    attr: 'composure',
    groups: OUTFIELD,
    good: ['Under pressure, {p} stays calm and plays out.', '{p} takes his time and makes the right choice.'],
    bad: ['{p} panics under pressure and hoofs it.', '{p} rushes it with time to spare.'],
  },
  {
    attr: 'decisions',
    groups: OUTFIELD,
    good: ['{p} picks the right option on the break.', '{p} slows it down at the right moment.'],
    bad: ['{p} shoots when a teammate was free.', '{p} picks the wrong pass on a three-on-two.'],
  },
  {
    attr: 'workRate',
    groups: OUTFIELD,
    good: ['{p} chases back fifty yards to win it back.', '{p} never stops pressing.'],
    bad: ['{p} jogs back while his team defends.', '{p} gives up on a lost cause.'],
  },
  {
    attr: 'stamina',
    groups: OUTFIELD,
    late: true,
    good: ['{p} is still bombing forward late in the game.', '{p} looks as fresh as at kick-off.'],
    bad: ['{p} is out on his feet.', '{p} is visibly tiring, hands on knees.'],
  },
  {
    attr: 'strength',
    groups: OUTFIELD,
    good: ['{p} holds off his man with ease.', '{p} shrugs off a heavy challenge.'],
    bad: ['{p} is bullied off the ball.', '{p} goes down too easily in a duel.'],
  },
  {
    attr: 'agility',
    groups: OUTFIELD,
    good: ['{p} twists and turns out of a tight spot.', 'Quick feet from {p} in the box.'],
    bad: ['{p} is turned too easily.', '{p} is wrong-footed and stumbles.'],
  },
  {
    attr: 'reflexes',
    groups: ['GK'],
    good: ['{p} makes a stunning reflex save.', 'Point-blank stop from {p}!'],
    bad: ['{p} is slow to react to a deflection.', '{p} is beaten at his near post, but it goes wide.'],
  },
  {
    attr: 'handling',
    groups: ['GK'],
    good: ['{p} gathers a fierce shot cleanly.', 'Safe hands from {p}.'],
    bad: ['{p} spills a routine catch.', '{p} fumbles, and it is scrambled away.'],
  },
  {
    attr: 'commandOfArea',
    groups: ['GK'],
    good: ['{p} comes and claims a dangerous corner.', '{p} organises his defence loudly.'],
    bad: ['{p} stays rooted on his line as the cross comes in.', '{p} flaps at a cross.'],
  },
  {
    attr: 'oneOnOnes',
    groups: ['GK'],
    good: ['{p} spreads himself and wins a one-on-one.', '{p} rushes out to smother the chance.'],
    bad: ['{p} goes down too early one-on-one, and the shot hits the bar.', '{p} hesitates as the striker bears down.'],
  },
  {
    attr: 'kicking',
    groups: ['GK'],
    good: ['{p} launches a counter with a long kick.', 'Pinpoint distribution from {p}.'],
    bad: ["{p}'s kick goes straight out.", '{p} kicks it to the opposition.'],
  },
];

export interface MatchEvent {
  minute: number;
  kind: 'info' | 'goal' | 'good' | 'bad';
  text: string;
  playerId?: PlayerId;
  /** Set when a focused player's moment told you about an attribute. */
  attribute?: AttributeKey;
  focus?: boolean;
  /** Score after a goal: [home, away]. */
  score?: [number, number];
}

export interface FocusOutcome {
  playerId: PlayerId;
  played: boolean;
  minutes: number;
  rating?: number;
  before: number;
  after: number;
  /** Attributes you saw up close, with how well you now know each (0–100). */
  seen: { attribute: AttributeKey; before: number; after: number }[];
  /** Something about his character the match showed you. */
  trait?: TraitId;
}

export interface AttendedMatch {
  fixtureId: string;
  homeGoals: number;
  awayGoals: number;
  events: MatchEvent[];
  focus: FocusOutcome[];
  /** Other players you got a look at. */
  others: number;
}

/** When a player was on the pitch: starters from kick-off, substitutes for their last minutes. */
const onPitchWindow = (l: PlayerMatchLine): [number, number] => (l.started ? [1, Math.max(1, l.minutes)] : [Math.max(1, 90 - l.minutes), 90]);

export function validateFocus(state: GameState, fixture: Fixture, focus: PlayerId[]): PlayerId[] {
  const ids = [...new Set(focus)];
  if (ids.length === 0) throw new ScoutingError('Pick at least one player to watch closely.');
  if (ids.length > MAX_FOCUS) throw new ScoutingError(`You can watch at most ${MAX_FOCUS} players closely.`);
  for (const id of ids) {
    const p = state.players[id];
    if (!p || (p.clubId !== fixture.homeId && p.clubId !== fixture.awayId)) throw new ScoutingError('You can only watch players from the two teams.');
  }
  return ids;
}

/** After the match: write the play-by-play and learn from it. */
export function writeAttendedMatch(state: GameState, fixture: Fixture, lines: PlayerMatchLine[], focus: PlayerId[]): AttendedMatch {
  const scout = state.scout!;
  const result = fixture.result!;
  const rng = Rng.derive(state.seed, `attend:${fixture.id}`);
  const name = (id: PlayerId) => {
    const p = state.players[id];
    return p ? `${p.firstName[0]}. ${p.lastName}` : 'a player';
  };
  const clubName = (id: string) => state.clubs[id as keyof typeof state.clubs]!.shortName;
  const focusSet = new Set(focus);
  const before = new Map(focus.map((id) => [id, knowledgeLevel(state, state.players[id]!)]));
  const seen = new Map<PlayerId, Map<AttributeKey, { before: number; after: number }>>();
  const eye = scout.skills.judgingAbility;
  const events: MatchEvent[] = [];
  const home = state.clubs[fixture.homeId]!;
  const away = state.clubs[fixture.awayId]!;

  events.push({ minute: 0, kind: 'info', text: `Kick-off: ${home.name} v ${away.name}. ${result.attendance.toLocaleString('en-US')} in the ground.` });

  // Goals, exactly as they happened.
  let h = 0;
  let a = 0;
  for (const g of [...result.goals].sort((x, y) => x.minute - y.minute)) {
    if (g.clubId === home.id) h++;
    else a++;
    const who = g.ownGoal || !g.scorerId ? 'An own goal' : name(g.scorerId);
    const assist = g.assistId ? `, set up by ${name(g.assistId)}` : '';
    const score = `${clubName(home.id)} ${h}–${a} ${clubName(away.id)}`;
    events.push({
      minute: g.minute,
      kind: 'goal',
      text: `GOAL! ${who}${assist}. ${score}.`,
      playerId: g.scorerId,
      focus: !!g.scorerId && focusSet.has(g.scorerId),
      score: [h, a],
    });
    if (g.scorerId && focusSet.has(g.scorerId)) see(g.scorerId, 'finishing', 12);
    if (g.assistId && focusSet.has(g.assistId)) see(g.assistId, 'passing', 10);
  }

  // Flavour moments: half of them on the players you came to watch.
  const onPitch = lines.filter((l) => l.minutes > 0 && state.players[l.playerId]);
  const focusLines = onPitch.filter((l) => focusSet.has(l.playerId));
  for (let i = 0; i < FLAVOUR_EVENTS; i++) {
    const pool = focusLines.length && rng.chance(FOCUS_SHARE) ? focusLines : onPitch;
    if (!pool.length) break;
    const line = rng.pick(pool);
    const p = state.players[line.playerId]!;
    const group = POSITION_GROUP[line.position];
    const [from, to] = onPitchWindow(line);
    const minute = rng.int(from, to);
    const actions = ACTIONS.filter((x) => x.groups.includes(group) && (!x.late || minute >= 65));
    if (!actions.length) continue;
    const act = rng.pick(actions);
    const good = p.attributes[act.attr] + rng.gaussian(0, 3.5) >= 11;
    const text = rng
      .pick(good ? act.good : act.bad)
      .replace('{p}', name(p.id))
      .replace('{side}', rng.pick(['left', 'right']));
    const focused = focusSet.has(p.id);
    events.push({ minute, kind: good ? 'good' : 'bad', text, playerId: p.id, attribute: focused ? act.attr : undefined, focus: focused });
    if (focused) see(p.id, act.attr, 8 + eye * 0.7);
    else learnAttribute(state, p, act.attr, 3, 55, state.date);
  }

  events.push({ minute: 45, kind: 'info', text: 'Half-time.' });
  // Stoppage-time goals can come after 90: the whistle goes after the last one.
  events.push({
    minute: Math.max(90, ...result.goals.map((g) => g.minute)),
    kind: 'info',
    text: `Full-time: ${home.name} ${result.homeGoals}–${result.awayGoals} ${away.name}.`,
  });
  events.sort((x, y) => x.minute - y.minute || (x.kind === 'info' ? 1 : 0) - (y.kind === 'info' ? 1 : 0));

  // Overall impressions: much more than a normal live watch for the players you focused on.
  const focusOut: FocusOutcome[] = focus.map((id) => {
    const p = state.players[id]!;
    const line = lines.find((l) => l.playerId === id);
    learn(state, p, line ? Math.round(26 + eye * 0.8) : 6, line ? 100 : 60, state.date);
    const trait = line ? revealTrait(state, p, 0.55, `attend:${fixture.id}`, ON_THE_PITCH) : undefined;
    return {
      trait,
      playerId: id,
      played: !!line,
      minutes: line?.minutes ?? 0,
      rating: line?.rating,
      before: before.get(id)!,
      after: knowledgeLevel(state, p),
      seen: [...(seen.get(id) ?? new Map()).entries()].map(([attribute, v]) => ({ attribute, ...v })),
    };
  });
  let others = 0;
  for (const l of onPitch) {
    if (focusSet.has(l.playerId)) continue;
    learn(state, state.players[l.playerId]!, 6, 70, state.date);
    others++;
  }
  const first = state.players[focus[0]!];
  if (first) scout.regionKnowledge[marketOf(state, first)] = clamp((scout.regionKnowledge[marketOf(state, first)] ?? 0) + 1, 0, 100);
  return { fixtureId: fixture.id, homeGoals: result.homeGoals, awayGoals: result.awayGoals, events, focus: focusOut, others };

  function see(id: PlayerId, k: AttributeKey, gain: number) {
    const p: Player = state.players[id]!;
    const m = seen.get(id) ?? new Map<AttributeKey, { before: number; after: number }>();
    seen.set(id, m);
    const was = m.get(k)?.before ?? attributeLevel(state, p, k);
    learnAttribute(state, p, k, gain, 100, state.date);
    m.set(k, { before: was, after: attributeLevel(state, p, k) });
  }
}
