// Clipboard inspector helpers (super-admin page, Step 0 of the paste-in
// data work). Pure string functions so they test in node; the DOM walking
// lives in the page. Nothing here touches the network.

export interface LinkIds {
  athleteId: string | null;
  meetId: string | null;
  teamId: string | null;
}

// Athletic.net link shapes seen in the old scrapers and the saved grid:
//   /athlete/<id>/...   /Athlete.aspx?AID=<id>   /meet/<id>/...   /Meet.aspx?Meet=<id>
//   /team/<id>/...      /team.aspx?TeamID=<id>   (case varies)
export function extractAthleticIds(href: string): LinkIds {
  const pick = (re: RegExp) => href.match(re)?.[1] ?? null;
  return {
    athleteId: pick(/\/athlete\/(\d+)/i) ?? pick(/[?&]AID=(\d+)/i),
    meetId: pick(/\/meet\/(\d+)/i) ?? pick(/[?&]Meet(?:ID)?=(\d+)/i),
    teamId: pick(/\/team\/(\d+)/i) ?? pick(/[?&]Team(?:ID)?=(\d+)/i),
  };
}

export interface InspectedLink extends LinkIds {
  text: string;
  href: string;
}

/** Tab-separated plain text (what Excel/Sheets put on the clipboard) to rows. */
export function parseTsv(text: string): string[][] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => line.split('\t').map((c) => c.trim()));
}

/** A one-glance summary of what a paste carried, for the report. */
export function summarizePaste(input: { plain: string; html: string; links: InspectedLink[]; tableRows: number }) {
  const withAthlete = input.links.filter((l) => l.athleteId).length;
  const withMeet = input.links.filter((l) => l.meetId).length;
  return {
    hasPlain: input.plain.length > 0,
    hasHtml: input.html.length > 0,
    plainChars: input.plain.length,
    htmlChars: input.html.length,
    tableRows: input.tableRows,
    links: input.links.length,
    athleteIds: new Set(input.links.map((l) => l.athleteId).filter(Boolean)).size,
    meetIds: new Set(input.links.map((l) => l.meetId).filter(Boolean)).size,
    linksWithAthleteId: withAthlete,
    linksWithMeetId: withMeet,
    idsSurvive: withAthlete + withMeet > 0,
  };
}
