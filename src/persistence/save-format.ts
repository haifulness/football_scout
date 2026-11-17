import type { GameState } from '../engine/model/world-state';
import type { SaveMeta } from './db';

/**
 * On-disk save format: a gzip-compressed JSON envelope. The same bytes are
 * stored in IndexedDB and written to exported `.fsave` files.
 */
export const SAVE_FORMAT = 'football-scout-save';
export const CURRENT_SCHEMA_VERSION = 16;

export interface SaveEnvelope {
  format: typeof SAVE_FORMAT;
  meta: Omit<SaveMeta, 'sizeBytes'>;
  state: GameState;
}

export class SaveError extends Error {}

export async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/**
 * Upgrades older save states step by step. Add an entry `n: (state) => state`
 * whenever GameState changes shape; it converts schema n into n + 1.
 */
const MIGRATIONS: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 → v2: scouting arrives. Worlds saved before careers existed get empty
  // scouting data; the game asks the player to set up their scout on load.
  1: (s) => ({
    ...s,
    knowledge: {},
    pool: {},
    searches: [],
    ledger: [],
    counters: { ...(s.counters as Record<string, number>), search: 0 },
  }),
  // v2 → v3: travel and meetings. Nobody had travelled yet, so where you are is home.
  2: (s) => {
    const scout = s.scout as Record<string, unknown> | undefined;
    return scout ? { ...s, scout: { ...scout, homeCity: scout.location, relationships: {}, rapport: {}, lastMet: {} } } : s;
  },
  // v3 → v4: recommendations and transfers.
  3: (s) => ({ ...s, deals: [], placements: [], pendingDealEvents: [], counters: { ...(s.counters as Record<string, number>), deal: 0 } }),
  // v4 → v5: payouts. Earlier signings get their (unpaid) signing bonus settled on the next game day.
  4: (s) => ({
    ...s,
    pendingPayouts: [],
    balanceHistory: [],
    ledgerTotals: ledgerTotalsFrom(s),
    placements: ((s.placements as Record<string, unknown>[]) ?? []).map((p) => ({
      ...p,
      bonus: 0,
      bonusPaid: false,
      earnings: { appearance: 0, goals: 0, assists: 0, tackles: 0, cleanSheets: 0, captain: 0 },
    })),
  }),
  // v5 → v6: employment. Everyone starts as a freelancer; clubs you already work with become clients.
  5: (s) => {
    const scout = s.scout as Record<string, unknown> | undefined;
    const placements = (s.placements as { clubId: string }[]) ?? [];
    const deals = ((s.deals as { clubId: string; stage: string }[]) ?? []).filter((d) => d.stage === 'negotiating' || d.stage === 'agreed');
    const clients = [...new Set([...placements.map((p) => p.clubId), ...deals.map((d) => d.clubId)])];
    const clubRecord: Record<string, { signings: number; weakPitches: number }> = {};
    for (const p of placements) clubRecord[p.clubId] = { signings: (clubRecord[p.clubId]?.signings ?? 0) + 1, weakPitches: 0 };
    return {
      ...s,
      offers: [],
      counters: { ...(s.counters as Record<string, number>), offer: 0 },
      scout: scout ? { ...scout, employment: { mode: 'freelance', clients }, clubRecord } : scout,
    };
  },
  // v6 → v7: missions.
  6: (s) => ({ ...s, missions: [], counters: { ...(s.counters as Record<string, number>), mission: 0 } }),
  // v7 → v8: the freelance market (selling mandates, representing free agents, prodigy discoveries).
  7: (s) => ({
    ...s,
    mandates: [],
    pendingDiscoveries: [],
    counters: { ...(s.counters as Record<string, number>), mandate: 0 },
    scout: s.scout ? { ...(s.scout as Record<string, unknown>), represented: [] } : s.scout,
  }),
  // v8 → v9: rival scouts (seeded on the next game day when a career exists).
  8: (s) => ({ ...s, rivals: [] }),
  // v9 → v10: assistant scouts.
  9: (s) => ({ ...s, assistants: [], assistantMarket: [], counters: { ...(s.counters as Record<string, number>), assistant: 0 } }),
  // v10 → v11: clubs no longer have a president; the Head Coach signs off everything.
  10: (s) => {
    type Rec = Record<string, unknown>;
    const clubs = { ...(s.clubs as Record<string, Rec>) };
    const officials = { ...(s.officials as Record<string, Rec>) };
    const gone = new Set<string>();
    for (const [id, c] of Object.entries(clubs)) {
      if (typeof c.presidentId === 'string') gone.add(c.presidentId);
      const { presidentId: _drop, ...rest } = c;
      clubs[id] = rest;
    }
    for (const id of gone) delete officials[id];
    const deals = ((s.deals as Rec[]) ?? []).map((d) => {
      const pitchedTo = [...new Set(((d.pitchedTo as string[]) ?? []).map(() => 'coach'))];
      const signOff = d.signOff ? { by: 'coach', date: (d.signOff as Rec).date } : undefined;
      return { ...d, pitchedTo, signOff };
    });
    const scout = s.scout as Rec | undefined;
    const relationships = scout ? Object.fromEntries(Object.entries(scout.relationships as Record<string, number>).filter(([id]) => !gone.has(id))) : undefined;
    return { ...s, clubs, officials, deals, scout: scout ? { ...scout, relationships } : scout };
  },
  // v11 → v12: season reviews and deadline day.
  11: (s) => ({ ...s, seasonReviews: [] }),
  // v12 → v13: wonderkid hunts.
  12: (s) => ({ ...s, hunts: [], counters: { ...(s.counters as Record<string, number>), hunt: 0 } }),
  // v13 → v14: scouting reports.
  13: (s) => ({ ...s, reports: [], counters: { ...(s.counters as Record<string, number>), report: 0 } }),
  // v14 → v15: season goals, trophies, specialties (placements remember who signed).
  14: (s) => {
    type Rec = Record<string, unknown>;
    const players = (s.players as Record<string, Rec>) ?? {};
    const deals = new Map(((s.deals as Rec[]) ?? []).map((d) => [d.id, d]));
    const placements = ((s.placements as Rec[]) ?? []).map((pl) => {
      const p = players[pl.playerId as string];
      const deal = deals.get(pl.dealId);
      const birth = p?.birthDate as number | undefined;
      return {
        ...pl,
        nationality: p?.nationality,
        age: birth === undefined ? undefined : Math.floor(((pl.signedOn as number) - birth) / 365.25),
        free: deal ? !deal.sellingClubId : undefined,
      };
    });
    return { ...s, placements, objectives: [], trophies: [], prodigyFinds: [], counters: { ...(s.counters as Record<string, number>), objective: 0, trophy: 0 } };
  },
  // v15 → v16: your own agency (absent until founded).
  15: (s) => ({ ...s }),
};

