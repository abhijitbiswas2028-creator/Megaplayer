import test from 'node:test';
import assert from 'node:assert/strict';
import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, initDatabase } from '../../src/server/db.ts';
import { authMiddleware } from '../../src/server/auth.ts';
import { authRouter } from '../../src/server/routes/auth-routes.ts';
import { videoRouter } from '../../src/server/routes/video-routes.ts';
import { userRouter } from '../../src/server/routes/user-routes.ts';
import { adminRouter } from '../../src/server/routes/admin-routes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

test('Live Express Server: End-to-end API and RBAC integration tests', async (t) => {
  const app = express();
  initDatabase();

  const count = (db.prepare('SELECT COUNT(*) as count FROM videos').get() as any).count;
  if (count === 0) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO videos (id, title, slug, duration_seconds, status, created_at, updated_at)
      VALUES ('vid_live_test', 'Live Test Video', 'live-test-video', 600, 'PUBLISHED', ?, ?)
    `).run(now, now);
    db.prepare("INSERT INTO video_categories (video_id, category_id) VALUES ('vid_live_test', 'cat_movies')").run();
  }

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  app.use('/thumbnails', express.static(path.resolve(rootDir, 'public/thumbnails')));
  app.use(express.static(path.resolve(rootDir, 'public')));
  app.use(authMiddleware);

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/videos', videoRouter);
  app.use('/api/v1', userRouter);
  app.use('/api/v1/admin', adminRouter);

  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      platform: 'MEGA STREAM X',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
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
  }
});
