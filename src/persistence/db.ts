import Dexie, { type Table } from 'dexie';

/** Lightweight listing info, kept separate from the (large) snapshot so the menu loads instantly. */
export interface SaveMeta {
  id: string;
  name: string;
  seed: number;
  /** In-game date (GameDate). */
  gameDate: number;
  seasonLabel: string;
  createdAt: number; // real-world ms
  updatedAt: number; // real-world ms
  sizeBytes: number;
  schemaVersion: number;
}

/** One finished career, kept across games (separate from saves, so deleting a save keeps it). */
export interface HallEntry {
  /** The career's id (one entry per career, updated if it is recorded again). */
  id: string;
  name: string;
  background: string;
  difficulty: string;
  homeCountry: string;
  seed: number;
  kind: 'bankrupt' | 'retired' | 'scenario' | 'active';
  /** Set for scenario careers: its name and how it went. */
  scenario?: string;
  scenarioResult?: 'won' | 'lost' | 'active';
  score: number;
  seasons: number;
  /** In-game dates. */
  startedOn: number;
  endedOn: number;
  earned: number;
  placements: number;
  trophies: number;
  reputation: number;
  bestFind?: { name: string; ovr: number };
  /** Real-world ms. */
  recordedAt: number;
}

export interface SnapshotRecord {
  id: string;
  /** gzip-compressed JSON save envelope. Stored as bytes (not Blob) for portability. */
  data: Uint8Array;
}

class ScoutDatabase extends Dexie {
  saves!: Table<SaveMeta, string>;
  snapshots!: Table<SnapshotRecord, string>;
  hall!: Table<HallEntry, string>;

  constructor() {
    super('football-scout');
    this.version(1).stores({ saves: 'id, updatedAt', snapshots: 'id' });
    this.version(2).stores({ saves: 'id, updatedAt', snapshots: 'id', hall: 'id, score' });
  }
}

export const db = new ScoutDatabase();
