import React, { useState } from 'react';
import { User, AppView } from '../../types/index.ts';
import { 
  Film, 
  Search, 
  ShieldCheck, 
  User as UserIcon, 
  LogOut, 
  Key, 
  Sliders, 
  Menu, 
  X,
  PlaySquare,
  Sparkles
} from 'lucide-react';

interface NavbarProps {
  currentUser: User | null;
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  onOpenAuth: () => void;
  onLogout: () => void;
  onSwitchDemo?: (role: 'OWNER' | 'FRIEND') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  currentView,
  onNavigate,
  onOpenAuth,
  onLogout,
  onSwitchDemo,
  searchQuery,
  onSearchChange,
}) => {
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isOwner = currentUser?.role === 'OWNER';

  return (
    <header className="sticky top-0 z-40 w-full bg-[#090b10]/90 backdrop-blur-md border-b border-white/5 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand Logo */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2.5 group cursor-pointer focus:outline-none"
            aria-label="Go to MEGA STREAM X Home"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 via-purple-700 to-cyan-500 p-0.5 shadow-lg shadow-violet-500/20 group-hover:scale-105 transition-transform flex items-center justify-center">
              <div className="w-full h-full bg-[#090b10] rounded-[10px] flex items-center justify-center">
                <PlaySquare className="w-5 h-5 text-violet-400 group-hover:text-cyan-400 transition-colors" />
              </div>
            </div>
            <div className="flex flex-col text-left">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold tracking-wider text-base sm:text-lg text-white">
                  MEGA<span className="text-violet-400">STREAM</span>
                </span>
                <span className="text-[10px] font-black tracking-widest px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  X
                </span>
              </div>
              <span className="text-[9px] uppercase tracking-widest text-slate-400 font-medium hidden sm:block">
                Private Cloud Cinema
              </span>
            </div>
          </button>
        </div>

        {/* Center: Search input */}
        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search library, tags, categories..."
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                if (currentView !== 'explore' && e.target.value.trim() !== '') {
                  onNavigate('explore');
                }
              }}
              className="w-full bg-[#12151e] text-sm text-slate-200 placeholder-slate-500 pl-10 pr-4 py-2 rounded-xl border border-white/5 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Right: User Profile & Actions */}
        <div className="flex items-center gap-3">

          {currentUser ? (
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2.5 p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-[#141722] hover:bg-[#1a1f2e] border border-white/5 transition-colors cursor-pointer text-left"
                aria-label="User menu"
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow">
                  {currentUser.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:flex flex-col">
                  <span className="text-xs font-semibold text-slate-200 line-clamp-1 max-w-[120px]">
                    {currentUser.displayName}
                  </span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${
                    isOwner ? 'text-violet-400' : 'text-cyan-400'
                  }`}>
                    {currentUser.role}
                  </span>
                </div>
              </button>

              {/* Profile Dropdown */}
              {profileOpen && (
                <div 
                  className="absolute right-0 mt-2 w-56 rounded-2xl bg-[#141722] border border-white/10 shadow-2xl py-2 z-50 divide-y divide-white/5"
                  onMouseLeave={() => setProfileOpen(false)}
                >
                  <div className="px-4 py-2.5">
                    <p className="text-xs text-slate-400">Signed in as</p>
                    <p className="text-xs font-bold text-white truncate">{currentUser.email}</p>
                    <span className="mt-1 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                      {currentUser.role} ACCESS
                    </span>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => {
                        onNavigate('profile');
                        setProfileOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:text-white hover:bg-white/5 flex items-center gap-2"
                    >
                      <UserIcon className="w-3.5 h-3.5 text-slate-400" /> Profile & Account
                    </button>
                    {isOwner && (
                      <button
                        onClick={() => {
                          onNavigate('admin-dashboard');
                          setProfileOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-xs text-violet-300 hover:text-violet-200 hover:bg-violet-500/10 flex items-center gap-2 font-medium"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-violet-400" /> Admin Dashboard
                      </button>
                    )}
                    <button
                      onClick={() => {
                        onNavigate('settings');
                        setProfileOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:text-white hover:bg-white/5 flex items-center gap-2"
                    >
                      <Sliders className="w-3.5 h-3.5 text-slate-400" /> Stream Settings
                    </button>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        onLogout();
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center gap-2"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs tracking-wide transition-all shadow-lg shadow-violet-600/30 cursor-pointer flex items-center gap-1.5"
            >
              <Key className="w-3.5 h-3.5" /> Sign In / Redeem
            </button>
          )}

          {/* Mobile hamburger button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl bg-[#141722] text-slate-400 hover:text-white border border-white/5"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#0e1119] border-b border-white/10 px-4 py-4 space-y-3">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search library..."
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                if (currentView !== 'explore') onNavigate('explore');
              }}
              className="w-full bg-[#141722] text-xs text-slate-200 placeholder-slate-500 pl-9 pr-3 py-2 rounded-lg border border-white/10"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
            <button
              onClick={() => { onNavigate('home'); setMobileMenuOpen(false); }}
              className="p-2.5 rounded-lg bg-[#141722] text-slate-200 text-left"
            >
              Home
            </button>
            <button
              onClick={() => { onNavigate('explore'); setMobileMenuOpen(false); }}
              className="p-2.5 rounded-lg bg-[#141722] text-slate-200 text-left"
            >
              Explore All
            </button>
            <button
              onClick={() => { onNavigate('continue-watching'); setMobileMenuOpen(false); }}
              className="p-2.5 rounded-lg bg-[#141722] text-slate-200 text-left"
            >
              Continue Watching
            </button>
            <button
              onClick={() => { onNavigate('favorites'); setMobileMenuOpen(false); }}
              className="p-2.5 rounded-lg bg-[#141722] text-slate-200 text-left"
            >
              Favorites
            </button>
            {isOwner && (
              <button
                onClick={() => { onNavigate('admin-dashboard'); setMobileMenuOpen(false); }}
                className="p-2.5 rounded-lg bg-violet-600/20 text-violet-300 border border-violet-500/30 text-left font-bold"
              >
                Admin Suite
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

