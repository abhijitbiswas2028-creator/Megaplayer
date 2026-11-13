import { MongoClient, Binary, type Db, type Document } from 'mongodb';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import thumbnailManifest from './thumbnail-manifest.json' with { type: 'json' };

export const mongoEnabled = Boolean(process.env.MONGODB_URI);
let client: MongoClient | undefined;
let database: Db | undefined;
export function mongo() {
  if (!database) throw new Error('MongoDB is not initialized');
  return database;
}
export function collection(name: string) { return mongo().collection<Document>(name); }
export async function connectMongo() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 20, maxIdleTimeMS: 60000, serverSelectionTimeoutMS: 10000, waitQueueTimeoutMS: 5000 });
  await client.connect();
  database = client.db(process.env.MONGODB_DATABASE || 'megaplayer');
  await database.command({ ping: 1 });
  for (const name of tables.filter(n => n !== 'video_categories')) {
    await collection(name).createIndex({ id: 1 }, { unique: true });
  }
  await Promise.all([
    collection('users').createIndex({ email: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } }),
    collection('sessions').createIndex({ token: 1 }, { unique: true }),
    collection('sessions').createIndex({ user_id: 1, expires_at: 1 }),
    collection('videos').createIndex({ slug: 1 }, { unique: true }),
    collection('videos').createIndex({ status: 1, is_featured: -1, created_at: -1 }),
    collection('videos').createIndex({ category_ids: 1, status: 1, created_at: -1 }),
    collection('videos').createIndex({ title: 1 }),
    collection('categories').createIndex({ slug: 1 }, { unique: true }),
    collection('watch_progress').createIndex({ user_id: 1, video_id: 1 }, { unique: true }),
    collection('watch_progress').createIndex({ user_id: 1, updated_at: -1 }),
    collection('favorites').createIndex({ user_id: 1, video_id: 1 }, { unique: true }),
    collection('invitations').createIndex({ token: 1 }, { unique: true }),
    collection('audit_logs').createIndex({ created_at: -1 }),
    collection('thumbnails').createIndex({ hash: 1 }, { unique: true }),
    collection('migrations').createIndex({ name: 1 }, { unique: true }),
  ]);
}
export async function closeMongo() { await client?.close(); database = undefined; client = undefined; }
export const tables = ['users','sessions','invitations','mega_sources','videos','categories','video_categories','playlists','playlist_items','watch_progress','favorites','audit_logs','stream_metrics'];

export async function saveThumbnail(file: string) {
  const bytes = await readFile(file);
  if (bytes.length > 8 * 1024 * 1024) throw new Error('Thumbnail exceeds 8 MB');
  const png = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216;
  if (!png && !jpeg) throw new Error('Thumbnail must be PNG or JPEG');
  const hash = createHash('sha256').update(bytes).digest('hex');
  await collection('thumbnails').updateOne({ hash }, { $setOnInsert: { hash, bytes: new Binary(bytes), content_type: png ? 'image/png' : 'image/jpeg', size: bytes.length } }, { upsert: true });
  return `/media/thumbnails/${hash}`;
}

// Run before accepting requests. Upserts make interrupted imports restartable; the
// completion marker prevents later starts from overwriting newer MongoDB records.
export async function migrateSqlite(source: DatabaseSync) {
  if (await collection('migrations').findOne({ name: 'sqlite-v1', complete: true })) return;
  const counts: Record<string, number> = {};
  for (const name of tables) {
    if (name === 'video_categories') continue;
    const rows = source.prepare(`SELECT * FROM ${name}`).all() as Document[];
    counts[name] = rows.length;
    for (const row of rows) {
      if (name === 'videos') {
        row.category_ids = source.prepare('SELECT category_id FROM video_categories WHERE video_id = ?').all(row.id).map(r => r.category_id);
        if (typeof row.thumbnail_url === 'string' && row.thumbnail_url.startsWith('/thumbnails/')) {
          const filename = row.thumbnail_url.split('?')[0].slice('/thumbnails/'.length);
          if (filename === path.basename(filename)) {
            try { row.thumbnail_url = await saveThumbnail(path.resolve('public/thumbnails', filename)); }
            catch (error: any) {
              if (error.code !== 'ENOENT') throw error;
              // The prior server generated some thumbnails on ephemeral disk.
              // Recover their original bundled preview using the source identity.
              const sourceRow = source.prepare('SELECT file_id FROM mega_sources WHERE id = ?').get(row.mega_source_id) as {file_id:string}|undefined;
              const original = sourceRow && (thumbnailManifest as Record<string,string>)[createHash('sha256').update(sourceRow.file_id).digest('hex')];
              if (original) row.thumbnail_url = await saveThumbnail(path.resolve('public/thumbnails', original));
            }
          }
        }
      }
      await collection(name).updateOne({ id: row.id }, { $setOnInsert: row }, { upsert: true });
    }
    // Confirm every source identity survived before switching the running app.
    if (rows.length && await collection(name).countDocuments({ id: { $in: rows.map(r => r.id) } }) !== rows.length) {
      throw new Error(`Migration verification failed for ${name}`);
    }
  }
  await collection('migrations').updateOne({ name: 'sqlite-v1' }, { $set: { complete: true, counts, completed_at: new Date().toISOString() } }, { upsert: true });
  console.log('MongoDB migration verified:', counts.videos, 'videos');
}

export async function streamVideo(id: string) {
  const video = await collection('videos').findOne({ $or: [{ id }, { slug: id }] });
  if (!video) return null;
  const source = video.mega_source_id ? await collection('mega_sources').findOne({ id: video.mega_source_id }) : null;
  return { ...source, ...video };
}
export async function incrementViews(id: string) { await collection('videos').updateOne({ id }, { $inc: { view_count: 1 } }); }
