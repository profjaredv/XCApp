import { describe, expect, it } from 'vitest';
import { extractAthleticIds, parseTsv, summarizePaste } from './clipboardInspect';

describe('extractAthleticIds', () => {
  it('reads both the current and the old link shapes', () => {
    expect(extractAthleticIds('https://www.athletic.net/athlete/12345/cross-country/')).toMatchObject({ athleteId: '12345' });
    expect(extractAthleticIds('https://www.athletic.net/CrossCountry/Athlete.aspx?AID=777')).toMatchObject({ athleteId: '777' });
    expect(extractAthleticIds('https://www.athletic.net/CrossCountry/meet/98765/results')).toMatchObject({ meetId: '98765' });
    expect(extractAthleticIds('https://www.athletic.net/team/460/cross-country/2026')).toMatchObject({ teamId: '460' });
  });
  it('returns nulls for anything else', () => {
    expect(extractAthleticIds('https://example.com/x')).toEqual({ athleteId: null, meetId: null, teamId: null });
  });
});

describe('parseTsv', () => {
  it('splits spreadsheet rows and drops blank lines', () => {
    expect(parseTsv('Name\tGrade\r\nAda Test\t10\r\n\r\n')).toEqual([['Name', 'Grade'], ['Ada Test', '10']]);
  });
});

describe('summarizePaste', () => {
  it('says whether ids survived in the html', () => {
    const s = summarizePaste({
      plain: 'a', html: '<a>', tableRows: 2,
      links: [{ text: 'Ada', href: 'x', athleteId: '1', meetId: null, teamId: null }],
    });
    expect(s).toMatchObject({ idsSurvive: true, athleteIds: 1, meetIds: 0 });
  });
});
