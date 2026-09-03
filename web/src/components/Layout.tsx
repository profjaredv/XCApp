import React, { useState } from 'react';
import { Outlet, Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
// The nav's own icons now come with its entries (lib/navigation.ts);
// these are the ones this file draws itself.
import { accentFor, sectionForNavKey, type SectionKey } from '@/lib/sectionAccent';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronDown, Settings, LogOut, User as UserIcon, Menu, LayoutDashboard, CalendarDays, MessageSquare, FlaskConical, ShieldCheck } from 'lucide-react';
import { authClient } from '../lib/auth';
import { useAuth } from '../contexts/AuthContext';
import { useTeamContext } from '../hooks/useTeamContext';
import { FeedbackWidget } from './FeedbackWidget';
import { useTeamPath } from '../hooks/useTeamRoute';
import { AdminTeamSwitcher } from './AdminTeamSwitcher';
import { ImpersonationBanner } from './ImpersonationBanner';
import { CheckoutReminderBanner } from './CheckoutReminderBanner';
import { useOptionalSeasonSelection } from '../contexts/SeasonContext';
import { useQuery } from '@tanstack/react-query';
import api from '../api/api';
import { sectionForPath, isDrillInPath } from '../lib/sectionTheme';
import { useNerdMode } from '../contexts/NerdModeContext';
import { navFor, navEntry } from '../lib/navigation';
import { useTeamFeatures } from '@/hooks/useTeamFeatures';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface SidebarProps {
  isMobileOpen: boolean;
  setIsMobileOpen: (isOpen: boolean) => void;
}

// The app is genuinely three things: analyzing performance data, managing
// the team/roster/results, and (for athletes) a self-service profile. Before
// this the sidebar was one flat list mixing all three, which read as
// cluttered even though every individual screen worked fine.
interface NavItemProps {
  to: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  isCollapsed: boolean;
  onClick: () => void;
  /** Which part of the app this leads to — decides the colour. */
  section?: SectionKey;
}

// Each destination wears its section's colour, so the sidebar is a legend
// for the rest of the app: the block at the top of Athletes is the same
// blue as the Athletes item here. The active row gets a rail in that
// colour rather than the old uniform green wash, which made every page
// look the same once you were on it.
const NavItem: React.FC<NavItemProps> = ({ to, icon: Icon, label, isCollapsed, onClick, section = 'neutral' }) => {
  const accent = accentFor(section);
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center rounded-xl px-3 py-2.5 font-medium transition-all duration-200',
          isCollapsed ? 'justify-center' : 'gap-3',
          isActive
            ? cn(accent.soft, 'text-sidebar-foreground shadow-sm')
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              className={cn('absolute inset-y-1 left-0 w-1 rounded-r-full', accent.rail)}
              aria-hidden
            />
          )}
          <Icon
            className={cn(
              isCollapsed ? 'h-6 w-6' : 'h-5 w-5',
              // Colour on the icon at all times, not just when active —
              // that is what makes the sidebar readable as a legend.
              isActive ? accent.text : cn(accent.text, 'opacity-60 group-hover:opacity-100')
            )}
            strokeWidth={2.5}
          />
          {!isCollapsed && <span className="text-sm">{label}</span>}
        </>
      )}
    </NavLink>
  );
};

// Setup (B2 in the handoff doc): collapsed by default. It's still one item
// in the eight-item spine count — Data & Import, Equipment, Field Results,
// Settings, and Feedback are configuration tasks a coach reaches
// occasionally, not part of the day-to-day hierarchy above it.
const CollapsibleSetupSection: React.FC<{ isCollapsed: boolean; children: React.ReactNode }> = ({ isCollapsed, children }) => {
  const [open, setOpen] = useState(false);

  if (isCollapsed) {
    // Sidebar itself is icon-only-collapsed: no room for a disclosure
    // toggle, so just show the items directly under their icons.
    return <div className="space-y-1 pt-4">{children}</div>;
  }

  return (
    <div className="pt-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sidebar-foreground/70 font-medium hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
      >
        <span className="flex items-center gap-3">
          <Settings className="h-5 w-5" strokeWidth={2.5} />
          <span className="text-sm">Setup</span>
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-1 space-y-1 pl-2">{children}</div>}
    </div>
  );
};

