import { createBrowserRouter } from 'react-router-dom';
import App from '../App';
import { LoginPage, RegisterPage, OnboardingPage, TeamPage, ProfilePage, ImportPage, AnalyticsPage, InviteAcceptPage, TeamAthleteProfilePage, JoinTeamPage, FixCoachRolePage } from '../pages';
import UpgradeRolePage from '../pages/UpgradeRolePage';
import ResultsGridPage from '../pages/ResultsGridPage';
import ToolsPage from '../pages/ToolsPage';
import AthleteProfilePage from '../pages/AthleteProfilePage';
import DataManagementPage from '../pages/DataManagementPage';
import SettingsPage from '../pages/SettingsPage';
import CoachesToolsPage from '../pages/CoachesToolsPage';
import RaceVisualizationPage from '../pages/RaceVisualizationPage';
import LandingPage from '../pages/LandingPage';
// Enhanced analytics now integrated into main analytics page
import ProtectedRoute from './ProtectedRoute';
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
      {
        path: '/onboarding',
        element: <OnboardingPage />,
      },
      {
        path: '/invite/:token',
        element: <InviteAcceptPage />,
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
          // Race visualization - standalone without Layout (no sidebar)
          {
            path: '/race-visualization',
            element: <RaceVisualizationPage />,
          },
          // All other routes with Layout (sidebar)
          {
            element: <Layout />,
            children: [
              {
                path: '/analytics',
                element: <AnalyticsPage />,
              },
              {
                path: '/dashboard',
                element: <AnalyticsPage />,
              },
              // Enhanced analytics now integrated into main analytics page - redirect to analytics
              {
                path: '/enhanced-analytics',
                element: <AnalyticsPage />,
              },
              {
                path: '/team',
                element: <TeamPage />,
              },
              {
                path: '/profile',
                element: <ProfilePage />,
              },
              {
                path: '/settings',
                element: <SettingsPage />,
              },
              {
                path: '/import',
                element: <ImportPage />,
              },
              {
                path: '/results-grid',
                element: <ResultsGridPage />,
              },
              {
                path: '/tools',
                element: <ToolsPage />,
              },
              {
                path: '/upgrade-role',
                element: <UpgradeRolePage />,
              },
              {
                path: '/athlete/:athleteId',
                element: <AthleteProfilePage />,
              },
              {
                path: '/team/:teamId/athlete/:athleteId',
                element: <TeamAthleteProfilePage />,
              },
              {
                path: '/data-management',
                element: <DataManagementPage />,
              },
              {
                path: '/coaches-tools',
                element: <CoachesToolsPage />,
              },
            ],
          },
        ],
      },
    ],
  },
]);
