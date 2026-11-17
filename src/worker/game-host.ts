import { Engine } from '../engine';
import type { ProgressFn } from '../engine/generation/world-generator';
import type { CareerSetup } from '../engine/model/scout';
import type { WorldSummary } from '../engine/views';
import { BACKGROUNDS } from '../engine/systems/scouting';
import type { CareerSummary } from '../engine/systems/career-end';
import { db, type HallEntry, type SaveMeta } from '../persistence/db';
import { CURRENT_SCHEMA_VERSION, SaveError, decodeEnvelope, encodeEnvelope, gzip } from '../persistence/save-format';

const AUTOSAVE_EVERY_DAYS = 7;
const seasonLabel = (year: number) => `${year}/${String(year + 1).slice(2)}`;

export interface SaveStatus {
  slotId?: string;
  name?: string;
  /** In-game date of the last save. */
  savedGameDate?: number;
  /** Real-world time of the last save. */
  savedAt?: number;
  /** Game time has moved since the last save. */
  dirty: boolean;
}

/**
 * The engine plus persistence. Lives in the worker: saving serializes the
 * world synchronously (a consistent snapshot), then compresses and writes it
 * without blocking the UI thread.
 */
export class GameHost extends Engine {
  private slotId?: string;
  private slotName?: string;
  private createdAt?: number;
  private savedGameDate?: number;
  private savedAt?: number;

  /** Generates a new world, creates the scout, and immediately creates a save slot for it. */
  async newGame(seed: number, setup: CareerSetup, onProgress?: ProgressFn): Promise<WorldSummary> {
    const summary = this.generate(seed, onProgress);
    this.createCareer(setup);
    this.slotId = crypto.randomUUID();
    this.slotName = this.s.scout!.name;
    this.createdAt = Date.now();
    this.savedGameDate = undefined;
    this.savedAt = undefined;
    await this.save();
    return summary;
  }

  getSaveStatus(): SaveStatus {
    return {
      slotId: this.slotId,
      name: this.slotName,
      savedGameDate: this.savedGameDate,
      savedAt: this.savedAt,
      dirty: this.state ? this.savedGameDate !== this.state.date : false,
    };
  }

  private meta(): Omit<SaveMeta, 'sizeBytes'> {
    const s = this.s;
    const now = Date.now();
    return {
      id: this.slotId!,
      name: this.slotName ?? s.scout?.name ?? `World #${s.seed}`,
      seed: s.seed,
      gameDate: s.date,
      seasonLabel: seasonLabel(s.season.year),
      createdAt: this.createdAt ?? now,
      updatedAt: now,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };
  }

  /** Writes the current world to its slot (overwriting the previous snapshot). */
  async save(): Promise<SaveMeta> {
    if (!this.slotId) throw new SaveError('No active game to save.');
    const base = this.meta();
    const { json } = encodeEnvelope(base, this.s); // synchronous snapshot
    const gameDate = this.s.date;
    const data = await gzip(json);
    const meta: SaveMeta = { ...base, sizeBytes: data.byteLength };
    await db.transaction('rw', db.saves, db.snapshots, async () => {
      await db.snapshots.put({ id: meta.id, data });
      await db.saves.put(meta);
    });
    this.savedGameDate = gameDate;
    this.savedAt = meta.updatedAt;
    return meta;
  }

  /** Saves if at least a week of game time has passed since the last save. */
  async autosaveIfDue(): Promise<SaveMeta | null> {
    if (!this.slotId || !this.state) return null;
    if (this.savedGameDate !== undefined && this.state.date - this.savedGameDate < AUTOSAVE_EVERY_DAYS) return null;
    return this.save();
  }

