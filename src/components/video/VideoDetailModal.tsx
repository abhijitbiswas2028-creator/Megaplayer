import { VideoThumbnail } from './VideoThumbnail.tsx';
import React from 'react';
import { Video } from '../../types/index.ts';
import { formatDuration } from './VideoCard.tsx';
import { resolveBackendUrl } from '../../lib/api.ts';
import {
  X,
  Play,
  Heart,
  Clock,
  Eye,
  ShieldCheck,
  Film,
  HardDrive,
  Radio,
  Check,
  AlertCircle,
  Sliders,
  Sparkles,
} from 'lucide-react';

interface VideoDetailModalProps {
  video: Video;
  onClose: () => void;
  onPlay: (video: Video) => void;
  onToggleFavorite: (video: Video) => void;
}

export const VideoDetailModal: React.FC<VideoDetailModalProps> = ({
  video,
  onClose,
  onPlay,
  onToggleFavorite,
}) => {
  // Preload stream headers on modal open for instant playback
  React.useEffect(() => {
    if (typeof document !== 'undefined') {
      const existing = document.querySelector(`link[data-preload-vid="${video.id}"]`);
      if (!existing) {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'fetch';
        link.href = resolveBackendUrl(`/api/v1/videos/${video.id}/stream`);
        link.setAttribute('data-preload-vid', video.id);
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
      }
    }
  }, [video.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-3xl bg-[#12151e] border border-white/10 shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero Backdrop */}
        <div className="relative aspect-video sm:aspect-[21/9] w-full overflow-hidden bg-slate-900">
          <VideoThumbnail
            src={video.thumbnail_url}
            title={video.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#12151e] via-[#12151e]/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#12151e]/80 via-transparent to-transparent" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition-colors cursor-pointer border border-white/10"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Title & Category over banner */}
          <div className="absolute bottom-6 left-6 right-6">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {video.categories?.map((cat) => (
                <span
                  key={cat.id}
                  className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-violet-600/30 text-violet-300 border border-violet-500/40 backdrop-blur-md"
                >
                  {cat.name}
                </span>
              ))}
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 backdrop-blur-md flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Authenticated Stream
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight drop-shadow-md">
              {video.title}
            </h1>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-3">
              <button
                onClick={() => onPlay(video)}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-sm transition-all shadow-xl shadow-violet-600/30 hover:scale-[1.02] flex items-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Stream Cinema</span>
              </button>

              {video.embed_url && (
                <button
                  onClick={() => onPlay({ ...video, _initialMode: 'embed' } as any)}
                  className="px-4 py-3 rounded-2xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 font-semibold text-sm transition-all border border-cyan-500/30 flex items-center gap-2 cursor-pointer shadow-lg shadow-cyan-600/10"
                  title="Play directly using MEGA Cloud Player (client-side decrypt)"
                >
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <span className="hidden sm:inline">MEGA Cloud Player</span>
                </button>
              )}

              <button
                onClick={() => onToggleFavorite(video)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-2 text-xs font-semibold ${
                  video.is_favorite
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                    : 'bg-[#181c28] border-white/10 text-slate-300 hover:text-white hover:bg-[#1e2333]'
                }`}
              >
                <Heart className={`w-4 h-4 ${video.is_favorite ? 'fill-current text-rose-400' : ''}`} />
                <span className="hidden sm:inline">
                  {video.is_favorite ? 'Favorited' : 'Add to Favorites'}
                </span>
              </button>
            </div>

            {/* Quick Metadata badges */}
            <div className="flex items-center gap-4 text-xs font-medium text-slate-400">
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-violet-400" />
                {formatDuration(video.duration_seconds)}
              </span>
              <span className="flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-cyan-400" />
                {video.view_count || 0} streams
              </span>
            </div>
          </div>


          {/* Synopsis */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Synopsis</h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              {video.description || 'No detailed synopsis has been written for this video title yet.'}
            </p>
          </div>

          {/* Technical Diagnostics / Streaming Specifications */}
          <div className="p-4 rounded-2xl bg-[#0e1118] border border-white/5 space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" /> Cloud Stream Specifications
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-xl bg-[#141722] border border-white/5">
                <p className="text-[10px] text-slate-400">Pipeline</p>
                <p className="font-semibold text-slate-200 mt-0.5">HTTP 206 Range</p>
              </div>
              <div className="p-2.5 rounded-xl bg-[#141722] border border-white/5">
                <p className="text-[10px] text-slate-400">Codec Profile</p>
                <p className="font-semibold text-slate-200 mt-0.5">H.264 / AAC 48k</p>
              </div>
              <div className="p-2.5 rounded-xl bg-[#141722] border border-white/5">
                <p className="text-[10px] text-slate-400">Storage Security</p>
                <p className="font-semibold text-emerald-400 mt-0.5">AES-256-GCM</p>
              </div>
              <div className="p-2.5 rounded-xl bg-[#141722] border border-white/5">
                <p className="text-[10px] text-slate-400">Access Tier</p>
                <p className="font-semibold text-violet-400 mt-0.5">Private Invite Only</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
