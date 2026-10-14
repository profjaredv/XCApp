import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, FlaskConical, LogOut, Moon, Settings, ShieldCheck, User as UserIcon } from 'lucide-react';
import { authClient } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { useNerdMode } from '@/contexts/NerdModeContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { AdminTeamSwitcher } from '../AdminTeamSwitcher';

// The avatar menu (docs/leadpack-new-ui-trial.md §3.1): Profile, Settings,
// Nerd mode, Dark mode, Switch to classic, Admin: switch team and Platform
// (super admins), Log out. The same list closes the phone's More sheet.
const row = 'flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-accent';

export const AccountMenuItems: React.FC<{ onNavigate: () => void; onSwitchToClassic: () => void }> = ({
  onNavigate,
  onSwitchToClassic,
}) => {
  const { currentUser } = useAuth();
  const teamPath = useTeamPath();
  const { enabled: nerdMode, toggle: toggleNerd } = useNerdMode();
  const { theme, toggle: toggleTheme } = useTheme();

  return (
    <div className="space-y-0.5">
      <Link to="/profile" onClick={onNavigate} className={row}>
        <UserIcon className="h-5 w-5" /> Profile
      </Link>
      {/* Everyone, as in classic's account stack. */}
      <Link to={teamPath('/settings')} onClick={onNavigate} className={row}>
        <Settings className="h-5 w-5" /> Settings
      </Link>
      <button type="button" onClick={toggleNerd} aria-pressed={nerdMode} className={row}>
        <FlaskConical className="h-5 w-5" /> Nerd mode
        <span className="ml-auto font-mono text-xs opacity-70">{nerdMode ? 'on' : 'off'}</span>
      </button>
      <button type="button" onClick={toggleTheme} aria-pressed={theme === 'dark'} className={row}>
        <Moon className="h-5 w-5" /> Dark mode
        <span className="ml-auto font-mono text-xs opacity-70">{theme === 'dark' ? 'on' : 'off'}</span>
      </button>
      <button type="button" onClick={onSwitchToClassic} className={row}>
        <ArrowLeftRight className="h-5 w-5" /> Switch to classic
      </button>
      {currentUser?.isSuperAdmin && (
        <>
          <div className="px-1 py-1">
            <AdminTeamSwitcher isCollapsed={false} />
          </div>
          <Link to={teamPath('/admin')} onClick={onNavigate} className={row}>
            <ShieldCheck className="h-5 w-5" /> Platform
          </Link>
        </>
      )}
      <button type="button" onClick={() => authClient.signOut()} className={row}>
        <LogOut className="h-5 w-5" /> Log out
      </button>
    </div>
  );
};
