// What kind of data every table in this app holds, and who that answer
// belongs to.
//
// This exists because "is LeadPack FERPA-covered?" has no single answer —
// it depends on the table. A meet result is directory information a school
// may publish without consent (34 CFR 99.3 lists "participation in
// officially recognized activities and sports" by name). An attendance
// record is a protected education record. A training log the athlete typed
// herself is neither, until a signed agreement with the school decides it.
//
// Two things depend on this file:
//   1. The data-practices page an athlete, parent or coach can read
//      in-app. Whatever this file says is what they are told.
//   2. The appendix a district asks for during procurement — "list every
//      category of student data you hold." That list is generated from
//      here, so it cannot drift from the schema.
//
// The test alongside this asserts every model in schema.prisma appears
// below. That is the whole point: a new table that nobody classified is a
// category of student data nobody decided about, and this is where they
// find out. (The same guard on lib/exportManifest.js caught a table the
// week it was added.)

const CLASSES = {
  // Publishable by the school without consent, after the school's own
  // directory-information notice and opt-out window. This is the category
  // Athletic.net's public results database lives in. It is an enumerated
  // list, not a vibe: anything not clearly on 34 CFR 99.3's list is not
  // in it.
  DIRECTORY: 'DIRECTORY',

  // Student data sourced from the school or the coach's work. Protected
  // under FERPA when we hold it on a school's behalf. This is most of the
  // app.
  EDUCATION_RECORD: 'EDUCATION_RECORD',

  // The athlete wrote it about herself. Authorship does NOT change the
  // FERPA analysis — the test is whether we maintain it for a school, not
  // who typed it — but it changes what we owe her: this is the material
  // she can keep private from her own coach, and the material we treat as
  // hers to delete. Tracked as its own class so the set is explicit for
  // counsel rather than buried inside EDUCATION_RECORD.
  ATHLETE_AUTHORED: 'ATHLETE_AUTHORED',

  // Not about a student at all. Accounts, billing, telemetry, the team
  // record itself.
  OPERATIONAL: 'OPERATIONAL',
};

