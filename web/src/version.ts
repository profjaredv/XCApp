// Shown in small type under the sidebar logo (components/Layout.tsx) so a
// coach reporting "did my fix actually deploy?" has something on screen to
// point to, instead of guessing from behavior alone. Bumped by hand with
// every shipped change — deliberately a plain, human-readable string, not
// a git hash: the point is something a non-technical user can read and
// remember, not something they have to copy back to a developer.
//
// major.minor.patch: bump patch for a normal fix/tweak, minor for a new
// feature, major for a breaking/large change — same convention a coach
// would already recognize from other apps' version numbers.
export const APP_VERSION = '1.1.0';
