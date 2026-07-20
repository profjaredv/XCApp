import React, { useEffect } from 'react';
import { AuthView } from '@neondatabase/neon-js/auth/react/ui';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Uses Neon Auth's (Better Auth) prebuilt <AuthView/> component — see
// LoginPage.tsx. `redirectTo="/register"` keeps AuthView's own post-sign-up
// navigation a no-op; the effect below sends new users to /onboarding once
// our /users/me sync populates currentUser, matching the old afterSignUp flow.
const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  useEffect(() => {
    if (currentUser) {
      navigate('/onboarding', { replace: true });
    }
  }, [currentUser, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Card className="mx-auto max-w-sm w-full">
        <CardHeader>
          <CardTitle className="text-xl">Sign Up</CardTitle>
          <CardDescription>Create an account</CardDescription>
        </CardHeader>
        <CardContent>
          <AuthView pathname="sign-up" redirectTo="/register" />
        </CardContent>
      </Card>
    </div>
  );
};

export default RegisterPage;
