import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { hashPassword, generateSecureToken } from './utils/crypto.ts';

const DB_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = process.env.DATABASE_PATH || path.join(DB_DIR, 'mega_stream_x.db');
export const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign key constraints
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('OWNER', 'FRIEND')),
      status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'DISABLED')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invited_email TEXT,
      role TEXT NOT NULL DEFAULT 'FRIEND',
      max_uses INTEGER NOT NULL DEFAULT 1,
      uses_count INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mega_sources (
      id TEXT PRIMARY KEY,
      encrypted_ref TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      file_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      slug TEXT UNIQUE NOT NULL,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      thumbnail_url TEXT,
      mega_source_id TEXT REFERENCES mega_sources(id) ON DELETE SET NULL,
      local_sample_path TEXT,
      status TEXT NOT NULL CHECK(status IN ('PUBLISHED', 'UNPUBLISHED')),
      view_count INTEGER NOT NULL DEFAULT 0,
      is_featured INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      icon TEXT,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS video_categories (
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (video_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      is_private INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_items (
      id TEXT PRIMARY KEY,
      playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      added_at TEXT NOT NULL,
      UNIQUE(playlist_id, video_id)
    );

    CREATE TABLE IF NOT EXISTS watch_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      position_seconds REAL NOT NULL DEFAULT 0,
      duration_seconds REAL NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, video_id)
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, video_id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      ip_address TEXT,
      details_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stream_metrics (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL,
      user_id TEXT,
      bytes_streamed INTEGER NOT NULL DEFAULT 0,
      range_header TEXT,
      status_code INTEGER NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_video_categories_vid ON video_categories(video_id);
    CREATE INDEX IF NOT EXISTS idx_video_categories_cat ON video_categories(category_id);
    CREATE INDEX IF NOT EXISTS idx_watch_progress_user ON watch_progress(user_id);
    CREATE INDEX IF NOT EXISTS idx_watch_progress_updated ON watch_progress(updated_at);
    CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
    CREATE INDEX IF NOT EXISTS idx_stream_metrics_video ON stream_metrics(video_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
  `);

  try {
    db.prepare('ALTER TABLE videos ADD COLUMN embed_url TEXT').run();
  } catch {}

  seedInitialData();
}

function seedInitialData() {
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
  const now = new Date().toISOString();

  if (userCount === 0) {
    // 1. Seed Owner account
    const ownerAuth = hashPassword('Owner12345!');
    const ownerId = 'usr_owner_root';
    db.prepare(`
      INSERT INTO users (id, email, password_hash, salt, display_name, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ownerId,
      'owner@megastreamx.com',
      ownerAuth.hash,
      ownerAuth.salt,
      'Nexus Architect (Owner)',
      'OWNER',
      'ACTIVE',
      now,
      now
    );

    // 2. Seed Friend account
    const friendAuth = hashPassword('Friend12345!');
    const friendId = 'usr_friend_sam';
    db.prepare(`
      INSERT INTO users (id, email, password_hash, salt, display_name, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      friendId,
      'friend@megastreamx.com',
      friendAuth.hash,
      friendAuth.salt,
      'Alex Mercer (Invited Friend)',
      'FRIEND',
      'ACTIVE',
      now,
      now
    );

    // 3. Seed active invitation token
    const oneMonthAhead = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    db.prepare(`
      INSERT INTO invitations (id, token, created_by_user_id, invited_email, role, max_uses, uses_count, expires_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'inv_vip_friend_01',
      'MSX-VIP-INVITE-2026',
      ownerId,
      'friend2@megastreamx.com',
      'FRIEND',
      10,
      1,
      oneMonthAhead,
      'PENDING',
      now
    );
  }

  // Seed Categories if empty
  const categoryCount = (db.prepare('SELECT COUNT(*) as count FROM categories').get() as any).count;
  if (categoryCount === 0) {
    const cats = [
      { id: 'cat_movies', name: 'Movies', slug: 'movies', icon: 'Film', description: 'Feature films, cinema releases, and independent productions', sort_order: 1 },
      { id: 'cat_series', name: 'Series', slug: 'series', icon: 'Tv', description: 'Episodic content, seasonal shows, and miniseries', sort_order: 2 },
      { id: 'cat_docu', name: 'Documentaries', slug: 'documentaries', icon: 'Globe', description: 'Nature, science, history, and true chronicles', sort_order: 3 },
      { id: 'cat_tutorials', name: 'Tutorials & Tech', slug: 'tutorials', icon: 'BookOpen', description: 'Engineering, creative deep dives, and masterclasses', sort_order: 4 },
      { id: 'cat_animation', name: 'Anime & 3D Art', slug: 'animation', icon: 'Sparkles', description: 'CGI shorts, animated masterworks, and stylized films', sort_order: 5 },
    ];

    const insertCat = db.prepare(`
      INSERT INTO categories (id, name, slug, icon, description, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const c of cats) {
      insertCat.run(c.id, c.name, c.slug, c.icon, c.description, c.sort_order);
    }
  }
}

