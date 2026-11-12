import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { megaAdapter } from './mega-adapter.ts';

const CACHE_DIR = path.resolve(process.cwd(), 'data/cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export interface ResolutionOption {
  id: string;
  label: string;
  badge: string;
  height: number;
  available: boolean;
}

export const SUPPORTED_RESOLUTIONS: { id: string; label: string; badge: string; height: number; scaleArg?: string; crf: number }[] = [
  { id: 'auto', label: 'Auto (Best Quality)', badge: 'FastStart', height: 0, crf: 20 },
  { id: '1080p', label: '1080p HD', badge: '1080p', height: 1080, scaleArg: 'scale=-2:1080', crf: 19 },
  { id: '720p', label: '720p HD', badge: '720p', height: 720, scaleArg: 'scale=-2:720', crf: 21 },
  { id: '480p', label: '480p SD', badge: '480p', height: 480, scaleArg: 'scale=-2:480', crf: 23 },
  { id: '360p', label: '360p Data Saver', badge: '360p', height: 360, scaleArg: 'scale=-2:360', crf: 26 },
];

/**
 * Get file path for a video and resolution tier
 */
export function getResolutionFilePath(videoId: string, resolution: string): string | null {
  const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  
  if (resolution === 'auto' || resolution === 'source') {
    const faststartPath = path.join(CACHE_DIR, `${cleanId}_source_faststart.mp4`);
    if (fs.existsSync(faststartPath)) return faststartPath;

    const sourcePath = path.join(CACHE_DIR, `${cleanId}_source.mp4`);
    if (fs.existsSync(sourcePath)) return sourcePath;

    return null;
  }

  const resPath = path.join(CACHE_DIR, `${cleanId}_${resolution}.mp4`);
  if (fs.existsSync(resPath)) {
    return resPath;
  }

  // Fallback to faststart or source if requested resolution is still processing
  const fallbackFaststart = path.join(CACHE_DIR, `${cleanId}_source_faststart.mp4`);
  if (fs.existsSync(fallbackFaststart)) return fallbackFaststart;

  const fallbackSource = path.join(CACHE_DIR, `${cleanId}_source.mp4`);
  if (fs.existsSync(fallbackSource)) return fallbackSource;

  return null;
}

/**
 * Check which resolutions are currently available on disk
 */
export function getAvailableResolutions(videoId: string): ResolutionOption[] {
  const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  
  return SUPPORTED_RESOLUTIONS.map((res) => {
    let available = false;
    if (res.id === 'auto') {
      available = fs.existsSync(path.join(CACHE_DIR, `${cleanId}_source_faststart.mp4`)) ||
                  fs.existsSync(path.join(CACHE_DIR, `${cleanId}_source.mp4`));
    } else {
      available = fs.existsSync(path.join(CACHE_DIR, `${cleanId}_${res.id}.mp4`));
    }
    return {
      id: res.id,
      label: res.label,
      badge: res.badge,
      height: res.height,
      available,
    };
  });
}

const activeTranscodes = new Set<string>();

/**
 * Asynchronously cache and transcode a MEGA video to multi-resolution with faststart
 */
export function ensureVideoCachedAndTranscoded(videoId: string, megaUrl: string, totalSize: number) {
  const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (activeTranscodes.has(cleanId)) return;

  const sourceFile = path.join(CACHE_DIR, `${cleanId}_source.mp4`);
  const faststartFile = path.join(CACHE_DIR, `${cleanId}_source_faststart.mp4`);

  if (fs.existsSync(faststartFile) && fs.existsSync(path.join(CACHE_DIR, `${cleanId}_720p.mp4`))) {
    return; // Already cached and ready
  }

  activeTranscodes.add(cleanId);

  // Step 1: Download source video
  const downloadStream = megaAdapter.createStream(megaUrl, undefined, totalSize);
  const out = fs.createWriteStream(sourceFile);

  downloadStream.stream.pipe(out);

  out.on('finish', () => {
    // Step 2: Generate FastStart source
    const faststartCmd = `ffmpeg -y -i "${sourceFile}" -c copy -movflags +faststart "${faststartFile}"`;
    exec(faststartCmd, (err) => {
      if (err) console.error(`Faststart generation error for ${cleanId}:`, err);

      // Step 3: Generate renditions in background (360p, 480p, 720p, 1080p)
      const renditions = [
        { res: '360p', scale: 'scale=-2:360', crf: 26 },
        { res: '480p', scale: 'scale=-2:480', crf: 23 },
        { res: '720p', scale: 'scale=-2:720', crf: 21 },
        { res: '1080p', scale: 'scale=-2:1080', crf: 19 },
      ];

      let chain = Promise.resolve();
      for (const item of renditions) {
        chain = chain.then(() => new Promise<void>((resolve) => {
          const outResFile = path.join(CACHE_DIR, `${cleanId}_${item.res}.mp4`);
          const cmd = `ffmpeg -y -i "${sourceFile}" -vf "${item.scale}" -c:v libx264 -preset ultrafast -crf ${item.crf} -c:a copy -movflags +faststart "${outResFile}"`;
          exec(cmd, (transcodeErr) => {
            if (transcodeErr) console.warn(`Transcode error ${cleanId} ${item.res}:`, transcodeErr.message);
            resolve();
          });
        }));
      }

      chain.finally(() => {
        activeTranscodes.delete(cleanId);
      });
    });
  });

  out.on('error', (err) => {
    console.error(`Cache download error for ${cleanId}:`, err);
    activeTranscodes.delete(cleanId);
  });
}
