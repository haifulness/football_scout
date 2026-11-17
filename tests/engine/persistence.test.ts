import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { GameHost } from '../../src/worker/game-host';
import { CURRENT_SCHEMA_VERSION, SaveError, decodeEnvelope, gzip, migrate } from '../../src/persistence/save-format';

/** Reach the private state for equality checks. */
const stateOf = (h: GameHost) => (h as unknown as { state: unknown }).state;
/** Compare by value: a save round-trip may reorder object keys, which is harmless. */
const plain = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('save & load', () => {
  const host = new GameHost();
  let slotId: string;
  let saveMs = 0;

  beforeAll(async () => {
    await host.newGame(4242, { name: 'Test Scout', nationality: 'eng' as never, homeCountry: 'eng' as never, background: 'analyst', difficulty: 'normal' });
    host.advance(40); // into the season: results, stats, injuries
    const t0 = performance.now();
    const meta = await host.save();
    saveMs = performance.now() - t0;
    slotId = meta.id;
  }, 120_000);

  it('lists the save with useful metadata', async () => {
    const saves = await host.listSaves();
    const meta = saves.find((s) => s.id === slotId)!;
    expect(meta.name).toBe('Test Scout');
    expect(meta.seasonLabel).toBe('2026/27');
    expect(meta.gameDate).toBe(host.getClock().date);
    expect(meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    console.log(`save: ${(meta.sizeBytes / 1e6).toFixed(1)} MB compressed in ${saveMs.toFixed(0)} ms`);
    expect(meta.sizeBytes).toBeLessThan(20e6);
  });

  it('restores an identical world, and the future plays out identically', async () => {
    const other = new GameHost();
    const t0 = performance.now();
    await other.loadSave(slotId);
    console.log(`load: ${(performance.now() - t0).toFixed(0)} ms`);
    expect(plain(stateOf(other))).toEqual(plain(stateOf(host)));
    host.advance(30);
    other.advance(30);
    expect(plain(stateOf(other))).toEqual(plain(stateOf(host)));
  }, 120_000);

  it('autosaves only once a week of game time has passed', async () => {
    if (host.getDeadline()) host.finishDeadline(); // earlier tests may have stopped the clock on deadline day
    await host.save();
    expect(host.getSaveStatus().dirty).toBe(false);
    const before = host.getClock().date;
    host.advance(3);
    expect(host.getSaveStatus().dirty).toBe(true);
    expect(await host.autosaveIfDue()).toBeNull();
    host.advance(4);
    if (host.getDeadline()) host.finishDeadline(); // the main clock stops for deadline day; play through it
    while (host.getClock().date - before < 7) host.advance(1);
    expect(await host.autosaveIfDue()).not.toBeNull();
    expect(host.getSaveStatus().dirty).toBe(false);
  }, 120_000);

  it('exports and re-imports a backup as a new slot', async () => {
    const { filename, bytes } = await host.exportSave(slotId);
    expect(filename).toMatch(/\.fsave$/);
    const imported = await host.importSave(bytes);
    expect(imported.id).not.toBe(slotId);
    expect(imported.name).toContain('(imported)');
    const other = new GameHost();
    await other.loadSave(imported.id);
    expect(plain(stateOf(other))).toEqual(plain(stateOf(host)));
  }, 120_000);

  it('renames and deletes saves', async () => {
    await host.renameSave(slotId, '  My first career  ');
    expect((await host.listSaves()).find((s) => s.id === slotId)?.name).toBe('My first career');
    await host.deleteSave(slotId);
    expect((await host.listSaves()).some((s) => s.id === slotId)).toBe(false);
    await expect(new GameHost().loadSave(slotId)).rejects.toThrow(SaveError);
  });
});

describe('save format', () => {
  it('rejects files that are not saves', async () => {
    await expect(decodeEnvelope(new Uint8Array([1, 2, 3]))).rejects.toThrow(SaveError);
    await expect(decodeEnvelope(await gzip('{"hello":"world"}'))).rejects.toThrow(/not a Football Scout save/);
  });

  it('refuses saves from a newer version and saves with no version', () => {
    expect(() => migrate({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })).toThrow(/newer version/);
    expect(() => migrate({})).toThrow(SaveError);
  });
});
