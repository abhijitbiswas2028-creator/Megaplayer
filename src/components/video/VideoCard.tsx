import React from 'react';
import { Video } from '../../types/index.ts';
import { Play, Info, Heart } from 'lucide-react';
import { VideoThumbnail } from './VideoThumbnail.tsx';

interface VideoCardProps {
  video: Video;
  onPlay: (video: Video) => void;
  onViewDetails: (video: Video) => void;
  onToggleFavorite?: (video: Video) => void;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hrs ? `${hrs}:` : ''}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function VideoCardComponent({ video, onPlay, onViewDetails, onToggleFavorite }: VideoCardProps) {
  const duration = video.watch_duration || video.duration_seconds;
  const percent = duration > 0 ? Math.min(100, Math.max(0, (video.watch_position || 0) / duration * 100)) : 0;

  return <article className="group min-w-0">
    <div className="relative aspect-video overflow-hidden rounded-xl bg-[#171a22] ring-1 ring-white/5">
      <button onClick={() => onPlay(video)} className="absolute inset-0 w-full h-full cursor-pointer" aria-label={`Play ${video.title}`}>
        <VideoThumbnail src={video.thumbnail_url} title={video.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/15 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <span className="rounded-full bg-white/95 text-black p-3"><Play className="w-5 h-5 fill-current" /></span>
        </span>
        {duration > 0 && <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">{formatDuration(duration)}</span>}
      </button>
      {percent > 0 && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-white/15 pointer-events-none"><div className="h-full bg-violet-400" style={{ width: `${percent}%` }} /></div>}
    </div>
    <div className="flex items-start justify-between gap-2 pt-3">
      <button onClick={() => onPlay(video)} className="min-w-0 text-left text-sm font-semibold leading-5 text-slate-100 hover:text-violet-300 line-clamp-2 cursor-pointer" title={video.title}>{video.title}</button>
      <div className="flex shrink-0 gap-1">
        {onToggleFavorite && <button onClick={() => onToggleFavorite(video)} aria-label={`${video.is_favorite ? 'Remove from' : 'Add to'} favorites: ${video.title}`} aria-pressed={Boolean(video.is_favorite)} className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"><Heart className={`w-4 h-4 ${video.is_favorite ? 'fill-rose-400 text-rose-400' : ''}`} /></button>}
        <button onClick={() => onViewDetails(video)} aria-label={`Details for ${video.title}`} className="p-1 text-slate-400 hover:text-white cursor-pointer"><Info className="w-4 h-4" /></button>
      </div>
    </div>
  </article>;
}

export const VideoCard = React.memo(VideoCardComponent);
