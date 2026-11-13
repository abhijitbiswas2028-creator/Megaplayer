import { Router, Request, Response } from 'express';
import { db } from '../db.ts';
import { requireAuth } from '../auth.ts';
import { formatThumbnailUrl } from './video-routes.ts';

export const userRouter = Router();

// GET /api/v1/history: User's watch history
userRouter.get('/history', requireAuth, (req: Request, res: Response) => {
  const userId = req.user!.id;
  const history = db.prepare(`
    SELECT 
      v.id, v.title, v.description, v.slug, v.duration_seconds, v.thumbnail_url,
      v.view_count,
      wp.position_seconds as watch_position, wp.duration_seconds as watch_duration,
      wp.completed as is_completed, wp.updated_at as last_watched_at,
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
      thumbnail_url: formatThumbnailUrl(h.thumbnail_url, h.last_watched_at),
      is_completed: Boolean(h.is_completed),
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
      wp.position_seconds as watch_position, wp.duration_seconds as watch_duration,
      wp.completed as is_completed, wp.updated_at as last_watched_at,
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
      thumbnail_url: formatThumbnailUrl(v.thumbnail_url, v.last_watched_at),
      is_completed: false,
      is_favorite: Boolean(v.is_favorite),
    })),
  });
});

// PUT or POST /api/v1/progress/:videoId: Update playback position (debounced from player)
const handleProgressUpdate = (req: Request, res: Response) => {
  const userId = req.user!.id;
  const videoId = req.params.videoId;
  const { positionSeconds, durationSeconds } = req.body || {};

  const requestedPosition = Number(positionSeconds);
  const dur = Number(durationSeconds);
  if (!Number.isFinite(requestedPosition) || requestedPosition < 0 || !Number.isFinite(dur) || dur <= 0) {
    res.status(400).json({ error: 'Progress requires a finite position and positive duration.' });
    return;
  }
  const video = db.prepare('SELECT status FROM videos WHERE id = ?').get(videoId) as any;
  if (!video || (video.status !== 'PUBLISHED' && req.user!.role !== 'OWNER')) {
    res.status(404).json({ error: 'Video not found.' });
    return;
  }
  const pos = Math.min(requestedPosition, dur);
  const isCompleted = dur > 0 && pos / dur >= 0.92 ? 1 : 0;
  const now = new Date().toISOString();
  db.prepare('UPDATE videos SET duration_seconds = ? WHERE id = ?').run(dur, videoId);

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
};
userRouter.put('/progress/:videoId', requireAuth, handleProgressUpdate);
userRouter.post('/progress/:videoId', requireAuth, handleProgressUpdate);

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
      thumbnail_url: formatThumbnailUrl(fav.thumbnail_url, fav.favorited_at),
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

