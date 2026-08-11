import { createBrowserRouter } from 'react-router-dom';
import App from '../App';
import { LoginPage, RegisterPage, OnboardingPage, ProfilePage, AnalyticsPage, InviteAcceptPage, StaffInviteAcceptPage, TeamAthleteProfilePage, JoinTeamPage, FixCoachRolePage, MyProgressPage } from '../pages';
import UpgradeRolePage from '../pages/UpgradeRolePage';
import ResultsGridPage from '../pages/ResultsGridPage';
import ToolsPage from '../pages/ToolsPage';
import DataManagementPage from '../pages/DataManagementPage';
import SettingsPage from '../pages/SettingsPage';
import RosterPage from '../pages/RosterPage';
import GroupsPage from '../pages/GroupsPage';
import PracticePlansPage from '../pages/PracticePlansPage';
import MeetOpsPage from '../pages/MeetOpsPage';
import EquipmentPage from '../pages/EquipmentPage';
import FeedbackPage from '../pages/FeedbackPage';
import CoachesToolsPage from '../pages/CoachesToolsPage';
import RaceVisualizationPage from '../pages/RaceVisualizationPage';
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
        path: '/login',
        element: <LoginPage />,
      },
      {
        path: '/register',
        element: <RegisterPage />,
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
          // Identity-level, not team data — deliberately outside /t/:athleticTeamId.
          {
            path: '/profile',
            element: <ProfilePage />,
          },
          {
            path: '/upgrade-role',
            element: <UpgradeRolePage />,
          },
          // Pre-team-scoped-URL paths: bounce old bookmarks/links to the
          // equivalent /t/:athleticTeamId route instead of 404ing.
          { path: '/analytics', element: <LegacyRedirect toSubpath="/analytics" /> },
          { path: '/dashboard', element: <LegacyRedirect toSubpath="/analytics" /> },
          { path: '/enhanced-analytics', element: <LegacyRedirect toSubpath="/analytics" /> },
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
              // All other routes with Layout (sidebar)
              {
                element: <Layout />,
                children: [
                  {
                    path: 'analytics',
                    element: <AnalyticsPage />,
                  },
                  {
                    path: 'groups',
                    element: <GroupsPage />,
                  },
                  {
                    path: 'practice-plans',
                    element: <PracticePlansPage />,
                  },
                  {
                    path: 'meets',
                    element: <MeetOpsPage />,
                  },
                  {
                    path: 'equipment',
                    element: <EquipmentPage />,
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
