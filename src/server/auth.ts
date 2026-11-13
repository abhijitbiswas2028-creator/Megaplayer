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

interface CachedSession {
  user: AuthUser;
  expiresAt: number;
  cachedUntil: number;
}

const sessionCache = new Map<string, CachedSession>();

export function invalidateSessionCache(token?: string) {
  if (token) {
    sessionCache.delete(token);
  } else {
    sessionCache.clear();
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionToken?: string;
    }
  }
}

let _sessionStmt: ReturnType<typeof db.prepare> | null = null;
function getSessionStmt() {
  if (!_sessionStmt) {
    _sessionStmt = db.prepare(`
      SELECT s.token, s.expires_at, u.id, u.email, u.display_name, u.role, u.status
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ?
    `);
  }
  return _sessionStmt;
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

  const now = Date.now();
  const cached = sessionCache.get(token);
  if (cached && now < cached.cachedUntil) {
    if (now >= cached.expiresAt) {
      sessionCache.delete(token);
      try {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      } catch {}
      return next();
    }
    req.user = cached.user;
    req.sessionToken = token;
    return next();
  }

  try {
    const session = getSessionStmt().get(token) as any;

    if (!session) {
      sessionCache.delete(token);
      return next();
    }

    const expTime = new Date(session.expires_at).getTime();
    if (expTime < now) {
      // Session expired, remove it
      sessionCache.delete(token);
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      return next();
    }

    if (session.status === 'DISABLED') {
      sessionCache.delete(token);
      return next();
    }

    const authUser: AuthUser = {
      id: session.id,
      email: session.email,
      displayName: session.display_name,
      role: session.role,
      status: session.status,
    };
    req.user = authUser;
    req.sessionToken = token;

    // Cache valid session for 30 seconds
    sessionCache.set(token, {
      user: authUser,
      expiresAt: expTime,
      cachedUntil: now + 30_000,
    });
  } catch (err) {
    console.error('Session verification error:', err);
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  next();
}

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  if (req.user.role !== 'OWNER') {
    res.status(403).json({ error: 'Owner access required.' });
    return;
  }
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
