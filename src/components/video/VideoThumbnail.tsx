import React, { useState, useEffect } from 'react';
import { Play } from 'lucide-react';
import { resolveBackendUrl } from '../../lib/api.ts';

/** Renders video thumbnail with automatic cache busting and error recovery. */
export function VideoThumbnail({
  src,
  title,
  className = '',
  eager = false,
}: {
  src?: string;
  title: string;
  className?: string;
  eager?: boolean;
}) {
  const [hasError, setHasError] = useState(false);
  const [retrySrc, setRetrySrc] = useState<string | null>(null);

  useEffect(() => {
    setHasError(false);
    setRetrySrc(null);
  }, [src]);

  const normalizedSrc = resolveBackendUrl(src);
  const activeSrc = retrySrc || normalizedSrc;

  const handleImageError = () => {
    if (!retrySrc && normalizedSrc) {
      // First attempt to bust any stale browser cache with a direct timestamp
      const separator = normalizedSrc.includes('?') ? '&' : '?';
      setRetrySrc(`${normalizedSrc}${separator}r=${Date.now()}`);
    } else {
      setHasError(true);
    }
  };

  if (!activeSrc || hasError) {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 bg-[#171a22] text-slate-500 ${className}`}>
        <Play className="w-9 h-9 opacity-60" aria-hidden="true" />
        <span className="text-xs font-medium text-slate-400">Preview unavailable</span>
      </div>
    );
  }

  return (
    <img
      key={activeSrc}
      src={activeSrc}
      alt={title}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={handleImageError}
      className={className}
    />
  );
}
