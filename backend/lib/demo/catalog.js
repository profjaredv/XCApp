// What a Washington cross country season looks like: real meets, real
// distances, real course names. The SCHOOLS are invented, so no real program
// is shown running times it never ran. Everything about the team, its
// athletes and every result is made up.

const TEAM = {
  name: 'Huckleberry Ridge High School',
  short: 'Huckleberry Ridge',
  athleticTeamId: 'demo-huckleberry-ridge',
  joinCode: 'DEMOXC',
  mascot: 'Harriers',
  colors: { primary: '#6b2a7a', accent: '#f0b429' },
};

const DEMO_EMAIL_DOMAIN = 'demo.leadpack.invalid';

// Invented opponents. "Strength" is a pace offset in seconds per mile
// (negative is faster); the league schools are the ones we see most.
const SCHOOLS = [
  { name: 'Alder Creek', strength: -6, league: true }, { name: 'Basalt Ridge', strength: 2, league: true },
  { name: 'Columbia Bend', strength: -14, league: true }, { name: 'Dry Falls', strength: 8, league: true },
  { name: 'Eagle Butte', strength: 12, league: true }, { name: 'Fir Hollow', strength: -2, league: true },
  { name: 'Granite Peak', strength: -20 }, { name: 'Horse Heaven', strength: 6 },
  { name: 'Iron Gate', strength: 0 }, { name: 'Juniper Flats', strength: 14 },
  { name: 'Kestrel Canyon', strength: -10 }, { name: 'Lone Pine', strength: 4 },
  { name: 'Mesa Verde Prep', strength: -16 }, { name: 'Naches Bluff', strength: 10 },
  { name: 'Orchard Valley', strength: -4 }, { name: 'Pioneer Springs', strength: 7 },
  { name: 'Quartz Mountain', strength: -8 }, { name: 'Rattlesnake Ridge', strength: 3 },
  { name: 'Sagebrush Academy', strength: -12 }, { name: 'Timber Lake', strength: 9 },
  { name: 'Umtanum Heights', strength: -1 }, { name: 'Vista Ridge', strength: 5 },
  { name: 'Wenas Valley', strength: 11 }, { name: 'Yakima Ridge Christian', strength: 1 },
  { name: 'Zillah Trails', strength: 13 }, { name: 'Cascade Foothills', strength: -18 },
  { name: 'Palouse Prairie', strength: 6 }, { name: 'Blue Mountain Prep', strength: -5 },
];

// Courses. Difficulty is seconds per mile slower than a flat, fast course.
const COURSES = {
  home: { name: 'Huckleberry Ridge Home Course', city: 'Ellensburg', state: 'WA', difficulty: 6, notes: 'Two loops, one real hill, a long gravel straightaway.' },
  sunfair: { name: 'Sunfair Park', state: 'WA', difficulty: 4, notes: 'Open grass, fast start, a narrow bridge near the mile.' },
  league: { name: 'League Host Course', state: 'WA', difficulty: 3, notes: 'Rotates around the league each year.' },
  hole: { name: 'Hole in the Wall Course', state: 'WA', difficulty: 11, notes: 'Rolling and exposed; wind decides the day.' },
  stumptown: { name: 'Lents Park', city: 'Portland', state: 'OR', difficulty: 2, notes: 'Flat, fast park loops. Big fields.' },
  district: { name: 'District Championship Course', state: 'WA', difficulty: 5, notes: 'Hosted by the district; muddy in wet years.' },
  regional: { name: 'Regional Championship Course', state: 'WA', difficulty: 4, notes: 'Wide start, two tight turns.' },
  state: { name: 'Sun Willows Golf Course', city: 'Pasco', state: 'WA', difficulty: -3, notes: 'WIAA state meet. Flat, fast, and loud.' },
};

