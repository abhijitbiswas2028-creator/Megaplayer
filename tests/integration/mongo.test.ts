import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';

test('MongoDB pure engine and full API lifecycle', { timeout: 240000 }, async () => {
  const server = await MongoMemoryServer.create({ binary: { version: '8.0.17', downloadDir: '/tmp/megaplayer-mongodb-binaries' } });
  const dir = await mkdtemp(path.join(os.tmpdir(), 'megaplayer-mongo-'));
  process.env.MONGODB_URI = server.getUri();
  process.env.MONGODB_DATABASE = 'integration';
  process.env.NODE_ENV = 'production';

  const store = await import('../../src/server/mongo/store.ts');
  const { mongoAuth, mongoAuthRouter } = await import('../../src/server/mongo/auth.ts');
  const { mongoRouter } = await import('../../src/server/mongo/routes.ts');
  const { mongoAdminRouter } = await import('../../src/server/mongo/admin.ts');
  const { thumbnailRouter } = await import('../../src/server/mongo/thumbnails.ts');

  let http: ReturnType<ReturnType<typeof express>['listen']> | undefined;
  try {
    await store.connectMongo();

    const now = new Date().toISOString();
    const file = path.join(dir, 'sample.mp4');
    await writeFile(file, Buffer.alloc(4096, 1));

    await store.collection('videos').insertOne({
      id: 'fixture',
      title: 'Literal [movie]',
      slug: 'fixture',
      status: 'PUBLISHED',
      local_sample_path: file,
      duration_seconds: 120,
      category_ids: ['cat_movies'],
      created_at: now,
      updated_at: now,
    });

    assert.equal(await store.collection('videos').countDocuments(), 1);
    assert.deepEqual((await store.collection('videos').findOne({ id: 'fixture' }))?.category_ids, ['cat_movies']);

    await store.collection('videos').updateOne({ id: 'fixture' }, { $set: { description: 'New Mongo value' } });
    assert.equal((await store.collection('videos').findOne({ id: 'fixture' }))?.description, 'New Mongo value');

    const png = path.join(dir, 'thumb.png');
    await writeFile(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
    const thumbnail = await store.saveThumbnail(png);
    assert.equal(await store.saveThumbnail(png), thumbnail);
    assert.equal(await store.collection('thumbnails').countDocuments(), 1);

    const app = express();
    app.use(express.json(), cookieParser(), mongoAuth);
    app.use('/media/thumbnails', thumbnailRouter);
    app.use('/api/v1/auth', mongoAuthRouter);
    app.use('/api/v1/admin', mongoAdminRouter);
    app.use('/api/v1', mongoRouter);
    app.use((e: any, _q: any, r: any, _n: any) => r.status(e.code === 11000 ? 409 : e.status || 500).json({ error: 'Request failed' }));

    http = app.listen(0, '127.0.0.1');
    await new Promise<void>((r) => http!.on('listening', r));
    const base = `http://127.0.0.1:${(http.address() as any).port}`;

    const request = async (p: string, token?: string, data?: unknown, method?: string) =>
      fetch(base + '/api/v1' + p, {
        method: method || (data === undefined ? 'GET' : 'POST'),
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: data === undefined ? undefined : JSON.stringify(data),
      });

    assert.equal((await request('/videos')).status, 401);
    const login = await request('/auth/login', undefined, { email: 'owner@megastreamx.com', password: 'Owner12345!' });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie')!, /Secure/);
    const owner = (await login.json()).token;

    const friend = (await (await request('/auth/login', undefined, { email: 'friend@megastreamx.com', password: 'Friend12345!' })).json()).token;
    const videos = (await (await request('/videos?search=%5Bmovie%5D&category=movies', owner)).json()).videos;
    assert.equal(videos.length, 1);
    assert.equal(videos[0].categories[0].id, 'cat_movies');
    assert.equal(videos[0].local_sample_path, undefined);
    assert.equal((await (await request('/videos?category=missing', owner)).json()).videos.length, 0);

    const thumb = await fetch(base + thumbnail);
    assert.equal(thumb.status, 200);
    assert.equal(thumb.headers.get('content-type'), 'image/png');
    assert.match(thumb.headers.get('cache-control')!, /immutable/);
    assert.equal((await fetch(base + thumbnail, { cache: 'force-cache', headers: { 'If-None-Match': thumb.headers.get('etag')! } })).status, 304);

    const headStream = await fetch(base + '/api/v1/videos/fixture/stream', { method: 'HEAD', headers: { Authorization: 'Bearer ' + owner } });
    assert.equal(headStream.status, 200);

    const stream = await fetch(base + '/api/v1/videos/fixture/stream', { headers: { Authorization: 'Bearer ' + owner, Range: 'bytes=0-1023' } });
    assert.equal(stream.status, 206);
    assert.equal((await stream.arrayBuffer()).byteLength, 1024);

    assert.equal((await request('/favorites/fixture', friend, {})).status, 200);
    assert.equal((await (await request('/favorites', friend)).json()).favorites.length, 1);
    assert.equal((await (await request('/favorites', owner)).json()).favorites.length, 0);

    assert.equal((await request('/progress/fixture', friend, { positionSeconds: 30, durationSeconds: 120 }, 'PUT')).status, 200);
    assert.equal((await (await request('/continue-watching', friend)).json()).continueWatching.length, 1);

    assert.equal((await request('/admin/stats', friend)).status, 403);
    assert.equal((await (await request('/admin/stats', owner)).json()).videos.total_videos, 1);

    const created = await request('/videos', owner, { title: 'Draft', status: 'UNPUBLISHED', categoryIds: ['cat_movies'] });
    assert.equal(created.status, 201);
    const id = (await created.json()).videoId;

    assert.equal((await request('/videos/' + id, friend)).status, 404);
    assert.equal((await request('/videos/' + id, owner, { title: 'Edited' }, 'PATCH')).status, 200);
    assert.equal((await request('/videos/' + id, owner, undefined, 'DELETE')).status, 200);

    const invitation = (await (await request('/admin/invitations', owner, { maxUses: 1 })).json()).invitation;
    const accepts = await Promise.all(
      ['one', 'two'].map((n) =>
        request('/auth/accept-invite', undefined, { token: invitation.token, email: n + '@example.test', displayName: n, password: 'Testing123!' })
      )
    );
    assert.equal(accepts.filter((r) => r.status === 201).length, 1);
    assert.equal((await store.collection('invitations').findOne({ token: invitation.token }))?.uses_count, 1);

    await request('/auth/logout', owner, {});
    assert.equal((await request('/videos', owner)).status, 401);
    console.log('Verified: pure MongoDB store, indexed catalog, permissions, thumbnail caching, range playback, favorites, progress, admin CRUD, invitation concurrency, logout');
  } finally {
    if (http) await new Promise<void>((r) => http!.close(() => r()));
    await store.closeMongo();
    await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
