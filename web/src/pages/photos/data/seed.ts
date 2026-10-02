import type { Athlete, Meet, Photo, PhotoAthleteTags, AthletePicks } from '../state/types';

// Deterministic PRNG (mulberry32) so the seeded workspace renders the same
// data on every reload — a coach reviewing the prototype across two days
// should see the same roster and the same "untagged" count, not a fresh
// random set each time.
function mulberry32(seed: number) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  'Ava', 'Liam', 'Mia', 'Noah', 'Emma', 'Lucas', 'Sofia', 'Ethan', 'Isla', 'Mason',
  'Zoe', 'Owen', 'Luna', 'Caleb', 'Nora', 'Hunter', 'Ruby', 'Levi', 'Chloe', 'Wyatt',
  'Ella', 'Grayson', 'Aria', 'Jack', 'Layla', 'Leo', 'Maya', 'Carter', 'Hazel', 'Eli',
];
const LAST_NAMES = [
  'Harper', 'Ortiz', 'Bennett', 'Reyes', 'Flynn', 'Patel', 'Monroe', 'Castillo',
  'Wallace', 'Nakamura', 'Fischer', 'Delgado', 'Whitfield', 'Soto', 'Kowalski',
  'Abara', 'Lindqvist', 'Marsh', 'Okafor', 'Pruitt',
];

export const SEASON_LABEL = '2026 Cross Country';

export function seedAthletes(rand: () => number, count = 42): Athlete[] {
  const athletes: Athlete[] = [];
  for (let i = 0; i < count; i++) {
    // Coprime-ish strides through each list so names vary from the very
    // first athlete instead of repeating one surname for the first 30.
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = LAST_NAMES[(i * 7) % LAST_NAMES.length];
    athletes.push({
      id: `athlete-${i + 1}`,
      name: `${first} ${last}`,
      grade: 9 + Math.floor(rand() * 4),
      photosOptOut: rand() < 0.04,
    });
  }
  return athletes;
}

export function seedMeets(): Meet[] {
  const names = [
    'Riverside Invitational', 'County Dual #1', 'Hilltop Classic', 'County Dual #2',
    'Autumn Relays', 'Conference Meet', 'County Dual #3', 'District Championship',
    'Regional Championship',
  ];
  const start = new Date('2026-09-05T08:00:00Z');
  return names.map((name, i) => {
    const date = new Date(start);
    date.setDate(date.getDate() + i * 9);
    return { id: `meet-${i + 1}`, name, date: date.toISOString() };
  });
}

interface SeedResult {
  athletes: Athlete[];
  meets: Meet[];
  photos: Photo[];
  tags: PhotoAthleteTags;
  picks: AthletePicks;
}

// 2000 photos spread across every meet but the last (so Build has picks to
// show and the final meet still needs tagging) — matches the acceptance
// check ("a grid of 2000 photos scrolls smoothly") and gives the Tag
// module's coverage view something real to report.
export function buildSeed(seedValue = 20260901): SeedResult {
  const rand = mulberry32(seedValue);
  const athletes = seedAthletes(rand);
  const meets = seedMeets();
  const photos: Photo[] = [];
  const tags: PhotoAthleteTags = {};
  const picks: AthletePicks = {};

  const photosByMeet = 2000 / (meets.length - 1);
  let photoIndex = 0;

  meets.slice(0, -1).forEach((meet, meetIdx) => {
    const meetDate = new Date(meet.date);
    const countForMeet = Math.round(photosByMeet * (0.85 + rand() * 0.3));
    for (let i = 0; i < countForMeet; i++) {
      const id = `photo-${photoIndex++}`;
      const takenAt = new Date(meetDate);
      // Spread capture times across a ~90 minute race window, 8:00-9:30am.
      takenAt.setMinutes(takenAt.getMinutes() + Math.floor(rand() * 90));
      const photo: Photo = {
        id,
        meetId: meet.id,
        takenAt: takenAt.toISOString(),
        width: 1600,
        height: 1067,
        status: 'ready',
        seed: Math.floor(rand() * 1_000_000),
      };
      photos.push(photo);

      // Most photos get 1-4 athletes tagged; a meaningful slice stay
      // untagged so Tag's "Untagged" filter and coverage view have real
      // counts to show, not an empty list.
      const leaveUntagged = rand() < 0.22;
      if (!leaveUntagged) {
        const tagCount = 1 + Math.floor(rand() * 3);
        const chosen = new Set<string>();
        for (let t = 0; t < tagCount; t++) {
          const athlete = athletes[Math.floor(rand() * athletes.length)];
          if (athlete.photosOptOut) continue;
          chosen.add(athlete.id);
        }
        if (chosen.size > 0) {
          tags[id] = Array.from(chosen).map((athleteId) => ({
            athleteId,
            source: rand() < 0.6 ? 'coach' : rand() < 0.5 ? 'self' : 'parent',
            taggedBy: 'seed',
          }));
        }
      }
      void meetIdx;
    }
  });

  // Give most athletes 3-5 picks from photos they're actually tagged in,
  // spread across more than one meet, matching the spec's selection rule.
  const taggedPhotosByAthlete = new Map<string, string[]>();
  for (const [photoId, entries] of Object.entries(tags)) {
    for (const entry of entries) {
      const list = taggedPhotosByAthlete.get(entry.athleteId) ?? [];
      list.push(photoId);
      taggedPhotosByAthlete.set(entry.athleteId, list);
    }
  }
  for (const athlete of athletes) {
    if (athlete.photosOptOut) continue;
    const available = taggedPhotosByAthlete.get(athlete.id) ?? [];
    if (available.length === 0) continue;
    const pickCount = Math.min(available.length, rand() < 0.75 ? 3 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 2));
    const shuffled = [...available].sort(() => rand() - 0.5);
    picks[athlete.id] = shuffled.slice(0, pickCount);
  }

  return { athletes, meets, photos, tags, picks };
}
