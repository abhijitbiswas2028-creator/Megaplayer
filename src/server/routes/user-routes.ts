import { Router, Request, Response } from 'express';
import { db } from '../db.ts';
import { requireAuth } from '../auth.ts';

export const userRouter = Router();

// GET /api/v1/history: User's watch history
userRouter.get('/history', requireAuth, (req: Request, res: Response) => {
  const userId = req.user!.id;
  const history = db.prepare(`
    SELECT 
      v.id, v.title, v.description, v.slug, v.duration_seconds, v.thumbnail_url,
      v.view_count,
      wp.position_seconds, wp.duration_seconds as tracked_duration,
      wp.completed, wp.updated_at as last_watched_at,
      CASE WHEN f.id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
    FROM watch_progress wp
    JOIN videos v ON wp.video_id = v.id
    LEFT JOIN favorites f ON v.id = f.video_id AND f.user_id = ?
    WHERE wp.user_id = ?
    ORDER BY wp.updated_at DESC
    LIMIT 100
  `).all(userId, userId) as any[];

  res.json({
    history: history.map((h) => ({
      ...h,
      completed: Boolean(h.completed),
      is_favorite: Boolean(h.is_favorite),
    })),
  });
});

// GET /api/v1/continue-watching: In-progress videos (position > 10s and not completed)
userRouter.get('/continue-watching', requireAuth, (req: Request, res: Response) => {
  const userId = req.user!.id;
  const inProgress = db.prepare(`
    SELECT 
      v.id, v.title, v.description, v.slug, v.duration_seconds, v.thumbnail_url,
      v.view_count,
      wp.position_seconds, wp.duration_seconds as tracked_duration,
      wp.completed, wp.updated_at as last_watched_at,
      CASE WHEN f.id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
    FROM watch_progress wp
    JOIN videos v ON wp.video_id = v.id
    LEFT JOIN favorites f ON v.id = f.video_id AND f.user_id = ?
    WHERE wp.user_id = ? AND wp.completed = 0 AND wp.position_seconds >= 5
    ORDER BY wp.updated_at DESC
    LIMIT 20
  `).all(userId, userId) as any[];

  res.json({
    continueWatching: inProgress.map((v) => ({
      ...v,
      completed: false,
      is_favorite: Boolean(v.is_favorite),
    })),
  });
});

// PUT /api/v1/progress/:videoId: Update playback position (debounced from player)
userRouter.put('/progress/:videoId', requireAuth, (req: Request, res: Response) => {
  const userId = req.user!.id;
  const videoId = req.params.videoId;
  const { positionSeconds, durationSeconds } = req.body || {};

  const pos = Number(positionSeconds) || 0;
  const dur = Number(durationSeconds) || 0;
  const isCompleted = dur > 0 && pos / dur >= 0.92 ? 1 : 0;
  const now = new Date().toISOString();

  const existing = db.prepare('SELECT id FROM watch_progress WHERE user_id = ? AND video_id = ?').get(userId, videoId) as any;

  if (existing) {
    db.prepare(`
      UPDATE watch_progress
      SET position_seconds = ?, duration_seconds = ?, completed = ?, updated_at = ?
      WHERE id = ?
    `).run(pos, dur, isCompleted, now, existing.id);
  } else {
    const id = `wp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    db.prepare(`
      INSERT INTO watch_progress (id, user_id, video_id, position_seconds, duration_seconds, completed, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, videoId, pos, dur, isCompleted, now);
  }

  res.json({ success: true, positionSeconds: pos, isCompleted: Boolean(isCompleted) });
});

// GET /api/v1/favorites: List user favorites
userRouter.get('/favorites', requireAuth, (req: Request, res: Response) => {
  const userId = req.user!.id;
  const favorites = db.prepare(`
    SELECT 
      v.id, v.title, v.description, v.slug, v.duration_seconds, v.thumbnail_url,
      v.view_count, f.created_at as favorited_at,
      wp.position_seconds as watch_position,
      wp.completed as is_completed,
      1 as is_favorite
    FROM favorites f
    JOIN videos v ON f.video_id = v.id
    LEFT JOIN watch_progress wp ON v.id = wp.video_id AND wp.user_id = ?
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `).all(userId, userId) as any[];

  res.json({
    favorites: favorites.map((fav) => ({
      ...fav,
      is_favorite: true,
      is_completed: Boolean(fav.is_completed),
    })),
  });
});

// POST /api/v1/favorites/:videoId: Toggle favorite
userRouter.post('/favorites/:videoId', requireAuth, (req: Request, res: Response) => {
  const userId = req.user!.id;
  const videoId = req.params.videoId;

  const existing = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND video_id = ?').get(userId, videoId) as any;

  if (existing) {
    db.prepare('DELETE FROM favorites WHERE id = ?').run(existing.id);
    res.json({ isFavorite: false, message: 'Removed from favorites' });
  } else {
    const id = `fav_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    db.prepare('INSERT INTO favorites (id, user_id, video_id, created_at) VALUES (?, ?, ?, ?)').run(
      id,
      userId,
      videoId,
      new Date().toISOString()
    );
    res.json({ isFavorite: true, message: 'Added to favorites' });
  }
});

