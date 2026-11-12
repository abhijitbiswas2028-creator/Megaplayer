import React, { useState, useEffect, useMemo } from 'react';
import { User, Video, Category, AppView } from './types/index.ts';
import { api } from './lib/api.ts';
import { Navbar } from './components/layout/Navbar.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { VideoCard, formatDuration } from './components/video/VideoCard.tsx';
import { VideoPlayer } from './components/player/VideoPlayer.tsx';
import { VideoDetailModal } from './components/video/VideoDetailModal.tsx';
import { AdminDashboard } from './components/admin/AdminDashboard.tsx';
import { AuthModal } from './components/auth/AuthModal.tsx';
import {
  Play,
  Info,
  Clock,
  Sparkles,
  Compass,
  Film,
  Tv,
  BookOpen,
  Heart,
  History,
  Sliders,
  User as UserIcon,
  ShieldCheck,
  CheckCircle2,
  HardDrive,
  CloudLightning,
  Loader2,
  ChevronRight,
  Filter
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | undefined>(undefined);
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');

  // Library state
  const [videos, setVideos] = useState<Video[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [continueWatchingList, setContinueWatchingList] = useState<Video[]>([]);
  const [favoritesList, setFavoritesList] = useState<Video[]>([]);
  const [historyList, setHistoryList] = useState<Video[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);

  // Active playback / modals
  const [activePlaybackVideo, setActivePlaybackVideo] = useState<Video | null>(null);
  const [selectedDetailVideo, setSelectedDetailVideo] = useState<Video | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Fetch library data
  const refreshLibraryData = async () => {
    setLoadingVideos(true);
    try {
      const [vRes, cRes, cwRes, fRes, hRes] = await Promise.all([
        api.getVideos({ category: selectedCategory !== 'all' ? selectedCategory : undefined, search: searchQuery || undefined, sort: sortBy }),
        api.getCategories(),
        api.getContinueWatching(),
        api.getFavorites(),
        api.getWatchHistory(),
      ]);

      setVideos(vRes.videos);
      setCategories(cRes.categories);
      setContinueWatchingList(cwRes.continueWatching);
      setFavoritesList(fRes.favorites);
      setHistoryList(hRes.history);
    } catch (err) {
      console.error('Failed to load library:', err);
    } finally {
      setLoadingVideos(false);
    }
  };

  // Initial user check and catalog load
  useEffect(() => {
    async function initApp() {
      try {
        const meRes = await api.getMe();
        let user = meRes.user;
        let token = meRes.token;
        if (!user) {
          const demoRes = await api.quickDemoLogin('OWNER');
          user = demoRes.user;
          token = demoRes.token;
        }
        setCurrentUser(user);
        setSessionToken(token);
        await refreshLibraryData();
      } catch (err) {
        console.warn('Init auth fallback:', err);
        setLoadingVideos(false);
      }
    }
    initApp();
  }, []);

  useEffect(() => {
    if (currentUser) {
      refreshLibraryData();
    }
  }, [selectedCategory, searchQuery, sortBy]);

  // Sign out
  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
    setSessionToken(undefined);
    setAuthModalOpen(true);
  };

  // Toggle favorite
  const handleToggleFavorite = async (video: Video) => {
    try {
      const res = await api.toggleFavorite(video.id);
      setVideos((prev) =>
        prev.map((v) => (v.id === video.id ? { ...v, is_favorite: res.isFavorite } : v))
      );
      if (res.isFavorite) {
        setFavoritesList((prev) => [{ ...video, is_favorite: true }, ...prev]);
      } else {
        setFavoritesList((prev) => prev.filter((v) => v.id !== video.id));
      }
    } catch (err) {
      console.error('Favorite toggle failed:', err);
    }
  };

  // Featured hero video
  const heroVideo = useMemo(() => {
    return videos.find((v) => v.is_featured) || videos[0] || null;
  }, [videos]);

  // Filtered views mapping
  const currentCategorySlug = useMemo(() => {
    if (currentView === 'movies') return 'movies';
    if (currentView === 'series') return 'series';
    if (currentView === 'tutorials') return 'tutorials';
    return selectedCategory;
  }, [currentView, selectedCategory]);

  const viewTitle = useMemo(() => {
    switch (currentView) {
      case 'home':
        return 'Personal Cinema Catalog';
      case 'explore':
        return 'Explore All Videos';
      case 'movies':
        return 'Feature Films & Cinema';
      case 'series':
        return 'Episodic Shows & Series';
      case 'tutorials':
        return 'Engineering & Creative Tutorials';
      case 'continue-watching':
        return 'Continue Watching';
      case 'history':
        return 'Playback History';
      case 'favorites':
        return 'My Favorites';
      case 'profile':
        return 'Account & Profile';
      case 'settings':
        return 'Platform Settings';
      default:
        return 'MEGA STREAM X';
    }
  }, [currentView]);

  return (
    <div className="min-h-screen bg-[#090b10] text-slate-100 flex flex-col font-sans selection:bg-violet-600 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        currentUser={currentUser}
        currentView={currentView}
        onNavigate={(view) => {
          setCurrentView(view);
          if (view === 'movies' || view === 'series' || view === 'tutorials') {
            setSelectedCategory(view);
          } else if (view === 'explore') {
            setSelectedCategory('all');
          }
        }}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="flex-1 flex w-full">
        {/* Left Sidebar */}
        <Sidebar
          currentView={currentView}
          onNavigate={(view) => {
            setCurrentView(view);
            if (view === 'movies' || view === 'series' || view === 'tutorials') {
              setSelectedCategory(view);
            } else if (view === 'explore' || view === 'home') {
              setSelectedCategory('all');
            }
          }}
          currentUser={currentUser}
          continueWatchingCount={continueWatchingList.length}
          favoritesCount={favoritesList.length}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto pb-16 min-w-0">
          {/* VIEW: ADMIN SUITE */}
          {currentView.startsWith('admin-') && currentUser?.role === 'OWNER' && (
            <AdminDashboard
              initialTab={
                currentView === 'admin-add-video'
                  ? 'add-video'
                  : currentView === 'admin-manage-videos'
                  ? 'manage-videos'
                  : currentView === 'admin-invitations'
                  ? 'invitations'
                  : currentView === 'admin-friends'
                  ? 'friends'
                  : 'overview'
              }
              categories={categories}
              onVideoCreated={refreshLibraryData}
              onPreviewVideo={(video) => setActivePlaybackVideo(video)}
            />
          )}

          {/* VIEW: HOME VIEW */}
          {currentView === 'home' && (
            <div className="space-y-10">
              {/* Cinematic Hero Featured Video */}
              {heroVideo && (
                <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] max-h-[520px] overflow-hidden bg-slate-950">
                  <img
                    src={heroVideo.thumbnail_url}
                    alt={heroVideo.title}
                    className="w-full h-full object-cover scale-105 filter brightness-90"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#090b10] via-[#090b10]/40 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#090b10] via-[#090b10]/60 to-transparent w-full sm:w-2/3" />

                  {/* Hero Information */}
                  <div className="absolute bottom-8 left-4 sm:left-10 right-4 sm:right-10 max-w-2xl space-y-3 sm:space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-lg bg-violet-600 text-white shadow-md">
                        FEATURED STREAM
                      </span>
                      {heroVideo.categories && heroVideo.categories[0] && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-black/60 text-slate-300 border border-white/10 backdrop-blur-md">
                          {heroVideo.categories[0].name}
                        </span>
                      )}
                      <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                        {formatDuration(heroVideo.duration_seconds)}
                      </span>
                    </div>

                    <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight drop-shadow-xl leading-tight">
                      {heroVideo.title}
                    </h1>

                    <p className="text-xs sm:text-sm text-slate-300 line-clamp-2 sm:line-clamp-3 leading-relaxed drop-shadow">
                      {heroVideo.description}
                    </p>

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={() => setActivePlaybackVideo(heroVideo)}
                        className="px-6 py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm transition-all shadow-xl shadow-violet-600/30 hover:scale-[1.02] flex items-center gap-2 cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Stream Now</span>
                      </button>

                      <button
                        onClick={() => setSelectedDetailVideo(heroVideo)}
                        className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs sm:text-sm backdrop-blur-md transition-all flex items-center gap-2 cursor-pointer border border-white/10"
                      >
                        <Info className="w-4 h-4" />
                        <span>Details</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Continue Watching Row (if user has items in progress) */}
              {continueWatchingList.length > 0 && (
                <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-violet-400" /> Continue Watching
                    </h2>
                    <button
                      onClick={() => setCurrentView('continue-watching')}
                      className="text-xs font-semibold text-violet-400 hover:text-violet-300 flex items-center gap-1 cursor-pointer"
                    >
                      View All ({continueWatchingList.length}) <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {continueWatchingList.slice(0, 4).map((video) => (
                      <VideoCard
                        key={video.id}
                        video={video}
                        onPlay={(v) => setActivePlaybackVideo(v)}
                        onViewDetails={(v) => setSelectedDetailVideo(v)}
                        onToggleFavorite={handleToggleFavorite}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Category Filter Pills */}
              <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      selectedCategory === 'all'
                        ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                        : 'bg-[#12151e] text-slate-400 hover:text-white border border-white/5'
                    }`}
                  >
                    All Channels
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCategory(c.slug)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                        selectedCategory === c.slug
                          ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                          : 'bg-[#12151e] text-slate-400 hover:text-white border border-white/5'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>

                {/* Video Grid */}
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-cyan-400" /> Authorized Library
                    </h2>
                    <span className="text-xs text-slate-400">{videos.length} videos</span>
                  </div>

                  {loadingVideos ? (
                    <div className="py-20 text-center">
                      <Loader2 className="w-8 h-8 text-violet-400 animate-spin mx-auto" />
                      <p className="text-xs text-slate-400 mt-2">Loading authorized streams...</p>
                    </div>
                  ) : videos.length === 0 ? (
                    <div className="p-12 text-center rounded-3xl bg-[#12151e] border border-white/5 text-slate-400 text-xs">
                      No videos found in this category.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {videos.map((video) => (
                        <VideoCard
                          key={video.id}
                          video={video}
                          onPlay={(v) => setActivePlaybackVideo(v)}
                          onViewDetails={(v) => setSelectedDetailVideo(v)}
                          onToggleFavorite={handleToggleFavorite}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* VIEW: EXPLORE & CATEGORIES GRID */}
          {(currentView === 'explore' ||
            currentView === 'movies' ||
            currentView === 'series' ||
            currentView === 'tutorials' ||
            currentView === 'favorites' ||
            currentView === 'continue-watching' ||
            currentView === 'history') && (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
              {/* Header with Title and Sorting */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                    {viewTitle}
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    {currentView === 'favorites'
                      ? 'Your personal bookmarked videos'
                      : currentView === 'continue-watching'
                      ? 'Resume playback exactly where you left off'
                      : currentView === 'history'
                      ? 'Complete timeline of streamed content'
                      : 'Browse the private collection with instant byte-range streaming'}
                  </p>
                </div>

                {/* Sort selector */}
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="bg-[#12151e] text-xs font-semibold text-slate-300 px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-violet-500 cursor-pointer"
                  >
                    <option value="newest">Sort: Newest</option>
                    <option value="views">Sort: Most Streamed</option>
                    <option value="duration">Sort: Duration</option>
                    <option value="title">Sort: Title (A-Z)</option>
                  </select>
                </div>
              </div>

              {/* Data list renderer */}
              {loadingVideos ? (
                <div className="py-20 text-center">
                  <Loader2 className="w-8 h-8 text-violet-400 animate-spin mx-auto" />
                </div>
              ) : (
                (() => {
                  const targetList =
                    currentView === 'favorites'
                      ? favoritesList
                      : currentView === 'continue-watching'
                      ? continueWatchingList
                      : currentView === 'history'
                      ? historyList
                      : videos;

                  if (targetList.length === 0) {
                    return (
                      <div className="p-12 text-center rounded-3xl bg-[#12151e] border border-white/5 space-y-2">
                        <p className="text-sm font-bold text-white">No videos to display</p>
                        <p className="text-xs text-slate-400">
                          {currentView === 'favorites'
                            ? 'You have not favorited any videos yet. Click the heart icon on any card!'
                            : currentView === 'continue-watching'
                            ? 'No videos are currently in progress.'
                            : 'No matching titles found in this view.'}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {targetList.map((video) => (
                        <VideoCard
                          key={video.id}
                          video={video}
                          onPlay={(v) => setActivePlaybackVideo(v)}
                          onViewDetails={(v) => setSelectedDetailVideo(v)}
                          onToggleFavorite={handleToggleFavorite}
                        />
                      ))}
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* VIEW: USER PROFILE */}
          {currentView === 'profile' && currentUser && (
            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
              <h1 className="text-2xl font-extrabold text-white">Account & Profile</h1>

              <div className="p-6 rounded-3xl bg-[#12151e] border border-white/5 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-xl font-bold text-white shadow-xl shadow-violet-600/30">
                    {currentUser.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">{currentUser.displayName}</h2>
                    <p className="text-xs text-slate-400">{currentUser.email}</p>
                    <span className="mt-1.5 inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                      {currentUser.role} ROLE
                    </span>
                  </div>
                </div>

                <div className="divide-y divide-white/5 text-xs">
                  <div className="py-3 flex justify-between">
                    <span className="text-slate-400">Account Status</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {currentUser.status}
                    </span>
                  </div>
                  <div className="py-3 flex justify-between">
                    <span className="text-slate-400">Security Layer</span>
                    <span className="text-slate-200 font-mono">HttpOnly Cookie + Scrypt</span>
                  </div>
                  <div className="py-3 flex justify-between">
                    <span className="text-slate-400">Streaming Authorization</span>
                    <span className="text-cyan-400 font-semibold">Granted (RFC 7233 Byte Range)</span>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* VIEW: SETTINGS */}
          {currentView === 'settings' && (
            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
              <h1 className="text-2xl font-extrabold text-white">Streaming Settings</h1>

              <div className="p-6 rounded-3xl bg-[#12151e] border border-white/5 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-white">Autoplay Next Video</p>
                      <p className="text-[11px] text-slate-400">
                        Automatically advance to next video in library
                      </p>
                    </div>
                    <input type="checkbox" defaultChecked className="accent-violet-600 w-4 h-4 cursor-pointer" />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-white">High-Speed Cloud Range Chunking</p>
                      <p className="text-[11px] text-slate-400">
                        Preload 512KB HTTP byte-range buffers for instant seek response
                      </p>
                    </div>
                    <input type="checkbox" defaultChecked className="accent-violet-600 w-4 h-4 cursor-pointer" />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-white">Save Playback Position Automatically</p>
                      <p className="text-[11px] text-slate-400">
                        Resume exact playback timestamp across browser sessions
                      </p>
                    </div>
                    <input type="checkbox" defaultChecked className="accent-violet-600 w-4 h-4 cursor-pointer" />
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5">
                  <p className="text-[11px] text-slate-500">
                    MEGA STREAM X v1.0.0 • Production Personal Cinema Edition
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* VIDEO PLAYER CINEMA OVERLAY */}
      {activePlaybackVideo && (
        <VideoPlayer
          video={activePlaybackVideo}
          sessionToken={sessionToken}
          onClose={() => {
            setActivePlaybackVideo(null);
            refreshLibraryData();
          }}
          onVideoEnded={() => {
            refreshLibraryData();
          }}
        />
      )}

      {/* VIDEO DETAIL MODAL */}
      {selectedDetailVideo && (
        <VideoDetailModal
          video={selectedDetailVideo}
          onClose={() => setSelectedDetailVideo(null)}
          onPlay={(v) => {
            setSelectedDetailVideo(null);
            setActivePlaybackVideo(v);
          }}
          onToggleFavorite={handleToggleFavorite}
        />
      )}

      {/* AUTH MODAL */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={(user, token) => {
          setCurrentUser(user);
          setSessionToken(token);
          setAuthModalOpen(false);
          refreshLibraryData();
        }}
      />
    </div>
  );
}
