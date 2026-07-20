import React, { useEffect } from 'react';
import { AuthView } from '@neondatabase/neon-js/auth/react/ui';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Uses Neon Auth's (Better Auth) prebuilt <AuthView/> component rather than a
// hand-rolled email/password form. `redirectTo="/login"` keeps AuthView's own
// post-sign-in navigation a no-op so the effect below — which redirects based
// on whether the user already has a team — is the one that actually moves
// the user away from this page, once our own /users/me sync has run.
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
        navigate('/analytics', { replace: true });
      }
    }
  }, [currentUser, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Card className="mx-auto max-w-sm w-full">
        <CardHeader>
          <CardTitle className="text-2xl">Login</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <AuthView pathname="sign-in" redirectTo="/login" />
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;
