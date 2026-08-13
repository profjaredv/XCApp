import React, { useState } from 'react';
import { Outlet, Link, NavLink } from 'react-router-dom';
import { ChevronLeft, Settings, LogOut, User as UserIcon, Menu, Home, BarChart2, Database, Sparkles, ClipboardList, MessageSquare, Gauge, Calculator, Users, CalendarDays, Flag, Package, TrendingUp } from 'lucide-react';
import { authClient } from '../lib/auth';
import { useAuth } from '../contexts/AuthContext';
import { FeedbackWidget } from './FeedbackWidget';
import { useTeamPath } from '../hooks/useTeamRoute';
import { AdminTeamSwitcher } from './AdminTeamSwitcher';
import { ImpersonationBanner } from './ImpersonationBanner';

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
}

const NavItem: React.FC<NavItemProps> = ({ to, icon: Icon, label, isCollapsed, onClick }) => (
  <NavLink
    to={to}
    onClick={onClick}
    className={({ isActive }) =>
      `flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-xl px-3 py-2.5 text-slate-600 font-medium transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 ${isActive && 'bg-gradient-to-r from-primary/10 to-primary/5 text-primary shadow-sm'}`
    }
  >
    <Icon className={isCollapsed ? 'h-6 w-6' : 'h-5 w-5'} strokeWidth={2.5} />
    {!isCollapsed && <span className="text-sm">{label}</span>}
  </NavLink>
);

const NavSection: React.FC<{ label: string; isCollapsed: boolean; children: React.ReactNode }> = ({
  label,
  isCollapsed,
  children,
}) => (
  <div className="space-y-1 pt-4 first:pt-0">
    {!isCollapsed && (
      <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
    )}
    {children}
  </div>
);

const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, setIsMobileOpen }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isMobile = () => window.innerWidth < 768;

  const handleLinkClick = () => {
    if (isMobile()) {
      setIsMobileOpen(false);
    }
  };
  const { currentUser } = useAuth();
  const teamPath = useTeamPath();
  const isCoach = currentUser?.role === 'coach';

  const handleLogout = () => {
    authClient.signOut();
  };

  return (
    <aside className={`fixed md:relative flex flex-col h-screen bg-gradient-to-b from-slate-50 to-white border-r border-slate-200/60 backdrop-blur-xl transition-all duration-300 z-20 ${isCollapsed ? 'w-20' : 'w-64'} ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)} 
        className="absolute -right-3 top-8 z-10 p-1.5 bg-white border border-slate-200 rounded-full text-slate-600 hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all duration-200 hidden md:block"
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

      <nav className="mt-2 flex-1 min-h-0 px-3 overflow-y-auto">
        {currentUser?.linkedAthlete && (
          <NavSection label="My Profile" isCollapsed={isCollapsed}>
            <NavItem to={teamPath('/me')} icon={Gauge} label="My Progress" isCollapsed={isCollapsed} onClick={handleLinkClick} />
          </NavSection>
        )}

        <NavSection label="Analyze" isCollapsed={isCollapsed}>
          <NavItem to={teamPath('/analytics')} icon={Home} label="Analytics" isCollapsed={isCollapsed} onClick={handleLinkClick} />
          <NavItem to={teamPath('/band-trends')} icon={TrendingUp} label="Band Trends" isCollapsed={isCollapsed} onClick={handleLinkClick} />
          <NavItem to={teamPath('/results-grid')} icon={BarChart2} label="Results Grid" isCollapsed={isCollapsed} onClick={handleLinkClick} />
          <NavItem to={teamPath('/tools')} icon={Calculator} label="Pace Calculator" isCollapsed={isCollapsed} onClick={handleLinkClick} />
        </NavSection>

        <NavSection label="Manage" isCollapsed={isCollapsed}>
          <NavItem to={teamPath('/roster')} icon={ClipboardList} label="Roster" isCollapsed={isCollapsed} onClick={handleLinkClick} />
          <NavItem to={teamPath('/groups')} icon={Users} label="Groups" isCollapsed={isCollapsed} onClick={handleLinkClick} />
          {isCoach && (
            <>
              <NavItem to={teamPath('/practice-plans')} icon={CalendarDays} label="Practice Plans" isCollapsed={isCollapsed} onClick={handleLinkClick} />
              <NavItem to={teamPath('/meets')} icon={Flag} label="Meets" isCollapsed={isCollapsed} onClick={handleLinkClick} />
              <NavItem to={teamPath('/equipment')} icon={Package} label="Equipment" isCollapsed={isCollapsed} onClick={handleLinkClick} />
              <NavItem to={teamPath('/coaches-tools')} icon={Sparkles} label="Coaches Tools" isCollapsed={isCollapsed} onClick={handleLinkClick} />
              <NavItem to={teamPath('/data-management')} icon={Database} label="Data Management" isCollapsed={isCollapsed} onClick={handleLinkClick} />
              <NavItem to={teamPath('/feedback')} icon={MessageSquare} label="Feedback" isCollapsed={isCollapsed} onClick={handleLinkClick} />
            </>
          )}
        </NavSection>
      </nav>

      <div className="flex-shrink-0 w-full border-t border-slate-200/60 bg-white/80 backdrop-blur-sm">
        {currentUser?.isSuperAdmin && (
          <div className="p-3 border-b border-slate-200/60">
            <AdminTeamSwitcher isCollapsed={isCollapsed} />
          </div>
        )}
        <div className="p-4">
          <div className="flex items-center">
            <img src={currentUser?.photoURL || `https://ui-avatars.com/api/?name=${currentUser?.name}&background=random`} alt="User Avatar" className="h-10 w-10 rounded-full ring-2 ring-slate-200 ring-offset-2" />
            {!isCollapsed && (
              <div className="ml-3">
                <p className="font-semibold text-slate-900 text-sm">{currentUser?.name}</p>
                <p className="text-xs text-slate-500">{currentUser?.email}</p>
              </div>
            )}
          </div>
        </div>
        <Link to="/profile" onClick={handleLinkClick} className="flex items-center w-full px-4 py-2.5 text-slate-600 hover:bg-slate-50 transition-colors border-t border-slate-200/60">
          <UserIcon className={isCollapsed ? "h-6 w-6" : "h-5 w-5"} strokeWidth={2} />
          {!isCollapsed && <span className="ml-3 text-sm font-medium">Profile</span>}
        </Link>
        <Link to={teamPath('/settings')} onClick={handleLinkClick} className="flex items-center w-full px-4 py-2.5 text-slate-600 hover:bg-slate-50 transition-colors">
          <Settings className={isCollapsed ? "h-6 w-6" : "h-5 w-5"} strokeWidth={2} />
          {!isCollapsed && <span className="ml-3 text-sm font-medium">Settings</span>}
        </Link>
        <button onClick={handleLogout} className="flex items-center w-full px-4 py-2.5 text-slate-600 hover:bg-slate-50 transition-colors border-t border-slate-200/60">
          <LogOut className={isCollapsed ? "h-6 w-6" : "h-5 w-5"} strokeWidth={2} />
          {!isCollapsed && <span className="ml-3 text-sm font-medium">Logout</span>}
        </button>
      </div>
    </aside>
  );
}

const Layout: React.FC = () => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  return (
    <div className="flex flex-col h-screen">
      <ImpersonationBanner />
      <div className="flex flex-1 bg-gradient-to-br from-slate-50 via-white to-slate-50 overflow-hidden md:overflow-auto">
        <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200/60 p-3 md:p-4 flex items-center">
            <button onClick={() => setIsMobileOpen(true)} className="md:hidden mr-2 p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <Menu className="h-6 w-6" />
            </button>
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
