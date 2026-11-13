import { Request, Response, NextFunction } from 'express';
export { mongoAuth as authMiddleware, session as createSession } from './mongo/auth.ts';

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
