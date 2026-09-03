// Race tactics — the mental cues, not the data.
//
// Everything else on the strategy session is a fact about a specific
// athlete's own races and would be dishonest to fake. This is the other
// half of a strategy session, and it is honest in a different way: it is
// common, proven coaching wisdom that applies whether or not this athlete
// has three races on file yet. It does not claim to come from anyone's
// results, and the page must never present it like it does — see the
// "General racing tactics — not from your data" line wherever this
// renders.
//
// Organized by where in the race a cue applies, in race order, because
// that is how an athlete actually uses it: read it once before the race,
// then recall the right one when they hit that part of it.

export interface RaceTactic {
  id: string;
  /** Where in the race this applies — shown as a small label above the cue. */
  phase: string;
  /** The cue itself, short enough to remember standing on a start line. */
  cue: string;
  /** One sentence on why, or how to actually do it. */
  detail: string;
}

export const RACE_TACTICS: RaceTactic[] = [
  {
    id: 'start',
    phase: 'The first 800',
    cue: "Don't race the start. Get position, then find your pace.",
    detail:
      'The gun goes off and everyone sprints — that is normal, not a sign you are behind. Get to a spot where you are not boxed in, then settle into the pace you actually planned to run by the time you hit 800m.',
  },
  {
    id: 'settle',
    phase: 'Once you find your pace',
    cue: 'Relax on purpose. Shoulders down, hands loose, breathe.',
    detail:
      "Tension anywhere costs you energy somewhere else. Once you're at pace, do a quick check: are your shoulders up by your ears, are your hands clenched? Drop them. This is free speed.",
  },
  {
    id: 'middle',
    phase: 'Every mile after that',
    cue: 'Pick one runner ahead of you. Catch them. Pick the next one.',
    detail:
      "Racing the whole field at once is exhausting to even think about. Racing three people, one at a time, is a job you can actually do. Every runner you catch is a small win — count them.",
  },
  {
    id: 'discomfort',
    phase: 'When it starts to hurt',
    cue: 'Check your form from the ground up.',
    detail:
      "Feet landing under you, not out in front. Knees driving forward. Hips tall. Shoulders down. Hands relaxed. Running badly makes the pain worse for the same speed — fixing your form is often faster than gritting your teeth.",
  },
  {
    id: 'finish',
    phase: 'The last 400 to 800',
    cue: 'Empty the tank. This is the one part where holding back is the mistake.',
    detail:
      "Everywhere else in the race, going out too hard costs you later. Not here — there is no later. Whatever you have left, this is where it goes.",
  },
];
