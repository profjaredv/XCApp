import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronLeft, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useTeamFeatures } from '@/hooks/useTeamFeatures';
import { GroupScopeProvider } from '@/contexts/GroupScopeProvider';
import {
  mobileTabsFor,
  moreItemsFor,
  nextNavFor,
  nextNavRole,
  type NextNavEntry,
} from '@/lib/navigationNext';
import { scopeAppliesTo } from '@/lib/groupScopeRoutes';
import { CheckoutReminderBanner } from '../CheckoutReminderBanner';
import { FeedbackWidget } from '../FeedbackWidget';
import { SwitchToClassicDialog } from './SwitchToClassicDialog';
import { AccountMenuItems } from './AccountMenuItems';
import { NextImpersonationBanner } from './NextImpersonationBanner';
import { SeasonChip } from './SeasonChip';
import { GroupScopePicker } from './GroupScopePicker';
import { FindAthleteButton } from './FindAthleteSheet';
import { TimerButton } from './TimerButton';
import { Sheet, SheetContent } from './Sheet';

// The "next" shell (docs/leadpack-new-ui-trial.md §3). Desktop (≥1024px):
// a zoned sidebar — THIS WEEK, INSIGHTS, a collapsed Setup — with the
// account folded into one avatar row. Phone: a bottom tab bar of four
// destinations plus More, no drawer. Pages render through <Outlet />, so a
// page without a next version yet shows its classic page in here.

const COLLAPSE_KEY = 'xc_next_sidebar_collapsed';

function teamSubpath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  return parts[0] === 't' ? parts.slice(2).join('/') : parts.join('/');
}

