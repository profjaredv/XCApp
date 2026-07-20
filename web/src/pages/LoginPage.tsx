import React, { useEffect } from 'react';
import { SignIn } from '@stackframe/react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Uses Stack Auth's prebuilt <SignIn/> component rather than a hand-rolled
// email/password form — see MIGRATION_STATUS.md for why (the previous
// Supabase-based form isn't portable 1:1, and Stack's own component is the
// verified, supported way to do this).
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
          <SignIn />
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;
