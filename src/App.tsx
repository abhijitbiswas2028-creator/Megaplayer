import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { User, Video, Category, AppView } from './types/index.ts';
import { api } from './lib/api.ts';
import { Navbar } from './components/layout/Navbar.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { VideoThumbnail } from './components/video/VideoThumbnail.tsx';
import { VideoCard, formatDuration } from './components/video/VideoCard.tsx';
import { VideoPlayer } from './components/player/VideoPlayer.tsx';
import { VideoDetailModal } from './components/video/VideoDetailModal.tsx';
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard.tsx').then(module => ({ default: module.AdminDashboard })));
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
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');

  // Debounce search input to avoid hitting backend on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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

  const handleStartPlayback = (video: Video) => {
    setActivePlaybackVideo(video);
  };

  const libraryRequestRef = useRef(0);
  const initialCatalogLoadedRef = useRef(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  // Fetch full library data (categories, personalized lists, videos)
  const refreshLibraryData = async () => {
    const requestId = ++libraryRequestRef.current;
    setLoadingVideos(true);
    setLibraryError(null);
    try {
      const [vRes, cRes, cwRes, fRes, hRes] = await Promise.all([
        api.getVideos({ category: selectedCategory !== 'all' ? selectedCategory : undefined, search: debouncedSearchQuery || searchQuery || undefined, sort: sortBy }),
        api.getCategories(),
        api.getContinueWatching(),
        api.getFavorites(),
        api.getWatchHistory(),
      ]);

      if (requestId !== libraryRequestRef.current) return;
      setVideos(vRes.videos);
      setCategories(cRes.categories);
      setContinueWatchingList(cwRes.continueWatching);
      setFavoritesList(fRes.favorites);
      setHistoryList(hRes.history);
    } catch (err) {
      if (requestId === libraryRequestRef.current) setLibraryError(err instanceof Error ? err.message : 'Could not load videos.');
    } finally {
      if (requestId === libraryRequestRef.current) setLoadingVideos(false);
    }
  };

  // Efficient targeted refresh for filter, search, and sort changes (avoids redundant multi-endpoint calls)
  const refreshVideosOnly = async () => {
    const requestId = ++libraryRequestRef.current;
    setLoadingVideos(true);
    setLibraryError(null);
    try {
      const vRes = await api.getVideos({
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        search: debouncedSearchQuery || undefined,
        sort: sortBy,
      });
      if (requestId !== libraryRequestRef.current) return;
      setVideos(vRes.videos);
    } catch (err) {
      if (requestId === libraryRequestRef.current) setLibraryError(err instanceof Error ? err.message : 'Could not load videos.');
    } finally {
      if (requestId === libraryRequestRef.current) setLoadingVideos(false);
    }
  };

  // Initial user check and catalog load
  useEffect(() => {
    async function initApp() {
      try {
        const meRes = await api.getMe();
        let user = meRes.user;
        let token = meRes.token;
        if (!user && !import.meta.env.DEV) {
          setAuthModalOpen(true);
          setLoadingVideos(false);
          return;
        }
        if (!user) {
          const demoRes = await api.quickDemoLogin('OWNER');
          user = demoRes.user;
          token = demoRes.token;
        }
        setCurrentUser(user);
        setSessionToken(token);
        await refreshLibraryData();
        initialCatalogLoadedRef.current = true;
      } catch (err) {
        console.warn('Init auth fallback:', err);
        setLoadingVideos(false);
      }
    }
    initApp();
  }, []);

  useEffect(() => {
    if (currentUser && initialCatalogLoadedRef.current) {
      refreshVideosOnly();
    }
  }, [selectedCategory, debouncedSearchQuery, sortBy]);

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
          } else if (view === 'explore' || view === 'home') {
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
          {libraryError && <div role="alert" className="m-6 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">
            {libraryError} <button onClick={refreshLibraryData} className="ml-3 underline cursor-pointer">Try again</button>
          </div>}
          {/* VIEW: ADMIN SUITE */}
          {currentView.startsWith('admin-') && currentUser?.role === 'OWNER' && (
            <Suspense fallback={<div role="status" className="p-8 text-sm text-slate-400">Loading dashboard…</div>}>
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
              onPreviewVideo={(video) => handleStartPlayback(video)}
            />
            </Suspense>
          )}

          {/* VIEW: HOME VIEW */}
          {currentView === 'home' && (
            <div className="space-y-10">
              <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 space-y-2">
                <p className="text-xs font-semibold text-violet-300 tracking-widest uppercase">Your private collection</p>
                <h1 className="text-3xl font-semibold tracking-tight">Video library</h1>
                <p className="text-sm text-slate-400">Find something to watch. Pick up where you left off.</p>
              </header>

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
                        onPlay={(v) => handleStartPlayback(v)}
                        onViewDetails={(v) => setSelectedDetailVideo(v)}
                        onToggleFavorite={handleToggleFavorite}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Category Filter Pills */}
              <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
                {/* Video Grid */}
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-cyan-400" /> All videos
                    </h2>
                    <span className="text-xs text-slate-400">{videos.length} videos</span>
                  </div>

                  {loadingVideos ? (
                    <div className="py-20 text-center">
                      <Loader2 className="w-8 h-8 text-violet-400 animate-spin mx-auto" />
                      <p className="text-xs text-slate-400 mt-2">Loading videos…</p>
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
                          onPlay={(v) => handleStartPlayback(v)}
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
                      : 'Browse your video collection'}
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
                          onPlay={(v) => handleStartPlayback(v)}
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
          key={activePlaybackVideo.id}
          video={activePlaybackVideo}
          sessionToken={sessionToken}
          initialMode={(activePlaybackVideo as any)._initialMode}
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
            handleStartPlayback(v);
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
