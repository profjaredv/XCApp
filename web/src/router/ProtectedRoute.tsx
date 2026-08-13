import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { WalkthroughProvider } from '../contexts/WalkthroughProvider';
import { WalkthroughDialog } from '../components/WalkthroughDialog';

const ProtectedRoute: React.FC = () => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div>Loading...</div></div>;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Mounted here, not in Layout — a brand-new staff member lands on
  // /profile right after accepting their invite, which doesn't use Layout,
  // but is still under this route. Every authenticated destination an
  // invite can drop someone on is a descendant of this one.
  return (
    <WalkthroughProvider>
      <Outlet />
      <WalkthroughDialog />
    </WalkthroughProvider>
  );
};

export default ProtectedRoute;
