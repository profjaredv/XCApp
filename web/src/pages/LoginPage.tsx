import React, { useEffect } from 'react';
import { AuthView } from '@neondatabase/neon-js/auth/react/ui';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Uses Neon Auth's (Better Auth) prebuilt <AuthView/> component rather than a
// hand-rolled email/password form. `redirectTo="/login"` keeps AuthView's own
// post-sign-in navigation a no-op so the effect below — which redirects based
// on whether the user already has a team — is the one that actually moves
// the user away from this page, once our own /users/me sync has run.
//
// `pathname="login"` matches the `viewPaths.SIGN_IN` override set on
// NeonAuthUIProvider in main.tsx (default is "sign-in", which doesn't exist
// as a route in our router) — this is also what the internal "Sign up"
// footer link resolves against, so it must stay in sync with the route path.
//
// AuthView renders its own Card with its own header — don't wrap it in
// another Card here, that produced a double-header/nested-card layout.
const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  useEffect(() => {
    if (currentUser) {
      const redirectUrl = sessionStorage.getItem('redirectUrl');
      sessionStorage.removeItem('redirectUrl');

      if (redirectUrl) {
        navigate(redirectUrl, { replace: true });
      } else if (!currentUser.team) {
        navigate('/onboarding', { replace: true });
      } else {
        navigate(`/t/${currentUser.team.athleticTeamId}/analytics`, { replace: true });
      }
    }
  }, [currentUser, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-slate-50 via-white to-secondary p-4">
      <Link to="/" className="flex items-center gap-2">
        <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-lg shadow-primary/20">
          LP
        </div>
        <span className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
          LeadPack XC
        </span>
      </Link>
      <AuthView pathname="login" redirectTo="/login" />
    </div>
  );
};

export default LoginPage;
