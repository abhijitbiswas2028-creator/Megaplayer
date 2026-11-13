import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { db, initDatabase } from '../src/server/db.ts';
import { refreshVideoMetadata } from '../src/server/video-cache.ts';

initDatabase();
const rows = db.prepare(`SELECT v.id, v.duration_seconds, ms.file_size FROM videos v
  LEFT JOIN mega_sources ms ON ms.id = v.mega_source_id`).all() as { id: string; duration_seconds: number; file_size: number }[];
let repaired = 0;
for (const row of rows) {
  const source = path.resolve('data/cache', `${row.id.replace(/[^a-zA-Z0-9_-]/g, '')}_source.mp4`);
  if (!fs.existsSync(source)) continue;
  if (row.file_size && fs.statSync(source).size !== row.file_size) {
    console.warn(`${row.id}: source incomplete, skipped`);
    continue;
  }
  try {
    const duration = await refreshVideoMetadata(row.id, source);
    console.log(`${row.id}: ${row.duration_seconds}s → ${duration.toFixed(3)}s; thumbnail refreshed`);
    repaired++;
  } catch {
    console.warn(`${row.id}: could not read media`);
  }
}
console.log(`Repaired ${repaired} cached videos. Uncached sources are corrected when media metadata loads during playback.`);
