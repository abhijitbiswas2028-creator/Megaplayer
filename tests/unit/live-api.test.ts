import test from 'node:test';
import assert from 'node:assert/strict';
import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectMongo, closeMongo, collection, mongo } from '../../src/server/mongo/store.ts';
import { mongoAuth, mongoAuthRouter } from '../../src/server/mongo/auth.ts';
import { mongoRouter } from '../../src/server/mongo/routes.ts';
import { mongoAdminRouter } from '../../src/server/mongo/admin.ts';
import { thumbnailRouter } from '../../src/server/mongo/thumbnails.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

test('Live Express Server: End-to-end API and RBAC integration tests on MongoDB', async () => {
  const mongod = await MongoMemoryServer.create({ binary: { version: '8.0.17', downloadDir: '/tmp/megaplayer-mongodb-binaries' } });
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DATABASE = 'test_live_api';
  await connectMongo();

  const count = await collection('videos').countDocuments();
  if (count === 0) {
    const now = new Date().toISOString();
    await collection('videos').insertOne({
      id: 'vid_live_test',
      title: 'Live Test Video',
      slug: 'live-test-video',
      duration_seconds: 600,
      status: 'PUBLISHED',
      category_ids: ['cat_movies'],
      created_at: now,
      updated_at: now,
    });
  }

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  app.use('/media/thumbnails', thumbnailRouter);
  app.use('/thumbnails', express.static(path.resolve(rootDir, 'public/thumbnails')));
  app.use(express.static(path.resolve(rootDir, 'public')));
  app.use(mongoAuth);

  app.use('/api/v1/auth', mongoAuthRouter);
  app.use('/api/v1/admin', mongoAdminRouter);
  app.use('/api/v1', mongoRouter);

  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      await mongo().command({ ping: 1 });
      res.json({
        status: 'ok',
        platform: 'MEGA STREAM X',
        database: 'mongodb',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
      });
    } catch {
      res.status(503).json({ status: 'unavailable', database: 'mongodb' });
    }
  });

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.equal(healthData.status, 'ok');
    assert.equal(healthData.database, 'mongodb');

    // 2. Unauthenticated auth check
    const meAnonRes = await fetch(`${baseUrl}/api/v1/auth/me`);
    assert.equal(meAnonRes.status, 200);
    const meAnonData = await meAnonRes.json();
    assert.equal(meAnonData.user, null);

    // 3. Quick Demo Login - Owner
    const ownerLoginRes = await fetch(`${baseUrl}/api/v1/auth/quick-demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'OWNER' }),
    });
    assert.equal(ownerLoginRes.status, 200);
    const ownerLoginData = await ownerLoginRes.json();
    const ownerToken = ownerLoginData.token;
    assert.ok(ownerToken);

    // 4. Authenticated Owner /me check
    const meOwnerRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(meOwnerRes.status, 200);
    const meOwnerData = await meOwnerRes.json();
    assert.equal(meOwnerData.user?.role, 'OWNER');

    // 5. Admin Stats & Audit Logs
    const adminStatsRes = await fetch(`${baseUrl}/api/v1/admin/stats`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(adminStatsRes.status, 200);
    const adminStatsData = await adminStatsRes.json();
    assert.equal(typeof adminStatsData.users?.total_users, 'number');

    const auditRes = await fetch(`${baseUrl}/api/v1/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(auditRes.status, 200);
    const auditData = await auditRes.json();
    assert.ok(Array.isArray(auditData.logs));

    // 6. Categories route
    const catRes = await fetch(`${baseUrl}/api/v1/videos/categories`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(catRes.status, 200);
    const catData = await catRes.json();
    assert.ok(catData.categories?.length > 0);

    const catListRes = await fetch(`${baseUrl}/api/v1/videos/categories/list`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(catListRes.status, 200);

    // 7. Video catalog
    const videosRes = await fetch(`${baseUrl}/api/v1/videos?limit=10`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(videosRes.status, 200);
    const videosData = await videosRes.json();
    assert.ok(videosData.videos?.length > 0);

    // 8. Quick Demo Login - Friend & RBAC
    const friendLoginRes = await fetch(`${baseUrl}/api/v1/auth/quick-demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'FRIEND' }),
    });
    assert.equal(friendLoginRes.status, 200);
    const friendToken = (await friendLoginRes.json()).token;
    assert.ok(friendToken);

    const friendForbiddenRes = await fetch(`${baseUrl}/api/v1/admin/stats`, {
      headers: { Authorization: `Bearer ${friendToken}` },
    });
    assert.equal(friendForbiddenRes.status, 403);

    // 9. Watch progress & continue watching
    const firstVid = videosData.videos[0];
    const progressPutRes = await fetch(`${baseUrl}/api/v1/progress/${firstVid.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${friendToken}`,
      },
      body: JSON.stringify({ positionSeconds: 50, durationSeconds: 600 }),
    });
    assert.equal(progressPutRes.status, 200);

    const continueWatchingRes = await fetch(`${baseUrl}/api/v1/continue-watching`, {
      headers: { Authorization: `Bearer ${friendToken}` },
    });
    assert.equal(continueWatchingRes.status, 200);
    const continueWatchingData = await continueWatchingRes.json();
    assert.ok(continueWatchingData.continueWatching?.some((v: any) => v.id === firstVid.id));

    // 10. Favorites toggle & retrieval
    const favToggleRes = await fetch(`${baseUrl}/api/v1/favorites/${firstVid.id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${friendToken}` },
    });
    assert.equal(favToggleRes.status, 200);
    const favToggleData = await favToggleRes.json();

    if (!favToggleData.isFavorite) {
      await fetch(`${baseUrl}/api/v1/favorites/${firstVid.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${friendToken}` },
      });
    }

    const favListRes = await fetch(`${baseUrl}/api/v1/favorites`, {
      headers: { Authorization: `Bearer ${friendToken}` },
    });
    assert.equal(favListRes.status, 200);
    const favListData = await favListRes.json();
    assert.ok(favListData.favorites?.some((v: any) => v.id === firstVid.id));
  } finally {
    server.close();
    await closeMongo();
    await mongod.stop();
  }
});
