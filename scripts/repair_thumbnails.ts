import 'dotenv/config';
import { repairVideoThumbnail } from '../src/server/video-cache.ts';
import { connectMongo, collection, closeMongo } from '../src/server/mongo/store.ts';

await connectMongo();

const ids = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const force = process.argv.includes('--force');
const videos = ids.length
  ? ids.map((id) => ({ id }))
  : await collection('videos').find({}, { projection: { id: 1 } }).sort({ created_at: -1 }).toArray();

const totals: Record<string, number> = {};
for (const { id } of videos) {
  try {
    const result = await repairVideoThumbnail(id, force);
    totals[result] = (totals[result] || 0) + 1;
    console.log(`${id}: ${result}`);
  } catch (error) {
    totals.failed = (totals.failed || 0) + 1;
    const message =
      error instanceof Error &&
      /^(Unable to read original video metadata|No clear video frame found|Invalid media duration|Video size is unavailable)/.test(
        error.message
      )
        ? error.message
        : 'Source unavailable; existing thumbnail preserved';
    console.warn(`${id}: ${message}`);
  }
}
console.log('Thumbnail repair results:', totals);
if (totals.failed) process.exitCode = 1;

await closeMongo();
