import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

// T1 (Team Management handoff): the shared-secret upgrade code this page
// used to submit (`POST /profile/upgrade-to-coach`) is retired — anyone who
// learned the code could become a coach on whatever team they were on.
// Staff access is now granted by name, by a head coach, via
// `POST /team/staff-invite` — see StaffInviteAcceptPage for the accept
// half of that flow. This page stays registered (rather than 404ing) for
// anyone who still has the old link, pointing them at the real next step.
const UpgradeRolePage: React.FC = () => {
  const { currentUser } = useAuth();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Coach &amp; Staff Access</h1>

      <Card>
        <CardHeader>
          <CardTitle>Ask your head coach for an invite</CardTitle>
          <CardDescription>
            Coach and volunteer access is no longer granted by a shared upgrade code. Your head coach can send
            you an invite link naming your exact role (head coach, coach, or volunteer coach) from their Staff
            settings — open the link they send you to accept it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Current role: <span className="font-medium">{currentUser?.role || 'athlete'}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default UpgradeRolePage;