  /**
   * The career has ended (retired or bankrupt): write it to the hall of fame (once per career,
   * updated if called again), save the game, and return the summary with its rank.
   */
  async endOfCareer(): Promise<{ summary: CareerSummary; rank: number; entries: number }> {
    const s = this.s;
    if (!s.careerOver || !s.scout) throw new SaveError('Your career is still going.');
    s.careerId ??= crypto.randomUUID();
    const summary = this.getCareerSummary();
    const entry: HallEntry = {
      id: s.careerId,
      name: s.scout.name,
      background: BACKGROUNDS[s.scout.background].label,
      difficulty: s.scout.difficulty,
      homeCountry: s.countries[s.scout.homeCountry]!.name,
      seed: s.seed,
      kind: summary.kind,
      scenario: summary.scenario?.name,
      scenarioResult: summary.scenario?.result,
      score: summary.score,
      seasons: summary.seasons,
      startedOn: summary.startedOn,
      endedOn: summary.endedOn,
      earned: summary.earned,
      placements: summary.placements,
      trophies: Object.values(summary.trophies).reduce((n, v) => n + v, 0),
      reputation: summary.reputation,
      bestFind: summary.bestFind && { name: summary.bestFind.name, ovr: summary.bestFind.ovr },
      recordedAt: Date.now(),
    };
    await db.hall.put(entry);
    if (this.slotId) await this.save();
    const all = await db.hall.orderBy('score').reverse().toArray();
    return { summary, rank: all.findIndex((e) => e.id === entry.id) + 1, entries: all.length };
  }

  /** The best careers across every game played in this browser. */
  async getHallOfFame(limit = 20): Promise<HallEntry[]> {
    return db.hall.orderBy('score').reverse().limit(limit).toArray();
  }

  async listSaves(): Promise<SaveMeta[]> {
    return db.saves.orderBy('updatedAt').reverse().toArray();
  }

  async loadSave(id: string): Promise<WorldSummary> {
    const record = await db.snapshots.get(id);
    if (!record) throw new SaveError('That save no longer exists.');
    const { meta, state } = await decodeEnvelope(record.data);
    this.state = state;
    this.slotId = id;
    this.slotName = meta.name;
    this.createdAt = meta.createdAt;
    this.savedGameDate = state.date;
    this.savedAt = meta.updatedAt;
    return this.getWorldSummary();
  }

  async renameSave(id: string, name: string): Promise<void> {
    const clean = name.trim().slice(0, 60);
    if (!clean) return;
    await db.saves.update(id, { name: clean });
    if (id === this.slotId) this.slotName = clean;
  }

  async deleteSave(id: string): Promise<void> {
    await db.transaction('rw', db.saves, db.snapshots, async () => {
      await db.saves.delete(id);
      await db.snapshots.delete(id);
    });
    if (id === this.slotId) this.slotId = undefined;
  }

  /** Raw save bytes for a backup file. */
  async exportSave(id: string): Promise<{ filename: string; bytes: Uint8Array }> {
    const [meta, record] = await Promise.all([db.saves.get(id), db.snapshots.get(id)]);
    if (!meta || !record) throw new SaveError('That save no longer exists.');
    const safe = meta.name.replace(/[^\w#-]+/g, '-').replace(/-+/g, '-');
    return { filename: `${safe}-${meta.seasonLabel.replace('/', '-')}.fsave`, bytes: record.data };
  }

  /** Validates a backup file and adds it as a new slot. */
  async importSave(bytes: Uint8Array): Promise<SaveMeta> {
    const { meta } = await decodeEnvelope(bytes); // throws a SaveError if invalid
    const imported: SaveMeta = { ...meta, id: crypto.randomUUID(), name: `${meta.name} (imported)`, updatedAt: Date.now(), sizeBytes: bytes.byteLength };
    await db.transaction('rw', db.saves, db.snapshots, async () => {
      await db.snapshots.put({ id: imported.id, data: bytes });
      await db.saves.put(imported);
    });
    return imported;
  }

  /** Leaves the current game (the caller saves first if it wants to keep progress). */
  closeGame(): void {
    this.state = undefined;
    this.slotId = undefined;
    this.slotName = undefined;
  }
}
