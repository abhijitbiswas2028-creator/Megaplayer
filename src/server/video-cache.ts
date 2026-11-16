import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { collection, streamVideo, saveThumbnail } from './mongo/store.ts';
import { extractThumbnail, inspectThumbnail } from './thumbnail.ts';
import { withMegaThumbnailSource } from './thumbnail-source.ts';
import { decryptSensitiveRef } from './utils/crypto.ts';
import { megaAdapter } from './mega-adapter.ts';
import { recoverMegaPreview } from './mega-preview.ts';

const run = promisify(execFile);

/** Publish only a validated frame or official server preview from this video. */
export async function refreshVideoMetadata(videoId: string, source: string, originalUrl?: string): Promise<number> {
  if (!/^[a-zA-Z0-9_-]+$/.test(videoId)) throw new Error('Invalid video ID');
  const thumbnail = path.resolve('public/thumbnails', `${videoId}.jpg`);
  await fs.mkdir(path.dirname(thumbnail), { recursive: true });

  let duration: number | undefined;
  let usedMegaPreview = false;

  const targetMegaUrl = originalUrl || (/^https?:\/\/(?:mega\.nz|mega\.io)\//.test(source) ? source : undefined);
  if (targetMegaUrl) {
    try {
      await recoverMegaPreview(targetMegaUrl, thumbnail);
      usedMegaPreview = true;
      console.log(`[thumbnail] ${videoId}: recovered official MEGA server preview`);
    } catch (err: any) {
      console.warn(`[thumbnail] ${videoId}: official MEGA preview unavailable (${err?.message || err}), falling back to stream extraction`);
    }
  }

  if (!usedMegaPreview) {
    const extracted = await extractThumbnail(source, thumbnail);
    duration = extracted.duration;
    console.log(`[thumbnail] ${videoId}: selected frame at ${extracted.timestamp.toFixed(2)}s / ${extracted.duration.toFixed(2)}s`);
  } else {
    try {
      const { stdout } = await run('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'json',
        source,
      ], { timeout: 45000, maxBuffer: 1024 * 1024 });
      const parsed = JSON.parse(stdout);
      const probed = Number(parsed.format?.duration);
      if (Number.isFinite(probed) && probed > 0) {
        duration = probed;
      }
    } catch {
      // Keep existing duration on timeout or network probe issue
    }
  }

  if (!duration || !Number.isFinite(duration) || duration <= 0) {
    const existing = await collection('videos').findOne({ id: videoId }, { projection: { duration_seconds: 1 } });
    duration = Number(existing?.duration_seconds) || 0;
  }

  const now = new Date().toISOString();
  const thumbnail_url = await saveThumbnail(thumbnail);
  const update: Record<string, any> = { thumbnail_url, updated_at: now };
  if (duration > 0) {
    update.duration_seconds = duration;
  }
  await collection('videos').updateOne({ id: videoId }, { $set: update });
  return duration;
}

export async function repairVideoThumbnail(videoId: string, force = false) {
  const video = await streamVideo(videoId);
  if (!video) return 'missing';
  if (!force && video.thumbnail_url) {
    if (video.thumbnail_url.startsWith('/media/thumbnails/')) {
      const localFile = path.resolve('public/thumbnails', `${videoId}.jpg`);
      if (fsSync.existsSync(localFile)) {
        const check = await inspectThumbnail(localFile);
        if (check.usable) return 'healthy';
      } else {
        const hash = video.thumbnail_url.replace('/media/thumbnails/', '').split('?')[0];
        const row = await collection('thumbnails').findOne({ hash });
        if (row?.bytes) {
          const tempCheck = path.resolve('public/thumbnails', `.check-${videoId}.jpg`);
          try {
            await fs.writeFile(tempCheck, Buffer.from(row.bytes.buffer));
            const check = await inspectThumbnail(tempCheck);
            if (check.usable) return 'healthy';
          } finally {
            await fs.rm(tempCheck, { force: true });
          }
        }
      }
    } else {
      const localUrl = video.thumbnail_url.split('?')[0];
      if (!localUrl.startsWith('/thumbnails/')) return 'external';
      const name = localUrl.slice('/thumbnails/'.length);
      if (name === path.basename(name) && (await inspectThumbnail(path.resolve('public/thumbnails', name))).usable) return 'healthy';
    }
  }
  if (video.encrypted_ref) {
    const source = video.iv === 'direct' || /^https?:/.test(video.encrypted_ref) ? video.encrypted_ref
      : decryptSensitiveRef({ ciphertext: video.encrypted_ref, iv: video.iv, authTag: video.auth_tag });
    const size = video.file_size || (await megaAdapter.resolveLink(source)).size;
    if (!(size > 0)) throw new Error('Video size is unavailable');
    await withMegaThumbnailSource(source, size, stream => refreshVideoMetadata(videoId, stream, source));
  } else if (video.local_sample_path) {
    await refreshVideoMetadata(videoId, video.local_sample_path);
  } else throw new Error('No video source available');
  return 'repaired';
}

const pending = new Set<string>();
let worker: Promise<void> | undefined;

/** Single worker prevents thumbnail extraction from overwhelming playback. */
export function queueThumbnailRepair(videoId: string) {
  pending.add(videoId);
  if (worker) return;
  worker = (async () => {
    for (const id of pending) {
      try { await repairVideoThumbnail(id); }
      catch { console.warn(`[thumbnail] ${id}: repair unavailable; keeping existing preview`); }
      finally { pending.delete(id); }
    }
  })().finally(() => { worker = undefined; });
}

export async function repairLibraryThumbnails() {
  const videos = await collection('videos').find({}, { projection: { id: 1 } }).toArray();
  for (const video of videos) queueThumbnailRepair(video.id);
}

export async function repairLibraryDurations() {
  const videos = await collection('videos').find({}).toArray();
  const sources = await collection('mega_sources').find({}).toArray();
  const sourceMap = new Map(sources.map((s) => [s.id, s]));

  for (const v of videos) {
    if (v.duration_seconds === Math.floor(v.duration_seconds) && v.mega_source_id) {
      const s = sourceMap.get(v.mega_source_id);
      if (s?.encrypted_ref && s.file_size > 0) {
        try {
          const { probeVideoDuration } = await import('../../scripts/repair_video_durations.ts');
          const realDuration = await probeVideoDuration(s.encrypted_ref, s.file_size);
          await collection('videos').updateOne(
            { id: v.id },
            { $set: { duration_seconds: realDuration, updated_at: new Date().toISOString() } }
          );
          console.log(`[duration] Repaired ${v.id}: ${v.duration_seconds}s -> ${realDuration.toFixed(2)}s`);
        } catch {
          // Keep existing duration on network error
        }
      }
    }
  }
}
