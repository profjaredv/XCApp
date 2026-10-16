// Link-outs to Athletic.net (docs: paste-in data spec §4). LeadPack links to
// the page the coach already knows and never embeds or reproduces it.
// Ids are validated as digits before they go into a URL, so a stray value
// (a pasted URL, text) can never produce a link to anywhere else.

export const ATHLETIC_SOURCE_LINE = 'Results from Athletic.net, pasted by your coaches.';

/** Athlete ids are stored either as the bare number or as the profile URL the coach pasted. */
function athleteIdDigits(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).trim();
  const m = s.match(/\/athlete\/(\d+)/i) || s.match(/[?&]AID=(\d+)/i) || s.match(/^(\d+)$/);
  return m ? m[1] : null;
}

export function athleticMeetUrl(meetId: string | null | undefined): string | null {
  const id = meetId == null ? '' : String(meetId).trim();
  return /^\d+$/.test(id) ? `https://www.athletic.net/CrossCountry/meet/${id}/results` : null;
}

export function athleticAthleteUrl(value: string | null | undefined): string | null {
  const id = athleteIdDigits(value);
  return id ? `https://www.athletic.net/athlete/${id}` : null;
}
