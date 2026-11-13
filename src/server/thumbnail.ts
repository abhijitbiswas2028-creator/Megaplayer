import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const run = promisify(execFile);
const width = 96;
const height = 54;

/** Reject blank/slate frames by their pixels, never by JPEG file size. */
export function scoreFrame(rgb: Uint8Array) {
  if (rgb.length !== width * height * 3) return { usable: false, score: 0 };
  let sum = 0, squares = 0, dark = 0, blue = 0;
  const colors = new Map<number, number>();
  for (let i = 0; i < rgb.length; i += 3) {
    const [r, g, b] = [rgb[i], rgb[i + 1], rgb[i + 2]];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += luma;
    squares += luma * luma;
    if (luma < 24) dark++;
    if (b > r * 1.4 && b > g * 1.2) blue++;
    const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
    colors.set(key, (colors.get(key) || 0) + 1);
  }
  const count = rgb.length / 3;
  const mean = sum / count;
  const deviation = Math.sqrt(Math.max(0, squares / count - mean * mean));
  const dominant = Math.max(...colors.values()) / count;
  const usable = mean >= 28 && mean <= 240 && dark / count < 0.85 && deviation >= 12
    && dominant < 0.88 && !(blue / count > 0.8 && colors.size < 24);
  return { usable, score: deviation + Math.min(mean, 150) * 0.25 + colors.size * 0.15 - dominant * 40 };
}

export async function inspectThumbnail(file: string) {
  try {
    const { stdout } = await run('ffmpeg', ['-v', 'error', '-threads', '1', '-i', file,
      '-frames:v', '1', '-vf', `scale=${width}:${height}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-threads', '1', 'pipe:1'],
    { encoding: 'buffer', timeout: 10000, maxBuffer: 1024 * 1024 });
    return scoreFrame(stdout);
  } catch { return { usable: false, score: 0 }; }
}

export function thumbnailTimes(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid media duration');
  // Avoid end-of-file and black opening frames, including on sub-second clips.
  return [...new Set([0.1, 0.5, 0.9, 0.25, 0.75, 0.05, 0.95].map(f =>
    Number(Math.min(duration * f, Math.max(0, duration - 0.1)).toFixed(4))))];
}

export async function extractThumbnail(source: string, destination: string) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', source],
    { timeout: 45000, maxBuffer: 1024 * 1024 }).catch(() => {
      throw new Error('Unable to read original video metadata (unavailable or timed out)');
    });
  const duration = Number(JSON.parse(stdout).format?.duration);
  const times = thumbnailTimes(duration);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temp = await fs.mkdtemp(path.join(path.dirname(destination), '.frames-'));
  let best: { file: string; score: number; time: number } | undefined;
  try {
    for (let i = 0; i < times.length; i++) {
      const file = path.join(temp, `${i}.jpg`);
      try {
        await run('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '1', '-ss', String(times[i]), '-i', source,
          '-map', '0:v:0', '-frames:v', '1', '-vf', "scale=w='min(960,iw)':h=-2", '-q:v', '2', '-threads', '1', file],
        { timeout: 45000, maxBuffer: 1024 * 1024 });
        const quality = await inspectThumbnail(file);
        if (quality.usable && (!best || quality.score > best.score)) best = { file, score: quality.score, time: times[i] };
      } catch { /* A damaged section must not prevent trying another timestamp. */ }
      // Compare beginning, middle and end; broaden the search only if all fail.
      if (i >= 2 && best) break;
    }
    if (!best) throw new Error('No clear video frame found; existing thumbnail preserved');
    await fs.rename(best.file, destination);
    return { duration, timestamp: best.time };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