// Same 8 sub-views AnalyticsPage.tsx's own ResponsiveTabsList tabs between
// (values must match its TabsTrigger values exactly — tab state there is
// a ?tab= URL param, see useQueryParam('tab')).
const ANALYTICS_TABS: { tab: string; label: string }[] = [
  { tab: 'dashboard', label: 'Dashboard' },
  { tab: 'athletes', label: 'Athletes' },
  { tab: 'meets', label: 'Meets' },
  { tab: 'performance', label: 'Performance' },
  { tab: 'byGroup', label: 'By Group' },
  { tab: 'resultsGrid', label: 'Results Grid' },
  { tab: 'tools', label: 'Pace Calculator' },
  { tab: 'coach', label: 'Coach Insights' },
];

// Post Season mirrors Season: the same four sub-views its own page tabs
// between, so a coach reaches "who ran at state" the same way they reach
// "who ran this season". Values must match PostSeasonPage's TabsTrigger
// values exactly (tab state there is a ?tab= URL param).
const POSTSEASON_TABS: { tab: string; label: string }[] = [
  { tab: 'overview', label: 'Overview' },
  { tab: 'athletes', label: 'Athletes' },
  { tab: 'races', label: 'Races' },
  { tab: 'tag', label: 'Tag Meets' },
];