// One season's meets. `month`/`day` are the Saturday on or after that date
// (the time trial is the Tuesday). `field` is how many schools show up.
// `tiers` runs Gold and Silver varsity races at big invitationals.
const MEETS = [
  { key: 'tt', name: 'Huckleberry Ridge Time Trial', month: 8, day: 25, weekday: 2, course: 'home', home: true, trial: true, field: 0 },
  { key: 'sunfair', name: 'Sunfair Invitational', month: 9, day: 5, course: 'sunfair', field: 14, tiers: true, jv: '3 Miles', series: true },
  { key: 'cwac1', name: 'CWAC League Meet #1', month: 9, day: 12, course: 'league', field: 6, league: true, jv: '2 Miles' },
  { key: 'home', name: 'Huckleberry Ridge Invitational', month: 9, day: 19, course: 'home', home: true, field: 10, jv: '3 Miles', series: true },
  { key: 'hole', name: 'Nike Hole in the Wall XC Invitational', month: 9, day: 26, course: 'hole', field: 16, tiers: true, jv: '3 Miles', series: true },
  { key: 'stump', name: 'Stumptown Showdown', month: 10, day: 3, course: 'stumptown', field: 24, tiers: true, jv: '3 Miles', location: 'Lents Park, Portland, OR 97266', series: true },
  { key: 'cwac2', name: 'CWAC League Meet #2', month: 10, day: 10, course: 'league', field: 6, league: true, jv: '2 Miles' },
  { key: 'cwacc', name: 'CWAC League Championship', month: 10, day: 17, course: 'league', field: 8, league: true, level: 'LEAGUE', series: true },
  { key: 'dist', name: 'WIAA District Championships', month: 10, day: 24, course: 'district', field: 10, level: 'DISTRICT', series: true },
  { key: 'reg', name: 'WIAA Regional Championships', month: 10, day: 31, course: 'regional', field: 16, level: 'REGIONAL', series: true },
  { key: 'state', name: 'WIAA State Championships', month: 11, day: 7, course: 'state', field: 22, level: 'STATE', location: 'Sun Willows Golf Course, Pasco, WA', series: true },
];

const DISTANCES = {
  varsity: { label: '5000 Meters', meters: 5000 },
  mile: { label: '1 Miles', meters: 1609.34 },
  '3 Miles': { label: '3 Miles', meters: 4828.02 },
  '2 Miles': { label: '2 Miles', meters: 3218.68 },
};

const PRACTICE_LOCATIONS = ['Riverside Trail', 'School Track', 'Hillside Park', 'Golf Course Loop', 'Reservoir Road', 'Canyon Rim Trail'];

// Practice-plan building blocks, by weekday (1 = Monday).
const PRACTICE_RUNS = {
  1: [{ run: '4–6 mi easy by feel, then 6 x 100m strides', pre: 'Dynamic warmup, hip circuit', post: 'Core, 10 min foam roll', tier: 'easy', mi: 5 }],
  2: [
    { run: 'Intervals. See your group’s sheet.', pre: '2 mi warmup, drills', post: '1 mi cooldown, core', tier: 'interval', mi: 6 },
  ],
  3: [{ run: '6–8 mi steady on the trail. Conversation pace.', pre: 'Easy jog, mobility', post: 'Stretch', tier: 'easy', mi: 7 }],
  4: [
    { run: 'Tempo: 20–30 min at tempo effort, group by pace.', pre: '2 mi warmup', post: '1.5 mi cooldown, strength circuit', tier: 'tempo', mi: 7 },
    { run: 'Hill circuit: 8 x 90s up, jog down.', pre: '2 mi warmup, drills', post: 'Cooldown jog', tier: 'tempo', mi: 6 },
  ],
  5: [{ run: 'Shakeout 3–4 mi easy + strides. Pasta night at Coach Ron’s.', pre: 'Relaxed jog', post: 'Race plan talk', tier: 'easy', mi: 3.5 }],
};

const ANNOUNCEMENTS = [
  'Bus leaves at 6:45 sharp on Saturday. Ron will not wait. Ron has waited before.',
  'Bring a water bottle with your name on it. Last week we found eleven. Nobody claimed any.',
  'Spikes for Saturday: check your size before you leave practice, not at the course.',
  'Team dinner Friday. Bring a side dish. Not another bag of chips.',
  'Parent volunteers needed for the finish chute. Sign up with Kay.',
  'Picture day is Thursday. Wear your team top. Yes, clean.',
  'Reminder: physicals and forms are due or you do not race. Ron is serious about this one.',
];

