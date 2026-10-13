import React, { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { ArrowLeftRight, LogOut, Settings, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authClient } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ImpersonationBanner } from '../ImpersonationBanner';
import { CheckoutReminderBanner } from '../CheckoutReminderBanner';
import { FeedbackWidget } from '../FeedbackWidget';
import { SwitchToClassicDialog } from './SwitchToClassicDialog';

// The "next" shell (docs/leadpack-new-ui-trial.md). This is the Gate 1
// version: just enough chrome to switch into, navigate the routes, and
// switch back. The real shell — zoned sidebar, bottom tab bar, group scope,
// Find athlete, Timer — is §3 and replaces this file's body.

const COACH_LINKS = [
  { to: '/today', label: 'Today' },
  { to: '/train', label: 'Train' },
  { to: '/groups', label: 'Groups' },
  { to: '/athletes', label: 'Athletes' },
  { to: '/meets', label: 'Meets' },
  { to: '/season', label: 'Season' },
  { to: '/band-trends', label: 'Program' },
];

const ATHLETE_LINKS = [
  { to: '/today', label: 'Today' },
  { to: '/me', label: 'My Season' },
  { to: '/train', label: 'Train' },
  { to: '/meets', label: 'Meets' },
];

const AppShell: React.FC = () => {
  const { currentUser } = useAuth();
  const { data: context } = useTeamContext();
  const teamPath = useTeamPath();
  const [menuOpen, setMenuOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);

  const teamRole = currentUser?.teamRole;
  const isCoach = teamRole === 'HEAD_COACH' || teamRole === 'COACH' || teamRole === 'VOLUNTEER_COACH';
  const links = isCoach ? COACH_LINKS : currentUser?.linkedAthlete ? ATHLETE_LINKS : COACH_LINKS.slice(0, 1);

  const menuItem = 'flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-accent';

  return (
    <div className="flex h-screen flex-col" data-shell="next">
      <ImpersonationBanner />
      <CheckoutReminderBanner />
      <header className="flex items-center gap-2 border-b border-border bg-background px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold md:text-base">{context?.team?.name}</span>
        <FeedbackWidget />
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Account menu"
          className="flex h-12 w-12 items-center justify-center rounded-full hover:bg-accent"
        >
          <img
            src={currentUser?.photoURL || `https://ui-avatars.com/api/?name=${currentUser?.name}&background=random`}
            alt=""
            className="h-8 w-8 rounded-full"
          />
        </button>
      </header>
      <nav aria-label="Main" className="flex flex-wrap gap-1 border-b border-border bg-background px-2 py-1">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={teamPath(l.to)}
            className={({ isActive }) =>
              cn(
                'flex min-h-12 items-center rounded-lg px-3 text-sm font-medium',
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'
              )
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-6">
        <Outlet />
      </main>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="truncate">{currentUser?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Link to="/profile" onClick={() => setMenuOpen(false)} className={menuItem}>
              <UserIcon className="h-5 w-5" /> Profile
            </Link>
            <Link to={teamPath('/settings')} onClick={() => setMenuOpen(false)} className={menuItem}>
              <Settings className="h-5 w-5" /> Settings
            </Link>
            <button
              onClick={() => {
                setMenuOpen(false);
                setSwitchOpen(true);
              }}
              className={menuItem}
            >
              <ArrowLeftRight className="h-5 w-5" /> Switch to classic
            </button>
            <button onClick={() => authClient.signOut()} className={menuItem}>
              <LogOut className="h-5 w-5" /> Log out
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <SwitchToClassicDialog open={switchOpen} onOpenChange={setSwitchOpen} />
    </div>
  );
};

export default AppShell;
