import React from 'react';
import { Video } from '../../types/index.ts';
import { Play, Info, Heart, CheckCircle2 } from 'lucide-react';

interface VideoCardProps {
  video: Video;
  onPlay: (video: Video) => void;
  onViewDetails: (video: Video) => void;
  onToggleFavorite?: (video: Video) => void;
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const VideoCard: React.FC<VideoCardProps> = ({
  video,
  onPlay,
  onViewDetails,
  onToggleFavorite,
}) => {
  const watchPercent =
    video.watch_position && video.duration_seconds
      ? Math.min(100, Math.round((video.watch_position / video.duration_seconds) * 100))
      : 0;

  return (
    <div className="group relative rounded-2xl overflow-hidden bg-[#12151e] border border-white/5 hover:border-violet-500/40 transition-all duration-300 hover:shadow-2xl hover:shadow-violet-950/30 flex flex-col">
      {/* Thumbnail Surface */}
      <div className="relative aspect-video w-full overflow-hidden bg-slate-900 cursor-pointer" onClick={() => onPlay(video)}>
        <img
          src={video.thumbnail_url || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80'}
          alt={video.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />

        {/* Gradient vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#12151e] via-transparent to-black/30 opacity-70 group-hover:opacity-40 transition-opacity" />

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-10">
          {video.categories && video.categories.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-slate-200 border border-white/10">
              {video.categories[0].name}
            </span>
          )}

          <div className="flex items-center gap-1.5 ml-auto">
            {video.is_completed && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 backdrop-blur-md">
                <CheckCircle2 className="w-3 h-3" /> Watched
              </span>
            )}

            {onToggleFavorite && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(video);
                }}
                className={`p-1.5 rounded-lg backdrop-blur-md transition-all cursor-pointer ${
                  video.is_favorite
                    ? 'bg-rose-500 text-white shadow-md'
                    : 'bg-black/50 text-white/70 hover:text-white hover:bg-black/80'
                }`}
                title={video.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                aria-label={`Favorite ${video.title}`}
              >
                <Heart className={`w-3.5 h-3.5 ${video.is_favorite ? 'fill-current' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Duration badge */}
        <div className="absolute bottom-2.5 right-2.5 z-10">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-white border border-white/10 tracking-wider">
            {formatDuration(video.duration_seconds)}
          </span>
        </div>

        {/* Play Icon Hover Overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]">
          <div className="w-12 h-12 rounded-full bg-violet-600/90 text-white flex items-center justify-center shadow-xl shadow-violet-600/40 transform scale-90 group-hover:scale-100 transition-transform">
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </div>
        </div>

        {/* Watch Progress bar */}
        {watchPercent > 0 && !video.is_completed && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-cyan-400"
              style={{ width: `${watchPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <h3
            onClick={() => onViewDetails(video)}
            className="font-bold text-sm text-slate-100 line-clamp-1 group-hover:text-violet-300 transition-colors cursor-pointer"
            title={video.title}
          >
            {video.title}
          </h3>
          <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
            {video.description || 'No synopsis provided.'}
          </p>
        </div>

        <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
          <span className="text-[11px] text-slate-400">{video.view_count || 0} streams</span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onViewDetails(video)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              title="View Details"
              aria-label={`Details for ${video.title}`}
            >
              <Info className="w-4 h-4" />
            </button>
            <button
              onClick={() => onPlay(video)}
              className="px-2.5 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600 text-violet-300 hover:text-white font-semibold text-[11px] transition-all cursor-pointer flex items-center gap-1 border border-violet-500/30"
            >
              <Play className="w-3 h-3 fill-current" /> Stream
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
