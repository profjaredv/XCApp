// The data policy, as structured content rather than a wall of prose.
//
// One source, two destinations: the in-app page at /policies and whatever
// the marketing site links to. Keeping it here rather than in two hand-
// written HTML files is the only way the two stay identical, and "the
// website said something different from the app" is exactly the kind of
// discrepancy a district's counsel notices.
//
// NOT LEGAL ADVICE AND NOT A FINISHED POLICY. This is the substance,
// written plainly, for an attorney to review and adjust before it is
// relied on. Sections flagged `needsCounsel` are the ones where the
// wording carries legal weight rather than just describing what the code
// does.

export interface PolicySection {
  id: string;
  heading: string;
  /** Each paragraph is a string; rendered in order. */
  body: string[];
  /** Wording here has legal consequence — flagged in the source so it is
   *  obvious what an attorney must look at, and never rendered to users. */
  needsCounsel?: boolean;
}

export const LAST_REVIEWED = '2026-08-31';

export const OWNERSHIP: PolicySection = {
  id: 'ownership',
  heading: 'Who owns this data',
  body: [
    'Your data is yours. LeadPack stores it and shows it back to you; we do not own it and we do not treat it as ours to reuse.',
    'Team data — rosters, results, attendance, practice plans — belongs to the school or program that created it. If a school runs LeadPack under an agreement with us, we hold that data on the school’s behalf and follow the school’s instructions about it.',
    'An athlete’s own writing — training logs, imported runs, race reflections — belongs to the athlete. A coach sees it only when the athlete chooses to share it, and the athlete can stop sharing or delete it at any time.',
    'You can export everything, at any time, without asking us. Team exports live in Settings; an athlete can export their own record from their profile. That is a standing promise, not a feature we might remove.',
  ],
};

export const USE: PolicySection = {
  id: 'use',
  heading: 'What we do with it',
  needsCounsel: true,
  body: [
    'We use your data to run the product you are paying for: showing results, computing paces and season summaries, taking attendance, and generating the coaching views a coach asks for.',
    'We never sell student data. Not to anyone, for any price, under any structure. There is no version of LeadPack where student data is a revenue source.',
    'We never use student data for advertising, and we do not run behavioural advertising of any kind.',
    'We do not use student data to train AI models. Some features send data to an AI provider to generate a summary for your team, and that provider is contractually barred from training on it. Those features are labelled where they appear, and an AI-generated observation is always about your team, only ever shown to your team.',
    'We collect basic usage telemetry — which screens get opened — to find what is broken or unused. It is never sold and never used for advertising.',
  ],
};

export const VISIBILITY: PolicySection = {
  id: 'visibility',
  heading: 'Who can see what',
  body: [
    'Nothing in LeadPack is public. There is no public profile, no public roster, and no page anyone can reach without signing in and being on the team.',
    'Coaches see their own team. Volunteer coaches see only the groups they lead. Athletes see themselves and whatever teammates have chosen to share. Parents see their own child, read-only, after a coach approves the link.',
    'Training logs and race reflections are the athlete’s. A training log is private until the athlete shares it. A race reflection is shared with the coach by default — because that mirrors handing over a paper sheet — and the athlete can turn that off.',
    'You can see the whole picture for your own account, and change it, on the “Who can see my stuff” screen in your profile.',
  ],
};

export const AGE: PolicySection = {
  id: 'age',
  heading: 'Age and accounts',
  needsCounsel: true,
  body: [
    'LeadPack accounts are for high school athletes — 9th grade and above. A student below 9th grade cannot be invited, cannot claim a profile, and cannot sign in. This is enforced in the software, not just stated here.',
    'A coach of a younger program can still keep athletes on a roster and record their results. In that case the coach enters the information; the student never has an account and we never collect anything from them directly.',
    'Because everyone on a high school roster may be a minor, the protective setting is the default for everyone. Nothing an athlete writes is shared beyond their coach unless they choose it.',
  ],
};

export const RETENTION: PolicySection = {
  id: 'retention',
  heading: 'Keeping and deleting',
  needsCounsel: true,
  body: [
    'We keep team data for as long as the team uses LeadPack, because a coach comparing this year to four years ago is the point of the product.',
    'An athlete can delete their own training logs and reflections at any time, including undoing a whole import at once.',
    'If a school ends its agreement with us, we return or delete its data on request. If you ask us to delete something, we do it — we do not keep a shadow copy.',
    'Deleting a LeadPack account does not delete the team’s roster or results, which belong to the school. It unlinks the person from them.',
  ],
};

export const SUBPROCESSORS: PolicySection = {
  id: 'subprocessors',
  heading: 'Who else touches it',
  needsCounsel: true,
  body: [
    'LeadPack runs on services we pay for and hold accountable. Databases and hosting store your data. A payment processor handles subscriptions and never receives student data. An email service delivers invitations. An AI provider generates team summaries for the features that use them, without training on your data.',
    'We keep a current list of these providers and will give it to any school that asks. We do not add a provider that touches student data without updating that list.',
    'If data is ever exposed in a way it should not have been, we will tell the affected schools and accounts promptly, with what happened and what we did about it.',
  ],
};

export const SECTIONS: PolicySection[] = [
  OWNERSHIP,
  USE,
  VISIBILITY,
  AGE,
  RETENTION,
  SUBPROCESSORS,
];

/** Rendered above the sections. Says what this document is and is not. */
export const PREAMBLE =
  'LeadPack XC holds information about high school athletes. This page says plainly what we hold, who owns it, who can see it, and what we will never do with it. It is written to be read by an athlete, a parent, a coach, or a school administrator — not only by a lawyer.';
