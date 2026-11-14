import { MongoClient, Binary, type Db, type Document } from 'mongodb';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { hashPassword } from '../utils/crypto.ts';

export const mongoEnabled = true;
let client: MongoClient | undefined;
let database: Db | undefined;

export function mongo() {
  if (!database) throw new Error('MongoDB is not initialized');
  return database;
}

export function collection(name: string) {
  return mongo().collection<Document>(name);
}

export async function seedMongoIfEmpty() {
  const userCount = await collection('users').countDocuments();
  if (userCount === 0) {
    const now = new Date().toISOString();
    const ownerAuth = hashPassword('Owner12345!');
    const ownerId = 'usr_owner_root';
    await collection('users').insertOne({
      id: ownerId,
      email: 'owner@megastreamx.com',
      password_hash: ownerAuth.hash,
      salt: ownerAuth.salt,
      display_name: 'Nexus Architect (Owner)',
      role: 'OWNER',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
    });

    const friendAuth = hashPassword('Friend12345!');
    const friendId = 'usr_friend_sam';
    await collection('users').insertOne({
      id: friendId,
      email: 'friend@megastreamx.com',
      password_hash: friendAuth.hash,
      salt: friendAuth.salt,
      display_name: 'Alex Mercer (Invited Friend)',
      role: 'FRIEND',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
    });

    const oneMonthAhead = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    await collection('invitations').insertOne({
      id: 'inv_vip_friend_01',
      token: 'MSX-VIP-INVITE-2026',
      created_by_user_id: ownerId,
      invited_email: 'friend2@megastreamx.com',
      role: 'FRIEND',
      max_uses: 10,
      uses_count: 1,
      expires_at: oneMonthAhead,
      status: 'PENDING',
      created_at: now,
    });
  }

  const categoryCount = await collection('categories').countDocuments();
  if (categoryCount === 0) {
    const cats = [
      { id: 'cat_movies', name: 'Movies', slug: 'movies', icon: 'Film', description: 'Feature films, cinema releases, and independent productions', sort_order: 1 },
      { id: 'cat_series', name: 'Series', slug: 'series', icon: 'Tv', description: 'Episodic content, seasonal shows, and miniseries', sort_order: 2 },
      { id: 'cat_docu', name: 'Documentaries', slug: 'documentaries', icon: 'Globe', description: 'Nature, science, history, and true chronicles', sort_order: 3 },
      { id: 'cat_tutorials', name: 'Tutorials & Tech', slug: 'tutorials', icon: 'BookOpen', description: 'Engineering, creative deep dives, and masterclasses', sort_order: 4 },
      { id: 'cat_animation', name: 'Anime & 3D Art', slug: 'animation', icon: 'Sparkles', description: 'CGI shorts, animated masterworks, and stylized films', sort_order: 5 },
    ];
    await collection('categories').insertMany(cats);
  }
}

export async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is required');
  client = new MongoClient(uri, {
    maxPoolSize: 20,
    maxIdleTimeMS: 60000,
    serverSelectionTimeoutMS: 10000,
    waitQueueTimeoutMS: 5000,
  });
  await client.connect();
  database = client.db(process.env.MONGODB_DATABASE || 'megaplayer');
  await database.command({ ping: 1 });

  for (const name of tables.filter((n) => n !== 'video_categories')) {
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
    collection('videos').createIndex({ is_featured: -1, created_at: -1 }),
    collection('videos').createIndex({ view_count: -1, created_at: -1 }),
    collection('videos').createIndex({ duration_seconds: -1 }),
    collection('categories').createIndex({ slug: 1 }, { unique: true }),
    collection('watch_progress').createIndex({ user_id: 1, video_id: 1 }, { unique: true }),
    collection('watch_progress').createIndex({ user_id: 1, updated_at: -1 }),
    collection('favorites').createIndex({ user_id: 1, video_id: 1 }, { unique: true }),
    collection('invitations').createIndex({ token: 1 }, { unique: true }),
    collection('audit_logs').createIndex({ created_at: -1 }),
    collection('thumbnails').createIndex({ hash: 1 }, { unique: true }),
    collection('migrations').createIndex({ name: 1 }, { unique: true }),
  ]);

  await seedMongoIfEmpty();
}

export async function closeMongo() {
  await client?.close();
  database = undefined;
  client = undefined;
}

export const tables = [
  'users',
  'sessions',
  'invitations',
  'mega_sources',
  'videos',
  'categories',
  'video_categories',
  'playlists',
  'playlist_items',
  'watch_progress',
  'favorites',
  'audit_logs',
  'stream_metrics',
];

export async function saveThumbnail(file: string) {
  const bytes = await readFile(file);
  if (bytes.length > 8 * 1024 * 1024) throw new Error('Thumbnail exceeds 8 MB');
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216;
  if (!png && !jpeg) throw new Error('Thumbnail must be PNG or JPEG');
  const hash = createHash('sha256').update(bytes).digest('hex');
  await collection('thumbnails').updateOne(
    { hash },
    {
      $setOnInsert: {
        hash,
        bytes: new Binary(bytes),
        content_type: png ? 'image/png' : 'image/jpeg',
        size: bytes.length,
      },
    },
    { upsert: true }
  );
  return `/media/thumbnails/${hash}`;
}

// In-memory mega_sources cache: sources are immutable once inserted, avoiding repeated DB queries
const sourceCache = new Map<string, any>();

export function invalidateStreamVideoCache(sourceId?: string) {
  if (sourceId) sourceCache.delete(sourceId);
  else sourceCache.clear();
}

export async function streamVideo(id: string) {
  const video = await collection('videos').findOne({ $or: [{ id }, { slug: id }] });
  if (!video) return null;
  let source = null;
  if (video.mega_source_id) {
    source = sourceCache.get(video.mega_source_id);
    if (!source) {
      source = await collection('mega_sources').findOne({ id: video.mega_source_id });
      if (source) sourceCache.set(video.mega_source_id, source);
    }
  }
  return { ...source, ...video };
}

export async function incrementViews(id: string) {
  await collection('videos').updateOne({ id }, { $inc: { view_count: 1 } });
}
