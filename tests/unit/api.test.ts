import test from 'node:test';
import assert from 'node:assert/strict';
import { db, initDatabase } from '../../src/server/db.ts';
import { hashPassword, verifyPassword } from '../../src/server/utils/crypto.ts';

test('Database & Auth: Initial seed contains Owner and Friend', () => {
  initDatabase();
  const owner = db.prepare("SELECT email, role, status FROM users WHERE role = 'OWNER'").get() as any;
  assert.ok(owner);
  assert.equal(owner.email, 'owner@megastreamx.com');
  assert.equal(owner.role, 'OWNER');
  assert.equal(owner.status, 'ACTIVE');

  const friend = db.prepare("SELECT email, role, status FROM users WHERE role = 'FRIEND'").get() as any;
  assert.ok(friend);
  assert.equal(friend.role, 'FRIEND');
});

test('Database & Catalog: Seeded videos exist with categories', () => {
  const videos = db.prepare('SELECT id, title, duration_seconds FROM videos').all() as any[];
  assert.ok(videos.length >= 5, 'Should have at least 5 seeded videos');

  const categories = db.prepare('SELECT id, name, slug FROM categories').all() as any[];
  assert.ok(categories.length >= 4, 'Should have categories');
});

test('Database & Watch Progress: Update and retrieve progress', () => {
  const testUserId = 'usr_friend_sam';
  const testVideoId = 'vid_deep_space_odyssey';
  const now = new Date().toISOString();

  // Insert or update progress
  db.prepare(`
    INSERT INTO watch_progress (id, user_id, video_id, position_seconds, duration_seconds, completed, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT(user_id, video_id) DO UPDATE SET position_seconds = 180, updated_at = ?
  `).run('wp_test_unit', testUserId, testVideoId, 120, 596, now, now);

  const row = db.prepare('SELECT position_seconds FROM watch_progress WHERE user_id = ? AND video_id = ?')
    .get(testUserId, testVideoId) as any;
  
  assert.ok(row);
  assert.ok(row.position_seconds >= 120);
});

test('Database & Invitations: Seeded VIP token is valid and pending', () => {
  const invite = db.prepare("SELECT token, status, max_uses, uses_count FROM invitations WHERE token = 'MSX-VIP-INVITE-2026'").get() as any;
  assert.ok(invite);
  assert.equal(invite.status, 'PENDING');
  assert.ok(invite.uses_count < invite.max_uses);
});
