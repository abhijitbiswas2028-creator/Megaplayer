import React from 'react';
import { AppView, User } from '../../types/index.ts';
import {
  Home,
  Compass,
  Film,
  Tv,
  BookOpen,
  Clock,
  History,
  Heart,
  ListMusic,
  ShieldAlert,
  PlusCircle,
  Video as VideoIcon,
  Ticket,
  Users,
  Settings,
  CloudLightning,
  Sparkles
} from 'lucide-react';

interface SidebarProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  currentUser: User | null;
  continueWatchingCount?: number;
  favoritesCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  currentUser,
  continueWatchingCount = 0,
  favoritesCount = 0,
}) => {
  const isOwner = currentUser?.role === 'OWNER';

  const navItem = (
    view: AppView,
    label: string,
    Icon: React.ElementType,
    badge?: number | string,
    colorAccent?: string
  ) => {
    const isActive = currentView === view;
    return (
      <button
        onClick={() => onNavigate(view)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all group cursor-pointer ${
          isActive
            ? 'bg-violet-600/15 text-white border border-violet-500/30 shadow-sm'
            : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]'
        }`}
      >
        <div className="flex items-center gap-3">
          <Icon
            className={`w-4 h-4 transition-colors ${
              isActive
                ? 'text-violet-400'
                : colorAccent
                ? colorAccent
                : 'text-slate-400 group-hover:text-slate-200'
            }`}
          />
          <span className="tracking-wide">{label}</span>
        </div>
        {badge !== undefined && (
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
              isActive
                ? 'bg-violet-500/30 text-violet-200'
                : 'bg-white/5 text-slate-400 group-hover:text-slate-300'
            }`}
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className="hidden md:flex flex-col w-64 h-[calc(100vh-4rem)] sticky top-16 bg-[#090b10] border-r border-white/5 p-4 overflow-y-auto space-y-6 select-none shrink-0">
      {/* Category Discovery */}
      <div className="space-y-1">
        <p className="px-3 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
          Discover
        </p>
        {navItem('home', 'Home', Home)}
        {navItem('explore', 'Explore All', Compass)}
        {navItem('movies', 'Movies', Film)}
        {navItem('series', 'Series', Tv)}
        {navItem('tutorials', 'Tutorials & Tech', BookOpen)}
      </div>

      {/* Personal Library */}
      <div className="space-y-1">
        <p className="px-3 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
          My Library
        </p>
        {navItem('continue-watching', 'Continue Watching', Clock, continueWatchingCount || undefined)}
        {navItem('history', 'Watch History', History)}
        {navItem('favorites', 'Favorites', Heart, favoritesCount || undefined, 'text-rose-400')}
      </div>

      {/* Platform Owner Control Center */}
      {isOwner && (
        <div className="space-y-1 pt-2 border-t border-white/5">
          <div className="px-3 flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-violet-400 flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" /> Owner Dashboard
            </span>
            <span className="text-[9px] font-black px-1 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
              ADMIN
            </span>
          </div>
          {navItem('admin-dashboard', 'System Overview', Sparkles)}
          {navItem('admin-add-video', 'Add Video (MEGA)', PlusCircle)}
          {navItem('admin-manage-videos', 'Manage Catalog', VideoIcon)}
          {navItem('admin-invitations', 'Invitations & Tokens', Ticket)}
          {navItem('admin-friends', 'Friends & Accounts', Users)}
        </div>
      )}

      {/* System Status Footnote */}
      <div className="mt-auto pt-4 border-t border-white/5">
        <div className="p-3 rounded-2xl bg-[#12151e] border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-medium flex items-center gap-1.5">
              <CloudLightning className="w-3.5 h-3.5 text-cyan-400" /> MEGA Engine
            </span>
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              ONLINE
            </span>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Encrypted byte-range stream pipeline active. AES-256 decrypted in memory.
          </p>
        </div>
      </div>
    </aside>
  );
};
