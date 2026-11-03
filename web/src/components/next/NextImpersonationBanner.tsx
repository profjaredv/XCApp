import React from 'react';
import { Eye, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { clearAdminTeam, clearPreviewAthlete, getAdminTeamName, getPreviewAthleteName } from '@/lib/impersonation';

// The next shell's version of ImpersonationBanner (§3.2): one line that
// truncates, never wraps — same lib/impersonation exits as classic's.
export const NextImpersonationBanner: React.FC = () => {
  const { currentUser } = useAuth();
  const teamPath = useTeamPath();

  let icon: React.ReactNode = null;
  let text = '';
  let onExit: (() => void) | null = null;
  let tone = '';
  if (currentUser?.isImpersonating) {
    icon = <Shield className="h-4 w-4 shrink-0" />;
    text = `Admin view · acting as ${getAdminTeamName() ?? currentUser.team?.name ?? 'this team'}`;
    onExit = () => clearAdminTeam();
    tone = 'bg-amber-500';
  } else if (currentUser?.isPreviewingAthlete) {
    icon = <Eye className="h-4 w-4 shrink-0" />;
    text = `Viewing as ${getPreviewAthleteName() ?? 'this athlete'} · changes save to their account`;
    onExit = () => clearPreviewAthlete(teamPath('/athletes'));
    tone = 'bg-blue-600';
  }
  if (!onExit) return null;

  return (
    <div className={`${tone} flex h-12 items-center gap-2 pl-3 pr-1 text-sm text-white`} role="status">
      {icon}
      <span className="min-w-0 flex-1 truncate font-medium">{text}</span>
      <button
        type="button"
        onClick={onExit}
        className="flex h-10 shrink-0 items-center rounded-md bg-white/15 px-4 font-semibold hover:bg-white/25"
      >
        Exit
      </button>
    </div>
  );
};
