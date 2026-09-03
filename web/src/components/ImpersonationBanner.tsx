import { Shield, Eye, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getAdminTeamName, clearAdminTeam, getPreviewAthleteName, clearPreviewAthlete } from '../lib/impersonation';
import { useTeamPath } from '../hooks/useTeamRoute';

// Always visible, never dismissible without actually exiting — the whole
// point is that it must never be possible to forget you're acting as
// someone else and take an action (especially a destructive one) thinking
// it's your own account/team. Admin impersonation takes priority in
// display if somehow both were active (it can't be in practice — setting
// an admin team clears any athlete preview, see lib/impersonation.ts —
// this is just which one wins if that ever changes).
export const ImpersonationBanner = () => {
  const { currentUser } = useAuth();
  const teamPath = useTeamPath();

  if (currentUser?.isImpersonating) {
    const teamName = getAdminTeamName() ?? currentUser.team?.name ?? 'this team';
    return (
      <div className="bg-amber-500 text-white text-sm px-4 py-2 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-medium">
          <Shield className="h-4 w-4" />
          Admin view — acting as <span className="font-semibold">{teamName}</span>
        </span>
        <button
          onClick={() => clearAdminTeam()}
          className="flex items-center gap-1 rounded-md bg-white/15 hover:bg-white/25 px-2.5 py-1 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Exit admin view
        </button>
      </div>
    );
  }

  if (currentUser?.isPreviewingAthlete) {
    const athleteName = getPreviewAthleteName() ?? 'this athlete';
    return (
      <div className="bg-blue-500 text-white text-sm px-4 py-2 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-medium">
          <Eye className="h-4 w-4" />
          Previewing as <span className="font-semibold">{athleteName}</span> — actions here affect their real data
        </span>
        <button
          // Preview always starts on /me (the athlete's own view). A
          // bare reload there would land the coach back on /me too —
          // now under their own account, which has no linked athlete —
          // and show them "Your profile isn't linked yet" instead of
          // exiting anywhere useful. Send them to Roster, where every
          // preview today actually starts.
          onClick={() => clearPreviewAthlete(teamPath('/roster'))}
          className="flex items-center gap-1 rounded-md bg-white/15 hover:bg-white/25 px-2.5 py-1 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Exit preview
        </button>
      </div>
    );
  }

  return null;
};