const WORKOUTS = [
  { name: 'Tuesday Ladder', volumeTier: 'High', focus: 'VO2 / speed endurance', durationMinutes: 75, distanceMi: 6, details: '400 / 800 / 1200 / 800 / 400 with 90s jog. Last rep is the race rep.' },
  { name: '6 x 1000 Threshold', volumeTier: 'High', focus: 'Threshold', durationMinutes: 80, distanceMi: 8, details: '6 x 1000m at threshold, 90s jog recovery. Hold the same pace on 1 and 6.' },
  { name: 'Hill Repeats (8 x 90s)', volumeTier: 'Medium', focus: 'Strength', durationMinutes: 60, distanceMi: 5, details: 'Strong up, easy jog down. Form over speed.' },
  { name: 'Tempo 25', volumeTier: 'Medium', focus: 'Tempo', durationMinutes: 60, distanceMi: 7, details: '25 minutes continuous at tempo. Even pace beats a fast start.' },
  { name: 'Sunday Long Run', volumeTier: 'High', focus: 'Aerobic base', durationMinutes: 90, distanceMi: 10, details: 'Easy, together, and finished with a smile. Water at the reservoir.' },
  { name: 'Mile Repeats', volumeTier: 'High', focus: 'Race pace', durationMinutes: 75, distanceMi: 8, details: '3 x 1 mile at goal 5K pace, 3 min jog. Boys and girls together.' },
  { name: 'Fartlek Friday-ish', volumeTier: 'Medium', focus: 'Fartlek', durationMinutes: 55, distanceMi: 6, details: '8 x 2 min on / 1 min off, by feel. Pick a tree. Run to the tree.' },
  { name: 'Race-Week Sharpener', volumeTier: 'Low', focus: 'Race sharpening', durationMinutes: 45, distanceMi: 4, details: '4 x 400 at race pace, full recovery. You should feel bored.' },
  { name: 'Easy + Strides', volumeTier: 'Low', focus: 'Recovery', durationMinutes: 40, distanceMi: 4, details: 'Easy run and 6 x 100m strides.' },
  { name: 'Cross-Training Day', volumeTier: 'Low', focus: 'Cross-training', durationMinutes: 45, distanceMi: null, details: 'Pool running or bike for anyone returning from injury.', strength: true },
  { name: 'Strength Circuit', volumeTier: 'Low', focus: 'Strength', durationMinutes: 40, distanceMi: null, details: 'Core, glutes, single-leg work. No phones.', strength: true },
  { name: '800 Repeats', volumeTier: 'High', focus: 'VO2', durationMinutes: 70, distanceMi: 7, details: '6 x 800 at 3K pace, 2 min jog.' },
];

// Custom pace zones, for "Workouts in your own language".
const PACE_ZONES = [
  { abbreviation: 'E', name: 'Easy', sortOrder: 1, ruleType: 'OFFSET', refDistanceMeters: 5000, offsetFastSec: 75, offsetSlowSec: 120, notes: 'You can talk. Most of our miles.' },
  { abbreviation: 'T', name: 'Tempo', sortOrder: 2, ruleType: 'OFFSET', refDistanceMeters: 5000, offsetFastSec: 25, offsetSlowSec: 40, notes: 'Comfortably hard. A few words at a time.' },
  { abbreviation: 'TH', name: 'Threshold', sortOrder: 3, ruleType: 'RANGE', rangeDistanceAMeters: 3000, rangeDistanceBMeters: 5000, notes: 'Between 3K and 5K race pace.' },
  { abbreviation: 'V', name: 'VO2', sortOrder: 4, ruleType: 'RANGE', rangeDistanceAMeters: 1500, rangeDistanceBMeters: 3000, notes: 'Hard and controlled. Reps of 800–1200.' },
  { abbreviation: 'R', name: 'Repetition', sortOrder: 5, ruleType: 'OFFSET', refDistanceMeters: 1600, offsetFastSec: -12, offsetSlowSec: 0, notes: 'Fast and relaxed, full recovery.' },
];

const INJURIES = ['Shin splints', 'IT band tightness', 'Stress reaction (foot)', 'Sprained ankle', 'Plantar fasciitis', 'Achilles soreness', 'Illness (flu)', 'Mono, doctor’s orders', 'Knee tendinitis'];

const REFLECTIONS = {
  process: ['Relax the first mile', 'Run the tangents', 'Stay with the pack through the hill', 'Control the first 800, then go', 'Count strides on the hills', 'Smooth arms, loose hands'],
  outcome: ['Beat my PR', 'Top 5 on the team', 'Break 18:00', 'Break 21:00', 'Score for the team', 'Move up a spot on every mile'],
  worked: ['Went out controlled and passed people late.', 'The pack plan worked. We stayed together through two miles.', 'Warmup was perfect and I felt loose.', 'Hills felt easy because of Thursday’s workout.', 'Fueled well and it showed in the last mile.'],
  didnt: ['Went out too fast and paid for it on the hill.', 'Lost the pack at the mile and never got it back.', 'Legs were heavy. Probably need more sleep.', 'Got boxed in at the start.', 'Wind on the back stretch took more than I expected.'],
  notes: ['Proud of how I finished. Want to be braver earlier.', 'A hard day but I learned a lot about racing in a pack.', 'Coach Ron said the same thing I felt: patience. I will work on it.', 'Felt the best I have all season.', 'Rough one. Back to work Monday.'],
};

module.exports = { TEAM, DEMO_EMAIL_DOMAIN, SCHOOLS, COURSES, MEETS, DISTANCES, PRACTICE_LOCATIONS, PRACTICE_RUNS, ANNOUNCEMENTS, WORKOUTS, PACE_ZONES, INJURIES, REFLECTIONS };