function isActive(entry: NextNavEntry, sub: string): boolean {
  const target = entry.path.replace(/^\//, '').split('#')[0];
  if (target === 'today') return sub === '' || sub === 'today';
  if (target === 'groups') return sub === 'groups' || sub.startsWith('group/') || sub.startsWith('groups/');
  if (target === 'meets') return sub === 'meets' || sub.startsWith('meet/');
  if (target === 'athletes') return sub === 'athletes' || sub.startsWith('athlete/');
  return sub === target;
}

const AppShell: React.FC = () => (
  <GroupScopeProvider>
    <ShellFrame />
  </GroupScopeProvider>
);

const ShellFrame: React.FC = () => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const { data: context } = useTeamContext();
  const { data: features } = useTeamFeatures();
  const [switchOpen, setSwitchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const role = nextNavRole(currentUser);
  const enabled = features?.enabled;
  const sub = teamSubpath(location.pathname);
  const isCoach = role === 'coach' || role === 'volunteer';
  const showScope = isCoach && scopeAppliesTo(sub, location.search);

  const tabs = mobileTabsFor(role, enabled);
  const more = moreItemsFor(role, enabled);
  const allEntries = [...tabs, ...more];
  const onNavDestination = location.pathname === '/profile' || sub === '' || allEntries.some((e) => isActive(e, sub) && e.path.replace(/^\//, '') === sub);
  const showBack = !onNavDestination;

  // Close the More sheet whenever the page changes.
  useEffect(() => setMoreOpen(false), [location.pathname]);

  return (
    <div className="flex h-[100dvh] flex-col bg-background" data-shell="next">
      <NextImpersonationBanner />
      <CheckoutReminderBanner />
      <div className="flex min-h-0 flex-1">
        <DesktopSidebar role={role} enabled={enabled} sub={sub} onSwitchToClassic={() => setSwitchOpen(true)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-1 lg:h-16 lg:px-3">
            {showBack && (
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label="Go back"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}
            {/* Below 640px a team name truncates to a letter or two, so phones
                get the team's initials as a badge instead. */}
            <span
              aria-hidden="true"
              className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground sm:hidden', !showBack && 'ml-1')}
            >
              {teamInitials(context?.team?.name)}
            </span>
            <span className="sr-only sm:hidden">{context?.team?.name}</span>
            <span className={cn('hidden min-w-0 truncate font-semibold sm:block sm:flex-1 lg:flex-none lg:text-base', !showBack && 'pl-2', 'text-sm')}>
              {context?.team?.name}
            </span>
            <div className="flex-1 sm:hidden" />
            <SeasonChip />
            {showScope && <GroupScopePicker compact />}
            <div className="hidden flex-1 lg:block" />
            {isCoach && <FindAthleteButton />}
            {isCoach && <TimerButton />}
            <div className="hidden lg:block">
              <FeedbackWidget />
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 pb-6 md:p-6">
            <Outlet />
          </main>
          <BottomTabBar tabs={tabs} sub={sub} onMore={() => setMoreOpen(true)} moreActive={moreOpen} />
        </div>
      </div>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent title="More">
          {more.map((e) => (
            <Link
              key={e.key}
              to={teamPath(e.path)}
              onClick={() => setMoreOpen(false)}
              className={cn(
                'flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-accent',
                isActive(e, sub) && 'bg-primary/10 text-primary'
              )}
            >
              <e.icon className="h-5 w-5" />
              {e.zone === 'setup' ? <span>Setup · {e.label}</span> : e.label}
            </Link>
          ))}
          <div className="my-2 border-t" />
          <FeedbackWidget variant="row" />
          <AccountMenuItems
            onNavigate={() => setMoreOpen(false)}
            onSwitchToClassic={() => {
              setMoreOpen(false);
              setSwitchOpen(true);
            }}
          />
        </SheetContent>
      </Sheet>
      <SwitchToClassicDialog open={switchOpen} onOpenChange={setSwitchOpen} />
    </div>
  );
};

// ---------------------------------------------------------------------------

const BottomTabBar: React.FC<{ tabs: NextNavEntry[]; sub: string; onMore: () => void; moreActive: boolean }> = ({
  tabs,
  sub,
  onMore,
  moreActive,
}) => {
  const teamPath = useTeamPath();
  const item = (active: boolean) =>
    cn(
      'flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
      active ? 'text-primary' : 'text-muted-foreground'
    );
  return (
    <nav
      aria-label="Main"
      className="flex shrink-0 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {tabs.map((t) => {
        const active = isActive(t, sub);
        return (
          <NavLink key={t.key} to={teamPath(t.path)} className={item(active)} aria-current={active ? 'page' : undefined}>
            <t.icon className="h-6 w-6" strokeWidth={active ? 2.5 : 2} />
            <span className="max-w-full truncate px-1">{t.label}</span>
          </NavLink>
        );
      })}
      <button type="button" onClick={onMore} className={item(moreActive)}>
        <MoreHorizontal className="h-6 w-6" />
        <span>More</span>
      </button>
    </nav>
  );
};

// ---------------------------------------------------------------------------

const DesktopSidebar: React.FC<{
  role: ReturnType<typeof nextNavRole>;
  enabled: Parameters<typeof nextNavFor>[2];
  sub: string;
  onSwitchToClassic: () => void;
}> = ({ role, enabled, sub, onSwitchToClassic }) => {
  const { currentUser } = useAuth();
  const teamPath = useTeamPath();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [setupOpen, setSetupOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, String(!c));
      } catch {
        // Per-session only, then.
      }
      return !c;
    });
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const week = nextNavFor(role, 'week', enabled);
  const insights = nextNavFor(role, 'insights', enabled);
  const setup = nextNavFor(role, 'setup', enabled);
  const setupActive = setup.some((e) => isActive(e, sub));

  const link = (e: NextNavEntry) => {
    const active = isActive(e, sub);
    return (
      <NavLink
        key={e.key}
        to={teamPath(e.path)}
        title={collapsed ? e.label : undefined}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium',
          collapsed && 'justify-center px-0',
          active ? 'bg-primary/10 text-primary' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground'
        )}
      >
        <e.icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.5 : 2} />
        {!collapsed && <span className="truncate">{e.label}</span>}
      </NavLink>
    );
  };

  const zoneLabel = (label: string) =>
    collapsed ? <div className="mx-3 my-2 border-t border-sidebar-border" /> : (
      <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">{label}</p>
    );

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      <div className={cn('flex h-16 shrink-0 items-center gap-2 px-3', collapsed && 'justify-center px-0')}>
        {!collapsed && <span className="flex-1 truncate text-lg font-bold text-primary">LeadPack</span>}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>

      {/* Scrolls on its own so a short window never cuts off Setup or the
          avatar row below it. */}
      <nav aria-label="Main" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {week.length > 0 && zoneLabel('This week')}
        {week.map(link)}
        {insights.length > 0 && zoneLabel('Insights')}
        {insights.map(link)}
        {setup.length > 0 && (
          <div className="pt-3">
            {collapsed ? (
              setup.map(link)
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSetupOpen((o) => !o)}
                  aria-expanded={setupOpen || setupActive}
                  className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent"
                >
                  <Settings2 className="h-5 w-5" />
                  <span className="flex-1 text-left">Setup</span>
                  <ChevronDown className={cn('h-4 w-4 transition-transform', (setupOpen || setupActive) && 'rotate-180')} />
                </button>
                {(setupOpen || setupActive) && <div className="space-y-0.5 pl-3">{setup.map(link)}</div>}
              </>
            )}
          </div>
        )}
      </nav>

      <div ref={menuRef} className="relative shrink-0 border-t border-sidebar-border p-2">
        {menuOpen && (
          <div className="absolute bottom-full left-2 right-2 z-40 mb-1 max-h-[70vh] w-56 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
            <AccountMenuItems
              onNavigate={() => setMenuOpen(false)}
              onSwitchToClassic={() => {
                setMenuOpen(false);
                onSwitchToClassic();
              }}
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Account menu"
          aria-expanded={menuOpen}
          className={cn('flex h-12 w-full items-center gap-2 rounded-lg px-2 hover:bg-sidebar-accent', collapsed && 'justify-center px-0')}
        >
          <img
            src={currentUser?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.name ?? '')}&background=random`}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full"
          />
          {!collapsed && (
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-semibold">{currentUser?.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{currentUser?.email}</span>
            </span>
          )}
        </button>
      </div>
    </aside>
  );
};

export default AppShell;

function teamInitials(name: string | undefined): string {
  if (!name) return '';
  const words = name.split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w));
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}
