import { Router, Request, Response } from 'express';
import { db } from '../db.ts';
import { requireOwner } from '../auth.ts';
import { generateSecureToken } from '../utils/crypto.ts';

export const adminRouter = Router();

// Apply requireOwner to all admin endpoints
adminRouter.use(requireOwner);

// GET /api/v1/admin/stats: Real platform streaming metrics
adminRouter.get('/stats', (req: Request, res: Response) => {
  const videoStats = db.prepare(`
    SELECT 
      COUNT(*) as total_videos,
      SUM(CASE WHEN status = 'PUBLISHED' THEN 1 ELSE 0 END) as published_videos,
      SUM(view_count) as total_views,
      SUM(CASE WHEN mega_source_id IS NOT NULL THEN 1 ELSE 0 END) as mega_sources_count
    FROM videos
  `).get() as any;

  const userStats = db.prepare(`
    SELECT 
      COUNT(*) as total_users,
      SUM(CASE WHEN role = 'FRIEND' THEN 1 ELSE 0 END) as friend_users,
      SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_users
    FROM users
  `).get() as any;

  const storageStats = db.prepare(`
    SELECT 
      COUNT(*) as source_count,
      COALESCE(SUM(file_size), 0) as total_bytes
    FROM mega_sources
  `).get() as any;

  const streamMetrics = db.prepare(`
    SELECT 
      COUNT(*) as total_stream_requests,
      COALESCE(SUM(bytes_streamed), 0) as total_bytes_served
    FROM stream_metrics
  `).get() as any;

  const activeSessionsCount = (db.prepare('SELECT COUNT(*) as count FROM sessions WHERE expires_at > ?').get(new Date().toISOString()) as any).count;

  res.json({
    videos: videoStats,
    users: userStats,
    storage: storageStats,
    streaming: {
      ...streamMetrics,
      activeSessions: activeSessionsCount,
    },
  });
});

// GET /api/v1/admin/users: List friends and users
adminRouter.get('/users', (req: Request, res: Response) => {
  const users = db.prepare(`
    SELECT 
      u.id, u.email, u.display_name, u.role, u.status, u.created_at,
      COUNT(DISTINCT s.id) as active_sessions,
      COUNT(DISTINCT wp.id) as watched_videos_count
    FROM users u
    LEFT JOIN sessions s ON u.id = s.user_id AND s.expires_at > ?
    LEFT JOIN watch_progress wp ON u.id = wp.user_id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all(new Date().toISOString());

  res.json({ users });
});

// PATCH /api/v1/admin/users/:id/status: Toggle active/disabled
adminRouter.patch('/users/:id/status', (req: Request, res: Response) => {
  const { status } = req.body || {};
  const targetUserId = req.params.id;

  if (targetUserId === req.user!.id) {
    res.status(400).json({ error: 'Cannot deactivate the primary Owner account' });
    return;
  }

  if (status !== 'ACTIVE' && status !== 'DISABLED') {
    res.status(400).json({ error: "Status must be 'ACTIVE' or 'DISABLED'" });
    return;
  }

  db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(
    status,
    new Date().toISOString(),
    targetUserId
  );

  // If disabled, revoke active sessions immediately
  if (status === 'DISABLED') {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetUserId);
  }

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, target_type, target_id, ip_address, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    req.user!.id,
    'USER_STATUS_UPDATED',
    'USER',
    targetUserId,
    req.ip || 'unknown',
    JSON.stringify({ newStatus: status }),
    new Date().toISOString()
  );

  res.json({ success: true, status, message: `User status changed to ${status}` });
});

// GET /api/v1/admin/invitations: List invitation tokens
adminRouter.get('/invitations', (req: Request, res: Response) => {
  const invitations = db.prepare(`
    SELECT 
      i.id, i.token, i.invited_email, i.role, i.max_uses, i.uses_count,
      i.expires_at, i.status, i.created_at,
      u.display_name as created_by_name
    FROM invitations i
    JOIN users u ON i.created_by_user_id = u.id
    ORDER BY i.created_at DESC
  `).all();

  res.json({ invitations });
});

// POST /api/v1/admin/invitations: Create new invite code
adminRouter.post('/invitations', (req: Request, res: Response) => {
  const { invitedEmail, role = 'FRIEND', maxUses = 1, validDays = 14 } = req.body || {};

  const tokenPrefix = 'MSX-VIP-';
  const randomSuffix = generateSecureToken(4).toUpperCase();
  const token = `${tokenPrefix}${randomSuffix}`;

  const days = Math.max(1, Math.min(365, Number(validDays) || 14));
  const expiresAt = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
  const id = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO invitations (id, token, created_by_user_id, invited_email, role, max_uses, uses_count, expires_at, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'PENDING', ?)
  `).run(
    id,
    token,
    req.user!.id,
    invitedEmail ? String(invitedEmail).trim() : null,
    role === 'OWNER' ? 'OWNER' : 'FRIEND',
    Math.max(1, Number(maxUses) || 1),
    expiresAt,
    now
  );

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, target_type, target_id, ip_address, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    req.user!.id,
    'INVITATION_CREATED',
    'INVITATION',
    id,
    req.ip || 'unknown',
    JSON.stringify({ token, role, maxUses, expiresAt }),
    now
  );

  res.status(201).json({
    success: true,
    invitation: {
      id,
      token,
      invitedEmail,
      role,
      maxUses,
      expiresAt,
      status: 'PENDING',
    },
    message: 'Invitation code created successfully',
  });
});

// DELETE /api/v1/admin/invitations/:id: Revoke invite
adminRouter.delete('/invitations/:id', (req: Request, res: Response) => {
  const inviteId = req.params.id;
  db.prepare("UPDATE invitations SET status = 'REVOKED' WHERE id = ?").run(inviteId);
  res.json({ success: true, message: 'Invitation revoked' });
});

// GET /api/v1/admin/audit-logs: Audit logs
adminRouter.get('/audit-logs', (req: Request, res: Response) => {
  const logs = db.prepare(`
    SELECT a.id, a.user_id, a.action, a.target_type, a.target_id, a.ip_address, a.details_json, a.created_at,
           u.display_name, u.email
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.created_at DESC
    LIMIT 100
  `).all();

  res.json({ logs });
});
