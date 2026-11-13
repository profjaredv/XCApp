import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamFeatures } from '@/hooks/useTeamFeatures';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { readStoredSport, sportForSubpath, SPORT_HOME, teamSubpath, writeStoredSport, type Sport } from '@/lib/sport';

/**
 * The sport the current screen belongs to, and whether this user can
 * switch. Only a coach on a team with Track & Field turned on gets the
 * switch; everyone else is simply in cross country.
 */
export function useSport() {
  const location = useLocation();
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const { currentUser } = useAuth();
  const { data: features } = useTeamFeatures();
  const [stored, setStored] = useState<Sport>(readStoredSport);

  const role = currentUser?.teamRole;
  const isCoach = role === 'HEAD_COACH' || role === 'COACH' || role === 'VOLUNTEER_COACH';
  const sports = currentUser?.teamSports ?? ['XC', 'TRACK'];
  const trackOn = features?.enabled?.track !== false;
  // Both sports: you get the switch. One sport: you are simply in it.
  const canSwitch = isCoach && trackOn && sports.length > 1;
  const only: Sport | null = isCoach && sports.length === 1 ? (sports[0] === 'TRACK' && !trackOn ? null : sports[0]) : null;

  const sub = teamSubpath(location.pathname);
  const sport: Sport = only ?? (canSwitch ? sportForSubpath(sub, stored) : 'XC');

  useEffect(() => {
    if (canSwitch && sport !== stored) {
      writeStoredSport(sport);
      setStored(sport);
    }
  }, [canSwitch, sport, stored]);

  // A track-only coach who lands on a cross country screen (a bookmark, the
  // default landing page) is taken to Track & Field's home instead.
  const misplaced = only === 'TRACK' && sportForSubpath(sub, 'TRACK') === 'XC' && location.pathname.startsWith('/t/');
  useEffect(() => {
    if (misplaced) navigate(teamPath(SPORT_HOME.TRACK, 'TRACK'), { replace: true });
  }, [misplaced, navigate, teamPath]);

  const switchTo = useCallback(
    (next: Sport) => {
      writeStoredSport(next);
      setStored(next);
      navigate(teamPath(SPORT_HOME[next], next));
    },
    [navigate, teamPath]
  );

  return { sport, canSwitch, switchTo, sub };
}