// model -> { class, what, why }
//
// `what` is written for a parent, not a lawyer — it is rendered verbatim
// on the in-app data-practices page. If a sentence here would alarm
// someone who read it in isolation, that is a signal about the feature,
// not about the sentence.
const CLASSIFICATION = {
  // --- Operational: nothing about a student -------------------------------
  User: {
    class: CLASSES.OPERATIONAL,
    what: 'Sign-in accounts — name and email.',
    why: 'An account is not a student record; it is how a person logs in. Athletes are linked to accounts, never merged into them.',
  },
  Team: {
    class: CLASSES.OPERATIONAL,
    what: 'The team itself — school name, season, join code, subscription status.',
    why: 'About the organization, not any student.',
  },
  TeamMember: {
    class: CLASSES.OPERATIONAL,
    what: 'Which accounts belong to a team, and in what role.',
    why: 'Staff membership and permissions. Athlete roster membership lives in SeasonRoster.',
  },
  TeamClaim: {
    class: CLASSES.OPERATIONAL,
    what: 'A one-time link letting a coach claim their school.',
    why: 'Account setup for an adult. It carries a coach\'s email and a one-time token, and no student data at all.',
  },
  StaffInvite: {
    class: CLASSES.OPERATIONAL,
    what: 'A pending invitation to a coach or volunteer.',
    why: 'Onboarding for an adult coach or volunteer. Names no student.',
  },
  Course: {
    class: CLASSES.OPERATIONAL,
    what: 'Cross-country courses and their distances.',
    why: 'A shared lookup table. No student appears in it.',
  },
  PracticeLocation: {
    class: CLASSES.OPERATIONAL,
    what: 'Where the team practices.',
    why: 'A place, not a person — an address the team meets at, with no student attached.',
  },
  Equipment: {
    class: CLASSES.OPERATIONAL,
    what: 'Team-owned uniforms and gear.',
    why: 'Inventory. Who has which item is EquipmentAssignment.',
  },
  Feedback: {
    class: CLASSES.OPERATIONAL,
    what: 'Bug reports and suggestions sent to us.',
    why: 'Correspondence with LeadPack, deliberately not part of a team export.',
  },
  PageView: {
    class: CLASSES.OPERATIONAL,
    what: 'Which screens get opened, for finding what is broken or unused.',
    why: 'Product telemetry. Never sold, never used for advertising.',
  },
  PaceZone: {
    class: CLASSES.OPERATIONAL,
    what: "A team's own training-pace vocabulary and how each zone is calculated.",
    why: "The coach's methodology, not student data.",
  },
  WorkoutTemplate: {
    class: CLASSES.OPERATIONAL,
    what: 'Reusable workout definitions.',
    why: 'A plan, written before anyone runs it.',
  },
  TimerSession: {
    class: CLASSES.OPERATIONAL,
    what: 'A stopwatch session in progress at a meet or workout.',
    why: 'Scratch state while timing. Finished times become Results or IntervalSessionEntries.',
  },

  // --- Directory: publishable by the school -------------------------------
  Athlete: {
    class: CLASSES.DIRECTORY,
    what: 'Name, preferred name, class year and gender.',
    why: 'Name, grade level and participation in a school sport are directory information under 34 CFR 99.3 — the same fields already published on public results sites.',
  },
  Meet: {
    class: CLASSES.DIRECTORY,
    what: 'Meet name, date, location and logistics.',
    why: 'A public schedule. Contains no student data of its own.',
  },
  Race: {
    class: CLASSES.DIRECTORY,
    what: 'The individual races within a meet.',
    why: 'Event definitions, publicly posted by every meet host.',
  },
  Result: {
    class: CLASSES.DIRECTORY,
    what: 'Finish times and places.',
    why: 'Participation and performance in an officially recognized sport — directory information, and already public on results sites.',
  },
  RaceSplit: {
    class: CLASSES.DIRECTORY,
    what: 'Mile and interval splits within a race.',
    why: 'Part of the same publicly-timed performance as the finish time.',
  },
  Split: {
    class: CLASSES.DIRECTORY,
    what: 'Split times recorded against a result.',
    why: 'Same as RaceSplit — detail on a public performance.',
  },
  FieldResult: {
    class: CLASSES.DIRECTORY,
    what: 'The full finish list of a race, including runners from other schools.',
    why: 'Published meet results, uploaded as-is. No LeadPack account is required to appear here, and nothing private is attached to these rows.',
  },
  MeetGroup: {
    class: CLASSES.DIRECTORY,
    what: 'Groupings of meets for season comparisons.',
    why: 'A folder over meets that are already public. Holds no student data of its own.',
  },
  MeetGroupRace: {
    class: CLASSES.DIRECTORY,
    what: 'Which races belong to a meet group.',
    why: 'A folder over races that are already public. Holds no student data of its own.',
  },
  MeetPerformanceMetrics: {
    class: CLASSES.DIRECTORY,
    what: 'Computed summaries of a meet — team average, spread, best performer.',
    why: 'Arithmetic over public results. Adds no new fact about anyone.',
  },
  Season: {
    class: CLASSES.DIRECTORY,
    what: 'The seasons a team has run.',
    why: 'Dates of a school activity.',
  },

  // --- Education records: school-sourced, protected ------------------------
  SeasonRoster: {
    class: CLASSES.EDUCATION_RECORD,
    what: 'Who was on the roster each season, their grade that year, and captaincy.',
    why: 'Enrollment in a school activity, maintained on the school\'s behalf. Grade level alone is directory information, but this row also carries the coach\'s roster decisions.',
  },
  AttendanceSession: {
    class: CLASSES.EDUCATION_RECORD,
    what: 'Practices and events attendance was taken at.',
    why: 'Attendance is a school record, full stop.',
  },
  AttendanceRecord: {
    class: CLASSES.EDUCATION_RECORD,
    what: 'Whether an athlete was present, absent or excused, and any note.',
    why: 'A protected education record. Never directory information, and never shown to other athletes.',
  },
  Group: {
    class: CLASSES.EDUCATION_RECORD,
    what: 'Training groups and squads within a team.',
    why: 'A coach\'s grouping decision about students.',
  },
  GroupLeader: {
    class: CLASSES.EDUCATION_RECORD,
    what: 'Which staff lead which group.',
    why: 'Staff assignment, but it defines who can see which athletes, so it is reviewed as student-scoped.',
  },
  GroupMembership: {
    class: CLASSES.EDUCATION_RECORD,
    what: 'Which athletes are in which training group.',
    why: 'A placement decision about a student.',
  },
  MeetEntry: {
    class: CLASSES.EDUCATION_RECORD,
    what: 'Who is entered, an alternate, or not competing at a meet.',
    why: 'A selection decision about a student. Public once the meet runs; private before it.',
  },
  MeetPlan: {
    class: CLASSES.EDUCATION_RECORD,
    what: "A coach's plan and notes for a meet.",
    why: 'Coach working material that names students.',
  },
  PracticePlan: {
    class: CLASSES.EDUCATION_RECORD,
    what: 'Planned practices and the workouts assigned.',
    why: 'Instructional material, and it assigns work to named students.',
  },
  IntervalSession: {
    class: CLASSES.EDUCATION_RECORD,
    what: 'A workout as actually run, with its reps and targets.',
    why: 'The coach ran and recorded this; it is their record of instruction.',
  },
  IntervalSessionEntry: {
    class: CLASSES.EDUCATION_RECORD,
    what: 'One athlete\'s recorded reps in a workout.',
    why: 'Coach-recorded performance in practice — not a public result, and not the athlete\'s own log.',
  },
  CoachUpAcknowledgement: {
    class: CLASSES.EDUCATION_RECORD,
    what: 'That a coach saw and acted on a flag about an athlete.',
    why: 'A record of coach attention to a specific student.',
  },
  AthleteSeasonMetrics: {
    class: CLASSES.EDUCATION_RECORD,
    what: 'Computed per-athlete season summaries — improvement, consistency, bests.',
    why: 'Derived from public results, but it is an evaluative profile of a student and is treated as one.',
  },
  TeamSeasonMetrics: {
    class: CLASSES.EDUCATION_RECORD,
    what: 'Team-level season summaries.',
    why: 'Aggregate, but computed over a small enough group that it is handled with the roster it came from.',
  },
  AiInsightSnapshot: {
    class: CLASSES.EDUCATION_RECORD,
    what: 'AI-generated coaching observations about the team and its athletes.',
    why: 'An evaluative statement about students. Generated for this team only, never used to train any model — see the data-practices page.',
  },
  EquipmentAssignment: {
    class: CLASSES.EDUCATION_RECORD,
    what: 'Which athlete has which uniform, and what is outstanding.',
    why: 'An obligation attached to a named student.',
  },
  GuardianLink: {
    class: CLASSES.EDUCATION_RECORD,
    what: 'An approved link between a parent account and their child.',
    why: 'A parental relationship record, coach-approved. Read-only by design — nothing in this app writes through it.',
  },
  AthleteInvite: {
    class: CLASSES.EDUCATION_RECORD,
    what: 'A pending invitation for an athlete to claim their profile.',
    why: 'Names a student and carries their email.',
  },
  AthleteClaim: {
    class: CLASSES.EDUCATION_RECORD,
    what: 'A request from a signed-in person to be matched to a roster entry.',
    why: 'An identity assertion about a student, pending coach approval.',
  },

  // --- Athlete-authored: hers ---------------------------------------------
  TrainingLog: {
    class: CLASSES.ATHLETE_AUTHORED,
    what: 'Runs the athlete logged or imported — date, distance, time, and her own notes.',
    why: 'Private to her unless she shares it. A coach sees a log only when she has opted that log in.',
  },
  TrainingLogImportBatch: {
    class: CLASSES.ATHLETE_AUTHORED,
    what: 'A record that she imported a file, so the import can be undone.',
    why: 'Bookkeeping for her own action. Never shown to a coach.',
  },
  RaceReflection: {
    class: CLASSES.ATHLETE_AUTHORED,
    what: 'Her goals before a race and her honest account of it afterward.',
    why: 'The most personal thing in the app. Shared with the coach by default because that mirrors handing over a paper sheet, and she can turn that off.',
  },
};

/** Models grouped by class, for rendering. */
function byClass() {
  const out = { DIRECTORY: [], EDUCATION_RECORD: [], ATHLETE_AUTHORED: [], OPERATIONAL: [] };
  for (const [model, entry] of Object.entries(CLASSIFICATION)) {
    out[entry.class].push({ model, ...entry });
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.model.localeCompare(b.model));
  return out;
}

/** The set counsel needs to look at: what a signed school agreement would
 *  reclassify. Athlete-authored data is the only class whose FERPA status
 *  turns on whether we hold it for a school. */
function needsAgreementReview() {
  return Object.entries(CLASSIFICATION)
    .filter(([, e]) => e.class === CLASSES.ATHLETE_AUTHORED)
    .map(([model]) => model)
    .sort();
}

module.exports = { CLASSES, CLASSIFICATION, byClass, needsAgreementReview };
