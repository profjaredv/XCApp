import React, { useEffect } from 'react';
import { AuthView } from '@neondatabase/neon-js/auth/react/ui';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Uses Neon Auth's (Better Auth) prebuilt <AuthView/> component — see
// LoginPage.tsx. `redirectTo="/register"` keeps AuthView's own post-sign-up
// navigation a no-op; the effect below sends new users to /onboarding once
// our /users/me sync populates currentUser, matching the old afterSignUp flow.
//
// `pathname="register"` matches the `viewPaths.SIGN_UP` override set on
// NeonAuthUIProvider in main.tsx — see the comment in LoginPage.tsx.
//
// AuthView renders its own Card with its own header — don't wrap it in
// another Card here, that produced a double-header/nested-card layout.
const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  useEffect(() => {
    if (currentUser) {
      navigate('/onboarding', { replace: true });
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
      <AuthView pathname="register" redirectTo="/register" />
    </div>
  );
};

export default RegisterPage;
