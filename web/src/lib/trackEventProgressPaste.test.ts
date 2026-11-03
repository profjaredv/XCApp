// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { eventProgressToCsv, looksLikeEventProgressHtml, parseEventProgress } from './trackEventProgressPaste';

// Synthetic page (made-up names) with the same DOM structure/classes as
// Athletic.net's real Event Progress page.
import html from './fixtures/track-event-progress.html?raw';

describe('parseEventProgress', () => {
  const p = parseEventProgress(html);

  it('reads season, outdoor flag and the active gender tab', () => {
    expect(p.errors).toEqual([]);
    expect(p.season).toBe(2026);
    expect(p.outdoor).toBe(true);
    expect(p.gender).toBe('Men');
  });

  it('reads Competition Results rows for every athlete, carrying raw marks through untouched', () => {
    expect(p.rows.length).toBe(4);
    const sam400 = p.rows.find((r) => r.athleteName === 'Sam Example' && r.event === '400 Meters');
    expect(sam400).toMatchObject({
      athleticAthleteId: 'https://www.athletic.net/athlete/1000001/track-and-field',
      grade: '11',
      place: '3',
      result: '51.20',
      round: 'V F',
      date: '4/30/26',
      meetName: 'Sample Invitational',
      athleticMeetId: '900001',
    });
    expect(sam400?.meetUrl).toBe('https://www.athletic.net/TrackAndField/meet/900001');
  });

  it('carries a DNS row through as a raw result, not dropped', () => {
    const dns = p.rows.find((r) => r.result === 'DNS');
    expect(dns).toMatchObject({ athleteName: 'Sam Example', event: '400 Meters' });
  });

  it('carries a feet-inches throw mark through untouched (conversion happens server-side)', () => {
    const shotPut = p.rows.find((r) => r.event === 'Shot Put');
    expect(shotPut).toMatchObject({ result: '34\' 2.5"', round: 'JV F' });
  });

  it('carries wind and an aliasable event name through for a hurdles row', () => {
    const hurdles = p.rows.find((r) => r.event === '100m Hurdles');
    expect(hurdles).toMatchObject({ athleteName: 'Jordan Sample', grade: '9', result: '17.40c', wind: '-0.4' });
  });

  it('never reads the Season Records column (same event name, different section)', () => {
    // Season Records only has 3 columns (Season/Grade/Best Result); if it were
    // accidentally read as Competition Results, rows would have garbage
    // place/wind/round/meet values instead of being absent entirely.
    expect(p.rows.filter((r) => r.event === '400 Meters').length).toBe(2);
  });

  it('writes the CSV the track import route takes', () => {
    const csv = eventProgressToCsv([p]);
    expect(csv.split('\n')[0]).toBe(
      '"Athlete Name","Athletic Athlete ID","Grade","Gender","Event","Place","Result","Wind","Round","Date","Season","Meet Name","Meet URL","Athletic Meet ID"'
    );
    expect(csv).toContain('"Sam Example"');
    expect(csv).toContain('"2026"');
    expect(csv).toContain('/athletic.net/TrackAndField/meet/900004'.replace('athletic.net', 'www.athletic.net'));
  });

  it('tells event-progress html from csv', () => {
    expect(looksLikeEventProgressHtml(html)).toBe(true);
    expect(looksLikeEventProgressHtml('"Athlete Name","Event"\n"a","b"')).toBe(false);
  });

  it('errors when the Relays tab (unsupported) is active instead of Men/Women', () => {
    const relaysActive = html.replace('class="nav-link active"', 'class="nav-link"').replace(
      '<a class="nav-link"><i class="fas fa-users me-1"></i> Relays </a>',
      '<a class="nav-link active"><i class="fas fa-users me-1"></i> Relays </a>'
    );
    expect(parseEventProgress(relaysActive).errors.join(' ')).toMatch(/Mens or Womens/);
  });

  it('errors on a paste with no athletes', () => {
    const empty = '<h2> 2026 <span>Outdoor</span> Event Progress</h2><a class="nav-link active">Men</a><div class="row"></div>';
    expect(parseEventProgress(empty).errors.join(' ')).toMatch(/No athletes/);
  });
});
