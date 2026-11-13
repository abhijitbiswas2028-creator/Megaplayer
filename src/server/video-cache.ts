import path from 'node:path';
import { db } from './db.ts';
import { mongoEnabled, collection, streamVideo, saveThumbnail } from './mongo/store.ts';
import { extractThumbnail, inspectThumbnail } from './thumbnail.ts';
import { withMegaThumbnailSource } from './thumbnail-source.ts';
import { decryptSensitiveRef } from './utils/crypto.ts';
import { megaAdapter } from './mega-adapter.ts';

/** Publish only a validated frame from this video's actual timeline. */
export async function refreshVideoMetadata(videoId: string, source: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(videoId)) throw new Error('Invalid video ID');
  const thumbnail = path.resolve('public/thumbnails', `${videoId}.jpg`);
  const { duration, timestamp } = await extractThumbnail(source, thumbnail);
  // Store the version in the URL so library, favorites and history all invalidate it.
  const now = new Date().toISOString();
  if (mongoEnabled) {
    const thumbnail_url = await saveThumbnail(thumbnail);
    await collection('videos').updateOne({id:videoId}, {$set:{duration_seconds:duration,thumbnail_url,updated_at:now}});
  } else db.prepare('UPDATE videos SET duration_seconds = ?, thumbnail_url = ?, updated_at = ? WHERE id = ?')
    .run(duration, `/thumbnails/${videoId}.jpg?v=${Date.now()}`, now, videoId);
  console.log(`[thumbnail] ${videoId}: selected frame at ${timestamp.toFixed(2)}s / ${duration.toFixed(2)}s`);
  return duration;
}

export async function repairVideoThumbnail(videoId: string, force = false) {
  const video = mongoEnabled ? await streamVideo(videoId) : db.prepare(`SELECT v.id, v.thumbnail_url, v.local_sample_path,
    ms.encrypted_ref, ms.iv, ms.auth_tag, ms.file_size FROM videos v
    LEFT JOIN mega_sources ms ON ms.id = v.mega_source_id WHERE v.id = ?`).get(videoId) as any;
  if (!video) return 'missing';
  if (!force && video.thumbnail_url) {
    const localUrl = video.thumbnail_url.split('?')[0];
    if (!localUrl.startsWith('/thumbnails/')) return 'external';
    const name = localUrl.slice('/thumbnails/'.length);
    if (name === path.basename(name) && (await inspectThumbnail(path.resolve('public/thumbnails', name))).usable) return 'healthy';
  }
  if (video.encrypted_ref) {
    const source = video.iv === 'direct' || /^https?:/.test(video.encrypted_ref) ? video.encrypted_ref
      : decryptSensitiveRef({ ciphertext: video.encrypted_ref, iv: video.iv, authTag: video.auth_tag });
    const size = video.file_size || (await megaAdapter.resolveLink(source)).size;
    if (!(size > 0)) throw new Error('Video size is unavailable');
    await withMegaThumbnailSource(source, size, stream => refreshVideoMetadata(videoId, stream));
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
  const videos = mongoEnabled ? await collection('videos').find({}, {projection:{id:1}}).toArray() : db.prepare('SELECT id FROM videos').all() as { id: string }[];
  for (const video of videos) queueThumbnailRepair(video.id);
}
