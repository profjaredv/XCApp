import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// LeadPack Track & Field handoff: gates every /tf/* route behind the
// platform super-admin allowlist (backend/lib/superAdmin.js,
// SUPER_ADMIN_EMAILS). Deliberately a REDIRECT, not just a hidden nav
// item or an inline "not available" message like AdminDashboardPage's —
// the handoff's own instructions are explicit that the frontend gate must
// reject, not merely hide, since this is a temporary build-time
// mechanism for shipping in-progress Track & Field work straight into
// production for Jared to click through.
//
// This is UX only. The real boundary is requireSuperAdmin on every
// /api/track/* route (backend/routes/track.js) — every request here still
// re-checks server-side regardless of what this guard did or didn't catch,
// same relationship TeamRouteGuard has to its own server-side checks.
//
// This gate is temporary. It must come off (or be replaced by Section 1b's
// real sport-scoped TeamMember permissions) before Track & Field goes live
// to actual coaches — see NOTES.md.
const SuperAdminRouteGuard: React.FC = () => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Loading...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (!currentUser.isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default SuperAdminRouteGuard;
