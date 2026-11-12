import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Video, VideoResolution } from '../../types/index.ts';
import { api } from '../../lib/api.ts';
import { formatDuration } from '../video/VideoCard.tsx';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  PictureInPicture,
  Subtitles,
  HelpCircle,
  X,
  AlertCircle,
  Settings,
  Check,
  Loader2,
  Sparkles,
  Sliders,
  Zap,
} from 'lucide-react';

interface VideoPlayerProps {
  video: Video;
  onClose: () => void;
  onVideoEnded?: () => void;
  sessionToken?: string;
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  video,
  onClose,
  onVideoEnded,
  sessionToken,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.duration_seconds || 0);
  const [bufferedTime, setBufferedTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resumeNotification, setResumeNotification] = useState<string | null>(null);

  // Resolution & Quality State
  const [selectedResolution, setSelectedResolution] = useState<string>('auto');
  const [showResolutionMenu, setShowResolutionMenu] = useState(false);
  const [resolutions, setResolutions] = useState<VideoResolution[]>([
    { id: 'auto', label: 'Auto (Best Quality)', badge: 'FastStart', height: 0, available: true },
    { id: '1080p', label: '1080p HD', badge: '1080p', height: 1080, available: true },
    { id: '720p', label: '720p HD', badge: '720p', height: 720, available: true },
    { id: '480p', label: '480p SD', badge: '480p', height: 480, available: true },
    { id: '360p', label: '360p Data Saver', badge: '360p', height: 360, available: true },
  ]);
  const [resolutionNotice, setResolutionNotice] = useState<string | null>(null);

  // Fetch available resolutions from backend
  useEffect(() => {
    api.getVideoResolutions(video.id)
      .then((res) => {
        if (res.resolutions && res.resolutions.length > 0) {
          setResolutions(res.resolutions);
        }
      })
      .catch(() => {});
  }, [video.id]);

  const targetSeekTimeRef = useRef<number | null>(null);
  const wasPlayingRef = useRef<boolean>(false);

  // Seamless resolution switcher: preserves playback timestamp and play state
  const handleResolutionSelect = (resId: string) => {
    if (resId === selectedResolution) {
      setShowResolutionMenu(false);
      return;
    }
    const currentPos = videoRef.current ? videoRef.current.currentTime : currentTime;
    const wasPlaying = videoRef.current ? !videoRef.current.paused : isPlaying;

    targetSeekTimeRef.current = currentPos;
    wasPlayingRef.current = wasPlaying;

    setSelectedResolution(resId);
    setShowResolutionMenu(false);

    const targetLabel = resolutions.find((r) => r.id === resId)?.label || resId;
    setResolutionNotice(`Switched to ${targetLabel}`);
    setTimeout(() => setResolutionNotice(null), 3000);
  };

  // Stream URL with resolution and token query
  const streamUrl = `/api/v1/videos/${video.id}/stream?resolution=${selectedResolution}${sessionToken ? `&token=${sessionToken}` : ''}`;

  // Debounced progress reporting
  const lastSavedPositionRef = useRef<number>(0);
  const saveProgress = useCallback((pos: number, dur: number) => {
    if (dur <= 0 || Math.abs(pos - lastSavedPositionRef.current) < 2) return;
    lastSavedPositionRef.current = pos;
    api.updateWatchProgress(video.id, pos, dur).catch(() => {});
  }, [video.id]);

  // Controls auto-hide timer
  const hideControlsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    hideControlsTimerRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
        setShowSpeedMenu(false);
      }
    }, 3000);
  }, [isPlaying]);

  // Handle Play / Pause toggle
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch((err) => {
        console.warn('Playback play failed:', err);
      });
    } else {
      videoRef.current.pause();
    }
  }, []);

  // Seek relative
  const seekRelative = useCallback((delta: number) => {
    if (!videoRef.current) return;
    const target = Math.max(0, Math.min(videoRef.current.duration || duration, videoRef.current.currentTime + delta));
    videoRef.current.currentTime = target;
    setCurrentTime(target);
    saveProgress(target, videoRef.current.duration || duration);
  }, [duration, saveProgress]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  // Picture in Picture
  const togglePiP = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP not available:', err);
    }
  }, []);

  // Volume toggle
  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    const newMuted = !isMuted;
    videoRef.current.muted = newMuted;
    setIsMuted(newMuted);
  }, [isMuted]);

  // Speed change
  const handleSpeedSelect = (speed: number) => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = speed;
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
  };

  // Resume playback check on load
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (video.watch_position && video.watch_position > 5 && !video.is_completed) {
      el.currentTime = video.watch_position;
      setCurrentTime(video.watch_position);
      setResumeNotification(`Resumed playback at ${formatDuration(video.watch_position)}`);
      setTimeout(() => setResumeNotification(null), 4000);
    }
  }, [video]);

  // Keyboard shortcuts listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          resetHideTimer();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekRelative(-10);
          resetHideTimer();
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekRelative(10);
          resetHideTimer();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume((v) => {
            const nv = Math.min(1, v + 0.1);
            if (videoRef.current) videoRef.current.volume = nv;
            return nv;
          });
          resetHideTimer();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume((v) => {
            const nv = Math.max(0, v - 0.1);
            if (videoRef.current) videoRef.current.volume = nv;
            return nv;
          });
          resetHideTimer();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          setShowSubtitles((prev) => !prev);
          break;
        case 'Escape':
          if (showShortcutsModal) {
            setShowShortcutsModal(false);
          } else if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else {
            onClose();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seekRelative, toggleFullscreen, toggleMute, showShortcutsModal, onClose, resetHideTimer]);

  // Periodic progress tracking every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current && isPlaying) {
        saveProgress(videoRef.current.currentTime, videoRef.current.duration || duration);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isPlaying, duration, saveProgress]);

  // Cleanup on unmount: report final progress
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        saveProgress(videoRef.current.currentTime, videoRef.current.duration || duration);
      }
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    };
  }, [duration, saveProgress]);

  return (
    <div
      ref={containerRef}
      onMouseMove={resetHideTimer}
      onClick={resetHideTimer}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center select-none overflow-hidden"
    >
      {/* HTML5 Video with native Range streaming */}
      <video
        ref={videoRef}
        src={streamUrl}
        preload="auto"
        playsInline
        className="w-full h-full object-contain cursor-pointer"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onPlay={() => {
          setIsPlaying(true);
          setIsBuffering(false);
          setErrorMessage(null);
        }}
        onPause={() => {
          setIsPlaying(false);
          if (videoRef.current) {
            saveProgress(videoRef.current.currentTime, videoRef.current.duration || duration);
          }
        }}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onTimeUpdate={() => {
          if (!videoRef.current) return;
          setCurrentTime(videoRef.current.currentTime);
          if (videoRef.current.buffered.length > 0) {
            setBufferedTime(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
          }
        }}
        onLoadedMetadata={() => {
          if (!videoRef.current) return;
          const dur = videoRef.current.duration;
          if (dur && !isNaN(dur) && dur > 0) setDuration(dur);
          setIsBuffering(false);
          if (targetSeekTimeRef.current !== null) {
            videoRef.current.currentTime = targetSeekTimeRef.current;
            targetSeekTimeRef.current = null;
            if (wasPlayingRef.current) {
              videoRef.current.play().catch(() => {});
            }
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          saveProgress(duration, duration);
          if (onVideoEnded) onVideoEnded();
        }}
        onError={(e) => {
          console.error('Video player element error:', e);
          setIsBuffering(false);
          setErrorMessage(
            'Unable to stream this video segment. Check network connection or verify that the cloud reference is online.'
          );
        }}
      />

      {/* Simulated Subtitles overlay */}
      {showSubtitles && (
        <div className="absolute bottom-24 left-0 right-0 flex justify-center pointer-events-none px-6">
          <span className="bg-black/85 text-yellow-300 font-medium text-sm sm:text-base px-4 py-1.5 rounded-lg border border-white/10 tracking-wide text-center">
            [Subtitles Enabled — Audio track: Original Stereo / 48kHz]
          </span>
        </div>
      )}

      {/* Buffering Indicator */}
      {isBuffering && !errorMessage && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] pointer-events-none z-20">
          <Loader2 className="w-12 h-12 text-violet-400 animate-spin" />
          <span className="text-xs font-semibold text-slate-300 mt-3 tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Buffering stream chunks...
          </span>
        </div>
      )}

      {/* Resume Notification */}
      {resumeNotification && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-violet-950/80 backdrop-blur-md text-violet-200 text-xs font-bold px-4 py-2 rounded-xl border border-violet-500/40 shadow-xl flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          {resumeNotification}
        </div>
      )}

      {/* Resolution Quality Switch Notification */}
      {resolutionNotice && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-[#141722]/95 backdrop-blur-md text-white text-xs font-bold px-4 py-2 rounded-xl border border-cyan-500/40 shadow-2xl flex items-center gap-2">
          <Zap className="w-4 h-4 text-cyan-400 fill-cyan-400" />
          <span>{resolutionNotice}</span>
          <span className="text-[10px] font-mono font-normal text-slate-400">• Low-Latency Buffer</span>
        </div>
      )}


      {/* Error Recovery Overlay */}
      {errorMessage && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 p-6 text-center">
          <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
          <h3 className="text-lg font-bold text-white mb-2">Streaming Interruption</h3>
          <p className="text-sm text-slate-400 max-w-md mb-6">{errorMessage}</p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setErrorMessage(null);
                setIsBuffering(true);
                if (videoRef.current) {
                  videoRef.current.load();
                  videoRef.current.play().catch(() => {});
                }
              }}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs cursor-pointer shadow-lg shadow-violet-600/30"
            >
              Retry Connection
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs cursor-pointer"
            >
              Close Cinema
            </button>
          </div>
        </div>
      )}

      {/* Top Bar (Title & Close) */}
      <div
        className={`absolute top-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between z-20 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            aria-label="Close video player"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white truncate max-w-md sm:max-w-xl">
              {video.title}
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
              <span className="font-semibold text-cyan-400">MEGA STREAM X</span>
              <span>•</span>
              <span>HTTP 206 Byte-Range Active</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowShortcutsModal(true)}
          className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium"
          aria-label="Keyboard shortcuts"
        >
          <HelpCircle className="w-4 h-4 text-violet-400" />
          <span className="hidden sm:inline">Shortcuts</span>
        </button>
      </div>

      {/* Bottom HUD Controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-20 transition-opacity duration-300 space-y-3 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Scrubber / Seek Bar */}
        <div className="relative group/scrub flex items-center cursor-pointer py-1">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => {
              const val = Number(e.target.value);
              setCurrentTime(val);
              if (videoRef.current) {
                videoRef.current.currentTime = val;
                saveProgress(val, duration);
              }
            }}
            className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-violet-500 hover:h-2 transition-all"
            aria-label="Video scrubber"
          />

          {/* Buffered segment indicator */}
          {duration > 0 && (
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-white/30 rounded-lg pointer-events-none"
              style={{ width: `${Math.min(100, (bufferedTime / duration) * 100)}%` }}
            />
          )}
        </div>

        {/* Control Buttons Row */}
        <div className="flex items-center justify-between text-white">
          {/* Left: Playback controls */}
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center transition-transform hover:scale-105 shadow-lg shadow-violet-600/40 cursor-pointer"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>

            <button
              onClick={() => seekRelative(-10)}
              className="p-2 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Rewind 10 seconds (Left Arrow)"
              aria-label="Rewind 10 seconds"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => seekRelative(10)}
              className="p-2 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Forward 10 seconds (Right Arrow)"
              aria-label="Forward 10 seconds"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Volume */}
            <div className="flex items-center gap-2 group/volume">
              <button
                onClick={toggleMute}
                className="p-2 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                aria-label="Toggle mute"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const nv = Number(e.target.value);
                  setVolume(nv);
                  setIsMuted(false);
                  if (videoRef.current) {
                    videoRef.current.volume = nv;
                    videoRef.current.muted = false;
                  }
                }}
                className="w-16 sm:w-20 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-violet-400"
                aria-label="Volume slider"
              />
            </div>

            {/* Time readout */}
            <div className="text-xs font-mono font-medium text-slate-300 tracking-wider">
              <span>{formatDuration(currentTime)}</span>
              <span className="text-slate-500 mx-1">/</span>
              <span className="text-slate-400">{formatDuration(duration)}</span>
            </div>
          </div>

          {/* Right: Tools & Fullscreen */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Resolution / Quality Selector */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowResolutionMenu(!showResolutionMenu);
                  setShowSpeedMenu(false);
                }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  selectedResolution === '1080p' || selectedResolution === '720p'
                    ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/40 shadow-sm'
                    : 'bg-white/10 hover:bg-white/20 text-slate-200'
                }`}
                title="Select stream resolution / video quality (360p, 480p, 720p, 1080p HD)"
                aria-label="Video resolution"
              >
                <Sliders className="w-3 h-3 text-cyan-400" />
                <span>{selectedResolution === 'auto' ? 'Auto' : selectedResolution.toUpperCase()}</span>
                {(selectedResolution === '1080p' || selectedResolution === '720p') && (
                  <span className="text-[9px] font-black px-1 py-0.2 rounded bg-cyan-400 text-black">
                    HD
                  </span>
                )}
              </button>

              {showResolutionMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-48 rounded-2xl bg-[#141722] border border-white/10 shadow-2xl py-1.5 z-30 divide-y divide-white/5">
                  <div className="px-3.5 py-1.5 text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
                    <span>Quality / Resolution</span>
                    <span className="text-cyan-400 font-mono text-[9px]">FastStart</span>
                  </div>
                  <div className="py-1">
                    {resolutions.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => handleResolutionSelect(r.id)}
                        className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between hover:bg-white/5 cursor-pointer transition-colors ${
                          selectedResolution === r.id
                            ? 'text-cyan-300 font-bold bg-white/[0.04]'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span>{r.label}</span>
                          {r.height >= 720 && (
                            <span className="text-[9px] font-black px-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                              HD
                            </span>
                          )}
                        </div>
                        {selectedResolution === r.id && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Speed Selector */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowSpeedMenu(!showSpeedMenu);
                  setShowResolutionMenu(false);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-slate-200 transition-colors cursor-pointer"
                aria-label="Playback speed"
              >
                {playbackSpeed}x
              </button>

              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-28 rounded-xl bg-[#141722] border border-white/10 shadow-2xl py-1 z-30 divide-y divide-white/5">
                  <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-slate-400">
                    Speed
                  </div>
                  {PLAYBACK_SPEEDS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSpeedSelect(s)}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-white/5 cursor-pointer ${
                        playbackSpeed === s ? 'text-violet-400 font-bold' : 'text-slate-300'
                      }`}
                    >
                      <span>{s}x</span>
                      {playbackSpeed === s && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>


            {/* Subtitles (CC) */}
            <button
              onClick={() => setShowSubtitles(!showSubtitles)}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                showSubtitles ? 'bg-violet-600 text-white' : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
              title="Toggle Subtitles (C)"
              aria-label="Toggle subtitles"
            >
              <Subtitles className="w-4 h-4" />
            </button>

            {/* PiP */}
            <button
              onClick={togglePiP}
              className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer hidden sm:block"
              title="Picture-in-Picture"
              aria-label="Picture in picture"
            >
              <PictureInPicture className="w-4 h-4" />
            </button>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
              aria-label="Toggle fullscreen"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Modal */}
      {showShortcutsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setShowShortcutsModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[#141722] border border-white/10 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-violet-400" /> Keyboard Shortcuts
              </h3>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="divide-y divide-white/5 text-xs">
              {[
                { key: 'Space', desc: 'Play / Pause stream' },
                { key: 'Left Arrow', desc: 'Rewind 10 seconds' },
                { key: 'Right Arrow', desc: 'Fast forward 10 seconds' },
                { key: 'Up Arrow', desc: 'Increase volume (+10%)' },
                { key: 'Down Arrow', desc: 'Decrease volume (-10%)' },
                { key: 'F', desc: 'Toggle Fullscreen mode' },
                { key: 'M', desc: 'Toggle Audio Mute' },
                { key: 'C', desc: 'Toggle Subtitles (CC)' },
                { key: 'Esc', desc: 'Exit Fullscreen / Close Player' },
              ].map((item, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-300">{item.desc}</span>
                  <kbd className="px-2 py-1 rounded bg-black/60 border border-white/10 text-cyan-300 font-mono font-bold text-[11px]">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowShortcutsModal(false)}
              className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