// "Season" used to be a single link straight to the Analytics dashboard
// tab — on mobile that meant landing on a heavy header + tab-switcher just
// to reach, say, Meets. Clicking it now expands in place (mirrors
// CollapsibleSetupSection's pattern below) to the same 8 sub-views
// Analytics itself tabs between, so a coach can jump straight to one
// without the intermediate stop. Auto-expands (and highlights the current
// sub-tab) whenever already on the Analytics page, so the sidebar doubles
// as a "where am I" indicator instead of just going quiet once you're in.
const TabbedNavSection: React.FC<{
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tabs: { tab: string; label: string }[];
  defaultTab: string;
  section: SectionKey;
  isCollapsed: boolean;
  onLinkClick: () => void;
}> = ({ label, path, icon: Icon, tabs, defaultTab, section, isCollapsed, onLinkClick }) => {
  const location = useLocation();
  const analyticsPath = path;
  const isOnAnalytics = location.pathname === analyticsPath;
  const activeTab = isOnAnalytics ? new URLSearchParams(location.search).get('tab') ?? defaultTab : null;
  const [manualOpen, setManualOpen] = useState(false);
  const open = isOnAnalytics || manualOpen;

  if (isCollapsed) {
    return <NavItem to={analyticsPath} icon={Icon} label={label} isCollapsed={isCollapsed} onClick={onLinkClick} section={section} />;
  }

  return (
    <div>
      <button
        onClick={() => setManualOpen(!manualOpen)}
        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 font-medium transition-colors ${
          isOnAnalytics ? 'text-sidebar-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
        }`}
      >
        <span className="flex items-center gap-3">
          <Icon className="h-5 w-5" strokeWidth={2.5} />
          <span className="text-sm">{label}</span>
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 pl-8">
          {tabs.map((t) => (
            <Link
              key={t.tab}
              to={`${analyticsPath}?tab=${t.tab}`}
              onClick={onLinkClick}
              className={`block rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === t.tab
                  ? 'bg-gradient-to-r from-primary/10 to-primary/5 text-primary'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, setIsMobileOpen }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { enabled: nerdMode, toggle: toggleNerdMode } = useNerdMode();
  const isMobile = () => window.innerWidth < 768;

  const handleLinkClick = () => {
    if (isMobile()) {
      setIsMobileOpen(false);
    }
  };
  const { currentUser } = useAuth();
  const teamPath = useTeamPath();
  // teamRole (TeamMember.role) is the real per-team authorization role —
  // this is a navigation decision, not an authorization one, but it should
  // still key off the same signal the server actually checks, not the
  // legacy role hint. Volunteer coaches get the coach spine minus Setup.
  const teamRole = currentUser?.teamRole;
  const { data: features } = useTeamFeatures();
  const isVolunteerCoach = teamRole === 'VOLUNTEER_COACH';
  const isCoachSpine = teamRole === 'HEAD_COACH' || teamRole === 'COACH' || isVolunteerCoach;

  const handleLogout = () => {
    authClient.signOut();
  };

  return (
    <aside className={`fixed md:relative flex flex-col h-screen bg-sidebar border-r border-sidebar-border backdrop-blur-xl transition-all duration-300 z-20 ${isCollapsed ? 'w-20' : 'w-64'} ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-8 z-10 p-1.5 bg-background border border-border rounded-full text-muted-foreground hover:bg-accent hover:border-ring shadow-sm transition-all duration-200 hidden md:block"
      >
        <ChevronLeft className={`h-3.5 w-3.5 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} />
      </button>

      <div className="p-6">
        {isCollapsed ? (
          <div className="flex justify-center">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-lg shadow-primary/20">
              LP
            </div>
          </div>
        ) : (
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent transition-opacity duration-300">
            LeadPack XC
          </h1>
        )}
      </div>

      {/* Workstream B (LeadPack Master Build Handoff), spine per B2/B4
          verbatim: an athlete belongs to a group, a group trains at
          practice, practices build toward a meet, meets make a season,
          seasons make a program — each item contains the one before it.
          Coaches get the full PROGRAM section plus Setup; volunteer
          coaches get PROGRAM without Setup; a plain athlete account gets
          its own four-item list rather than the coach spine with items
          hidden. Meets is read-only for athletes (MeetsPage branches on
          teamRole); My Group is /groups, already athlete-scoped
          (GroupsPage's existing AthleteGroupsView).

          No standalone "Meets" item for a coach: Schedule's calendar is
          the one place practices, workouts, and meets all live now (a
          meet chip on any day deep-links straight to it), and Schedule's
          own header carries a "Meets" button into the list/create/import
          screen (/meets, same route as before — just no longer a sidebar
          peer of Schedule). Athletes have no Schedule/calendar view of
          their own, so their Meets link stays here as their only path to
          it. */}
      <nav className="mt-2 flex-1 min-h-0 px-3 overflow-y-auto">
        <NavItem to={teamPath(navEntry('today').path)} icon={navEntry('today').icon} label={navEntry('today').label} isCollapsed={isCollapsed} onClick={handleLinkClick} section={sectionForNavKey('today')} />

        {isCoachSpine ? (
          <>
            {/* Rendered from lib/navigation.ts so the sidebar and the
                feature tour cannot drift apart — see that file. Season is
                the one entry with its own component (a collapsible group
                of Analytics tabs), so the spine is split around it. */}
            {navFor('coach', 'spine')
              .filter((i) => i.key !== 'today' && !i.custom && i.key !== 'program')
              .map((item) => (
                <NavItem key={item.key} to={teamPath(item.path)} icon={item.icon} label={item.label} isCollapsed={isCollapsed} onClick={handleLinkClick} section={sectionForNavKey(item.key)} />
              ))}
            <TabbedNavSection
              label="Season"
              path={teamPath('/analytics')}
              icon={LayoutDashboard}
              tabs={ANALYTICS_TABS}
              defaultTab="dashboard"
              section="season"
              isCollapsed={isCollapsed}
              onLinkClick={handleLinkClick}
            />
            {/* A peer of Season, not a corner of Program: the postseason is
                its own set of races and its own set of athletes. */}
            <TabbedNavSection
              label={navEntry('postseason').label}
              path={teamPath(navEntry('postseason').path)}
              icon={navEntry('postseason').icon}
              tabs={POSTSEASON_TABS}
              defaultTab="overview"
              section={sectionForNavKey('postseason')}
              isCollapsed={isCollapsed}
              onLinkClick={handleLinkClick}
            />
            <NavItem to={teamPath(navEntry('program').path)} icon={navEntry('program').icon} label={navEntry('program').label} isCollapsed={isCollapsed} onClick={handleLinkClick} section={sectionForNavKey('program')} />
            {!isVolunteerCoach && (
              <CollapsibleSetupSection isCollapsed={isCollapsed}>
                {navFor('coach', 'setup')
                  // A screen the team turned off stays off the sidebar. The
                  // API refuses it too (backend middleware/teamFeatures.js),
                  // so this is tidiness rather than the rule.
                  .filter((item) => !item.feature || features?.enabled?.[item.feature] !== false)
                  .map((item) => (
                  <NavItem key={item.key} to={teamPath(item.path)} icon={item.icon} label={item.label} isCollapsed={isCollapsed} onClick={handleLinkClick} section={sectionForNavKey(item.key)} />
                  ))}
                {/* The feedback INBOX is the maintainer's, not a per-team
                    feature — filing a report is still open to everyone via
                    the floating FeedbackWidget on every screen. The backend
                    is what enforces this (requireSuperAdmin); hiding the
                    link just stops coaches walking into a 403. */}
                {currentUser?.isSuperAdmin && (
                  <FeedbackNavItem isCollapsed={isCollapsed} teamPath={teamPath} onClick={handleLinkClick} />
                )}
              </CollapsibleSetupSection>
            )}
          </>
        ) : currentUser?.linkedAthlete ? (
          <>
            {navFor('athlete', 'spine')
              .filter((i) => i.key !== 'today')
              .map((item) => (
                <NavItem key={item.key} to={teamPath(item.path)} icon={item.icon} label={item.label} isCollapsed={isCollapsed} onClick={handleLinkClick} section={sectionForNavKey(item.key)} />
              ))}
          </>
        ) : null}
      </nav>

      <div className="flex-shrink-0 w-full border-t border-sidebar-border bg-sidebar/80 backdrop-blur-sm">
        {currentUser?.isSuperAdmin && (
          <div className="p-3 border-b border-sidebar-border space-y-2">
            <AdminTeamSwitcher isCollapsed={isCollapsed} />
            {/* Deliberately not in NAV_ITEMS: that list is audience-based
                (coach/athlete) and drives the feature tour. A platform
                destination belongs with the other super-admin controls. */}
            <NavItem
              to={teamPath('/admin')}
              icon={ShieldCheck}
              label="Platform"
              isCollapsed={isCollapsed}
              onClick={handleLinkClick}
            />
          </div>
        )}
        <div className="p-4">
          <div className="flex items-center">
            <img src={currentUser?.photoURL || `https://ui-avatars.com/api/?name=${currentUser?.name}&background=random`} alt="User Avatar" className="h-10 w-10 rounded-full ring-2 ring-sidebar-border ring-offset-2 ring-offset-sidebar" />
            {!isCollapsed && (
              <div className="ml-3">
                <p className="font-semibold text-sidebar-foreground text-sm">{currentUser?.name}</p>
                <p className="text-xs text-sidebar-foreground/60">{currentUser?.email}</p>
              </div>
            )}
          </div>
        </div>
        {/* Nerd mode. Sits with Profile/Settings/Logout rather than in the
            nav spine above: it changes how every screen reads, like a
            display preference, and is not a place you navigate to. State
            is app-wide (contexts/NerdModeProvider.tsx) — on means on
            everywhere, including the full-screen routes outside Layout. */}
        <button
          onClick={toggleNerdMode}
          aria-pressed={nerdMode}
          title={nerdMode ? 'Hide the formulas behind every number' : 'Show the formulas behind every number'}
          className={`flex items-center w-full px-4 py-2.5 transition-colors border-t border-sidebar-border ${
            nerdMode
              ? 'bg-primary/10 text-primary'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent'
          }`}
        >
          <FlaskConical className={isCollapsed ? 'h-6 w-6' : 'h-5 w-5'} strokeWidth={2} />
          {!isCollapsed && (
            <>
              <span className="ml-3 text-sm font-medium">Nerd mode</span>
              {/* A word, not a switch graphic: the row is already the
                  control, and its highlighted state carries the meaning. */}
              <span className="ml-auto text-xs font-mono opacity-70">{nerdMode ? 'on' : 'off'}</span>
            </>
          )}
        </button>
        <Link to="/profile" onClick={handleLinkClick} className="flex items-center w-full px-4 py-2.5 text-sidebar-foreground/70 hover:bg-sidebar-accent transition-colors border-t border-sidebar-border">
          <UserIcon className={isCollapsed ? "h-6 w-6" : "h-5 w-5"} strokeWidth={2} />
          {!isCollapsed && <span className="ml-3 text-sm font-medium">Profile</span>}
        </Link>
        <Link to={teamPath('/settings')} onClick={handleLinkClick} className="flex items-center w-full px-4 py-2.5 text-sidebar-foreground/70 hover:bg-sidebar-accent transition-colors">
          <Settings className={isCollapsed ? "h-6 w-6" : "h-5 w-5"} strokeWidth={2} />
          {!isCollapsed && <span className="ml-3 text-sm font-medium">Settings</span>}
        </Link>
        <button onClick={handleLogout} className="flex items-center w-full px-4 py-2.5 text-sidebar-foreground/70 hover:bg-sidebar-accent transition-colors border-t border-sidebar-border">
          <LogOut className={isCollapsed ? "h-6 w-6" : "h-5 w-5"} strokeWidth={2} />
          {!isCollapsed && <span className="ml-3 text-sm font-medium">Logout</span>}
        </button>
      </div>
    </aside>
  );
}

