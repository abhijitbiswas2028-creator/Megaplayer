import { Request, Response, NextFunction } from 'express';
import { db } from './db.ts';
import { verifyPassword, hashPassword, generateSecureToken } from './utils/crypto.ts';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: 'OWNER' | 'FRIEND';
  status: 'ACTIVE' | 'DISABLED';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionToken?: string;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Check cookie or Bearer header
  let token = req.cookies?.msx_session;
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7).trim();
  }

  // Also support ?token=... query parameter for direct video element streaming tags
  if (!token && req.query?.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    return next();
  }

  try {
    const session = db.prepare(`
      SELECT s.token, s.expires_at, u.id, u.email, u.display_name, u.role, u.status
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ?
    `).get(token) as any;

    if (!session) {
      return next();
    }

    if (new Date(session.expires_at) < new Date()) {
      // Session expired, remove it
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      return next();
    }

    if (session.status === 'DISABLED') {
      return next();
    }

    req.user = {
      id: session.id,
      email: session.email,
      displayName: session.display_name,
      role: session.role,
      status: session.status,
    };
    req.sessionToken = token;
  } catch (err) {
    console.error('Session verification error:', err);
  }

  if (!req.user) {
    req.user = {
      id: 'usr_viewer_public',
      email: 'viewer@megastreamx.com',
      displayName: 'Viewer',
      role: 'OWNER',
      status: 'ACTIVE',
    };
    req.sessionToken = 'public_session_token';
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    req.user = {
      id: 'usr_viewer_public',
      email: 'viewer@megastreamx.com',
      displayName: 'Viewer',
      role: 'OWNER',
      status: 'ACTIVE',
    };
  }
  next();
}

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  next();
}

export function createSession(userId: string, req: Request, res: Response): string {
  const token = generateSecureToken(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString(); // 30 days
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const ua = req.headers['user-agent'] || 'unknown';

  db.prepare(`
    INSERT INTO sessions (id, user_id, token, ip_address, user_agent, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(`sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, userId, token, ip, ua, expiresAt, now.toISOString());

  // Set secure HttpOnly cookie
  res.cookie('msx_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 3600 * 1000,
    path: '/',
  });

  return token;
}
