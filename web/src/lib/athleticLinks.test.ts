import { describe, expect, it } from 'vitest';
import { athleticAthleteUrl, athleticMeetUrl } from './athleticLinks';

describe('athleticMeetUrl', () => {
  it('builds the results link from a numeric id', () => {
    expect(athleticMeetUrl('123456')).toBe('https://www.athletic.net/CrossCountry/meet/123456/results');
  });
  it('returns null for missing or non-numeric ids', () => {
    expect(athleticMeetUrl(null)).toBeNull();
    expect(athleticMeetUrl('')).toBeNull();
    expect(athleticMeetUrl('12/../evil')).toBeNull();
    expect(athleticMeetUrl('https://evil.example/1')).toBeNull();
  });
});

describe('athleticAthleteUrl', () => {
  it('accepts a bare id or a stored profile URL', () => {
    expect(athleticAthleteUrl('9876')).toBe('https://www.athletic.net/athlete/9876/cross-country');
    expect(athleticAthleteUrl('https://www.athletic.net/athlete/9876/cross-country/')).toBe('https://www.athletic.net/athlete/9876/cross-country');
    expect(athleticAthleteUrl('https://www.athletic.net/Athlete.aspx?AID=4321')).toBe('https://www.athletic.net/athlete/4321/cross-country');
  });
  it('returns null when there is no usable id', () => {
    expect(athleticAthleteUrl(null)).toBeNull();
    expect(athleticAthleteUrl('not an id')).toBeNull();
  });
});
