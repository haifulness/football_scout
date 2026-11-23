import { hashString } from '../core/rng';
import { clamp } from '../core/rng';
import type { Club, ClubOfficial } from '../model/club';
import type { AttributeKey, Player, Position } from '../model/player';
import type { GameState } from '../model/world-state';
import { POSITION_WEIGHTS } from './ratings';

/**
 * How a club plays. The board decides the money (presidents' policies: youth, homegrown, win now, sell); the style
 * decides what kind of footballer the coach wants. A pressing side wants runners, a possession side wants passers.
 * Briefs ask for the style's attributes, and a player who fits it pleases the coach. Every coach has his own style;
 * a new one often brings it with him.
 */

export const STYLES = ['pressing', 'possession', 'direct', 'counter', 'defensive', 'flair'] as const;
export type ClubStyle = (typeof STYLES)[number];

export const STYLE_INFO: Record<ClubStyle, { label: string; blurb: string; attrs: AttributeKey[] }> = {
  pressing: { label: 'High press', blurb: 'Win it back high up the pitch: they want runners who never stop.', attrs: ['workRate', 'stamina', 'pace', 'anticipation'] },
  possession: { label: 'Possession', blurb: 'Keep the ball and pass teams to death: they want calm, clever passers.', attrs: ['passing', 'firstTouch', 'technique', 'vision'] },
  direct: { label: 'Direct', blurb: 'Get it forward early and win the second ball: they want strength in the air.', attrs: ['strength', 'heading', 'jumping', 'stamina'] },
  counter: { label: 'Counter-attack', blurb: 'Sit, then break at speed: they want pace and a cutting edge.', attrs: ['pace', 'acceleration', 'offTheBall', 'finishing'] },
  defensive: { label: 'Low block', blurb: 'Hard to beat first: they want organised, disciplined defending.', attrs: ['positioning', 'marking', 'tackling', 'decisions'] },
  flair: { label: 'Flair', blurb: 'Entertain the crowd: they want players who beat a man.', attrs: ['dribbling', 'technique', 'agility', 'composure'] },
};

/** Countries lean towards some styles (by name culture). */
const CULTURE_LEAN: Partial<Record<string, ClubStyle[]>> = {
  english: ['direct', 'pressing'],
  german: ['pressing', 'counter'],
  spanish: ['possession', 'flair'],
  italian: ['defensive', 'counter'],
  portuguese: ['flair', 'possession'],
  nordic: ['direct', 'defensive'],
};

const pick = (key: string, lean?: ClubStyle[]): ClubStyle => {
  const r = hashString(key) / 4294967296;
  if (lean && r < 0.5) return lean[Math.floor((r / 0.5) * lean.length)]!;
  return STYLES[Math.floor(r * STYLES.length) % STYLES.length]!;
};

/** A coach's own way of playing (stable for his career). */
export function coachStyle(state: GameState, coach: ClubOfficial): ClubStyle {
  return coach.style ?? pick(`${state.seed}:coach-style:${coach.id}`, CULTURE_LEAN[state.countries[coach.nationality]?.culture ?? '']);
}

/** How the club plays: set when a coach changed it, else its own tradition. */
export function styleOf(state: GameState, club: Club): ClubStyle {
  return club.style ?? pick(`${state.seed}:club-style:${club.id}`, CULTURE_LEAN[state.countries[club.countryId]?.culture ?? '']);
}

/** When a new coach arrives: more often than not he brings his own style. Returns whether it changed. */
export function adoptCoachStyle(state: GameState, club: Club, coach: ClubOfficial): boolean {
  const before = styleOf(state, club);
  const theirs = coachStyle(state, coach);
  if (theirs === before) return false;
  if (hashString(`${state.seed}:adopt:${club.id}:${coach.id}`) / 4294967296 >= 0.6) return false;
  club.style = theirs;
  return true;
}

/** The style's attributes that matter at this position (all of them for outfield players; none in goal). */
export function styleAttrs(style: ClubStyle, pos: Position): AttributeKey[] {
  if (pos === 'GK') return [];
  const w = POSITION_WEIGHTS[pos];
  const relevant = STYLE_INFO[style].attrs.filter((a) => (w[a] ?? 0) > 0);
  return relevant.length >= 2 ? relevant : STYLE_INFO[style].attrs;
}

/**
 * How well he suits the way the club plays, −1 to 1: his style attributes against the squad's average in them.
 * The coach knows the truth.
 */
export function styleFit(state: GameState, p: Player, club: Club, pos: Position): number {
  const attrs = styleAttrs(styleOf(state, club), pos);
  if (!attrs.length) return 0;
  const mean = (x: Player) => attrs.reduce((n, a) => n + x.attributes[a], 0) / attrs.length;
  const squad = club.squad.map((id) => state.players[id]!).filter((x) => x && x.id !== p.id);
  const base = squad.length ? squad.reduce((n, x) => n + mean(x), 0) / squad.length : 10;
  return clamp((mean(p) - base) / 4, -1, 1);
}

/** Effect on the coach's sign-off (log-odds): up to about ±8 points at even odds. */
export const STYLE_SIGNOFF = 0.35;

export function fitLabel(fit: number): 'fits' | 'neutral' | 'clashes' {
  return fit >= 0.25 ? 'fits' : fit <= -0.25 ? 'clashes' : 'neutral';
}
