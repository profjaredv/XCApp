import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from '../App';
import { AuthFlowPage, LoginPage, RegisterPage, OnboardingPage, ProfilePage, AnalyticsPage, InviteAcceptPage, StaffInviteAcceptPage, ClaimTeamPage, TeamAthleteProfilePage, JoinTeamPage, FixCoachRolePage, MyProgressPage, PoliciesPage, AdminDashboardPage, StartPage, BandTrendsPage, FieldResultsPage } from '../pages';
import CheckoutPage from '../pages/CheckoutPage';
import { FeatureGate } from '../components/FeatureGate';
import GroupDayPage from '../pages/GroupDayPage';
import PostSeasonPage from '../pages/PostSeasonPage';
import StrategyPage from '../pages/StrategyPage';
import UpgradeRolePage from '../pages/UpgradeRolePage';
import ResultsGridPage from '../pages/ResultsGridPage';
import ToolsPage from '../pages/ToolsPage';
import DataManagementPage from '../pages/DataManagementPage';
import SettingsPage from '../pages/SettingsPage';
import RosterPage from '../pages/RosterPage';
import TodayPage from '../pages/TodayPage';
import AthleteJourneyPage from '../pages/AthleteJourneyPage';
import GroupsPage from '../pages/GroupsPage';
import SchedulePage from '../pages/SchedulePage';
import MeetsPage from '../pages/MeetsPage';
import MeetDetailPage from '../pages/MeetDetailPage';
import EquipmentPage from '../pages/EquipmentPage';
import IntervalSessionsPage from '../pages/IntervalSessionsPage';
import IntervalSessionManagePage from '../pages/IntervalSessionManagePage';
import AttendancePage from '../pages/AttendancePage';
import AttendanceSessionPage from '../pages/AttendanceSessionPage';
import FeedbackPage from '../pages/FeedbackPage';
import CoachesToolsPage from '../pages/CoachesToolsPage';
import RaceVisualizationPage from '../pages/RaceVisualizationPage';
import SplitsEntryPage from '../pages/SplitsEntryPage';
import RaceLiveTimerPage from '../pages/RaceLiveTimerPage';
import LandingPage from '../pages/LandingPage';
// Enhanced analytics now integrated into main analytics page
import ProtectedRoute from './ProtectedRoute';
import TeamRouteGuard from './TeamRouteGuard';
import LegacyRedirect from './LegacyRedirect';
import Layout from '../components/Layout';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      // Public routes
      {
        index: true,
        path: '/',
        element: <LandingPage />,
      },
      {
        // Public on purpose: a parent or athletic director evaluating
        // LeadPack should be able to read what we do with student data
        // without creating an account.
        path: '/policies',
        element: <PoliciesPage />,
      },
      {
        // Sign-up starts here, not at /register: it asks who you are and
        // which team before the account exists, so nothing downstream has
        // to guess. See StartPage.tsx.
        path: '/start',
        element: <StartPage />,
      },
      {
        path: '/login',
        element: <LoginPage />,
      },
      {
        path: '/register',
        element: <RegisterPage />,
      },
      // The auth library's own default view paths (see
      // @daveyplate/better-auth-ui lib/view-paths.ts). The sign-in form
      // links straight to these, so a missing route is a dead end rather
      // than a cosmetic gap — /forgot-password previously fell through to
      // the authenticated shell and surfaced as an authorization error.
      {
        path: '/forgot-password',
        element: <AuthFlowPage pathname="forgot-password" />,
      },
      {
        path: '/reset-password',
        element: <AuthFlowPage pathname="reset-password" />,
      },
      {
        path: '/auth/callback',
        element: <AuthFlowPage pathname="callback" />,
      },
      // Not team-scoped: reachable before a coach has (or knows) a team.
      {
        path: '/onboarding',
        element: <OnboardingPage />,
      },
      {
        path: '/invite/:token',
        element: <InviteAcceptPage />,
      },
      {
        path: '/staff-invite/:token',
        element: <StaffInviteAcceptPage />,
      },
      // F3 (LeadPack Master Build Handoff): public — shows the team name
      // and masked email before sign-in. See routes/teamClaims.js.
      {
        path: '/claim/:token',
        element: <ClaimTeamPage />,
      },
      {
        path: '/join-team',
        element: <JoinTeamPage />,
      },
      {
        path: '/fix-coach-role',
        element: <FixCoachRolePage />,
      },
      // Protected routes
      {
        element: <ProtectedRoute />,
        children: [
          // Identity-level, not team data — deliberately outside
          // /t/:athleticTeamId (reachable even for a signed-in user who
          // hasn't joined/created a team yet). Still wrapped in Layout so
          // it gets the same sidebar/header chrome as every other screen
          // instead of rendering as a bare, nav-less page — useTeamPath's
          // athleticTeamId falls back to the user's own team from
          // AuthContext here since there's no :athleticTeamId URL param.
          {
            element: <Layout />,
            children: [
              {
                path: '/profile',
                element: <ProfilePage />,
              },
            ],
          },
          {
            path: '/upgrade-role',
            element: <UpgradeRolePage />,
          },
          // Pre-team-scoped-URL paths: bounce old bookmarks/links to the
          // equivalent /t/:athleticTeamId route instead of 404ing.
          // These three were all pre-team-scoped-URL aliases for "the
          // default view when you sign in" — that's Today now (Workstream
          // A), not Analytics, so they bounce to the bare team path.
          { path: '/analytics', element: <LegacyRedirect toSubpath="" /> },
          { path: '/dashboard', element: <LegacyRedirect toSubpath="" /> },
          { path: '/enhanced-analytics', element: <LegacyRedirect toSubpath="" /> },
          // '/team' (bare roster listing) was merged into '/roster'; only
          // 'team/athlete/:id' still lives under the 'team' subpath.
          { path: '/team', element: <LegacyRedirect toSubpath="/roster" /> },
          { path: '/roster', element: <LegacyRedirect toSubpath="/roster" /> },
          { path: '/results-grid', element: <LegacyRedirect toSubpath="/results-grid" /> },
          { path: '/tools', element: <LegacyRedirect toSubpath="/tools" /> },
          { path: '/coaches-tools', element: <LegacyRedirect toSubpath="/coaches-tools" /> },
          { path: '/data-management', element: <LegacyRedirect toSubpath="/data-management" /> },
          { path: '/settings', element: <LegacyRedirect toSubpath="/settings" /> },
          { path: '/feedback', element: <LegacyRedirect toSubpath="/feedback" /> },
          // F4: the Stripe Payment Link's static "after payment" redirect
          // target — it can't know which team's /checkout to land on ahead
          // of time (the link is shared across every team), so it always
          // points here and this bounces to the signed-in coach's own team,
          // carrying the ?session_id= query param through via location.search.
          { path: '/checkout-complete', element: <LegacyRedirect toSubpath="/checkout" /> },
          { path: '/race-visualization', element: <LegacyRedirect toSubpath="/race-visualization" /> },
          {
            path: '/athlete/:athleteId',
            element: <LegacyRedirect toSubpath={(p) => `/athlete/${p.athleteId}`} />,
          },
          // Every screen that shows a specific team's data lives under this
          // prefix, keyed by the Athletic.net team ID rather than the internal
          // database UUID: it's globally unique (one team can ever claim a
          // given Athletic.net ID) and, unlike a UUID, means something to a
          // coach who sees it in a shared link. TeamRouteGuard enforces this
          // matches the signed-in coach's own team — it's a redirect-to-the-
          // right-place guard, not an authorization check; every API call
          // underneath is still scoped server-side by the session, never by
          // this URL segment.
          {
            path: '/t/:athleticTeamId',
            element: <TeamRouteGuard />,
            children: [
              // Race visualization - standalone without Layout (no sidebar)
              {
                path: 'race-visualization',
                element: <RaceVisualizationPage />,
              },
              // Interval sessions (Coaches Tools) - standalone without
              // Layout too, opened full screen from CoachesToolsPage; its
              // own Close button navigates back there.
              {
                path: 'interval-sessions',
                element: <IntervalSessionsPage />,
              },
              // Manage entries for one interval session — its own
              // full-screen route so it doesn't compete with the list of
              // every other session on the same screen (especially on
              // mobile). Close navigates back to the list above.
              {
                path: 'interval-sessions/:sessionId',
                element: <IntervalSessionManagePage />,
              },
              // Attendance tracker — standalone without Layout too, opened
              // full screen from Schedule's "Attendance" header button.
              // Same list/detail split as interval sessions, for the same
              // "one session shouldn't compete with every other session for
              // phone screen space" reason.
              {
                path: 'attendance',
                element: (
                  <FeatureGate feature="attendance">
                    <AttendancePage />
                  </FeatureGate>
                ),
              },
              {
                path: 'attendance/:sessionId',
                element: (
                  <FeatureGate feature="attendance">
                    <AttendanceSessionPage />
                  </FeatureGate>
                ),
              },
              // Splits entry grid (C6) - standalone without Layout too,
              // opened full screen from a race's context menu. Its own
              // Close button navigates back to wherever it was opened from.
              {
                path: 'race/:raceId/splits',
                element: <SplitsEntryPage />,
              },
              // Live finish-order capture — standalone without Layout,
              // opened full screen from a race's "Live Timer" button on
              // MeetDetailPage. Its own Close button navigates back there.
              {
                path: 'race/:raceId/timer',
                element: <RaceLiveTimerPage />,
              },
              // All other routes with Layout (sidebar)
              {
                element: <Layout />,
                children: [
                  // Workstream A (LeadPack Master Build Handoff): Today
                  // replaces the old redirect-to-/analytics as the index
                  // route. Also reachable at an explicit /today path so
                  // links (and the nav item) don't depend on the index
                  // route resolving.
                  {
                    index: true,
                    element: <TodayPage />,
                  },
                  {
                    path: 'today',
                    element: <TodayPage />,
                  },
                  {
                    path: 'analytics',
                    element: <AnalyticsPage />,
                  },
                  {
                    path: 'band-trends',
                    element: <BandTrendsPage />,
                  },
                  {
                    // The Season screens, asked only of the races at the
                    // end of the year. Tabs live in ?tab= like Season's.
                    path: 'postseason',
                    element: <PostSeasonPage />,
                  },
                  {
                    // A team that doesn't upload full fields gets an
                    // explanation here rather than a screen whose every
                    // request 403s. Same for equipment below.
                    path: 'field-results',
                    element: (
                      <FeatureGate feature="fieldResults">
                        <FieldResultsPage />
                      </FeatureGate>
                    ),
                  },
                  {
                    path: 'groups',
                    element: <GroupsPage />,
                  },
                  {
                    // One group on one afternoon: who is here, what they
                    // last ran, and a sheet built from whoever turned up.
                    // Deliberately not behind the attendance feature flag —
                    // the roster and last times are the point even for a
                    // team that doesn't take attendance.
                    path: 'group/:groupId',
                    element: <GroupDayPage />,
                  },
                  // Schedule rework: Practice and Meets merged into one
                  // month calendar. 'practice-plans' redirects old
                  // bookmarks/links; 'meets' stays a real route (deep-linked
                  // into from a Schedule day) even though it's no longer a
                  // top-level nav item. 'meet/:meetId' is the simplified
                  // single-meet detail a click on the list opens.
                  {
                    path: 'practice-plans',
                    element: <Navigate to="../schedule" replace />,
                  },
                  {
                    path: 'schedule',
                    element: <SchedulePage />,
                  },
                  {
                    path: 'meets',
                    element: <MeetsPage />,
                  },
                  {
                    path: 'meet/:meetId',
                    element: <MeetDetailPage />,
                  },
                  {
                    path: 'equipment',
                    element: (
                      <FeatureGate feature="equipment">
                        <EquipmentPage />
                      </FeatureGate>
                    ),
                  },
                  {
                    path: 'roster',
                    element: <RosterPage />,
                  },
                  {
                    path: 'me',
                    element: <MyProgressPage />,
                  },
                  {
                    path: 'feedback',
                    element: <FeedbackPage />,
                  },
                  {
                    path: 'settings',
                    element: <SettingsPage />,
                  },
                  {
                    // Platform dashboard. The real gate is
                    // requireSuperAdmin on every /api/admin route; the page
                    // itself just shows a sentence to anyone else.
                    path: 'admin',
                    element: <AdminDashboardPage />,
                  },
                  {
                    // F4: the required-every-time checkout step. Reachable
                    // even at plan: 'pending' — only join codes/invites are
                    // 402'd server-side (lib/entitlements.js), not this page.
                    path: 'checkout',
                    element: <CheckoutPage />,
                  },
                  {
                    path: 'results-grid',
                    element: <ResultsGridPage />,
                  },
                  {
                    path: 'tools',
                    element: <ToolsPage />,
                  },
                  {
                    // 'athlete/:athleteId' (a half-built, always-"coming
                    // soon" placeholder page reachable only via legacy
                    // bookmarks) and 'team/athlete/:athleteId' (the real,
                    // finished detail page every in-app link actually uses)
                    // were two different screens for the same thing —
                    // consolidated onto the one that works.
                    path: 'athlete/:athleteId',
                    element: <TeamAthleteProfilePage />,
                  },
                  {
                    // E1: multi-season rank/band/PR/course spine for one
                    // athlete. Stays inside Layout — it's a viewing page,
                    // not a capture tool, so it doesn't follow the
                    // RaceVisualization/IntervalSessions standalone pattern.
                    path: 'athlete/:athleteId/journey',
                    element: <AthleteJourneyPage />,
                  },
                  {
                    // "Where are the next 20 seconds?" — reachable by the
                    // athlete themselves, their coach, or an approved
                    // guardian. The API enforces that, not this route.
                    path: 'athlete/:athleteId/strategy',
                    element: <StrategyPage />,
                  },
                  {
                    path: 'team/athlete/:athleteId',
                    element: <TeamAthleteProfilePage />,
                  },
                  {
                    path: 'data-management',
                    element: <DataManagementPage />,
                  },
                  {
                    path: 'coaches-tools',
                    element: <CoachesToolsPage />,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);
