// Shown in small type under the sidebar logo (components/Layout.tsx) so a
// coach reporting "did my fix actually deploy?" has something on screen to
// point to, instead of guessing from behavior alone. Bumped by hand with
// every shipped change — deliberately a plain, human-readable string, not
// a git hash: the point is something a non-technical user can read and
// remember ("it said 1.1 before, now it says 1.2"), not something they
// have to copy back to a developer.
export const APP_VERSION = '1.0';
