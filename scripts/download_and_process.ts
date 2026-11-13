import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import { File as MegaFile } from 'megajs';

const MEGA_URL = 'https://mega.nz/file/aMlS3RCJ#KZxQD7g946udnMhyLIdYfujdd84jLC9opbK8aZJBLp0';
const FILE_ID = 'aMlS3RCJ';
const CLEAN_ID = `vid_mega_${FILE_ID}`;
const EXPECTED_SIZE = 228263982;

const CACHE_DIR = path.resolve(process.cwd(), 'data/cache');
const THUMBNAIL_DIR = path.resolve(process.cwd(), 'public/thumbnails');

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
if (!fs.existsSync(THUMBNAIL_DIR)) fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });

async function run() {
  console.log(`[1/5] Starting download for ${FILE_ID}...`);
  const targetSource = path.join(CACHE_DIR, `${CLEAN_ID}_source.mp4`);
  const tmpSource = path.join(CACHE_DIR, `${CLEAN_ID}_source.mp4.part`);

  if (!fs.existsSync(targetSource) || fs.statSync(targetSource).size !== EXPECTED_SIZE) {
    const file = MegaFile.fromURL(MEGA_URL);
    await new Promise<void>((resolve, reject) => {
      file.loadAttributes((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log(`Remote loaded: name="${file.name}", size=${file.size} bytes`);
    const stream = file.download({ start: 0, end: EXPECTED_SIZE - 1, maxConnections: 3 });
    const ws = fs.createWriteStream(tmpSource);

    let downloaded = 0;
    let lastLog = Date.now();
    stream.on('data', (chunk: Buffer) => {
      downloaded += chunk.length;
      if (Date.now() - lastLog > 2000) {
        lastLog = Date.now();
        console.log(`Downloaded ${(downloaded / (1024 * 1024)).toFixed(1)} / ${(EXPECTED_SIZE / (1024 * 1024)).toFixed(1)} MB (${Math.round((downloaded / EXPECTED_SIZE) * 100)}%)`);
      }
    });

    await pipeline(stream, ws);

    const actualSize = fs.statSync(tmpSource).size;
    console.log(`Download finished. Written size: ${actualSize} bytes.`);
    if (actualSize !== EXPECTED_SIZE) {
      throw new Error(`Size mismatch: expected ${EXPECTED_SIZE}, got ${actualSize}`);
    }
    fs.renameSync(tmpSource, targetSource);
  } else {
    console.log(`Source already downloaded and verified: ${targetSource}`);
  }

  console.log(`[2/5] Probing media with ffprobe...`);
  const probeOutput = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration,size,bit_rate:stream=codec_name,width,height,r_frame_rate,duration',
    '-of', 'json',
    targetSource
  ], { encoding: 'utf-8' });

  const probe = JSON.parse(probeOutput);
  console.log('ffprobe media info:', JSON.stringify(probe, null, 2));

  const duration = parseFloat(probe.format.duration);
  console.log(`Media duration: ${duration}s (${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s)`);

  console.log(`[3/5] Extracting thumbnails...`);
  const thumbPath = path.join(THUMBNAIL_DIR, `${CLEAN_ID}.jpg`);
  const altThumbPath = path.join(THUMBNAIL_DIR, `mega_${FILE_ID.toLowerCase()}.jpg`);

  const thumbTime = Math.min(15, Math.max(1, duration * 0.1));
  execFileSync('ffmpeg', [
    '-v', 'error',
    '-y',
    '-ss', thumbTime.toFixed(2),
    '-i', targetSource,
    '-frames:v', '1',
    '-vf', 'scale=960:-2',
    '-q:v', '2',
    thumbPath
  ]);
  fs.copyFileSync(thumbPath, altThumbPath);
  console.log(`Created thumbnail at ${thumbPath} (${fs.statSync(thumbPath).size} bytes)`);

  console.log(`[4/5] Generating faststart and transcoded renditions...`);
  const faststartFile = path.join(CACHE_DIR, `${CLEAN_ID}_source_faststart.mp4`);
  if (!fs.existsSync(faststartFile) || fs.statSync(faststartFile).size === 0) {
    const tmpFs = `${faststartFile}.part.mp4`;
    execFileSync('ffmpeg', [
      '-v', 'error',
      '-y',
      '-i', targetSource,
      '-c', 'copy',
      '-movflags', '+faststart',
      tmpFs
    ]);
    fs.renameSync(tmpFs, faststartFile);
    console.log(`Created faststart: ${faststartFile} (${(fs.statSync(faststartFile).size / (1024 * 1024)).toFixed(1)} MB)`);
  }

  // 360p rendition
  const p360File = path.join(CACHE_DIR, `${CLEAN_ID}_360p.mp4`);
  if (!fs.existsSync(p360File) || fs.statSync(p360File).size === 0) {
    const tmp360 = `${p360File}.part.mp4`;
    console.log(`Transcoding 360p...`);
    execFileSync('ffmpeg', [
      '-v', 'error',
      '-y',
      '-i', targetSource,
      '-vf', 'scale=-2:360',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '26',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      tmp360
    ]);
    fs.renameSync(tmp360, p360File);
    console.log(`Created 360p: ${p360File} (${(fs.statSync(p360File).size / (1024 * 1024)).toFixed(1)} MB)`);
  }

  // 720p rendition
  const p720File = path.join(CACHE_DIR, `${CLEAN_ID}_720p.mp4`);
  if (!fs.existsSync(p720File) || fs.statSync(p720File).size === 0) {
    const tmp720 = `${p720File}.part.mp4`;
    console.log(`Transcoding 720p...`);
    execFileSync('ffmpeg', [
      '-v', 'error',
      '-y',
      '-i', targetSource,
      '-vf', 'scale=-2:720',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      tmp720
    ]);
    fs.renameSync(tmp720, p720File);
    console.log(`Created 720p: ${p720File} (${(fs.statSync(p720File).size / (1024 * 1024)).toFixed(1)} MB)`);
  }

  console.log(`[5/5] All processing complete!`);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