export function migrate(state: Record<string, unknown>): GameState {
  let version = typeof state.schemaVersion === 'number' ? state.schemaVersion : NaN;
  if (!Number.isInteger(version) || version < 1) throw new SaveError('This save is missing its version and cannot be read.');
  if (version > CURRENT_SCHEMA_VERSION) throw new SaveError('This save comes from a newer version of the game. Update the game to open it.');
  let s = state;
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new SaveError(`No upgrade path from save version ${version}.`);
    s = step(s);
    version++;
    s.schemaVersion = version;
  }
  return s as unknown as GameState;
}

/** Serializes synchronously (a consistent snapshot), then compresses asynchronously. */
export function encodeEnvelope(meta: SaveEnvelope['meta'], state: GameState): { json: string } {
  const envelope: SaveEnvelope = { format: SAVE_FORMAT, meta, state };
  return { json: JSON.stringify(envelope) };
}

export async function decodeEnvelope(bytes: Uint8Array): Promise<{ meta: SaveEnvelope['meta']; state: GameState }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await gunzip(bytes));
  } catch {
    throw new SaveError('This file is not a readable Football Scout save.');
  }
  const env = parsed as Partial<SaveEnvelope> | null;
  if (!env || env.format !== SAVE_FORMAT || !env.meta || !env.state || typeof env.state !== 'object') {
    throw new SaveError('This file is not a Football Scout save.');
  }
  const state = migrate(env.state as unknown as Record<string, unknown>);
  if (!state.players || !state.clubs || !state.fixtures || typeof state.date !== 'number') throw new SaveError('This save is damaged and cannot be loaded.');
  return { meta: env.meta, state };
}

/** Rebuilds per-season ledger totals from the ledger lines an older save kept. */
function ledgerTotalsFrom(s: Record<string, unknown>): Record<number, Record<string, number>> {
  const totals: Record<number, Record<string, number>> = {};
  const year = (s.season as { year: number } | undefined)?.year ?? 2026;
  for (const e of (s.ledger as { amount: number; kind: string }[] | undefined) ?? []) {
    totals[year] ??= {};
    totals[year]![e.kind] = (totals[year]![e.kind] ?? 0) + e.amount;
  }
  return totals;
}
