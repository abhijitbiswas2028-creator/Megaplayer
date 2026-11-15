import 'dotenv/config';
import { connectMongo, collection, closeMongo } from '../src/server/mongo/store.ts';
import { withMegaThumbnailSource } from '../src/server/thumbnail-source.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export async function probeVideoDuration(encryptedRef: string, fileSize: number): Promise<number> {
  return await withMegaThumbnailSource(encryptedRef, fileSize, async (sourceUrl) => {
    const { stdout } = await run('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'json',
      sourceUrl,
    ], { timeout: 45000 });
    const parsed = JSON.parse(stdout);
    const duration = parseFloat(parsed.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`Invalid duration parsed by ffprobe: ${parsed.format?.duration}`);
    }
    return duration;
  });
}

function formatDurationHuman(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  return `${hrs ? `${hrs}h ` : ''}${mins}m ${secs}s`;
}

async function main() {
  console.log('>>> Connecting to MongoDB Atlas...');
  await connectMongo();

  const videos = await collection('videos').find({}).toArray();
  const sources = await collection('mega_sources').find({}).toArray();
  const sourceMap = new Map(sources.map((s) => [s.id, s]));

  // Find all videos with exact integer durations (dummy/placeholder values)
  const toRepair = videos.filter((v) => {
    return v.duration_seconds === Math.floor(v.duration_seconds) && Boolean(v.mega_source_id);
  });

  console.log(`Found ${toRepair.length} videos with dummy/integer durations out of ${videos.length} total videos.`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < toRepair.length; i++) {
    const v = toRepair[i];
    const s = sourceMap.get(v.mega_source_id);

    if (!s || !s.encrypted_ref || !(s.file_size > 0)) {
      console.warn(`[${i + 1}/${toRepair.length}] Skipping ${v.id}: missing mega source or invalid file size.`);
      failCount++;
      continue;
    }

    console.log(`[${i + 1}/${toRepair.length}] Probing "${v.title}" (${v.id})... (old dur: ${v.duration_seconds}s)`);

    let probed = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const realDuration = await probeVideoDuration(s.encrypted_ref, s.file_size);
        const now = new Date().toISOString();

        await collection('videos').updateOne(
          { id: v.id },
          { $set: { duration_seconds: realDuration, updated_at: now } }
        );

        // Also update any watch progress records for this video
        await collection('watch_progress').updateMany(
          { video_id: v.id },
          { $set: { duration_seconds: realDuration, updated_at: now } }
        );

        console.log(
          `  ✔ Repaired ${v.id}: ${v.duration_seconds}s -> ${realDuration.toFixed(2)}s (${formatDurationHuman(realDuration)})`
        );
        successCount++;
        probed = true;
        break;
      } catch (err: any) {
        if (attempt === 1) {
          console.warn(`  Retrying ${v.id} (attempt 2/2)... ${err.message}`);
        } else {
          console.error(`  ✖ Failed to probe ${v.id}:`, err.message);
          failCount++;
        }
      }
    }
  }

  console.log('\n========================================');
  console.log(`Duration repair complete: ${successCount} updated, ${failCount} failed.`);
  console.log('========================================');

  await closeMongo();
}

if (process.argv[1]?.endsWith('repair_video_durations.ts')) {
  main().catch((err) => {
    console.error('Fatal duration repair failure:', err);
    process.exit(1);
  });
}
