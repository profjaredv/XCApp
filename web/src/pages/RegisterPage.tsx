import React from 'react';
import { SignUp } from '@stackframe/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Uses Stack Auth's prebuilt <SignUp/> component — see LoginPage.tsx and
// MIGRATION_STATUS.md. Stack's `afterSignUp` URL (configured in
// stackClientApp.ts) sends new users to /onboarding, matching the old flow.
const RegisterPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Card className="mx-auto max-w-sm w-full">
        <CardHeader>
          <CardTitle className="text-xl">Sign Up</CardTitle>
          <CardDescription>Create an account</CardDescription>
        </CardHeader>
        <CardContent>
          <SignUp />
        </CardContent>
      </Card>
    </div>
  );
};

export default RegisterPage;
