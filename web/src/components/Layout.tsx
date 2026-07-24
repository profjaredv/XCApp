import React, { useState } from 'react';
import { Outlet, Link, NavLink } from 'react-router-dom';
import { ChevronLeft, Users, Settings, LogOut, User as UserIcon, Menu, Home, BarChart2, Database, Sparkles, ClipboardList } from 'lucide-react';
import { authClient } from '../lib/auth';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
  isMobileOpen: boolean;
  setIsMobileOpen: (isOpen: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, setIsMobileOpen }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isMobile = () => window.innerWidth < 768;

  const handleLinkClick = () => {
    if (isMobile()) {
      setIsMobileOpen(false);
    }
  };
  const { currentUser } = useAuth();

  const handleLogout = () => {
    authClient.signOut();
  };

  return (
    <aside className={`fixed md:relative h-screen bg-gradient-to-b from-slate-50 to-white border-r border-slate-200/60 backdrop-blur-xl transition-all duration-300 z-20 ${isCollapsed ? 'w-20' : 'w-64'} ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
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

      <nav className="mt-2 flex-1 px-3 space-y-1">
        <NavLink to="/analytics" onClick={handleLinkClick} className={({ isActive }) => `flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-xl px-3 py-2.5 text-slate-600 font-medium transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 ${isActive && 'bg-gradient-to-r from-primary/10 to-primary/5 text-primary shadow-sm'}`}>
          <Home className={isCollapsed ? "h-6 w-6" : "h-5 w-5"} strokeWidth={2.5} />
          {!isCollapsed && <span className="text-sm">Analytics</span>}
        </NavLink>
        <NavLink to="/roster" onClick={handleLinkClick} className={({ isActive }) => `flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-xl px-3 py-2.5 text-slate-600 font-medium transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 ${isActive && 'bg-gradient-to-r from-primary/10 to-primary/5 text-primary shadow-sm'}`}>
          <ClipboardList className={isCollapsed ? "h-6 w-6" : "h-5 w-5"} strokeWidth={2.5} />
          {!isCollapsed && <span className="text-sm">Roster</span>}
        </NavLink>
        <NavLink to="/team" onClick={handleLinkClick} className={({ isActive }) => `flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-xl px-3 py-2.5 text-slate-600 font-medium transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 ${isActive && 'bg-gradient-to-r from-primary/10 to-primary/5 text-primary shadow-sm'}`}>
          <Users className={isCollapsed ? "h-6 w-6" : "h-5 w-5"} strokeWidth={2.5} />
          {!isCollapsed && <span className="text-sm">My Team</span>}
        </NavLink>
        <NavLink to="/results-grid" onClick={handleLinkClick} className={({ isActive }) => `flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-xl px-3 py-2.5 text-slate-600 font-medium transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 ${isActive && 'bg-gradient-to-r from-primary/10 to-primary/5 text-primary shadow-sm'}`}>
          <BarChart2 className={isCollapsed ? "h-6 w-6" : "h-5 w-5"} strokeWidth={2.5} />
          {!isCollapsed && <span className="text-sm">Results Grid</span>}
        </NavLink>
        <NavLink to="/tools" onClick={handleLinkClick} className={({ isActive }) => `flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-xl px-3 py-2.5 text-slate-600 font-medium transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 ${isActive && 'bg-gradient-to-r from-primary/10 to-primary/5 text-primary shadow-sm'}`}>
          <BarChart2 className={isCollapsed ? "h-6 w-6" : "h-5 w-5"} strokeWidth={2.5} />
          {!isCollapsed && <span className="text-sm">Tools</span>}
        </NavLink>
        {currentUser?.role === 'coach' && (
          <>
            <NavLink to="/coaches-tools" onClick={handleLinkClick} className={({ isActive }) => `flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-xl px-3 py-2.5 text-slate-600 font-medium transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 ${isActive && 'bg-gradient-to-r from-accent/15 to-accent/5 text-accent-foreground shadow-sm'}`}>
              <Sparkles className={isCollapsed ? "h-6 w-6" : "h-5 w-5"} strokeWidth={2.5} />
              {!isCollapsed && <span className="text-sm">Coaches Tools</span>}
            </NavLink>
            {/* Import Data archived - not shown in UI */}
            {/* <NavLink to="/import" onClick={handleLinkClick} className={({ isActive }) => `flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-xl px-3 py-2.5 text-slate-600 font-medium transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 ${isActive && 'bg-gradient-to-r from-primary/10 to-primary/5 text-primary shadow-sm'}`}>
              <Upload className={isCollapsed ? "h-6 w-6" : "h-5 w-5"} strokeWidth={2.5} />
              {!isCollapsed && <span className="text-sm">Import Data</span>}
            </NavLink> */}
            <NavLink to="/data-management" onClick={handleLinkClick} className={({ isActive }) => `flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-xl px-3 py-2.5 text-slate-600 font-medium transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 ${isActive && 'bg-gradient-to-r from-primary/10 to-primary/5 text-primary shadow-sm'}`}>
              <Database className={isCollapsed ? "h-6 w-6" : "h-5 w-5"} strokeWidth={2.5} />
              {!isCollapsed && <span className="text-sm">Data Management</span>}
            </NavLink>
          </>
        )}
      </nav>

      <div className="absolute bottom-0 w-full border-t border-slate-200/60 bg-white/80 backdrop-blur-sm">
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
        <Link to="/settings" onClick={handleLinkClick} className="flex items-center w-full px-4 py-2.5 text-slate-600 hover:bg-slate-50 transition-colors">
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
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 overflow-hidden md:overflow-auto">
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
    </div>
  );
};

export default Layout;