// The team/season indicator that used to only exist as a big, page-specific
// header on the Analytics screen (name + full season picker) and nowhere
// else — a coach on Today, Schedule, or any other screen had no on-screen
// confirmation of which team or season they were even looking at. Lives in
// Layout's header now so every screen gets it, collapsed to fit a mobile
// top bar: team name next to the menu button, season as an icon-sized
// dropdown. Reads/writes the one shared SeasonContext selection — the
// optional variant, since Layout also renders /profile, deliberately
// outside /t/:athleticTeamId (no SeasonProvider there — see
// TeamRouteGuard.tsx, where the provider actually lives).
const TeamSeasonHeader: React.FC = () => {
  const { data: context } = useTeamContext();
  const seasonSelection = useOptionalSeasonSelection();

  return (
    <>
      <span className="font-semibold text-sm md:text-base truncate min-w-0 flex-shrink">{context?.team?.name}</span>
      {seasonSelection && seasonSelection.seasons.length > 0 && (
        <Select
          value={seasonSelection.activeYear != null ? String(seasonSelection.activeYear) : undefined}
          onValueChange={(v) => seasonSelection.setSelectedYear(Number(v))}
        >
          <SelectTrigger
            size="sm"
            className="ml-auto w-auto gap-1 border-none bg-transparent shadow-none px-2 h-8 hover:bg-accent"
          >
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {seasonSelection.seasons.map((s) => (
              <SelectItem key={s.year} value={String(s.year)}>
                {s.year}
                {s.year === seasonSelection.activeSeason ? ' (Current)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </>
  );
};

// Feedback with an unread count, so a report that arrives while the
// maintainer is doing something else is actually noticed. There's no email
// provider wired up in this app, so an in-app badge is the notification.
// Its own tiny endpoint (GET /feedback/unread-count) rather than reusing the
// list query, which pulls up to 500 rows.
const FeedbackNavItem: React.FC<{
  isCollapsed: boolean;
  teamPath: (p: string) => string;
  onClick: () => void;
}> = ({ isCollapsed, teamPath, onClick }) => {
  const { data } = useQuery({
    queryKey: ['feedbackUnreadCount'],
    queryFn: async () => (await api.get('/feedback/unread-count')).data as { open: number },
    staleTime: 60_000,
  });
  const open = data?.open ?? 0;

  return (
    <div className="relative">
      <NavItem to={teamPath('/feedback')} icon={MessageSquare} label="Feedback" isCollapsed={isCollapsed} onClick={onClick} />
      {open > 0 && (
        <span
          aria-label={`${open} unread`}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white"
        >
          {open}
        </span>
      )}
    </div>
  );
};

const Layout: React.FC = () => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  // Which area of the app this is (see lib/sectionTheme.ts) — drives the
  // header's colour wash, and nothing else.
  const section = sectionForPath(location.pathname);
  const showBack = isDrillInPath(location.pathname);

  return (
    <div className="flex flex-col h-screen">
      <ImpersonationBanner />
      <CheckoutReminderBanner />
      <div className="flex flex-1 bg-background overflow-hidden md:overflow-auto">
        <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="relative isolate bg-background/80 backdrop-blur-xl border-b border-border px-3 md:px-4 py-3 md:py-4 flex items-center gap-2">
            {/* Section wash: a gradient fading down into the page, plus a
                hairline of the same hue along the top. Purely decorative
                and pointer-events-none, so it can never sit between a
                finger and a control. */}
            <div aria-hidden className={`pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b to-transparent ${section.wash}`} />
            <div aria-hidden className={`pointer-events-none absolute inset-x-0 top-0 -z-10 h-0.5 ${section.rule}`} />
            <button
              onClick={() => setIsMobileOpen(true)}
              aria-label="Open menu"
              className="md:hidden -ml-1 p-2 text-muted-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <Menu className="h-6 w-6" />
            </button>
            {/* On a phone the sidebar is behind the hamburger, so a detail
                page (a meet, an athlete) otherwise has no way out except
                the browser's back gesture — which an installed PWA doesn't
                have. Shown at every width since it's just as useful with a
                mouse. */}
            {showBack && (
              <button
                onClick={() => navigate(-1)}
                aria-label="Go back"
                title="Back"
                className="-ml-1 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <TeamSeasonHeader />
          </header>
          <main className="flex-1 overflow-x-hidden overflow-y-auto p-3 md:p-6">
            <Outlet />
          </main>
        </div>
        <FeedbackWidget />
      </div>
    </div>
  );
};

export default Layout;
