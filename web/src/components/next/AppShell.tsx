import React, { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, ChevronLeft, LogOut, Settings, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authClient } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ImpersonationBanner } from '../ImpersonationBanner';
import { CheckoutReminderBanner } from '../CheckoutReminderBanner';
import { FeedbackWidget } from '../FeedbackWidget';
import { TeamSeasonHeader } from '../Layout';
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
  const teamPath = useTeamPath();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);

  const teamRole = currentUser?.teamRole;
  const isCoach = teamRole === 'HEAD_COACH' || teamRole === 'COACH' || teamRole === 'VOLUNTEER_COACH';
  const links = isCoach ? COACH_LINKS : currentUser?.linkedAthlete ? ATHLETE_LINKS : COACH_LINKS.slice(0, 1);

  // Back on every page that isn't one of the nav destinations — on a phone
  // (and in the installed PWA) there is no other way out of a detail page.
  const tail = location.pathname.split('/').filter(Boolean).slice(2).join('/');
  const isNavDestination = links.some((l) => l.to.slice(1) === tail) || tail === '' || tail === 'today';
  // Setup pages (roster, equipment, settings…) count as top level in classic
  // but have no entry in this nav, so they get one too. /profile is outside
  // the team tree and has no tail.
  const showBack = !isNavDestination && location.pathname !== '/profile';

  const menuItem = 'flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-accent';

  return (
    <div className="flex h-screen flex-col" data-shell="next">
      <ImpersonationBanner />
      <CheckoutReminderBanner />
      <header className="flex items-center gap-1 border-b border-border bg-background px-2 py-1">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        <TeamSeasonHeader />
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
      {/* One row that scrolls sideways on a phone, rather than wrapping
          into two rows that eat a quarter of the screen. */}
      <nav aria-label="Main" className="flex gap-1 overflow-x-auto border-b border-border bg-background px-2 py-1 [scrollbar-width:none]">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={teamPath(l.to)}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-medium',
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
