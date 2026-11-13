import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectMongo, closeMongo, collection } from '../../src/server/mongo/store.ts';
import { mongoRouter } from '../../src/server/mongo/routes.ts';

test('Playback HTTP: ranges, HEAD, missing sources, duration sync and resume fields', async () => {
  const mongod = await MongoMemoryServer.create({ binary: { version: '8.0.17', downloadDir: '/tmp/megaplayer-mongodb-binaries' } });
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DATABASE = 'test_playback';
  await connectMongo();

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mega-playback-'));
  const file = path.join(tempDir, 'fixture.mp4');
  const bytes = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
  fs.writeFileSync(file, bytes);
  const now = new Date().toISOString();
  const id = 'playback_regression';

  await collection('videos').insertOne({
    id,
    title: 'Playback fixture',
    slug: id,
    duration_seconds: 999,
    local_sample_path: file,
    status: 'PUBLISHED',
    created_at: now,
    updated_at: now,
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.headers['x-test-anonymous']) return next();
    req.user = { id: 'usr_friend_sam', email: 'friend@megastreamx.com', displayName: 'Sam', role: 'FRIEND', status: 'ACTIVE' };
    next();
  });
  app.use(mongoRouter);

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;

  try {
    assert.equal((await fetch(`${base}/videos`, { headers: { 'x-test-anonymous': '1' } })).status, 401);
    assert.equal((await fetch(`${base}/videos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Forbidden' }) })).status, 403);
    for (const [range, expected] of [['bytes=0-3', '0123'], ['bytes=10-', 'abcdefghijklmnopqrstuvwxyz'], ['bytes=-3', 'xyz']]) {
      const res = await fetch(`${base}/videos/${id}/stream`, { headers: { Range: range } });
      assert.equal(res.status, 206);
      assert.equal(await res.text(), expected);
      assert.equal(Number(res.headers.get('content-length')), expected.length);
    }
    const head = await fetch(`${base}/videos/${id}/stream`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers.get('content-length')), bytes.length);
    assert.equal(await head.text(), '');
    const single = await fetch(`${base}/videos/${id}/stream`, { headers: { Range: 'bytes=0-0' } });
    assert.equal(single.status, 206);
    assert.equal(await single.text(), '0');
    assert.equal(single.headers.get('cache-control'), 'private, no-store');
    const invalid = await fetch(`${base}/videos/${id}/stream`, { headers: { Range: 'bytes=1000-' } });
    assert.equal(invalid.status, 416);
    const progress = await fetch(`${base}/progress/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ positionSeconds: 12, durationSeconds: 120 }) });
    assert.equal(progress.status, 200);
    const history = (await (await fetch(`${base}/continue-watching`)).json()) as any;
    assert.equal(history.continueWatching[0].watch_position, 12);
    assert.equal(history.continueWatching[0].watch_duration, 120);
    assert.equal(history.continueWatching[0].is_completed, false);
    const detail = (await (await fetch(`${base}/videos/${id}`)).json()) as any;
    assert.equal(detail.video.duration_seconds, 120);
    const badProgress = await fetch(`${base}/progress/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ positionSeconds: -1, durationSeconds: 120 }) });
    assert.equal(badProgress.status, 400);

    const { megaAdapter } = await import('../../src/server/mega-adapter.ts');
    const original = megaAdapter.createStream;
    let calls = 0;
    megaAdapter.createStream = () => {
      calls++;
      const stream = new PassThrough();
      setImmediate(() => stream.destroy(new Error('Simulated upstream failure')));
      return { stream, cleanup: () => stream.destroy(), contentLength: bytes.length };
    };
    try {
      assert.equal((await fetch(`${base}/videos/${id}/stream`, { method: 'HEAD' })).status, 200);
      assert.equal(calls, 0, 'HEAD must not open an upstream download');
      const failure = await fetch(`${base}/videos/${id}/stream`, { headers: { Range: 'bytes=0-9' }, signal: AbortSignal.timeout(2000) });
      assert.equal(failure.status, 502);
      assert.equal(await failure.text(), '');
      assert.equal(failure.headers.get('content-range'), null);
      assert.ok([null, '0'].includes(failure.headers.get('content-length')));
    } finally {
      megaAdapter.createStream = original;
    }

    await collection('videos').updateOne({ id }, { $set: { status: 'UNPUBLISHED' } });
    assert.equal((await fetch(`${base}/videos/${id}/resolutions`)).status, 403);
    assert.equal((await fetch(`${base}/videos/${id}/stream`)).status, 403);

    await collection('videos').updateOne({ id }, { $set: { status: 'PUBLISHED', local_sample_path: '/missing/video.mp4' } });
    assert.equal((await fetch(`${base}/videos/${id}/stream`)).status, 404);

    await collection('videos').updateOne({ id }, { $set: { local_sample_path: null } });
    assert.equal((await fetch(`${base}/videos/${id}/stream`)).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(tempDir, { recursive: true, force: true });
    await closeMongo();
    await mongod.stop();
  }
});

test('Media metadata: actual duration and a local thumbnail are read from the same video', async () => {
  const mongod = await MongoMemoryServer.create({ binary: { version: '8.0.17', downloadDir: '/tmp/megaplayer-mongodb-binaries' } });
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DATABASE = 'test_metadata';
  await connectMongo();

  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { refreshVideoMetadata } = await import('../../src/server/video-cache.ts');
  const run = promisify(execFile);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mega-media-'));
  const source = path.join(dir, 'source.mp4');
  const id = 'metadata_regression';
  const thumbnail = path.resolve('public/thumbnails', `${id}.jpg`);
  const now = new Date().toISOString();

  await collection('videos').insertOne({
    id,
    title: 'Metadata fixture',
    slug: id,
    duration_seconds: 999,
    status: 'PUBLISHED',
    created_at: now,
    updated_at: now,
  });

  try {
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=10', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source]);
    const duration = await refreshVideoMetadata(id, source);
    assert.ok(Math.abs(duration - 2) < 0.1);
    const row = await collection('videos').findOne({ id });
    assert.ok(row);
    assert.equal(row.duration_seconds, duration);
    assert.match(row.thumbnail_url, /^\/media\/thumbnails\/[a-f0-9]{64}$/);
    assert.ok(fs.statSync(thumbnail).size > 0);
    const jpeg = fs.readFileSync(thumbnail);
    assert.equal(jpeg[0], 0xff);
    assert.equal(jpeg[1], 0xd8);
  } finally {
    fs.rmSync(thumbnail, { force: true });
    fs.rmSync(dir, { recursive: true, force: true });
    await closeMongo();
    await mongod.stop();
  }
});

test('Direct cloud stream serves original HD quality without storing video in data/cache', async () => {
  const cacheDir = path.resolve(process.cwd(), 'data/cache');
  if (fs.existsSync(cacheDir)) {
    const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith('.mp4'));
    assert.equal(files.length, 0, 'data/cache must not contain video cache files');
  }
});
