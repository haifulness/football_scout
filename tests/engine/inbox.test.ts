import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';
import { addNews } from '../../src/engine/systems/season';

const eng = 'eng' as CountryId;

describe('inbox and news', () => {
  it('splits your messages from world news and counts what you have not seen', () => {
    const e = new Engine();
    e.generate(4321);
    e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
    const s = (e as unknown as { state: GameState }).state;
    expect(e.getScout()!.unreadInbox).toBe(0);
    addNews(s, { date: s.date, kind: 'career', title: 'Offer', body: '' });
    addNews(s, { date: s.date, kind: 'transfer', title: 'Big move', body: '' });
    addNews(s, { date: s.date, kind: 'rumour', title: 'Rival interest: you', body: '', forYou: true });
    addNews(s, { date: s.date, kind: 'rumour', title: 'Someone else', body: '' });
    const inbox = e.getNews('inbox').map((n) => n.title);
    const news = e.getNews('news').map((n) => n.title);
    expect(inbox).toEqual(expect.arrayContaining(['Offer', 'Rival interest: you']));
    expect(inbox).not.toContain('Big move');
    expect(news).toEqual(expect.arrayContaining(['Big move', 'Someone else']));
    expect(news).not.toContain('Offer');
    expect(e.getScout()!.unreadInbox).toBe(2);
    const before = e.markInboxRead();
    expect(e.getScout()!.unreadInbox).toBe(0);
    expect(e.getNews('inbox').filter((n) => n.id >= before).length).toBe(2);
  }, 60_000);
});
