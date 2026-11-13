import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectMongo, closeMongo, collection } from '../../src/server/mongo/store.ts';

test('Database & Auth: Initial seed contains Owner and Friend in MongoDB', async () => {
  const mongod = await MongoMemoryServer.create({ binary: { version: '8.0.17', downloadDir: '/tmp/megaplayer-mongodb-binaries' } });
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DATABASE = 'test_api';
  try {
    await connectMongo();
    const owner = await collection('users').findOne({ role: 'OWNER' });
    assert.ok(owner);
    assert.equal(owner.email, 'owner@megastreamx.com');
    assert.equal(owner.role, 'OWNER');
    assert.equal(owner.status, 'ACTIVE');

    const friend = await collection('users').findOne({ role: 'FRIEND' });
    assert.ok(friend);
    assert.equal(friend.role, 'FRIEND');

    // Database & Catalog: Seeded categories exist
    const categories = await collection('categories').find().toArray();
    assert.ok(categories.length >= 4, 'Should have categories');

    // Insert video with category_ids
    const now = new Date().toISOString();
    await collection('videos').insertOne({
      id: 'test_catalog_video',
      title: 'Test video',
      slug: 'test-catalog-video',
      duration_seconds: 596,
      status: 'PUBLISHED',
      category_ids: ['cat_movies'],
      created_at: now,
      updated_at: now,
    });
    const video = await collection('videos').findOne({ id: 'test_catalog_video' });
    assert.ok(video);
    assert.equal(video.title, 'Test video');

    // Database & Watch Progress: Update and retrieve progress
    const testUserId = 'usr_friend_sam';
    await collection('watch_progress').updateOne(
      { user_id: testUserId, video_id: 'test_catalog_video' },
      { $set: { position_seconds: 120, duration_seconds: 596, completed: 0, updated_at: now }, $setOnInsert: { id: 'wp_test_unit' } },
      { upsert: true }
    );
    const row = await collection('watch_progress').findOne({ user_id: testUserId, video_id: 'test_catalog_video' });
    assert.ok(row);
    assert.ok(row.position_seconds >= 120);

    // Database & Invitations: Seeded VIP token is valid and pending
    const invite = await collection('invitations').findOne({ token: 'MSX-VIP-INVITE-2026' });
    assert.ok(invite);
    assert.equal(invite.status, 'PENDING');
    assert.ok(invite.uses_count < invite.max_uses);
  } finally {
    await closeMongo();
    await mongod.stop();
  }
});
