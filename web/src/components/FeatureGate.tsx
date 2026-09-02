import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ToggleLeft } from 'lucide-react';
import { useTeamFeatures, type TeamFeatureKey } from '@/hooks/useTeamFeatures';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useAuth } from '@/contexts/AuthContext';
import { isFullCoach } from '@/lib/teamRole';

// A whole screen belonging to a feature the team turned off.
//
// Hiding the nav entry isn't enough: bookmarks, the PWA's cached routes
// and a tab left open all still reach the page, where every request it
// makes would come back 403 and look like a bug. This says what actually
// happened, and — for the coach who can undo it — points at the switch.

export const FeatureGate: React.FC<{ feature: TeamFeatureKey; children: React.ReactNode }> = ({
  feature,
  children,
}) => {
  const { data, isLoading } = useTeamFeatures();
  const teamPath = useTeamPath();
  const { currentUser } = useAuth();

  // Optimistic while loading, same reasoning as useFeatureEnabled: a blank
  // "turned off" screen flashing on every navigation would be worse than
  // a page that renders and then 403s in the rare disabled case.
  const enabled = data?.enabled?.[feature];
  if (isLoading || enabled !== false) return <>{children}</>;

  const label = data?.features.find((f) => f.key === feature)?.label ?? 'This feature';

  return (
    <div className="container py-8">
      <Card className="mx-auto max-w-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <ToggleLeft className="h-5 w-5 text-muted-foreground" />
          </div>
          <CardTitle>{label} is turned off for this team</CardTitle>
          <CardDescription>
            Nothing was deleted — anything already recorded is still here, and still in your data
            export. It comes back the moment the feature does.
          </CardDescription>
        </CardHeader>
        {isFullCoach(currentUser) && (
          <CardContent className="flex justify-center">
            <Button asChild variant="outline">
              <Link to={teamPath('/settings#features')}>Open feature settings</Link>
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default FeatureGate;
