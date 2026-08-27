import React from 'react';
import { Link } from 'react-router-dom';
import { AuthView } from '@neondatabase/neon-js/auth/react/ui';

// The auth views other than sign-in/sign-up: forgot-password and
// reset-password (and the callback/sign-out views the library may route to).
//
// These were simply missing. NeonAuthUIProvider only had viewPaths for
// SIGN_IN and SIGN_UP, and the router only had /login and /register — but
// the sign-in form always renders a "Forgot password?" link, and the library
// resolves it against its DEFAULT paths, so it pointed at /forgot-password,
// a route that did not exist. Landing there fell through to the app's
// authenticated shell and produced an "unauthorized" style error instead of
// a reset form. The emailed reset link (/reset-password?token=…) had the
// same problem, so even a manually-triggered reset could not be completed.
export const AuthFlowPage: React.FC<{ pathname: string }> = ({ pathname }) => (
  <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-4">
    <Link to="/" className="flex items-center gap-2">
      <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-lg shadow-primary/20">
        LP
      </div>
      <span className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
        LeadPack XC
      </span>
    </Link>
    <AuthView pathname={pathname} redirectTo="/login" />
  </div>
);

export default AuthFlowPage;
